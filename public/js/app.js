if (!localStorage.getItem('token')) location = '/';
const main = document.getElementById('main'), $ = id => document.getElementById(id);
if (me()?.role === 'adm') $('adm').classList.remove('hide');
const setStats = d => {
  $('xp').textContent = '⭐ ' + d.xp; $('streak').textContent = '🔥 ' + d.streak; $('coins').textContent = '🪙 ' + d.coins; $('lvl').textContent = '🎖️ Nv ' + d.level;
  $('hearts').textContent = '❤️ ' + d.hearts + (d.next ? ` (+1 em ${Math.ceil(d.next / 60)} min)` : '');
};
// Qualquer erro de requisição aparece na tela (em vez de o botão "não fazer nada")
window.addEventListener('unhandledrejection', e => { main.innerHTML = `<div class="card badc"><strong>⚠️ ${esc(e.reason?.message || e.reason)}</strong><p class="mut">Se a mensagem for "Erro inesperado" ou 404, reinicie o servidor (Ctrl + C e npm.cmd start).</p></div>`; });
const refresh = () => api('/tracks').then(setStats);

async function home() {
  const d = await api('/tracks'); setStats(d); window.TRACKS = d.tracks;
  main.innerHTML = d.tracks.length ? d.tracks.map(t => { const c = esc(t.color || '#58cc02'), n = t.lessons.filter(l => l.done).length, pct = t.lessons.length ? Math.round(t.lessons.reduce((x, l) => x + l.pct, 0) / t.lessons.length) : 0; return `
    <div class="card" style="border-color:${c}"><h2>${esc(t.icon)} ${esc(t.title)}</h2><p class="mut">${esc(t.description)}</p>
    <div class="row"><small class="mut">${n}/${t.lessons.length} módulos concluídos</small><b style="color:${c}">${pct}% da trilha</b></div><div class="bar"><div style="width:${pct}%;background:${c}"></div></div>
    <div class="path">
      ${t.presentation.length ? `<div style="text-align:center"><button class="node" style="background:${c}" onclick="showTrack(${t.id})">📌</button><div class="mut">Apresentação<br><small>da trilha</small></div></div>` : ''}
      ${t.lessons.map((l, i) => `<div style="text-align:center;opacity:${l.locked ? .5 : 1}"><button class="node ${l.done ? 'done' : ''}" style="${l.done ? '' : 'background:' + c}"
        onclick="${l.locked ? "alert('Conclua o módulo anterior para desbloquear 🔒')" : `openLesson(${l.id})`}">${l.locked ? '🔒' : l.done ? '✓' : i + 1}</button>
        <div class="mut"><b>Módulo ${i + 1}</b><br>${esc(l.title)}<div class="mini"><div style="width:${l.pct}%;background:${c}"></div></div><small><b>${l.pct}%</b> · +${l.xp} XP</small></div></div>`).join('')}
      <div style="text-align:center;opacity:.5"><button class="node" style="background:var(--bd)" onclick="alert('Os desafios chegam em breve! 🏆')">🏆</button><div class="mut">Desafios<br><small>em breve</small></div></div>
    </div></div>`; }).join('') : '<p class="mut">Nenhuma trilha disponível ainda.</p>';
}
function showTrack(id) {
  const t = TRACKS.find(x => x.id === id);
  main.innerHTML = `<button class="link" onclick="home()">← Voltar</button><h2>${esc(t.icon)} ${esc(t.title)}</h2><div class="steps"><span class="pill on">📌 Apresentação</span></div>
    <div class="card lesson-content">${t.presentation.map(block).join('')}</div><button class="btn" onclick="home()">Ir para os módulos</button>`;
}

async function rank() {
  const r = await api('/ranking');
  main.innerHTML = '<h2>🏆 Ranking</h2>' + r.map((u, n) => `<div class="card row" ${u.me ? 'style="border-color:var(--g)"' : ''}><span>${n + 1}º ${esc(u.name)} <small class="mut">Nv ${u.level}</small></span><span>⭐ ${u.xp} · 🔥 ${u.streak}</span></div>`).join('') || '<p class="mut">Ainda não há alunos no ranking.</p>';
}

