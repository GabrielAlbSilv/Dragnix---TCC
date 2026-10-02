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
