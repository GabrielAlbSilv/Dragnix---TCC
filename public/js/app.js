if (!localStorage.getItem('token')) {
  location = '/';
}

const main = document.getElementById('main');
const $ = id => document.getElementById(id);

// ============================================================
// CONTROLE DO PAINEL ADM
// ============================================================

const admButton = document.getElementById('adm');

if (admButton) {
  // Começa sempre oculto
  admButton.style.display = 'none';

  try {
    const currentUser = me();

    console.log('USUÁRIO ATUAL:', currentUser);
    console.log('ROLE ATUAL:', currentUser?.role);

    if (currentUser && currentUser.role === 'adm') {
      admButton.style.display = '';
    }
  } catch (error) {
    console.error('Erro ao verificar usuário:', error);

    // Em caso de erro, permanece oculto
    admButton.style.display = 'none';
  }
}

// ============================================================
// STATUS
// ============================================================

const setStats = d => {
  if ($('xp')) {
    $('xp').textContent = '⭐ ' + d.xp;
  }

  if ($('streak')) {
    $('streak').textContent = '🔥 ' + d.streak;
  }

  if ($('coins')) {
    $('coins').textContent = '🪙 ' + d.coins;
  }

  if ($('lvl')) {
    $('lvl').textContent = '🎖️ Nv ' + d.level;
  }

  if ($('hearts')) {
    $('hearts').textContent =
      '❤️ ' +
      d.hearts +
      (d.next ? ` (+1 em ${Math.ceil(d.next / 60)} min)` : '');
  }
};

// ============================================================
// ERROS GERAIS
// ============================================================

window.addEventListener('unhandledrejection', e => {
  if (!main) return;

  main.innerHTML = `
    <div class="card badc">
      <strong>⚠️ ${esc(e.reason?.message || e.reason)}</strong>

      <p class="mut">
        Se a mensagem for "Erro inesperado" ou 404,
        reinicie o servidor (Ctrl + C e npm.cmd start).
      </p>
    </div>
  `;
});

// ============================================================
// ATUALIZAÇÃO DOS DADOS
// ============================================================

const refresh = () => {
  return api('/tracks').then(setStats);
};

// ============================================================
// HOME / TRILHAS
// ============================================================

async function home() {
  const d = await api('/tracks');

  console.log('TRILHAS RECEBIDAS:', d.tracks);
  console.log('QUANTIDADE:', d.tracks.length);

  setStats(d);

  window.TRACKS = d.tracks;

  main.innerHTML = d.tracks.length
    ? d.tracks
        .map(t => {
          const c = esc(t.color || '#58cc02');

          const n = t.lessons.filter(
            l => l.done
          ).length;

          const pct = t.lessons.length
            ? Math.round(
                t.lessons.reduce(
                  (x, l) => x + l.pct,
                  0
                ) / t.lessons.length
              )
            : 0;

          return `
            <div
              class="card"
              style="border-color:${c}"
            >

              <h2>
                ${esc(t.icon)} ${esc(t.title)}
              </h2>

              <p class="mut">
                ${esc(t.description)}
              </p>

              <div class="row">
                <small class="mut">
                  ${n}/${t.lessons.length} módulos concluídos
                </small>

                <b style="color:${c}">
                  ${pct}% da trilha
                </b>
              </div>

              <div class="bar">
                <div
                  style="
                    width:${pct}%;
                    background:${c}
                  "
                ></div>
              </div>

              <div class="path">

                ${
                  t.presentation.length
                    ? `
                      <div style="text-align:center">

                        <button
                          class="node"
                          style="background:${c}"
                          onclick="showTrack(${t.id})"
                        >
                          📌
                        </button>

                        <div class="mut">
                          Apresentação<br>
                          <small>da trilha</small>
                        </div>

                      </div>
                    `
                    : ''
                }

                ${t.lessons
                  .map(
                    (l, i) => `
                      <div
                        style="
                          text-align:center;
                          opacity:${l.locked ? 0.5 : 1}
                        "
                      >

                        <button
                          class="node ${l.done ? 'done' : ''}"
                          style="${
                            l.done
                              ? ''
                              : 'background:' + c
                          }"
                          onclick="${
                            l.locked
                              ? "alert('Conclua o módulo anterior para desbloquear 🔒')"
                              : `openLesson(${l.id})`
                          }"
                        >
                          ${
                            l.locked
                              ? '🔒'
                              : l.done
                              ? '✓'
                              : i + 1
                          }
                        </button>

                        <div class="mut">
                          <b>Módulo ${i + 1}</b><br>

                          ${esc(l.title)}

                          <div class="mini">
                            <div
                              style="
                                width:${l.pct}%;
                                background:${c}
                              "
                            ></div>
                          </div>

                          <small>
                            <b>${l.pct}%</b>
                            · +${l.xp} XP
                          </small>
                        </div>

                      </div>
                    `
                  )
                  .join('')}

                <div
                  style="
                    text-align:center;
                    opacity:.5
                  "
                >

                  <button
                    class="node"
                    style="background:var(--bd)"
                    onclick="alert('Os desafios chegam em breve! 🏆')"
                  >
                    🏆
                  </button>

                  <div class="mut">
                    Desafios<br>
                    <small>em breve</small>
                  </div>

                </div>

              </div>
            </div>
          `;
        })
        .join('')
    : `
      <p class="mut">
        Nenhuma trilha disponível ainda.
      </p>
    `;
}

// ============================================================
// APRESENTAÇÃO DA TRILHA
// ============================================================

function showTrack(id) {
  const tracks = window.TRACKS || [];

  const t = tracks.find(
    x => x.id === id
  );

  if (!t) {
    return home();
  }

  main.innerHTML = `
    <button
      class="link"
      onclick="home()"
    >
      ← Voltar
    </button>

    <h2>
      ${esc(t.icon)} ${esc(t.title)}
    </h2>

    <div class="steps">
      <span class="pill on">
        📌 Apresentação
      </span>
    </div>

    <div class="card lesson-content">
      ${t.presentation.map(block).join('')}
    </div>

    <button
      class="btn"
      onclick="home()"
    >
      Ir para os módulos
    </button>
  `;
}

