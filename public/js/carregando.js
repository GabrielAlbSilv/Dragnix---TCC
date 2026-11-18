/* ============================================================
   DRAGNIX — js/carregando.js  (INDICADORES DE CARREGAMENTO)
   ============================================================

   Coloque em TODA página, ANTES dos outros scripts que buscam dados
   (logo depois do js/theme.js). Não precisa de CSS extra: o estilo
   vem junto, aqui embaixo.

   O que faz:
     [CG-BARRA-TOPO]  barra fina no topo da tela enquanto qualquer
                      busca ao servidor (/api/...) está em andamento
     [CG-MINI-TELA]   cartão com barra de progresso para colocar no
                      lugar de uma lista que ainda está chegando:
                         dgxCarregando.html('Carregando trilhas…')
     [CG-COBRIR]      cobre uma área enquanto uma busca termina, sem
                      apagar o que já estava lá:
                         dgxCarregando.cobrir(elemento, 'Carregando…', promessa)
     [CG-TROCAR]      troca de tela: o conteúdo antigo some NA HORA e a
                      mini-tela fica no lugar até a tela nova chegar
                      (assim ninguém acha que clicou na opção errada):
                         dgxCarregando.trocar(elemento, 'Carregando…', () => abrirTela())

   Buscas rápidas (menos de 0,15 s) não mostram nada, para não piscar.
   ============================================================ */

