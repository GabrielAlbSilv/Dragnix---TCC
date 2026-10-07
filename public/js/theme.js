/* ============================================================
   DRAGNIX — SISTEMA GLOBAL DE TEMA
   ============================================================ */

(function () {

    const STORAGE_KEY = 'dragnix-theme';


    /* ========================================================
       DETECTAR TEMA DO SISTEMA
       ======================================================== */

    function getSystemTheme() {

        return window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';

    }


    /* ========================================================
       OBTER TEMA ATUAL
       ======================================================== */

    function getTheme() {

        const savedTheme = localStorage.getItem(STORAGE_KEY);

        if (savedTheme === 'dark' || savedTheme === 'light') {
            return savedTheme;
        }

        return getSystemTheme();

    }


    /* ========================================================
       APLICAR TEMA
       ======================================================== */

    function applyTheme(theme) {

        document.documentElement.setAttribute(
            'data-theme',
            theme
        );

        updateThemeButtons(theme);

    }


    /* ========================================================
       ATUALIZAR BOTÕES
       ======================================================== */

    function updateThemeButtons(theme) {

        const buttons = document.querySelectorAll(
            '[data-theme-toggle]'
        );

        buttons.forEach(button => {

            const icon = button.querySelector(
                '.theme-button-icon'
            );

            const text = button.querySelector(
                '.theme-button-text'
            );


            if (theme === 'dark') {

                if (icon) {
                    icon.textContent = '☀️';
                }

                if (text) {
                    text.textContent = 'Modo claro';
                }

                button.setAttribute(
                    'aria-label',
                    'Ativar modo claro'
                );

                button.setAttribute(
                    'title',
                    'Ativar modo claro'
                );

            } else {

                if (icon) {
                    icon.textContent = '🌙';
                }

                if (text) {
                    text.textContent = 'Modo escuro';
                }

                button.setAttribute(
                    'aria-label',
                    'Ativar modo escuro'
                );

                button.setAttribute(
                    'title',
                    'Ativar modo escuro'
                );

            }

        });

    }


    /* ========================================================
       ALTERNAR TEMA
       ======================================================== */

    function toggleTheme() {

        const currentTheme =
            document.documentElement.getAttribute('data-theme')
            || getTheme();

        const newTheme =
            currentTheme === 'dark'
                ? 'light'
                : 'dark';


        localStorage.setItem(
            STORAGE_KEY,
            newTheme
        );


        applyTheme(newTheme);

    }


    /* ========================================================
       INICIALIZAÇÃO
       ======================================================== */

    const initialTheme = getTheme();

    applyTheme(initialTheme);


    /* ========================================================
       DISPONIBILIZAR GLOBALMENTE
       ======================================================== */

    window.toggleTheme = toggleTheme;


    /* ========================================================
       ACOMPANHAR TEMA DO COMPUTADOR
       ======================================================== */

    const mediaQuery = window.matchMedia(
        '(prefers-color-scheme: dark)'
    );


    mediaQuery.addEventListener('change', function (event) {

        const savedTheme =
            localStorage.getItem(STORAGE_KEY);


        /*
         * Se o usuário já escolheu manualmente,
         * respeitamos a escolha dele.
         */

        if (savedTheme) {
            return;
        }


        applyTheme(
            event.matches ? 'dark' : 'light'
        );

    });


})();