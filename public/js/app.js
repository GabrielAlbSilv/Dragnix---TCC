if (!localStorage.token) location = '/';
const main = document.getElementById('main'), $ = id => document.getElementById(id);
if (me()?.role === 'adm') $('adm').classList.remove('hide');

async function home() {
  const d = await api('/tracks');
  $('xp').textContent = '⭐ ' + d.xp; $('streak').textContent = '🔥 ' + d.streak;
  $('hearts').textContent = '❤️ ' + d.hearts + (d.next ? ` (+1 em ${Math.ceil(d.next / 60)} min)` : '');
  main.innerHTML = d.tracks.length ? d.tracks.map(t => `
    <div class="card"><h2>${esc(t.icon)} ${esc(t.title)}</h2><p class="mut">${esc(t.description)}</p>
    <div class="path">${t.lessons.map((l, i) => `<div style="text-align:center"><button class="node ${l.done ? 'done' : ''}" onclick="openLesson(${l.id})">${l.done ? '✓' : i + 1}</button><div class="mut">${esc(l.title)}</div></div>`).join('') || '<span class="mut">Sem lições ainda.</span>'}</div></div>`).join('')
    : '<p class="mut">Nenhuma trilha disponível ainda.</p>';
}

async function rank() {
  const r = await api('/ranking');
  main.innerHTML = '<h2>🏆 Ranking</h2>' + r.map((u, n) => `<div class="card row" ${u.me ? 'style="border-color:var(--g)"' : ''}><span>${n + 1}º ${esc(u.name)}</span><span>⭐ ${u.xp} · 🔥 ${u.streak}</span></div>`).join('');
}

// Questão de ordenar: toque nos itens na ordem correta
function ordenar(q, onCheck) {
  const sel = [], box = document.createElement('div');
  const draw = () => {
    box.innerHTML = `<p class="mut">Toque nos itens na ordem correta:</p><div class="card" style="min-height:60px">${sel.map((x, n) => `<button class="opt" data-r="${n}">${n + 1}. ${esc(x.t)}</button>`).join('')}</div>` +
      q.items.filter(x => !sel.includes(x)).map(x => `<button class="opt" data-a="${x.i}">${esc(x.t)}</button>`).join('') +
      (sel.length === q.items.length ? '<button class="btn" id="vf">Verificar</button>' : '');
    box.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { sel.push(q.items.find(x => x.i == b.dataset.a)); draw(); });
    box.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { sel.splice(+b.dataset.r, 1); draw(); });
    const v = box.querySelector('#vf'); if (v) v.onclick = () => { box.querySelectorAll('button').forEach(b => b.disabled = true); onCheck(sel.map(x => x.i)); };
  };
  draw(); return box;
}

async function openLesson(id) {
  let lesson; try { lesson = await api('/lessons/' + id); } catch (e) { return alert(e.message); }
  let i = 0, hits = 0;
  const step = () => {
    if (i >= lesson.questions.length) return finish();
    const q = lesson.questions[i];
    main.innerHTML = `<button class="link" onclick="home()">✕ Sair</button><div class="bar"><div style="width:${i / lesson.questions.length * 100}%"></div></div>
      <h2>${esc(q.prompt)}</h2><div id="body"></div><div id="fb"></div>`;
    const submit = async answer => {
      const r = await api(`/questions/${q.id}/check`, 'POST', { answer });
      $('hearts').textContent = '❤️ ' + r.hearts;
      if (r.correct) hits++;
      $('fb').innerHTML = `<div class="card ${r.correct ? 'okc' : 'badc'}"><strong>${r.correct ? '✅ Correto!' : '❌ Incorreto'}</strong>${r.solution ? `<p>Ordem correta: ${r.solution.map(esc).join(' → ')}</p>` : ''}</div>`;
      const out = !r.correct && r.hearts === 0 && !lesson.done;
      const nb = document.createElement('button'); nb.className = 'btn';
      nb.textContent = out ? 'Sem vidas — voltar' : 'Continuar';
      nb.onclick = out ? home : () => { i++; step(); };
      $('fb').appendChild(nb); return r;
    };
    const body = $('body');
    if (q.type === 'ordenar') body.appendChild(ordenar(q, submit));
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
    const r = await api(`/lessons/${id}/complete`, 'POST');
    $('streak').textContent = '🔥 ' + r.streak;
    main.innerHTML = `<div class="card" style="text-align:center"><h2>🎉 Lição concluída!</h2><p>Acertos: ${hits}/${lesson.questions.length}</p><p>🔥 Sequência: ${r.streak} dia(s)</p><button class="btn" onclick="home()">Voltar às trilhas</button></div>`;
  };
  if (lesson.intro) {
    main.innerHTML = `<button class="link" onclick="home()">✕ Sair</button><h2>${esc(lesson.title)}</h2><div class="card intro">${esc(lesson.intro)}</div><button class="btn" id="go">Começar</button>`;
    $('go').onclick = step;
  } else step();
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
