if (!localStorage.getItem('token')) {
  location = '/';
}

if (!['adm', 'professor'].includes(me()?.role)) {
  location = '/app.html';
}

const $ = id => document.getElementById(id);

// Professor não vê usuários, banco de dados nem backup.
// (O servidor também bloqueia essas rotas; isto é só visual.)
if (me()?.role === 'professor') {
  document
    .querySelectorAll('.adm-only')
    .forEach(el => (el.style.display = 'none'));

  document.title = 'Dragnix — Painel Professor';

  const brand = document.querySelector('.admin-brand .trilhas-title');

  if (brand) {
    brand.textContent = 'Dragnix — Painel Professor';
  }

  const usersTab = $('t2');

  if (usersTab) {
    usersTab.style.display = 'none';
  }
}

const dlg = $('dlg');

const TYPE = {
  multipla: ['Múltipla escolha', '🔘'],
  vf: ['Verdadeiro/Falso', '✔️'],
  ordenar: ['Ordenar', '↕️'],
  preencher: ['Resposta digitada', '⌨️'],
  associar: ['Associar pares', '🔗']
};

let tree = [];
let sel = null;
let open = new Set();
let tab = 'mod';

/* =========================================================
   FUNÇÕES AUXILIARES
========================================================= */

function normalizeTree(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(t => ({
    ...t,
    lessons: Array.isArray(t.lessons)
      ? t.lessons.map(l => ({
          ...l,
          questions: Array.isArray(l.questions)
            ? l.questions
            : [],
          presentation: Array.isArray(l.presentation)
            ? l.presentation
            : [],
          content:
            Array.isArray(l.content)
              ? l.content
              : l.intro
                ? [
                    {
                      type: 'texto',
                      value: l.intro,
                      caption: ''
                    }
                  ]
                : [],
          conclusion: Array.isArray(l.conclusion)
            ? l.conclusion
            : []
        }))
      : [],
    presentation: Array.isArray(t.presentation)
      ? t.presentation
      : [],
    conclusion: Array.isArray(t.conclusion)
      ? t.conclusion
      : [],
    prerequisites: Array.isArray(t.prerequisites)
      ? t.prerequisites
      : []
  }));
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

/* =========================================================
   MODAL GENÉRICO
========================================================= */

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
        const value = collect();

        ok = true;

        dlg.close();

        resolve(value);
      } catch (err) {
        $('derr').textContent =
          err?.message ||
          'Não foi possível salvar.';
      }
    };

    $('cx').onclick = () => {
      dlg.close();
    };

    $('frm').onsubmit = e => {
      e.preventDefault();
      $('ok').click();
    };

    dlg.addEventListener(
      'close',
      () => {
        if (!ok) {
          resolve(null);
        }
      },
      { once: true }
    );

    dlg.showModal();
  });
}

/* =========================================================
   FORMULÁRIOS SIMPLES
========================================================= */

const SIMPLE = {
  tracks: [
    ['title', 'Título da trilha'],
    ['icon', 'Ícone (emoji)'],
    ['color', 'Cor da trilha', 'color'],
    ['description', 'Descrição', 1]
  ],

  lessons: [
    ['title', 'Título da lição'],
    ['xp', 'XP da lição (recompensa)', 'number'],
    [
      'intro',
      'Texto explicativo (aparece antes das questões)',
      1
    ]
  ]
};

const simple = (res, title, d = {}) => {
  d = {
    color: '#58cc02',
    xp: 10,
    ...d
  };

  return modal(
    title,

    SIMPLE[res]
      .map(([k, l, t]) => {
        if (t === 1) {
          return `
            <label>
              ${l}
              <textarea
                name="${k}"
                rows="4"
              >${esc(d[k] || '')}</textarea>
            </label>
          `;
        }

        return `
          <label>
            ${l}
            <input
              name="${k}"
              type="${t || 'text'}"
              value="${esc(d[k] ?? '')}"
            >
          </label>
        `;
      })
      .join(''),

    null,

    () => {
      const o = Object.fromEntries(
        new FormData($('frm'))
      );

      if (!o.title?.trim()) {
        throw new Error('Informe o título');
      }

      if ('xp' in o) {
        o.xp = Math.max(
          0,
          Number(o.xp) || 10
        );
      }

      return o;
    }
  );
};

/* =========================================================
   EDITOR DE QUESTÃO
========================================================= */

