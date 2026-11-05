// As variáveis de ambiente precisam estar carregadas antes de
// qualquer acesso ao banco (o .env não substitui as do Render).
require('dotenv').config({ quiet: true });

const { AsyncLocalStorage } = require('node:async_hooks');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const { SCHEMA } = require('./schema');

// ============================================================
// BANCO DE DADOS (TURSO / libSQL)
// ============================================================
//
// Não existe banco local de reserva: sem TURSO_DATABASE_URL o
// servidor não inicia. Para testes, use uma URL file: apontando
// para um banco descartável.

const url = (process.env.TURSO_DATABASE_URL || '').trim();
const authToken = (process.env.TURSO_AUTH_TOKEN || '').trim();

if (!url) {
    throw new Error(
        'TURSO_DATABASE_URL não configurada. ' +
        'Defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no ambiente.'
    );
}

if (!url.startsWith('file:') && !authToken) {
    throw new Error('TURSO_AUTH_TOKEN não configurado.');
}

const client = createClient(
    url.startsWith('file:') ? { url } : { url, authToken }
);

// ============================================================
// API NO FORMATO prepare().get/all/run — AGORA ASSÍNCRONA
// ============================================================
//
// Mantém o formato que o restante do código já usava com o
// node:sqlite, mas toda chamada devolve uma Promise e precisa de
// await. Linhas voltam como objetos simples e run() devolve
// { changes, lastInsertRowid } com números, como antes.

// Transação ativa no fluxo assíncrono atual (ver transaction()).
const txStorage = new AsyncLocalStorage();

const executor = () => txStorage.getStore() || client;

// Esquecer um await deixaria passar uma Promise como se fosse a
// linha do banco. Qualquer acesso a propriedade gera erro imediato.
const PROMISE_KEYS = new Set(['then', 'catch', 'finally']);

function mustAwait(promise) {
    return new Proxy(promise, {
        get(target, key) {
            if (typeof key === 'symbol' || PROMISE_KEYS.has(key)) {
                const value = Reflect.get(target, key, target);

                return typeof value === 'function'
                    ? value.bind(target)
                    : value;
            }

            throw new Error(
                `Consulta ao banco usada sem await (propriedade "${key}").`
            );
        }
    });
}

// Com nomes de coluna repetidos, vale o último (como no node:sqlite).
function toRow(columns, values) {
    const row = {};

    columns.forEach((column, index) => {
        row[column] = values[index];
    });

    return row;
}

function statement(sql, args) {
    args.forEach((value, index) => {
        // Mesmo comportamento do node:sqlite: undefined é erro.
        if (value === undefined) {
            throw new TypeError(
                `Provided value cannot be bound to SQLite parameter ${index + 1}.`
            );
        }
    });

    return { sql, args };
}

async function execute(sql, args) {
    return executor().execute(statement(sql, args));
}

function prepare(sql) {
    return {
        get: (...args) => mustAwait(
            execute(sql, args).then(result =>
                result.rows.length
                    ? toRow(result.columns, result.rows[0])
                    : undefined
            )
        ),

        all: (...args) => mustAwait(
            execute(sql, args).then(result =>
                result.rows.map(values =>
                    toRow(result.columns, values)
                )
            )
        ),

        run: (...args) => mustAwait(
            execute(sql, args).then(result => ({
                changes: result.rowsAffected,
                lastInsertRowid:
                    result.lastInsertRowid === undefined
                        ? 0
                        : Number(result.lastInsertRowid)
            }))
        )
    };
}

// Vários comandos SQL sem parâmetros.
function exec(sql) {
    return mustAwait(executor().executeMultiple(sql));
}

// Vários comandos parametrizados em uma única ida ao servidor.
// Fora de transação, o lote é atômico (tudo ou nada).
// Cada item: { sql, args } ou apenas a string SQL.
function batch(items) {
    const statements = items.map(item =>
        typeof item === 'string'
            ? item
            : statement(item.sql, item.args || [])
    );

    const tx = txStorage.getStore();

    return mustAwait(
        tx
            ? tx.batch(statements)
            : client.batch(statements, 'write')
    );
}