// ============================================================
// RANKING
// ============================================================

async function rank() {
  const r = await api('/ranking');

  main.innerHTML =
    '<h2>🏆 Ranking</h2>' +
    (
      r
        .map(
          (u, n) => `
            <div
              class="card row"
              ${
                u.me
                  ? 'style="border-color:var(--g)"'
                  : ''
              }
            >

              <span>
                ${n + 1}º ${esc(u.name)}

                <small class="mut">
                  Nv ${u.level}
                </small>
              </span>

              <span>
                ⭐ ${u.xp} · 🔥 ${u.streak}
              </span>

            </div>
          `
        )
        .join('') ||
      `
        <p class="mut">
          Ainda não há alunos no ranking.
        </p>
      `
    );
}

// ============================================================
// PERFIL
// ============================================================

async function profile() {
  const p = await api('/me/profile');

  refresh();

  const top = Math.max(
    ...p.week.map(x => x.xp),
    1
  );

  main.innerHTML = `
    <div
      class="card"
      style="text-align:center"
    >

      <h2>
        ${esc(p.name)}
      </h2>

      <h3>
        🎖️ Nível ${p.level}
      </h3>

      <div class="bar">
        <div
          style="
            width:${
              (p.xp - p.curXp) /
              (p.nextXp - p.curXp || 1) *
              100
            }%
          "
        ></div>
      </div>

      <p class="mut">
        ${p.xp} / ${p.nextXp} XP
        para o nível ${p.level + 1}
      </p>

      <p>
        🔥 ${p.streak} dia(s)
        · 🪙 ${p.coins}
        · 📘 ${p.lessons} lições
        · 💯 ${p.perfect} perfeitas
        · 🏁 ${p.tracks} trilhas
      </p>

      <button
        class="btn sm"
        onclick="buyHearts()"
      >
        ❤️ Recarregar vidas (30 🪙)
      </button>

    </div>

    <h3>
      🎯 Missões de hoje
    </h3>

    ${p.missions
      .map(
        m => `
          <div class="card row">

            <span>
              ${m.icon}
              ${m.label}

              <small class="mut">
                (${m.value}/${m.goal})
              </small>
            </span>

            ${
              m.claimed
                ? '✅'
                : m.done
                ? `
                  <button
                    class="btn sm"
                    onclick="claim('${m.code}')"
                  >
                    Resgatar +10 🪙
                  </button>
                `
                : ''
            }

          </div>
        `
      )
      .join('')}

    <h3>
      🏅 Conquistas
    </h3>

    <div class="badges">
      ${p.badges
        .map(
          b => `
            <div
              class="bdg ${b.got ? '' : 'off'}"
              title="${esc(b.desc)}"
            >

              <span>
                ${b.icon}
              </span>

              <small>
                ${esc(b.name)}
              </small>

              <small class="mut">
                ${esc(b.desc)}
              </small>

            </div>
          `
        )
        .join('')}
    </div>

    <h3>
      📅 XP dos últimos dias
    </h3>

    <div class="week">
      ${
        p.week
          .map(
            w => `
              <div>

                <div
                  class="wb"
                  style="
                    height:${Math.max(
                      4,
                      (w.xp / top) * 80
                    )}px
                  "
                ></div>

                <small>
                  ${w.day.slice(8)}/${w.day.slice(5, 7)}
                </small>

              </div>
            `
          )
          .join('') ||
        `
          <p class="mut">
            Sem atividade ainda.
          </p>
        `
      }
    </div>
  `;
}

// ============================================================
// CONQUISTAS
// ============================================================

async function badges() {
  const p = await api('/me/profile');

  const n = p.badges.filter(
    b => b.got
  ).length;

  const total = p.badges.length;

  const pct = total
    ? (n / total) * 100
    : 0;

  main.innerHTML = `
    <h2>
      🏅 Conquistas
    </h2>

    <p class="mut">
      ${n} de ${total} desbloqueadas
    </p>

    <div class="bar">
      <div
        style="width:${pct}%"
      ></div>
    </div>

    <br>

    <div class="badges">
      ${p.badges
        .map(
          b => `
            <div
              class="bdg ${b.got ? '' : 'off'}"
            >

              <span>
                ${b.icon}
              </span>

              <b>
                ${esc(b.name)}
              </b>

              <small class="mut">
                ${esc(b.desc)}
              </small>

              <small>
                ${
                  b.got
                    ? '✅ Conquistada'
                    : '🔒 Bloqueada'
                }
              </small>

            </div>
          `
        )
        .join('')}
    </div>
  `;
}

// ============================================================
// MISSÕES / VIDAS
// ============================================================

const claim = async code => {
  try {
    await api(
      `/missions/${code}/claim`,
      'POST'
    );

    profile();
  } catch (e) {
    alert(e.message);
  }
};

const buyHearts = async () => {
  try {
    await api(
      '/shop/hearts',
      'POST'
    );

    profile();
  } catch (e) {
    alert(e.message);
  }
};

// ============================================================
// ORDENAR
// ============================================================