function questionForm(q = {}) {
  let type = q.type || 'multipla';

  let ans = q.answer ?? 0;

  let items =
    Array.isArray(q.options) &&
    q.options.length &&
    q.type !== 'vf'
      ? [...q.options]
      : ['', ''];

  const HINT = {
    multipla:
      'Marque a alternativa correta.',

    ordenar:
      'Digite os itens na ordem correta. O aluno verá os itens embaralhados.',

    preencher:
      'Digite uma ou mais respostas aceitas.',

    associar:
      'Digite cada par no formato esquerda → direita.'
  };

  const sync = () => {
    $('ed')
      .querySelectorAll('[data-i]')
      .forEach(e => {
        const i = Number(e.dataset.i);

        if (e.dataset.s === undefined) {
          items[i] = e.value;
        } else {
          const p = (items[i] || '').split('=');

          p[Number(e.dataset.s)] =
            e.value.replace(/=/g, '');

          items[i] =
            `${p[0] || ''}=${p[1] || ''}`;
        }
      });

    const c =
      $('ed').querySelector(
        '[name="c"]:checked'
      );

    if (c) {
      ans = Number(c.value);
    }
  };

  const row = (t, i) => {
    const del = `
      <button
        type="button"
        class="btn sm red"
        data-d="${i}"
      >
        ✕
      </button>
    `;

    if (type === 'associar') {
      const [left = '', right = ''] =
        String(t || '').split('=');

      return `
        <div class="opt-row">

          <input
            data-i="${i}"
            data-s="0"
            value="${esc(left)}"
            placeholder="Item ${i + 1}"
          >

          <span>→</span>

          <input
            data-i="${i}"
            data-s="1"
            value="${esc(right)}"
            placeholder="Par"
          >

          ${del}

        </div>
      `;
    }

    const lead =
      type === 'multipla'
        ? `
          <input
            type="radio"
            name="c"
            value="${i}"
            ${ans == i ? 'checked' : ''}
          >
        `
        : type === 'ordenar'
          ? `<b>${i + 1}.</b>`
          : '';

    const mv =
      type === 'ordenar'
        ? `
          <button
            type="button"
            class="btn sm sec"
            data-m="${i}:-1"
            ${i === 0 ? 'disabled' : ''}
          >
            ↑
          </button>

          <button
            type="button"
            class="btn sm sec"
            data-m="${i}:1"
            ${i === items.length - 1 ? 'disabled' : ''}
          >
            ↓
          </button>
        `
        : '';

    return `
      <div class="opt-row">

        ${lead}

        <input
          data-i="${i}"
          value="${esc(t)}"
          placeholder="${
            type === 'preencher'
              ? 'Resposta'
              : type === 'ordenar'
                ? 'Item'
                : 'Alternativa'
          } ${i + 1}"
        >

        ${mv}

        ${del}

      </div>
    `;
  };

  const draw = () => {
    const ed = $('ed');

    if (type === 'vf') {
      ans = ans > 1 ? 0 : ans;

      ed.innerHTML =
        ['Verdadeiro', 'Falso']
          .map(
            (text, i) => `
              <label class="opt-row">

                <input
                  type="radio"
                  name="c"
                  value="${i}"
                  ${ans == i ? 'checked' : ''}
                >

                ${text}

              </label>
            `
          )
          .join('');

      return;
    }

    ed.innerHTML = `
      <p class="mut">
        ${HINT[type]}
      </p>

      ${
        items.length
          ? items.map(row).join('')
          : '<p class="mut">Nenhum item.</p>'
      }

      <button
        type="button"
        class="btn sm sec"
        id="addo"
      >
        + Adicionar
      </button>
    `;

    ed
      .querySelectorAll('[data-m]')
      .forEach(button => {
        button.onclick = () => {
          sync();

          const [i, d] =
            button.dataset.m
              .split(':')
              .map(Number);

          const j = i + d;

          if (
            j >= 0 &&
            j < items.length
          ) {
            [items[i], items[j]] =
              [items[j], items[i]];
          }

          draw();
        };
      });

    ed
      .querySelectorAll('[data-d]')
      .forEach(button => {
        button.onclick = () => {
          sync();

          const i =
            Number(button.dataset.d);

          items.splice(i, 1);

          if (i < ans) {
            ans--;
          }

          if (
            ans >= items.length
          ) {
            ans =
              Math.max(
                0,
                items.length - 1
              );
          }

          draw();
        };
      });

    $('addo').onclick = () => {
      sync();

      items.push('');

      draw();
    };
  };

  return modal(
    q.id
      ? 'Editar questão'
      : 'Nova questão',

    `
      <label>
        Tipo de questão

        <select id="qt">
          ${Object.entries(TYPE)
            .map(
              ([key, value]) => `
                <option
                  value="${key}"
                  ${key === type ? 'selected' : ''}
                >
                  ${value[1]} ${value[0]}
                </option>
              `
            )
            .join('')}
        </select>
      </label>

      <label>
        Enunciado

        <textarea
          id="qp"
          rows="3"
        >${esc(q.prompt || '')}</textarea>
      </label>

      <div id="ed"></div>

      <label>
        Explicação
        <small class="mut">
          — mostrada após responder
        </small>

        <textarea
          id="qx"
          rows="3"
        >${esc(q.explanation || '')}</textarea>
      </label>
    `,

    () => {
      $('qt').onchange = e => {
        sync();

        const old = type;

        type = e.target.value;

        if (
          (old === 'associar') !==
          (type === 'associar')
        ) {
          items = ['', ''];
          ans = 0;
        }

        if (type === 'vf') {
          ans = 0;
        }

        draw();
      };

      draw();
    },

    () => {
      sync();

      const prompt =
        $('qp').value.trim();

      const explanation =
        $('qx').value.trim();

      if (!prompt) {
        throw new Error(
          'Informe o enunciado.'
        );
      }

      if (type === 'vf') {
        return {
          type,
          prompt,
          explanation,
          options: [
            'Verdadeiro',
            'Falso'
          ],
          answer: ans
        };
      }

      const keep = items
        .map((text, i) => ({
          t: String(text || '').trim(),
          i
        }))
        .filter(x => {
          if (type === 'associar') {
            const parts =
              x.t.split('=');

            return (
              parts.length === 2 &&
              parts[0].trim() &&
              parts[1].trim()
            );
          }

          return x.t;
        });

      const min =
        type === 'preencher'
          ? 1
          : 2;

      if (keep.length < min) {
        throw new Error(
          `Preencha ao menos ${min} ${
            min > 1
              ? 'itens'
              : 'resposta'
          }.`
        );
      }

      let answer = 0;

      if (type === 'multipla') {
        answer =
          keep.findIndex(
            x => x.i === ans
          );

        if (answer < 0) {
          throw new Error(
            'Marque a alternativa correta e preencha o texto dela.'
          );
        }
      }

      return {
        type,
        prompt,
        explanation,
        options:
          keep.map(x => x.t),
        answer
      };
    }
  );
}

