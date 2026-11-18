// ============================================================
// ENVIO DE E-MAIL (API HTTP)
// ============================================================
//
// Usa a API HTTP do Brevo ou do Resend (sem dependências extras).
// SMTP (porta 25/465/587) não é usado de propósito: o plano
// gratuito do Render bloqueia essas portas.
//
// Variáveis de ambiente:
//   BREVO_API_KEY   chave da API do Brevo   (ou)
//   RESEND_API_KEY  chave da API do Resend
//   MAIL_FROM_EMAIL e-mail remetente (obrigatório no Brevo)
//   MAIL_FROM_NAME  nome exibido (padrão: Dragnix)
//   MAIL_CONSOLE=1  só para testes locais: mostra o e-mail no
//                   terminal em vez de enviar

require('dotenv').config({ quiet: true });

function env(name) {
  return String(process.env[name] || '').trim();
}

function provider() {
  if (env('BREVO_API_KEY') && env('MAIL_FROM_EMAIL')) return 'brevo';
  if (env('RESEND_API_KEY')) return 'resend';
  if (env('MAIL_CONSOLE') === '1') return 'console';
  return null;
}

function isConfigured() {
  return provider() !== null;
}

const escapeHtml = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...headers
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    throw new Error(
      `Provedor de e-mail respondeu ${response.status}: ` +
      detail.slice(0, 300)
    );
  }
}

async function sendMail({ to, subject, text, html }) {
  const kind = provider();
  const fromName = env('MAIL_FROM_NAME') || 'Dragnix';

  if (kind === 'brevo') {
    return postJson(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': env('BREVO_API_KEY') },
      {
        sender: { name: fromName, email: env('MAIL_FROM_EMAIL') },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html
      }
    );
  }

  if (kind === 'resend') {
    const fromEmail = env('MAIL_FROM_EMAIL') || 'onboarding@resend.dev';

    return postJson(
      'https://api.resend.com/emails',
      { authorization: 'Bearer ' + env('RESEND_API_KEY') },
      {
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        text,
        html
      }
    );
  }

  if (kind === 'console') {
    console.log(`[MAIL_CONSOLE] Para: ${to}\nAssunto: ${subject}\n${text}\n`);
    return;
  }

  throw new Error('Envio de e-mail não configurado.');
}

async function sendPasswordResetEmail({ to, name, code, minutes }) {
  const firstName = String(name || '').trim().split(/\s+/)[0] || '';
  const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!';

  const text =
    `${greeting}\n\n` +
    `Seu código para redefinir a senha da Dragnix é: ${code}\n\n` +
    `Ele vale por ${minutes} minutos e só pode ser usado uma vez.\n` +
    'Se você não pediu a redefinição, ignore este e-mail: ' +
    'sua senha continua a mesma.';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">
      <h2 style="margin:0 0 12px">${escapeHtml(greeting)}</h2>
      <p>Use o código abaixo para redefinir a senha da sua conta Dragnix:</p>
      <p style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;margin:24px 0;padding:16px;background:#f3f4f6;border-radius:12px">${escapeHtml(code)}</p>
      <p>Ele vale por <strong>${Number(minutes)} minutos</strong> e só pode ser usado uma vez.</p>
      <p style="color:#6b7280;font-size:13px">Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.</p>
    </div>`;

  return sendMail({
    to,
    subject: `${code} é o seu código de recuperação — Dragnix`,
    text,
    html
  });
}

module.exports = { isConfigured, sendMail, sendPasswordResetEmail };