if (!localStorage.getItem('token')) location = '/';
if (me()?.role !== 'adm') location = '/app.html';

const $ = id => document.getElementById(id),
    dlg = $('dlg');

const TYPE = {
    multipla: ['Múltipla escolha', '🔘'],
    vf: ['Verdadeiro/Falso', '✔️'],
    ordenar: ['Ordenar', '↕️']
};

let tree = [],
    sel = null,
    open = new Set();

// ---------- Janela (modal) genérica ----------
function modal(title, html, setup, collect) {
    return new Promise(resolve => {
        $('dt').textContent = title;
        $('fields').innerHTML = html;
        $('derr').textContent = '';

        let ok = false;

        setup && setup();

        $('ok').onclick = e => {
            e.preventDefault();

            try {
                const v = collect();

                ok = true;
                dlg.close();
                resolve(v);
            } catch (err) {
                $('derr').textContent = err.message;
            }
        };

        $('cx').onclick = () => dlg.close();

        $('frm').onsubmit = e => e.preventDefault();

        dlg.addEventListener(
            'close',
            () => {
                if (!ok) resolve(null);
            },
            { once: true }
        );

        dlg.showModal();
    });
}

const SIMPLE = {
    tracks: [
        ['title', 'Título da trilha'],
        ['icon', 'Ícone (emoji)'],
        ['description', 'Descrição', 1]
    ],

    lessons: [
        ['title', 'Título da lição'],
        ['intro', 'Texto explicativo (aparece antes das questões)', 1]
    ],
};

const simple = (res, title, d = {}) =>
    modal(
        title,
        SIMPLE[res]
            .map(
                ([k, l, ta]) =>
                    `<label>${l}${
                        ta
                            ? `<textarea name="${k}" rows="4">${esc(d[k])}</textarea>`
                            : `<input name="${k}" value="${esc(d[k])}">`
                    }</label>`
            )
            .join(''),
        null,
        () => {
            const o = Object.fromEntries(new FormData($('frm')));

            if (!o.title.trim()) {
                throw new Error('Informe o título');
            }

            return o;
        }
    );

// ---------- Editor de questão (alternativas dinâmicas) ----------
function questionForm(q = {}) {
    let type = q.type || 'multipla',
        ans = q.answer ?? 0;

    let items =
        Array.isArray(q.options) &&
        q.options.length &&
        q.type !== 'vf'
            ? [...q.options]
            : ['', ''];

    const sync = () => {
        $('ed')
            .querySelectorAll('[data-i]')
            .forEach(e => (items[+e.dataset.i] = e.value));

        const c = $('ed').querySelector('[name=c]:checked');

        if (c) {
            ans = +c.value;
        }
    };

    const draw = () => {
        const ed = $('ed'),
            ord = type === 'ordenar';

        if (type === 'vf') {
            if (ans > 1) {
                ans = 0;
            }

            ed.innerHTML = ['Verdadeiro', 'Falso']
                .map(
                    (t, i) =>
                        `<label class="opt-row"><input type="radio" name="c" value="${i}" ${
                            ans == i ? 'checked' : ''
                        }> ${t}</label>`
                )
                .join('');

            return;
        }

        ed.innerHTML =
            `<p class="mut">${
                ord
                    ? 'Digite os itens na ordem correta (o aluno os verá embaralhados).'
                    : 'Marque a alternativa correta.'
            }</p>` +
            items
                .map(
                    (t, i) =>
                        `<div class="opt-row">${
                            ord
                                ? `<b>${i + 1}.</b>`
                                : `<input type="radio" name="c" value="${i}" ${
                                      ans == i ? 'checked' : ''
                                  }>`
                        }<input data-i="${i}" value="${esc(t)}" placeholder="${
                            ord ? 'Item' : 'Alternativa'
                        } ${i + 1}">
                        ${
                            ord
                                ? `<button type="button" class="btn sm sec" data-m="${i}:-1">↑</button><button type="button" class="btn sm sec" data-m="${i}:1">↓</button>`
                                : ''
                        }<button type="button" class="btn sm red" data-d="${i}">✕</button></div>`
                )
                .join('') +
            '<button type="button" class="btn sm sec" id="addo">+ Adicionar</button>';

        ed.querySelectorAll('[data-m]').forEach(
            b =>
                (b.onclick = () => {
                    sync();

                    const [i, d] = b.dataset.m.split(':').map(Number);

                    if (items[i + d] !== undefined) {
                        [items[i], items[i + d]] = [items[i + d], items[i]];
                    }

                    draw();
                })
        );

        ed.querySelectorAll('[data-d]').forEach(
            b =>
                (b.onclick = () => {
                    sync();

                    const i = +b.dataset.d;

                    items.splice(i, 1);

                    if (i < ans) {
                        ans--;
                    }

                    if (ans >= items.length) {
                        ans = 0;
                    }

                    draw();
                })
        );

        $('addo').onclick = () => {
            sync();
            items.push('');
            draw();
        };
    };

    return modal(
        q.id ? 'Editar questão' : 'Nova questão',
        `<label>Tipo de questão<select id="qt">${Object.entries(TYPE)
            .map(
                ([k, v]) =>
                    `<option value="${k}" ${
                        k === type ? 'selected' : ''
                    }>${v[1]} ${v[0]}</option>`
            )
            .join('')}</select></label>
     <label>Enunciado<textarea id="qp" rows="3">${esc(
         q.prompt
     )}</textarea></label><div id="ed"></div>`,
        () => {
            $('qt').onchange = e => {
                sync();
                type = e.target.value;
                draw();
            };

            draw();
        },
        () => {
            sync();

            const prompt = $('qp').value.trim();

            if (!prompt) {
                throw new Error('Informe o enunciado');
            }

            if (type === 'vf') {
                return {
                    type,
                    prompt,
                    options: ['Verdadeiro', 'Falso'],
                    answer: ans
                };
            }

            const keep = items
                .map((t, i) => ({ t: t.trim(), i }))
                .filter(x => x.t);

            if (keep.length < 2) {
                throw new Error('Informe ao menos 2 itens');
            }

            const answer =
                type === 'ordenar'
                    ? 0
                    : keep.findIndex(x => x.i === ans);

            if (answer < 0) {
                throw new Error(
                    'Marque a alternativa correta (e preencha o texto dela)'
                );
            }

            return {
                type,
                prompt,
                options: keep.map(x => x.t),
                answer
            };
        }
    );
}

