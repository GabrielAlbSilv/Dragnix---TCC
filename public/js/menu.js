/* ============================================================
   DRAGNIX — MENU LATERAL (gaveta no celular, recolher no computador)
   ============================================================ */

(function () {

    const menu    = document.getElementById('sideMenu');
    const toggle  = document.getElementById('sideToggle');
    const close   = document.getElementById('sideClose');
    const overlay = document.getElementById('sideOverlay');
    const layout  = document.querySelector('.layout');

    if (!menu || !toggle || !layout) return;

    const mobile = window.matchMedia('(max-width: 760px)');

    function setOpen(open) {
        menu.classList.toggle('is-open', open);
        if (overlay) overlay.classList.toggle('is-open', open);
        document.body.classList.toggle('side-locked', open);
        toggle.setAttribute('aria-expanded', String(open));
    }

    toggle.addEventListener('click', function () {
        if (mobile.matches) {
            setOpen(!menu.classList.contains('is-open'));
        } else {
            const collapsed = layout.classList.toggle('side-collapsed');
            toggle.setAttribute('aria-expanded', String(!collapsed));
        }
    });

    if (close)   close.addEventListener('click', function () { setOpen(false); });
    if (overlay) overlay.addEventListener('click', function () { setOpen(false); });

    menu.querySelectorAll('.side-link').forEach(function (link) {
        link.addEventListener('click', function () { setOpen(false); });
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') setOpen(false);
    });

    mobile.addEventListener('change', function () { setOpen(false); });

})();