/* ============================================================
 DRAGNIX — RANKING (igual ao rank() do app.js)
 GET /ranking devolve [{ name, level, xp, streak, me }]. O usuário logado já entra no
 ranking sozinho (o servidor que decide); aqui só mostramos a lista e destacamos "me".
 Procure: [RK-ENDPOINT] [RK-RENDER] [RK-QUANDO]
 ============================================================ */
(function () {
  'use strict';
  /* [RK-ENDPOINT] */
  const RK_ENDPOINT = '/ranking';
  const host = document.getElementById('rkLista');
  if (!host) return;
  const esc2 = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = p => `<svg class="rk-ico" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const ESTRELA = '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>';
  const CHAMA = '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>';
  let carregando = false;

  /* [RK-RENDER] */
  async function carregar() {
    if (carregando) return; carregando = true;
    /* mini-tela só na 1ª vez (nas atualizações a lista continua à mostra) */
    if (!host.querySelector('.rk-lista, .rks') && window.dgxCarregando) host.innerHTML = window.dgxCarregando.html('Carregando ranking…');
    try {
      /* ranking da semana com o banner do ganhador (js/ranking-semana.js) */
      if (window.dgxRankingSemana) {
        await window.dgxRankingSemana.montar(host);
        carregando = false;
        return;
      }

      const r = await window.api(RK_ENDPOINT);
      const lista = Array.isArray(r) ? r : (r && (r.ranking || r.users)) || [];
      host.innerHTML = lista.length ? '<ol class="rk-lista">' + lista.map((u, n) => `
        <li class="rk-item${u.me ? ' is-eu' : ''}"${u.me ? ' aria-current="true"' : ''}>
          <span class="rk-pos">${n + 1}º</span>
          <span class="rk-nome">${esc2(u.name)} <small>Nv ${esc2(u.level)}</small></span>
          <span class="rk-pts">${svg(ESTRELA)} ${esc2(u.xp)} <i aria-hidden="true">·</i> ${svg(CHAMA)} ${esc2(u.streak)}</span>
        </li>`).join('') + '</ol>'
        : '<p class="rk-vazio">Ainda não há alunos no ranking.</p>';
    } catch (e) {
      host.innerHTML = `<p class="rk-vazio">Não consegui carregar o ranking agora. <small>${esc2(e && e.message || '')}</small></p>`;
    }
    carregando = false;
  }

  /* [RK-QUANDO] ao abrir a tela (#ranking), ao voltar para a aba e na primeira carga */
  const aoAbrir = () => { if (location.hash === '#ranking') carregar(); };
  window.addEventListener('hashchange', aoAbrir);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) aoAbrir(); });
  const iniciar = () => { carregar(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.dgxRanking = { atualizar: carregar };
})();