async function profile() {
  const p = await api('/me/profile'); refresh();
  const top = Math.max(...p.week.map(x => x.xp), 1);
  main.innerHTML = `<div class="card" style="text-align:center"><h2>${esc(p.name)}</h2><h3>🎖️ Nível ${p.level}</h3>
    <div class="bar"><div style="width:${(p.xp - p.curXp) / (p.nextXp - p.curXp) * 100}%"></div></div><p class="mut">${p.xp} / ${p.nextXp} XP para o nível ${p.level + 1}</p>
    <p>🔥 ${p.streak} dia(s) · 🪙 ${p.coins} · 📘 ${p.lessons} lições · 💯 ${p.perfect} perfeitas · 🏁 ${p.tracks} trilhas</p>
    <button class="btn sm" onclick="buyHearts()">❤️ Recarregar vidas (30 🪙)</button></div>
    <h3>🎯 Missões de hoje</h3>${p.missions.map(m => `<div class="card row"><span>${m.icon} ${m.label} <small class="mut">(${m.value}/${m.goal})</small></span>
      ${m.claimed ? '✅' : m.done ? `<button class="btn sm" onclick="claim('${m.code}')">Resgatar +10 🪙</button>` : ''}</div>`).join('')}
    <h3>🏅 Conquistas</h3><div class="badges">${p.badges.map(b => `<div class="bdg ${b.got ? '' : 'off'}" title="${esc(b.desc)}"><span>${b.icon}</span><small>${esc(b.name)}</small><small class="mut">${esc(b.desc)}</small></div>`).join('')}</div>
    <h3>📅 XP dos últimos dias</h3><div class="week">${p.week.map(w => `<div><div class="wb" style="height:${Math.max(4, w.xp / top * 80)}px"></div><small>${w.day.slice(8)}/${w.day.slice(5, 7)}</small></div>`).join('') || '<p class="mut">Sem atividade ainda.</p>'}</div>`;
}
async function badges() {
  const p = await api('/me/profile'), n = p.badges.filter(b => b.got).length;
  main.innerHTML = `<h2>🏅 Conquistas</h2><p class="mut">${n} de ${p.badges.length} desbloqueadas</p><div class="bar"><div style="width:${n / p.badges.length * 100}%"></div></div><br>
    <div class="badges">${p.badges.map(b => `<div class="bdg ${b.got ? '' : 'off'}"><span>${b.icon}</span><b>${esc(b.name)}</b><small class="mut">${esc(b.desc)}</small><small>${b.got ? '✅ Conquistada' : '🔒 Bloqueada'}</small></div>`).join('')}</div>`;
}
const claim = async c => { try { await api(`/missions/${c}/claim`, 'POST'); profile(); } catch (e) { alert(e.message); } };
const buyHearts = async () => { try { await api('/shop/hearts', 'POST'); profile(); } catch (e) { alert(e.message); } };

