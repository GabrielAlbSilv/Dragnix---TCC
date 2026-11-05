// ============================================================
// ESQUEMA DO BANCO — VERIFICAR / CRIAR
// ============================================================
//
// npm run db:check      compara o banco com schema.js (só leitura)
// npm run db:provision  cria o esquema de schema.js em um banco
//                       VAZIO (recusa se já houver qualquer tabela)
//
// Nenhum dos dois apaga ou altera dados existentes.

const db = require('../db');

async function main() {
  const command = process.argv[2];

  if (command !== 'check' && command !== 'provision') {
    throw new Error('Uso: node scripts/db-schema.js check|provision');
  }

  const problems = command === 'provision'
    ? await db.provisionSchema()
    : await db.validateSchema();

  if (problems.length) {
    console.error('Esquema diferente do esperado:\n - ' + problems.join('\n - '));
    process.exitCode = 1;
    return;
  }

  console.log(
    command === 'provision'
      ? 'Esquema criado e validado com sucesso.'
      : 'Esquema validado: idêntico ao esperado.'
  );
}

main()
  .catch(error => {
    console.error('Falha:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