function ordenar(q, onCheck) {
  const sel = [];

  const box = document.createElement('div');

  const draw = () => {
    box.innerHTML = `
      <p class="mut">
        Toque nos itens na ordem correta:
      </p>

      <div
        class="card"
        style="min-height:60px"
      >
        ${sel
          .map(
            (x, n) => `
              <button
                class="opt"
                data-r="${n}"
              >
                ${n + 1}. ${esc(x.t)}
              </button>
            `
          )
          .join('')}
      </div>

      ${q.items
        .filter(
          x => !sel.includes(x)
        )
        .map(
          x => `
            <button
              class="opt"
              data-a="${x.i}"
            >
              ${esc(x.t)}
            </button>
          `
        )
        .join('')}

      ${
        sel.length === q.items.length
          ? `
            <button
              class="btn"
              id="vf"
            >
              Verificar
            </button>
          `
          : ''
      }
    `;

    box
      .querySelectorAll('[data-a]')
      .forEach(b => {
        b.onclick = () => {
          sel.push(
            q.items.find(
              x => x.i == b.dataset.a
            )
          );

          draw();
        };
      });

    box
      .querySelectorAll('[data-r]')
      .forEach(b => {
        b.onclick = () => {
          sel.splice(
            +b.dataset.r,
            1
          );

          draw();
        };
      });

    const v = box.querySelector('#vf');

    if (v) {
      v.onclick = () => {
        box
          .querySelectorAll('button')
          .forEach(
            b => (b.disabled = true)
          );

        onCheck(
          sel.map(x => x.i)
        );
      };
    }
  };

  draw();

  return box;
}

// ============================================================
// ASSOCIAR
// ============================================================

function associar(q, onCheck) {
  const map = {};

  const box = document.createElement('div');

  let cur = null;

  const draw = () => {
    const used = new Set(
      Object.values(map).map(
        x => x.i
      )
    );

    box.innerHTML = `
      <p class="mut">
        Toque em um item e depois no seu par
        (toque no item de novo para desfazer):
      </p>

      ${q.left
        .map(
          l => `
            <button
              class="opt ${
                cur === l.i ? 'ok' : ''
              }"
              data-l="${l.i}"
            >

              ${esc(l.t)}

              ${
                map[l.i]
                  ? ` → <b>${esc(
                      map[l.i].t
                    )}</b>`
                  : ''
              }

            </button>
          `
        )
        .join('')}

      <hr>

      ${q.right
        .filter(
          r => !used.has(r.i)
        )
        .map(
          r => `
            <button
              class="opt"
              data-r="${r.i}"
            >
              ${esc(r.t)}
            </button>
          `
        )
        .join('')}

      ${
        Object.keys(map).length ===
        q.left.length
          ? `
            <button
              class="btn"
              id="vf"
            >
              Verificar
            </button>
          `
          : ''
      }
    `;

    box
      .querySelectorAll('[data-l]')
      .forEach(b => {
        b.onclick = () => {
          const i = +b.dataset.l;

          if (map[i]) {
            delete map[i];
          } else {
            cur = i;
          }

          draw();
        };
      });

    box
      .querySelectorAll('[data-r]')
      .forEach(b => {
        b.onclick = () => {
          if (cur === null) {
            return;
          }

          map[cur] = q.right.find(
            r => r.i == b.dataset.r
          );

          cur = null;

          draw();
        };
      });

    const v = box.querySelector('#vf');

    if (v) {
      v.onclick = () => {
        box
          .querySelectorAll('button')
          .forEach(
            x => (x.disabled = true)
          );

        onCheck(
          q.left.map(
            l => map[l.i].i
          )
        );
      };
    }
  };

  draw();

  return box;
}

// ============================================================
// PREENCHER
// ============================================================

function preencher(q, onCheck) {
  const box = document.createElement('div');

  box.innerHTML = `
    <input
      id="fa"
      placeholder="Digite sua resposta"
      autocomplete="off"
    >

    <button
      class="btn"
      id="vf"
      style="margin-top:8px"
    >
      Verificar
    </button>
  `;

  const go = () => {
    const v = box.querySelector(
      '#fa'
    ).value;

    if (!v.trim()) {
      return;
    }

    box
      .querySelectorAll('input,button')
      .forEach(
        x => (x.disabled = true)
      );

    onCheck(v);
  };

  box.querySelector('#vf').onclick = go;

  box.querySelector('#fa').onkeydown =
    e => {
      if (e.key === 'Enter') {
        go();
      }
    };

  return box;
}

// ============================================================
// SOLUÇÕES
// ============================================================

const SOL = {
  ordenar: s =>
    'Ordem correta: ' +
    s.join(' → '),

  associar: s =>
    'Pares: ' +
    s
      .map(
        x =>
          x.replace(
            '|',
            ' ↔ '
          )
      )
      .join(' · '),

  preencher: s =>
    'Resposta esperada: ' +
    s[0]
};

// ============================================================
// CONTEÚDO DA LIÇÃO
// ============================================================

const ytId = u => {
  const match = String(u || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );

  return match
    ? match[1]
    : '';
};

const safeUrl = u => {
  const value = String(u || '');

  return /^(https?:\/\/|\/uploads\/)/.test(
    value
  )
    ? esc(value)
    : '';
};

function block(b) {
  if (b.type === 'texto') {
    return `
      <div class="intro">
        ${esc(b.value)}
      </div>
    `;
  }

  const cap = b.caption
    ? `
      <figcaption class="mut">
        ${esc(b.caption)}
      </figcaption>
    `
    : '';

  const y = ytId(b.value);

  if (b.type === 'imagem') {
    const src = safeUrl(
      b.value
    );

    if (!src) {
      return `
        <div class="card badc">
          ⚠️ Imagem inválida.
        </div>
      `;
    }

    return `
      <figure>
        <img
          src="${src}"
          alt="${esc(
            b.caption || ''
          )}"
        >
        ${cap}
      </figure>
    `;
  }

  return `
    <figure>

      ${
        y
          ? `
            <iframe
              src="https://www.youtube-nocookie.com/embed/${y}"
              allowfullscreen
              loading="lazy"
            ></iframe>
          `
          : `
            <video
              src="${safeUrl(b.value)}"
              controls
            ></video>
          `
      }

      ${cap}

    </figure>
  `;
}

