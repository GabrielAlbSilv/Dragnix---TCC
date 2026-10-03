if (!localStorage.getItem('token')) location = '/';
if (me()?.role !== 'adm') location = '/app.html';
const $ = id => document.getElementById(id), dlg = $('dlg');
const TYPE = { multipla: ['Múltipla escolha', '🔘'], vf: ['Verdadeiro/Falso', '✔️'], ordenar: ['Ordenar', '↕️'], preencher: ['Resposta digitada', '⌨️'], associar: ['Associar pares', '🔗'] };
let tree = [], sel = null, open = new Set();

// ---------- Janela (modal) genérica ----------
function modal(title, html, setup, collect) {
  return new Promise(resolve => {
    $('dt').textContent = title; $('fields').innerHTML = html; $('derr').textContent = '';
    let ok = false; setup && setup();
    $('ok').onclick = e => { e.preventDefault(); try { const v = collect(); ok = true; dlg.close(); resolve(v); } catch (err) { $('derr').textContent = err.message; } };
    $('cx').onclick = () => dlg.close(); $('frm').onsubmit = e => e.preventDefault();
    dlg.addEventListener('close', () => { if (!ok) resolve(null); }, { once: true });
    dlg.showModal();
  });
}
const SIMPLE = {
  tracks: [['title', 'Título da trilha'], ['icon', 'Ícone (emoji)'], ['color', 'Cor da trilha', 'color'], ['description', 'Descrição', 1]],
  lessons: [['title', 'Título da lição'], ['xp', 'XP da lição (recompensa)', 'number'], ['intro', 'Texto explicativo (aparece antes das questões)', 1]],
};
const simple = (res, title, d = {}) => { d = { color: '#58cc02', xp: 10, ...d }; return modal(title,
  SIMPLE[res].map(([k, l, t]) => `<label>${l}${t === 1 ? `<textarea name="${k}" rows="4">${esc(d[k])}</textarea>` : `<input name="${k}" type="${t || 'text'}" value="${esc(d[k])}">`}</label>`).join(''), null,
  () => { const o = Object.fromEntries(new FormData($('frm'))); if (!o.title.trim()) throw new Error('Informe o título'); if ('xp' in o) o.xp = Math.max(0, Number(o.xp) || 10); return o; }); };