/* =========================================================
   EDITOR DE BLOCOS
========================================================= */

function blockEditor(host, initial) {
  const blocks = Array.isArray(initial)
    ? initial.map(b => ({
        type: b.type || 'texto',
        value: b.value || '',
        caption: b.caption || ''
      }))
    : [];

  const NAME = {
    texto: '📝 Texto',
    imagem: '🖼️ Imagem',
    video: '🎬 Vídeo'
  };

  const sync = () => {
    host
      .querySelectorAll('[data-b]')
      .forEach(e => {
        const index =
          Number(e.dataset.b);

        const field = e.dataset.f;

        if (
          blocks[index]
        ) {
          blocks[index][field] =
            e.value;
        }
      });
  };

  const draw = () => {
    host.innerHTML =
      (
        blocks
          .map(
            (b, i) => `
              <div class="blk">

                <div class="row">

                  <b>
                    ${NAME[b.type] || '📦 Conteúdo'}
                  </b>

                  <span class="acts">

                    <button
                      type="button"
                      class="btn sm sec"
                      data-m="${i}:-1"
                      ${i === 0 ? 'disabled' : ''}
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      class="btn sm sec"
                      data-m="${i}:1"
                      ${i === blocks.length - 1 ? 'disabled' : ''}
                    >
                      ↓
                    </button>

                    <button
                      type="button"
                      class="btn sm red"
                      data-d="${i}"
                    >
                      ✕
                    </button>

                  </span>

                </div>

                ${
                  b.type === 'texto'
                    ? `
                      <textarea
                        data-b="${i}"
                        data-f="value"
                        rows="4"
                        placeholder="Escreva o texto..."
                      >${esc(b.value)}</textarea>
                    `
                    : `
                      <input
                        data-b="${i}"
                        data-f="value"
                        value="${esc(b.value)}"
                        placeholder="${
                          b.type === 'video'
                            ? 'Link do YouTube ou vídeo (.mp4)'
                            : 'Link da imagem'
                        }"
                      >

                      <label
                        class="btn sm sec"
                        style="display:inline-block"
                      >
                        ⬆️ Enviar do computador

                        <input
                          type="file"
                          hidden
                          data-u="${i}"
                          accept="${
                            b.type === 'video'
                              ? 'video/mp4,video/webm'
                              : 'image/*'
                          }"
                        >
                      </label>

                      <input
                        data-b="${i}"
                        data-f="caption"
                        value="${esc(b.caption)}"
                        placeholder="Legenda (opcional)"
                      >
                    `
                }

              </div>
            `
          )
          .join('') ||
        '<p class="mut">Nenhum conteúdo ainda.</p>'
      )

      + `
        <div
          class="acts"
          style="margin:8px 0"
        >

          <button
            type="button"
            class="btn sm sec"
            data-add="texto"
          >
            + Texto
          </button>

          <button
            type="button"
            class="btn sm sec"
            data-add="imagem"
          >
            + Imagem
          </button>

          <button
            type="button"
            class="btn sm sec"
            data-add="video"
          >
            + Vídeo
          </button>

        </div>
      `;

    host
      .querySelectorAll('[data-m]')
      .forEach(button => {
        button.onclick = () => {
          sync();

          const [i, d] =
            button.dataset.m
              .split(':')
              .map(Number);

          const j = i + d;

          if (
            j >= 0 &&
            j < blocks.length
          ) {
            [blocks[i], blocks[j]] =
              [blocks[j], blocks[i]];
          }

          draw();
        };
      });

    host
      .querySelectorAll('[data-d]')
      .forEach(button => {
        button.onclick = () => {
          sync();

          blocks.splice(
            Number(button.dataset.d),
            1
          );

          draw();
        };
      });

    host
      .querySelectorAll('[data-add]')
      .forEach(button => {
        button.onclick = () => {
          sync();

          blocks.push({
            type: button.dataset.add,
            value: '',
            caption: ''
          });

          draw();
        };
      });

    host
      .querySelectorAll('[data-u]')
      .forEach(input => {
        input.onchange = async () => {
          const file = input.files?.[0];

          if (!file) {
            return;
          }

          sync();

          if (
            file.size >
            25 * 1024 * 1024
          ) {
            $('derr').textContent =
              'Arquivo maior que 25 MB.';

            return;
          }

          $('derr').textContent =
            'Enviando arquivo...';

          try {
            const data =
              await new Promise(
                (resolve, reject) => {
                  const reader =
                    new FileReader();

                  reader.onload = () =>
                    resolve(
                      String(reader.result)
                        .split(',')[1]
                    );

                  reader.onerror =
                    reject;

                  reader.readAsDataURL(
                    file
                  );
                }
              );

            const result =
              await api(
                '/admin/upload',
                'POST',
                {
                  name: file.name,
                  data
                }
              );

            if (!result?.url) {
              throw new Error(
                'O servidor não retornou a URL do arquivo.'
              );
            }

            blocks[
              Number(input.dataset.u)
            ].value = result.url;

            $('derr').textContent = '';

            draw();
          } catch (e) {
            $('derr').textContent =
              e?.message ||
              'Erro ao enviar arquivo.';
          }
        };
      });
  };

  draw();

  return {
    get() {
      sync();

      const clean = blocks
        .map(b => ({
          ...b,
          value:
            String(b.value || '').trim(),
          caption:
            String(b.caption || '').trim()
        }))
        .filter(b => b.value);

      const invalid =
        clean.some(b => {
          if (b.type === 'texto') {
            return false;
          }

          return !isValidMediaUrl(
            b.value
          );
        });

      if (invalid) {
        throw new Error(
          'Links de imagem/vídeo devem começar com http://, https:// ou /uploads/.'
        );
      }

      return clean;
    }
  };
}