// ============================================================
// TRANSAÇÕES
// ============================================================
//
// db.transaction(async () => { ... }) executa o callback dentro de
// uma transação interativa do libSQL. Todo db.prepare() chamado
// dentro dele (inclusive em funções auxiliares) usa a mesma
// transação. Erro no callback = ROLLBACK; sucesso = COMMIT.
//
// As transações deste processo são enfileiradas, uma de cada vez,
// como acontecia com o banco síncrono.

let txQueue = Promise.resolve();

async function runTransaction(callback) {
    const tx = await client.transaction('write');

    try {
        const result = await txStorage.run(tx, callback);

        await tx.commit();

        return result;
    } catch (error) {
        if (!tx.closed) {
            try {
                await tx.rollback();
            } catch (rollbackError) {
                console.error(
                    '[DB] Erro no rollback:',
                    rollbackError.message
                );
            }
        }

        throw error;
    } finally {
        tx.close();
    }
}

function transaction(callback) {
    // Já dentro de uma transação: participa dela.
    if (txStorage.getStore()) {
        return Promise.resolve().then(callback);
    }

    const run = txQueue.then(() => runTransaction(callback));

    txQueue = run.catch(() => {});

    return run;
}

// ============================================================
// VALIDAÇÃO DO ESQUEMA
// ============================================================
//
// O banco nunca é alterado na inicialização. O esquema real é
// comparado com schema.js; qualquer diferença impede o início.

const normalizeSql = sql =>
    String(sql || '').replace(/\s+/g, ' ').trim();

async function readSchema() {
    const result = await client.execute(`
        SELECT type, name, tbl_name, sql
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
          AND sql IS NOT NULL
        ORDER BY type, name
    `);

    return result.rows.map(values =>
        toRow(result.columns, values)
    );
}

async function validateSchema() {
    const actual = await readSchema();
    const actualByName = new Map(
        actual.map(item => [item.name, item])
    );

    const problems = [];

    if (!actual.length) {
        problems.push(
            'O banco está vazio. Crie o esquema com: npm run db:provision'
        );

        return problems;
    }

    for (const expected of SCHEMA) {
        const found = actualByName.get(expected.name);

        if (!found) {
            problems.push(`Ausente: ${expected.type} ${expected.name}`);
        } else if (found.type !== expected.type) {
            problems.push(
                `Tipo diferente: ${expected.name} ` +
                `(esperado ${expected.type}, encontrado ${found.type})`
            );
        } else if (normalizeSql(found.sql) !== normalizeSql(expected.sql)) {
            problems.push(
                `Definição diferente: ${expected.type} ${expected.name}`
            );
        }

        actualByName.delete(expected.name);
    }

    for (const extra of actualByName.values()) {
        problems.push(`Inesperado: ${extra.type} ${extra.name}`);
    }

    // As exclusões em cascata (ON DELETE CASCADE / SET NULL)
    // dependem das chaves estrangeiras ativas.
    const foreignKeys = await client.execute('PRAGMA foreign_keys');

    if (Number(foreignKeys.rows[0]?.[0]) !== 1) {
        problems.push('As chaves estrangeiras estão desativadas no banco.');
    }

    return problems;
}

// Cria o esquema em um banco VAZIO, em um único lote atômico.
// Usado somente pelo comando npm run db:provision.
async function provisionSchema() {
    const existing = await readSchema();

    if (existing.length) {
        throw new Error(
            'O banco já possui tabelas ou índices. ' +
            'O esquema só é criado em um banco vazio.'
        );
    }

    await client.batch(
        SCHEMA.map(item => item.sql),
        'write'
    );

    return validateSchema();
}

// ============================================================
// DADOS INICIAIS
// ============================================================

