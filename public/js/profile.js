/* ============================================================
   DRAGNIX — js/profile.js  (PERFIL NO CABEÇALHO)
   ============================================================

   Troca o "Seu nome" e a letra "S" do cabeçalho (#userName / #userAvatar)
   pelo nome e pela foto de quem está logado.

   Precisa do js/api.js carregado ANTES (me(), api(), esc(), avatarInitials(),
   saveCurrentUser()). Coloque ANTES do js/shell-extra.js.

   1) Mostra na hora o que está salvo no navegador (localStorage "user").
   2) Confere no servidor (GET /api/auth/me) e atualiza se a foto ou o nome mudou.
   3) Atualiza de novo quando outra parte do site avisa (evento "dgx:perfil-mudou").
   Sem login, a página de login é aberta (o servidor exige login nas telas internas).
   ============================================================ */

(function () {
    'use strict';

    const nomeEl = document.getElementById('userName');
    const fotoEl = document.getElementById('userAvatar');

    if (!nomeEl && !fotoEl) return;

    if (!localStorage.getItem('token')) {
        location.replace('index.html');
        return;
    }

    const lerUsuario = () => {
        try { return typeof me === 'function' ? me() : JSON.parse(localStorage.getItem('user') || 'null'); }
        catch { return null; }
    };

    const iniciais = nome => (typeof avatarInitials === 'function')
        ? avatarInitials(nome)
        : (String(nome || '?').trim()[0] || '?').toUpperCase();

    function desenhar(usuario) {
        if (!usuario) return;

        const nome = String(usuario.name || '').trim();

        if (nomeEl && nome) {
            nomeEl.textContent = nome.split(/\s+/)[0];      /* só o primeiro nome cabe no topo */
            nomeEl.title = nome;
        }

        if (!fotoEl) return;

        const letras = iniciais(nome);

        if (usuario.avatar_url) {
            const img = document.createElement('img');
            img.src = usuario.avatar_url;
            img.alt = '';
            img.loading = 'lazy';
            img.addEventListener('error', () => { fotoEl.textContent = letras; }, { once: true });
            fotoEl.replaceChildren(img);
        } else {
            fotoEl.textContent = letras;
        }
    }

    async function atualizarDoServidor() {
        if (typeof api !== 'function') return;

        try {
            const usuario = await api('/auth/me');

            if (usuario && typeof saveCurrentUser === 'function') saveCurrentUser(usuario);

            desenhar(usuario);
        } catch {
            /* sem rede: fica com o que já estava salvo */
        }
    }

    desenhar(lerUsuario());
    atualizarDoServidor();

    document.addEventListener('dgx:perfil-mudou', atualizarDoServidor);

    window.dgxPerfilTopo = { atualizar: atualizarDoServidor };
})();
