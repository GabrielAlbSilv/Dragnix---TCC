if (!localStorage.token) location = '/';
if (me()?.role !== 'adm') location = '/app.html';
const main = document.getElementById('main'), dlg = document.getElementById('dlg');

// Definição dos formulários de cada recurso (sem conteúdo: apenas a estrutura)
const FORMS = {
  tracks: [['title', 'Título da trilha'], ['description', 'Descrição', 'textarea'], ['icon', 'Ícone (emoji)'], ['position', 'Ordem', 'number']],
  lessons: [['title', 'Título da lição'], ['intro', 'Texto explicativo (aparece antes das questões)', 'textarea'], ['position', 'Ordem', 'number']],
  questions: [['type', 'Tipo de questão', 'select'], ['prompt', 'Enunciado', 'textarea'], ['options', 'Alternativas, uma por linha (em "Ordenar": já na ORDEM CORRETA; em V/F: ignorado)', 'textarea'], ['answer', 'Nº da alternativa correta, começa em 0 (V/F: 0=Verdadeiro, 1=Falso; Ordenar: ignorado)', 'number'], ['position', 'Ordem', 'number']],
};

const TYPES = [['multipla', 'Múltipla escolha'], ['vf', 'Verdadeiro ou falso'], ['ordenar', 'Ordenar itens']];
function form(res, title, data = {}) {
  return new Promise(resolve => {
    document.getElementById('dt').textContent = title;
    document.getElementById('derr').textContent = '';
    document.getElementById('fields').innerHTML = FORMS[res].map(([k, label, type]) => {
      let v = data[k] ?? (k === 'type' ? 'multipla' : ''); if (k === 'options' && Array.isArray(v)) v = v.join('\n');
      const ctl = type === 'textarea' ? `<textarea name="${k}" rows="3">${esc(v)}</textarea>`
        : type === 'select' ? `<select name="${k}">${TYPES.map(([a, b]) => `<option value="${a}" ${a === v ? 'selected' : ''}>${b}</option>`).join('')}</select>`
        : `<input name="${k}" type="${type || 'text'}" value="${esc(v)}">`;
      return `<label>${label}${ctl}</label>`;
    }).join('');
    dlg.onclose = null; dlg.showModal();
    document.getElementById('ok').onclick = e => {
      e.preventDefault();
      const o = {}; new FormData(document.getElementById('frm')).forEach((v, k) => o[k] = v);
      if (o.options !== undefined) o.options = o.options.split('\n').map(s => s.trim()).filter(Boolean);
      ['position', 'answer'].forEach(k => { if (o[k] !== undefined) o[k] = Number(o[k]) || 0; });
      dlg.close(); resolve(o);
    };
    dlg.addEventListener('close', () => resolve(null), { once: true });
  });
}
async function save(res, id, title, data, extra = {}) {
  const o = await form(res, title, data); if (!o) return;
  try { id ? await api(`/admin/${res}/${id}`, 'PUT', o) : await api(`/admin/${res}`, 'POST', { ...o, ...extra }); tracksView(); }
  catch (e) { alert(e.message); }
}
async function del(res, id) { if (confirm('Excluir? Itens filhos também serão removidos.')) { await api(`/admin/${res}/${id}`, 'DELETE'); tracksView(); } }

let tree = [];
const find = (res, id) => tree.flatMap(t => [t, ...t.lessons.flatMap(l => [l, ...l.questions])]).find(x => x.id === id && (res === 'tracks' ? 'lessons' in x && 'title' in x && !('track_id' in x) : res === 'lessons' ? 'track_id' in x : 'lesson_id' in x));
const edit = (res, id) => save(res, id, 'Editar', find(res, id));
const add = (res, parentKey, parentId) => save(res, null, 'Novo', {}, parentKey ? { [parentKey]: parentId } : {});
const btns = (res, id) => `<button class="btn sm sec" onclick="edit('${res}',${id})">Editar</button> <button class="btn sm red" onclick="del('${res}',${id})">Excluir</button>`;

async function tracksView() {
  tree = await api('/admin/tree');
  main.innerHTML = `<button class="btn" onclick="add('tracks')">+ Nova trilha</button>` + tree.map(t => `
    <div class="card"><div class="row"><h3>${esc(t.icon)} ${esc(t.title)}</h3><span>${btns('tracks', t.id)}</span></div>
    <button class="btn sm" onclick="add('lessons','track_id',${t.id})">+ Lição</button>
    ${t.lessons.map(l => `<div class="ind"><div class="row"><strong>${esc(l.title)}</strong><span>${btns('lessons', l.id)}</span></div>
      <button class="btn sm sec" onclick="add('questions','lesson_id',${l.id})">+ Questão</button>
      ${l.questions.map(q => `<div class="ind row"><span><small class="mut">[${q.type}]</small> ${esc(q.prompt)}</span><span>${btns('questions', q.id)}</span></div>`).join('')}</div>`).join('')}</div>`).join('');
}
async function usersView() {
  const us = await api('/admin/users');
  main.innerHTML = us.map(u => `<div class="card row"><span>${esc(u.name)}<br><small class="mut">${esc(u.email)}</small></span>
    <select onchange="setRole(${u.id},this.value)" style="width:auto" ${u.id === me().id ? 'disabled' : ''}>
    <option value="comum" ${u.role === 'comum' ? 'selected' : ''}>Comum</option><option value="adm" ${u.role === 'adm' ? 'selected' : ''}>ADM</option></select></div>`).join('');
}
async function setRole(id, role) { try { await api(`/admin/users/${id}/role`, 'PUT', { role }); } catch (e) { alert(e.message); usersView(); } }

const tab = (n) => { t1.className = 'btn' + (n === 1 ? '' : ' sec'); t2.className = 'btn' + (n === 2 ? '' : ' sec'); n === 1 ? tracksView() : usersView(); };
t1.onclick = () => tab(1); t2.onclick = () => tab(2); tab(1);
