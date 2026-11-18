/* ============================================================
   DRAGNIX — js/nix-destaque.js  (CAMPO DO NIX NA TELA INICIAL)
   ============================================================

   Liga o bloco [NIX] da pag-inicial.html: a pergunta digitada (ou a
   sugestão clicada) é guardada nesta aba e o app abre o Nix
   (app.html#nix), que já envia a pergunta sozinho (js/assistente.js).
   ============================================================ */

(() => {
    'use strict';

    const CHAVE = 'dgx-nix-pergunta';
    const bloco = document.getElementById('nixDestaque');
    if (!bloco) return;

    // sem login não há Nix: o bloco some
    if (!localStorage.getItem('token')) {
        bloco.hidden = true;
        return;
    }

    const form = bloco.querySelector('form');
    const campo = bloco.querySelector('input');

    function abrirNix(pergunta) {
        const texto = String(pergunta || '').trim().slice(0, 1000);
        try {
            if (texto) sessionStorage.setItem(CHAVE, texto);
        } catch { /* sem armazenamento: só abre o Nix */ }
        location.href = 'app.html#nix';
    }

    form.addEventListener('submit', e => {
        e.preventDefault();
        if (!campo.value.trim()) {
            campo.focus();
            return;
        }
        abrirNix(campo.value);
    });

    bloco.addEventListener('click', e => {
        const chip = e.target.closest('[data-nix-pergunta]');
        if (chip) abrirNix(chip.getAttribute('data-nix-pergunta'));
    });
})();
