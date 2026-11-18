// Cria a tabela app_settings no banco configurado em .env
// (Turso), sem tocar nas outras tabelas. Pode rodar mais de uma vez.
//
//   node scripts/add-app-settings.js

const db = require('../db');
const { SCHEMA } = require('../schema');

async function main() {
  const item = SCHEMA.find(entry => entry.name === 'app_settings');

  if (!item) {
    throw new Error('app_settings não está no schema.js.');
  }

  const exists = await db.prepare(`
    SELECT 1 AS found
    FROM sqlite_master
    WHERE type = 'table' AND name = 'app_settings'
  `).get();

  if (exists) {
    console.log('A tabela app_settings já existe.');
  } else {
    await db.exec(item.sql);
    console.log('Tabela app_settings criada.');
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