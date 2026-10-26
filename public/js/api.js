const logout = () => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const nome = user?.name ? user.name.split(' ')[0] : '';

    localStorage.clear();

    location.replace(
        'splash.html?logout=1&nome=' + encodeURIComponent(nome)
    );
};

const me = () =>
    JSON.parse(localStorage.getItem('user') || 'null');

async function api(path, method = 'GET', body) {
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