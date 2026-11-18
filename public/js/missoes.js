/* ============================================================
 DRAGNIX — CARD FIXO DE PROGRESSO + CARROSSEL DE MISSÕES DO DIA
 Procure com Ctrl+F:
 [MS-CONFIG]    endereços da API (os mesmos do app.js)
 [MS-DADOS]     busca /me/profile
 [MS-RENDER]    monta o card (topo = nível/XP, base = missões)
 [MS-CARROSSEL] setas e rolagem
 [MS-ACOES]     resgatar moedas e recarregar vidas
 O lugar do card no HTML é <section id="pgCard"> (nas duas páginas).
 Layout: topo escuro (avatar, nome, nível, XP, barra) + faixa clara com as missões lado a lado.
 ============================================================ */
(function () {
  'use strict';

  /* [MS-CONFIG] mesmos endpoints do app.js */
  const MS = { perfil: '/me/profile', resgatar: code => `/missions/${code}/claim`, vidas: '/shop/hearts' };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const aviso = (t, tipo) => { if (window.dgxAviso) window.dgxAviso(t, tipo || 'info'); else alert(t); };
  let ultimo = null;

  /* [MS-DADOS] */
  async function buscar() {
    if (typeof window.api !== 'function') throw new Error('api indisponível');
    ultimo = await window.api(MS.perfil);
    return ultimo;
  }

  /* [MS-RENDER] */
  function desenhar(host, p) {
    const nivel = Number(p.level) || 1;
    const falta = (Number(p.nextXp) - Number(p.curXp)) || 1;
    const pct = Math.max(0, Math.min(100, Math.round((Number(p.xp) - Number(p.curXp)) / falta * 100)));
    const av = document.getElementById('userAvatar');
    const nome = p.name || (document.getElementById('userName') || {}).textContent || 'Aluno';
    const missoes = Array.isArray(p.missions) ? p.missions : [];

    const itens = missoes.map(m => {
      const acao = m.claimed
        ? '<span class="pg-ok" title="Resgatada">✔ Resgatada</span>'
        : m.done ? `<button class="pg-resgatar" type="button" data-resgatar="${esc(m.code)}">Resgatar +10 moedas</button>`
        : `<small>${esc(m.value)}/${esc(m.goal)}</small>`;
      return `<li class="pg-missao${m.done ? ' is-feita' : ''}" aria-label="${esc(m.label)}: ${esc(m.value)} de ${esc(m.goal)}">
        <span class="pg-missao__icone" aria-hidden="true">${esc(m.icon || '🎯')}</span>
        <span class="pg-missao__txt"><strong>${esc(m.label)}</strong>${acao}</span></li>`;
    }).join('');

    host.innerHTML = `
      <div class="pg-topo">
        <span class="pg-avatar" aria-hidden="true">${av ? av.innerHTML : esc(nome[0] || '?')}</span>
        <div class="pg-info">
          <div class="pg-linha">
            <div><small class="pg-nome">${esc(nome)}</small><strong class="pg-nivel">Nível ${nivel}${p.level_name ? ' · ' + esc(p.level_name) : ''}</strong></div>
            <span class="pg-xp">${esc(p.xp)}/${esc(p.nextXp)} XP</span>
          </div>
          <div class="pg-barra" role="progressbar" aria-label="Progresso para o nível ${nivel + 1}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <div class="pg-barra__preench" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
      <div class="pg-base">
        <p class="pg-titulo">Missões de hoje</p>
        <button class="pg-seta" type="button" data-pg-seta="-1" aria-label="Missões anteriores">‹</button>
        <ul class="pg-trilho" tabindex="0" aria-label="Missões do dia">${itens || '<li class="pg-vazio">Nenhuma missão hoje.</li>'}</ul>
        <button class="pg-seta" type="button" data-pg-seta="1" aria-label="Próximas missões">›</button>
      </div>`;
    setas(host);
  }

  /* [MS-CARROSSEL] */
  function setas(host) {
    const trilho = host.querySelector('.pg-trilho'); if (!trilho) return;
    const ant = host.querySelector('[data-pg-seta="-1"]'), prox = host.querySelector('[data-pg-seta="1"]');
    const atualizar = () => {
      const max = trilho.scrollWidth - trilho.clientWidth - 2;
      ant.disabled = trilho.scrollLeft <= 2; prox.disabled = trilho.scrollLeft >= max;
      host.classList.toggle('pg-sem-rolagem', max <= 0);
    };
    trilho.addEventListener('scroll', atualizar, { passive: true });
    window.addEventListener('resize', atualizar);
    setTimeout(atualizar, 60);
  }

  async function carregar() {
    const host = document.getElementById('pgCard'); if (!host) return;
    try { desenhar(host, await buscar()); host.hidden = false; }
    catch (e) { host.hidden = true; }
  }

  /* [MS-ACOES] */
  async function resgatar(code) {
    try { await window.api(MS.resgatar(code), 'POST'); aviso('Moedas resgatadas!', 'ok'); }
    catch (e) { aviso(e.message || 'Não foi possível resgatar.', 'erro'); }
    mudou();
  }
  async function recarregarVidas() {
    try { await window.api(MS.vidas, 'POST'); aviso('Vidas recarregadas!', 'ok'); }
    catch (e) { aviso(e.message || 'Não foi possível recarregar as vidas.', 'erro'); }
    mudou();
  }
  /* avisa o resto da página (barra de gamificação, card, perfil) que algo mudou */
  function mudou() {
    carregar();
    if (window.dgxGamificacao) window.dgxGamificacao.atualizar();
    document.dispatchEvent(new CustomEvent('dgx:perfil-mudou'));
  }

  window.dgxMissoes = { atualizar: carregar, resgatar, recarregarVidas, dados: () => ultimo };

  document.addEventListener('click', e => {
    const r = e.target.closest && e.target.closest('[data-resgatar]');
    if (r && r.closest('#pgCard')) { resgatar(r.dataset.resgatar); return; }
    const s = e.target.closest && e.target.closest('[data-pg-seta]');
    if (s) { const t = s.parentElement.querySelector('.pg-trilho'); t.scrollBy({ left: Number(s.dataset.pgSeta) * t.clientWidth * .9, behavior: 'smooth' }); }
  });
  const iniciar = () => { carregar(); document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();