const logout = () => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const nome = user?.name ? user.name.split(' ')[0] : '';

    const tema = localStorage.getItem('dragnix-theme');    /* o tema escolhido continua depois de sair */
    localStorage.clear();
    if (tema) localStorage.setItem('dragnix-theme', tema);
    try { sessionStorage.removeItem('dgx-api-cache'); } catch { /* ignora */ }

    location.replace(
        'splash.html?logout=1&nome=' + encodeURIComponent(nome)
    );
};

const me = () =>
    JSON.parse(localStorage.getItem('user') || 'null');

// ============================================================
// DESEMPENHO: MENOS CHAMADAS REPETIDAS
// ============================================================
// 1) Duas partes da página pedindo a MESMA coisa ao mesmo tempo
//    (ex.: /tracks pela tela e pelo card do perfil) => uma chamada só.
// 2) Alguns dados quase não mudam de uma página para outra (perfil,
//    trilhas, regras...): ficam guardados por alguns segundos nesta aba,
//    então trocar de página não espera o servidor de novo.
// 3) Qualquer gravação (POST/PUT/DELETE) apaga o que estava guardado:
//    depois de concluir um módulo, comprar vidas etc., tudo vem atualizado.
const API_GUARDAR_MS = 30000;
const API_GUARDAVEIS = /^\/(auth\/me|me\/profile|tracks|regras|lessons\/ratings|avatars|chatbot\/status)$/;
const apiEmAndamento = new Map();
const apiChaveSessao = 'dgx-api-cache';

const apiCopia = dado =>
    typeof structuredClone === 'function'
        ? structuredClone(dado)
        : JSON.parse(JSON.stringify(dado));

function apiLerGuardado() {
    try {
        const tudo = JSON.parse(sessionStorage.getItem(apiChaveSessao) || '{}');
        return tudo && tudo.token === (localStorage.getItem('token') || '') ? tudo : { token: localStorage.getItem('token') || '', itens: {} };
    } catch {
        return { token: '', itens: {} };
    }
}

function apiGuardar(path, dado) {
    try {
        const tudo = apiLerGuardado();
        tudo.itens = tudo.itens || {};
        tudo.itens[path] = { em: Date.now(), dado };
        sessionStorage.setItem(apiChaveSessao, JSON.stringify(tudo));
    } catch { /* sem espaço ou bloqueado: só não guarda */ }
}

function apiLimparGuardado() {
    try { sessionStorage.removeItem(apiChaveSessao); } catch { /* ignora */ }
}

window.dgxApiLimpar = apiLimparGuardado;

async function api(path, method = 'GET', body) {
    const metodo = String(method || 'GET').toUpperCase();

    if (metodo !== 'GET') {
        apiLimparGuardado();
        return apiBuscar(path, metodo, body);
    }

    if (API_GUARDAVEIS.test(path)) {
        const item = (apiLerGuardado().itens || {})[path];
        if (item && Date.now() - item.em < API_GUARDAR_MS) {
            return apiCopia(item.dado);
        }
    }

    let promessa = apiEmAndamento.get(path);

    if (!promessa) {
        promessa = apiBuscar(path, 'GET').then(dado => {
            if (API_GUARDAVEIS.test(path)) apiGuardar(path, dado);
            return dado;
        });
        apiEmAndamento.set(path, promessa);
        const limpar = () => apiEmAndamento.delete(path);
        promessa.then(limpar, limpar);
    }

    // cada parte da página recebe a própria cópia (uma não mexe na da outra)
    return apiCopia(await promessa);
}

async function apiBuscar(path, method = 'GET', body) {
    const r = await fetch('/api' + path, {
        method,
        body: body && JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json',
            Authorization:
                'Bearer ' +
                (localStorage.getItem('token') || ''),
        },
    });

    const d = await r.json().catch(() => ({}));

    if (r.status === 401 && !path.startsWith('/auth/')) {
        logout();
    }

    if (!r.ok) {
    const error = new Error(
        d.error || 'Erro inesperado'
    );

    error.status = r.status;
    error.code = d.code;
    error.remainingAttempts = d.remainingAttempts;
    error.retryAfterSeconds = d.retryAfterSeconds;

    throw error;
}

    return d;
}

const esc = s =>
    String(s ?? '').replace(
        /[&<>"']/g,
        c =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            }[c])
    );

// ============================================================
// FOTO DE PERFIL
// ============================================================

// Iniciais usadas quando a pessoa ainda não tem foto.
function avatarInitials(name) {
    const parts = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) return '?';

    const first = Array.from(parts[0])[0] || '?';
    const last = parts.length > 1
        ? Array.from(parts[parts.length - 1])[0]
        : '';

    return (first + last).toUpperCase();
}

// size: 'sm' | 'md' | 'lg'
// user: objeto com { name, avatar_url }
function avatarHtml(user, size = 'md') {
    const url = user && user.avatar_url;
    const initials = esc(avatarInitials(user && user.name));

    const content = url
        ? `<img
             src="${esc(url)}"
             alt=""
             loading="lazy"
             onerror="this.replaceWith(document.createTextNode('${initials}'))"
           >`
        : `<span class="avatar-initials">${initials}</span>`;

    return `
        <span class="avatar avatar-${size}" aria-hidden="true">
            ${content}
        </span>
    `;
}

// Guarda no navegador os dados atualizados do usuário logado.
function saveCurrentUser(patch) {
    const current = me() || {};

    localStorage.setItem(
        'user',
        JSON.stringify({ ...current, ...patch })
    );
}

const AVATAR_SIZE = 256;
const AVATAR_ORIGINAL_MAX = 15 * 1024 * 1024;

// Recorta no centro (quadrado), reduz e converte para JPEG.
// Assim a foto fica leve e sem dados de localização (EXIF).
function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        const side = Math.min(width, height);

        if (!side) {
          throw new Error('Imagem inválida');
        }

        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;

        const ctx = canvas.getContext('2d');

        // PNG transparente vira fundo branco no JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);

        ctx.drawImage(
          img,
          (width - side) / 2,
          (height - side) / 2,
          side,
          side,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE
        );

        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler essa imagem.'));
    };

    img.src = url;
  });
}
// Ícone de conquista criado pelo adm com imagem (/api/badge-icon/<id>/<versão>):
// devolve o <img>; para emoji ou nome de ícone devolve null.
function conquistaImagem(icone, alt = '') {
    const valor = String(icone || '');

    return /^\/api\/badge-icon\/\d+\/[a-f0-9]+$/.test(valor)
        ? `<img class="badge-img" src="${esc(valor)}" alt="${esc(alt)}" loading="lazy">`
        : null;
}

// Ícone da trilha: emoji (texto) ou um ícone do site salvo como "lucide:nome".
// O ícone do site é desenhado com uma máscara CSS do SVG da pasta icons/,
// então herda a cor do texto e funciona em qualquer página (sem js extra).
function iconeTrilha(valor, padrao = '📚') {
    const v = String(valor || '').trim();
    const m = v.match(/^lucide:([a-z0-9-]{1,40})$/);

    if (m) {
        const url = `url('icons/${m[1]}.svg')`;

        return `<span class="dgx-ico-trilha" aria-hidden="true" style="display:inline-block;width:1em;height:1em;vertical-align:-0.14em;background-color:currentColor;-webkit-mask:${url} center/contain no-repeat;mask:${url} center/contain no-repeat"></span>`;
    }

    return esc(v || padrao);
}
