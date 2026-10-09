const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

// ============================================================
// BANCO DE DADOS
// ============================================================

const dbFile = process.env.DB_FILE || path.join(__dirname, 'data.db');

const db = new DatabaseSync(dbFile);

db.exec('PRAGMA foreign_keys = ON');

// ============================================================
// TABELAS PRINCIPAIS
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'comum'
            CHECK(role IN ('comum', 'professor', 'adm'))
    );

    CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '📚',
        position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY,
        track_id INTEGER NOT NULL
            REFERENCES tracks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        lesson_id INTEGER NOT NULL
            REFERENCES lessons(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        answer INTEGER NOT NULL DEFAULT 0,
        position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS progress (
        user_id INTEGER
            REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INTEGER
            REFERENCES lessons(id) ON DELETE CASCADE,
        xp INTEGER DEFAULT 10,
        PRIMARY KEY(user_id, lesson_id)
    );
`);

// ============================================================
// MIGRAÇÕES
// ============================================================

// Cada alteração é executada individualmente.
// Se a coluna já existir, o erro é ignorado.

const migrations = [
    // USERS
    "ALTER TABLE users ADD COLUMN hearts INTEGER DEFAULT 5",
    "ALTER TABLE users ADD COLUMN hearts_at INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN last_day TEXT",
    "ALTER TABLE users ADD COLUMN best_streak INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0",

    // TRACKS
    "ALTER TABLE tracks ADD COLUMN presentation TEXT DEFAULT '[]'",
    "ALTER TABLE tracks ADD COLUMN conclusion TEXT DEFAULT '[]'",
"ALTER TABLE tracks ADD COLUMN evaluation_question TEXT DEFAULT ''",
    "ALTER TABLE tracks ADD COLUMN prerequisites TEXT DEFAULT '[]'",
    "ALTER TABLE tracks ADD COLUMN color TEXT DEFAULT '#58cc02'",

    // LESSONS
    "ALTER TABLE lessons ADD COLUMN conclusion TEXT DEFAULT '[]'",
    "ALTER TABLE lessons ADD COLUMN evaluation_question TEXT DEFAULT ''",
    "ALTER TABLE lessons ADD COLUMN intro TEXT DEFAULT ''",
    "ALTER TABLE lessons ADD COLUMN presentation TEXT DEFAULT '[]'",
    "ALTER TABLE lessons ADD COLUMN content TEXT DEFAULT '[]'",
    "ALTER TABLE lessons ADD COLUMN xp INTEGER DEFAULT 10",

    // QUESTIONS
    "ALTER TABLE questions ADD COLUMN type TEXT DEFAULT 'multipla'",
    "ALTER TABLE questions ADD COLUMN explanation TEXT DEFAULT ''",

    // PROGRESS
    "ALTER TABLE progress ADD COLUMN perfect INTEGER DEFAULT 0",
    "ALTER TABLE progress ADD COLUMN done_at TEXT"
];

for (const sql of migrations) {
    try {
        db.exec(sql);
    } catch {
        // Coluna provavelmente já existe.
    }
}

// ============================================================
// MIGRAÇÃO: PERMITIR O CARGO 'professor'
// ============================================================

// Bancos antigos têm CHECK(role IN ('comum','adm')) e o SQLite não
// permite alterar essa regra. Recriamos a tabela users mantendo todos
// os dados. As chaves estrangeiras ficam desligadas durante a troca
// para que o DROP TABLE não apague progresso, respostas etc.

const usersSql = (
    db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    ).get() || {}
).sql || '';

if (usersSql && !usersSql.includes("'professor'")) {
    const newSql = usersSql
        .replace(
            /CREATE TABLE\s+(IF NOT EXISTS\s+)?["`]?users["`]?/i,
            'CREATE TABLE users_new'
        )
        .replace(
            /CHECK\s*\(\s*role\s+IN\s*\([^)]*\)\s*\)/i,
            "CHECK(role IN ('comum', 'professor', 'adm'))"
        );

    db.exec('PRAGMA foreign_keys = OFF');

    try {
        db.exec('BEGIN');
        db.exec('DROP TABLE IF EXISTS users_new');
        db.exec(newSql);
        db.exec('INSERT INTO users_new SELECT * FROM users');
        db.exec('DROP TABLE users');
        db.exec('ALTER TABLE users_new RENAME TO users');
        db.exec('COMMIT');
    } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
    } finally {
        db.exec('PRAGMA foreign_keys = ON');
    }
}

