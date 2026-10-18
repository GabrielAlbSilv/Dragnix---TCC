/* ============================================================
   DRAGNIX — MENU LATERAL
   No celular o menu é uma gaveta: abre pelo botão ao lado da logo
   e fecha pelo X, clicando fora, num link ou com a tecla Esc.
   No computador ele fica sempre à mostra.
   ============================================================ */

(function () {

    const menu = document.getElementById('sideMenu');
    const abrir = document.getElementById('sideToggle');
    const fechar = document.getElementById('sideClose');
    const fundo = document.getElementById('sideOverlay');

    if (!menu) return;

    const celular = window.matchMedia('(max-width: 760px)');

    const layout = document.querySelector('.layout');

    function setOpen(aberto) {
        if (!celular.matches) {                 // computador: recolhe/expande
            if (layout) layout.classList.toggle('side-collapsed', !aberto);
            if (abrir) abrir.setAttribute('aria-expanded', String(aberto));
            return;
        }
        menu.classList.toggle('is-open', aberto);
        if (fundo) fundo.classList.toggle('is-open', aberto);
        if (abrir) abrir.setAttribute('aria-expanded', String(aberto));
        document.body.classList.toggle('side-locked', aberto && celular.matches);
    }

    if (abrir) abrir.addEventListener('click', function () {
        const aberto = celular.matches
            ? menu.classList.contains('is-open')
            : !(layout && layout.classList.contains('side-collapsed'));
        setOpen(!aberto);
    });
    if (fechar) fechar.addEventListener('click', function () { setOpen(false); });
    if (fundo) fundo.addEventListener('click', function () { setOpen(false); });

    menu.querySelectorAll('.side-link').forEach(function (link) {
        link.addEventListener("click", function () { if (celular.matches) setOpen(false); });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === "Escape" && celular.matches) setOpen(false);
    });

    // se a tela voltar a ser grande, garante tudo fechado e destravado
    celular.addEventListener('change', function () {
        menu.classList.remove('is-open');
        if (fundo) fundo.classList.remove('is-open');
        document.body.classList.remove('side-locked');
        if (layout) layout.classList.remove('side-collapsed');
    });

    // destaca sozinho o link da página em que você está
    const atual = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    menu.querySelectorAll('.side-link').forEach(function (link) {
        const destino = (link.getAttribute('href') || '').split('#')[0].split('?')[0].toLowerCase();
        if (destino && destino === atual) link.setAttribute('aria-current', 'page');
    });

})();