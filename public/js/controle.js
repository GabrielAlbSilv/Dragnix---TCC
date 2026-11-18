/* ============================================================
   DRAGNIX — js/controle.js  (PÁGINA CONTROLE FINANCEIRO)
   ============================================================

   COMO PROCURAR: use Ctrl+F e digite o código entre colchetes.

   [CF-CONFIG]       ajustes (ÚNICO lugar para ligar na API de lançamentos)
   [CF-UTIL]         formatação de moeda/data e leitura de números
   [CF-DADOS]        carregar lançamentos (+ dados de exemplo quando não há nenhum)
   [CF-ESTADO]       período selecionado (ano / mês / dia) e filtros
   [CF-GRAFICO-LINHA] gráfico de linhas genérico (SVG, com tooltip e clique)
   [CF-GRAFICO-PIZZA] gráfico de pizza (SVG)
   [CF-RESUMO]       saldo, receitas, gastos e indicador
   [CF-LINHA]        Receita x Gastos com drill down ano > mês > dia
   [CF-PIZZA]        gastos por despesa, filtros de mês e dia
   [CF-HISTORICO]    lista de lançamentos (com botão de excluir)
   [CF-NOVO-LANCAMENTO] formulário "Novo lançamento" (POST /finance) e exclusão (DELETE /finance/:id)
   [CF-CALENDARIO]   pesquisa por data (calendário que abre e fecha)
   [CF-SIMULADOR]    juros compostos
   [CF-RESERVA]      reserva de emergência
   [CF-REGRA]        regra 50/30/20
   [CF-ROTAS]        abas / submenu (#gastos #simulador #reserva #regra)
   ============================================================ */

