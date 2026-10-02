if (!localStorage.token) location = '/';
const main = document.getElementById('main');
if (me()?.role === 'adm') document.getElementById('adm').classList.remove('hide');

async function home() {
  const { tracks, xp } = await api('/tracks');
  document.getElementById('xp').textContent = '⭐ ' + xp + ' XP';
  main.innerHTML = tracks.length ? tracks.map(t => `
    <div class="card"><h2>${esc(t.icon)} ${esc(t.title)}</h2><p class="mut">${esc(t.description)}</p>
    <div class="path">${t.lessons.map((l, i) => `<div style="text-align:center"><button class="node ${l.done ? 'done' : ''}" onclick="openLesson(${l.id})">${l.done ? '✓' : i + 1}</button><div class="mut">${esc(l.title)}</div></div>`).join('') || '<span class="mut">Sem lições ainda.</span>'}</div></div>`).join('')
    : '<p class="mut">Nenhuma trilha disponível ainda.</p>';
}

async function openLesson(id) {
  const lesson = await api('/lessons/' + id);
  let i = 0, hits = 0;
  const step = () => {
    if (i >= lesson.questions.length) return finish();
    const q = lesson.questions[i];
    main.innerHTML = `<button class="link" style="background:none;border:0;color:var(--blue);cursor:pointer" onclick="home()">✕ Sair</button>
      <div class="bar"><div style="width:${i / lesson.questions.length * 100}%"></div></div>
      <h2>${esc(q.prompt)}</h2>${q.options.map((o, n) => `<button class="opt" data-n="${n}">${esc(o)}</button>`).join('')}`;
    main.querySelectorAll('.opt').forEach(b => b.onclick = async () => {
      const r = await api(`/questions/${q.id}/check`, 'POST', { answer: b.dataset.n });
      main.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (+x.dataset.n === r.answer) x.classList.add('ok'); });
      if (!r.correct) b.classList.add('bad'); else hits++;
      const nb = document.createElement('button'); nb.className = 'btn'; nb.textContent = 'Continuar'; nb.style.marginTop = '12px';
      nb.onclick = () => { i++; step(); }; main.appendChild(nb);
    });
  };
  const finish = async () => {
    await api(`/lessons/${id}/complete`, 'POST');
    main.innerHTML = `<div class="card" style="text-align:center"><h2>🎉 Lição concluída!</h2><p>Acertos: ${hits}/${lesson.questions.length}</p><button class="btn" onclick="home()">Voltar às trilhas</button></div>`;
  };
  step();
}
home();