// ---------- Tipos de atividade ----------
function ordenar(q, onCheck) { // toque nos itens na ordem correta
  const sel = [], box = document.createElement('div');
  const draw = () => {
    box.innerHTML = `<p class="mut">Toque nos itens na ordem correta:</p><div class="card" style="min-height:60px">${sel.map((x, n) => `<button class="opt" data-r="${n}">${n + 1}. ${esc(x.t)}</button>`).join('')}</div>` +
      q.items.filter(x => !sel.includes(x)).map(x => `<button class="opt" data-a="${x.i}">${esc(x.t)}</button>`).join('') + (sel.length === q.items.length ? '<button class="btn" id="vf">Verificar</button>' : '');
    box.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { sel.push(q.items.find(x => x.i == b.dataset.a)); draw(); });
    box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { sel.splice(+b.dataset.r, 1); draw(); });
    const v = box.querySelector('#vf'); if (v) v.onclick = () => { box.querySelectorAll('button').forEach(b => b.disabled = true); onCheck(sel.map(x => x.i)); };
  };
  draw(); return box;
}
function associar(q, onCheck) { // toque em um item e depois no seu par
  const map = {}, box = document.createElement('div'); let cur = null;
  const draw = () => {
    const used = new Set(Object.values(map).map(x => x.i));
    box.innerHTML = '<p class="mut">Toque em um item e depois no seu par (toque no item de novo para desfazer):</p>' +
      q.left.map(l => `<button class="opt ${cur === l.i ? 'ok' : ''}" data-l="${l.i}">${esc(l.t)}${map[l.i] ? ` → <b>${esc(map[l.i].t)}</b>` : ''}</button>`).join('') + '<hr>' +
      q.right.filter(r => !used.has(r.i)).map(r => `<button class="opt" data-r="${r.i}">${esc(r.t)}</button>`).join('') + (Object.keys(map).length === q.left.length ? '<button class="btn" id="vf">Verificar</button>' : '');
    box.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { const i = +b.dataset.l; if (map[i]) delete map[i]; else cur = i; draw(); });
    box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { if (cur === null) return; map[cur] = q.right.find(r => r.i == b.dataset.r); cur = null; draw(); });
    const v = box.querySelector('#vf'); if (v) v.onclick = () => { box.querySelectorAll('button').forEach(x => x.disabled = true); onCheck(q.left.map(l => map[l.i].i)); };
  };
  draw(); return box;
}
function preencher(q, onCheck) { // resposta digitada
  const box = document.createElement('div');
  box.innerHTML = '<input id="fa" placeholder="Digite sua resposta" autocomplete="off"><button class="btn" id="vf" style="margin-top:8px">Verificar</button>';
  const go = () => { const v = box.querySelector('#fa').value; if (!v.trim()) return; box.querySelectorAll('input,button').forEach(x => x.disabled = true); onCheck(v); };
  box.querySelector('#vf').onclick = go; box.querySelector('#fa').onkeydown = e => e.key === 'Enter' && go();
  return box;
}
const SOL = { ordenar: s => 'Ordem correta: ' + s.join(' → '), associar: s => 'Pares: ' + s.map(x => x.replace('|', ' ↔ ')).join(' · '), preencher: s => 'Resposta esperada: ' + s[0] };

// ---------- Explicação da lição (texto, imagem, vídeo) ----------
const ytId = u => (u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/) || [])[1];
const safeUrl = u => /^(https?:\/\/|\/uploads\/)/.test(u) ? esc(u) : '';
function block(b) {
  if (b.type === 'texto') return `<div class="intro">${esc(b.value)}</div>`;
  const cap = b.caption ? `<figcaption class="mut">${esc(b.caption)}</figcaption>` : '', y = ytId(b.value);
  if (b.type === 'imagem') return `<figure><img src="${safeUrl(b.value)}" alt="${esc(b.caption)}">${cap}</figure>`;
  return `<figure>${y ? `<iframe src="https://www.youtube-nocookie.com/embed/${y}" allowfullscreen loading="lazy"></iframe>` : `<video src="${safeUrl(b.value)}" controls></video>`}${cap}</figure>`;
}