// ============================================================
// ABRIR LIÇÃO
// ============================================================

async function openLesson(id) {
  let lesson;

  try {
    lesson = await api(
      '/lessons/' + id
    );
  } catch (e) {
    return alert(e.message);
  }

  let i = 0;
  let hits = 0;
  let combo = 0;

  const step = () => {
    if (
      i >= lesson.questions.length
    ) {
      return finish();
    }

    const q =
      lesson.questions[i];

    main.innerHTML = `
      <button
        class="link"
        onclick="home()"
      >
        ✕ Sair
      </button>

      <div class="row">

        <small class="mut">
          Pergunta ${i + 1} de
          ${lesson.questions.length}
        </small>

        <b>
          ${Math.round(
            (i /
              lesson.questions.length) *
              100
          )}%
        </b>

      </div>

      <div class="bar">
        <div
          style="
            width:${
              (i /
                lesson.questions.length) *
              100
            }%
          "
        ></div>
      </div>

      <div class="steps">

        <span class="pill">
          📖 Explicação
        </span>

        <span class="pill on">
          📝 Pergunta
          ${i + 1}/${lesson.questions.length}
        </span>

      </div>

      ${
        lesson.content.length
          ? `
            <details class="card">

              <summary>
                📖 Rever explicação
              </summary>

              ${lesson.content
                .map(block)
                .join('')}

            </details>
          `
          : ''
      }

      <h2>
        ${esc(q.prompt)}
      </h2>

      <div id="body"></div>

      <div id="fb"></div>
    `;

    const submit =
      async answer => {
        const r = await api(
          `/questions/${q.id}/check`,
          'POST',
          { answer }
        );

        if ($('hearts')) {
          $('hearts').textContent =
            '❤️ ' + r.hearts;
        }

        if (r.correct) {
          hits++;
          combo++;
        } else {
          combo = 0;
        }

        $('fb').innerHTML = `
          <div
            class="card ${
              r.correct
                ? 'okc'
                : 'badc'
            }"
          >

            <strong>

              ${
                r.correct
                  ? '✅ Correto!'
                  : '❌ Incorreto'
              }

              ${
                combo >= 3
                  ? ` · 🔥 combo x${combo}!`
                  : ''
              }

            </strong>

            ${
              !r.correct &&
              r.solution
                ? `
                  <p>
                    ${
                      SOL[q.type]
                        ? SOL[q.type](
                            r.solution
                          )
                        : ''
                    }
                  </p>
                `
                : ''
            }

            ${
              r.explanation
                ? `
                  <p>
                    💡 ${esc(
                      r.explanation
                    )}
                  </p>
                `
                : ''
            }

          </div>
        `;

        const out =
          !r.correct &&
          r.hearts === 0 &&
          !lesson.done;

        const nb =
          document.createElement(
            'button'
          );

        nb.className = 'btn';

        nb.textContent = out
          ? 'Sem vidas — voltar'
          : 'Continuar';

        nb.onclick = out
          ? home
          : () => {
              i++;
              step();
            };

        $('fb').appendChild(nb);

        return r;
      };

    const body = $('body');

    if (q.type === 'ordenar') {
      body.appendChild(
        ordenar(q, submit)
      );
    } else if (
      q.type === 'associar'
    ) {
      body.appendChild(
        associar(q, submit)
      );
    } else if (
      q.type === 'preencher'
    ) {
      body.appendChild(
        preencher(q, submit)
      );
    } else {
      body.innerHTML =
        q.options
          .map(
            (o, n) => `
              <button
                class="opt"
                data-n="${n}"
              >
                ${esc(o)}
              </button>
            `
          )
          .join('');

      body
        .querySelectorAll('.opt')
        .forEach(b => {
          b.onclick =
            async () => {
              body
                .querySelectorAll(
                  '.opt'
                )
                .forEach(
                  x =>
                    (x.disabled = true)
                );

              const r =
                await submit(
                  +b.dataset.n
                );

              body
                .querySelectorAll(
                  '.opt'
                )
                .forEach(x => {
                  if (
                    +x.dataset.n ===
                    r.answer
                  ) {
                    x.classList.add(
                      'ok'
                    );
                  }
                });

              if (!r.correct) {
                b.classList.add(
                  'bad'
                );
              }
            };
        });
    }
  };

  const finish =
    async () => {
      let r;

      try {
        r = await api(
          `/lessons/${id}/complete`,
          'POST'
        );
      } catch (e) {
        alert(e.message);
        return home();
      }

      refresh();

      main.innerHTML = `
        <div
          class="card"
          style="text-align:center"
        >

          <h2>
            ${
              r.perfect
                ? '💯 Lição perfeita!'
                : '🎉 Lição concluída!'
            }
          </h2>

          <p>
            Acertos:
            ${r.hits}/${r.total}
          </p>

          ${
            r.gained
              ? `
                <p>
                  ⭐ +${r.gained} XP
                  · 🪙 +${r.coins} moedas
                </p>
              `
              : `
                <p class="mut">
                  Revisão: sem XP extra.
                </p>
              `
          }

          <p>
            🔥 Sequência:
            ${r.streak} dia(s)
          </p>

          ${
            r.levelUp
              ? `
                <h3>
                  🎖️ Você subiu para o nível
                  ${r.level}!
                </h3>
              `
              : ''
          }

          ${r.badges
            .map(
              b => `
                <p>
                  🏅 Nova conquista:
                  ${b.icon}
                  <b>
                    ${esc(b.name)}
                  </b>
                </p>
              `
            )
            .join('')}

          <button
            class="btn"
            onclick="home()"
          >
            Voltar às trilhas
          </button>

        </div>
      `;
    };

  const explain = () => {
    if (
      !lesson.content.length
    ) {
      return step();
    }

    main.innerHTML = `
      <button
        class="link"
        onclick="home()"
      >
        ✕ Sair
      </button>

      <div class="steps">

        ${
          lesson.presentation.length
            ? `
              <span class="pill">
                📌 Apresentação
              </span>
            `
            : ''
        }

        <span class="pill on">
          📖 Explicação
        </span>

        <span class="pill">
          📝 Perguntas
        </span>

      </div>

      <h2>
        ${esc(lesson.title)}
      </h2>

      <div class="card lesson-content">
        ${lesson.content
          .map(block)
          .join('')}
      </div>

      <button
        class="btn"
        id="go"
      >
        Começar as perguntas
        (+${lesson.xp} XP)
      </button>
    `;

    $('go').onclick = step;
  };

  if (
    lesson.presentation.length
  ) {
    main.innerHTML = `
      <button
        class="link"
        onclick="home()"
      >
        ✕ Sair
      </button>

      <div class="steps">

        <span class="pill on">
          📌 Apresentação
        </span>

        <span class="pill">
          📖 Explicação
        </span>

        <span class="pill">
          📝 Perguntas
        </span>

      </div>

      <h2>
        ${esc(lesson.title)}
      </h2>

      <div class="card lesson-content">
        ${lesson.presentation
          .map(block)
          .join('')}
      </div>

      <button
        class="btn"
        id="go0"
      >
        Continuar
      </button>
    `;

    $('go0').onclick =
      explain;
  } else {
    explain();
  }
}

