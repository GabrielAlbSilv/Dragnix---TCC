/* ============================================================
   DRAGNIX — js/trilhas.js  (PÁGINA EDUCAÇÃO FINANCEIRA: TRILHAS DE CONHECIMENTO)
   ============================================================

   Mostra as trilhas com os MESMOS dados do app.js:
     GET /tracks            → trilhas, módulos, progresso, bloqueios
     GET /lessons/ratings   → avaliações dos módulos
   Cada módulo abre em app.html?lesson=ID (o app.js já abre o módulo pelo endereço).

   Quando o backup for restaurado no servidor, as trilhas aparecem sozinhas:
   a lista recarrega ao abrir a página, ao voltar para a aba e no botão "Tentar de novo".
   ============================================================ */

(() => {
    'use strict';

    const $ = (s, r = document) => r.querySelector(s);
    const H = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ============================================================
       [CF-TRILHAS] — TRILHAS DE CONHECIMENTO (mesmos dados do app.js: GET /tracks e /lessons/ratings)
       Cada módulo abre no app.html?lesson=ID (o app.js já sabe abrir o módulo pelo endereço).
       ============================================================ */

    const PAGINA_MODULO = 'app.html';

    const lista = v => (Array.isArray(v) ? v : []);

    async function carregarTrilhas() {
        const host = $('#trLista');
        if (typeof window.api !== 'function') {
            host.innerHTML = '<p class="tr-aviso">As trilhas precisam do servidor. Entre pela página do sistema para vê-las.</p>';
            return;
        }
        host.innerHTML = (window.dgxCarregando ? window.dgxCarregando.html('Carregando trilhas…') : '<p>Carregando trilhas…</p>');

        try {
            const d = await window.api('/tracks');
            const trilhas = lista(d && d.tracks).map(t => ({ ...t, lessons: lista(t.lessons), missing: lista(t.missing) }));

            let notas = {};
            try {
                const r = await window.api('/lessons/ratings');
                notas = Object.fromEntries(lista(r && r.ratings).map(x => [Number(x.lesson_id), x]));
            } catch { /* sem avaliações: segue sem elas */ }

            renderTrilhas(trilhas, notas);
        } catch (erro) {
            host.innerHTML = `<p class="tr-aviso tr-aviso--erro">Não foi possível carregar as trilhas agora.</p>
                              <button class="cf-mini-btn" type="button" id="trTentar">Tentar de novo</button>`;
            $('#trTentar').addEventListener('click', carregarTrilhas);
        }
    }

    function renderTrilhas(trilhas, notas) {
        const host = $('#trLista');
        if (!trilhas.length) {
            host.innerHTML = '<p class="tr-aviso">Comece uma trilha agora.</p>';
            return;
        }

        host.innerHTML = trilhas.map(t => {
            const cor = /^#[0-9a-f]{3,8}$/i.test(t.color || '') ? t.color : '#58cc02';
            const feitos = t.lessons.filter(l => l.done).length;
            const pct = t.lessons.length ? Math.round(t.lessons.reduce((s, l) => s + (Number(l.pct) || 0), 0) / t.lessons.length) : 0;

            /* média ponderada das avaliações dos módulos (mesma conta do app.js) */
            const avaliadas = t.lessons.filter(l => notas[Number(l.id)] && Number(notas[Number(l.id)].rating_count) > 0);
            const totalAv = avaliadas.reduce((s, l) => s + Number(notas[Number(l.id)].rating_count), 0);
            const media = totalAv ? (avaliadas.reduce((s, l) => s + Number(notas[Number(l.id)].average_rating) * Number(notas[Number(l.id)].rating_count), 0) / totalAv).toFixed(1).replace('.', ',') : null;

            const modulos = t.lessons.map(l => {
                const n = notas[Number(l.id)];
                const pL = Math.max(0, Math.min(100, Math.round(Number(l.pct) || 0)));
                const estado = l.locked ? 'Bloqueado' : l.done ? 'Concluído' : pL > 0 ? `${pL}%` : 'Começar';
                const interno = `
                    <span class="tr-mod__icone" aria-hidden="true">${l.locked ? '🔒' : l.done ? '✔' : '▶'}</span>
                    <span class="tr-mod__corpo">
                        <strong>${H(l.title || 'Módulo')}</strong>
                        <span class="tr-barra" role="progressbar" aria-label="Progresso do módulo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pL}"><i style="width:${pL}%"></i></span>
                        ${n && Number(n.rating_count) > 0 ? `<small>★ ${Number(n.average_rating).toFixed(1).replace('.', ',')} · ${Number(n.rating_count)} avaliaç${Number(n.rating_count) === 1 ? 'ão' : 'ões'}</small>` : ''}
                    </span>
                    <span class="tr-mod__estado">${H(estado)}</span>`;
                return l.locked
                    ? `<li><span class="tr-mod is-bloqueado" aria-disabled="true">${interno}</span></li>`
                    : `<li><a class="tr-mod${l.done ? ' is-feito' : ''}" href="${PAGINA_MODULO}?lesson=${encodeURIComponent(l.id)}">${interno}</a></li>`;
            }).join('');

            return `
                <article class="tr-card${t.locked ? ' is-bloqueada' : ''}" style="--tr-cor:${H(cor)}">
                    <div class="tr-card__cab">
                        <span class="tr-card__icone" aria-hidden="true">${typeof iconeTrilha === 'function' ? iconeTrilha(t.icon) : H(t.icon || '📚')}</span>
                        <div>
                            <h2>${H(t.title)}</h2>
                            <p class="tr-card__nota">${media ? `★ <b>${media}</b> / 5 · ${totalAv} avaliaç${totalAv === 1 ? 'ão' : 'ões'}` : '★ Sem avaliações ainda'}</p>
                        </div>
                    </div>
                    ${t.description ? `<p class="tr-card__desc">${H(t.description)}</p>` : ''}
                    ${t.locked ? `<p class="tr-card__trava">🔒 Para liberar esta trilha, conclua antes: ${t.missing.map(H).join(', ')}</p>` : ''}
                    <div class="tr-prog">
                        <span class="tr-barra tr-barra--grande" role="progressbar" aria-label="Progresso da trilha" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>
                        <span class="tr-prog__txt">${pct}% · ${feitos} de ${t.lessons.length} módulo${t.lessons.length === 1 ? '' : 's'}</span>
                    </div>
                    ${t.lessons.length ? `<ul class="tr-mods">${modulos}</ul>` : '<p class="tr-aviso">Esta trilha ainda não tem módulos.</p>'}
                </article>`;
        }).join('');
    }


    /* início */
    const iniciar = () => {
        carregarTrilhas();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) carregarTrilhas(); });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();