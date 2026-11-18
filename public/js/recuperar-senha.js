// =========================
// RECUPERAR SENHA (index.html)
// =========================
//
// Passo 1: pede o código  -> POST /api/auth/forgot-password
// Passo 2: código + senha -> POST /api/auth/reset-password
//
// Depende de api() (js/api.js) e mostrarSenha() (js/loginsplash.js).

(function () {
    'use strict';

    const $ = id => document.getElementById(id);

    const loginCard = $('loginCard');
    const loginTabs = $('loginTabs');
    const forgotBtn = $('forgotBtn');
    const tabLogin = $('tl');
    const tabRegister = $('tr');
    const loginEmail = $('email');

    const recoverCard = $('recoverCard');
    const step1 = $('recoverStep1');
    const step2 = $('recoverStep2');
    const emailInput = $('recoverEmail');
    const sendBtn = $('recoverSend');
    const info = $('recoverInfo');
    const codeInput = $('recoverCode');
    const passInput = $('recoverPass');
    const confirmInput = $('recoverPassConfirm');
    const resetBtn = $('recoverReset');
    const resendBtn = $('recoverResend');
    const errBox = $('recoverErr');
    const okBox = $('recoverOk');
    const doneBtn = $('recoverDone');
    const backBtn = $('recoverBack');

    const required = [
        loginCard, loginTabs, forgotBtn, tabLogin, tabRegister,
        loginEmail, recoverCard, step1, step2, emailInput, sendBtn,
        info, codeInput, passInput, confirmInput, resetBtn,
        resendBtn, errBox, okBox, doneBtn, backBtn
    ];

    if (required.some(element => !element)) {
        console.error('Recuperar senha: elementos não encontrados.');
        return;
    }

    const RESEND_SECONDS = 60;

    let currentEmail = '';
    let timer = null;


    // =========================
    // AUXILIARES
    // =========================

    const toggle = (element, visible) =>
        element.classList.toggle('hide', !visible);

    function setMessages(error = '', ok = '') {
        errBox.textContent = error;
        okBox.textContent = ok;
    }

    function stopCooldown() {
        clearInterval(timer);
        timer = null;
        resendBtn.disabled = false;
        resendBtn.textContent = 'Reenviar código';
    }

    function startCooldown() {
        stopCooldown();

        let left = RESEND_SECONDS;

        resendBtn.disabled = true;
        resendBtn.textContent = `Reenviar código (${left}s)`;

        timer = setInterval(() => {
            left -= 1;

            if (left <= 0) {
                stopCooldown();
                return;
            }

            resendBtn.textContent = `Reenviar código (${left}s)`;
        }, 1000);
    }

    function resetForm() {
        stopCooldown();
        setMessages();

        emailInput.value = '';
        codeInput.value = '';
        passInput.value = '';
        confirmInput.value = '';
        passInput.type = 'password';
        confirmInput.type = 'password';

        currentEmail = '';

        toggle(step1, true);
        toggle(step2, false);
        toggle(doneBtn, false);
        toggle(backBtn, true);
    }


    // =========================
    // ABRIR / FECHAR
    // =========================

    function openRecover() {
        resetForm();

        // Reaproveita o e-mail que a pessoa já digitou no login.
        emailInput.value = loginEmail.value.trim();

        toggle(loginTabs, false);
        toggle(loginCard, false);
        toggle(recoverCard, true);

        emailInput.focus();
    }

    function closeRecover(prefillEmail = '') {
        resetForm();

        toggle(recoverCard, false);
        toggle(loginTabs, true);
        toggle(loginCard, true);

        // Volta sempre para a aba "Entrar".
        tabLogin.click();

        if (prefillEmail) {
            loginEmail.value = prefillEmail;
            $('pass').focus();
        }
    }


    // =========================
    // PASSO 1: ENVIAR CÓDIGO
    // =========================

    async function requestCode(email) {
        setMessages();

        sendBtn.disabled = true;
        resendBtn.disabled = true;

        try {
            const data = await api(
                '/auth/forgot-password',
                'POST',
                { email }
            );

            currentEmail = email.toLowerCase();

            toggle(step1, false);
            toggle(step2, true);

            info.textContent =
                data.message ||
                'Enviamos um código de 6 dígitos para o seu e-mail.';

            codeInput.value = '';
            codeInput.focus();

            startCooldown();

        } catch (error) {
            console.error(error);

            setMessages(
                error.message ||
                'Não foi possível enviar o código.'
            );

            // Em caso de erro no reenvio, libera o botão.
            if (currentEmail) {
                resendBtn.disabled = false;
            }

        } finally {
            sendBtn.disabled = false;
        }
    }

    sendBtn.addEventListener('click', () => {
        const email = emailInput.value.trim();

        if (!email || !email.includes('@')) {
            setMessages('Digite um e-mail válido.');
            return;
        }

        requestCode(email);
    });

    resendBtn.addEventListener('click', () => {
        if (currentEmail) {
            requestCode(currentEmail);
        }
    });


    // =========================
    // PASSO 2: REDEFINIR SENHA
    // =========================

    codeInput.addEventListener('input', () => {
        codeInput.value =
            codeInput.value.replace(/\D/g, '').slice(0, 6);
    });

    resetBtn.addEventListener('click', async () => {
        setMessages();

        const code = codeInput.value.trim();
        const password = passInput.value;
        const confirm = confirmInput.value;

        if (!/^\d{6}$/.test(code)) {
            setMessages('Digite o código de 6 dígitos.');
            return;
        }

        if (password.length < 6) {
            setMessages('A nova senha deve ter pelo menos 6 caracteres.');
            return;
        }

        if (password !== confirm) {
            setMessages('As senhas não são iguais.');
            return;
        }

        resetBtn.disabled = true;

        try {
            const data = await api(
                '/auth/reset-password',
                'POST',
                {
                    email: currentEmail,
                    code,
                    password,
                    confirm
                }
            );

            stopCooldown();

            toggle(step2, false);
            toggle(backBtn, false);
            toggle(doneBtn, true);

            setMessages(
                '',
                data.message || 'Senha redefinida com sucesso!'
            );

            doneBtn.focus();

        } catch (error) {
            console.error(error);

            setMessages(
                error.message ||
                'Não foi possível redefinir a senha.'
            );

            // Código esgotado ou expirado: volta a permitir
            // pedir um novo.
            if (
                error.code === 'RESET_CODE_LOCKED' ||
                error.code === 'INVALID_RESET_CODE'
            ) {
                stopCooldown();
            }

        } finally {
            resetBtn.disabled = false;
        }
    });

    doneBtn.addEventListener('click', () => {
        closeRecover(currentEmail);
    });


    // =========================
    // NAVEGAÇÃO
    // =========================

    forgotBtn.addEventListener('click', openRecover);

    backBtn.addEventListener('click', () => closeRecover());

    // O link só faz sentido na aba "Entrar".
    tabLogin.addEventListener('click', () => toggle(forgotBtn, true));
    tabRegister.addEventListener('click', () => toggle(forgotBtn, false));

    // Enter envia o passo atual.
    emailInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') sendBtn.click();
    });

    [codeInput, passInput, confirmInput].forEach(input =>
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') resetBtn.click();
        })
    );

})();