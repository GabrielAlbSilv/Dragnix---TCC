// ============================================================
// DRAGNIX — chatbot.js  (ASSISTENTE DE DÚVIDAS COM IA)
// ============================================================
//
// Responde as dúvidas dos alunos com base no conteúdo das trilhas
// (chatbot/base.json, gerado por scripts/gerar-base-chatbot.py a
// partir dos PDFs da pasta "Trilhas").
//
// Como funciona (RAG — "busca + geração"):
//   1. A pergunta é reescrita pela IA com os termos que o material usa
//      (ex.: "e se eu atrasar?" -> "juros e multa por atraso no cartão").
//   2. Busca por palavras-chave (BM25) encontra os trechos mais parecidos.
//   3. A IA (Groq) escreve a resposta usando esses trechos e cita de onde
//      tirou cada informação (trilha e módulo).
//   4. A resposta chega aos poucos (streaming), como numa conversa.
//
// Configuração (variáveis de ambiente):
//   GROQ_API_KEY      obrigatória — chave da Groq (https://console.groq.com)
//   CHATBOT_MODELO    opcional — padrão "openai/gpt-oss-120b"
//   CHATBOT_REESCRITA opcional — "0" desliga a reescrita da pergunta
//
// Rotas (todas exigem login):
//   GET  /api/chatbot/status   -> { ativo, trechos, trilhas }
//   POST /api/chatbot          -> resposta em NDJSON (uma linha JSON por evento)
//        corpo: { pergunta, historico: [{ papel: 'user'|'assistant', texto }] }
//        eventos: { tipo:'texto', conteudo } ... { tipo:'fim', resposta, fontes, sugestoes }
//                 ou { tipo:'erro', mensagem }
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');

const ARQ_BASE = path.join(__dirname, 'chatbot', 'base.json');
// (CHATBOT_GROQ_URL só é usada nos testes, com uma Groq simulada)
const URL_GROQ = process.env.CHATBOT_GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions';

const MODELO = process.env.CHATBOT_MODELO || 'openai/gpt-oss-120b';
const REESCREVER = process.env.CHATBOT_REESCRITA !== '0';

const K = 6;                       // trechos enviados à IA por pergunta
const MAX_PERGUNTA = 1000;         // caracteres
const MAX_HISTORICO = 6;           // mensagens anteriores enviadas como contexto
const MAX_CHARS_HISTORICO = 1500;  // por mensagem
const LIMITE_POR_MINUTO = 12;      // perguntas por aluno
const TEMPO_LIMITE_MS = 60000;     // espera máxima pela IA

// ============================================================
// BASE DE CONHECIMENTO
// ============================================================

function carregarBase() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQ_BASE, 'utf8'));
    const trechos = Array.isArray(dados.trechos) ? dados.trechos : [];
    console.log(`[CHATBOT] Base carregada: ${trechos.length} trechos.`);
    return trechos;
  } catch (erro) {
    console.warn('[CHATBOT] chatbot/base.json não encontrado ou inválido:', erro.message);
    return [];
  }
}

// ============================================================
// BUSCA POR PALAVRAS-CHAVE (BM25)
// ============================================================

const PARADAS = new Set(('de do da dos das a o as os e em no na nos nas um uma uns umas para pra por ' +
  'com ao aos ou se que eu me meu minha voce vc e eh é ser ter como qual quais o que isso esse essa').split(' '));

