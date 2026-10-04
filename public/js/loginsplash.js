document.addEventListener('DOMContentLoaded', () => {

    // =========================
    // SPLASH AO ABRIR O SITE (1x por sessão)
    // =========================

    // Se acabou de vir da splash (?splash=1), nunca volta para ela: isso evita o
    // "loop de recarregamento" quando o navegador não guarda o sessionStorage.
    const veioDaSplash = new URLSearchParams(window.location.search).has('splash');
    if (veioDaSplash) history.replaceState(null, '', window.location.pathname);

    let jaViu = true;
    try {
        jaViu = veioDaSplash || !!sessionStorage.getItem('splashExibida');
        if (!jaViu || veioDaSplash) sessionStorage.setItem('splashExibida', 'true');
    } catch (e) {
        jaViu = true; // armazenamento bloqueado: pula a splash
    }

    if (!jaViu) {
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
    // MOSTRAR / OCULTAR SENHA
    // =========================

    document.querySelectorAll('.eye').forEach(b => {
        b.addEventListener('click', () => {
            const campo = $(b.dataset.t);
            const mostrar = campo.type === 'password';

            campo.type = mostrar ? 'text' : 'password';
            b.textContent = mostrar ? '🙈' : '👁️';
        });
    });


    // =========================
    // AVISO AO VIVO: SENHAS IGUAIS?
    // =========================

    function check() {
        const m = $('match');

        if (mode !== 'register' || !passConfirm.value) {
            m.textContent = '';
            return;
        }

        const ok = pass.value === passConfirm.value;

        m.textContent = ok
            ? '✅ As senhas coincidem'
            : '❌ As senhas não coincidem';

        m.className = 'hint ' + (ok ? 'good' : 'err');
    }

    pass.addEventListener('input', check);
    passConfirm.addEventListener('input', check);


    // =========================
    // ALTERAR LOGIN/CADASTRO
    // =========================

    function setMode(m) {

        mode = m;

        name.classList.toggle(
            'hide',
            m === 'login'
        );

        $('cw').classList.toggle(
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

        check();
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

            // Login/cadastro OK -> splash -> app
            window.location.replace('/splash.html');

        } catch (e) {

            console.error(e);

            err.textContent =
                e.message ||
                'Erro ao realizar operação.';
        }

    });

});