(() => {
    'use strict';


    /* ============================================================
       [CF-CONFIG] — AJUSTES
       Os lançamentos ficam hoje no navegador (localStorage) na chave abaixo.
       Para usar o servidor, troque SÓ a função Dados.carregar() (mais abaixo).
       Formato de cada lançamento:
         { id, tipo: 'receita' | 'despesa', titulo, valor, data: 'AAAA-MM-DD', hora: 'HH:MM' }
       ============================================================ */

    const CFG = {
        chaveLancamentos: id => `dragnix:lancamentos:${id}`,
        chaveFerramentas: id => `dragnix:cf-ferramentas:${id}`,
        itensPorPagina: 8,
        maxMesesSimulador: 1200
    };


    /* ============================================================
       [CF-UTIL] — FORMATAÇÃO E LEITURA
       ============================================================ */

    const $  = (seletor, raiz = document) => raiz.querySelector(seletor);
    const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

    const H = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    const FMT_BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const FMT_BRL_INT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    const FMT_NUM = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const brl = n => FMT_BRL.format(n || 0);
    const pad = n => String(n).padStart(2, '0');
    const isoData = (a, m, d) => `${a}-${pad(m + 1)}-${pad(d)}`;
    const diasNoMes = (a, m) => new Date(a, m + 1, 0).getDate();
    const fmtData = iso => iso.split('-').reverse().join('/');
    const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1);

    /* "1.234,56" | "1234,56" | "1234.56" | "R$ 50" → número (vazio/inválido = 0) */
    function lerNumero(texto) {
        let t = String(texto ?? '').replace(/[R$\s]/g, '');
        if (!t) return 0;
        if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
        else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
        const n = parseFloat(t);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    /* 12500 → "12,5 mil" (eixo dos gráficos) */
    function abreviar(v) {
        if (v >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
        if (v >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
        return String(Math.round(v));
    }

    const usuarioId = () => {
        try {
            const u = typeof me === 'function' ? me() : JSON.parse(localStorage.getItem('user') || 'null');
            return u?.id ?? u?.email ?? 'local';
        } catch { return 'local'; }
    };

    const lerJson = (chave, padrao) => {
        try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
    };

    const gravarJson = (chave, valor) => {
        try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* armazenamento indisponível: ignora */ }
    };

    /* ícone (emoji) do lançamento, pelo nome da despesa */
    const ICONES_NOME = [
        [/sal[aá]rio|freela|renda|rendimento|dividendo|bônus|bonus|13º/i, '💰'],
        [/aluguel|condom[ií]nio|moradia|iptu/i, '🏠'],
        [/mercado|supermerc|feira|padaria|hortifruti/i, '🛒'],
        [/uber|99|[ôo]nibus|transporte|combust|gasolina|metr[oô]|estaciona/i, '🚌'],
        [/internet|luz|energia|[áa]gua|telefone|celular|g[áa]s/i, '💡'],
        [/netflix|stream|spotify|cinema|lazer|jogo|show|viagem/i, '🎬'],
        [/restaurante|lanche|ifood|pizza|caf[eé]|bar\b/i, '🍽️'],
        [/farm[áa]cia|m[eé]dic|sa[uú]de|consulta|dentista/i, '💊'],
        [/academia|esporte|treino/i, '🏋️'],
        [/curso|escola|faculdade|livro|mensalidade/i, '📚']
    ];

    const iconeDe = l => {
        const achou = ICONES_NOME.find(([re]) => re.test(l.titulo));
        return achou ? achou[1] : (l.tipo === 'receita' ? '💰' : '💸');
    };


    /* ============================================================
       [CF-DADOS] — LANÇAMENTOS
       ============================================================ */

    function normalizarLancamento(l) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(l?.data ?? ''));
        const valor = Math.abs(Number(l?.valor));
        if (!m || !Number.isFinite(valor)) return null;
        const tipo = l.tipo === 'receita' || l.tipo === 'ganho' ? 'receita' : 'despesa';
        return {
            id: l.id ?? `${l.data}-${l.titulo}-${valor}`,
            tipo,
            categoria: l.categoria || '',
            titulo: String(l.titulo ?? (tipo === 'receita' ? 'Receita' : 'Despesa')).trim() || 'Sem título',
            valor,
            data: `${m[1]}-${m[2]}-${m[3]}`,
            hora: /^\d{2}:\d{2}/.test(l.hora ?? '') ? l.hora.slice(0, 5) : '00:00',
            a: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3])
        };
    }

    /* dados de exemplo (sempre iguais): só aparecem quando não existe nenhum lançamento salvo */
    function gerarExemplo() {
        const hoje = new Date();
        const lista = [];
        let semente = 7, id = 1;
        const aleatorio = () => (semente = (semente * 16807) % 2147483647) / 2147483647;

        for (let k = 5; k >= 0; k--) {
            const ref = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
            const a = ref.getFullYear(), m = ref.getMonth();
            const ultimo = k === 0 ? hoje.getDate() : diasNoMes(a, m);
            const add = (tipo, titulo, valor, dia, hora) => {
                if (dia <= ultimo) lista.push({ id: id++, tipo, titulo, valor: Math.round(valor * 100) / 100, data: isoData(a, m, dia), hora });
            };

            add('receita', 'Salário', 4200, 5, '09:00');
            if (k % 2 === 0) add('receita', 'Freelance', 600 + Math.round(aleatorio() * 400), 18, '16:20');
            add('despesa', 'Aluguel', 1200, 10, '08:30');
            add('despesa', 'Internet', 99.9, 12, '10:15');
            add('despesa', 'Streaming', 39.9, 14, '20:05');
            add('despesa', 'Academia', 110, 6, '07:10');
            [3, 9, 16, 23, 28].forEach(d => add('despesa', 'Mercado', 150 + Math.round(aleatorio() * 120), d, '18:40'));
            [4, 11, 20, 26].forEach(d => add('despesa', 'Transporte', 20 + Math.round(aleatorio() * 50), d, '08:10'));
            [8, 15, 22].forEach(d => add('despesa', 'Restaurante', 45 + Math.round(aleatorio() * 70), d, '20:30'));
            add('despesa', 'Farmácia', 35 + Math.round(aleatorio() * 60), 17, '12:00');
            add('despesa', 'Lazer', 60 + Math.round(aleatorio() * 120), 27, '21:00');
        }
        return lista;
    }


    /* [CF-CATEGORIAS] mesmas categorias do app.js */
    const CATS = {
        gasto: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Contas', 'Dívidas', 'Outros'],
        receita: ['Salário', 'Renda extra', 'Investimentos', 'Outros']
    };

    const Dados = {
        exemplo: false,
        local: false,          /* true quando o servidor não respondeu: grava só neste navegador */

        /* [CF-API] lê os lançamentos reais do servidor (GET /finance?month=AAAA-MM, igual ao app.js).
           Busca os últimos 12 meses. Se o servidor falhar ou não existir, usa localStorage / exemplo. */
        async carregar() {
            if (typeof window.api === 'function') {
                try {
                    const h = new Date();
                    const meses = [];
                    for (let k = 11; k >= 0; k--) {
                        const r = new Date(h.getFullYear(), h.getMonth() - k, 1);
                        meses.push(`${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}`);
                    }
                    /* uma chamada para os 12 meses; servidor antigo (sem "from") => um mês por vez */
                    const periodo = await window.api(`/finance?from=${meses[0]}&to=${meses[meses.length - 1]}`);
                    const respostas = periodo && periodo.from
                        ? [periodo]
                        : await Promise.all(meses.map(m => window.api('/finance?month=' + m)));
                    const lista = respostas
                        .flatMap(r => (r && Array.isArray(r.entries)) ? r.entries : [])
                        .map(e => normalizarLancamento({
                            id: e.id,
                            tipo: e.kind === 'receita' ? 'receita' : 'despesa',   /* servidor usa "gasto" */
                            titulo: e.description || e.category,
                            categoria: e.category,
                            valor: e.amount,
                            data: String(e.day || '').slice(0, 10),
                            hora: String(e.day || '').slice(11, 16)
                        }))
                        .filter(Boolean);
                    this.exemplo = false;
                    return lista;
                } catch { /* cai para o modo local abaixo */ }
            }
            this.local = true;
            const salvo = lerJson(CFG.chaveLancamentos(usuarioId()), null);
            const lista = Array.isArray(salvo) ? salvo.map(normalizarLancamento).filter(Boolean) : [];
            this.exemplo = lista.length === 0;
            return this.exemplo ? gerarExemplo().map(normalizarLancamento) : lista;
        },
        /* [CF-API] POST /finance  { kind, category, description, amount, day }  (igual ao addLanc do app.js) */
        async salvar({ tipo, categoria, descricao, valor, dia }) {
            if (typeof window.api === 'function' && !this.local) {
                await window.api('/finance', 'POST', {
                    kind: tipo, category: categoria, description: descricao, amount: valor, day: dia
                });
                return;
            }
            const chave = CFG.chaveLancamentos(usuarioId());
            const lista = lerJson(chave, []);
            lista.push({
                id: Date.now(), tipo: tipo === 'receita' ? 'receita' : 'despesa', categoria,
                titulo: descricao || categoria, valor, data: dia,
                hora: new Date().toTimeString().slice(0, 5)
            });
            gravarJson(chave, lista);
        },

        /* [CF-API] DELETE /finance/:id */
        async excluir(id) {
            if (typeof window.api === 'function' && !this.local) {
                await window.api('/finance/' + id, 'DELETE');
                return;
            }
            const chave = CFG.chaveLancamentos(usuarioId());
            gravarJson(chave, lerJson(chave, []).filter(l => String(l.id) !== String(id)));
        }
    };


    /* ============================================================
       [CF-ESTADO] — PERÍODO SELECIONADO
       ano / mes / dia  → valem para saldo, gráfico de linhas, pizza e histórico
       dataFiltro       → só o histórico (calendário "Pesquisa por data")
       ============================================================ */

    const hoje = new Date();

    const estado = {
        lanc: [],
        datasComLanc: new Set(),
        ano: hoje.getFullYear(),
        mes: hoje.getMonth(),
        dia: null,
        nivel: 'ano',                     // nível do gráfico de linhas: 'ano' (12 meses) | 'mes' (dias)
        mesEscolhido: false,              // true quando o mês inteiro foi escolhido no calendário
        intervalo: null,                  // { de:'AAAA-MM-DD', ate:'AAAA-MM-DD' } ou null (calendário, modo Intervalo)
        dataFiltro: null,                 // 'AAAA-MM-DD' ou null
        limite: CFG.itensPorPagina,
        tabela: false
    };

    const doPeriodo = (a, m, d) => estado.lanc.filter(l =>
        l.a === a && (m == null || l.m === m) && (d == null || l.d === d));

    const somar = (lista, tipo) => lista.reduce((s, l) => s + (l.tipo === tipo ? l.valor : 0), 0);

    const noIntervalo = (de, ate) => estado.lanc.filter(l => l.data >= de && l.data <= ate);

    const periodoAtual = () => estado.intervalo
        ? noIntervalo(estado.intervalo.de, estado.intervalo.ate)
        : doPeriodo(estado.ano, estado.mes, estado.dia);

    const rotuloPeriodo = () => estado.intervalo
        ? `${fmtData(estado.intervalo.de)} a ${fmtData(estado.intervalo.ate)}`
        : estado.dia
        ? `${pad(estado.dia)} de ${MESES[estado.mes]} de ${estado.ano}`
        : `${MESES[estado.mes]} de ${estado.ano}`;


    /* ============================================================
       [CF-GRAFICO-LINHA] — GRÁFICO DE LINHAS (SVG)
       opções: { labels[], a[], b[], nomeA, nomeB, sel, onSelect(i), titulo(i), extra(i), xLabel(i), aria }
       ============================================================ */

    function escala(max) {
        const bruto = max / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
        const passo = [1, 2, 2.5, 5, 10].map(f => f * mag).find(p => p >= bruto);
        return { passo, teto: Math.ceil(max / passo) * passo };
    }

    function mostrarTip(host, tip, x, y, html) {
        tip.innerHTML = html;
        tip.hidden = false;
        const w = tip.offsetWidth;
        tip.style.left = Math.min(Math.max(x, w / 2), host.clientWidth - w / 2) + 'px';
        tip.style.top = Math.max(y, tip.offsetHeight + 4) + 'px';
    }

    function desenharLinhas(host, o) {
        const n = o.labels.length;
        const max = Math.max(0, ...o.a, ...o.b);

        if (!n || max <= 0) {
            host.innerHTML = `<div class="cf-vazio">${H(o.vazio || 'Sem lançamentos neste período.')}</div>`;
            return;
        }

        const W = 640, Ht = 300, mg = { l: 56, r: 14, t: 16, b: 30 };
        const pw = W - mg.l - mg.r, ph = Ht - mg.t - mg.b;
        const { passo, teto } = escala(max);
        const x = i => mg.l + pw * (i + .5) / n;
        const y = v => mg.t + ph - (v / teto) * ph;
        const larg = pw / n;
        const raio = n > 16 ? 2.6 : 3.8;
        const passoX = n > 24 ? 3 : n > 12 ? 2 : 1;
        const clicavel = typeof o.onSelect === 'function';
        const foco = o.sel >= 0 && o.sel < n ? o.sel : 0;

        let grade = '';
        for (let v = 0; v <= teto + 1e-9; v += passo) {
            grade += `<line class="${v === 0 ? 'cf-base' : 'cf-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${y(v)}" y2="${y(v)}"/>
                      <text class="cf-eixo" x="${mg.l - 8}" y="${y(v) + 4}" text-anchor="end">${abreviar(v)}</text>`;
        }

        const pontos = serie => o[serie].map((v, i) => `${x(i)},${y(v)}`).join(' ');
        const marcas =
            o.a.map((v, i) => `<circle class="cf-pt--a" cx="${x(i)}" cy="${y(v)}" r="${raio}"/>`).join('') +
            o.b.map((v, i) => `<rect class="cf-pt--b" x="${x(i) - raio}" y="${y(v) - raio}" width="${raio * 2}" height="${raio * 2}" rx="1"/>`).join('');

        const colunas = o.labels.map((_, i) => {
            const rotulo = `${o.titulo(i)}: ${o.nomeA} ${brl(o.a[i])}, ${o.nomeB} ${brl(o.b[i])}`;
            return `<g class="cf-coluna${i === o.sel ? ' is-sel' : ''}" data-i="${i}">
                        <line class="cf-guia" x1="${x(i)}" x2="${x(i)}" y1="${mg.t}" y2="${mg.t + ph}"/>
                        ${i % passoX === 0 ? `<text class="cf-eixo cf-eixo-x" x="${x(i)}" y="${Ht - 8}" text-anchor="middle">${H(o.xLabel(i))}</text>` : ''}
                        <rect class="cf-hit${clicavel ? ' is-clicavel' : ''}" x="${x(i) - larg / 2}" y="${mg.t}" width="${larg}" height="${ph}"
                              tabindex="${i === foco ? 0 : -1}" role="${clicavel ? 'button' : 'img'}"
                              aria-label="${H(rotulo)}${clicavel ? '. Pressione Enter para detalhar' : ''}"/>
                    </g>`;
        }).join('');

        host.innerHTML = `
            <svg class="cf-svg" viewBox="0 0 ${W} ${Ht}" role="group" aria-label="${H(o.aria)}">
                ${grade}
                <polyline class="cf-serie cf-serie--a" points="${pontos('a')}"/>
                <polyline class="cf-serie cf-serie--b" points="${pontos('b')}"/>
                ${marcas}
                ${colunas}
            </svg>
            <div class="cf-tip" hidden></div>`;

        const svg = $('svg', host);
        const tip = $('.cf-tip', host);

        const mostrar = i => {
            const r = svg.getBoundingClientRect();
            const topo = Math.min(y(o.a[i]), y(o.b[i]));
            mostrarTip(host, tip, x(i) / W * r.width, topo / Ht * r.height - 10, `
                <b>${H(o.titulo(i))}</b>
                <span><span>${H(o.nomeA)}</span><span>${brl(o.a[i])}</span></span>
                <span><span>${H(o.nomeB)}</span><span>${brl(o.b[i])}</span></span>
                ${o.extra ? `<span><span>${H(o.extra.nome)}</span><span>${brl(o.extra.valor(i))}</span></span>` : ''}
                ${clicavel ? `<em>${H(o.dicaClique || 'Clique para detalhar')}</em>` : ''}`);
        };

        const indice = e => {
            const col = e.target.closest('.cf-coluna');
            return col ? Number(col.dataset.i) : null;
        };

        svg.addEventListener('mouseover', e => { const i = indice(e); if (i !== null) mostrar(i); });
        svg.addEventListener('focusin',   e => { const i = indice(e); if (i !== null) mostrar(i); });
        svg.addEventListener('mouseleave', () => { tip.hidden = true; });
        svg.addEventListener('focusout',   () => { tip.hidden = true; });

        if (clicavel) {
            svg.addEventListener('click', e => { const i = indice(e); if (i !== null) o.onSelect(i); });
        }

        /* teclado: setas andam entre os pontos, Enter/Espaço escolhem */
        svg.addEventListener('keydown', e => {
            const i = indice(e);
            if (i === null) return;
            const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
            if (destino !== undefined) {
                e.preventDefault();
                const alvo = $$('.cf-hit', svg)[Math.min(Math.max(destino, 0), n - 1)];
                $$('.cf-hit', svg).forEach(h => h.tabIndex = -1);
                alvo.tabIndex = 0;
                alvo.focus();
            } else if (clicavel && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                o.onSelect(i);
            }
        });
    }


    /* ============================================================
       [CF-GRAFICO-PIZZA] — GRÁFICO DE PIZZA (SVG, com furo no meio)
       ============================================================ */

    function caminhoFatia(cx, cy, R, r, a1, a2) {
        if (a2 - a1 >= Math.PI * 2 - 1e-6) {  // fatia única = anel inteiro
            return `M${cx - R},${cy} a${R},${R} 0 1,0 ${2 * R},0 a${R},${R} 0 1,0 ${-2 * R},0 Z
                    M${cx - r},${cy} a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 ${-2 * r},0 Z`;
        }
        const p = (raio, ang) => [cx + raio * Math.cos(ang), cy + raio * Math.sin(ang)].map(v => v.toFixed(2));
        const [x1, y1] = p(R, a1), [x2, y2] = p(R, a2), [x3, y3] = p(r, a2), [x4, y4] = p(r, a1);
        const grande = a2 - a1 > Math.PI ? 1 : 0;
        return `M${x1},${y1} A${R},${R} 0 ${grande} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${grande} 0 ${x4},${y4} Z`;
    }

    /* fatias: [{ nome, total, qtd, cor }] */
    function desenharPizza(host, lista, fatias, total) {
        let ang = -Math.PI / 2;
        const caminhos = fatias.map((f, i) => {
            const a2 = ang + (f.total / total) * Math.PI * 2;
            const d = caminhoFatia(100, 100, 92, 58, ang, a2);
            ang = a2;
            return `<path class="cf-fatia" data-i="${i}" d="${d}" fill="${f.cor}" fill-rule="evenodd"/>`;
        }).join('');

        host.innerHTML = `
            <svg class="cf-svg" viewBox="0 0 200 200" role="img"
                 aria-label="Gráfico de pizza com ${fatias.length} grupos de despesa. Total ${brl(total)}. Os detalhes estão na lista abaixo.">
                ${caminhos}
                <text class="cf-pizza-centro cf-pizza-centro--rot" x="100" y="96">Total</text>
                <text class="cf-pizza-centro cf-pizza-centro--val" x="100" y="114">${total >= 10000 ? FMT_BRL_INT.format(total) : brl(total)}</text>
            </svg>
            <div class="cf-tip" hidden></div>`;

        lista.innerHTML = fatias.map((f, i) => `
            <li class="cf-pizza__item" data-i="${i}">
                <i class="cf-pizza__cor" style="background:${f.cor}" aria-hidden="true"></i>
                <span class="cf-pizza__nome">${H(f.nome)}<small>×${f.qtd}</small></span>
                <b>${brl(f.total)}</b>
                <span class="cf-pizza__pct">${(f.total / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>
            </li>`).join('');

        const tip = $('.cf-tip', host);
        const destacar = i => {
            $$('.cf-fatia', host).forEach(p => p.classList.toggle('is-dim', i !== null && Number(p.dataset.i) !== i));
            $$('.cf-pizza__item', lista).forEach(li => li.classList.toggle('is-ativo', i !== null && Number(li.dataset.i) === i));
        };

        const info = i => {
            const f = fatias[i];
            return `<b>${H(f.nome)}</b>
                    <span><span>Total</span><span>${brl(f.total)}</span></span>
                    <span><span>Lançamentos</span><span>${f.qtd}</span></span>
                    <span><span>Parte do total</span><span>${(f.total / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></span>`;
        };

        host.addEventListener('mousemove', e => {
            const p = e.target.closest('.cf-fatia');
            if (!p) { tip.hidden = true; destacar(null); return; }
            const i = Number(p.dataset.i);
            const r = host.getBoundingClientRect();
            destacar(i);
            mostrarTip(host, tip, e.clientX - r.left, e.clientY - r.top - 12, info(i));
        });
        host.addEventListener('mouseleave', () => { tip.hidden = true; destacar(null); });

        lista.onmouseover = e => { const li = e.target.closest('.cf-pizza__item'); if (li) destacar(Number(li.dataset.i)); };
        lista.onmouseleave = () => destacar(null);
    }


    /* ============================================================
       [CF-RESUMO] — SALDO, RECEITAS E GASTOS
       ============================================================ */

    function periodoAnterior() {
        if (estado.intervalo) {                 /* mesmo número de dias, logo antes do intervalo */
            const ini = new Date(estado.intervalo.de + 'T00:00:00'), fim = new Date(estado.intervalo.ate + 'T00:00:00');
            const dias = Math.round((fim - ini) / 86400000) + 1;
            const f = new Date(ini); f.setDate(f.getDate() - 1);
            const i = new Date(f); i.setDate(i.getDate() - dias + 1);
            const iso = d => isoData(d.getFullYear(), d.getMonth(), d.getDate());
            return { lista: noIntervalo(iso(i), iso(f)), rotulo: 'período anterior' };
        }
        if (estado.dia) {
            const d = new Date(estado.ano, estado.mes, estado.dia - 1);
            return { a: d.getFullYear(), m: d.getMonth(), d: d.getDate(), rotulo: 'dia anterior' };
        }
        const d = new Date(estado.ano, estado.mes - 1, 1);
        return { a: d.getFullYear(), m: d.getMonth(), d: null, rotulo: 'mês anterior' };
    }

    function renderResumo() {
        const lista = periodoAtual();
        const rec = somar(lista, 'receita');
        const gas = somar(lista, 'despesa');
        const saldo = rec - gas;

        $('#cfSaldo').textContent = brl(saldo);
        $('#cfReceita').textContent = brl(rec);
        $('#cfGasto').textContent = brl(gas);

        /* indicador: saldo do período x período anterior */
        const ant = periodoAnterior();
        const listaAnt = ant.lista || doPeriodo(ant.a, ant.m, ant.d);
        const ind = $('#cfIndicador');

        if (!listaAnt.length) {
            ind.className = 'cf-indicador';
            ind.textContent = '';
        } else {
            const saldoAnt = somar(listaAnt, 'receita') - somar(listaAnt, 'despesa');
            const delta = saldo - saldoAnt;
            const subiu = delta >= 0;
            const variacao = saldoAnt !== 0
                ? `${subiu ? '+' : '−'}${Math.abs(delta / Math.abs(saldoAnt) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
                : `${subiu ? '+' : '−'}${brl(Math.abs(delta))}`;
            ind.className = `cf-indicador ${subiu ? 'is-pos' : 'is-neg'}`;
            ind.innerHTML = `<svg class="cf-ico" aria-hidden="true"><use href="#cf-i-${subiu ? 'up' : 'down'}"/></svg>
                             <span>${variacao} <small>vs ${ant.rotulo}</small></span>`;
            ind.setAttribute('aria-label', `Saldo ${subiu ? 'maior' : 'menor'} que no ${ant.rotulo}: ${variacao}`);
        }
    }


    /* ============================================================
       [CF-LINHA] — RECEITA x GASTOS (drill down ano > mês > dia)
       ============================================================ */

    /* [CF-LINHA-INTERVALO] eixo do gráfico quando há um intervalo de datas:
       até 62 dias → um ponto por dia; acima disso → um ponto por mês */
    function eixoIntervalo() {
        const ini = new Date(estado.intervalo.de + 'T00:00:00'), fim = new Date(estado.intervalo.ate + 'T00:00:00');
        const dias = Math.round((fim - ini) / 86400000) + 1;
        const porDia = dias <= 62;
        const chaves = [];
        if (porDia) {
            for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) chaves.push(isoData(d.getFullYear(), d.getMonth(), d.getDate()));
        } else {
            for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d <= fim; d.setMonth(d.getMonth() + 1)) chaves.push(isoData(d.getFullYear(), d.getMonth(), 1).slice(0, 7));
        }
        const a = Array(chaves.length).fill(0), b = Array(chaves.length).fill(0);
        noIntervalo(estado.intervalo.de, estado.intervalo.ate).forEach(l => {
            const i = chaves.indexOf(porDia ? l.data : l.data.slice(0, 7));
            if (i >= 0) (l.tipo === 'receita' ? a : b)[i] += l.valor;
        });
        return { porDia, chaves, a, b };
    }

    function renderLinhaIntervalo() {
        const host = $('#cfLinha');
        const { porDia, chaves, a, b } = eixoIntervalo();
        const rotuloX = i => porDia ? `${chaves[i].slice(8)}/${chaves[i].slice(5, 7)}` : MESES_CURTOS[Number(chaves[i].slice(5)) - 1];
        const tituloX = i => porDia ? fmtData(chaves[i]) : `${maiuscula(MESES[Number(chaves[i].slice(5)) - 1])} de ${chaves[i].slice(0, 4)}`;

        $('#cfMigalhas').innerHTML = `<button type="button" aria-current="true">Intervalo: ${H(rotuloPeriodo())}</button>`;
        $('#cfLinhaDica').textContent = porDia
            ? 'Clique em um dia para ver só ele.'
            : 'Clique em um mês para ver só ele.';

        const tabela = $('#cfLinhaTabela');
        tabela.hidden = !estado.tabela;
        host.hidden = estado.tabela;
        $('#cfTabelaBtn').setAttribute('aria-pressed', String(estado.tabela));
        $('#cfTabelaBtn').textContent = estado.tabela ? 'Ver gráfico' : 'Ver tabela';

        if (estado.tabela) {
            tabela.innerHTML = `<table class="cf-tabela">
                <thead><tr><th scope="col">${porDia ? 'Dia' : 'Mês'}</th><th scope="col">Receita</th><th scope="col">Gastos</th><th scope="col">Saldo</th></tr></thead>
                <tbody>${a.map((_, i) => `<tr><th scope="row">${H(tituloX(i))}</th><td>${brl(a[i])}</td><td>${brl(b[i])}</td><td>${brl(a[i] - b[i])}</td></tr>`).join('')}</tbody>
            </table>`;
            return;
        }

        desenharLinhas(host, {
            labels: a.map((_, i) => i), a, b,
            nomeA: 'Receita', nomeB: 'Gastos',
            sel: -1,
            titulo: tituloX,
            xLabel: rotuloX,
            extra: { nome: 'Saldo', valor: i => a[i] - b[i] },
            dicaClique: porDia ? 'Clique para ver só este dia' : 'Clique para ver só este mês',
            aria: `Receita e gastos de ${rotuloPeriodo()}`,
            vazio: `Sem lançamentos em ${rotuloPeriodo()}.`,
            onSelect: i => {
                const [ca, cm, cd] = chaves[i].split('-').map(Number);
                estado.intervalo = null;
                estado.ano = ca; estado.mes = cm - 1;
                estado.dia = porDia ? cd : null;
                estado.nivel = 'mes';
                renderGastos();
            }
        });
    }

    function renderLinha() {
        if (estado.intervalo) return renderLinhaIntervalo();
        const host = $('#cfLinha');
        const noAno = estado.nivel === 'ano';
        const n = noAno ? 12 : diasNoMes(estado.ano, estado.mes);

        const a = Array(n).fill(0), b = Array(n).fill(0);
        doPeriodo(estado.ano, noAno ? null : estado.mes, null).forEach(l => {
            (l.tipo === 'receita' ? a : b)[noAno ? l.m : l.d - 1] += l.valor;
        });

        const titulo = i => noAno
            ? `${maiuscula(MESES[i])} de ${estado.ano}`
            : `${pad(i + 1)}/${pad(estado.mes + 1)}/${estado.ano}`;

        /* migalhas: 2026 › Novembro › 05 */
        const mig = [];
        if (noAno) {
            mig.push(`<button class="cf-seta" type="button" data-ano="-1" aria-label="Ano anterior"><svg class="cf-ico" aria-hidden="true"><use href="#cf-i-left"/></svg></button>`);
            mig.push(`<button type="button" aria-current="true">${estado.ano}</button>`);
            mig.push(`<button class="cf-seta" type="button" data-ano="1" aria-label="Próximo ano"><svg class="cf-ico" aria-hidden="true"><use href="#cf-i-right"/></svg></button>`);
        } else {
            mig.push(`<button type="button" data-nv="ano">${estado.ano}</button><span aria-hidden="true">›</span>`);
            mig.push(`<button type="button" data-nv="mes"${estado.dia ? '' : ' aria-current="true"'}>${maiuscula(MESES[estado.mes])}</button>`);
            if (estado.dia) mig.push(`<span aria-hidden="true">›</span><button type="button" aria-current="true">${pad(estado.dia)}</button>`);
        }
        $('#cfMigalhas').innerHTML = mig.join('');

        $('#cfLinhaDica').textContent = noAno
            ? 'Clique em um mês para ver os dias.'
            : 'Clique em um dia para filtrar o saldo e a pizza. Clique de novo para limpar.';

        const sel = noAno ? estado.mes : (estado.dia ? estado.dia - 1 : -1);

        /* tabela alternativa */
        const tabela = $('#cfLinhaTabela');
        tabela.hidden = !estado.tabela;
        host.hidden = estado.tabela;
        $('#cfTabelaBtn').setAttribute('aria-pressed', String(estado.tabela));
        $('#cfTabelaBtn').textContent = estado.tabela ? 'Ver gráfico' : 'Ver tabela';

        if (estado.tabela) {
            tabela.innerHTML = `<table class="cf-tabela">
                <thead><tr><th scope="col">${noAno ? 'Mês' : 'Dia'}</th><th scope="col">Receita</th><th scope="col">Gastos</th><th scope="col">Saldo</th></tr></thead>
                <tbody>${a.map((_, i) => `<tr><th scope="row">${H(noAno ? MESES_CURTOS[i] : pad(i + 1))}</th><td>${brl(a[i])}</td><td>${brl(b[i])}</td><td>${brl(a[i] - b[i])}</td></tr>`).join('')}</tbody>
            </table>`;
            return;
        }

        desenharLinhas(host, {
            labels: a.map((_, i) => i),
            a, b,
            nomeA: 'Receita', nomeB: 'Gastos',
            sel,
            titulo,
            xLabel: i => noAno ? MESES_CURTOS[i] : String(i + 1),
            extra: { nome: 'Saldo', valor: i => a[i] - b[i] },
            dicaClique: noAno ? 'Clique para ver os dias' : 'Clique para filtrar este dia',
            aria: noAno
                ? `Receita e gastos por mês em ${estado.ano}`
                : `Receita e gastos por dia em ${MESES[estado.mes]} de ${estado.ano}`,
            vazio: noAno ? `Sem lançamentos em ${estado.ano}.` : `Sem lançamentos em ${MESES[estado.mes]} de ${estado.ano}.`,
            onSelect: i => {
                if (noAno) {
                    estado.mes = i;
                    estado.dia = null;
                    estado.nivel = 'mes';
                } else {
                    estado.dia = estado.dia === i + 1 ? null : i + 1;
                }
                renderGastos();
            }
        });
    }


    /* ============================================================
       [CF-PIZZA] — GASTOS POR DESPESA (filtros de mês e dia)
       ============================================================ */

    const PALETA_PIZZA = ['#4ade80', '#b57cf5', '#38bdf8', '#fbbf24', '#fb7185', '#2dd4bf'];
    const PALETA_PIZZA_CLARA = ['#15803d', '#7c3aed', '#0369a1', '#b45309', '#be123c', '#0f766e'];   /* modo claro: tons mais escuros */
    const COR_OUTROS = '#94a3b8';
    const temaEscuro = () => document.documentElement.getAttribute('data-theme') === 'dark';
    const paletaPizza = () => (temaEscuro() ? PALETA_PIZZA : PALETA_PIZZA_CLARA);

    /* a cor segue o NOME da despesa (ranking do total geral), então não muda ao trocar de filtro */
    function coresPorNome() {
        const total = new Map();
        estado.lanc.filter(l => l.tipo === 'despesa').forEach(l => {
            const k = l.titulo.toLowerCase();
            total.set(k, (total.get(k) || 0) + l.valor);
        });
        const ordem = [...total.entries()].sort((x, y) => y[1] - x[1]).slice(0, PALETA_PIZZA.length);
        const paleta = paletaPizza();
        return new Map(ordem.map(([k], i) => [k, paleta[i]]));
    }

    function renderPizza() {
        const cores = coresPorNome();
        const grupos = new Map();
        periodoAtual().filter(l => l.tipo === 'despesa').forEach(l => {
            const k = cores.has(l.titulo.toLowerCase()) ? l.titulo.toLowerCase() : '__outros__';
            const g = grupos.get(k) || { nome: k === '__outros__' ? 'Outras despesas' : maiuscula(l.titulo), total: 0, qtd: 0, cor: cores.get(k) || COR_OUTROS };
            g.total += l.valor;
            g.qtd += 1;
            grupos.set(k, g);
        });

        const fatias = [...grupos.values()].sort((x, y) => (x.nome === 'Outras despesas') - (y.nome === 'Outras despesas') || y.total - x.total);
        const total = fatias.reduce((s, f) => s + f.total, 0);
        const host = $('#cfPizza');
        const lista = $('#cfPizzaLista');

        if (!total) {
            host.innerHTML = `<div class="cf-vazio">Sem gastos em ${H(rotuloPeriodo())}.</div>`;
            lista.innerHTML = '';
            return;
        }
        desenharPizza(host, lista, fatias, total);
    }


    /* ============================================================
       [CF-HISTORICO] — LISTA DE LANÇAMENTOS
       ============================================================ */

    function renderHistorico() {
        let lista, sub;

        if (estado.intervalo) {
            lista = periodoAtual();
            sub = `Registros de ${fmtData(estado.intervalo.de)} a ${fmtData(estado.intervalo.ate)}`;
        } else if (estado.dataFiltro) {
            lista = estado.lanc.filter(l => l.data === estado.dataFiltro);
            sub = `Registros do dia ${fmtData(estado.dataFiltro)}`;
        } else {
            lista = periodoAtual();
            sub = `Registro dos gastos e ganhos · ${rotuloPeriodo()}`;
        }
        $('#cfHistSub').textContent = sub;

        const chip = $('#cfChipData');
        chip.hidden = !estado.dataFiltro && !estado.intervalo;
        if (estado.intervalo) {
            $('#cfChipTxt').textContent = rotuloPeriodo();
            chip.setAttribute('aria-label', `Remover filtro do intervalo ${rotuloPeriodo()}`);
        } else if (estado.dataFiltro) {
            $('#cfChipTxt').textContent = `Dia ${fmtData(estado.dataFiltro)}`;
            chip.setAttribute('aria-label', `Remover filtro do dia ${fmtData(estado.dataFiltro)}`);
        }

        const ordenada = [...lista].sort((x, y) => (y.data + y.hora).localeCompare(x.data + x.hora));
        const visiveis = ordenada.slice(0, estado.limite);

        $('#cfLista').innerHTML = visiveis.length
            ? visiveis.map(l => `
                <li class="cf-item">
                    <span class="cf-item__icone" aria-hidden="true">${iconeDe(l)}</span>
                    <span class="cf-item__titulo">${H(l.titulo)}<small>${l.categoria ? H(l.categoria) : (l.tipo === 'receita' ? 'Receita' : 'Despesa')}</small></span>
                    <span class="cf-item__quando"><span class="cf-item__data">${fmtData(l.data)}</span><span class="cf-item__hora">${H(l.hora)}</span></span>
                    <span class="cf-item__valor is-${l.tipo}">${l.tipo === 'receita' ? '+' : '−'} ${brl(l.valor)}</span>
                    ${Dados.exemplo ? '' : `<button class="cf-item__excluir" type="button" data-excluir="${H(l.id)}" aria-label="Excluir lançamento ${H(l.titulo)}"><svg class="cf-ico" aria-hidden="true"><use href="#cf-i-x"/></svg></button>`}
                </li>`).join('')
            : '<li class="cf-lista__vazio">Nenhum registro neste período.</li>';

        const mais = $('#cfMais');
        mais.hidden = ordenada.length <= estado.limite;
        mais.textContent = `Mostrar mais (${ordenada.length - estado.limite})`;
    }



    /* ============================================================
       [CF-NOVO-LANCAMENTO] — FORMULÁRIO E EXCLUSÃO
       ============================================================ */

    async function recarregar(irPara) {
        estado.lanc = await Dados.carregar();
        estado.datasComLanc = new Set(estado.lanc.map(l => l.data));
        $('#cfDemo').hidden = !Dados.exemplo;
        if (irPara) {                       /* mostra o mês do lançamento recém-criado */
            const [a, m] = irPara.split('-').map(Number);
            estado.ano = a; estado.mes = m - 1; estado.dia = null;
        }
        renderGastos();
    }

    function iniciarNovoLancamento() {
        const form = $('#formLanc');
        if (!form) return;
        const tipo = $('#lancTipo'), cat = $('#lancCategoria'), erro = $('#lancErro');
        const hojeIso = isoData(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        form.elements.dia.value = hojeIso;

        const preencherCategorias = () => {
            cat.innerHTML = CATS[tipo.value].map(c => `<option>${H(c)}</option>`).join('');
        };
        preencherCategorias();
        tipo.addEventListener('change', preencherCategorias);

        form.addEventListener('submit', async e => {
            e.preventDefault();
            const valor = lerNumero(form.elements.valor.value);
            const dia = form.elements.dia.value || hojeIso;
            erro.hidden = true;
            if (!(valor > 0)) {
                erro.textContent = 'Informe um valor maior que zero';
                erro.hidden = false;
                if (window.dgxAviso) window.dgxAviso('Informe um valor maior que zero.', 'erro');
                form.elements.valor.focus();
                return;
            }
            const botao = form.querySelector('.cf-enviar');
            botao.disabled = true;
            try {
                await Dados.salvar({
                    tipo: tipo.value, categoria: cat.value,
                    descricao: form.elements.descricao.value.trim(), valor, dia
                });
                form.elements.descricao.value = '';
                form.elements.valor.value = '';
                await recarregar(dia.slice(0, 7));
                if (window.dgxAviso) window.dgxAviso(`${tipo.value === 'receita' ? 'Receita' : 'Gasto'} de ${brl(valor)} adicionado.`, 'ok');
            } catch (err) {
                erro.textContent = (err && err.message) || 'Não foi possível salvar.';
                erro.hidden = false;
            } finally {
                botao.disabled = false;
            }
        });

        $('#cfLista').addEventListener('click', async e => {
            const b = e.target.closest('[data-excluir]');
            if (!b) return;
            b.disabled = true;
            try { await Dados.excluir(b.dataset.excluir); await recarregar(); if (window.dgxAviso) window.dgxAviso('Lançamento excluído.', 'ok'); }
            catch (err) { b.disabled = false; (window.dgxAviso || alert)((err && err.message) || 'Não foi possível excluir.', 'erro'); }
        });
    }

    /* ============================================================
       [CF-CALENDARIO] — PESQUISA POR DATA
       ============================================================ */

    const Cal = {
        aberto: false,
        modo: 'dia',                      /* 'dia' | 'mes' | 'intervalo' */
        ano: hoje.getFullYear(),
        mes: hoje.getMonth(),
        foco: null,
        ini: null,                        /* primeiro clique do intervalo, esperando o segundo */

        abrir() {
            const ref = estado.intervalo ? estado.intervalo.de.split('-').map(Number)
                : estado.dataFiltro ? estado.dataFiltro.split('-').map(Number) : [estado.ano, estado.mes + 1];
            this.ano = ref[0];
            this.mes = ref[1] - 1;
            this.ini = null;
            this.modo = estado.intervalo ? 'intervalo' : (!estado.dia && estado.nivel === 'mes' && estado.mesEscolhido ? 'mes' : 'dia');
            this.aberto = true;
            $('#cfCal').hidden = false;
            $('#cfDataBtn').setAttribute('aria-expanded', 'true');
            this.render();
            ($('.cf-dia[tabindex="0"]', $('#cfCal')) || $('#cfCal button'))?.focus();
        },

        fechar(devolverFoco = false) {
            if (!this.aberto) return;
            this.aberto = false;
            $('#cfCal').hidden = true;
            $('#cfDataBtn').setAttribute('aria-expanded', 'false');
            if (devolverFoco) $('#cfDataBtn').focus();
        },

        render() {
            const cal = $('#cfCal');
            const hojeIso = isoData(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

            /* abas: Dia | Mês inteiro | Intervalo */
            const abas = [['dia', 'Dia'], ['mes', 'Mês inteiro'], ['intervalo', 'Intervalo']].map(([k, t]) =>
                `<button type="button" role="tab" class="cf-cal__aba" data-modo="${k}" aria-selected="${this.modo === k}">${t}</button>`).join('');

            let corpo;

            if (this.modo === 'mes') {
                /* grade com os 12 meses do ano: um clique filtra o mês inteiro */
                const meses = MESES_CURTOS.map((nome, i) => {
                    const ativo = !estado.intervalo && !estado.dia && estado.ano === this.ano && estado.mes === i && estado.mesEscolhido;
                    return `<button type="button" class="cf-mesbtn${ativo ? ' is-ativo' : ''}" data-mes-i="${i}" aria-pressed="${ativo}"
                                    aria-label="${maiuscula(MESES[i])} de ${this.ano}, mês inteiro">${maiuscula(nome)}</button>`;
                }).join('');
                corpo = `
                    <div class="cf-cal__cab">
                        <button class="cf-seta" type="button" data-cal-ano="-1" aria-label="Ano anterior"><svg class="cf-ico" aria-hidden="true"><use href="#cf-i-left"/></svg></button>
                        <span class="cf-cal__mes" aria-live="polite">${this.ano}</span>
                        <button class="cf-seta" type="button" data-cal-ano="1" aria-label="Próximo ano"><svg class="cf-ico" aria-hidden="true"><use href="#cf-i-right"/></svg></button>
                    </div>
                    <div class="cf-cal__meses">${meses}</div>`;
            } else {
                const primeiro = new Date(this.ano, this.mes, 1).getDay();
                const total = diasNoMes(this.ano, this.mes);
                const iguais = d => isoData(this.ano, this.mes, d);
                const noMes = iso => iso && iso.startsWith(`${this.ano}-${pad(this.mes + 1)}`);
                const focoD = noMes(this.foco) ? Number(this.foco.slice(8))
                    : noMes(estado.dataFiltro) ? Number(estado.dataFiltro.slice(8))
                    : noMes(hojeIso) ? hoje.getDate() : 1;

                const dias = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((s2, i) => `<span class="cf-cal__sem" aria-hidden="true" title="${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][i]}">${s2}</span>`).join('');
                const vazios = '<span class="cf-dia cf-dia--vazio"></span>'.repeat(primeiro);

                /* faixa já aplicada ou o primeiro clique pendente */
                const de = this.ini || (estado.intervalo && estado.intervalo.de);
                const ate = this.ini ? null : (estado.intervalo && estado.intervalo.ate);

                let botoes = '';
                for (let d = 1; d <= total; d++) {
                    const iso = iguais(d);
                    const tem = estado.datasComLanc.has(iso);
                    const ponta = iso === de || iso === ate;
                    const faixa = de && ate && iso > de && iso < ate;
                    const sel = this.modo === 'intervalo' ? ponta : iso === estado.dataFiltro;
                    botoes += `<button type="button" class="cf-dia${iso === hojeIso ? ' cf-dia--hoje' : ''}${tem ? ' cf-dia--tem' : ''}${faixa ? ' cf-dia--faixa' : ''}${this.modo === 'intervalo' && ponta ? ' cf-dia--ponta' : ''}"
                                       data-d="${iso}" tabindex="${d === focoD ? 0 : -1}" aria-pressed="${sel}"
                                       aria-label="${d} de ${MESES[this.mes]} de ${this.ano}${tem ? ', com lançamentos' : ''}${ponta ? (iso === de ? ', início do intervalo' : ', fim do intervalo') : ''}">${d}</button>`;
                }
                const dica = this.modo === 'intervalo'
                    ? `<p class="cf-cal__dica" role="status">${this.ini ? `Início: ${fmtData(this.ini)}. Agora escolha o dia final.` : 'Escolha o dia inicial e depois o dia final.'}</p>` : '';

                corpo = `
                    <div class="cf-cal__cab">
                        <button class="cf-seta" type="button" data-cal="-1" aria-label="Mês anterior"><svg class="cf-ico" aria-hidden="true"><use href="#cf-i-left"/></svg></button>
                        <span class="cf-cal__mes" aria-live="polite">${maiuscula(MESES[this.mes])} de ${this.ano}</span>
                        <button class="cf-seta" type="button" data-cal="1" aria-label="Próximo mês"><svg class="cf-ico" aria-hidden="true"><use href="#cf-i-right"/></svg></button>
                    </div>
                    ${dica}
                    <div class="cf-cal__grade">${dias}${vazios}${botoes}</div>`;
            }

            cal.innerHTML = `
                <div class="cf-cal__abas" role="tablist" aria-label="Tipo de filtro de data">${abas}</div>
                ${corpo}
                <div class="cf-cal__rodape">
                    <button class="cf-mini-btn" type="button" data-cal-hoje>Hoje</button>
                    <button class="cf-mini-btn" type="button" data-cal-limpar>Limpar filtro</button>
                </div>`;
        },

        /* [CF-FILTRO-DATA] aplica a escolha em TODA a página (saldo, linhas, pizza e histórico) */
        escolher(iso) {
            estado.intervalo = null;
            estado.mesEscolhido = false;
            if (iso) {
                const [a, m, d] = iso.split('-').map(Number);
                estado.ano = a; estado.mes = m - 1; estado.dia = d; estado.nivel = 'mes';
            } else {
                estado.dia = null;
            }
            estado.limite = CFG.itensPorPagina;
            this.fechar(true);
            renderGastos();
        },

        escolherMes(i) {
            estado.intervalo = null;
            estado.ano = this.ano; estado.mes = i; estado.dia = null; estado.nivel = 'mes';
            estado.mesEscolhido = true;
            estado.limite = CFG.itensPorPagina;
            this.fechar(true);
            renderGastos();
        },

        escolherIntervalo(iso) {
            if (!this.ini) { this.ini = iso; this.render(); $(`.cf-dia[data-d="${iso}"]`, $('#cfCal'))?.focus(); return; }
            const [de, ate] = this.ini <= iso ? [this.ini, iso] : [iso, this.ini];
            this.ini = null;
            estado.intervalo = { de, ate };
            estado.mesEscolhido = false;
            const [a, m] = de.split('-').map(Number);
            estado.ano = a; estado.mes = m - 1; estado.dia = null; estado.nivel = 'mes';
            estado.limite = CFG.itensPorPagina;
            this.fechar(true);
            renderGastos();
        },

        atualizarBotao() {
            $('#cfDataTxt').textContent = estado.intervalo ? rotuloPeriodo()
                : estado.dataFiltro ? fmtData(estado.dataFiltro)
                : (estado.mesEscolhido && !estado.dia ? `${maiuscula(MESES[estado.mes])} de ${estado.ano}` : 'Pesquisa por data');
        },

        iniciar() {
            const cal = $('#cfCal');

            $('#cfDataBtn').addEventListener('click', () => (this.aberto ? this.fechar() : this.abrir()));

            cal.addEventListener('click', e => {
                const aba = e.target.closest('[data-modo]');
                if (aba) { this.modo = aba.dataset.modo; this.ini = null; this.render(); $(`[data-modo="${this.modo}"]`, cal)?.focus(); return; }

                const mesBtn = e.target.closest('[data-mes-i]');
                if (mesBtn) return this.escolherMes(Number(mesBtn.dataset.mesI));

                const navAno = e.target.closest('[data-cal-ano]');
                if (navAno) { this.ano += Number(navAno.dataset.calAno); this.render(); $(`[data-cal-ano="${navAno.dataset.calAno}"]`, cal)?.focus(); return; }

                const dia = e.target.closest('.cf-dia[data-d]');
                if (dia) return this.modo === 'intervalo' ? this.escolherIntervalo(dia.dataset.d) : this.escolher(dia.dataset.d);

                const nav = e.target.closest('[data-cal]');
                if (nav) {
                    const d = new Date(this.ano, this.mes + Number(nav.dataset.cal), 1);
                    this.ano = d.getFullYear();
                    this.mes = d.getMonth();
                    this.foco = null;
                    this.render();
                    $(`[data-cal="${nav.dataset.cal}"]`, cal)?.focus();
                    return;
                }
                if (e.target.closest('[data-cal-hoje]')) return this.escolher(isoData(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
                if (e.target.closest('[data-cal-limpar]')) { this.escolher(null); }
            });

            /* setas do teclado andam pelos dias */
            cal.addEventListener('keydown', e => {
                const atual = e.target.closest('.cf-dia[data-d]');
                if (!atual) return;
                const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
                if (!passo) return;
                e.preventDefault();
                const botoes = $$('.cf-dia[data-d]', cal);
                const alvo = botoes[botoes.indexOf(atual) + passo];
                if (!alvo) return;
                botoes.forEach(b => b.tabIndex = -1);
                alvo.tabIndex = 0;
                this.foco = alvo.dataset.d;
                alvo.focus();
            });

            document.addEventListener('click', e => {
                if (this.aberto && e.target.isConnected && !$('#cfData').contains(e.target)) this.fechar();   /* isConnected: o calendário se redesenha ao clicar, e o alvo some do DOM */
            });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && this.aberto) this.fechar(true);
            });

            $('#cfChipData').addEventListener('click', () => this.escolher(null));
        }
    };


    /* ============================================================
       FORMULÁRIOS DAS FERRAMENTAS: guarda o que foi digitado
       ============================================================ */

    function ligarForm(form, nome, aoMudar) {
        const chave = CFG.chaveFerramentas(usuarioId());
        const todos = () => lerJson(chave, {});
        const salvo = todos()[nome] || {};

        [...form.elements].forEach(el => {
            if (el.name && salvo[el.name] !== undefined) el.value = salvo[el.name];
        });

        const mudou = () => {
            const dados = Object.fromEntries([...form.elements].filter(el => el.name).map(el => [el.name, el.value]));
            gravarJson(chave, { ...todos(), [nome]: dados });
            aoMudar();
        };

        form.addEventListener('input', mudou);
        form.addEventListener('submit', e => e.preventDefault());
        aoMudar();
        return mudou;
    }

    const valoresForm = form => Object.fromEntries([...form.elements].filter(el => el.name).map(el => [el.name, el.value]));

    function definirCampo(form, nome, valor) {
        const campo = form.elements[nome];
        campo.value = valor;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
    }


    /* ============================================================
       [CF-SIMULADOR] — JUROS COMPOSTOS
       ============================================================ */

    function renderSimulador() {
        const v = valoresForm($('#formSim'));
        const inicial = lerNumero(v.inicial), aporte = lerNumero(v.aporte), taxa = lerNumero(v.taxa), prazo = lerNumero(v.prazo);
        const stats = $('#simStats'), host = $('#simGrafico');

        const meses = Math.min(CFG.maxMesesSimulador, Math.round(v.prazoTipo === 'ano' ? prazo * 12 : prazo));
        if (meses < 1 || (!inicial && !aporte)) {
            stats.innerHTML = '';
            host.innerHTML = '<div class="cf-vazio">Preencha o valor inicial ou o aporte, a taxa e o prazo para ver o resultado.</div>';
            return;
        }

        const i = v.taxaTipo === 'ano' ? Math.pow(1 + taxa / 100, 1 / 12) - 1 : taxa / 100;
        const serie = [{ m: 0, saldo: inicial, investido: inicial }];
        let saldo = inicial, investido = inicial;
        for (let m = 1; m <= meses; m++) {
            saldo = saldo * (1 + i) + aporte;
            investido += aporte;
            serie.push({ m, saldo, investido });
        }

        const juros = saldo - investido;
        stats.innerHTML = `
            <div class="cf-stat cf-stat--destaque"><small>Valor final</small><strong>${brl(saldo)}</strong></div>
            <div class="cf-stat"><small>Total investido</small><strong>${brl(investido)}</strong></div>
            <div class="cf-stat"><small>Juros ganhos</small><strong>${brl(juros)}</strong></div>`;

        /* pontos do gráfico: todo mês (prazos curtos) ou todo ano */
        const passo = meses <= 24 ? 1 : 12;
        const marcos = [];
        for (let m = passo; m <= meses; m += passo) marcos.push(m);
        if (marcos[marcos.length - 1] !== meses) marcos.push(meses);

        const rotulo = m => passo === 1 ? `Mês ${m}` : `Ano ${(m / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`;

        desenharLinhas(host, {
            labels: marcos,
            a: marcos.map(m => serie[m].saldo),
            b: marcos.map(m => serie[m].investido),
            nomeA: 'Valor acumulado', nomeB: 'Total investido',
            sel: -1,
            titulo: i => rotulo(marcos[i]),
            xLabel: i => passo === 1 ? `${marcos[i]}m` : `${(marcos[i] / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}a`,
            extra: { nome: 'Juros', valor: i => serie[marcos[i]].saldo - serie[marcos[i]].investido },
            aria: `Crescimento do valor acumulado comparado ao total investido em ${meses} meses`
        });
    }


    /* ============================================================
       [CF-RESERVA] — RESERVA DE EMERGÊNCIA
       ============================================================ */

    /* média mensal de gastos dos últimos 3 meses fechados (ou do mês atual, se não houver) */
    function mediaGastos() {
        const valores = [];
        for (let k = 1; k <= 3; k++) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
            const g = somar(doPeriodo(d.getFullYear(), d.getMonth(), null), 'despesa');
            if (g > 0) valores.push(g);
        }
        if (!valores.length) valores.push(somar(doPeriodo(hoje.getFullYear(), hoje.getMonth(), null), 'despesa'));
        return valores.reduce((s, v) => s + v, 0) / valores.length;
    }

    function renderReserva() {
        const v = valoresForm($('#formRes'));
        const despesas = lerNumero(v.despesas), meses = Number(v.meses) || 6;
        const atual = lerNumero(v.atual), aporte = lerNumero(v.aporte);
        const stats = $('#resStats'), prog = $('#resProgresso'), msg = $('#resMsg');

        if (!despesas) {
            stats.innerHTML = '';
            prog.innerHTML = '';
            msg.textContent = 'Informe suas despesas essenciais por mês para calcular a meta.';
            return;
        }

        const meta = despesas * meses;
        const falta = Math.max(0, meta - atual);
        const pct = Math.min(100, atual / meta * 100);

        let prazo;
        if (!falta) prazo = 'Meta atingida!';
        else if (!aporte) prazo = 'Informe o quanto guarda por mês';
        else {
            const m = Math.ceil(falta / aporte);
            const anos = Math.floor(m / 12), resto = m % 12;
            const partes = [anos ? `${anos} ${anos === 1 ? 'ano' : 'anos'}` : '', resto ? `${resto} ${resto === 1 ? 'mês' : 'meses'}` : ''].filter(Boolean);
            const quando = new Date(hoje.getFullYear(), hoje.getMonth() + m, 1);
            prazo = `${partes.join(' e ')} (${MESES_CURTOS[quando.getMonth()]}/${quando.getFullYear()})`;
        }

        stats.innerHTML = `
            <div class="cf-stat cf-stat--destaque"><small>Meta da reserva</small><strong>${brl(meta)}</strong></div>
            <div class="cf-stat"><small>Já guardado</small><strong>${brl(atual)}</strong></div>
            <div class="cf-stat"><small>Falta guardar</small><strong>${brl(falta)}</strong></div>
            <div class="cf-stat"><small>Prazo estimado</small><strong class="cf-stat__texto">${H(prazo)}</strong></div>`;

        prog.innerHTML = `
            <div class="cf-progresso__barra" role="progressbar" aria-label="Progresso da reserva" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><div style="width:${pct}%"></div></div>
            <div class="cf-progresso__txt"><span>${pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% da meta</span><span>${meses} meses de cobertura</span></div>`;

        msg.textContent = 'Mantenha a reserva separada do dinheiro do dia a dia, em uma aplicação segura e com liquidez diária. Simulação educativa, sem juros.';
    }


    /* ============================================================
       [CF-REGRA] — REGRA 50/30/20
       ============================================================ */

    const GRUPOS_REGRA = [
        { chave: 'Nec', nome: 'Necessidades', pct: 50, cor: '#38bdf8', desc: 'Moradia, comida, transporte e contas', campo: 'hojeNec' },
        { chave: 'Des', nome: 'Desejos', pct: 30, cor: '#fbbf24', desc: 'Lazer, restaurantes e assinaturas', campo: 'hojeDes' },
        { chave: 'Pou', nome: 'Poupança e dívidas', pct: 20, cor: '#4ade80', desc: 'Reserva, investimentos e quitar dívidas', campo: 'hojePou' }
    ];

    function renderRegra() {
        const v = valoresForm($('#formRegra'));
        const renda = lerNumero(v.renda);
        const barra = $('#regraBarra'), itens = $('#regraItens');

        if (!renda) {
            barra.innerHTML = '';
            itens.innerHTML = '<div class="cf-vazio">Informe sua renda líquida mensal para ver a divisão.</div>';
            return;
        }

        barra.innerHTML = GRUPOS_REGRA.map(g => `<div style="flex:${g.pct};background:${g.cor}">${g.pct}%</div>`).join('');

        itens.innerHTML = GRUPOS_REGRA.map(g => {
            const meta = renda * g.pct / 100;
            const hojeValor = lerNumero(v[g.campo]);
            let status = '';
            if (hojeValor) {
                const dif = hojeValor - meta;
                const poupanca = g.chave === 'Pou';
                const ok = poupanca ? dif >= 0 : dif <= 0;
                status = `<p class="cf-regra-item__status ${ok ? 'is-ok' : 'is-alto'}">${
                    ok ? 'Dentro da meta' : (poupanca ? 'Abaixo da meta' : 'Acima da meta')
                }: hoje ${brl(hojeValor)} (${brl(Math.abs(dif))} ${dif >= 0 ? 'a mais' : 'a menos'}).</p>`;
            }
            return `<div class="cf-regra-item">
                        <i class="cf-regra-item__cor" style="background:${g.cor}" aria-hidden="true"></i>
                        <span class="cf-regra-item__nome">${g.nome} · ${g.pct}%<small>${g.desc}</small></span>
                        <span class="cf-regra-item__valor">${brl(meta)}</span>
                        ${status}
                    </div>`;
        }).join('');
    }


    /* ============================================================
       RENDERIZAÇÃO GERAL DE "GASTOS DO MÊS"
       ============================================================ */

    function renderGastos() {
        /* o dia escolhido (pelo calendário ou clicando no gráfico) é o filtro de data da página */
        estado.dataFiltro = (estado.dia && !estado.intervalo) ? isoData(estado.ano, estado.mes, estado.dia) : null;
        Cal.atualizarBotao();
        renderResumo();
        renderLinha();
        renderPizza();
        renderHistorico();
    }


    /* ============================================================
       [CF-ROTAS] — ABAS E SUBMENU (#gastos #simulador #reserva #regra)
       ============================================================ */

    const VIEWS = {
        gastos:    { titulo: 'Gastos do mês',            sub: 'Acompanhe o que entra e o que sai do seu bolso.' },
        simulador: { titulo: 'Simulador',                sub: 'Veja o poder dos juros compostos no seu dinheiro.' },
        reserva:   { titulo: 'Reserva de emergência',    sub: 'Quanto guardar para ficar tranquilo nos imprevistos.' },
        regra:     { titulo: 'Regra 50/30/20',           sub: 'Uma divisão simples para organizar sua renda.' },
        cdb:       { titulo: 'CDB',                      sub: 'Calcule o rendimento do seu investimento.' },
        ranking:   { titulo: 'Ranking',                  sub: 'Veja quem mais avançou nos estudos.' }
    };

    function rotear() {
        const pedido = location.hash.replace('#', '');
        const view = VIEWS[pedido] ? pedido : 'gastos';

        Object.keys(VIEWS).forEach(nome => { $(`#view-${nome}`).hidden = nome !== view; });

        $('#cfTitulo').textContent = VIEWS[view].titulo;
        $('#cfSubtitulo').textContent = VIEWS[view].sub;
        $('#cfAcoesGastos').hidden = view !== 'gastos';
        document.title = `${VIEWS[view].titulo} | Dragnix`;
        Cal.fechar();

        /* destaca no menu o item da tela aberta */
        document.querySelectorAll('[data-cf-view]').forEach(a => {
            if (a.dataset.cfView === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });

        if (view === 'gastos') renderGastos();
        if (view === 'simulador') renderSimulador();
        if (view === 'reserva') renderReserva();
        if (view === 'regra') renderRegra();
    }


    /* ============================================================
       INÍCIO
       ============================================================ */

    async function iniciar() {
        /* Mostra JÁ a aba pedida no endereço (#ranking, #simulador...), com título e menu,
           em vez de deixar "Gastos do mês" na tela até os lançamentos chegarem. */
        const pedidoInicial = location.hash.replace('#', '');
        const viewInicial = VIEWS[pedidoInicial] ? pedidoInicial : 'gastos';
        Object.keys(VIEWS).forEach(nome => { const el = $(`#view-${nome}`); if (el) el.hidden = nome !== viewInicial; });
        $('#cfTitulo').textContent = VIEWS[viewInicial].titulo;
        $('#cfSubtitulo').textContent = VIEWS[viewInicial].sub;
        $('#cfAcoesGastos').hidden = viewInicial !== 'gastos';
        document.title = `${VIEWS[viewInicial].titulo} | Dragnix`;
        document.querySelectorAll('[data-cf-view]').forEach(a => {
            if (a.dataset.cfView === viewInicial) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });

        const carga = Dados.carregar();
        /* o Ranking tem a própria mini-tela (js/ranking.js); as outras abas usam esta */
        const TEXTO_CARGA = {
            gastos: 'Carregando seus lançamentos…',
            simulador: 'Carregando o simulador…',
            reserva: 'Carregando seus dados…',
            regra: 'Carregando seus dados…'
        };
        if (window.dgxCarregando && TEXTO_CARGA[viewInicial]) {
            window.dgxCarregando.cobrir(document.getElementById('view-' + viewInicial), TEXTO_CARGA[viewInicial], carga.catch(() => {}));
        }
        estado.lanc = await carga;
        estado.datasComLanc = new Set(estado.lanc.map(l => l.data));
        $('#cfDemo').hidden = !Dados.exemplo;

        Cal.iniciar();
        /* trocou o tema → redesenha (a pizza usa cores diferentes em cada tema) */
        new MutationObserver(() => renderGastos()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        iniciarNovoLancamento();

        /* resumo: setas de mês */
        /* gráfico de linhas: migalhas, troca de ano e tabela */
        $('#cfMigalhas').addEventListener('click', e => {
            if (estado.intervalo) return;
            const ano = e.target.closest('[data-ano]');
            if (ano) { estado.ano += Number(ano.dataset.ano); estado.dia = null; return renderGastos(); }
            const nv = e.target.closest('[data-nv]');
            if (!nv) return;
            estado.dia = null;
            if (nv.dataset.nv === 'ano') estado.nivel = 'ano';
            renderGastos();
        });
        $('#cfTabelaBtn').addEventListener('click', () => { estado.tabela = !estado.tabela; renderLinha(); });

        /* histórico */
        $('#cfMais').addEventListener('click', () => { estado.limite += CFG.itensPorPagina; renderHistorico(); });

        /* ferramentas */
        ligarForm($('#formSim'), 'simulador', renderSimulador);
        ligarForm($('#formRes'), 'reserva', renderReserva);
        ligarForm($('#formRegra'), 'regra', renderRegra);

        $('#resUsarMedia').addEventListener('click', () => {
            const media = mediaGastos();
            if (media > 0) definirCampo($('#formRes'), 'despesas', FMT_NUM.format(media));
        });
        $('#regraUsarReceita').addEventListener('click', () => {
            const rec = somar(periodoAtual(), 'receita');
            if (rec > 0) definirCampo($('#formRegra'), 'renda', FMT_NUM.format(rec));
        });

        window.addEventListener('hashchange', rotear);

        /* [CF-MENU] clique no menu lateral = trocar o conteúdo AQUI, sem recarregar nem sair da página.
           Captura no window: vale mesmo que outro script da página tente tratar o clique. */
        window.addEventListener('click', e => {
            const link = e.target.closest && e.target.closest('[data-cf-view]');
            if (!link) return;
            e.preventDefault();
            const alvo = '#' + link.dataset.cfView;
            if (location.hash === alvo) rotear();
            else location.hash = alvo;
            window.scrollTo({ top: 0 });
            document.getElementById('sideClose')?.click();     /* no celular, fecha a gaveta do menu */
        }, true);
        rotear();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();