// ---------- Editor de questão (alternativas dinâmicas) ----------
function questionForm(q = {}) {
  let type = q.type || 'multipla', ans = q.answer ?? 0;
  let items = Array.isArray(q.options) && q.options.length && q.type !== 'vf' ? [...q.options] : ['', ''];
  const HINT = { multipla: 'Marque a alternativa correta.', ordenar: 'Digite os itens na ordem correta (o aluno os verá embaralhados).', preencher: 'Respostas aceitas (maiúsculas e acentos são ignorados). Use mais de uma para variações.', associar: 'Digite cada par (esquerda → direita). O aluno os verá embaralhados.' };
  const sync = () => {
    $('ed').querySelectorAll('[data-i]').forEach(e => {
      const i = +e.dataset.i;
      if (e.dataset.s === undefined) items[i] = e.value;
      else { const p = (items[i] || '').split('='); p[+e.dataset.s] = e.value.replace(/=/g, ''); items[i] = (p[0] || '') + '=' + (p[1] || ''); }
    });
    const c = $('ed').querySelector('[name=c]:checked'); if (c) ans = +c.value;
  };
  const row = (t, i) => {
    const del = `<button type="button" class="btn sm red" data-d="${i}">✕</button>`;
    if (type === 'associar') { const [l = '', r = ''] = t.split('='); return `<div class="opt-row"><input data-i="${i}" data-s="0" value="${esc(l)}" placeholder="Item ${i + 1}"><span>→</span><input data-i="${i}" data-s="1" value="${esc(r)}" placeholder="Par">${del}</div>`; }
    const lead = type === 'multipla' ? `<input type="radio" name="c" value="${i}" ${ans == i ? 'checked' : ''}>` : type === 'ordenar' ? `<b>${i + 1}.</b>` : '';
    const mv = type === 'ordenar' ? `<button type="button" class="btn sm sec" data-m="${i}:-1">↑</button><button type="button" class="btn sm sec" data-m="${i}:1">↓</button>` : '';
    return `<div class="opt-row">${lead}<input data-i="${i}" value="${esc(t)}" placeholder="${type === 'preencher' ? 'Resposta' : type === 'ordenar' ? 'Item' : 'Alternativa'} ${i + 1}">${mv}${del}</div>`;
  };
  const draw = () => {
    const ed = $('ed');
    if (type === 'vf') { if (ans > 1) ans = 0; ed.innerHTML = ['Verdadeiro', 'Falso'].map((t, i) => `<label class="opt-row"><input type="radio" name="c" value="${i}" ${ans == i ? 'checked' : ''}> ${t}</label>`).join(''); return; }
    ed.innerHTML = `<p class="mut">${HINT[type]}</p>` + items.map(row).join('') + '<button type="button" class="btn sm sec" id="addo">+ Adicionar</button>';
    ed.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { sync(); const [i, d] = b.dataset.m.split(':').map(Number); if (items[i + d] !== undefined) [items[i], items[i + d]] = [items[i + d], items[i]]; draw(); });
    ed.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { sync(); const i = +b.dataset.d; items.splice(i, 1); if (i < ans) ans--; if (ans >= items.length) ans = 0; draw(); });
    $('addo').onclick = () => { sync(); items.push(''); draw(); };
  };
  return modal(q.id ? 'Editar questão' : 'Nova questão',
    `<label>Tipo de questão<select id="qt">${Object.entries(TYPE).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${v[1]} ${v[0]}</option>`).join('')}</select></label>
     <label>Enunciado<textarea id="qp" rows="3">${esc(q.prompt)}</textarea></label><div id="ed"></div>
     <label>Explicação (mostrada após responder)<textarea id="qx" rows="2">${esc(q.explanation)}</textarea></label>`,
    () => { $('qt').onchange = e => { sync(); const old = type; type = e.target.value; if ((old === 'associar') !== (type === 'associar')) items = ['', '']; draw(); }; draw(); },
    () => {
      sync(); const prompt = $('qp').value.trim(), explanation = $('qx').value.trim(); if (!prompt) throw new Error('Informe o enunciado');
      if (type === 'vf') return { type, prompt, explanation, options: ['Verdadeiro', 'Falso'], answer: ans };
      const keep = items.map((t, i) => ({ t: t.trim(), i })).filter(x => type === 'associar' ? x.t.split('=').every(s => s.trim()) : x.t);
      const min = type === 'preencher' ? 1 : 2; if (keep.length < min) throw new Error(`Preencha ao menos ${min} ${min > 1 ? 'itens' : 'resposta'}`);
      const answer = type === 'multipla' ? keep.findIndex(x => x.i === ans) : 0;
      if (answer < 0) throw new Error('Marque a alternativa correta (e preencha o texto dela)');
      return { type, prompt, explanation, options: keep.map(x => x.t), answer };
    });
}

// ---------- Editor de blocos (texto, imagem, vídeo): usado na Apresentação e na Explicação ----------
function blockEditor(host, initial) {
  const blocks = (initial || []).map(b => ({ ...b })), NAME = { texto: '📝 Texto', imagem: '🖼️ Imagem', video: '🎬 Vídeo' };
  const sync = () => host.querySelectorAll('[data-b]').forEach(e => blocks[+e.dataset.b][e.dataset.f] = e.value);
  const draw = () => {
    host.innerHTML = (blocks.map((b, i) => `<div class="blk"><div class="row"><b>${NAME[b.type]}</b><span class="acts">
      <button type="button" class="btn sm sec" data-m="${i}:-1">↑</button><button type="button" class="btn sm sec" data-m="${i}:1">↓</button><button type="button" class="btn sm red" data-d="${i}">✕</button></span></div>
      ${b.type === 'texto' ? `<textarea data-b="${i}" data-f="value" rows="4" placeholder="Escreva o texto...">${esc(b.value)}</textarea>`
        : `<input data-b="${i}" data-f="value" value="${esc(b.value)}" placeholder="${b.type === 'video' ? 'Link do YouTube ou de um vídeo (.mp4)' : 'Link da imagem'}">
           <label class="btn sm sec" style="display:inline-block">⬆️ Enviar do computador<input type="file" hidden data-u="${i}" accept="${b.type === 'video' ? 'video/mp4,video/webm' : 'image/*'}"></label>
           <input data-b="${i}" data-f="caption" value="${esc(b.caption)}" placeholder="Legenda (opcional)">`}</div>`).join('') || '<p class="mut">Nenhum conteúdo ainda.</p>') +
      '<div class="acts" style="margin:8px 0"><button type="button" class="btn sm sec" data-add="texto">+ Texto</button><button type="button" class="btn sm sec" data-add="imagem">+ Imagem</button><button type="button" class="btn sm sec" data-add="video">+ Vídeo</button></div>';
    host.querySelectorAll('[data-m]').forEach(x => x.onclick = () => { sync(); const [i, d] = x.dataset.m.split(':').map(Number); if (blocks[i + d]) [blocks[i], blocks[i + d]] = [blocks[i + d], blocks[i]]; draw(); });
    host.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { sync(); blocks.splice(+x.dataset.d, 1); draw(); });
    host.querySelectorAll('[data-add]').forEach(x => x.onclick = () => { sync(); blocks.push({ type: x.dataset.add, value: '', caption: '' }); draw(); });
    host.querySelectorAll('[data-u]').forEach(x => x.onchange = async () => {
      const f = x.files[0]; if (!f) return; sync();
      if (f.size > 25 * 1024 * 1024) { $('derr').textContent = 'Arquivo maior que 25 MB'; return; }
      $('derr').textContent = 'Enviando arquivo...';
      try {
        const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
        blocks[+x.dataset.u].value = (await api('/admin/upload', 'POST', { name: f.name, data })).url; $('derr').textContent = ''; draw();
      } catch (e) { $('derr').textContent = e.message; }
    });
  };
  draw();
  return { get() {
    sync(); const c = blocks.map(b => ({ ...b, value: (b.value || '').trim(), caption: (b.caption || '').trim() })).filter(b => b.value);
    if (c.some(b => b.type !== 'texto' && !/^(https?:\/\/|\/uploads\/)/.test(b.value))) throw new Error('Links de imagem/vídeo devem começar com http:// ou https:// (ou envie o arquivo)');
    return c;
  } };
}

// ---------- Formulário do módulo (apresentação + explicação) ----------
function lessonForm(l = {}) {
  let pe, ce;
  return modal(l.id ? 'Editar módulo' : 'Novo módulo',
    `<label>Título do módulo<input id="lt" value="${esc(l.title)}"></label><label>XP do módulo (recompensa)<input id="lx" type="number" value="${esc(l.xp ?? 10)}"></label>
     <p><b>📌 Apresentação</b> <small class="mut">— opcional, aparece no começo do módulo</small></p><div id="pe"></div>
     <p><b>📖 Explicação</b> <small class="mut">— o aluno lê antes das perguntas</small></p><div id="ce"></div>`,
    () => { pe = blockEditor($('pe'), l.presentation); ce = blockEditor($('ce'), Array.isArray(l.content) && l.content.length ? l.content : (l.intro ? [{ type: 'texto', value: l.intro }] : [])); },
    () => { const title = $('lt').value.trim(); if (!title) throw new Error('Informe o título'); return { title, xp: Math.max(0, Number($('lx').value) || 10), presentation: pe.get(), content: ce.get() }; });
}

// ---------- Formulário da trilha (com apresentação opcional) ----------
function trackForm(t = {}) {
  let pe; t = { color: '#58cc02', ...t };
  return modal(t.id ? 'Editar trilha' : 'Nova trilha',
    `<label>Título da trilha<input id="tt" value="${esc(t.title)}"></label><label>Ícone (emoji)<input id="ti" value="${esc(t.icon)}"></label>
     <label>Cor da trilha<input id="tc" type="color" value="${esc(t.color)}"></label><label>Descrição<textarea id="td" rows="3">${esc(t.description)}</textarea></label>
     <p><b>📌 Apresentação da trilha</b> <small class="mut">— opcional, aparece no começo da trilha</small></p><div id="pe"></div>`,
    () => { pe = blockEditor($('pe'), t.presentation); },
    () => { const title = $('tt').value.trim(); if (!title) throw new Error('Informe o título'); return { title, icon: $('ti').value.trim() || '📚', color: $('tc').value, description: $('td').value.trim(), presentation: pe.get() }; });
}

// ---------- Dados e ações ----------
async function load() { tree = await api('/admin/tree'); if (!tree.some(t => t.id === sel)) sel = tree[0]?.id ?? null; render(); }
const run = async fn => { try { await fn(); await load(); } catch (e) { alert(e.message); } };
const lessons = () => tree.flatMap(t => t.lessons);
const move = (list, id, d, res) => {
  const i = list.findIndex(x => x.id === id), j = i + d; if (j < 0 || j >= list.length) return;
  const a = [...list]; [a[i], a[j]] = [a[j], a[i]];
  return run(() => Promise.all(a.map((x, k) => x.position === k ? 0 : api(`/admin/${res}/${x.id}`, 'PUT', { position: k }))));
};
async function act(a, id, d) {
  const T = tree.find(t => t.id === sel), L = lessons().find(l => l.id === id);
  const Lq = lessons().find(l => l.questions.some(q => q.id === id)), Q = Lq?.questions.find(q => q.id === id);
  let o;
  if (a === 'sel') { sel = id; return render(); }
  if (a === 'tab') { tab = id ? 'des' : 'mod'; return render(); }
  if (a === 'tog') { open.has(id) ? open.delete(id) : open.add(id); return render(); }
  if (a === 'nt' && (o = await trackForm())) run(async () => { sel = (await api('/admin/tracks', 'POST', { ...o, position: tree.length })).id; });
  if (a === 'et' && (o = await trackForm(T))) run(() => api(`/admin/tracks/${T.id}`, 'PUT', o));
  if (a === 'dt' && confirm(`Excluir a trilha "${T.title}" e todo o conteúdo dela?`)) run(() => api(`/admin/tracks/${T.id}`, 'DELETE'));
  if (a === 'nl' && (o = await lessonForm())) run(async () => { open.add((await api('/admin/lessons', 'POST', { ...o, track_id: T.id, position: T.lessons.length })).id); });
  if (a === 'el' && (o = await lessonForm(L))) run(() => api(`/admin/lessons/${id}`, 'PUT', o));
  if (a === 'dl' && confirm(`Excluir o módulo "${L.title}" e suas questões?`)) run(() => api(`/admin/lessons/${id}`, 'DELETE'));
  if (a === 'nq' && (o = await questionForm())) { open.add(id); run(() => api('/admin/questions', 'POST', { ...o, lesson_id: id, position: L.questions.length })); }
  if (a === 'eq' && (o = await questionForm(Q))) run(() => api(`/admin/questions/${id}`, 'PUT', o));
  if (a === 'dq' && confirm('Excluir esta questão?')) run(() => api(`/admin/questions/${id}`, 'DELETE'));
  if (a === 'ml') move(T.lessons, id, d, 'lessons');
  if (a === 'mq') move(Lq.questions, id, d, 'questions');
}
$('main').onclick = e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a, +b.dataset.id, +b.dataset.d); };

// ---------- Telas ----------
const arrows = (a, id, i, n) => `<button class="btn sm sec" data-a="${a}" data-id="${id}" data-d="-1" ${i ? '' : 'disabled'}>↑</button><button class="btn sm sec" data-a="${a}" data-id="${id}" data-d="1" ${i < n - 1 ? '' : 'disabled'}>↓</button>`;
const questionHtml = (q, i, n) => `<div class="q"><span class="badge">${TYPE[q.type || 'multipla'][1]} ${TYPE[q.type || 'multipla'][0]}</span><span class="qp">${esc(q.prompt)}</span>
  <span class="acts">${arrows('mq', q.id, i, n)}<button class="btn sm sec" data-a="eq" data-id="${q.id}">✏️</button><button class="btn sm red" data-a="dq" data-id="${q.id}">🗑️</button></span></div>`;
const lessonHtml = (l, i, n) => `<div class="lesson"><div class="lh"><button class="lt" data-a="tog" data-id="${l.id}"><span class="num">${i + 1}</span>
  <span><b>Módulo ${i + 1} — ${esc(l.title)}</b><small>${l.questions.length} questões · ${l.xp ?? 10} XP${l.presentation?.length ? ' · 📌 apresentação' : ''}${(l.content?.length || l.intro) ? ` · 📖 ${l.content?.length || 1} bloco(s)` : ''}</small></span><span class="chev">${open.has(l.id) ? '▾' : '▸'}</span></button>
  <div class="acts">${arrows('ml', l.id, i, n)}<button class="btn sm sec" data-a="el" data-id="${l.id}">✏️ Editar</button><button class="btn sm red" data-a="dl" data-id="${l.id}" ${n <= 1 ? 'disabled title="Cada trilha precisa de ao menos 1 módulo"' : ''}>🗑️</button></div></div>
  ${open.has(l.id) ? `<div class="lb">${l.questions.map((q, k) => questionHtml(q, k, l.questions.length)).join('') || '<p class="mut">Nenhuma questão ainda.</p>'}
  <p><button class="btn sm" data-a="nq" data-id="${l.id}">+ Nova questão</button></p></div>` : ''}</div>`;
let tab = 'mod';
function render() {
  const t = tree.find(x => x.id === sel), nL = lessons().length, nQ = lessons().reduce((n, l) => n + l.questions.length, 0);
  $('main').innerHTML = `<div class="stats-row"><div class="stat"><b>${tree.length}</b>Trilhas</div><div class="stat"><b>${nL}</b>Módulos</div><div class="stat"><b>${nQ}</b>Questões</div></div>
  <div class="split"><aside><button class="btn" data-a="nt">+ Nova trilha</button>
  ${tree.map(x => `<button class="tr ${x.id === sel ? 'on' : ''}" data-a="sel" data-id="${x.id}"><span class="ic">${esc(x.icon)}</span><span><b>${esc(x.title)}</b><small>${x.lessons.length} módulos</small></span></button>`).join('')}</aside>
  <section>${t ? `<div class="thead"><div class="ic big">${esc(t.icon)}</div><div style="flex:1"><h2>${esc(t.title)}</h2><p class="mut">${esc(t.description) || 'Sem descrição'}</p>
    <small class="mut">📌 Apresentação da trilha: ${t.presentation?.length ? t.presentation.length + ' bloco(s)' : 'não definida'}</small></div>
    <div class="acts"><button class="btn sm sec" data-a="et">✏️ Editar</button><button class="btn sm red" data-a="dt">🗑️</button></div></div>
    <div class="steps" style="margin-top:16px"><span class="pill ${tab === 'mod' ? 'on' : ''}" data-a="tab" data-id="0">📚 Módulos</span><span class="pill ${tab === 'des' ? 'on' : ''}" data-a="tab" data-id="1">🏆 Desafios</span></div>
    ${tab === 'des' ? '<div class="empty">🏆 Os desafios serão adicionados em breve.</div>' : `
    <div class="row" style="margin:12px 0"><div><h3 style="margin:0">Módulos (${t.lessons.length}/10)</h3><small class="mut">Os alunos seguem a ordem 1, 2, 3… e só abrem o módulo seguinte ao concluir o anterior. Mínimo 1, máximo 10.</small></div>
    <button class="btn sm" data-a="nl" ${t.lessons.length >= 10 ? 'disabled' : ''}>+ Novo módulo</button></div>
    ${t.lessons.map((l, i) => lessonHtml(l, i, t.lessons.length)).join('')}`}`
    : '<div class="empty">Crie sua primeira trilha para começar. 🚀</div>'}</section></div>`;
}
let US = [];
async function delUser(id) {
  const u = US.find(x => x.id === id);
  if (!confirm(`Excluir a conta de "${u.name}" (${u.email})?\nTodo o progresso dessa pessoa será apagado. Esta ação não pode ser desfeita.`)) return;
  try { await api(`/admin/users/${id}`, 'DELETE'); usersView(); } catch (e) { alert(e.message); }
}
async function usersView() {
  const us = US = await api('/admin/users');
  $('main').innerHTML = '<h2>Usuários</h2>' + us.map(u => `<div class="card row"><span><b>${esc(u.name)}</b><br><small class="mut">${esc(u.email)}</small></span>
    <select onchange="setRole(${u.id},this.value)" style="width:auto" ${u.id === me().id ? 'disabled' : ''}><option value="comum" ${u.role === 'comum' ? 'selected' : ''}>Comum</option><option value="adm" ${u.role === 'adm' ? 'selected' : ''}>ADM</option></select><button class="btn sm red" onclick="delUser(${u.id})" ${u.id === me().id ? 'disabled' : ''}>🗑️ Excluir</button></div>`).join('');
}
async function setRole(id, role) { try { await api(`/admin/users/${id}/role`, 'PUT', { role }); } catch (e) { alert(e.message); usersView(); } }
$('t1').onclick = load; $('t2').onclick = usersView; load();