async function openLesson(id) {
  let lesson; try { lesson = await api('/lessons/' + id); } catch (e) { return alert(e.message); }
  let i = 0, hits = 0, combo = 0;
  const step = () => {
    if (i >= lesson.questions.length) return finish();
    const q = lesson.questions[i];
    main.innerHTML = `<button class="link" onclick="home()">✕ Sair</button><div class="row"><small class="mut">Pergunta ${i + 1} de ${lesson.questions.length}</small><b>${Math.round(i / lesson.questions.length * 100)}%</b></div><div class="bar"><div style="width:${i / lesson.questions.length * 100}%"></div></div>
      <div class="steps"><span class="pill">📖 Explicação</span><span class="pill on">📝 Pergunta ${i + 1}/${lesson.questions.length}</span></div>${lesson.content.length ? `<details class="card"><summary>📖 Rever explicação</summary>${lesson.content.map(block).join('')}</details>` : ''}<h2>${esc(q.prompt)}</h2><div id="body"></div><div id="fb"></div>`;
    const submit = async answer => {
      const r = await api(`/questions/${q.id}/check`, 'POST', { answer });
      $('hearts').textContent = '❤️ ' + r.hearts;
      r.correct ? (hits++, combo++) : combo = 0;
      $('fb').innerHTML = `<div class="card ${r.correct ? 'okc' : 'badc'}"><strong>${r.correct ? '✅ Correto!' : '❌ Incorreto'}${combo >= 3 ? ` · 🔥 combo x${combo}!` : ''}</strong>
        ${!r.correct && r.solution ? `<p>${SOL[q.type](r.solution)}</p>` : ''}${r.explanation ? `<p>💡 ${esc(r.explanation)}</p>` : ''}</div>`;
      const out = !r.correct && r.hearts === 0 && !lesson.done;
      const nb = document.createElement('button'); nb.className = 'btn'; nb.textContent = out ? 'Sem vidas — voltar' : 'Continuar';
      nb.onclick = out ? home : () => { i++; step(); }; $('fb').appendChild(nb); return r;
    };
    const body = $('body');
    if (q.type === 'ordenar') body.appendChild(ordenar(q, submit));
    else if (q.type === 'associar') body.appendChild(associar(q, submit));
    else if (q.type === 'preencher') body.appendChild(preencher(q, submit));
    else {
      body.innerHTML = q.options.map((o, n) => `<button class="opt" data-n="${n}">${esc(o)}</button>`).join('');
      body.querySelectorAll('.opt').forEach(b => b.onclick = async () => {
        body.querySelectorAll('.opt').forEach(x => x.disabled = true);
        const r = await submit(+b.dataset.n);
        body.querySelectorAll('.opt').forEach(x => { if (+x.dataset.n === r.answer) x.classList.add('ok'); });
        if (!r.correct) b.classList.add('bad');
      });
    }
  };
  const finish = async () => {
    let r; try { r = await api(`/lessons/${id}/complete`, 'POST'); } catch (e) { alert(e.message); return home(); }
    refresh();
    main.innerHTML = `<div class="card" style="text-align:center"><h2>${r.perfect ? '💯 Lição perfeita!' : '🎉 Lição concluída!'}</h2><p>Acertos: ${r.hits}/${r.total}</p>
      ${r.gained ? `<p>⭐ +${r.gained} XP · 🪙 +${r.coins} moedas</p>` : '<p class="mut">Revisão: sem XP extra.</p>'}<p>🔥 Sequência: ${r.streak} dia(s)</p>
      ${r.levelUp ? `<h3>🎖️ Você subiu para o nível ${r.level}!</h3>` : ''}${r.badges.map(b => `<p>🏅 Nova conquista: ${b.icon} <b>${esc(b.name)}</b></p>`).join('')}
      <button class="btn" onclick="home()">Voltar às trilhas</button></div>`;
  };
  const explain = () => {
    if (!lesson.content.length) return step();
    main.innerHTML = `<button class="link" onclick="home()">✕ Sair</button><div class="steps">${lesson.presentation.length ? '<span class="pill">📌 Apresentação</span>' : ''}<span class="pill on">📖 Explicação</span><span class="pill">📝 Perguntas</span></div>
      <h2>${esc(lesson.title)}</h2><div class="card lesson-content">${lesson.content.map(block).join('')}</div><button class="btn" id="go">Começar as perguntas (+${lesson.xp} XP)</button>`;
    $('go').onclick = step;
  };
  if (lesson.presentation.length) { // Apresentação do módulo → Explicação → Perguntas
    main.innerHTML = `<button class="link" onclick="home()">✕ Sair</button><div class="steps"><span class="pill on">📌 Apresentação</span><span class="pill">📖 Explicação</span><span class="pill">📝 Perguntas</span></div>
      <h2>${esc(lesson.title)}</h2><div class="card lesson-content">${lesson.presentation.map(block).join('')}</div><button class="btn" id="go0">Continuar</button>`;
    $('go0').onclick = explain;
  } else explain();
}
home();