// ============================================================
// GESTÃO FINANCEIRA
// ============================================================

const brl = n =>
  Number(n || 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  );

const pad2 = n =>
  String(n).padStart(2, '0');

const hojeStr = () => {
  const d = new Date();

  return `${d.getFullYear()}-${pad2(
    d.getMonth() + 1
  )}-${pad2(d.getDate())}`;
};

const shiftMes = (m, n) => {
  const [y, mo] = m
    .split('-')
    .map(Number);

  const d = new Date(
    y,
    mo - 1 + n,
    1
  );

  return `${d.getFullYear()}-${pad2(
    d.getMonth() + 1
  )}`;
};

const num = v =>
  Math.max(
    0,
    parseFloat(
      String(v).replace(',', '.')
    ) || 0
  );

const CATS = {
  gasto: [
    'Moradia',
    'Alimentação',
    'Transporte',
    'Saúde',
    'Educação',
    'Lazer',
    'Contas',
    'Dívidas',
    'Outros'
  ],

  receita: [
    'Salário',
    'Renda extra',
    'Investimentos',
    'Outros'
  ]
};

const NEC = [
  'Moradia',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Educação',
  'Contas'
];

const DES = [
  'Lazer',
  'Outros'
];

const voltar =
  '<button class="link" onclick="gestao()">← Gestão financeira</button>';

async function mesAtual() {
  const es = (
    await api(
      '/finance?month=' +
        hojeStr().slice(0, 7)
    )
  ).entries;

  const s = k =>
    es
      .filter(e => e.kind === k)
      .reduce(
        (t, e) => t + e.amount,
        0
      );

  return {
    es,
    rec: s('receita'),
    gas: s('gasto')
  };
}

// ============================================================
// MENU DE GESTÃO
// ============================================================

function gestao() {
  const tools = [
    [
      '🧾',
      'Gastos do mês',
      'Registre receitas e gastos e veja para onde vai seu dinheiro',
      'gastos()'
    ],
    [
      '💹',
      'Simulador',
      'Veja seu dinheiro crescer com rendimento, receitas e gastos',
      'sim()'
    ],
    [
      '🛟',
      'Reserva de emergência',
      'Descubra quanto guardar para os imprevistos',
      'reserva()'
    ],
    [
      '📐',
      'Regra 50/30/20',
      'Divida sua renda entre necessidades, desejos e poupança',
      'regra()'
    ]
  ];

  main.innerHTML = `
    <h2>
      💼 Gestão financeira
    </h2>

    <p class="mut">
      Ferramentas para organizar e planejar o seu dinheiro.
    </p>

    <div class="tools">
      ${tools
        .map(
          ([i, t, d, f]) => `
            <button
              class="tool"
              onclick="${f}"
            >

              <span>
                ${i}
              </span>

              <b>
                ${t}
              </b>

              <small class="mut">
                ${d}
              </small>

            </button>
          `
        )
        .join('')}
    </div>
  `;
}

// ============================================================
// GASTOS
// ============================================================

let GM = hojeStr().slice(0, 7);

