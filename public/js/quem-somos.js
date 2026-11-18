/* ============================================================
   DRAGNIX — js/quem-somos.js  (CARD "QUEM SOMOS" DO RODAPÉ)
   ============================================================

   O link "Quem somos" do rodapé abre um card (janela) com a equipe:
   foto, nome e funções de cada pessoa. Não existe página nova.

     [QS-EQUIPE]   nomes, funções e fotos (css/images/equipe/)
     [QS-CARD]     monta a janela (<dialog>) na primeira vez que abre
     [QS-LINK]     liga o link "Quem somos" do rodapé

   Visual: css/quem-somos.css (carregado sozinho por este arquivo),
   com modo claro/escuro e celular.
   Para abrir por código ou comando de voz: window.dgxQuemSomos.abrir()
   ============================================================ */

(() => {
    'use strict';
    if (window.dgxQuemSomos) return;

    /* [QS-EQUIPE] — mesma ordem do slide "Equipe" do pitch */
    const EQUIPE = [
        {
            nome: 'Gabriel Albuquerque de Moura Silva',
            foto: 'gabriel-albuquerque.jpg',
            funcoes: ['Dev Back-end', 'QA (Quality Assurance)']
        },
        {
            nome: 'Gabriel Rainha Fonseca',
            foto: 'gabriel-rainha.jpg',
            funcoes: ['Analista de Dados', 'Suporte Pedagógico']
        },
        {
            nome: 'Luiza de Sousa Carvalho',
            foto: 'luiza-carvalho.jpg',
            funcoes: ['Dev Front-end', 'UX/UI', 'Design', 'Gestão de Projetos']
        },
        {
            nome: 'Victor Henrique de Souza Abdala Obeid',
            foto: 'victor-obeid.jpg',
            funcoes: ['Analista Pedagógico', 'Analista de Mercado']
        },
        {
            nome: 'Flávio Henrique Mezzaroba de Castro',
            foto: 'flavio-castro.jpg',
            funcoes: ['DBA', 'Webmaster', 'QA (Quality Assurance)']
        }
    ];

    const PASTA_FOTOS = 'css/images/equipe/';

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* o CSS vem junto, para bastar um <script> em cada página */
    if (!document.querySelector('link[href^="css/quem-somos.css"]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'css/quem-somos.css?v=1';
        document.head.appendChild(css);
    }

    /* [QS-CARD] */
    let janela = null;
    let quemAbriu = null;

    function montar() {
        janela = document.createElement('dialog');
        janela.className = 'qs';
        janela.setAttribute('aria-labelledby', 'qsTitulo');
        janela.setAttribute('aria-describedby', 'qsTexto');

        janela.innerHTML = `
            <div class="qs__caixa">
                <button type="button" class="qs__fechar" aria-label="Fechar Quem somos">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>

                <div class="qs__topo">
                    <span class="qs__selo">Equipe Dragnix</span>
                    <h2 id="qsTitulo">Quem somos</h2>
                    <p id="qsTexto">
                        Somos a equipe por trás do Dragnix, uma escola online de educação e
                        controle financeiro. Nosso objetivo: <strong>educação financeira descomplicada</strong>
                        e acessível para todo mundo.
                    </p>
                </div>

                <ul class="qs__grade">
                    ${EQUIPE.map(p => `
                        <li class="qs__pessoa">
                            <span class="qs__foto">
                                <img src="${PASTA_FOTOS + p.foto}" alt="Foto de ${esc(p.nome)}" width="320" height="320" loading="lazy" decoding="async">
                            </span>
                            <h3 class="qs__nome">${esc(p.nome)}</h3>
                            <ul class="qs__funcoes" aria-label="Funções">
                                ${p.funcoes.map(f => `<li>${esc(f)}</li>`).join('')}
                            </ul>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;

        document.body.appendChild(janela);

        janela.querySelector('.qs__fechar').addEventListener('click', fechar);

        /* clique fora do card (no fundo escuro) fecha */
        janela.addEventListener('click', e => {
            if (e.target === janela) fechar();
        });

        /* Esc: o <dialog> avisa com "cancel"; fechamos do mesmo jeito do botão */
        janela.addEventListener('cancel', e => {
            e.preventDefault();
            fechar();
        });

        /* se algo fechar o <dialog> por fora, libera a página também */
        janela.addEventListener('close', depoisDeFechar);
    }

    /* libera a rolagem da página e devolve o foco a quem abriu */
    function depoisDeFechar() {
        if (!document.documentElement.classList.contains('qs-aberto')) return;
        document.documentElement.classList.remove('qs-aberto');
        if (quemAbriu && quemAbriu.focus) quemAbriu.focus();
        quemAbriu = null;
    }

    function abrir() {
        if (!janela) montar();
        if (janela.open) return true;
        quemAbriu = document.activeElement;
        document.documentElement.classList.add('qs-aberto');
        if (typeof janela.showModal === 'function') janela.showModal();
        else janela.setAttribute('open', '');
        janela.querySelector('.qs__fechar').focus();
        return true;
    }

    function fechar() {
        if (!janela) return;
        if (typeof janela.close === 'function' && janela.open) janela.close();
        else janela.removeAttribute('open');
        depoisDeFechar();
    }

    window.dgxQuemSomos = { abrir, fechar };

    /* [QS-LINK] — o link do rodapé abre o card (sem trocar de página nem de #) */
    const ehLinkQuemSomos = el =>
        el && el.tagName === 'A' && el.textContent.trim().toLowerCase() === 'quem somos';

    function ligarLinks() {
        document.querySelectorAll('.dgx-footer-links a').forEach(a => {
            if (!ehLinkQuemSomos(a)) return;
            a.setAttribute('href', '#quem-somos');
            a.setAttribute('role', 'button');
            a.setAttribute('aria-haspopup', 'dialog');
        });

        // endereço direto (ex.: index.html#quem-somos) abre o card
        if (location.hash === '#quem-somos') abrir();
    }

    document.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('a');
        if (!ehLinkQuemSomos(a)) return;
        e.preventDefault();
        e.stopPropagation();
        abrir();
    }, true);

    /* role="button": espaço também ativa */
    document.addEventListener('keydown', e => {
        if (e.key === ' ' && ehLinkQuemSomos(document.activeElement)) {
            e.preventDefault();
            abrir();
        }
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligarLinks);
    else ligarLinks();
})();