function isValidMediaUrl(value) {
  return /^(https?:\/\/|\/uploads\/)/i.test(
    String(value || '').trim()
  );
}

/* =========================================================
   FORMULÁRIO DO MÓDULO
========================================================= */

function lessonForm(l = {}) {
  let pe;
  let ce;
  let co;

  return modal(
    l.id
      ? 'Editar módulo'
      : 'Novo módulo',

    `
      <label>
        Título do módulo

        <input
          id="lt"
          value="${esc(l.title || '')}"
        >
      </label>

      <label>
        XP do módulo (recompensa)

        <input
          id="lx"
          type="number"
          min="0"
          value="${esc(l.xp ?? 10)}"
        >
      </label>

      <p>
        <b>📌 Apresentação</b>

        <small class="mut">
          — opcional, aparece no começo do módulo
        </small>
      </p>

      <div id="pe"></div>

      <p>
        <b>📖 Explicação</b>

        <small class="mut">
          — o aluno lê antes das perguntas
        </small>
      </p>

      <div id="ce"></div>

      <p>
        <b>🏁 Conclusão</b>

        <small class="mut">
          — opcional, aparece no final do módulo,
          depois das perguntas
        </small>
      </p>

      <div id="co"></div>

      <label>
        Pergunta de avaliação do módulo

        <input
          id="leq"
          value="${esc(
            l.evaluation_question ||
            'Como você avalia este módulo?'
          )}"
          placeholder="Como você avalia este módulo?"
        >
      </label>

      <small class="mut">
        O aluno responderá de 1 a 5 estrelas ao final.
      </small>
    `,

    () => {
      pe = blockEditor(
        $('pe'),
        l.presentation
      );

      ce = blockEditor(
        $('ce'),
        Array.isArray(l.content) &&
        l.content.length
          ? l.content
          : l.intro
            ? [
                {
                  type: 'texto',
                  value: l.intro,
                  caption: ''
                }
              ]
            : []
      );

      co = blockEditor(
        $('co'),
        l.conclusion
      );
    },

    () => {
      const title =
        $('lt').value.trim();

      if (!title) {
        throw new Error(
          'Informe o título.'
        );
      }

      return {
        title,

        xp: Math.max(
          0,
          Number($('lx').value) || 10
        ),

        presentation: pe.get(),

        content: ce.get(),

        conclusion: co.get(),

        evaluation_question:
          $('leq').value.trim() ||
          'Como você avalia este módulo?'
      };
    }
  );
}

/* =========================================================
   FORMULÁRIO DA TRILHA
========================================================= */