// palavra que o aluno usa -> palavras que o material usa
const SINONIMOS = {
  grana: 'dinheiro', dinheiro: 'renda', salario: 'remuneracao renda trabalho',
  ganhar: 'renda', ganho: 'renda', gasto: 'despesa saida', gastos: 'despesa saida',
  gastar: 'consumo despesa', compra: 'consumo', comprar: 'consumo', compras: 'consumo',
  economizar: 'poupar reserva', guardar: 'poupar reserva poupanca', poupar: 'poupanca reserva',
  divida: 'emprestimo endividamento', dividas: 'emprestimo endividamento', devendo: 'divida endividamento',
  cartao: 'credito', parcela: 'parcelamento', parcelas: 'parcelamento', parcelar: 'parcelamento',
  financiar: 'financiamento', emprestar: 'emprestimo', taxa: 'juros', taxas: 'juros',
  rende: 'rendimento', render: 'rendimento', rendendo: 'rendimento', lucro: 'retorno rendimento',
  investir: 'investimento', aplicar: 'investimento aplicacao', bolsa: 'acoes valores',
  cripto: 'criptomoeda blockchain', bitcoin: 'criptomoeda blockchain',
  imposto: 'tributo', impostos: 'tributo', caro: 'preco inflacao', carestia: 'inflacao',
  inflacao: 'precos poder compra', meta: 'objetivo planejamento', metas: 'objetivo planejamento',
  sonho: 'objetivo', sonhos: 'objetivo', orcamento: 'organizacao planejamento',
  planilha: 'registro entradas saidas', anotar: 'registrar entradas saidas',
  emprego: 'trabalho carreira', trampo: 'trabalho', ferias: 'direitos trabalhistas',
  decimo: 'direitos trabalhistas', fgts: 'direitos trabalhistas', clt: 'direitos trabalhistas carteira',
  negocio: 'empreendedorismo', empresa: 'empreendedorismo', risco: 'riscos retorno',
  arriscado: 'risco', seguro: 'risco seguranca', reserva: 'emergencia', emergencia: 'reserva'
};

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function tokenizar(texto, consulta = false) {
  let brutos = (semAcento(texto).match(/[a-z0-9]+/g) || []).filter(t => !PARADAS.has(t) && (t.length > 1 || /\d/.test(t)));

  // "trilha 2" / "modulo 4" viram um termo só, para achar a trilha/módulo certo
  const juntos = [];
  brutos.forEach((t, i) => {
    if ((t === 'trilha' || t === 'modulo') && /^\d+$/.test(brutos[i + 1] || '')) juntos.push(t + brutos[i + 1]);
  });
  brutos = brutos.concat(juntos);

  if (consulta) {
    for (const t of [...brutos]) {
      if (SINONIMOS[t]) brutos = brutos.concat(SINONIMOS[t].split(' '));
    }
  }

  // radical simples: tira o plural e corta em 7 letras ("investimentos" ~ "investimento")
  return brutos.map(t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t).slice(0, 7));
}

class Bm25 {
  constructor(documentos, k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.n = documentos.length;
    this.tamanhos = documentos.map(d => d.length);
    this.media = this.tamanhos.reduce((a, c) => a + c, 0) / (this.n || 1) || 1;
    this.postings = new Map();

    documentos.forEach((doc, i) => {
      const contagem = new Map();
      doc.forEach(t => contagem.set(t, (contagem.get(t) || 0) + 1));
      contagem.forEach((tf, termo) => {
        if (!this.postings.has(termo)) this.postings.set(termo, []);
        this.postings.get(termo).push([i, tf]);
      });
    });

    this.idf = new Map();
    this.postings.forEach((lista, termo) => {
      this.idf.set(termo, Math.log(1 + (this.n - lista.length + 0.5) / (lista.length + 0.5)));
    });
  }

  pontuar(consulta) {
    const pontos = new Float64Array(this.n);
    for (const termo of new Set(consulta)) {
      const lista = this.postings.get(termo);
      if (!lista) continue;
      const idf = this.idf.get(termo);
      for (const [i, tf] of lista) {
        const norma = tf + this.k1 * (1 - this.b + this.b * this.tamanhos[i] / this.media);
        pontos[i] += idf * tf * (this.k1 + 1) / norma;
      }
    }
    return pontos;
  }
}

// posição de cada trecho no ranking (0 = melhor)
function ranking(pontos) {
  const ordem = [...pontos.keys()].sort((a, b) => pontos[b] - pontos[a]);
  const posicao = new Array(pontos.length);
  ordem.forEach((indice, pos) => { posicao[indice] = pos; });
  return posicao;
}

function criarIndice(trechos) {
  // o nome do módulo e da trilha também contam na busca
  const bm25 = new Bm25(trechos.map(t => tokenizar(`${t.titulo} ${t.titulo} ${t.modulo} ${t.trilha} ${t.texto}`)));

  return {
    // Funde (RRF) os rankings da pergunta original e da reescrita
    buscar(consultas, k = K) {
      const validas = [...new Set(consultas.filter(Boolean).map(c => c.trim()).filter(Boolean))];
      const placar = new Float64Array(trechos.length);

      for (const consulta of validas) {
        const pontos = bm25.pontuar(tokenizar(consulta, true));
        if (!pontos.some(p => p > 0)) continue;
        const pos = ranking(pontos);
        pos.forEach((p, i) => { if (pontos[i] > 0) placar[i] += 1 / (60 + p); });
      }

      return [...placar.keys()]
        .filter(i => placar[i] > 0)
        .sort((a, b) => placar[b] - placar[a])
        .slice(0, k)
        .map(i => trechos[i]);
    }
  };
}

// ============================================================
// INSTRUÇÕES PARA A IA
// ============================================================

const MARCA_SUGESTOES = '@@SUGESTOES:';

