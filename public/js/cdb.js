/* ============================================================
   DRAGNIX — js/cdb.js  (CALCULADORA DE CDB)
   ============================================================

   Usado em cdb.html e na tela #cdb do controle-financeiro.html.
   Precisa do HTML com: #formCdb, #cdbStats, #cdbGrafico,
   #cdbRotuloTaxa e #cdbCampoCdi. Os estilos vêm do css/controle.css
   (cf-stat, cf-svg, cf-serie...) e do css/cdb.css.

   COMO PROCURAR: Ctrl+F e digite o código entre colchetes.
   [CDB-UTIL]      leitura de números e formatação
   [CDB-SALVAR]    guarda o que foi digitado (por usuário, no navegador)
   [CDB-IR]        tabela do imposto de renda regressivo
   [CDB-CALCULO]   rendimento mês a mês (cada aporte paga o IR do seu prazo)
   [CDB-GRAFICO]   gráfico de linhas (valor bruto x total investido)
   [CDB-INICIO]    liga o formulário
   ============================================================ */

(() => {
    'use strict';

    const form = document.getElementById('formCdb');
    const stats = document.getElementById('cdbStats');
    const grafico = document.getElementById('cdbGrafico');

    if (!form || !stats || !grafico) return;

    const MAX_MESES = 1200;


    /* ============================================================
       [CDB-UTIL]
       ============================================================ */

    const H = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const FMT_BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const brl = n => FMT_BRL.format(n || 0);
    const pct = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';

    /* "1.234,56" | "1234,56" | "1234.56" | "R$ 50" → número (vazio/inválido = 0) — igual ao controle.js */
    function lerNumero(texto) {
        let t = String(texto ?? '').replace(/[R$\s%]/g, '');
        if (!t) return 0;
        if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
        else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
        const n = parseFloat(t);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function abreviar(v) {
        if (v >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
        if (v >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
        return String(Math.round(v));
    }


    /* ============================================================
       [CDB-SALVAR] — mesma chave das ferramentas do controle financeiro
       ============================================================ */

    const usuarioId = () => {
        try {
            const u = typeof me === 'function' ? me() : JSON.parse(localStorage.getItem('user') || 'null');
            return u?.id ?? u?.email ?? 'local';
        } catch { return 'local'; }
    };

    const CHAVE = `dragnix:cf-ferramentas:${usuarioId()}`;

    const lerTudo = () => {
        try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { return {}; }
    };

    const valores = () => Object.fromEntries([...form.elements].filter(el => el.name).map(el =>
        [el.name, el.type === 'checkbox' ? el.checked : el.value]));

    function restaurar() {
        const salvo = lerTudo().cdb || {};
        [...form.elements].forEach(el => {
            if (!el.name || salvo[el.name] === undefined) return;
            if (el.type === 'checkbox') el.checked = !!salvo[el.name];
            else el.value = salvo[el.name];
        });
    }

    function salvar() {
        try { localStorage.setItem(CHAVE, JSON.stringify({ ...lerTudo(), cdb: valores() })); }
        catch { /* armazenamento indisponível: ignora */ }
    }


    /* ============================================================
       [CDB-IR] — 22,5% até 180 dias | 20% até 360 | 17,5% até 720 | 15% acima
       ============================================================ */

    const aliquotaIR = dias => dias <= 180 ? .225 : dias <= 360 ? .20 : dias <= 720 ? .175 : .15;


    /* ============================================================
       [CDB-CALCULO]
       ============================================================ */

    function calcular(v) {
        const inicial = lerNumero(v.inicial);
        const aporte = lerNumero(v.aporte);
        const taxa = lerNumero(v.taxa);
        const cdi = lerNumero(v.cdi);
        const prazo = lerNumero(v.prazo);
        const meses = Math.min(MAX_MESES, Math.round(v.prazoTipo === 'ano' ? prazo * 12 : prazo));

        const anual = v.tipo === 'pre' ? taxa / 100 : (cdi / 100) * (taxa / 100);

        if (meses < 1 || (!inicial && !aporte) || anual <= 0) return null;

        const i = Math.pow(1 + anual, 1 / 12) - 1;

        /* cada depósito (inicial no mês 0, aportes nos meses 1..N-1) rende até o mês N
           e paga o IR conforme o tempo que ficou aplicado */
        const depositos = [{ mes: 0, valor: inicial }];
        for (let m = 1; m < meses; m++) depositos.push({ mes: m, valor: aporte });

        let bruto = 0, investido = 0, imposto = 0;
        depositos.forEach(d => {
            if (!d.valor) return;
            const final = d.valor * Math.pow(1 + i, meses - d.mes);
            const ganho = final - d.valor;
            bruto += final;
            investido += d.valor;
            if (v.ir) imposto += ganho * aliquotaIR((meses - d.mes) * 30);
        });

        /* série do gráfico: saldo bruto e total investido no fim de cada mês */
        const serie = [];
        let saldo = inicial, aplicado = inicial;
        for (let m = 1; m <= meses; m++) {
            saldo *= 1 + i;
            serie.push({ m, saldo, aplicado });
            if (m < meses) { saldo += aporte; aplicado += aporte; }
        }

        return { meses, anual, bruto, investido, imposto, liquido: bruto - imposto, serie };
    }


    /* ============================================================
       [CDB-GRAFICO] — usa as classes do gráfico do controle.css
       ============================================================ */

    function escala(max) {
        const bruto = max / 4;
        const ordem = Math.pow(10, Math.floor(Math.log10(bruto)));
        const passo = [1, 2, 2.5, 5, 10].map(f => f * ordem).find(p => p >= bruto) || ordem * 10;
        return { passo, teto: Math.ceil(max / passo) * passo };
    }

    function desenhar(r) {
        const passoM = r.meses <= 24 ? 1 : 12;
        const marcos = [];
        for (let m = passoM; m <= r.meses; m += passoM) marcos.push(m);
        if (marcos[marcos.length - 1] !== r.meses) marcos.push(r.meses);

        const a = marcos.map(m => r.serie[m - 1].saldo);
        const b = marcos.map(m => r.serie[m - 1].aplicado);
        const n = marcos.length;

        const W = 640, Ht = 300, mg = { l: 56, r: 14, t: 16, b: 30 };
        const pw = W - mg.l - mg.r, ph = Ht - mg.t - mg.b;
        const { passo, teto } = escala(Math.max(...a, ...b));
        const x = k => mg.l + pw * (k + .5) / n;
        const y = v => mg.t + ph - (v / teto) * ph;
        const raio = n > 16 ? 2.6 : 3.8;
        const pularX = n > 24 ? 3 : n > 12 ? 2 : 1;
        const rotuloX = m => passoM === 1 ? `${m}m` : `${(m / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}a`;
        const titulo = m => passoM === 1 ? `Mês ${m}` : `Ano ${(m / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`;

        let grade = '';
        for (let v = 0; v <= teto + 1e-9; v += passo) {
            grade += `<line class="${v === 0 ? 'cf-base' : 'cf-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${y(v)}" y2="${y(v)}"/>
                      <text class="cf-eixo" x="${mg.l - 8}" y="${y(v) + 4}" text-anchor="end">${abreviar(v)}</text>`;
        }

        const linha = serie => serie.map((v, k) => `${x(k)},${y(v)}`).join(' ');

        const pontos = marcos.map((m, k) => `
            <g class="cf-coluna">
                <title>${H(titulo(m))}: valor bruto ${brl(a[k])}, total investido ${brl(b[k])}</title>
                <circle class="cf-pt--a" cx="${x(k)}" cy="${y(a[k])}" r="${raio}"/>
                <rect class="cf-pt--b" x="${x(k) - raio}" y="${y(b[k]) - raio}" width="${raio * 2}" height="${raio * 2}" rx="1"/>
                ${k % pularX === 0 ? `<text class="cf-eixo cf-eixo-x" x="${x(k)}" y="${Ht - 8}" text-anchor="middle">${H(rotuloX(m))}</text>` : ''}
            </g>`).join('');

        grafico.innerHTML = `
            <svg class="cf-svg" viewBox="0 0 ${W} ${Ht}" role="img"
                 aria-label="Crescimento do valor bruto comparado ao total investido em ${r.meses} meses">
                ${grade}
                <polyline class="cf-serie cf-serie--a" points="${linha(a)}"/>
                <polyline class="cf-serie cf-serie--b" points="${linha(b)}"/>
                ${pontos}
            </svg>`;
    }

    function render() {
        const v = valores();

        /* prefixado não usa o CDI */
        const pre = v.tipo === 'pre';
        const campoCdi = document.getElementById('cdbCampoCdi');
        const rotulo = document.getElementById('cdbRotuloTaxa');
        if (campoCdi) campoCdi.hidden = pre;
        if (rotulo) rotulo.textContent = pre ? 'Taxa (% ao ano)' : '% do CDI';

        const r = calcular(v);

        if (!r) {
            stats.innerHTML = '';
            grafico.innerHTML = `<div class="cf-vazio">Preencha o valor inicial ou o aporte, a taxa${pre ? '' : ', o CDI'} e o prazo para ver o resultado.</div>`;
            return;
        }

        stats.innerHTML = `
            <div class="cf-stat cf-stat--destaque"><small>${v.ir ? 'Valor líquido' : 'Valor final'}</small><strong>${brl(r.liquido)}</strong></div>
            <div class="cf-stat"><small>Total investido</small><strong>${brl(r.investido)}</strong></div>
            <div class="cf-stat"><small>Rendimento bruto</small><strong>${brl(r.bruto - r.investido)}</strong></div>
            <div class="cf-stat"><small>Imposto de renda</small><strong>${brl(r.imposto)}</strong></div>
            <div class="cf-stat"><small>Taxa efetiva</small><strong class="cf-stat__texto">${pct(r.anual * 100)} ao ano</strong></div>`;

        desenhar(r);
    }


    /* ============================================================
       [CDB-INICIO]
       ============================================================ */

    restaurar();
    form.addEventListener('input', () => { salvar(); render(); });
    form.addEventListener('change', () => { salvar(); render(); });
    form.addEventListener('submit', e => e.preventDefault());
    render();
})();
