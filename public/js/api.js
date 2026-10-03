const logout = () => {
    localStorage.clear();
    location = '/';
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
        throw new Error(d.error || 'Erro inesperado');
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