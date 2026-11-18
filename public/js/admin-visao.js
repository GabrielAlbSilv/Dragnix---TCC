/* ============================================================
   DRAGNIX — js/admin-visao.js  (VISÃO GERAL DO PAINEL)
   ============================================================

   Área "Visão geral" do admin.html (botão #t0). É a tela que abre
   ao entrar no painel (pelo "Painel ADM" / "Painel Professor" do
   card do perfil): mostra TODAS as funções disponíveis para o papel,
   com uma descrição, os números atuais e um botão para abrir cada uma.

     [VG-ATALHOS]  ações rápidas (nova trilha, responder dúvidas...)
     [VG-FUNCOES]  um card por função do painel

   Administrador vê tudo; professor vê só o que pode usar.
   Endereços diretos (admin.html#trilhas, #usuarios, #nova-trilha...)
   continuam abrindo direto a área pedida, sem passar por aqui.

   Precisa vir DEPOIS do js/admin.js ($, api, esc, comCarregando).
   ============================================================ */

(function () {
    'use strict';

    const botao = document.getElementById('t0');
    if (!botao) return;

    const ehAdm = typeof me === 'function' && me()?.role === 'adm';
    const ic = nome => (typeof window.icon === 'function' ? window.icon(nome) : '');
    const num = v => (v == null ? '–' : Number(v).toLocaleString('pt-BR'));

    // Abre uma área do painel pelo botão do menu (mesmo efeito do clique)
    const abrirArea = id => {
        const b = document.getElementById(id);
        if (b) b.click();
        window.scrollTo(0, 0);
    };

    async function carregarNumeros() {
        const pegar = p => api(p).catch(() => null);

        const [arvore, duvidas, avaliacoes, sistema, conquistas, avatares, saude, nix] = await Promise.all([
            pegar('/admin/tree'),
            pegar('/doubts'),
            pegar('/admin/evaluations'),
            ehAdm ? pegar('/admin/system/overview') : null,
            ehAdm ? pegar('/admin/badges') : null,
            ehAdm ? pegar('/avatars') : null,
            ehAdm ? pegar('/health') : null,
            pegar('/chatbot/status')
        ]);

        const trilhas = Array.isArray(arvore) ? arvore : [];
        const modulos = trilhas.flatMap(t => Array.isArray(t.lessons) ? t.lessons : []);
        const questoes = modulos.reduce((s, l) => s + (Array.isArray(l.questions) ? l.questions.length : 0), 0);
        const listaDuvidas = Array.isArray(duvidas && duvidas.doubts) ? duvidas.doubts : [];

        return {
            trilhas: Array.isArray(arvore) ? trilhas.length : null,
            modulos: Array.isArray(arvore) ? modulos.length : null,
            questoes: Array.isArray(arvore) ? questoes : null,
            pendentes: duvidas ? listaDuvidas.filter(d => !d.answered).length : null,
            duvidas: duvidas ? listaDuvidas.length : null,
            avaliacoes: avaliacoes && avaliacoes.totals ? avaliacoes.totals : null,
            usuarios: sistema && sistema.database ? sistema.database.users : null,
            tabelas: sistema && sistema.database ? sistema.database.tableCount : null,
            conquistas: conquistas ? { criadas: (conquistas.custom || []).length, padrao: (conquistas.builtin || []).length } : null,
            avatares: avatares && Array.isArray(avatares.presets) ? { qtd: avatares.presets.length, max: avatares.max } : null,
            bancoOnline: saude ? !!(saude.ok && saude.status === 'online') : null,
            nix
        };
    }

    function cardHtml(c) {
        return `
            <article class="vg-card" style="--vg-cor:${c.cor}">
                <header class="vg-card__topo">
                    <span class="vg-card__ico" aria-hidden="true">${ic(c.ico)}</span>
                    <div>
                        <h3>${c.titulo}</h3>
                        ${c.soAdm ? '<span class="vg-tag">Só administradores</span>' : ''}
                    </div>
                </header>

                <p class="vg-card__desc">${c.desc}</p>

                ${c.itens ? `<ul class="vg-card__itens">${c.itens.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}

                ${c.numero ? `<p class="vg-card__num">${c.numero}</p>` : ''}

                <div class="vg-card__acoes">
                    ${c.acoes.map((a, n) => a.href
                        ? `<a class="btn${n ? ' sec' : ''} vg-btn" href="${a.href}">${a.texto}</a>`
                        : `<button type="button" class="btn${n ? ' sec' : ''} vg-btn" data-vg-area="${a.area || ''}" data-vg-hash="${a.hash || ''}">${a.texto}</button>`
                    ).join('')}
                </div>
            </article>
        `;
    }

    async function visaoGeral() {
        const n = await carregarNumeros();
        const av = n.avaliacoes;

        const CARDS = [
            {
                ico: 'map', cor: '#58cc02', titulo: 'Trilhas e módulos',
                desc: 'Crie e organize as trilhas, os módulos, as questões e os desafios de cada trilha.',
                itens: ['Apresentação e conclusão da trilha', 'Explicação em partes e 5 tipos de questão', 'Pré-requisitos entre trilhas', 'Desafios com tempo, precisão e mais'],
                numero: `${num(n.trilhas)} trilhas · ${num(n.modulos)} módulos · ${num(n.questoes)} questões`,
                acoes: [{ texto: 'Abrir trilhas', area: 't1' }, { texto: '+ Nova trilha', hash: 'nova-trilha' }]
            },
            {
                ico: 'message-circle', cor: '#1cb0f6', titulo: 'Perguntas e respostas',
                desc: 'Veja as dúvidas enviadas pelos alunos e responda a cada uma.',
                numero: n.pendentes == null ? '' : (n.pendentes ? `<b class="vg-alerta">${num(n.pendentes)} sem resposta</b> · ${num(n.duvidas)} no total` : `Nenhuma dúvida esperando · ${num(n.duvidas)} no total`),
                acoes: [{ texto: 'Responder dúvidas', href: 'app.html#duvidas' }]
            },
            {
                ico: 'bot', cor: '#8b3fd9', titulo: 'Nix · Assistente com IA',
                desc: 'Responde as dúvidas dos alunos com base no conteúdo das trilhas. Não pesquisa na internet, não dá respostas de questões e não aconselha investimentos.',
                numero: !n.nix ? ''
                    : n.nix.ativo
                        ? `<b class="vg-ok">● Funcionando</b> · ${num(n.nix.trechos)} trechos de ${num((n.nix.trilhas || []).length)} trilhas`
                        : `<b class="vg-alerta">● Desligado</b>${ehAdm && n.nix.motivo ? ' · ' + n.nix.motivo : ''}`,
                acoes: [{ texto: 'Abrir o Nix', href: 'app.html#nix' }]
            },
            {
                ico: 'star', cor: '#f5b301', titulo: 'Avaliações',
                desc: 'Notas de 1 a 5 que os alunos deram às trilhas e aos módulos, com a distribuição e as mais recentes.',
                numero: av ? `${num(av.count)} avaliações · média ${av.average == null ? '–' : String(av.average).replace('.', ',')}` : '',
                acoes: [{ texto: 'Ver avaliações', area: 't5' }]
            },
            ...(ehAdm ? [
                {
                    ico: 'users', cor: '#8b3fd9', titulo: 'Usuários', soAdm: true,
                    desc: 'Veja as contas cadastradas e defina o papel de cada pessoa: aluno, professor ou administrador.',
                    numero: n.usuarios == null ? '' : `${num(n.usuarios)} usuários`,
                    acoes: [{ texto: 'Gerenciar usuários', area: 't2' }]
                },
                {
                    ico: 'sliders-horizontal', cor: '#0ea5e9', titulo: 'Regras de negócio', soAdm: true,
                    desc: 'Defina o XP de cada nível e o nome dele, quanto XP e moedas cada ação dá, as vidas e as missões diárias.',
                    itens: ['Níveis com nome (ex.: Nível 4 — Dragão estudioso)', 'XP por acerto, bônus e % ao refazer', 'Vidas, recarga e missões', 'Conquistas e avatares'],
                    acoes: [{ texto: 'Abrir regras', hash: 'regras' }]
                },
                {
                    ico: 'trophy', cor: '#d97706', titulo: 'Conquistas', soAdm: true,
                    desc: 'Crie conquistas com emoji ou imagem e uma condição (lições, XP, sequência, trilha...). Elas são dadas sozinhas aos alunos.',
                    numero: n.conquistas ? `${num(n.conquistas.criadas)} criadas · ${num(n.conquistas.padrao)} padrão do sistema` : '',
                    acoes: [{ texto: 'Abrir conquistas', hash: 'conquistas' }]
                },
                {
                    ico: 'smile', cor: '#ec4899', titulo: 'Avatares', soAdm: true,
                    desc: 'Galeria de avatares que os alunos podem escolher no perfil.',
                    numero: n.avatares ? `${num(n.avatares.qtd)} de ${num(n.avatares.max)} avatares` : '',
                    acoes: [{ texto: 'Abrir avatares', hash: 'avatares' }]
                },
                {
                    ico: 'database', cor: '#64748b', titulo: 'Sistema e banco', soAdm: true,
                    desc: 'Situação do servidor e do banco (Turso), tabelas, backup e restauração.',
                    numero: n.bancoOnline == null ? '' : `${n.bancoOnline ? '<b class="vg-ok">● Banco online</b>' : '<b class="vg-alerta">● Banco fora do ar</b>'}${n.tabelas ? ` · ${num(n.tabelas)} tabelas` : ''}`,
                    acoes: [{ texto: 'Abrir sistema', href: 'admin-sistema.html' }]
                }
            ] : []),
            {
                ico: 'graduation-cap', cor: '#14b8a6', titulo: 'Ver como aluno',
                desc: 'Abra a área do aluno para conferir as trilhas, os módulos e o ranking como eles aparecem.',
                acoes: [{ texto: 'Abrir área do aluno', href: 'app.html' }, { texto: 'Página inicial', href: 'pag-inicial.html' }]
            }
        ];

        const ATALHOS = [
            { texto: `${ic('plus')} Nova trilha`, hash: 'nova-trilha', destaque: true },
            { texto: `${ic('message-circle')} Responder dúvidas${n.pendentes ? ` <span class="vg-bolha">${num(n.pendentes)}</span>` : ''}`, href: 'app.html#duvidas' },
            ...(ehAdm ? [{ texto: `${ic('trophy')} Nova conquista`, hash: 'conquistas' }, { texto: `${ic('sliders-horizontal')} Regras de negócio`, hash: 'regras' }] : []),
            { texto: `${ic('star')} Avaliações`, area: 't5' }
        ];

        $('main').innerHTML = `
            <div class="vg">
                <!-- [VG-ATALHOS] -->
                <section class="vg-atalhos" aria-label="Ações rápidas">
                    ${ATALHOS.map(a => a.href
                        ? `<a class="vg-atalho" href="${a.href}">${a.texto}</a>`
                        : `<button type="button" class="vg-atalho${a.destaque ? ' vg-atalho--destaque' : ''}" data-vg-area="${a.area || ''}" data-vg-hash="${a.hash || ''}">${a.texto}</button>`
                    ).join('')}
                </section>

                <!-- [VG-FUNCOES] -->
                <h2 class="vg-titulo">Todas as funções do painel</h2>
                <div class="vg-grade">
                    ${CARDS.map(cardHtml).join('')}
                </div>

                <p class="vg-dica mut">
                    ${ic('info')} Dica: o menu à esquerda (Gerenciamento) leva às mesmas áreas.
                    ${ehAdm ? '' : 'Usuários, conquistas, avatares e o sistema são exclusivos dos administradores.'}
                </p>
            </div>
        `;

        $('main').querySelectorAll('[data-vg-area], [data-vg-hash]').forEach(b => {
            if (b.tagName === 'A') return;
            b.addEventListener('click', () => {
                if (b.dataset.vgHash) {
                    // o admin.js abre a área pedida (ex.: formulário de nova trilha)
                    if (window.location.hash === '#' + b.dataset.vgHash) {
                        window.dispatchEvent(new HashChangeEvent('hashchange'));
                    } else {
                        window.location.hash = b.dataset.vgHash;
                    }
                } else if (b.dataset.vgArea) {
                    abrirArea(b.dataset.vgArea);
                }
            });
        });
    }

    const abrir = () => visaoGeral().catch(err => {
        alert((err && err.message) || 'Não foi possível carregar a visão geral.');
    });

    botao.onclick = typeof comCarregando === 'function'
        ? comCarregando('Carregando visão geral…', abrir)
        : abrir;

    window.visaoGeral = visaoGeral;

    // Entrou no painel sem pedir uma área específica: abre a visão geral
    if (!window.location.hash) {
        botao.click();
    }
})();