function trackForm(t = {}) {
  let pe;
  let co;

  t = {
    color: '#58cc02',
    ...t
  };

  const blocked = new Set();

  const walkDependencies = id => {
    tree
      .filter(x =>
        (x.prerequisites || [])
          .includes(id)
      )
      .forEach(x => {
        if (!blocked.has(x.id)) {
          blocked.add(x.id);
          walkDependencies(x.id);
        }
      });
  };

  if (t.id) {
    walkDependencies(t.id);
  }

  const pre =
    new Set(t.prerequisites || []);

  const options =
    tree.filter(
      x =>
        x.id !== t.id &&
        !blocked.has(x.id)
    );

  const preHtml = `
    <p>
      <b>🔗 Pré-requisitos</b>

      <small class="mut">
        — o aluno só começa esta trilha
        depois de concluir as marcadas
      </small>
    </p>

    ${
      options
        .map(
          x => `
            <label class="opt-row">

              <input
                type="checkbox"
                name="pre"
                value="${x.id}"
                ${pre.has(x.id) ? 'checked' : ''}
              >

              ${esc(x.icon || '📚')}
              ${esc(x.title || '')}

            </label>
          `
        )
        .join('') ||
      '<p class="mut">Crie outras trilhas para usá-las como pré-requisito.</p>'
    }
  `;

  return modal(
    t.id
      ? 'Editar trilha'
      : 'Nova trilha',

    `
      <label>
        Título da trilha

        <input
          id="tt"
          value="${esc(t.title || '')}"
        >
      </label>

      <label>
        Ícone (emoji)

        <input
          id="ti"
          value="${esc(t.icon || '📚')}"
        >
      </label>

      <label>
        Cor da trilha

        <input
          id="tc"
          type="color"
          value="${esc(t.color)}"
        >
      </label>

      <label>
        Descrição

        <textarea
          id="td"
          rows="3"
        >${esc(t.description || '')}</textarea>
      </label>

      ${preHtml}

      <p>
        <b>📌 Apresentação da trilha</b>

        <small class="mut">
          — opcional, aparece no começo da trilha
        </small>
      </p>

      <div id="pe"></div>

      <p>
        <b>🏁 Conclusão da trilha</b>

        <small class="mut">
          — opcional, aparece no final,
          após todos os módulos
        </small>
      </p>

      <div id="co"></div>

      <label>
        Pergunta de avaliação da trilha

        <input
          id="teq"
          value="${esc(
            t.evaluation_question ||
            'Como você avalia esta trilha?'
          )}"
          placeholder="Como você avalia esta trilha?"
        >
      </label>

      <small class="mut">
        O aluno responderá de 1 a 5 estrelas ao final.
      </small>
    `,

    () => {
      pe = blockEditor(
        $('pe'),
        t.presentation
      );

      co = blockEditor(
        $('co'),
        t.conclusion
      );
    },

    () => {
      const title =
        $('tt').value.trim();

      if (!title) {
        throw new Error(
          'Informe o título.'
        );
      }

      const prerequisites =
        [
          ...$('fields')
            .querySelectorAll(
              '[name="pre"]:checked'
            )
        ].map(x => Number(x.value));

      return {
        title,

        icon:
          $('ti').value.trim() ||
          '📚',

        color:
          $('tc').value ||
          '#58cc02',

        description:
          $('td').value.trim(),

        presentation:
          pe.get(),

        conclusion:
          co.get(),

        evaluation_question:
          $('teq').value.trim() ||
          'Como você avalia esta trilha?',

        prerequisites
      };
    }
  );
}

/* =========================================================
   DADOS
========================================================= */

async function load() {
  const data =
    await api('/admin/tree');

  tree = normalizeTree(data);

  if (
    !tree.some(
      t => t.id === sel
    )
  ) {
    sel =
      tree[0]?.id ??
      null;
  }

  if (sel === null) {
    open.clear();
  }

  render();
}

const run = async fn => {
  try {
    await fn();
    await load();
  } catch (e) {
    alert(
      e?.message ||
      'Ocorreu um erro.'
    );
  }
};

const lessons = () =>
  tree.flatMap(
    t =>
      Array.isArray(t.lessons)
        ? t.lessons
        : []
  );

/* =========================================================
   MOVIMENTAÇÃO
========================================================= */

const move = (
  list,
  id,
  d,
  res
) => {
  if (!Array.isArray(list)) {
    return;
  }

  const i =
    list.findIndex(
      x => x.id === id
    );

  if (i < 0) {
    return;
  }

  const j = i + d;

  if (
    j < 0 ||
    j >= list.length
  ) {
    return;
  }

  const a = [...list];

  [a[i], a[j]] =
    [a[j], a[i]];

  return run(
    () =>
      Promise.all(
        a.map(
          (item, position) =>
            item.position === position
              ? null
              : api(
                  `/admin/${res}/${item.id}`,
                  'PUT',
                  { position }
                )
        )
      )
  );
};

/* =========================================================
   AÇÕES
========================================================= */