async function gastos(m) {
  if (
    typeof m === 'string' &&
    m
  ) {
    GM = m;
  }

  const { entries: es } =
    await api(
      '/finance?month=' + GM
    );

  const soma = k =>
    es
      .filter(e => e.kind === k)
      .reduce(
        (t, e) => t + e.amount,
        0
      );

  const rec =
    soma('receita');

  const gas =
    soma('gasto');

  const saldo =
    rec - gas;

  const por = {};

  es
    .filter(
      e => e.kind === 'gasto'
    )
    .forEach(e => {
      por[e.category] =
        (por[e.category] || 0) +
        e.amount;
    });

  const cats = Object.entries(
    por
  ).sort(
    (a, b) => b[1] - a[1]
  );

  const dia =
    GM === hojeStr().slice(0, 7)
      ? hojeStr()
      : GM + '-01';

  main.innerHTML = `
    ${voltar}

    <h2>
      🧾 Gastos do mês
    </h2>

    <div class="row">

      <button
        class="btn sm sec"
        onclick="gastos('${shiftMes(
          GM,
          -1
        )}')"
      >
        ←
      </button>

      <input
        type="month"
        value="${GM}"
        style="width:auto"
        onchange="gastos(this.value)"
      >

      <button
        class="btn sm sec"
        onclick="gastos('${shiftMes(
          GM,
          1
        )}')"
      >
        →
      </button>

    </div>

    <div class="fin3">

      <div class="card">
        <small class="mut">
          Receitas
        </small>

        <h3 style="color:var(--g)">
          ${brl(rec)}
        </h3>
      </div>

      <div class="card">
        <small class="mut">
          Gastos
        </small>

        <h3 style="color:var(--red)">
          ${brl(gas)}
        </h3>
      </div>

      <div class="card">
        <small class="mut">
          Saldo
        </small>

        <h3
          style="
            color:${
              saldo >= 0
                ? 'var(--g)'
                : 'var(--red)'
            }
          "
        >
          ${brl(saldo)}
        </h3>
      </div>

    </div>

    ${
      rec
        ? `
          <p class="mut">
            Você usou
            ${Math.round(
              (gas / rec) * 100
            )}%
            da sua renda neste mês.
          </p>
        `
        : ''
    }

    <div class="card">

      <h3>
        ➕ Novo lançamento
      </h3>

      <select
        id="lk"
        onchange="catsLanc()"
      >
        <option value="gasto">
          🔻 Gasto
        </option>

        <option value="receita">
          🔺 Receita
        </option>
      </select>

      <select id="lc"></select>

      <input
        id="ld"
        placeholder="Descrição (opcional)"
      >

      <input
        id="lv"
        inputmode="decimal"
        placeholder="Valor (R$)"
      >

      <input
        id="ldia"
        type="date"
        value="${dia}"
      >

      <div
        class="err"
        id="lerr"
      ></div>

      <button
        class="btn"
        onclick="addLanc()"
      >
        Adicionar
      </button>

    </div>

    ${
      cats.length
        ? `
          <h3>
            Para onde foi o dinheiro
          </h3>

          <div class="card">

            ${cats
              .map(
                ([c, v]) => `
                  <div class="row">

                    <span>
                      ${esc(c)}
                    </span>

                    <span>
                      ${brl(v)}
                      ·
                      ${
                        gas
                          ? Math.round(
                              (v / gas) *
                                100
                            )
                          : 0
                      }%
                    </span>

                  </div>

                  <div class="bar">
                    <div
                      style="
                        width:${
                          gas
                            ? (v / gas) *
                              100
                            : 0
                        }%
                      "
                    ></div>
                  </div>
                `
              )
              .join('')}

          </div>
        `
        : ''
    }

    <h3>
      Lançamentos
    </h3>

    ${
      es
        .map(
          e => `
            <div class="card row">

              <span>

                ${
                  e.kind === 'gasto'
                    ? '🔻'
                    : '🔺'
                }

                <b>
                  ${esc(e.category)}
                </b>

                ${esc(
                  e.description || ''
                )}

                <br>

                <small class="mut">
                  ${e.day
                    .split('-')
                    .reverse()
                    .join('/')}
                </small>

              </span>

              <span>

                <b
                  style="
                    color:${
                      e.kind === 'gasto'
                        ? 'var(--red)'
                        : 'var(--g)'
                    }
                  "
                >
                  ${brl(e.amount)}
                </b>

                <button
                  class="btn sm red"
                  onclick="delLanc(${e.id})"
                >
                  ✕
                </button>

              </span>

            </div>
          `
        )
        .join('') ||
      `
        <p class="mut">
          Nenhum lançamento neste mês.
        </p>
      `
    }
  `;

  catsLanc();
}

function catsLanc() {
  const kind =
    $('lk').value;

  $('lc').innerHTML =
    CATS[kind]
      .map(
        c =>
          `<option>${esc(c)}</option>`
      )
      .join('');
}

async function addLanc() {
  const v = num(
    $('lv').value
  );

  if (!v) {
    $('lerr').textContent =
      'Informe um valor maior que zero';

    return;
  }

  try {
    const dia =
      $('ldia').value;

    await api(
      '/finance',
      'POST',
      {
        kind: $('lk').value,
        category: $('lc').value,
        description:
          $('ld').value.trim(),
        amount: v,
        day: dia
      }
    );

    gastos(
      dia.slice(0, 7)
    );
  } catch (e) {
    $('lerr').textContent =
      e.message;
  }
}

const delLanc = async id => {
  await api(
    '/finance/' + id,
    'DELETE'
  );

  gastos();
};

// ============================================================
// SIMULADOR
// ============================================================

function addRow(
  id,
  nome = '',
  valor = ''
) {
  $(id).insertAdjacentHTML(
    'beforeend',
    `
      <div
        class="row"
        style="flex-wrap:nowrap"
      >

        <input
          placeholder="Descrição"
          value="${esc(nome)}"
        >

        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="R$ por mês"
          value="${esc(valor)}"
        >

        <button
          class="btn sm red"
          onclick="this.parentNode.remove()"
        >
          ✕
        </button>

      </div>
    `
  );
}

function sim() {
  main.innerHTML = `
    ${voltar}

    <h2>
      💹 Simulador financeiro
    </h2>

    <p class="mut">
      Veja como seu dinheiro evolui com receitas,
      gastos e rendimento, e quando você chega à sua meta.
    </p>

    <div class="card">

      <label>
        Saldo inicial (R$)

        <input
          id="s0"
          type="number"
          min="0"
          step="0.01"
          value="1000"
        >
      </label>

      <label>
        Rendimento (% ao ano)

        <input
          id="rate"
          type="number"
          min="0"
          step="0.1"
          value="10"
        >
      </label>

      <label>
        Inflação (% ao ano)

        <input
          id="inf"
          type="number"
          min="0"
          step="0.1"
          value="4"
        >
      </label>

      <label>
        Prazo (anos, até 60)

        <input
          id="yrs"
          type="number"
          min="1"
          max="60"
          value="5"
        >
      </label>

      <label>
        Meta (R$, opcional)

        <input
          id="meta"
          type="number"
          min="0"
          step="0.01"
          placeholder="Ex.: 20000"
        >
      </label>

    </div>

    <div class="card">

      <strong>
        💵 Receitas mensais
      </strong>

      <div id="inc"></div>

      <button
        class="btn sm sec"
        onclick="addRow('inc')"
      >
        + Receita
      </button>

    </div>

    <div class="card">

      <strong>
        🧾 Gastos mensais
      </strong>

      <div id="exp"></div>

      <button
        class="btn sm sec"
        onclick="addRow('exp')"
      >
        + Gasto
      </button>

    </div>

    <button
      class="btn sec"
      style="width:100%;margin-bottom:8px"
      onclick="importarMes()"
    >
      📥 Importar do meu mês atual
    </button>

    <button
      class="btn"
      style="width:100%"
      onclick="calcSim()"
    >
      Simular
    </button>

    <div id="res"></div>
  `;

  addRow('inc');
  addRow('exp');
}

