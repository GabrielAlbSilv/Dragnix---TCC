/* ============================================================
 DRAGNIX — GAMIFICAÇÃO (nível, XP, sequência, moedas e vidas)
 Procure com Ctrl+F:
 [GM-CONFIG]  endereço da API
 [GM-ICONES]  ícones
 [GM-RENDER]  monta a barra
 O lugar da barra no HTML é <div id="gmBarra"> (nas duas páginas).
 Os dados vêm de GET /tracks (os mesmos do app.js: level, xp, streak, coins, hearts, next).
 ============================================================ */
(function () {
  'use strict';

  /* [GM-CONFIG] */
  const GM = { endpoint: '/tracks', reserva: '/me/profile', atualizarACadaMs: 60000 };

  /* [GM-ICONES] */
  const P = {
    medal: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'
  };
  const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[n]}</svg>`;
  const num = v => (Number(v) || 0).toLocaleString('pt-BR');

  /* [GM-RENDER] */
  function desenhar(host, d) {
    const nivel = d.level || d.nivel || 1;
    const xp = d.xp || 0, seq = d.streak || 0, moedas = d.coins || 0;
    const vidas = d.hearts == null ? 5 : d.hearts;
    const prox = d.next ? Math.ceil(d.next / 60) : 0;
    const item = (cls, icone, valor, rotulo, extra) =>
      `<li class="gm-item ${cls}" title="${rotulo}: ${valor}">${ico(icone)}<span class="gm-valor">${valor}</span><span class="gm-rotulo">${rotulo}</span>${extra || ''}</li>`;
    host.innerHTML = `<ul class="gm-lista" aria-label="Seu progresso">
      ${item('gm-nivel', 'medal', 'Nv ' + nivel, 'Nível')}
      ${item('gm-xp', 'star', num(xp), 'XP')}
      ${item('gm-seq', 'flame', num(seq), 'Sequência (dias)')}
      ${item('gm-moedas', 'coins', num(moedas), 'Moedas')}
      ${item('gm-vidas' + (vidas === 0 ? ' gm-zero' : ''), 'heart', vidas, 'Vidas', prox ? `<small class="gm-extra">+1 em ${prox} min</small>` : '')}
    </ul>`;
    if (vidas === 0 && window.dgxAviso && !host.dataset.avisou) {
      host.dataset.avisou = '1';
      window.dgxAviso('Suas vidas acabaram. Elas voltam com o tempo.', 'info');
    }
  }

  async function carregar() {
    const host = document.getElementById('gmBarra');
    if (!host) return;
    if (typeof window.api !== 'function') { host.hidden = true; return; }
    let d = null;
    try { d = await window.api(GM.endpoint); } catch (e) { /* tenta o perfil */ }
    if (!d || d.xp == null) { try { d = await window.api(GM.reserva); } catch (e) { d = null; } }
    if (!d) { host.hidden = true; return; }
    host.hidden = false;
    desenhar(host, d);
  }

  window.dgxGamificacao = { atualizar: carregar, desenhar: d => { const h = document.getElementById('gmBarra'); if (h) { h.hidden = false; desenhar(h, d); } } };
  const iniciar = () => { carregar(); setInterval(carregar, GM.atualizarACadaMs); document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();