async function act(a, id, d) {
  const T =
    tree.find(
      t => t.id === sel
    );

  const L =
    lessons().find(
      l => l.id === id
    );

  const Lq =
    lessons().find(
      l =>
        Array.isArray(l.questions) &&
        l.questions.some(
          q => q.id === id
        )
    );

  const Q =
    Lq?.questions?.find(
      q => q.id === id
    );

  let o;

  if (a === 'sel') {
    sel = id;
    tab = 'mod';
    return render();
  }

  if (a === 'tab') {
    tab = id ? 'des' : 'mod';
    return render();
  }

  if (a === 'tog') {
    if (open.has(id)) {
      open.delete(id);
    } else {
      open.add(id);
    }

    return render();
  }

  if (a === 'nt') {
    o = await trackForm();

    if (o) {
      await run(async () => {
        const created =
          await api(
            '/admin/tracks',
            'POST',
            {
              ...o,
              position: tree.length
            }
          );

        sel = created.id;
      });
    }

    return;
  }

  if (a === 'et') {
    if (!T) {
      return;
    }

    o = await trackForm(T);

    if (o) {
      await run(() =>
        api(
          `/admin/tracks/${T.id}`,
          'PUT',
          o
        )
      );
    }

    return;
  }

  if (a === 'dt') {
    if (!T) {
      return;
    }

    if (
      confirm(
        `Excluir a trilha "${T.title}" e todo o conteúdo dela?`
      )
    ) {
      await run(() =>
        api(
          `/admin/tracks/${T.id}`,
          'DELETE'
        )
      );
    }

    return;
  }

  if (a === 'nl') {
    if (!T) {
      return;
    }

    o = await lessonForm();

    if (o) {
      await run(async () => {
        const created =
          await api(
            '/admin/lessons',
            'POST',
            {
              ...o,
              track_id: T.id,
              position:
                T.lessons.length
            }
          );

        open.add(created.id);
      });
    }

    return;
  }

  if (a === 'el') {
    if (!L) {
      return;
    }

    o = await lessonForm(L);

    if (o) {
      await run(() =>
        api(
          `/admin/lessons/${id}`,
          'PUT',
          o
        )
      );
    }

    return;
  }

  if (a === 'dl') {
    if (!L) {
      return;
    }

    if (
      confirm(
        `Excluir o módulo "${L.title}" e suas questões?`
      )
    ) {
      await run(() =>
        api(
          `/admin/lessons/${id}`,
          'DELETE'
        )
      );
    }

    return;
  }

  if (a === 'nq') {
    if (!L) {
      return;
    }

    o = await questionForm();

    if (o) {
      open.add(id);

      await run(() =>
        api(
          '/admin/questions',
          'POST',
          {
            ...o,
            lesson_id: id,
            position:
              L.questions.length
          }
        )
      );
    }

    return;
  }

  if (a === 'eq') {
    if (!Q) {
      return;
    }

    o = await questionForm(Q);

    if (o) {
      await run(() =>
        api(
          `/admin/questions/${id}`,
          'PUT',
          o
        )
      );
    }

    return;
  }

  if (a === 'dq') {
    if (!Q) {
      return;
    }

    if (
      confirm(
        'Excluir esta questão?'
      )
    ) {
      await run(() =>
        api(
          `/admin/questions/${id}`,
          'DELETE'
        )
      );
    }

    return;
  }

  if (a === 'ml') {
    if (!T) {
      return;
    }

    await move(
      T.lessons,
      id,
      d,
      'lessons'
    );

    return;
  }

  if (a === 'mq') {
    if (!Lq) {
      return;
    }

    await move(
      Lq.questions,
      id,
      d,
      'questions'
    );

    return;
  }
}

/* =========================================================
   EVENTOS
========================================================= */

$('main').onclick = e => {
  const button =
    e.target.closest('[data-a]');

  if (
    button &&
    !button.disabled
  ) {
    act(
      button.dataset.a,
      Number(button.dataset.id),
      Number(button.dataset.d)
    );
  }
};

/* =========================================================
   SETAS
========================================================= */

const arrows = (
  action,
  id,
  index,
  total
) => `
  <button
    class="btn sm sec"
    data-a="${action}"
    data-id="${id}"
    data-d="-1"
    ${index === 0 ? 'disabled' : ''}
  >
    ↑
  </button>

  <button
    class="btn sm sec"
    data-a="${action}"
    data-id="${id}"
    data-d="1"
    ${index === total - 1 ? 'disabled' : ''}
  >
    ↓
  </button>
`;

/* =========================================================
   HTML DA QUESTÃO
========================================================= */

const questionHtml = (
  q,
  i,
  n
) => {
  const type =
    TYPE[q.type] ||
    TYPE.multipla;

  return `
    <div class="q">

      <span class="badge">
        ${type[1]}
        ${type[0]}
      </span>

      <span class="qp">
        ${esc(q.prompt || '')}
      </span>

      <span class="acts">

        ${arrows(
          'mq',
          q.id,
          i,
          n
        )}

        <button
          class="btn sm sec"
          data-a="eq"
          data-id="${q.id}"
        >
          ✏️
        </button>

        <button
          class="btn sm red"
          data-a="dq"
          data-id="${q.id}"
        >
          🗑️
        </button>

      </span>

    </div>
  `;
};