// ---------- Simulador financeiro (roda no navegador, sem backend) ----------
const brl = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function addRow(id) {
  $(id).insertAdjacentHTML('beforeend', `<div class="row" style="flex-wrap:nowrap"><input placeholder="Descrição"><input type="number" min="0" step="0.01" placeholder="R$ por mês"><button class="btn sm red" onclick="this.parentNode.remove()">✕</button></div>`);
}
function sim() {
  main.innerHTML = `<h2>💹 Simulador financeiro</h2><p class="mut">Veja como seu dinheiro evolui com receitas, gastos e rendimento.</p>
  <div class="card"><label>Saldo inicial (R$)<input id="s0" type="number" min="0" step="0.01" value="1000"></label>
  <label>Rendimento (% ao ano)<input id="rate" type="number" min="0" step="0.1" value="10"></label>
  <label>Inflação (% ao ano)<input id="inf" type="number" min="0" step="0.1" value="4"></label>
  <label>Prazo (anos, até 60)<input id="yrs" type="number" min="1" max="60" value="5"></label></div>
  <div class="card"><strong>💵 Receitas mensais</strong><div id="inc"></div><button class="btn sm sec" onclick="addRow('inc')">+ Receita</button></div>
  <div class="card"><strong>🧾 Gastos mensais</strong><div id="exp"></div><button class="btn sm sec" onclick="addRow('exp')">+ Gasto</button></div>
  <button class="btn" style="width:100%" onclick="calcSim()">Simular</button><div id="res"></div>`;
  addRow('inc'); addRow('exp');
}
function calcSim() {
  const num = id => Math.max(0, parseFloat($(id).value) || 0);
  const sum = id => [...document.querySelectorAll(`#${id} input[type=number]`)].reduce((t, i) => t + (parseFloat(i.value) || 0), 0);
  const s0 = num('s0'), yrs = Math.min(60, Math.max(1, Math.round(num('yrs')) || 1));
  const rate = (1 + num('rate') / 100) ** (1 / 12) - 1, infl = (1 + num('inf') / 100) ** (1 / 12);
  const net = sum('inc') - sum('exp');
  let a = s0, b = s0; const pts = [{ m: 0, a, b }];
  for (let m = 1; m <= yrs * 12; m++) { a = a * (1 + rate) + net; b += net; pts.push({ m, a, b }); }
  const neg = pts.find(p => p.a < 0);
  const W = 600, H = 220, all = pts.flatMap(p => [p.a, p.b]), mx = Math.max(...all, 1), mn = Math.min(...all, 0);
  const X = m => m / (yrs * 12) * W, Y = v => H - (v - mn) / (mx - mn || 1) * H;
  const line = (k, c) => `<polyline fill="none" stroke="${c}" stroke-width="3" points="${pts.map(p => X(p.m).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join(' ')}"/>`;
  $('res').innerHTML = `<div class="card"><h3>Resultado em ${yrs} ano(s)</h3>
    <p>Sobra (ou falta) por mês: <strong>${brl(net)}</strong></p>
    <p>Saldo final com rendimento: <strong>${brl(a)}</strong></p>
    <p>Saldo final sem rendimento: ${brl(b)}</p>
    <p>Rendimento acumulado: <strong>${brl(a - b)}</strong></p>
    <p>Valor em poder de compra de hoje (descontada a inflação): ${brl(a / infl ** (yrs * 12))}</p>
    ${neg ? `<p class="err">⚠️ Com esses gastos, o saldo fica negativo no mês ${neg.m}.</p>` : ''}</div>
    <div class="card"><svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" style="stroke:var(--bd)"/>${line('b', '#1cb0f6')}${line('a', '#58cc02')}</svg>
    <p><span style="color:#58cc02">■</span> com rendimento &nbsp; <span style="color:#1cb0f6">■</span> sem rendimento</p></div>
    <div class="card" style="overflow-x:auto"><table style="width:100%;text-align:right"><tr><th style="text-align:left">Ano</th><th>Com rendimento</th><th>Sem rendimento</th></tr>
    ${Array.from({ length: yrs }, (_, y) => `<tr><td style="text-align:left">${y + 1}</td><td>${brl(pts[(y + 1) * 12].a)}</td><td>${brl(pts[(y + 1) * 12].b)}</td></tr>`).join('')}</table></div>
    <p class="mut">Simulação educativa: taxa constante, sem impostos e sem tarifas. Não é recomendação de investimento.</p>`;
}