async function importarMes() {
  const {
    rec,
    gas
  } = await mesAtual();

  if (!rec && !gas) {
    return alert(
      'Você ainda não tem lançamentos neste mês em "Gastos do mês".'
    );
  }

  $('inc').innerHTML = '';
  $('exp').innerHTML = '';

  addRow(
    'inc',
    'Receitas do mês',
    rec.toFixed(2)
  );

  addRow(
    'exp',
    'Gastos do mês',
    gas.toFixed(2)
  );
}

function calcSim() {
  const n = id =>
    num($(id).value);

  const soma = id =>
    [
      ...document.querySelectorAll(
        `#${id} input[type=number]`
      )
    ].reduce(
      (t, i) =>
        t + num(i.value),
      0
    );

  const s0 = n('s0');

  const anos = Math.min(
    60,
    Math.max(
      1,
      Math.round(n('yrs')) || 1
    )
  );

  const meta = n('meta');

  const r =
    Math.pow(
      1 + n('rate') / 100,
      1 / 12
    ) - 1;

  const infl =
    Math.pow(
      1 + n('inf') / 100,
      1 / 12
    );

  const net =
    soma('inc') -
    soma('exp');

  let a = s0;
  let b = s0;

  let mesMeta =
    meta && s0 >= meta
      ? 0
      : null;

  const pts = [
    {
      m: 0,
      a,
      b
    }
  ];

  for (
    let m = 1;
    m <= anos * 12;
    m++
  ) {
    a =
      a * (1 + r) +
      net;

    b += net;

    pts.push({
      m,
      a,
      b
    });

    if (
      meta &&
      mesMeta === null &&
      a >= meta
    ) {
      mesMeta = m;
    }
  }

  const neg =
    pts.find(
      p => p.a < 0
    );

  const W = 600;
  const H = 220;

  const all =
    pts.flatMap(
      p => [p.a, p.b]
    );

  const mx =
    Math.max(...all, 1);

  const mn =
    Math.min(...all, 0);

  const X = m =>
    (m / (anos * 12)) *
    W;

  const Y = v =>
    H -
    ((v - mn) /
      (mx - mn || 1)) *
      H;

  const line = k => `
    <polyline
      fill="none"
      stroke="${
        k === 'a'
          ? '#58cc02'
          : '#1cb0f6'
      }"
      stroke-width="3"
      points="${
        pts
          .map(
            p =>
              X(p.m).toFixed(1) +
              ',' +
              Y(p[k]).toFixed(1)
          )
          .join(' ')
      }"
    />
  `;

  const metaTxt =
    !meta
      ? ''
      : mesMeta === null
      ? `
        <p class="err">
          🎯 Com esses números,
          você não chega a
          ${brl(meta)}
          em ${anos} ano(s).
        </p>
      `
      : `
        <p style="color:var(--g)">
          <b>
            🎯 Meta de ${brl(meta)}
            atingida em
            ${Math.floor(
              mesMeta / 12
            )}
            ano(s) e
            ${mesMeta % 12}
            mês(es)!
          </b>
        </p>
      `;

  $('res').innerHTML = `
    <div class="card">

      <h3>
        Resultado em
        ${anos} ano(s)
      </h3>

      <p>
        Sobra (ou falta) por mês:

        <strong>
          ${brl(net)}
        </strong>
      </p>

      <p>
        Saldo final com rendimento:

        <strong>
          ${brl(a)}
        </strong>
      </p>

      <p>
        Saldo final sem rendimento:
        ${brl(b)}
      </p>

      <p>
        Rendimento acumulado:

        <strong>
          ${brl(a - b)}
        </strong>
      </p>

      <p>
        Valor em poder de compra de hoje
        (descontada a inflação):

        ${brl(
          a /
            Math.pow(
              infl,
              anos * 12
            )
        )}
      </p>

      ${metaTxt}

      ${
        neg
          ? `
            <p class="err">
              ⚠️ Com esses gastos,
              o saldo fica negativo
              no mês ${neg.m}.
            </p>
          `
          : ''
      }

    </div>

    <div class="card">

      <svg
        viewBox="0 0 ${W} ${H}"
        width="100%"
      >

        <line
          x1="0"
          x2="${W}"
          y1="${Y(0)}"
          y2="${Y(0)}"
          style="stroke:var(--bd)"
        />

        ${line('b')}
        ${line('a')}

      </svg>

      <p>
        <span style="color:#58cc02">
          ■
        </span>

        com rendimento

        &nbsp;

        <span style="color:#1cb0f6">
          ■
        </span>

        sem rendimento
      </p>

    </div>

    <div
      class="card"
      style="overflow-x:auto"
    >

      <table
        style="
          width:100%;
          text-align:right
        "
      >

        <tr>

          <th style="text-align:left">
            Ano
          </th>

          <th>
            Com rendimento
          </th>

          <th>
            Sem rendimento
          </th>

        </tr>

        ${Array.from(
          { length: anos },
          (_, y) => `
            <tr>

              <td style="text-align:left">
                ${y + 1}
              </td>

              <td>
                ${brl(
                  pts[
                    (y + 1) * 12
                  ].a
                )}
              </td>

              <td>
                ${brl(
                  pts[
                    (y + 1) * 12
                  ].b
                )}
              </td>

            </tr>
          `
        ).join('')}

      </table>

    </div>

    <p class="mut">
      Simulação educativa:
      taxa constante, sem impostos e sem tarifas.
      Não é recomendação de investimento.
    </p>
  `;
}