/* =========================================================
   HTML DO MÓDULO
========================================================= */

const lessonHtml = (
  l,
  i,
  n
) => {
  const questions =
    Array.isArray(l.questions)
      ? l.questions
      : [];

  const presentationCount =
    Array.isArray(l.presentation)
      ? l.presentation.length
      : 0;

  const contentCount =
    Array.isArray(l.content)
      ? l.content.length
      : l.intro
        ? 1
        : 0;

  const conclusionCount =
    Array.isArray(l.conclusion)
      ? l.conclusion.length
      : 0;

  return `
    <div class="lesson">

      <div class="lh">

        <button
          class="lt"
          data-a="tog"
          data-id="${l.id}"
        >

          <span class="num">
            ${i + 1}
          </span>

          <span>

            <b>
              Módulo ${i + 1} —
              ${esc(l.title || '')}
            </b>

            <small>
              ${questions.length}
              questões ·
              ${l.xp ?? 10} XP

              ${
                presentationCount
                  ? ` · 📌 apresentação`
                  : ''
              }

              ${
                contentCount
                  ? ` · 📖 ${contentCount} bloco(s)`
                  : ''
              }

              ${
                conclusionCount
                  ? ` · 🏁 ${conclusionCount} conclusão`
                  : ''
              }
            </small>

          </span>

          <span class="chev">
            ${
              open.has(l.id)
                ? '▾'
                : '▸'
            }
          </span>

        </button>

        <div class="acts">

          ${arrows(
            'ml',
            l.id,
            i,
            n
          )}

          <button
            class="btn sm sec"
            data-a="el"
            data-id="${l.id}"
          >
            ✏️ Editar
          </button>

          <button
            class="btn sm red"
            data-a="dl"
            data-id="${l.id}"
            ${
              n <= 1
                ? 'disabled title="Cada trilha precisa de ao menos 1 módulo"'
                : ''
            }
          >
            🗑️
          </button>

        </div>

      </div>

      ${
        open.has(l.id)
          ? `
            <div class="lb">

              ${
                questions
                  .map(
                    (q, k) =>
                      questionHtml(
                        q,
                        k,
                        questions.length
                      )
                  )
                  .join('') ||
                '<p class="mut">Nenhuma questão ainda.</p>'
              }

              <p>

                <button
                  class="btn sm"
                  data-a="nq"
                  data-id="${l.id}"
                >
                  + Nova questão
                </button>

              </p>

            </div>
          `
          : ''
      }

    </div>
  `;
};

/* =========================================================
   RENDER PRINCIPAL
========================================================= */