// ---------- Dados e ações ----------
async function load() {
    tree = await api('/admin/tree');

    if (!tree.some(t => t.id === sel)) {
        sel = tree[0]?.id ?? null;
    }

    render();
}

const run = async fn => {
    try {
        await fn();
        await load();
    } catch (e) {
        alert(e.message);
    }
};

const lessons = () => tree.flatMap(t => t.lessons);

const move = (list, id, d, res) => {
    const i = list.findIndex(x => x.id === id),
        j = i + d;

    if (j < 0 || j >= list.length) {
        return;
    }

    const a = [...list];

    [a[i], a[j]] = [a[j], a[i]];

    return run(() =>
        Promise.all(
            a.map((x, k) =>
                x.position === k
                    ? 0
                    : api(`/admin/${res}/${x.id}`, 'PUT', {
                          position: k
                      })
            )
        )
    );
};

async function act(a, id, d) {
    const T = tree.find(t => t.id === sel),
        L = lessons().find(l => l.id === id),
        Lq = lessons().find(l => l.questions.some(q => q.id === id)),
        Q = Lq?.questions.find(q => q.id === id);

    let o;

    if (a === 'sel') {
        sel = id;
        return render();
    }

    if (a === 'tog') {
        open.has(id) ? open.delete(id) : open.add(id);
        return render();
    }

    if (a === 'nt' && (o = await simple('tracks', 'Nova trilha'))) {
        run(async () => {
            sel = (
                await api('/admin/tracks', 'POST', {
                    ...o,
                    position: tree.length
                })
            ).id;
        });
    }

    if (a === 'et' && (o = await simple('tracks', 'Editar trilha', T))) {
        run(() => api(`/admin/tracks/${T.id}`, 'PUT', o));
    }

    if (
        a === 'dt' &&
        confirm(`Excluir a trilha "${T.title}" e todo o conteúdo dela?`)
    ) {
        run(() => api(`/admin/tracks/${T.id}`, 'DELETE'));
    }

    if (a === 'nl' && (o = await simple('lessons', 'Nova lição'))) {
        run(async () => {
            open.add(
                (
                    await api('/admin/lessons', 'POST', {
                        ...o,
                        track_id: T.id,
                        position: T.lessons.length
                    })
                ).id
            );
        });
    }

    if (a === 'el' && (o = await simple('lessons', 'Editar lição', L))) {
        run(() => api(`/admin/lessons/${id}`, 'PUT', o));
    }

    if (
        a === 'dl' &&
        confirm(`Excluir a lição "${L.title}" e suas questões?`)
    ) {
        run(() => api(`/admin/lessons/${id}`, 'DELETE'));
    }

    if (a === 'nq' && (o = await questionForm())) {
        open.add(id);

        run(() =>
            api('/admin/questions', 'POST', {
                ...o,
                lesson_id: id,
                position: L.questions.length
            })
        );
    }

    if (a === 'eq' && (o = await questionForm(Q))) {
        run(() => api(`/admin/questions/${id}`, 'PUT', o));
    }

    if (a === 'dq' && confirm('Excluir esta questão?')) {
        run(() => api(`/admin/questions/${id}`, 'DELETE'));
    }

    if (a === 'ml') {
        move(T.lessons, id, d, 'lessons');
    }

    if (a === 'mq') {
        move(Lq.questions, id, d, 'questions');
    }
}

$('main').onclick = e => {
    const b = e.target.closest('[data-a]');

    if (b && !b.disabled) {
        act(b.dataset.a, +b.dataset.id, +b.dataset.d);
    }
};

