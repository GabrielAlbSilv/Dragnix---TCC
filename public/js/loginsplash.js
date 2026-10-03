document.addEventListener('DOMContentLoaded', () => {

    // =========================
    // SPLASH
    // =========================

    const splashExibida = sessionStorage.getItem('splashExibida');

    if (!splashExibida) {
        sessionStorage.setItem('splashExibida', 'true');
        window.location.replace('splash.html');
        return;
    }


    // =========================
    // USUÁRIO JÁ LOGADO
    // =========================

    if (localStorage.token) {
        window.location.replace('/app.html');
        return;
    }


    // =========================
    // VARIÁVEIS
    // =========================

    let mode = 'login';

    const $ = id => document.getElementById(id);

    const tl = $('tl');
    const tr = $('tr');
    const go = $('go');
    const name = $('name');
    const email = $('email');
    const pass = $('pass');
    const passConfirm = $('passConfirm');
    const err = $('err');


    // Verifica se os elementos existem
    if (!tl || !tr || !go || !name || !email || !pass || !passConfirm || !err) {
        console.error('Erro: elementos do login não encontrados.');
        return;
    }


    // =========================
    // ALTERAR LOGIN/CADASTRO
    // =========================

    function setMode(m) {

        mode = m;

        name.classList.toggle(
            'hide',
            m === 'login'
        );

        passConfirm.classList.toggle(
            'hide',
            m === 'login'
        );

        go.textContent =
            m === 'login'
                ? 'Entrar'
                : 'Criar conta';

        tl.className =
            'btn' + (m === 'login' ? '' : ' sec');

        tr.className =
            'btn' + (m === 'login' ? ' sec' : '');

        err.textContent = '';

        passConfirm.value = '';
    }


    // =========================
    // BOTÃO ENTRAR
    // =========================

    tl.addEventListener('click', () => {
        setMode('login');
    });


    // =========================
    // BOTÃO CRIAR CONTA
    // =========================

    tr.addEventListener('click', () => {
        setMode('register');
    });


    // =========================
    // LOGIN / CADASTRO
    // =========================

    go.addEventListener('click', async () => {

        err.textContent = '';

        const nameValue = name.value.trim();
        const emailValue = email.value.trim();
        const passwordValue = pass.value;
        const confirmValue = passConfirm.value;


        // =========================
        // CADASTRO
        // =========================

        if (mode === 'register') {

            if (!nameValue) {
                err.textContent = 'Digite seu nome.';
                return;
            }

            if (!emailValue) {
                err.textContent = 'Digite seu e-mail.';
                return;
            }

            if (passwordValue.length < 6) {
                err.textContent =
                    'A senha deve ter pelo menos 6 caracteres.';
                return;
            }

            if (!confirmValue) {
                err.textContent =
                    'Confirme sua senha.';
                return;
            }

            if (passwordValue !== confirmValue) {
                err.textContent =
                    'As senhas não são iguais.';
                return;
            }
        }


        // =========================
        // LOGIN
        // =========================

        if (mode === 'login') {

            if (!emailValue) {
                err.textContent =
                    'Digite seu e-mail.';
                return;
            }

            if (!passwordValue) {
                err.textContent =
                    'Digite sua senha.';
                return;
            }
        }


        // =========================
        // ENVIA PARA O SERVIDOR
        // =========================

        try {

            const d = await api(
                '/auth/' + mode,
                'POST',
                {
                    name: nameValue,
                    email: emailValue,
                    password: passwordValue,
                    confirm: confirmValue
                }
            );

            localStorage.token = d.token;

            localStorage.user =
                JSON.stringify(d.user);

            window.location.replace('/app.html');

        } catch (e) {

            console.error(e);

            err.textContent =
                e.message ||
                'Erro ao realizar operação.';
        }

    });

});

function mostrarSenhas(botao) {
    const senha = document.getElementById("pass");
    const confirmar = document.getElementById("passConfirm");

    const mostrar = senha.type === "password";

    senha.type = mostrar ? "text" : "password";
    confirmar.type = mostrar ? "text" : "password";

    botao.textContent = mostrar ? "🙈" : "👁";
}