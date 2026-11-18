// Testes da camada de banco (db.js) em um banco libSQL local
// descartável. Nunca usa o Turso de produção.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSandbox } = require('./helpers');

const sandbox = makeSandbox();

// Precisa vir antes do require('../db').
process.env.TURSO_DATABASE_URL = sandbox.url;
process.env.TURSO_AUTH_TOKEN = '';

const db = require('../db');
const { SCHEMA } = require('../schema');

test.after(() => {
  db.close();
  sandbox.cleanup();
});

test('banco vazio é rejeitado na validação', async () => {
  const problems = await db.validateSchema();

  assert.equal(problems.length, 1);
  assert.match(problems[0], /vazio/);
});

test('provisionamento cria exatamente o esquema existente', async () => {
  assert.deepEqual(await db.provisionSchema(), []);

  const objects = await db.prepare(`
    SELECT type, name, sql
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
  `).all();

  assert.equal(objects.length, SCHEMA.length);

  const tables = objects.filter(o => o.type === 'table').map(o => o.name).sort();
  assert.equal(tables.length, 23);

  for (const expected of SCHEMA) {
    const found = objects.find(o => o.name === expected.name);
    assert.ok(found, 'ausente: ' + expected.name);
    assert.equal(found.sql, expected.sql);
  }

  await assert.rejects(db.provisionSchema(), /já possui tabelas/);
});

test('ready() valida o esquema e cria o administrador', async () => {
  await db.ready();

  const admins = await db.prepare(
    "SELECT email FROM users WHERE role = 'adm'"
  ).all();

  assert.equal(admins.length, 1);
});

test('INSERT / SELECT / UPDATE / DELETE com o formato do node:sqlite', async () => {
  const inserted = await db.prepare(
    'INSERT INTO tracks (title) VALUES (?)'
  ).run('Trilha A');

  assert.equal(typeof inserted.lastInsertRowid, 'number');
  assert.equal(inserted.changes, 1);

  const row = await db.prepare('SELECT * FROM tracks WHERE id = ?')
    .get(inserted.lastInsertRowid);

  assert.equal(row.title, 'Trilha A');
  assert.equal(row.icon, '📚');
  assert.equal(row.color, '#58cc02');
  assert.equal(Object.getPrototypeOf(row), Object.prototype);

  const updated = await db.prepare('UPDATE tracks SET title = ? WHERE id = ?')
    .run('Trilha B', row.id);

  assert.equal(updated.changes, 1);

  assert.equal(
    await db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(999999),
    undefined
  );

  assert.deepEqual(
    await db.prepare('SELECT 1 AS x, 2 AS x').get(),
    { x: 2 }
  );

  const deleted = await db.prepare('DELETE FROM tracks WHERE id = ?').run(row.id);
  assert.equal(deleted.changes, 1);
});

test('chaves estrangeiras ativas: exclusão em cascata', async () => {
  const trackId = (await db.prepare(
    'INSERT INTO tracks (title) VALUES (?)'
  ).run('Cascata')).lastInsertRowid;

  await db.prepare('INSERT INTO lessons (track_id, title) VALUES (?, ?)')
    .run(trackId, 'M1');

  await db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);

  const left = await db.prepare('SELECT COUNT(*) n FROM lessons WHERE track_id = ?')
    .get(trackId);

  assert.equal(left.n, 0);

  await assert.rejects(
    db.prepare('INSERT INTO lessons (track_id, title) VALUES (?, ?)').run(987654, 'x'),
    /FOREIGN KEY/
  );
});

test('transação confirma (COMMIT) quando o callback termina', async () => {
  const id = await db.transaction(async () => {
    const result = await db.prepare(
      'INSERT INTO tracks (title) VALUES (?)'
    ).run('Commit');

    return result.lastInsertRowid;
  });

  assert.ok(await db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(id));
});

test('transação desfaz tudo (ROLLBACK) quando o callback falha', async () => {
  const before = (await db.prepare('SELECT COUNT(*) n FROM tracks').get()).n;

  await assert.rejects(
    db.transaction(async () => {
      await db.prepare('INSERT INTO tracks (title) VALUES (?)').run('R1');
      await db.prepare('INSERT INTO tracks (title) VALUES (?)').run('R2');
      throw new Error('falha proposital');
    }),
    /falha proposital/
  );

  const after = (await db.prepare('SELECT COUNT(*) n FROM tracks').get()).n;
  assert.equal(after, before);

  // Erro do próprio banco no meio da transação também desfaz tudo.
  await assert.rejects(
    db.transaction(async () => {
      await db.prepare('INSERT INTO tracks (title) VALUES (?)').run('R3');
      await db.prepare('INSERT INTO tracks (title) VALUES (?)').run(null);
    }),
    /NOT NULL/
  );

  assert.equal((await db.prepare('SELECT COUNT(*) n FROM tracks').get()).n, before);

  // O banco continua utilizável depois do rollback.
  assert.ok(await db.prepare('SELECT 1 AS ok').get());
});

test('transação aninhada participa da externa', async () => {
  const before = (await db.prepare('SELECT COUNT(*) n FROM tracks').get()).n;

  await assert.rejects(
    db.transaction(async () => {
      await db.prepare('INSERT INTO tracks (title) VALUES (?)').run('Externa');

      await db.transaction(async () => {
        await db.prepare('INSERT INTO tracks (title) VALUES (?)').run('Interna');
      });

      throw new Error('desfaz as duas');
    })
  );

  assert.equal((await db.prepare('SELECT COUNT(*) n FROM tracks').get()).n, before);
});

test('transações simultâneas não perdem atualizações', async () => {
  const { id } = await db.prepare(
    "SELECT id FROM users WHERE role = 'adm'"
  ).get();

  await db.prepare('UPDATE users SET coins = 0 WHERE id = ?').run(id);

  // Ler e gravar em seguida: sem transação, as leituras se
  // sobreporiam e várias atualizações seriam perdidas.
  await Promise.all(
    Array.from({ length: 10 }, () =>
      db.transaction(async () => {
        const { coins } = await db.prepare(
          'SELECT coins FROM users WHERE id = ?'
        ).get(id);

        await db.prepare('UPDATE users SET coins = ? WHERE id = ?')
          .run(coins + 1, id);
      })
    )
  );

  const { coins } = await db.prepare('SELECT coins FROM users WHERE id = ?').get(id);
  assert.equal(coins, 10);
});

test('batch e exec funcionam dentro de transação', async () => {
  const ids = await db.transaction(async () => {
    await db.batch([
      { sql: 'INSERT INTO tracks (title) VALUES (?)', args: ['Lote 1'] },
      { sql: 'INSERT INTO tracks (title) VALUES (?)', args: ['Lote 2'] }
    ]);

    await db.exec("UPDATE tracks SET description = 'lote' WHERE title LIKE 'Lote%'");

    return db.prepare("SELECT id FROM tracks WHERE description = 'lote'").all();
  });

  assert.equal(ids.length, 2);
});

test('consulta sem await gera erro imediato', () => {
  assert.throws(
    () => db.prepare('SELECT 1 AS v').get().v,
    /sem await/
  );

  assert.throws(
    () => db.prepare('SELECT 1 AS v').all().map(x => x),
    /sem await/
  );
});

test('undefined como parâmetro é rejeitado (como no node:sqlite)', async () => {
  await assert.rejects(
    db.prepare('SELECT ?').get(undefined),
    /cannot be bound/
  );
});
