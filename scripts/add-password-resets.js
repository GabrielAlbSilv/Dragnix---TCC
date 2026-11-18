// Cria a tabela password_resets no banco configurado em .env
// (Turso), sem tocar nas outras tabelas. Pode rodar mais de uma vez.
//
//   node scripts/add-password-resets.js

const db = require('../db');
const { SCHEMA } = require('../schema');

async function main() {
  const item = SCHEMA.find(entry => entry.name === 'password_resets');

  if (!item) {
    throw new Error('password_resets não está no schema.js.');
  }

  const exists = await db.prepare(`
    SELECT 1 AS found
    FROM sqlite_master
    WHERE type = 'table' AND name = 'password_resets'
  `).get();

  if (exists) {
    console.log('A tabela password_resets já existe.');
  } else {
    await db.exec(item.sql);
    console.log('Tabela password_resets criada.');
  }

  const problems = await db.validateSchema();

  if (problems.length) {
    console.error('O esquema ainda difere do esperado:\n - ' + problems.join('\n - '));
    process.exitCode = 1;
    return;
  }

  console.log('Esquema validado: idêntico ao esperado.');
}

main()
  .catch(error => {
    console.error('Falha:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());