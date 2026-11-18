/* ============================================================
   DRAGNIX — js/voltar.js  (BOTÃO "← VOLTAR" DAS PÁGINAS)
   ============================================================

   Coloca o mesmo botão "← Voltar" do app (estilo .dragnix-back-btn,
   css/style.css) no topo do conteúdo das páginas que não tinham:
   Controle financeiro, CDB, Educação financeira, Painel administrativo
   e Sistema. (O app.html tem o próprio, no js/app.js; a página inicial
   e o login não têm, porque são o ponto de partida.)

   Para onde ele leva, nesta ordem:
     1. navegou dentro da página (ex.: Gastos → Simulador): passo anterior;
     2. está numa subárea: volta para a principal da página
        (painel do adm → Visão geral; Controle financeiro → Gastos do mês);
     3. veio de outra página do site: volta para ela;
     4. abriu a página direto: vai para o Início.
   ============================================================ */

(() => {
    'use strict';
    if (window.__dgxVoltar) return;
    window.__dgxVoltar = true;

    const main = document.querySelector('main');
    if (!main) return;

    const pagina = location.pathname.split('/').pop() || 'index.html';

    // subárea "principal" de cada página (passo 2)
    const PRINCIPAL = {
        'admin.html': {
            estaNaPrincipal: () => {
                const ativa = document.querySelector('#t0.is-active, #t1.is-active, #t2.is-active, #t3.is-active, #t4.is-active, #t5.is-active, #t6.is-active');
                return !ativa || ativa.id === 't0';
            },
            irParaPrincipal: () => {
                try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* ignora */ }
                document.getElementById('t0')?.click();
                window.scrollTo(0, 0);
            }
        },
        'controle-financeiro.html': {
            estaNaPrincipal: () => !location.hash || location.hash === '#gastos',
            irParaPrincipal: () => location.replace('#gastos')
        }
    };

    // passo 1: quantas vezes a pessoa trocou de tela por #endereço aqui dentro
    let passosInternos = 0;
    window.addEventListener('hashchange', () => { passosInternos++; });

    const veioDeOutraPagina = (() => {
        try {
            const ref = new URL(document.referrer);
            return ref.origin === location.origin && ref.pathname !== location.pathname;
        } catch {
            return false;
        }
    })();

    function voltar() {
        if (passosInternos > 0 && pagina !== 'admin.html') {
            passosInternos -= 2;            // o próprio voltar dispara um hashchange
            history.back();
            return;
        }

        const principal = PRINCIPAL[pagina];
        if (principal && !principal.estaNaPrincipal()) {
            principal.irParaPrincipal();
            return;
        }

        if (veioDeOutraPagina && history.length > 1) {
            history.back();
            return;
        }

        location.href = 'pag-inicial.html';
    }

    const seta = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';

    const caixa = document.createElement('div');
    caixa.className = 'dragnix-back-container dgx-voltar-pagina';

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'dragnix-back-btn';
    botao.setAttribute('aria-label', 'Voltar para a tela anterior');
    botao.innerHTML = `<span class="dragnix-back-icon">${seta}</span><span class="dragnix-back-label">Voltar</span>`;
    botao.addEventListener('click', voltar);

    caixa.appendChild(botao);

    // primeiro item visível do conteúdo (antes do título da página)
    const primeiroVisivel = [...main.children].find(el => !(el.tagName === 'svg' || el.matches('svg, script, style, [hidden]')));
    main.insertBefore(caixa, primeiroVisivel || main.firstChild);
})();
