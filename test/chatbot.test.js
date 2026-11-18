// Testes do assistente de dúvidas (chatbot.js): busca, citações e sugestões.
const test = require('node:test');
const assert = require('node:assert/strict');

const { _interno: c } = require('../chatbot');

test('base de conhecimento das trilhas carrega', () => {
  const trechos = c.carregarBase();
  assert.ok(trechos.length > 50);
  assert.ok(trechos.every(t => t.trilha && t.modulo && t.texto));
  // os PDFs de questões (com gabarito) ficam de fora
  assert.ok(trechos.every(t => !/quest/i.test(t.modulo)));
});

test('busca encontra o módulo certo', () => {
  const indice = c.criarIndice(c.carregarBase());
  const primeiro = pergunta => indice.buscar([pergunta], 1)[0];

  assert.equal(primeiro('o que são juros compostos?').titulo, 'Juros');
  assert.equal(primeiro('vale a pena investir em bitcoin?').trilha, 'Trilha 3 - Estrategista Financeiro');
  assert.match(primeiro('tenho direito a férias e 13?').titulo, /Direitos trabalhistas/);
  assert.equal(primeiro('o que vou aprender na trilha 2').modulo, 'Visão geral da trilha');
  assert.equal(primeiro('do que fala o modulo 4 da trilha 1').titulo, 'Poder de compra');
});

test('citações [n] saem do texto e viram fontes', () => {
  const r = c.extrairCitacoes('Juros sobre juros [1]. Também [2, 3] e [9].', 3);
  assert.equal(r.texto, 'Juros sobre juros. Também e [9].');
  assert.deepEqual([...r.citados].sort(), [0, 1, 2]);
});

test('linha de sugestões é separada da resposta', () => {
  const r = c.separarSugestoes('Resposta.\n@@SUGESTOES: O que é CDB? | Como poupar? | x');
  assert.equal(r.texto, 'Resposta.');
  assert.deepEqual(r.sugestoes, ['O que é CDB?', 'Como poupar?']);
});

test('filtros do Nix: questões, internet e aviso final', () => {
  assert.ok(c.pareceExercicio('Qual a alternativa correta? A) R$ 1.050 B) R$ 1.150'));
  assert.ok(c.pareceExercicio('me dá a resposta da questão 3'));
  assert.ok(!c.pareceExercicio('o que são juros compostos?'));

  assert.ok(c.pedeInternet('quanto está o dólar hoje?'));
  assert.ok(!c.pedeInternet('como pesquisar preços antes de comprar'));

  assert.ok(c.temAviso('Sou uma IA e posso cometer erros.'));
  assert.match(
    c.avisoPadrao({ trilha: 'Trilha 2 - Guardião do Orçamento', modulo: 'Módulo 4 - Juros' }),
    /posso cometer erros: revise o Módulo 4 - Juros da Trilha 2 .*Fórum de dúvidas/
  );
});

test('filtro do Nix: conselho de investimento ou operação bancária', () => {
  for (const q of ['onde devo investir 500 reais?', 'vale a pena comprar bitcoin agora?',
    'devo fazer esse empréstimo consignado?', 'qual o melhor banco para abrir conta?',
    'preciso passar minha senha do banco?']) {
    assert.ok(c.pedeConselho(q), q);
  }
  for (const q of ['o que é CDB?', 'como funcionam os juros do cartão de crédito?',
    'o que é empréstimo consignado?', 'como montar uma carteira de investimentos?']) {
    assert.ok(!c.pedeConselho(q), q);
  }
});