// ---------- Telas ----------
const arrows = (a, id, i, n) =>
    `<button class="btn sm sec" data-a="${a}" data-id="${id}" data-d="-1" ${
        i ? '' : 'disabled'
    }>↑</button><button class="btn sm sec" data-a="${a}" data-id="${id}" data-d="1" ${
        i < n - 1 ? '' : 'disabled'
    }>↓</button>`;

const questionHtml = (q, i, n) =>
    `<div class="q"><span class="badge">${
        TYPE[q.type || 'multipla'][1]
    } ${TYPE[q.type || 'multipla'][0]}</span><span class="qp">${esc(
        q.prompt
    )}</span>
  <span class="acts">${arrows(
      'mq',
      q.id,
      i,
      n
  )}<button class="btn sm sec" data-a="eq" data-id="${
        q.id
    }">✏️</button><button class="btn sm red" data-a="dq" data-id="${
        q.id
    }">🗑️</button></span></div>`;

const lessonHtml = (l, i, n) =>
    `<div class="lesson"><div class="lh"><button class="lt" data-a="tog" data-id="${
        l.id
    }"><span class="num">${i + 1}</span>
  <span><b>${esc(l.title)}</b><small>${l.questions.length} questões${
        l.intro ? ' · com texto explicativo' : ''
    }</small></span><span class="chev">${
        open.has(l.id) ? '▾' : '▸'
    }</span></button>
  <div class="acts">${arrows(
      'ml',
      l.id,
      i,
      n
  )}<button class="btn sm sec" data-a="el" data-id="${
      l.id
  }">✏️ Editar</button><button class="btn sm red" data-a="dl" data-id="${
      l.id
  }">🗑️</button></div></div>
  ${
      open.has(l.id)
          ? `<div class="lb">${l.questions
                .map((q, k) =>
                    questionHtml(q, k, l.questions.length)
                )
                .join('') || '<p class="mut">Nenhuma questão ainda.</p>'}
  <p><button class="btn sm" data-a="nq" data-id="${l.id}">+ Nova questão</button></p></div>`
          : ''
  }</div>`;

function render() {
    const t = tree.find(x => x.id === sel),
        nL = lessons().length,
        nQ = lessons().reduce(
            (n, l) => n + l.questions.length,
            0
        );

    $('main').innerHTML = `<div class="stats-row"><div class="stat"><b>${
        tree.length
    }</b>Trilhas</div><div class="stat"><b>${nL}</b>Lições</div><div class="stat"><b>${nQ}</b>Questões</div></div>
  <div class="split"><aside><button class="btn" data-a="nt">+ Nova trilha</button>
  ${tree
      .map(
          x =>
              `<button class="tr ${
                  x.id === sel ? 'on' : ''
              }" data-a="sel" data-id="${x.id}"><span class="ic">${esc(
                  x.icon
              )}</span><span><b>${esc(
                  x.title
              )}</b><small>${x.lessons.length} lições</small></span></button>`
      )
      .join('')}</aside>
  <section>${
      t
          ? `<div class="thead"><div class="ic big">${esc(
                t.icon
            )}</div><div style="flex:1"><h2>${esc(
                t.title
            )}</h2><p class="mut">${esc(
                t.description
            ) || 'Sem descrição'}</p></div>
    <div class="acts"><button class="btn sm sec" data-a="et">✏️ Editar</button><button class="btn sm red" data-a="dt">🗑️</button></div></div>
    <div class="row" style="margin:16px 0"><h3 style="margin:0">Lições (${
        t.lessons.length
    })</h3><button class="btn sm" data-a="nl">+ Nova lição</button></div>
    ${
        t.lessons.map((l, i) =>
            lessonHtml(l, i, t.lessons.length)
        ).join('') ||
        '<div class="empty">Esta trilha ainda não tem lições.</div>'
    }`
          : '<div class="empty">Crie sua primeira trilha para começar. 🚀</div>'
  }</section></div>`;
}

async function usersView() {
    const us = await api('/admin/users');

    $('main').innerHTML =
        '<h2>Usuários</h2>' +
        us
            .map(
                u =>
                    `<div class="card row"><span><b>${esc(
                        u.name
                    )}</b><br><small class="mut">${esc(
                        u.email
                    )}</small></span>
    <select onchange="setRole(${u.id},this.value)" style="width:auto" ${
                        u.id === me().id ? 'disabled' : ''
                    }><option value="comum" ${
                        u.role === 'comum' ? 'selected' : ''
                    }>Comum</option><option value="adm" ${
                        u.role === 'adm' ? 'selected' : ''
                    }>ADM</option></select></div>`
            )
            .join('');
}

async function setRole(id, role) {
    try {
        await api(`/admin/users/${id}/role`, 'PUT', { role });
    } catch (e) {
        alert(e.message);
        usersView();
    }
}

$('t1').onclick = load;
$('t2').onclick = usersView;
load();