function montarSistema(trechos) {
  // lista de trilhas e módulos, para responder "o que tem na trilha 2?"
  const mapa = new Map();
  trechos.forEach(t => {
    if (!mapa.has(t.trilha)) mapa.set(t.trilha, new Set());
    if (t.modulo !== 'Visão geral da trilha') mapa.get(t.trilha).add(t.modulo);
  });
  const ordenar = lista => [...lista].sort((a, b) => (parseInt(a.replace(/\D+/, ''), 10) || 0) - (parseInt(b.replace(/\D+/, ''), 10) || 0));
  const conteudo = [...mapa.keys()].sort().map(trilha => `- ${trilha}: ${ordenar(mapa.get(trilha)).join('; ')}`).join('\n');

  return `Você é o Nix, o assistente virtual da Dragnix — uma plataforma gamificada de
educação financeira para jovens. Você ajuda os alunos a entender o conteúdo das trilhas.
Responda sempre em português do Brasil, com simpatia, paciência e linguagem simples.

## O que a Dragnix ensina (trilhas e módulos)
${conteudo}

## Regras obrigatórias (valem para TODA resposta, sem exceção)
1. **Sem internet.** Você NÃO pesquisa na internet e não tem acesso a notícias, cotações,
   taxas do dia ou qualquer dado em tempo real. Sua base é o conteúdo das trilhas da
   Dragnix. Se pedirem algo assim ("quanto está o dólar hoje?", "pesquisa pra mim..."),
   diga com clareza que você não faz pesquisas na internet e explique o conceito pelo
   material, quando houver.
2. **Sem respostas de questões ou desafios.** NUNCA diga qual é a alternativa correta,
   se uma afirmação de verdadeiro/falso é V ou F, a ordem certa, os pares certos, o
   resultado final de um cálculo pedido em exercício, nem o gabarito de qualquer questão
   ou desafio da plataforma — mesmo que o aluno insista, diga que é só para conferir ou
   cole o enunciado. Em vez disso: explique o conceito envolvido, dê uma dica do raciocínio
   ou um exemplo PARECIDO com números diferentes, e incentive o aluno a chegar na resposta.
3. **Baseado nas trilhas.** Responda com base nos trechos do material fornecidos e cite-os.
   Se o assunto não estiver nas trilhas, diga isso claramente; você pode dar uma explicação
   curta e simples do conceito, avisando que não faz parte do conteúdo das trilhas.
4. **Sem conselhos de investimento nem de operações bancárias.** Você NÃO pode ajudar
   diretamente com investimentos nem dar qualquer tipo de conselho ou orientação para
   operações bancárias e financeiras reais do aluno. Isso inclui: dizer onde, quanto ou
   em que investir; recomendar comprar, vender ou manter ações, fundos, CDBs, criptomoedas
   ou qualquer ativo; indicar banco, corretora, cartão, conta ou aplicativo; dizer se o
   aluno deve ou não fazer um empréstimo, financiamento, parcelamento, portabilidade,
   transferência, PIX ou pagamento; e ajudar a executar qualquer operação (acessar conta,
   senhas, dados bancários, golpes). Quando a pergunta for desse tipo, diga com clareza e
   gentileza que você não pode dar esse tipo de conselho, que a decisão é pessoal e deve
   ser tomada com um responsável e/ou profissional habilitado, e então ensine os
   CONCEITOS envolvidos pelo conteúdo das trilhas (ex.: como comparar juros e CET, o que é
   risco e liquidez, como avaliar se cabe no orçamento). Nunca peça nem aceite senhas ou
   dados bancários.
5. **Fora do tema.** Assuntos sem relação com finanças ou com a Dragnix: diga gentilmente
   que você ajuda com educação financeira e com o conteúdo das trilhas, e sugira um tema.

## Fechamento de toda resposta sobre conteúdo
Termine SEMPRE com uma linha curta em itálico (uma frase só) que:
- lembre que você é uma IA e pode cometer erros;
- indique revisar o conteúdo da trilha/módulo relacionado (diga qual, quando souber);
- e, se a dúvida continuar, pergunte no **Fórum de dúvidas** (aba ao lado do Nix).
Exemplo: "*Sou uma IA e posso errar: revise o Módulo 4 - Juros da Trilha 2 e, se a dúvida
continuar, pergunte no Fórum de dúvidas.*"
Em saudações e agradecimentos curtos, essa linha não é necessária.

## Como responder
- **Saudações e perguntas sobre você**: responda em 1 ou 2 frases. Você é o Nix, uma IA que
  explica o conteúdo das trilhas, não pesquisa na internet e pode errar.
- **Dúvidas sobre o conteúdo**: os trechos vêm de uma busca automática; use os relevantes e
  ignore os outros. Interprete a pergunta pelo sentido, não pelas palavras.
- **Valores que mudam com o tempo** (taxas, salário mínimo, limites): diga que os números
  podem ter mudado e sugira conferir em fontes oficiais.
- **Pergunta vaga**: responda a interpretação mais provável e, se fizer diferença,
  pergunte ao final o que o aluno quis dizer.

Nunca contradiga o material. Use o histórico da conversa para entender perguntas de
continuação ("e se eu atrasar?", "pode dar um exemplo?").

## Citações
Os trechos vêm numerados como [1], [2]... Ao usar uma informação de um trecho, coloque o
número entre colchetes logo após a frase, ex.: "Os juros compostos rendem sobre o saldo
acumulado [2]." Não cite trechos que não usou e não invente números.

## Formato
- Comece pela resposta e depois dê os detalhes. Linguagem simples, para jovens.
- Parágrafos curtos, **negrito** no essencial, listas com "-" ou "1." para passos.
  NÃO use tabelas nem títulos com "#".
- Tamanho proporcional à pergunta.

## Perguntas de continuação
Na ÚLTIMA linha, escreva exatamente neste formato:
${MARCA_SUGESTOES} pergunta curta 1 | pergunta curta 2 | pergunta curta 3
São 2 ou 3 perguntas que o aluno provavelmente faria em seguida, escritas como ele
escreveria (ex.: "Como calculo juros compostos?"). Não mencione essa linha na resposta.`;
}

