/* ============================================================
   DRAGNIX — js/painel-gestao.js  (PÁGINA INICIAL DE ADM E PROFESSOR)
   ============================================================

   Na pag-inicial.html, quem é ADMINISTRADOR ou PROFESSOR não vê as
   trilhas e o progresso de aluno. No lugar, aparece o painel de gestão:

     ADMINISTRADOR
       [GX-NUMEROS]   trilhas, módulos, questões, usuários e dúvidas
       [GX-ATALHOS]   nova trilha, painel adm, trilhas, perguntas e respostas,
                      usuários, conquistas, sistema, avaliações, ver como aluno
       [GX-STATUS]    banco online e status de cada API (com tempo de resposta)

     PROFESSOR
       [GX-NUMEROS]   trilhas, módulos, questões e dúvidas
       [GX-ATALHOS]   nova trilha, trilhas, perguntas e respostas,
                      avaliações, ver como aluno

   Aluno (role "comum"): este arquivo não faz nada.

   Precisa do js/api.js antes (api() e me()) e deve vir ANTES do
   js/iniciopainel.js (que deixa de carregar o progresso de aluno).

   ROTAS USADAS (server.js / backup.js)
     /api/admin/tree              trilhas, módulos e questões (adm e professor)
     /api/admin/system/overview   números do banco (só adm)
     /api/health                  banco respondendo (público)
     /api/version                 versão publicada
     /api/auth/me                 API de autenticação
     /api/doubts                  dúvidas (GET), respostas (POST), excluir (DELETE)
   ============================================================ */