function render() {
  const t =
    tree.find(
      x => x.id === sel
    );

  const nL =
    lessons().length;

  const nQ =
    lessons().reduce(
      (total, lesson) =>
        total +
        (
          Array.isArray(
            lesson.questions
          )
            ? lesson.questions.length
            : 0
        ),
      0
    );

  $('main').innerHTML = `
    <div class="stats-row">

      <div class="stat">
        <b>${tree.length}</b>
        Trilhas
      </div>

      <div class="stat">
        <b>${nL}</b>
        Módulos
      </div>

      <div class="stat">
        <b>${nQ}</b>
        Questões
      </div>

    </div>

    <div class="split">

      <aside>

        <button
          class="btn"
          data-a="nt"
        >
          + Nova trilha
        </button>

        ${tree
          .map(
            x => `
              <button
                class="tr ${
                  x.id === sel
                    ? 'on'
                    : ''
                }"
                data-a="sel"
                data-id="${x.id}"
              >

                <span class="ic">
                  ${esc(x.icon || '📚')}
                </span>

                <span>

                  <b>
                    ${esc(x.title || '')}
                  </b>

                  <small>
                    ${
                      Array.isArray(x.lessons)
                        ? x.lessons.length
                        : 0
                    }
                    módulos

                    ${
                      (x.prerequisites || []).length
                        ? ' · 🔗'
                        : ''
                    }
                  </small>

                </span>

              </button>
            `
          )
          .join('')}

      </aside>

      <section>

        ${
          t
            ? `
              <div class="thead">

                <div class="ic big">
                  ${esc(t.icon || '📚')}
                </div>

                <div style="flex:1">

                  <h2>
                    ${esc(t.title || '')}
                  </h2>

                  <p class="mut">
                    ${
                      esc(t.description || '') ||
                      'Sem descrição'
                    }
                  </p>

                  <small class="mut">
                    📌 Apresentação da trilha:

                    ${
                      t.presentation?.length
                        ? `${t.presentation.length} bloco(s)`
                        : 'não definida'
                    }
                  </small>

                  <br>

                  <small class="mut">
                    🏁 Conclusão da trilha:

                    ${
                      t.conclusion?.length
                        ? `${t.conclusion.length} bloco(s)`
                        : 'não definida'
                    }
                  </small>

                  <br>

                  <small class="mut">
                    ⭐ Avaliação:
                    ${
                      t.evaluation_question ||
                      'Como você avalia esta trilha?'
                    }
                  </small>

                  <br>

                  <small class="mut">
                    🔗 Pré-requisitos:

                    ${
                      (t.prerequisites || [])
                        .map(
                          id =>
                            tree.find(
                              x => x.id === id
                            )?.title
                        )
                        .filter(Boolean)
                        .map(esc)
                        .join(', ') ||
                      'nenhum'
                    }
                  </small>

                </div>

                <div class="acts">

                  <button
                    class="btn sm sec"
                    data-a="et"
                  >
                    ✏️ Editar
                  </button>

                  <button
                    class="btn sm red"
                    data-a="dt"
                  >
                    🗑️
                  </button>

                </div>

              </div>

              <div
                class="steps"
                style="margin-top:16px"
              >

                <span
                  class="pill ${
                    tab === 'mod'
                      ? 'on'
                      : ''
                  }"
                  data-a="tab"
                  data-id="0"
                >
                  📚 Módulos
                </span>

                <span
                  class="pill ${
                    tab === 'des'
                      ? 'on'
                      : ''
                  }"
                  data-a="tab"
                  data-id="1"
                >
                  🏆 Desafios
                </span>

              </div>

              ${
                tab === 'des'
                  ? `
                    <div class="empty">
                      🏆 Os desafios serão adicionados em breve.
                    </div>
                  `
                  : `
                    <div
                      class="row"
                      style="margin:12px 0"
                    >

                      <div>

                        <h3 style="margin:0">
                          Módulos
                          (${t.lessons.length}/10)
                        </h3>

                        <small class="mut">
                          Os alunos seguem a ordem
                          1, 2, 3… e só abrem o
                          módulo seguinte ao concluir
                          o anterior.
                          Mínimo 1, máximo 10.
                        </small>

                      </div>

                      <button
                        class="btn sm"
                        data-a="nl"
                        ${
                          t.lessons.length >= 10
                            ? 'disabled'
                            : ''
                        }
                      >
                        + Novo módulo
                      </button>

                    </div>

                    ${
                      t.lessons
                        .map(
                          (lesson, index) =>
                            lessonHtml(
                              lesson,
                              index,
                              t.lessons.length
                            )
                        )
                        .join('') ||
                      '<p class="mut">Nenhum módulo cadastrado.</p>'
                    }
                  `
              }

            `
            : `
              <div class="empty">
                Crie sua primeira trilha para começar. 🚀
              </div>
            `
        }

      </section>

    </div>
  `;
}

/* =========================================================
   USUÁRIOS
========================================================= */

let US = [];

async function delUser(id) {
  const u =
    US.find(
      x => x.id === id
    );

  if (!u) {
    return;
  }

  if (
    !confirm(
      `Excluir a conta de "${u.name}" (${u.email})?\nTodo o progresso dessa pessoa será apagado. Esta ação não pode ser desfeita.`
    )
  ) {
    return;
  }

  try {
    await api(
      `/admin/users/${id}`,
      'DELETE'
    );

    await usersView();
  } catch (e) {
    alert(
      e?.message ||
      'Não foi possível excluir o usuário.'
    );
  }
}

async function usersView() {
  try {
    const us =
      (US =
        await api(
          '/admin/users'
        ));

    $('main').innerHTML =
      '<h2>Usuários</h2>' +

      us
        .map(
          u => `
            <div class="card row">

              <span>

                <b>
                  ${esc(u.name || '')}
                </b>

                <br>

                <small class="mut">
                  ${esc(u.email || '')}
                </small>

              </span>

              <select
                onchange="setRole(${u.id}, this.value)"
                style="width:auto"
                ${
                  u.id === me().id
                    ? 'disabled'
                    : ''
                }
              >

                <option
                  value="comum"
                  ${
                    u.role === 'comum'
                      ? 'selected'
                      : ''
                  }
                >
                  Comum
                </option>

                <option
                  value="professor"
                  ${
                    u.role === 'professor'
                      ? 'selected'
                      : ''
                  }
                >
                  Professor
                </option>
                <option
                  value="adm"
                  ${
                    u.role === 'adm'
                      ? 'selected'
                      : ''
                  }
                >
                  ADM
                </option>

              </select>

              <button
                class="btn sm red"
                onclick="delUser(${u.id})"
                ${
                  u.id === me().id
                    ? 'disabled'
                    : ''
                }
              >
                🗑️ Excluir
              </button>

            </div>
          `
        )
        .join('');
  } catch (e) {
    alert(
      e?.message ||
      'Não foi possível carregar os usuários.'
    );
  }
}

async function setRole(id, role) {
  try {
    await api(
      `/admin/users/${id}/role`,
      'PUT',
      { role }
    );

    await usersView();
  } catch (e) {
    alert(
      e?.message ||
      'Não foi possível alterar o perfil.'
    );

    await usersView();
  }
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

$('t1').onclick = async () => {
  tab = 'mod';
  await load();
};

$('t2').onclick = usersView;

load();