const PROMPT_REESCRITA = `Você prepara consultas de busca para o material de uma plataforma de educação
financeira para jovens (trilhas sobre dinheiro, renda, consumo, inflação, impostos,
salário, direitos trabalhistas, crédito, juros, parcelamento, dívidas, orçamento,
investimentos, bolsa, ações, criptomoedas, poupança, CDB, riscos e empreendedorismo).

Reescreva a ÚLTIMA pergunta do aluno como UMA consulta de busca completa e autônoma:
- resolva referências ao histórico (ex.: "e no cartão?" -> "juros do cartão de crédito");
- corrija erros de digitação e gírias;
- acrescente sinônimos e os termos que o material usa.
Responda APENAS com a consulta, em uma linha, sem explicações.`;

// ============================================================
// CHAMADAS À GROQ
// ============================================================

const opcoesModelo = (modelo, esforco) =>
  modelo.includes('gpt-oss') ? { reasoning_effort: esforco } : {};

async function chamarGroq(corpo, sinal) {
  const resposta = await fetch(URL_GROQ, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify(corpo),
    signal: sinal
  });

  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => '');
    const erro = new Error(`Groq respondeu ${resposta.status}: ${texto.slice(0, 300)}`);
    erro.status = resposta.status;
    throw erro;
  }

  return resposta;
}