(function () {
    'use strict';

    const usuario = (() => {
        try { return typeof me === 'function' ? me() : JSON.parse(localStorage.getItem('user') || 'null'); }
        catch { return null; }
    })();

    const papel = usuario && usuario.role;

    if (!localStorage.getItem('token') || !['adm', 'professor'].includes(papel)) return;
    if (typeof api !== 'function') return;

    const ehAdm = papel === 'adm';

    // Avisa o js/iniciopainel.js para não carregar o progresso de aluno
    window.dgxGestao = papel;

    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const carregando = (el, texto, p) => (window.dgxCarregando ? window.dgxCarregando.cobrir(el, texto, p.catch(() => {})) : p);

    const ICO = {
        trilha:   '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
        modulo:   '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
        questao:  '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
        chat:     '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
        conquista:'<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
        estrela:  '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
        mais:     '<path d="M5 12h14"/><path d="M12 5v14"/>',
        painel:   '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
        banco:    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
        aluno:    '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
        atualizar:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
        enviar:   '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
        lixo:     '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
        regras:   '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
        abrir:    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
    };

    const ico = (nome, classe = 'gx-ico') =>
        `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true">${ICO[nome] || ''}</svg>`;


    /* ============================================================
       ESCONDE A VISÃO DE ALUNO E AJUSTA O TÍTULO
       ============================================================ */

    document.body.classList.add('is-gestao', 'is-' + papel);

    const primeiroNome = String((usuario && usuario.name) || '').trim().split(/\s+/)[0] || '';
    const heroTitulo = document.querySelector('.hero h1');
    const heroTexto = document.querySelector('.hero p');

    if (heroTitulo) {
        heroTitulo.textContent = ehAdm ? 'Painel do administrador' : 'Painel do professor';
    }

    if (heroTexto) {
        heroTexto.textContent = (primeiroNome ? 'Olá, ' + primeiroNome + '! ' : 'Olá! ') + (ehAdm
            ? 'Acompanhe o sistema, crie trilhas e responda às dúvidas dos alunos.'
            : 'Crie trilhas e módulos e responda às dúvidas dos alunos.');
    }

    document.title = (ehAdm ? 'Painel do administrador' : 'Painel do professor') + ' | Dragnix';


    /* ============================================================
       ESTRUTURA DO PAINEL
       ============================================================ */

    const NUMEROS = [
        { id: 'trilhas', rotulo: 'Trilhas', ico: 'trilha', cor: '#8b3fd9' },
        { id: 'modulos', rotulo: 'Módulos', ico: 'modulo', cor: '#1cb0f6' },
        { id: 'questoes', rotulo: 'Questões', ico: 'questao', cor: '#f59e0b' },
        ...(ehAdm ? [{ id: 'usuarios', rotulo: 'Usuários', ico: 'usuarios', cor: '#58cc02' }] : []),
        { id: 'duvidas', rotulo: 'Dúvidas sem resposta', ico: 'chat', cor: '#ff4b4b' }
    ];

    const ATALHOS = [
        { href: 'admin.html#nova-trilha', ico: 'mais', titulo: 'Criar nova trilha', texto: 'Abre o formulário de trilha no painel', destaque: true },
        ...(ehAdm ? [
            { href: 'admin.html', ico: 'painel', titulo: 'Painel administrativo', texto: 'Todas as funções e atalhos do painel' }
        ] : []),
        { href: 'admin.html#trilhas', ico: 'trilha', titulo: 'Trilhas', texto: 'Ver e editar trilhas, módulos e questões', contador: 'gxQtdTrilhas' },
        { href: 'app.html#duvidas', ico: 'chat', titulo: 'Perguntas e respostas', texto: 'Responder às dúvidas dos alunos', contador: 'gxQtdDuvidas' },
        ...(ehAdm ? [
            { href: 'admin.html#usuarios', ico: 'usuarios', titulo: 'Usuários', texto: 'Papéis e contas' },
            { href: 'admin.html#regras', ico: 'regras', titulo: 'Regras de negócio', texto: 'Níveis, XP, moedas, vidas e missões' },
            { href: 'admin.html#conquistas', ico: 'conquista', titulo: 'Conquistas', texto: 'Criar conquistas para os alunos' },
            { href: 'admin-sistema.html', ico: 'banco', titulo: 'Sistema e banco', texto: 'Tabelas e backup' }
        ] : []),
        { href: 'admin.html#avaliacoes', ico: 'estrela', titulo: 'Avaliações', texto: 'Notas das trilhas e módulos' },
        { href: 'app.html', ico: 'aluno', titulo: 'Ver como aluno', texto: 'Abre a área do aluno' }
    ];

    const secao = document.createElement('section');
    secao.className = 'gx';
    secao.id = 'gestao';
    secao.setAttribute('aria-label', ehAdm ? 'Painel do administrador' : 'Painel do professor');

    secao.innerHTML = `
        <div class="gx-numeros" id="gxNumeros">
            ${NUMEROS.map(n => `
                <article class="gx-num" style="--gx-cor:${n.cor}">
                    <span class="gx-num__ico">${ico(n.ico)}</span>
                    <div>
                        <strong id="gxNum-${n.id}">–</strong>
                        <span>${n.rotulo}</span>
                    </div>
                </article>
            `).join('')}
        </div>

        <div class="gx-grade${ehAdm ? '' : ' gx-grade--uma'}">

            <article class="gx-card" id="gxAtalhos">
                <header class="gx-card__topo">
                    <h2>Atalhos</h2>
                </header>
                <div class="gx-atalhos">
                    ${ATALHOS.map(a => `
                        <a class="gx-atalho${a.destaque ? ' gx-atalho--destaque' : ''}" href="${a.href}">
                            <span class="gx-atalho__ico">${ico(a.ico)}</span>
                            <span class="gx-atalho__txt"><b>${a.titulo}</b><small>${a.texto}</small></span>
                            ${a.contador ? `<span class="gx-atalho__qtd" id="${a.contador}" hidden></span>` : ''}
                        </a>
                    `).join('')}
                </div>
            </article>

            ${ehAdm ? `
            <article class="gx-card" id="gxStatus">
                <header class="gx-card__topo">
                    <h2>Status do sistema</h2>
                    <span class="gx-selo" id="gxStatusGeral">Verificando…</span>
                </header>
                <ul class="gx-status" id="gxStatusLista"></ul>
                <footer class="gx-card__rodape">
                    <span class="gx-mut" id="gxStatusInfo"></span>
                    <button type="button" class="gx-btn gx-btn--sec" id="gxStatusAtualizar">${ico('atualizar')} Verificar de novo</button>
                </footer>
            </article>
            ` : ''}

        </div>

    `;

    // Entra logo depois do banner; o progresso de aluno fica escondido (CSS)
    const hero = document.querySelector('.hero');
    if (hero && hero.parentNode) hero.after(secao);
    else (document.querySelector('main') || document.body).appendChild(secao);


    /* ============================================================
       [GX-NUMEROS]
       ============================================================ */

    const numero = (id, valor) => {
        const el = $('gxNum-' + id);
        if (el) el.textContent = valor == null ? '–' : Number(valor).toLocaleString('pt-BR');
    };

    async function carregarNumeros() {
        const arvore = await api('/admin/tree').catch(() => null);

        if (Array.isArray(arvore)) {
            const modulos = arvore.flatMap(t => Array.isArray(t.lessons) ? t.lessons : []);
            numero('trilhas', arvore.length);
            numero('modulos', modulos.length);
            numero('questoes', modulos.reduce((s, l) => s + (Array.isArray(l.questions) ? l.questions.length : 0), 0));
        }

        if (ehAdm) {
            const geral = await api('/admin/system/overview').catch(() => null);
            if (geral && geral.database) numero('usuarios', geral.database.users);
        }

        return arvore;
    }

    /* ============================================================
       [GX-STATUS] — banco e APIs (só adm)
       ============================================================ */

    const VERIFICAR = [
        { nome: 'Banco de dados', detalhe: 'Turso / libSQL', rota: '/health', ok: d => d && d.ok && d.status === 'online' },
        { nome: 'API de autenticação', detalhe: '/api/auth/me', rota: '/auth/me' },
        { nome: 'API de trilhas', detalhe: '/api/admin/tree', rota: '/admin/tree' },
        { nome: 'API de dúvidas', detalhe: '/api/doubts', rota: '/doubts' },
        { nome: 'API do sistema', detalhe: '/api/admin/system/overview', rota: '/admin/system/overview' },
        { nome: 'Versão publicada', detalhe: '/api/version', rota: '/version' },
        // Nix: testa a base, a chave e se a IA (Groq) responde — sem gastar créditos
        {
            nome: 'Nix · Assistente IA',
            detalhe: 'base das trilhas + IA (Groq)',
            rota: '/admin/chatbot/teste',
            ok: d => d && d.ok,
            estadoOk: d => `ok <small>IA ${Number(d.ms_ia) || 0} ms</small>`,
            estadoErro: d => d && d.motivo ? `desligado <small>${esc(d.motivo)}</small>` : 'fora do ar'
        }
    ];

    let verificando = false;

    async function verificarStatus(forcar = false) {
        if (!ehAdm || verificando) return;
        verificando = true;

        const lista = $('gxStatusLista');
        const geral = $('gxStatusGeral');
        const info = $('gxStatusInfo');
        const botao = $('gxStatusAtualizar');

        botao.disabled = true;
        geral.className = 'gx-selo';
        geral.textContent = 'Verificando…';

        lista.innerHTML = VERIFICAR.map((v, n) => `
            <li class="gx-st" id="gxSt${n}">
                <span class="gx-st__ponto is-espera" aria-hidden="true"></span>
                <span class="gx-st__nome"><b>${esc(v.nome)}</b><small>${esc(v.detalhe)}</small></span>
                <span class="gx-st__estado">verificando…</span>
            </li>
        `).join('');

        const resultados = await Promise.all(VERIFICAR.map(async (v, n) => {
            const inicio = performance.now();
            let ok = false;
            let dados = null;
            let erro = '';

            try {
                // "Verificar de novo" refaz o teste do Nix na hora (senão vale o último, de até 1 min)
                dados = await api(v.rota + (forcar && v.rota === '/admin/chatbot/teste' ? '?novo=1' : ''));
                ok = v.ok ? !!v.ok(dados) : true;
            } catch (e) {
                erro = (e && e.message) || 'sem resposta';
            }

            const ms = Math.round(performance.now() - inicio);
            const li = $('gxSt' + n);
            const lento = ok && ms > 1500;

            if (li) {
                li.querySelector('.gx-st__ponto').className =
                    'gx-st__ponto ' + (ok ? (lento ? 'is-lento' : 'is-ok') : 'is-erro');
                li.querySelector('.gx-st__estado').innerHTML = ok
                    ? (v.estadoOk ? v.estadoOk(dados) : `${n === 0 ? 'online' : 'ok'} <small>${ms} ms</small>`)
                    : (v.estadoErro && !erro ? v.estadoErro(dados) : `<span title="${esc(erro)}">fora do ar</span>`);
            }

            return { ok, dados, v };
        }));

        const falhas = resultados.filter(r => !r.ok).length;

        geral.className = 'gx-selo ' + (falhas ? 'is-erro' : 'is-ok');
        geral.textContent = falhas
            ? (falhas === 1 ? '1 serviço com problema' : falhas + ' serviços com problema')
            : 'Tudo funcionando';

        const versao = resultados[5].ok && resultados[5].dados;
        const sistema = resultados[4].ok && resultados[4].dados;
        const partes = [];

        if (versao && versao.hash) partes.push('Versão ' + versao.hash);
        if (sistema && sistema.server) partes.push('Node ' + sistema.server.nodeVersion);
        if (sistema && sistema.database) partes.push(sistema.database.tableCount + ' tabelas');
        partes.push('verificado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

        info.textContent = partes.join(' · ');
        botao.disabled = false;
        verificando = false;
    }


    /* ============================================================
       [GX-CONTADORES] — números nos atalhos Trilhas e Perguntas e respostas
       ============================================================ */

    const contador = (id, valor, alerta = false) => {
        const el = $(id);
        if (!el) return;
        el.hidden = valor == null;
        el.textContent = valor == null ? '' : Number(valor).toLocaleString('pt-BR');
        el.classList.toggle('is-alerta', !!alerta);
        el.title = id === 'gxQtdDuvidas'
            ? (valor ? valor + ' dúvida(s) sem resposta' : 'Nenhuma dúvida esperando resposta')
            : valor + ' trilha(s) cadastrada(s)';
    };

    // Dúvidas sem resposta: número do topo + contador do atalho
    async function contarDuvidas() {
        const dados = await api('/doubts').catch(() => null);
        if (!dados || !Array.isArray(dados.doubts)) return;

        const pendentes = dados.doubts.filter(d => !d.answered).length;
        numero('duvidas', pendentes);
        contador('gxQtdDuvidas', pendentes, pendentes > 0);
    }

    secao.addEventListener('click', e => {
        if (e.target.closest('#gxStatusAtualizar')) verificarStatus(true);
    });


    /* ============================================================
       CARREGAR
       ============================================================ */

    const cargaNumeros = carregarNumeros();
    carregando($('gxNumeros'), 'Carregando números…', cargaNumeros);
    cargaNumeros.then(arvore => {
        if (Array.isArray(arvore)) contador('gxQtdTrilhas', arvore.length);
    });
    contarDuvidas();
    verificarStatus();
})();