// ============================================================
// RESERVA DE EMERGÊNCIA
// ============================================================

async function reserva() {
  main.innerHTML = `
    ${voltar}

    <h2>
      🛟 Reserva de emergência
    </h2>

    <p class="mut">
      A reserva cobre imprevistos,
      como perda de renda ou problemas de saúde.
      O comum é guardar de 3 a 12 meses dos seus gastos.
    </p>

    <div class="card">

      <label>
        Gasto mensal (R$)

        <input
          id="rg"
          type="number"
          min="0"
          step="0.01"
        >
      </label>

      <label>
        Meses de cobertura

        <select id="rm">
          <option>3</option>
          <option selected>6</option>
          <option>9</option>
          <option>12</option>
        </select>
      </label>

      <label>
        Quanto você já tem guardado (R$)

        <input
          id="rj"
          type="number"
          min="0"
          step="0.01"
          value="0"
        >
      </label>

      <label>
        Quanto consegue guardar por mês (R$)

        <input
          id="rp"
          type="number"
          min="0"
          step="0.01"
        >
      </label>

      <button
        class="btn"
        style="width:100%"
        onclick="calcReserva()"
      >
        Calcular
      </button>

    </div>

    <div id="res"></div>
  `;

  try {
    const { gas } =
      await mesAtual();

    if (gas) {
      $('rg').value =
        gas.toFixed(2);
    }
  } catch (e) {
    // Sem lançamentos ainda
  }
}

function calcReserva() {
  const g =
    num($('rg').value);

  const meses =
    +$('rm').value;

  const tem =
    num($('rj').value);

  const mes =
    num($('rp').value);

  const alvo =
    g * meses;

  const falta =
    Math.max(
      0,
      alvo - tem
    );

  const pct = alvo
    ? Math.min(
        100,
        Math.round(
          (tem / alvo) *
            100
        )
      )
    : 0;

  const prazo =
    !alvo
      ? 'Informe seu gasto mensal.'
      : falta === 0
      ? 'Você já atingiu a reserva! 🎉'
      : mes
      ? `
        Guardando ${brl(mes)}
        por mês, você completa
        em ${Math.ceil(
          falta / mes
        )} mês(es).
      `
      : `
        Informe quanto consegue
        guardar por mês para ver o prazo.
      `;

  $('res').innerHTML = `
    <div class="card">

      <h3>
        Sua meta:
        ${brl(alvo)}
      </h3>

      <div class="bar">
        <div
          style="width:${pct}%"
        ></div>
      </div>

      <p>
        Você tem ${brl(tem)}
        (${pct}%).
        Falta ${brl(falta)}.
      </p>

      <p>
        ${prazo}
      </p>

    </div>
  `;
}

// ============================================================
// REGRA 50/30/20
// ============================================================

async function regra() {
  main.innerHTML = `
    ${voltar}

    <h2>
      📐 Regra 50/30/20
    </h2>

    <p class="mut">
      Uma divisão simples da renda:
      50% para necessidades,
      30% para desejos e
      20% para poupança e dívidas.
    </p>

    <div class="card">

      <label>
        Renda líquida mensal (R$)

        <input
          id="rr"
          type="number"
          min="0"
          step="0.01"
        >
      </label>

      <button
        class="btn"
        style="width:100%"
        onclick="calcRegra()"
      >
        Calcular
      </button>

    </div>

    <div id="res"></div>
  `;

  try {
    const m =
      await mesAtual();

    window.REGRA = m.es;

    if (m.rec) {
      $('rr').value =
        m.rec.toFixed(2);
    }
  } catch (e) {
    // Sem lançamentos ainda
  }
}

function calcRegra() {
  const r =
    num($('rr').value);

  const es =
    (window.REGRA || [])
      .filter(
        e => e.kind === 'gasto'
      );

  const tem =
    es.length > 0;

  const s = L =>
    es
      .filter(e =>
        L.includes(e.category)
      )
      .reduce(
        (t, e) =>
          t + e.amount,
        0
      );

  const nec =
    s(NEC);

  const des =
    s(DES);

  const poup =
    r - nec - des;

  const linha =
    (nome, p, real) => `
      <div class="card">

        <div class="row">

          <b>
            ${nome}
          </b>

          <span>
            ideal: ${p}%
            · ${brl(
              (r * p) / 100
            )}
          </span>

        </div>

        ${
          tem
            ? `
              <div class="bar">

                <div
                  style="
                    width:${
                      r
                        ? Math.min(
                            100,
                            Math.max(
                              0,
                              real
                            ) /
                              r *
                              100
                          )
                        : 0
                    }%
                  "
                ></div>

              </div>

              <small class="mut">
                No seu mês:
                ${brl(real)}
                (${
                  r
                    ? Math.round(
                        (real / r) *
                          100
                      )
                    : 0
                }%)
              </small>
            `
            : ''
        }

      </div>
    `;

  $('res').innerHTML =
    linha(
      '🏠 Necessidades',
      50,
      nec
    ) +

    linha(
      '🎉 Desejos',
      30,
      des
    ) +

    linha(
      '🐖 Poupança e dívidas',
      20,
      poup
    ) +

    (
      tem
        ? ''
        : `
          <p class="mut">
            Registre seus lançamentos
            em "Gastos do mês" para
            comparar com o seu mês real.
          </p>
        `
    );
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

home();