async function reescreverConsulta(pergunta, historico) {
  const conversa = historico.slice(-4)
    .map(m => `${m.role === 'user' ? 'Aluno' : 'Assistente'}: ${m.content.slice(0, 400)}`)
    .join('\n');

  const entrada = (conversa ? `Histórico recente:\n${conversa}\n\n` : '') +
    `Última pergunta do aluno: ${pergunta}`;

  try {
    const r = await chamarGroq({
      model: MODELO,
      temperature: 0,
      max_completion_tokens: 400,
      messages: [
        { role: 'system', content: PROMPT_REESCRITA },
        { role: 'user', content: entrada }
      ],
      ...opcoesModelo(MODELO, 'low')
    }, AbortSignal.timeout(20000));

    const dados = await r.json();
    const linha = String(dados?.choices?.[0]?.message?.content || '').trim().split('\n')[0] || '';
    return linha.replace(/^["']|["']$/g, '').slice(0, 500) || null;
  } catch (erro) {
    console.warn('[CHATBOT] Reescrita da pergunta falhou:', erro.message);
    return null;
  }
}

// Lê o streaming da Groq (SSE: linhas "data: {...}") e devolve os pedaços de texto
async function* lerStream(resposta) {
  const decodificador = new TextDecoder();
  let buffer = '';

  for await (const pedaco of resposta.body) {
    buffer += decodificador.decode(pedaco, { stream: true });

    let quebra;
    while ((quebra = buffer.indexOf('\n')) >= 0) {
      const linha = buffer.slice(0, quebra).trim();
      buffer = buffer.slice(quebra + 1);

      if (!linha.startsWith('data:')) continue;
      const dado = linha.slice(5).trim();
      if (dado === '[DONE]') return;

      try {
        const json = JSON.parse(dado);
        const texto = json?.choices?.[0]?.delta?.content;
        if (texto) yield texto;
      } catch { /* linha incompleta: ignora */ }
    }
  }
}

// ============================================================
// RESPOSTA: CITAÇÕES, FONTES E SUGESTÕES
// ============================================================

// [3]  [1, 4]  [2-3]  e o formato 【3†...】 que alguns modelos usam
const CITACAO = /\s?[[【]\s*(\d{1,2}(?:\s*[,;–-]\s*\d{1,2})*)\s*(?:†[^\]】]*)?[\]】]/g;

function extrairCitacoes(resposta, total) {
  const citados = new Set();

  const texto = resposta.replace(CITACAO, (inteiro, grupo) => {
    let numeros = (grupo.match(/\d+/g) || []).map(Number);
    if (/[–-]/.test(grupo) && numeros.length === 2) {
      numeros = Array.from({ length: Math.max(0, numeros[1] - numeros[0] + 1) }, (_, i) => numeros[0] + i);
    }
    const validos = numeros.filter(n => n >= 1 && n <= total);
    if (!validos.length) return inteiro;
    validos.forEach(n => citados.add(n - 1));
    return '';
  }).replace(/[ \t]+([.,;:!?])/g, '$1');

  return { texto: texto.trim(), citados };
}

function separarSugestoes(texto) {
  const pos = texto.indexOf('@@');
  if (pos < 0) return { texto: texto.trim(), sugestoes: [] };

  const cauda = texto.slice(pos).split(':').slice(1).join(':');
  const sugestoes = [];

  cauda.split(/\s*\|\s*|\n/).forEach(s => {
    const limpa = s.trim().replace(/^[-*"'\s]+|[-*"'\s]+$/g, '');
    if (limpa.length >= 5 && limpa.length <= 120 && !sugestoes.includes(limpa)) sugestoes.push(limpa);
  });

  return { texto: texto.slice(0, pos).trim(), sugestoes: sugestoes.slice(0, 3) };
}

// ============================================================
// FILTROS DE RESPOSTA DO NIX
// ============================================================

// Enunciado de exercício: alternativas A) B) C), V ou F, gabarito, "qual a correta"...
function pareceExercicio(pergunta) {
  const t = semAcento(pergunta);
  const alternativas = (pergunta.match(/(^|\n|\s)[A-Ea-e]\s*[).:-]\s+\S/g) || []).length >= 2;
  return alternativas ||
    /\b(gabarito|alternativa|questao|exercicio|desafio)\b/.test(t) && /\b(correta|certa|resposta|resolve|resolver|qual e|marcar|marco)\b/.test(t) ||
    /verdadeiro ou falso|\(\s*\)\s*verdadeiro|qual (a|e a) (resposta|alternativa)|me (da|de|passa|fala) a resposta/.test(t);
}

// Pedido de pesquisa na internet ou de dado em tempo real
function pedeInternet(pergunta) {
  const t = semAcento(pergunta);
  return /\b(google|internet|noticias?)\b/.test(t) ||
    /\b(pesquis\w*|busca\w*|procura\w*)\b.{0,15}\b(na web|pra mim|para mim|online)\b/.test(t) ||
    /\b(hoje|agora|atual|atualmente|neste momento)\b.*\b(dolar|euro|bitcoin|cotacao|selic|cdi|taxa|preco|valor|bolsa|ibovespa)\b/.test(t) ||
    /\b(cotacao|quanto (esta|ta) o)\b/.test(t);
}

// Pedido de conselho de investimento ou de operação bancária real
// ("onde invisto?", "devo fazer esse empréstimo?", "qual banco é melhor?")
function pedeConselho(pergunta) {
  const t = semAcento(pergunta);
  const ativo = '(acao|acoes|bitcoin|cripto\\w*|fundo\\w*|cdb|lci|lca|tesouro|poupanca|dolar|fii\\w*|etf|bolsa|investimento\\w*|aplicacao)';
  const operacao = '(emprestimo|financiamento|consignado|cartao|parcelar|parcelamento|portabilidade|pix|transferencia|conta|banco|corretora|credito|cheque especial|consorcio)';
  return new RegExp(`\\b(onde|em que|em qual|qual|quanto)\\b.{0,30}\\b(invist\\w*|aplic\\w*|investir|aplicar)\\b`).test(t) ||
    new RegExp(`\\b(devo|deveria|vale a pena|compensa|e bom|me recomenda|recomenda|indica|melhor)\\b.{0,40}\\b${ativo}`).test(t) ||
    new RegExp(`\\b(compro|comprar|vendo|vender|seguro)\\b.{0,25}\\b${ativo}`).test(t) ||
    new RegExp(`\\b(devo|deveria|vale a pena|compensa|posso|faco|fazer|pego|pegar|contrato|contratar|abro|abrir|qual|melhor)\\b.{0,30}\\b${operacao}`).test(t) && /\b(devo|deveria|vale a pena|compensa|melhor|recomenda|indica|faco|pego|contrato|abro)\b/.test(t) ||
    /\b(senha|agencia|numero da conta|meus dados bancarios|token do banco)\b/.test(t);
}

// A resposta já lembra que é IA / indica o fórum?
const temAviso = texto => {
  const t = semAcento(texto);
  return /(posso|pode|podem) (cometer )?(erro|errar)/.test(t) || /forum de duvidas/.test(t);
};

function avisoPadrao(fonte) {
  const onde = fonte && fonte.modulo && fonte.modulo !== 'Visão geral da trilha'
    ? `o ${fonte.modulo} da ${String(fonte.trilha || '').replace(/\s*-\s*.*/, '')}`
    : fonte && fonte.trilha
      ? `a ${String(fonte.trilha).replace(/\s*-\s*.*/, '')}`
      : 'o conteúdo das trilhas';
  return `*Sou uma IA e posso cometer erros: revise ${onde} e, se a dúvida continuar, pergunte no Fórum de dúvidas.*`;
}

function saneamentoHistorico(historico) {
  return (Array.isArray(historico) ? historico : [])
    .slice(-20)
    .map(m => {
      if (!m || typeof m !== 'object') return null;
      const papel = m.papel || m.role;
      const texto = String(m.texto || m.content || '').trim();
      const role = papel === 'user' || papel === 'usuario' ? 'user'
        : papel === 'assistant' || papel === 'bot' ? 'assistant' : null;
      return role && texto ? { role, content: texto.slice(0, MAX_CHARS_HISTORICO) } : null;
    })
    .filter(Boolean)
    .slice(-MAX_HISTORICO);
}

function mensagemErro(erro) {
  const status = erro && erro.status;
  if (status === 429) {
    return 'Muitas pessoas estão usando o Nix agora e o limite da inteligência artificial foi atingido. Tente de novo em cerca de 1 minuto.';
  }
  if (status === 401 || status === 403) {
    return 'O Nix está com um problema de configuração (chave da IA). Avise um administrador.';
  }
  if (erro && (erro.name === 'TimeoutError' || erro.name === 'AbortError')) {
    return 'A inteligência artificial demorou demais para responder. Tente novamente.';
  }
  if (status >= 500) {
    return 'O serviço de inteligência artificial está instável no momento. Tente novamente em instantes.';
  }
  return 'Não foi possível gerar a resposta agora. Tente novamente.';
}

// ============================================================
// CACHE E LIMITE DE USO
// ============================================================

// Perguntas de início de conversa se repetem muito ("o que são juros?"):
// a resposta pronta fica guardada por 12 horas.
const CACHE_MAX = 200;
const CACHE_VALIDADE = 12 * 3600 * 1000;
const cache = new Map();

const chaveCache = pergunta => (semAcento(pergunta).match(/[a-z0-9]+/g) || []).join(' ');

function lerCache(chave) {
  const item = cache.get(chave);
  if (item && Date.now() - item.em < CACHE_VALIDADE) return item.resultado;
  cache.delete(chave);
  return null;
}

function gravarCache(chave, resultado) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(chave, { em: Date.now(), resultado });
}

const acessos = new Map();

function excedeuLimite(usuarioId) {
  const agora = Date.now();
  const lista = (acessos.get(usuarioId) || []).filter(t => agora - t < 60000);
  if (lista.length >= LIMITE_POR_MINUTO) {
    acessos.set(usuarioId, lista);
    return true;
  }
  lista.push(agora);
  acessos.set(usuarioId, lista);
  return false;
}

// ============================================================
// ROTAS
// ============================================================

function registrarChatbot(app, db, auth) {
  const trechos = carregarBase();
  const indice = criarIndice(trechos);
  const SISTEMA = montarSistema(trechos);
  const trilhas = [...new Set(trechos.map(t => t.trilha))].sort();

  const ativo = () => trechos.length > 0 && !!process.env.GROQ_API_KEY;

  // Liga cada módulo do material a um módulo da plataforma (mesmo título),
  // para a fonte virar um link "abrir o módulo". Atualiza a cada 5 minutos.
  let modulos = { em: 0, porTitulo: new Map() };

  // "Módulo 4 - Juros", "Modulo 4: juros" e "Juros" viram a mesma chave
  const chaveTitulo = titulo => semAcento(titulo)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^\s*modulo\s+\d+\s*/, '')
    .trim();

  async function moduloDaPlataforma(titulo) {
    if (Date.now() - modulos.em > 5 * 60000) {
      try {
        const linhas = await db.prepare('SELECT id, title FROM lessons').all();
        const porTitulo = new Map();
        linhas.forEach(l => porTitulo.set(chaveTitulo(l.title), l.id));
        modulos = { em: Date.now(), porTitulo };
      } catch {
        modulos.em = Date.now();
      }
    }
    return modulos.porTitulo.get(chaveTitulo(titulo)) || null;
  }

  async function formatarFontes(usados) {
    const vistos = new Map();
    for (const t of usados) {
      const chave = `${t.trilha}|${t.modulo}`;
      if (!vistos.has(chave)) {
        vistos.set(chave, {
          trilha: t.trilha,
          modulo: t.modulo,
          titulo: t.titulo,
          lesson_id: t.modulo === 'Visão geral da trilha' ? null : await moduloDaPlataforma(t.titulo)
        });
      }
    }
    return [...vistos.values()];
  }

  app.get('/api/chatbot/status', auth, (req, res) => {
    res.json({
      ativo: ativo(),
      trechos: trechos.length,
      trilhas,
      motivo: !trechos.length
        ? 'Base de conhecimento (chatbot/base.json) não encontrada.'
        : !process.env.GROQ_API_KEY
          ? 'A variável GROQ_API_KEY não está configurada no servidor.'
          : null
    });
  });

  // ------------------------------------------------------------
  // Teste do Nix para o "Status do sistema" (só administradores).
  // Confere a base, a chave e se a Groq responde (lista de modelos):
  // não gera resposta, então não gasta créditos da IA. Guarda o
  // resultado por 1 minuto para não repetir o teste a cada clique.
  // ------------------------------------------------------------
  let ultimoTeste = null;

  async function testarNix() {
    const resultado = { ok: false, modelo: MODELO, trechos: trechos.length, motivo: null, ms_ia: null };

    if (!trechos.length) {
      resultado.motivo = 'Base de conhecimento (chatbot/base.json) não encontrada.';
      return resultado;
    }

    if (!process.env.GROQ_API_KEY) {
      resultado.motivo = 'A variável GROQ_API_KEY não está configurada no servidor.';
      return resultado;
    }

    const inicio = Date.now();

    try {
      const r = await fetch(URL_GROQ.replace(/\/chat\/completions\/?$/, '/models'), {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        signal: AbortSignal.timeout(8000)
      });

      resultado.ms_ia = Date.now() - inicio;

      if (r.status === 401 || r.status === 403) {
        resultado.motivo = 'A chave da Groq (GROQ_API_KEY) foi recusada. Confira se está correta.';
        return resultado;
      }

      if (r.status === 429) {
        resultado.motivo = 'Limite de uso da Groq atingido no momento. Tente de novo em alguns minutos.';
        return resultado;
      }

      if (!r.ok) {
        resultado.motivo = `A Groq respondeu com erro ${r.status}.`;
        return resultado;
      }

      const dados = await r.json().catch(() => ({}));
      const modelos = Array.isArray(dados.data) ? dados.data.map(m => m.id) : [];

      if (modelos.length && !modelos.includes(MODELO)) {
        resultado.motivo = `O modelo "${MODELO}" não está disponível na Groq. Ajuste CHATBOT_MODELO.`;
        return resultado;
      }

      resultado.ok = true;
      return resultado;
    } catch (erro) {
      resultado.ms_ia = Date.now() - inicio;
      resultado.motivo = erro && erro.name === 'TimeoutError'
        ? 'A Groq demorou demais para responder.'
        : 'Não foi possível conectar à Groq.';
      return resultado;
    }
  }

  app.get('/api/admin/chatbot/teste', auth, async (req, res) => {
    if (req.user.role !== 'adm') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    if (!ultimoTeste || Date.now() - ultimoTeste.em > 60000 || req.query.novo) {
      ultimoTeste = { em: Date.now(), resultado: await testarNix() };
    }

    res.json({ ...ultimoTeste.resultado, testado_em: new Date(ultimoTeste.em).toISOString() });
  });

  app.post('/api/chatbot', auth, async (req, res) => {
    if (!ativo()) {
      return res.status(503).json({ error: 'O Nix (assistente com IA) ainda não foi configurado.' });
    }

    const pergunta = String(req.body?.pergunta || '').trim();

    if (!pergunta) {
      return res.status(400).json({ error: 'Digite uma pergunta.' });
    }

    if (pergunta.length > MAX_PERGUNTA) {
      return res.status(400).json({ error: `A pergunta deve ter até ${MAX_PERGUNTA} caracteres.` });
    }

    const historico = saneamentoHistorico(req.body?.historico);

    // Resposta já guardada não usa a IA: não conta no limite por minuto
    const chave = historico.length ? null : chaveCache(pergunta);
    const pronto = chave && lerCache(chave);

    if (!pronto && excedeuLimite(req.user.id)) {
      return res.status(429).json({ error: 'Muitas perguntas em pouco tempo. Aguarde um instante.' });
    }

    // NDJSON: uma linha JSON por evento. "no-transform" evita que a
    // compressão segure o texto até o fim (ele precisa chegar aos poucos).
    res.status(200);
    res.set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const enviar = evento => res.write(JSON.stringify(evento) + '\n');

    const controle = new AbortController();
    const tempo = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
    res.on('close', () => { if (!res.writableEnded) controle.abort(); });

    try {
      if (pronto) {
        enviar({ tipo: 'texto', conteudo: pronto.resposta });
        enviar({ tipo: 'fim', ...pronto, cache: true });
        return res.end();
      }

      const consultas = [pergunta];
      const reescrita = REESCREVER ? await reescreverConsulta(pergunta, historico) : null;

      if (reescrita) {
        consultas.push(reescrita);
      } else if (historico.length) {
        const anterior = historico.filter(m => m.role === 'user').pop();
        if (anterior) consultas.push(`${anterior.content} ${pergunta}`);
      }

      const encontrados = indice.buscar(consultas);

      const contexto = encontrados
        .map((t, i) => `[${i + 1}] (${t.trilha} › ${t.modulo} › ${t.secao})\n${t.texto}`)
        .join('\n\n');

      const resposta = await chamarGroq({
        model: MODELO,
        temperature: 0.3,
        stream: true,
        messages: [
          { role: 'system', content: SISTEMA },
          ...historico,
          {
            role: 'user',
            content: `Trechos do material das trilhas:\n${contexto || '(nenhum trecho encontrado)'}\n\n---\nPergunta do aluno: ${pergunta}` +
              (pareceExercicio(pergunta)
                ? '\n\n(ATENÇÃO: isto parece uma questão de exercício ou desafio. NÃO diga a alternativa correta, se é V ou F, a ordem, os pares nem o resultado final. Explique o conceito, dê uma dica do raciocínio e um exemplo parecido com outros números.)'
                : '') +
              (pedeConselho(pergunta)
                ? '\n\n(ATENÇÃO: o aluno pediu conselho de investimento ou sobre uma operação bancária real. Diga claramente que você não pode dar esse tipo de conselho nem indicar onde investir, banco, produto ou se ele deve fazer a operação; a decisão é pessoal e deve ser tomada com um responsável ou profissional habilitado. Depois ensine os conceitos envolvidos pelo conteúdo das trilhas.)'
                : '') +
              (pedeInternet(pergunta)
                ? '\n\n(ATENÇÃO: o aluno pediu algo da internet ou em tempo real. Diga claramente que você não faz pesquisas na internet e use só o conteúdo das trilhas.)'
                : '')
          }
        ],
        ...opcoesModelo(MODELO, 'medium')
      }, controle.signal);

      let completo = '';
      let enviado = 0;

      for await (const pedaco of lerStream(resposta)) {
        completo += pedaco;
        // não manda a linha de sugestões ("@@...") nem um "@" que pode começá-la
        const pos = completo.indexOf('@@');
        const limite = pos >= 0 ? pos : completo.length - (completo.endsWith('@') ? 1 : 0);
        if (limite > enviado) {
          enviar({ tipo: 'texto', conteudo: completo.slice(enviado, limite) });
          enviado = limite;
        }
      }

      const { texto, sugestoes } = separarSugestoes(completo);
      const { texto: semCitacoes, citados } = extrairCitacoes(texto, encontrados.length);
      const fontes = await formatarFontes([...citados].sort((a, b) => a - b).map(i => encontrados[i]));

      // Garante o aviso final (IA pode errar + revisar a trilha + fórum),
      // mesmo que a IA tenha esquecido de escrever
      const aviso = semCitacoes && !temAviso(semCitacoes) && semCitacoes.length > 160
        ? avisoPadrao(fontes[0])
        : '';

      if (aviso) enviar({ tipo: 'texto', conteudo: '\n\n' + aviso });

      const final = aviso ? `${semCitacoes}\n\n${aviso}` : semCitacoes;

      const resultado = {
        resposta: final,
        fontes,
        sugestoes
      };

      if (chave && final) gravarCache(chave, resultado);

      enviar({ tipo: 'fim', ...resultado, cache: false });
      res.end();
    } catch (erro) {
      console.error('[CHATBOT] Erro ao responder:', erro.message);
      if (!res.writableEnded) {
        enviar({ tipo: 'erro', mensagem: mensagemErro(erro) });
        res.end();
      }
    } finally {
      clearTimeout(tempo);
    }
  });
}

module.exports = {
  registrarChatbot,
  // exportados para testes
  _interno: { tokenizar, criarIndice, extrairCitacoes, separarSugestoes, carregarBase, pareceExercicio, pedeInternet, pedeConselho, temAviso, avisoPadrao }
};