// Garante que registros antigos não fiquem com valores NULL.
const NULL_DEFAULTS = [
    "UPDATE users SET hearts = 5 WHERE hearts IS NULL",
    "UPDATE users SET hearts_at = 0 WHERE hearts_at IS NULL",
    "UPDATE users SET streak = 0 WHERE streak IS NULL",
    "UPDATE users SET best_streak = 0 WHERE best_streak IS NULL",
    "UPDATE users SET coins = 0 WHERE coins IS NULL",
    "UPDATE tracks SET presentation = '[]' WHERE presentation IS NULL",
    "UPDATE tracks SET color = '#58cc02' WHERE color IS NULL",
    "UPDATE tracks SET conclusion = '[]' WHERE conclusion IS NULL",
    "UPDATE tracks SET evaluation_question = '' WHERE evaluation_question IS NULL",
    "UPDATE lessons SET intro = '' WHERE intro IS NULL",
    "UPDATE lessons SET presentation = '[]' WHERE presentation IS NULL",
    "UPDATE lessons SET content = '[]' WHERE content IS NULL",
    "UPDATE lessons SET xp = 10 WHERE xp IS NULL",
    "UPDATE lessons SET conclusion = '[]' WHERE conclusion IS NULL",
    "UPDATE lessons SET evaluation_question = '' WHERE evaluation_question IS NULL",
    "UPDATE questions SET type = 'multipla' WHERE type IS NULL",
    "UPDATE questions SET explanation = '' WHERE explanation IS NULL",
    "UPDATE progress SET perfect = 0 WHERE perfect IS NULL"
];

async function seed() {
    await batch(NULL_DEFAULTS);

    // ADMINISTRADOR PRINCIPAL
    // Cria somente o administrador principal. Os demais
    // administradores se cadastram com seus próprios e-mails.

    const adminEmail = (
        process.env.ADMIN_EMAIL || 'admin@exemplo.com'
    ).trim().toLowerCase();

    const adminName =
        process.env.ADMIN_NAME || 'Administrador';

    const adminPassword =
        process.env.ADMIN_PASSWORD || 'admin123';

    const adminExists = await prepare(
        'SELECT id FROM users WHERE email = ?'
    ).get(adminEmail);

    if (!adminExists) {
        const hash = bcrypt.hashSync(adminPassword, 10);

        await prepare(`
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, 'adm')
        `).run(adminName, adminEmail, hash);
    }

    // Promove contas adicionais autorizadas que já existem.
    // Não cria contas e não modifica suas senhas.

    const additionalAdminEmails = (
        process.env.ADMIN_EMAILS || ''
    )
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(Boolean);

    for (const email of additionalAdminEmails) {
        await prepare(`
            UPDATE users
            SET role = 'adm'
            WHERE email = ?
        `).run(email);
    }

    // GARANTIR PELO MENOS UM MÓDULO POR TRILHA

    const tracksWithoutLessons = await prepare(`
        SELECT id
        FROM tracks
        WHERE id NOT IN (
            SELECT track_id
            FROM lessons
        )
    `).all();

    for (const track of tracksWithoutLessons) {
        await prepare(`
            INSERT INTO lessons(
                track_id,
                title,
                position,
                xp
            )
            VALUES(?,?,?,?)
        `).run(track.id, 'Módulo 1', 0, 10);
    }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
//
// O servidor só começa a atender depois que ready() termina:
// conexão testada, esquema validado e dados iniciais garantidos.

let readyPromise = null;

async function initialize() {
    await client.execute('SELECT 1');

    const problems = await validateSchema();

    if (problems.length) {
        throw new Error(
            'O esquema do banco não corresponde ao esperado:\n - ' +
            problems.join('\n - ')
        );
    }

    await seed();
}

function ready() {
    readyPromise ||= initialize();

    return readyPromise;
}

function close() {
    client.close();
}

// ============================================================
// EXPORTAÇÃO
// ============================================================

module.exports = {
    prepare,
    exec,
    batch,
    transaction,
    ready,
    close,
    validateSchema,
    provisionSchema
};