// ============================================================
// TABELAS COMPLEMENTARES
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS answers (
        user_id INTEGER,
        question_id INTEGER,
        correct INTEGER,
        PRIMARY KEY(user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS activity (
        user_id INTEGER,
        day TEXT,
        xp INTEGER DEFAULT 0,
        lessons INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        PRIMARY KEY(user_id, day)
    );

    CREATE TABLE IF NOT EXISTS lesson_evaluations (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS track_evaluations (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        created_at TEXT NOT NULL,
        PRIMARY KEY(user_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS doubts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER
            REFERENCES doubts(id) ON DELETE CASCADE,
        track_id INTEGER
            REFERENCES tracks(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_doubts_parent
        ON doubts(parent_id);

    CREATE TABLE IF NOT EXISTS badges (
        user_id INTEGER,
        code TEXT,
        PRIMARY KEY(user_id, code)
    );

    CREATE TABLE IF NOT EXISTS claims (
        user_id INTEGER,
        day TEXT,
        code TEXT,
        PRIMARY KEY(user_id, day, code)
    );

    CREATE TABLE IF NOT EXISTS finance (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL
            CHECK(kind IN ('gasto', 'receita')),
        category TEXT,
        description TEXT,
        amount REAL NOT NULL,
        day TEXT NOT NULL
    );
`);

// ============================================================
// VALORES PADRÃO PARA DADOS ANTIGOS
// ============================================================

// Garante que registros antigos não fiquem com valores NULL
// depois das migrações.

db.exec(`
    UPDATE users
    SET hearts = 5
    WHERE hearts IS NULL;

    UPDATE users
    SET hearts_at = 0
    WHERE hearts_at IS NULL;

    UPDATE users
    SET streak = 0
    WHERE streak IS NULL;

    UPDATE users
    SET best_streak = 0
    WHERE best_streak IS NULL;

    UPDATE users
    SET coins = 0
    WHERE coins IS NULL;

    UPDATE tracks
    SET presentation = '[]'
    WHERE presentation IS NULL;

    UPDATE tracks
    SET color = '#58cc02'
    WHERE color IS NULL;

    UPDATE tracks
    SET conclusion = '[]'
    WHERE conclusion IS NULL;

    UPDATE tracks
    SET evaluation_question = ''
    WHERE evaluation_question IS NULL;

    UPDATE lessons
    SET intro = ''
    WHERE intro IS NULL;

    UPDATE lessons
    SET presentation = '[]'
    WHERE presentation IS NULL;

    UPDATE lessons
    SET content = '[]'
    WHERE content IS NULL;

    UPDATE lessons
    SET xp = 10
    WHERE xp IS NULL;

    UPDATE lessons
    SET conclusion = '[]'
    WHERE conclusion IS NULL;

    UPDATE lessons
    SET evaluation_question = ''
    WHERE evaluation_question IS NULL;

    UPDATE questions
    SET type = 'multipla'
    WHERE type IS NULL;

    UPDATE questions
    SET explanation = ''
    WHERE explanation IS NULL;

    UPDATE progress
    SET perfect = 0
    WHERE perfect IS NULL;
`);


/* ============================================================
   ADMINISTRADOR PRINCIPAL
   ============================================================ */

const adminEmail = (
    process.env.ADMIN_EMAIL || 'admin@exemplo.com'
).trim().toLowerCase();

const adminName =
    process.env.ADMIN_NAME || 'Administrador';

const adminPassword =
    process.env.ADMIN_PASSWORD || 'admin123';

// Cria somente o administrador principal.
// Os demais administradores devem se cadastrar
// com seus próprios e-mails e senhas.

const adminExists = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(adminEmail);

if (!adminExists) {
    const hash = bcrypt.hashSync(adminPassword, 10);

    db.prepare(`
        INSERT INTO users (name, email, password, role)
        VALUES (?, ?, ?, 'adm')
    `).run(
        adminName,
        adminEmail,
        hash
    );
}

// Promove contas adicionais autorizadas que já existem.
// Não cria contas e não modifica suas senhas.

const additionalAdminEmails = (
    process.env.ADMIN_EMAILS || ''
)
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

const promoteAdmin = db.prepare(`
    UPDATE users
    SET role = 'adm'
    WHERE email = ?
`);

for (const email of additionalAdminEmails) {
    promoteAdmin.run(email);
}

// ============================================================
// GARANTIR PELO MENOS UM MÓDULO POR TRILHA
// ============================================================

const tracksWithoutLessons = db
    .prepare(`
        SELECT id
        FROM tracks
        WHERE id NOT IN (
            SELECT track_id
            FROM lessons
        )
    `)
    .all();

for (const track of tracksWithoutLessons) {
    db.prepare(`
        INSERT INTO lessons(
            track_id,
            title,
            position,
            xp
        )
        VALUES(?,?,?,?)
    `).run(
        track.id,
        'Módulo 1',
        0,
        10
    );
}

// ============================================================
// EXPORTAÇÃO
// ============================================================

module.exports = db;