(function () {
    'use strict';

    if (window.dgxCarregando) return;

    const ATRASO = 150;    /* ms antes de mostrar (evita piscar em buscas rápidas) */


    /* ============================================================
       ESTILO (injetado uma vez)
       ============================================================ */

    const CSS = `
.dgx-topbar{position:fixed;top:0;left:0;right:0;z-index:2147483600;height:3px;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .2s}
.dgx-topbar.is-on{opacity:1}
.dgx-topbar::before{content:"";position:absolute;inset:0;width:40%;border-radius:0 3px 3px 0;
  background:linear-gradient(90deg,#8b3fd9,#58cc02);box-shadow:0 0 10px #8b3fd9;animation:dgxDeslizar 1.1s ease-in-out infinite}
.dgx-load{display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;margin:24px auto;padding:20px 22px;
  border:1px solid color-mix(in srgb,#8b3fd9 35%,transparent);border-radius:18px;
  background:color-mix(in srgb,var(--theme-surface,#1c1c1c) 88%,transparent);color:var(--theme-text,#eee);
  box-shadow:0 12px 35px rgba(0,0,0,.12);font:inherit;text-align:left}
.dgx-load--compacto{margin:8px 0;padding:12px 14px;gap:9px;max-width:none;box-shadow:none}
.dgx-load__topo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px}
.dgx-load--compacto .dgx-load__topo{font-size:13px}
.dgx-load__icone{display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:10px;
  background:color-mix(in srgb,#8b3fd9 22%,transparent);color:#8b3fd9}
.dgx-load--compacto .dgx-load__icone{width:24px;height:24px;border-radius:8px}
.dgx-load__icone svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;animation:dgxGirar 1s linear infinite}
.dgx-load__barra{position:relative;height:8px;overflow:hidden;border-radius:99px;background:color-mix(in srgb,var(--theme-text,#eee) 12%,transparent)}
.dgx-load__barra span{position:absolute;inset:0;width:45%;border-radius:99px;background:linear-gradient(90deg,#8b3fd9,#58cc02);
  box-shadow:0 0 10px color-mix(in srgb,#58cc02 60%,transparent);animation:dgxDeslizar 1.2s ease-in-out infinite}
.dgx-load__linhas{display:grid;gap:8px}
.dgx-load__linhas i{display:block;height:10px;border-radius:6px;background:linear-gradient(90deg,
  color-mix(in srgb,var(--theme-text,#eee) 8%,transparent) 0%,color-mix(in srgb,var(--theme-text,#eee) 18%,transparent) 50%,
  color-mix(in srgb,var(--theme-text,#eee) 8%,transparent) 100%);background-size:200% 100%;animation:dgxBrilho 1.4s ease-in-out infinite}
.dgx-load__linhas i:nth-child(2){width:82%}
.dgx-load__linhas i:nth-child(3){width:60%}
[data-dgx-antigo]{display:none!important}
.dgx-cobrir{position:relative}
.dgx-cobrir--vazio{min-height:220px}
.dgx-cobrir__capa{position:absolute;inset:0;z-index:20;display:flex;align-items:flex-start;justify-content:center;padding:6px;
  border-radius:inherit;background:color-mix(in srgb,var(--theme-bg,#121212) 45%,transparent);
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:dgxSurgir .2s ease}
.dgx-cobrir__capa .dgx-load{position:sticky;top:20px;margin-top:20px}
@keyframes dgxDeslizar{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}
@keyframes dgxBrilho{0%{background-position:100% 0}100%{background-position:-100% 0}}
@keyframes dgxGirar{to{transform:rotate(360deg)}}
@keyframes dgxSurgir{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .dgx-topbar::before,.dgx-load__barra span{animation-duration:3s}
  .dgx-load__linhas i,.dgx-load__icone svg{animation:none}
}`;

    const estilo = document.createElement('style');
    estilo.id = 'dgxCarregandoCss';
    estilo.textContent = CSS;
    (document.head || document.documentElement).appendChild(estilo);

    const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));


    /* ============================================================
       [CG-MINI-TELA]
       ============================================================ */

    function html(texto = 'Carregando…', opcoes = {}) {
        return `
            <div class="dgx-load${opcoes.compacto ? ' dgx-load--compacto' : ''}" role="status" aria-live="polite">
                <div class="dgx-load__topo">
                    <span class="dgx-load__icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span>
                    <span>${escapar(texto)}</span>
                </div>
                <div class="dgx-load__barra" aria-hidden="true"><span></span></div>
                ${opcoes.compacto ? '' : '<div class="dgx-load__linhas" aria-hidden="true"><i></i><i></i><i></i></div>'}
            </div>`;
    }

    function em(elemento, texto, opcoes) {
        if (elemento) elemento.innerHTML = html(texto, opcoes);
    }


    /* ============================================================
       [CG-COBRIR] — capa por cima da área enquanto a promessa não termina
       ============================================================ */

    function cobrir(elemento, texto, promessa) {
        const p = Promise.resolve(promessa);

        if (!elemento) return p;

        let capa = null;

        const timer = setTimeout(() => {
            capa = document.createElement('div');
            capa.className = 'dgx-cobrir__capa';
            capa.innerHTML = html(texto);
            elemento.classList.add('dgx-cobrir');
            elemento.classList.toggle('dgx-cobrir--vazio', elemento.offsetHeight < 200);
            elemento.setAttribute('aria-busy', 'true');
            elemento.appendChild(capa);
        }, ATRASO);

        const tirar = () => {
            clearTimeout(timer);
            if (capa) capa.remove();
            elemento.classList.remove('dgx-cobrir', 'dgx-cobrir--vazio');
            elemento.removeAttribute('aria-busy');
        };

        p.then(tirar, tirar);

        return p;
    }


    /* ============================================================
       [CG-TROCAR] — troca de tela sem mostrar a tela anterior
       executar() desenha a tela nova (pode devolver uma promessa).
       Enquanto ela não termina: o conteúdo antigo fica escondido e a
       mini-tela aparece no lugar. Se a tela nova não chegar a ser
       desenhada (erro), o conteúdo antigo volta.
       ============================================================ */

    function trocar(elemento, texto, executar) {
        if (!elemento) return executar();

        const antigos = [...elemento.children];
        const resultado = executar();

        if (!resultado || typeof resultado.then !== 'function') return resultado;

        /* a tela nova já desenhou algo sozinha (ex.: a própria mini-tela): nada a fazer.
           Área VAZIA (primeira abertura da página): mostra a mini-tela do mesmo jeito. */
        const aindaLa = antigos.filter(el => el.parentNode === elemento);
        const vazia = !elemento.children.length;
        if (!aindaLa.length && !vazia) return resultado;

        aindaLa.forEach(el => el.setAttribute('data-dgx-antigo', ''));

        const carga = document.createElement('div');
        carga.className = 'dgx-trocar';
        carga.innerHTML = html(texto);
        elemento.appendChild(carga);
        elemento.setAttribute('aria-busy', 'true');

        const terminar = () => {
            carga.remove();
            elemento.removeAttribute('aria-busy');
            aindaLa.forEach(el => el.removeAttribute('data-dgx-antigo'));
        };

        resultado.then(terminar, terminar);

        return resultado;
    }


    /* ============================================================
       [CG-BARRA-TOPO] — conta as buscas /api/ em andamento
       ============================================================ */

    let ativos = 0;
    let timerBarra = null;
    let barra = null;

    function mostrarBarra() {
        if (!document.body) return;
        if (!barra) {
            barra = document.createElement('div');
            barra.className = 'dgx-topbar';
            barra.setAttribute('aria-hidden', 'true');
            document.body.appendChild(barra);
        }
        barra.classList.add('is-on');
    }

    function inicio() {
        ativos++;
        if (ativos === 1) {
            clearTimeout(timerBarra);
            timerBarra = setTimeout(mostrarBarra, ATRASO);
        }
    }

    function fim() {
        ativos = Math.max(0, ativos - 1);
        if (!ativos) {
            clearTimeout(timerBarra);
            if (barra) barra.classList.remove('is-on');
        }
    }

    const fetchOriginal = window.fetch.bind(window);

    window.fetch = function (entrada, opcoes) {
        const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
        const contar = /(^|\/\/[^/]+)\/api\//.test(url) && !/\/api\/avatar\//.test(url);

        if (!contar) return fetchOriginal(entrada, opcoes);

        /* qualquer gravação na API (POST/PUT/DELETE, inclusive backup) apaga
           as respostas guardadas pelo js/api.js, para nada ficar desatualizado */
        const metodo = String((opcoes && opcoes.method) || (entrada && entrada.method) || 'GET').toUpperCase();
        if (metodo !== 'GET' && metodo !== 'HEAD') {
            try { sessionStorage.removeItem('dgx-api-cache'); } catch { /* ignora */ }
        }

        inicio();
        return fetchOriginal(entrada, opcoes).finally(fim);
    };

    window.dgxCarregando = { html, em, cobrir, trocar, inicio, fim };
})();
