/* ============================================================
   DRAGNIX — js/login-cena.js  (EFEITO 3D DA CENA DO LOGIN)
   ============================================================

   Faz os personagens e o fundo da guilda se mexerem de leve
   com o mouse (efeito de profundidade 3D).

   Só roda no computador (a partir de 1051px), com mouse, e
   para quem não pediu menos animação. Em qualquer outro caso
   não faz nada e o login fica estático.

   COMO PROCURAR: Ctrl+F e digite o código entre colchetes.

   [CONFIG]    quando o efeito liga
   [MOUSE]     lê a posição do mouse (-1 a 1)
   [SUAVIZAR]  anima devagar até a posição nova
   ============================================================ */

(function () {
    'use strict';

    const cena = document.querySelector('.login-cena');

    if (!cena) return;


    /* ------------------------------------------------------------
       [CONFIG] — quando o efeito liga
       ------------------------------------------------------------ */

    const computador = window.matchMedia('(min-width: 1051px) and (hover: hover)');
    const semAnimacao = window.matchMedia('(prefers-reduced-motion: reduce)');

    const raiz = document.body;          // --px / --py são lidos pelo CSS (login-guilda.css)

    let alvoX = 0, alvoY = 0;            // para onde o mouse aponta
    let atualX = 0, atualY = 0;          // onde a cena está agora
    let rodando = false;


    /* ------------------------------------------------------------
       [MOUSE] — posição do mouse na janela, de -1 (esq./topo) a 1 (dir./base)
       ------------------------------------------------------------ */

    function aoMoverMouse(evento) {
        alvoX = (evento.clientX / window.innerWidth) * 2 - 1;
        alvoY = (evento.clientY / window.innerHeight) * 2 - 1;

        if (!rodando) {
            rodando = true;
            requestAnimationFrame(animar);
        }
    }


    /* ------------------------------------------------------------
       [SUAVIZAR] — chega devagar na posição nova (sem tranco)
       ------------------------------------------------------------ */

    function animar() {
        atualX += (alvoX - atualX) * 0.08;
        atualY += (alvoY - atualY) * 0.08;

        raiz.style.setProperty('--px', atualX.toFixed(3));
        raiz.style.setProperty('--py', atualY.toFixed(3));

        const parado = Math.abs(alvoX - atualX) < 0.002 && Math.abs(alvoY - atualY) < 0.002;

        if (parado) {
            rodando = false;
            return;
        }

        requestAnimationFrame(animar);
    }


    /* ------------------------------------------------------------
       liga e desliga conforme o tamanho da tela
       ------------------------------------------------------------ */

    function atualizar() {
        const ligado = computador.matches && !semAnimacao.matches;

        document.removeEventListener('mousemove', aoMoverMouse);

        if (ligado) {
            document.addEventListener('mousemove', aoMoverMouse, { passive: true });
        } else {
            raiz.style.removeProperty('--px');
            raiz.style.removeProperty('--py');
        }
    }

    computador.addEventListener('change', atualizar);
    semAnimacao.addEventListener('change', atualizar);

    atualizar();

})();