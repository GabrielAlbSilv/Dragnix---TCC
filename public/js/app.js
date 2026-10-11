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
  admButton.style.display = 'none';

  try {
    const currentUser = me();

    if (currentUser && ['adm', 'professor'].includes(currentUser.role)) {
      admButton.classList.remove('hide');
      admButton.style.display = '';

      // Professores veem "Painel Professor"; ADM continua "Painel ADM".
      if (currentUser.role === 'professor') {
        const title = admButton.querySelector('strong');
        const desc = admButton.querySelector('small');

        if (title) {
          title.textContent = 'Painel Professor';
        }

        if (desc) {
          desc.textContent = 'Crie e edite trilhas, módulos e questões.';
        }
      }
    }
  } catch (error) {
    console.error('Erro ao verificar usuário:', error);
    admButton.style.display = 'none';
  }
}

// ============================================================
// HELPERS
// ============================================================

const arr = value => Array.isArray(value) ? value : [];

const normalizeTrack = t => ({
  ...t,
  presentation: arr(t.presentation),
  conclusion: arr(t.conclusion),
  prerequisites: arr(t.prerequisites),
  missing: arr(t.missing),
  lessons: arr(t.lessons)
});

const normalizeLesson = lesson => ({
  ...lesson,
  presentation: arr(lesson.presentation),
  content: arr(lesson.content),
  conclusion: arr(lesson.conclusion),
  questions: arr(lesson.questions),
  evaluation_question:
    lesson.evaluation_question ||
    ''
});

// ============================================================
// STATUS
// ============================================================

const setStats = d => {
  if ($('xp')) {
    $('xp').innerHTML = icon('star') + ' ' + d.xp;
  }

  if ($('streak')) {
    $('streak').innerHTML = icon('flame') + ' ' + d.streak;
  }

  if ($('coins')) {
    $('coins').innerHTML = icon('coins') + ' ' + d.coins;
  }

  if ($('lvl')) {
    $('lvl').innerHTML = icon('medal') + ' Nv ' + d.level;
  }

  if ($('hearts')) {
    $('hearts').innerHTML =
      icon('heart') + ' ' +
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
      <strong>${icon('triangle-alert')} ${esc(e.reason?.message || e.reason)}</strong>

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

  // ==========================================================
  // CARREGAR TRILHAS
  // ==========================================================

  const d =
    await api('/tracks');

  setStats(d);

  const tracks =
    arr(d.tracks).map(normalizeTrack);

  console.log(
    'TRILHAS RECEBIDAS:',
    tracks
  );

  console.log(
    'QUANTIDADE:',
    tracks.length
  );

  window.TRACKS =
    tracks;


  // ==========================================================
  // CARREGAR MÉDIAS DAS AVALIAÇÕES DOS MÓDULOS
  // ==========================================================

  let lessonRatings = [];

  try {

    const ratingData =
      await api('/lessons/ratings');

    lessonRatings =
      arr(ratingData.ratings);

  } catch (e) {

    console.warn(
      'Não foi possível carregar as avaliações dos módulos:',
      e
    );

  }


  // ==========================================================
  // CRIAR MAPA DE AVALIAÇÕES
  //
  // lesson_id -> {
  //   average_rating,
  //   rating_count
  // }
  // ==========================================================

  const ratingMap =
    Object.fromEntries(

      lessonRatings.map(
        r => [
          Number(r.lesson_id),
          r
        ]
      )

    );


  // ==========================================================
  // ADICIONAR AVALIAÇÃO A CADA MÓDULO
  // ==========================================================

  tracks.forEach(
    t => {

      t.lessons.forEach(
        l => {

          const rating =
            ratingMap[
              Number(l.id)
            ];

          l.average_rating =
            rating
              ? Number(
                  rating.average_rating
                )
              : null;

          l.rating_count =
            rating
              ? Number(
                  rating.rating_count
                )
              : 0;

        }
      );

    }
  );


  // ==========================================================
  // RENDERIZAR TRILHAS
  // ==========================================================

  main.innerHTML =
    tracks.length

      ? tracks
          .map(
            t => {

              // ==================================================
              // COR DA TRILHA
              // ==================================================

              const c =
                esc(
                  t.color ||
                  '#58cc02'
                );


              // ==================================================
              // MÓDULOS CONCLUÍDOS
              // ==================================================

              const n =
                t.lessons.filter(
                  l => l.done
                ).length;


              // ==================================================
              // PORCENTAGEM DA TRILHA
              // ==================================================

              const pct =
                t.lessons.length

                  ? Math.round(

                      t.lessons.reduce(
                        (
                          x,
                          l
                        ) =>

                          x +
                          (
                            Number(l.pct) ||
                            0
                          ),

                        0
                      )

                      /

                      t.lessons.length

                    )

                  : 0;


              // ==================================================
              // VERIFICAR SE TODOS OS MÓDULOS FORAM CONCLUÍDOS
              // ==================================================

              const allLessonsDone =
                t.lessons.length > 0 &&
                t.lessons.every(
                  l => l.done
                );


              // ==================================================
              // CALCULAR MÉDIA GERAL DA TRILHA
              //
              // A média considera todas as avaliações recebidas
              // pelos módulos da trilha.
              // ==================================================

              const ratedLessons =
                t.lessons.filter(
                  l =>
                    l.average_rating !== null &&
                    Number(l.rating_count) > 0
                );


              // ==================================================
              // QUANTIDADE TOTAL DE AVALIAÇÕES DA TRILHA
              // ==================================================

              const trackRatingCount =
                ratedLessons.reduce(
                  (
                    total,
                    l
                  ) =>

                    total +
                    Number(
                      l.rating_count || 0
                    ),

                  0
                );


              // ==================================================
              // MÉDIA PONDERADA DA TRILHA
              //
              // Exemplo:
              //
              // Módulo 1 = 5.0 com 10 avaliações
              // Módulo 2 = 4.0 com 2 avaliações
              //
              // Média:
              // (5*10 + 4*2) / 12 = 4.83
              // ==================================================

              const trackAverageRating =
                trackRatingCount > 0

                  ? (

                      ratedLessons.reduce(
                        (
                          total,
                          l
                        ) =>

                          total +
                          (
                            Number(
                              l.average_rating
                            ) *
                            Number(
                              l.rating_count
                            )
                          ),

                        0
                      )

                      /

                      trackRatingCount

                    ).toFixed(1)

                  : null;


              // ==================================================
              // CARD DA TRILHA
              // ==================================================

              return `

                <div
                  class="card"
                  style="
                    border-color:${c};
                    opacity:${t.locked ? 0.65 : 1}
                  "
                >

                  <!-- ==========================================
                       TÍTULO DA TRILHA
                  =========================================== -->

                  <h2>

                    ${esc(
                      t.icon ||
                      '📚'
                    )}

                    ${esc(
                      t.title
                    )}

                  </h2>


                  <!-- ==========================================
                       AVALIAÇÃO GERAL DA TRILHA
                       FICA NO TOPO, ABAIXO DO NOME
                  =========================================== -->

                  ${
                    trackAverageRating !== null

                      ? `

                        <div
                          class="mut"
                          style="
                            margin-top:-8px;
                            margin-bottom:12px;
                            font-size:14px;
                          "
                        >

                          ${icon('star')}

                          <b>
                            ${trackAverageRating}
                          </b>

                          / 5

                          ·

                          ${trackRatingCount}

                          ${
                            trackRatingCount === 1
                              ? 'avaliação'
                              : 'avaliações'
                          }

                        </div>

                      `

                      : `

                        <div
                          class="mut"
                          style="
                            margin-top:-8px;
                            margin-bottom:12px;
                            font-size:14px;
                          "
                        >

                          ${icon('star')}
                          Sem avaliações ainda

                        </div>

                      `
                  }


                  <!-- ==========================================
                       DESCRIÇÃO
                  =========================================== -->

                  <p class="mut">

                    ${esc(
                      t.description ||
                      ''
                    )}

                  </p>


                  <!-- ==========================================
                       TRILHA BLOQUEADA
                  =========================================== -->

                  ${
                    t.locked

                      ? `

                        <p class="err">

                          ${icon('lock')} Para liberar esta trilha,
                          conclua antes:

                          ${t.missing
                            .map(esc)
                            .join(', ')}

                        </p>

                      `

                      : ''
                  }


                  <!-- ==========================================
                       PROGRESSO DA TRILHA
                  =========================================== -->

                  <div class="row">

                    <small class="mut">

                      ${n}/${t.lessons.length}

                      módulos concluídos

                    </small>


                    <b
                      style="
                        color:${c}
                      "
                    >

                      ${pct}%
                      da trilha

                    </b>

                  </div>


                  <!-- ==========================================
                       BARRA DE PROGRESSO
                  =========================================== -->

                  <div class="bar">

                    <div
                      style="
                        width:${pct}%;
                        background:${c}
                      "
                    ></div>

                  </div>


                  <!-- ==========================================
                       CAMINHO DA TRILHA
                  =========================================== -->

                  <div class="path">


                    <!-- ========================================
                         APRESENTAÇÃO DA TRILHA
                    ========================================= -->

                    ${
                      t.presentation.length

                        ? `

                          <div
                            style="
                              text-align:center
                            "
                          >

                            <button
                              class="node"
                              style="
                                background:${c}
                              "
                              onclick="${
                                t.locked

                                  ? `aviso(${t.id})`

                                  : `showTrack(${t.id})`
                              }"
                            >

                              ${icon('pin')}

                            </button>


                            <div class="mut">

                              Apresentação

                              <br>

                              <small>
                                da trilha
                              </small>

                            </div>

                          </div>

                        `

                        : ''
                    }


                    <!-- ========================================
                         MÓDULOS
                    ========================================= -->

                    ${
                      t.lessons
                        .map(
                          (
                            l,
                            i
                          ) => `

                            <div
                              style="
                                text-align:center;
                                opacity:${
                                  l.locked
                                    ? 0.5
                                    : 1
                                }
                              "
                            >


                              <!-- ==================================
                                   BOTÃO DO MÓDULO
                              =================================== -->

                              <button
                                class="node ${
                                  l.done
                                    ? 'done'
                                    : ''
                                }"
                                style="${
                                  l.done
                                    ? ''
                                    : 'background:' +
                                      c
                                }"
                                onclick="${
                                  l.locked

                                    ? `aviso(${t.id})`

                                    : `openLesson(${l.id})`
                                }"
                              >

                                ${
                                  l.locked

                                    ? icon('lock')

                                    : l.done

                                      ? icon('check')

                                      : i + 1
                                }

                              </button>


                              <!-- ==================================
                                   INFORMAÇÕES DO MÓDULO
                              =================================== -->

                              <div class="mut">

                                <b>
                                  Módulo ${i + 1}
                                </b>

                                <br>


                                ${esc(
                                  l.title ||
                                  ''
                                )}


                                <!-- ==================================
                                     PROGRESSO DO MÓDULO
                                =================================== -->

                                <div class="mini">

                                  <div
                                    style="
                                      width:${
                                        Number(
                                          l.pct
                                        ) || 0
                                      }%;
                                      background:${c}
                                    "
                                  ></div>

                                </div>


                                <small>

                                  <b>
                                    ${
                                      Number(
                                        l.pct
                                      ) || 0
                                    }%
                                  </b>

                                  ·

                                  +${
                                    Number(
                                      l.xp
                                    ) || 0
                                  }

                                  XP

                                </small>

                              </div>

                            </div>

                          `
                        )
                        .join('')
                    }


                    <!-- ========================================
                         DESAFIOS
                    ========================================= -->

                    <div
                      style="
                        text-align:center;
                        opacity:.5
                      "
                    >

                      <button
                        class="node"
                        style="
                          background:var(--bd)
                        "
                        onclick="
                          alert(
                            'Os desafios chegam em breve!'
                          )
                        "
                      >

                        ${icon('trophy')}

                      </button>


                      <div class="mut">

                        Desafios

                        <br>

                        <small>
                          em breve
                        </small>

                      </div>

                    </div>


                    <!-- ========================================
                         CONCLUSÃO DA TRILHA
                         APARECE SOMENTE EM 100%
                    ========================================= -->

                    ${
                      allLessonsDone &&
                      t.conclusion.length

                        ? `

                          <div
                            style="
                              text-align:center
                            "
                          >

                            <button
                              class="node"
                              style="
                                background:${c}
                              "
                              onclick="
                                showTrackConclusion(
                                  ${t.id}
                                )
                              "
                            >

                              ${icon('flag')}

                            </button>


                            <div class="mut">

                              Conclusão

                              <br>

                              <small>
                                da trilha
                              </small>

                            </div>

                          </div>

                        `

                        : ''
                    }


                    <!-- ========================================
                         AVALIAÇÃO DA TRILHA
                         APARECE SOMENTE EM 100%
                    ========================================= -->

                    ${
                      allLessonsDone &&
                      t.evaluation_question

                        ? `

                          <div
                            style="
                              text-align:center
                            "
                          >

                            <button
                              class="node"
                              style="
                                background:${c}
                              "
                              onclick="
                                showTrackEvaluation(
                                  ${t.id}
                                )
                              "
                            >

                              ${icon('square-pen')}

                            </button>


                            <div class="mut">

                              Avaliação

                              <br>

                              <small>
                                da trilha
                              </small>

                            </div>

                          </div>

                        `

                        : ''
                    }


                  </div>

                </div>

              `;

            }
          )
          .join('')

      : `

          <p class="mut">

            Nenhuma trilha disponível ainda.

          </p>

        `;
}



// ============================================================
// CONCLUSÃO DA TRILHA
// ============================================================

function showTrackConclusion(id) {
  const track = arr(window.TRACKS).find(
    t => Number(t.id) === Number(id)
  );

  if (!track) {
    return alert('Trilha não encontrada.');
  }

  const allLessonsDone =
    track.lessons.length > 0 &&
    track.lessons.every(l => l.done);

  if (!allLessonsDone) {
    return alert(
      'Conclua todos os módulos da trilha primeiro.'
    );
  }

  if (
    !Array.isArray(track.conclusion) ||
    !track.conclusion.length
  ) {
    return alert(
      'Esta trilha ainda não possui uma conclusão definida.'
    );
  }

  const c = esc(
    track.color || '#58cc02'
  );

  main.innerHTML = `
    <div class="card">

      <button
        class="btn"
        onclick="home()"
      >
        ${icon('arrow-left')} Voltar às trilhas
      </button>

      <h2 style="margin-top:20px">
        ${esc(track.icon || '📚')}
        ${esc(track.title)}
      </h2>

      <div
        class="card"
        style="
          margin-top:16px;
          border-color:${c}
        "
      >

        <h3>
          ${icon('flag')} Conclusão da trilha
        </h3>

        <div class="lesson-content">
          ${track.conclusion
            .map(block)
            .join('')}
        </div>

      </div>

      ${
        track.evaluation_question
          ? `
            <button
              class="btn"
              style="
                width:100%;
                margin-top:12px;
              "
              onclick="showTrackEvaluation(${track.id})"
            >
              ${icon('square-pen')} Avaliar trilha
            </button>
          `
          : ''
      }

    </div>
  `;
}

// ============================================================
// AVALIAÇÃO DA TRILHA
// ============================================================

function showTrackEvaluation(id) {

  const track =
    arr(window.TRACKS).find(
      t => Number(t.id) === Number(id)
    );

  if (!track) {
    return alert(
      'Trilha não encontrada.'
    );
  }

  const allLessonsDone =
    track.lessons.length > 0 &&
    track.lessons.every(
      l => l.done
    );

  if (!allLessonsDone) {
    return alert(
      'Conclua todos os módulos da trilha primeiro.'
    );
  }

  if (!track.evaluation_question) {
    return alert(
      'Esta trilha ainda não possui uma avaliação.'
    );
  }

  const c =
    esc(track.color || '#58cc02');

  main.innerHTML = `
    <div class="card">

      <button
        class="btn"
        onclick="home()"
      >
        ${icon('arrow-left')} Voltar às trilhas
      </button>

      <h2 style="margin-top:20px">
        ${esc(track.icon || '📚')}
        ${esc(track.title)}
      </h2>

      <div
        class="card"
        style="
          margin-top:16px;
          border-color:${c};
          text-align:center;
        "
      >

        <h3>
          ${icon('square-pen')} Avaliação da trilha
        </h3>

        <p>
          ${esc(track.evaluation_question)}
        </p>

        <p
          class="mut"
          style="margin-top:20px"
        >
          Escolha uma nota de 1 a 5:
        </p>

        <div
          id="trackRating"
          style="
            display:flex;
            justify-content:center;
            gap:8px;
            margin:20px 0;
            flex-wrap:wrap;
          "
        >

          ${[1,2,3,4,5]
            .map(
              n => `
                <button
                  type="button"
                  class="rating-btn"
                  data-rating="${n}"
                  style="
                    font-size:28px;
                    padding:10px 14px;
                    border:2px solid var(--bd);
                    border-radius:12px;
                    background:transparent;
                    cursor:pointer;
                  "
                >
                  ${icon('star')}
                  <span
                    style="
                      display:block;
                      font-size:14px;
                      margin-top:3px;
                    "
                  >
                    ${n}
                  </span>
                </button>
              `
            )
            .join('')}

        </div>

        <div
          id="trackEvaluationSelected"
          class="mut"
          style="margin-bottom:10px"
        >
          Nenhuma nota selecionada.
        </div>

        <button
          class="btn"
          id="sendTrackEvaluation"
          style="width:100%;"
          disabled
        >
          ${icon('send')} Enviar avaliação
        </button>

        <div
          id="trackEvaluationMsg"
          class="mut"
          style="margin-top:8px"
        ></div>

      </div>

    </div>
  `;

  let selectedRating = 0;

  const ratingButtons =
    document.querySelectorAll(
      '.rating-btn'
    );

  const selected =
    document.getElementById(
      'trackEvaluationSelected'
    );

  const button =
    document.getElementById(
      'sendTrackEvaluation'
    );

  const msg =
    document.getElementById(
      'trackEvaluationMsg'
    );

  // ----------------------------------------------------------
  // SELEÇÃO DA NOTA
  // ----------------------------------------------------------

  ratingButtons.forEach(
    btn => {

      btn.onclick = () => {

        selectedRating =
          Number(
            btn.dataset.rating
          );

        ratingButtons.forEach(
          b => {
            b.style.background =
              'transparent';

            b.style.borderColor =
              'var(--bd)';
          }
        );

        btn.style.background =
          c;

        btn.style.borderColor =
          c;

        selected.innerHTML =
          `Nota selecionada: ${selectedRating} ${icon('star')}`;

        button.disabled = false;
      };
    }
  );

  // ----------------------------------------------------------
  // ENVIO
  // ----------------------------------------------------------

  button.onclick =
    async () => {

      if (
        !Number.isInteger(
          selectedRating
        ) ||
        selectedRating < 1 ||
        selectedRating > 5
      ) {
        msg.innerHTML =
          icon('triangle-alert') + ' Selecione uma nota de 1 a 5.';

        return;
      }

      button.disabled = true;

      button.innerHTML =
        icon('hourglass') + ' Enviando...';

      msg.textContent = '';

      try {

        await api(
          `/tracks/${id}/evaluation`,
          'POST',
          {
            rating:
              selectedRating
          }
        );

        msg.innerHTML =
          icon('circle-check') + ' Avaliação enviada com sucesso!';

        ratingButtons.forEach(
          b => {
            b.disabled = true;
            b.style.cursor =
              'default';
          }
        );

        button.innerHTML =
          icon('circle-check') + ' Avaliação enviada';

      } catch (e) {

        msg.innerHTML =
          icon('circle-x') + ' ' +
          esc(
            e.message ||
            'Não foi possível enviar a avaliação.'
          );

        button.disabled =
          false;

        button.innerHTML =
          icon('send') + ' Enviar avaliação';
      }
    };
}
// ============================================================
// AVISO DE BLOQUEIO
// ============================================================

function aviso(id) {
  const tracks = window.TRACKS || [];

  const t = tracks.find(
    x => x.id === id
  );

  if (!t) {
    return;
  }

  alert(
    t.locked
      ? 'Esta trilha está bloqueada.\n\n' +
        'Conclua antes: ' +
        t.missing.join(', ') +
        ''
      : 'Conclua o módulo anterior para desbloquear.'
  );
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

  const allLessonsDone =
    t.lessons.length > 0 &&
    t.lessons.every(l => l.done);

  main.innerHTML = `
    <button
      class="link"
      onclick="home()"
    >
      ${icon('arrow-left')} Voltar
    </button>

    <h2>
      ${esc(t.icon || '📚')}
      ${esc(t.title)}
    </h2>

    <div class="steps">
      <span class="pill on">
        ${icon('pin')} Apresentação
      </span>

      ${
        allLessonsDone && t.conclusion.length
          ? `
            <span class="pill">
              ${icon('flag')} Conclusão
            </span>
          `
          : ''
      }
    </div>

    ${
      t.presentation.length
        ? `
          <div class="card lesson-content">
            ${t.presentation.map(block).join('')}
          </div>
        `
        : `
          <div class="card">
            <p class="mut">
              Esta trilha ainda não possui
              uma apresentação.
            </p>
          </div>
        `
    }

    ${
      allLessonsDone && t.conclusion.length
        ? `
          <div class="card lesson-content">
            <h3>
              ${icon('flag')} Conclusão da trilha
            </h3>

            ${t.conclusion.map(block).join('')}

            ${
              t.evaluation_question
                ? `
                  <div
                    class="card"
                    style="margin-top:16px"
                  >
                    <h3>
                      ${icon('message-circle')} Avaliação
                    </h3>

                    <p>
                      ${esc(
                        t.evaluation_question
                      )}
                    </p>

                    <textarea
                        id="trackEvaluation"
                        rows="5"
                        placeholder="Digite sua avaliação..."
                      ></textarea>

                      <button
                        class="btn"
                        id="sendTrackEvaluation"
                        style="margin-top:10px"
                      >
                        ${icon('send')} Enviar avaliação
                      </button>

                      <div
                        id="trackEvaluationMsg"
                        class="mut"
                        style="margin-top:8px"
                      ></div>
                  </div>
                `
                : ''
            }
          </div>
        `
        : ''
    }

    <button
      class="btn"
      onclick="home()"
    >
      ${
        allLessonsDone
          ? 'Voltar às trilhas'
          : 'Ir para os módulos'
      }
    </button>
  `;

const sendTrackEvaluation =
  document.getElementById(
    'sendTrackEvaluation'
  );

if (sendTrackEvaluation) {

  sendTrackEvaluation.onclick =
    async () => {

      const field =
        document.getElementById(
          'trackEvaluation'
        );

      const msg =
        document.getElementById(
          'trackEvaluationMsg'
        );

      const answer =
        field.value.trim();

      if (!answer) {
        msg.innerHTML =
          icon('triangle-alert') + ' Escreva sua avaliação antes de enviar.';
        return;
      }

      sendTrackEvaluation.disabled =
        true;

      sendTrackEvaluation.textContent =
        'Enviando...';

      try {

        await api(
          `/tracks/${id}/evaluation`,
          'POST',
          {
            answer
          }
        );

        msg.innerHTML =
          icon('circle-check') + ' Avaliação da trilha enviada com sucesso!';

        field.disabled = true;

        sendTrackEvaluation.innerHTML =
          icon('circle-check') + ' Avaliação enviada';

      } catch (e) {

        msg.innerHTML =
          icon('circle-x') + ' ' +
          esc(
            e.message ||
            'Não foi possível enviar a avaliação.'
          );

        sendTrackEvaluation.disabled =
          false;

        sendTrackEvaluation.innerHTML =
          icon('send') + ' Enviar avaliação';
      }
    };
}
}

// ============================================================
// RANKING
// ============================================================

async function rank() {
  const r = await api('/ranking');

  main.innerHTML =
    '<h2>' + icon('trophy') + ' Ranking</h2>' +

    (
      r.map(
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
              ${n + 1}º
              ${esc(u.name)}

              <small class="mut">
                Nv ${u.level}
              </small>
            </span>

            <span>
              ${icon('star')} ${u.xp}
              · ${icon('flame')} ${u.streak}
            </span>

          </div>
        `
      ).join('') ||

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

  const week = arr(p.week);

  const top = Math.max(
    ...week.map(x => x.xp),
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
        ${icon('medal')} Nível ${p.level}
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
        ${icon('flame')} ${p.streak} dia(s)
        · ${icon('coins')} ${p.coins}
        · ${icon('book')} ${p.lessons} lições
        · ${icon('badge-check')} ${p.perfect} perfeitas
        · ${icon('flag')} ${p.tracks} trilhas
      </p>

      <button
        class="btn sm"
        onclick="buyHearts()"
      >
        ${icon('heart')} Recarregar vidas (30 ${icon('coins')})
      </button>

    </div>

    <h3>
      ${icon('target')} Missões de hoje
    </h3>

    ${arr(p.missions)
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
                ? icon('circle-check')
                : m.done
                  ? `
                    <button
                      class="btn sm"
                      onclick="claim('${m.code}')"
                    >
                      Resgatar +10 ${icon('coins')}
                    </button>
                  `
                  : ''
            }

          </div>
        `
      )
      .join('')}

    <h3>
      ${icon('award')} Conquistas
    </h3>

    <div class="badges">
      ${arr(p.badges)
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
      ${icon('calendar')} XP dos últimos dias
    </h3>

    <div class="week">
      ${
        week.map(
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
        ).join('') ||

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

  const badgesList = arr(p.badges);

  const n = badgesList.filter(
    b => b.got
  ).length;

  const total = badgesList.length;

  const pct = total
    ? (n / total) * 100
    : 0;

  main.innerHTML = `
    <h2>
      ${icon('award')} Conquistas
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
      ${badgesList
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
                    ? icon('circle-check') + ' Conquistada'
                    : icon('lock') + ' Bloqueada'
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
        ${
          sel
            .map(
              (x, n) => `
                <button
                  class="opt"
                  data-r="${n}"
                >
                  ${n + 1}.
                  ${esc(x.t)}
                </button>
              `
            )
            .join('')
        }
      </div>

      ${
        q.items
          .filter(x => !sel.includes(x))
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
          .join('')
      }

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
        Toque em um item e depois no
        seu par (toque no item de novo
        para desfazer):
      </p>

      ${q.left
        .map(
          l => `
            <button
              class="opt ${
                cur === l.i
                  ? 'ok'
                  : ''
              }"
              data-l="${l.i}"
            >
              ${esc(l.t)}

              ${
                map[l.i]
                  ? `
                    ${icon('arrow-right')}
                    <b>
                      ${esc(
                        map[l.i].t
                      )}
                    </b>
                  `
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
    const v =
      box.querySelector('#fa').value;

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

  box.querySelector('#fa').onkeydown = e => {
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
        x => x.replace('|', ' ↔ ')
      )
      .join(' · '),

  preencher: s =>
    'Resposta esperada: ' +
    s[0]
};

// ============================================================
// CONTEÚDO DAS LIÇÕES
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
  const value =
    String(u || '').trim();

  return /^(https?:\/\/|\/uploads\/)/i.test(
    value
  )
    ? esc(value)
    : '';
};

function block(b) {
  if (!b || typeof b !== 'object') {
    return '';
  }

  if (b.type === 'texto') {
    return `
      <div class="intro">
        ${esc(b.value || '')}
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
          ${icon('triangle-alert')} Imagem inválida.
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

  if (b.type === 'video') {
    const src = safeUrl(
      b.value
    );

    if (y) {
      return `
        <figure>

          <iframe
            src="https://www.youtube-nocookie.com/embed/${y}"
            allowfullscreen
            loading="lazy"
          ></iframe>

          ${cap}

        </figure>
      `;
    }

    if (!src) {
      return `
        <div class="card badc">
          ${icon('triangle-alert')} Vídeo inválido.
        </div>
      `;
    }

    return `
      <figure>

        <video
          src="${src}"
          controls
        ></video>

        ${cap}

      </figure>
    `;
  }

  return '';
}

// ==========================================================
// ABRIR LIÇÃO
// ==========================================================

async function openLesson(id) {

  let lesson;

  try {

    lesson = normalizeLesson(
      await api('/lessons/' + id)
    );

  } catch (e) {

    return alert(
      e.message ||
      'Não foi possível abrir o módulo.'
    );

  }

  let i = 0;
  let hits = 0;
  let combo = 0;


  // ========================================================
  // APRESENTAÇÃO DO MÓDULO
  // ========================================================

  const presentation = () => {

    main.innerHTML = `

      <button
        class="link"
        onclick="home()"
      >
        ${icon('x')} Sair
      </button>

      <div class="card">

        <div class="steps">

          <span class="pill on">
            ${icon('book-open')} Apresentação
          </span>

          <span class="pill">
            ${icon('lightbulb')} Explicação
          </span>

          <span class="pill">
            ${icon('square-pen')} Questões
          </span>

        </div>

        <h1>
          ${esc(lesson.title || 'Módulo')}
        </h1>

        ${
          lesson.description
            ? `
              <p>
                ${esc(lesson.description)}
              </p>
            `
            : `
              <p class="mut">
                Prepare-se para iniciar este módulo.
              </p>
            `
        }

        ${
          lesson.questions.length
            ? `
              <p class="mut">
                ${icon('square-pen')} Este módulo possui
                <b>${lesson.questions.length}</b>
                questão(ões).
              </p>
            `
            : `
              <p class="mut">
                Este módulo não possui questões.
              </p>
            `
        }

        <button
          id="go0"
          class="btn"
        >
          ${
            lesson.content.length
              ? 'Começar explicação ' + icon('arrow-right')
              : 'Começar módulo ' + icon('arrow-right')
          }
        </button>

      </div>

    `;

    $('go0').onclick = () => {

      if (lesson.content.length) {

        explain();

      } else if (lesson.questions.length) {

        step();

      } else {

        finish(id, lesson);

      }

    };

  };


  // ========================================================
  // EXPLICAÇÃO / CONTEÚDO
  // ========================================================

  const explain = () => {

    if (!lesson.content.length) {

      if (lesson.questions.length) {

        return step();

      }

      return finish(id, lesson);

    }

    main.innerHTML = `

      <button
        class="link"
        onclick="home()"
      >
        ${icon('x')} Sair
      </button>

      <div class="steps">

        <span class="pill">
          ${icon('book-open')} Apresentação
        </span>

        <span class="pill on">
          ${icon('lightbulb')} Explicação
        </span>

        <span class="pill">
          ${icon('square-pen')} Questões
        </span>

      </div>

      <div class="card">

        <h2>
          ${icon('lightbulb')} Explicação
        </h2>

        ${
          lesson.content
            .map(block)
            .join('')
        }

      </div>

      <button
        id="go"
        class="btn"
      >
        ${
          lesson.questions.length
            ? 'Ir para as questões ' + icon('arrow-right')
            : 'Concluir módulo ' + icon('arrow-right')
        }
      </button>

    `;

    $('go').onclick = () => {

      if (lesson.questions.length) {

        step();

      } else {

        finish(id, lesson);

      }

    };

  };


  // ========================================================
  // PASSO / PERGUNTA
  // ========================================================

  const step = () => {

    // Todas as perguntas foram respondidas
    if (
      i >= lesson.questions.length
    ) {

      return finish(
        id,
        lesson
      );

    }

    const q =
      lesson.questions[i];


    main.innerHTML = `

      <button
        class="link"
        onclick="home()"
      >
        ${icon('x')} Sair
      </button>

      <div class="row">

        <small class="mut">

          Pergunta
          ${i + 1}
          de
          ${lesson.questions.length}

        </small>

        <b>

          ${
            lesson.questions.length
              ? Math.round(
                  (
                    i /
                    lesson.questions.length
                  ) * 100
                )
              : 0
          }%

        </b>

      </div>

      <div class="bar">

        <div
          style="
            width:${
              lesson.questions.length
                ? (
                    i /
                    lesson.questions.length
                  ) * 100
                : 0
            }%
          "
        ></div>

      </div>

      <div class="steps">

        <span class="pill">
          ${icon('book-open')} Explicação
        </span>

        <span class="pill on">
          ${icon('square-pen')} Pergunta
          ${i + 1}/${lesson.questions.length}
        </span>

      </div>

      ${
        lesson.content.length
          ? `

            <details class="card">

              <summary>
                ${icon('book-open')} Rever explicação
              </summary>

              ${
                lesson.content
                  .map(block)
                  .join('')
              }

            </details>

          `
          : ''
      }

      <h2>
        ${esc(q.prompt || '')}
      </h2>

      <div id="body"></div>

      <div id="fb"></div>

    `;


    // ======================================================
    // ENVIAR RESPOSTA
    // ======================================================

    const submit = async answer => {

      let r;

      try {

        r = await api(
          `/questions/${q.id}/check`,
          'POST',
          {
            answer
          }
        );

      } catch (e) {

        alert(
          e.message ||
          'Não foi possível verificar a resposta.'
        );

        return null;

      }


      // ====================================================
      // ATUALIZA VIDAS
      // ====================================================

      if ($('hearts')) {

        $('hearts').innerHTML =
          icon('heart') + ' ' + r.hearts;

      }


      // ====================================================
      // ATUALIZA ACERTOS E COMBO
      // ====================================================

      if (r.correct) {

        hits++;
        combo++;

      } else {

        combo = 0;

      }


      // ====================================================
      // FEEDBACK
      // ====================================================

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
                ? icon('circle-check') + ' Correto!'
                : icon('circle-x') + ' Incorreto'
            }

            ${
              combo >= 3
                ? ` · ${icon('flame')} combo x${combo}!`
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

                  ${icon('lightbulb')}

                  ${esc(
                    r.explanation
                  )}

                </p>

              `
              : ''
          }

        </div>

      `;


      // ====================================================
      // VERIFICA SE FICOU SEM VIDAS
      // ====================================================

      const out =
        !r.correct &&
        r.hearts === 0 &&
        !lesson.done;


      const nb =
        document.createElement(
          'button'
        );


      nb.className =
        'btn';


      nb.textContent =
        out
          ? 'Sem vidas — voltar'
          : 'Continuar';


      nb.onclick =
        out
          ? home
          : () => {

              i++;

              // --------------------------------------------
              // ÚLTIMA PERGUNTA
              // --------------------------------------------

              if (
                i >=
                lesson.questions.length
              ) {

                return finish(
                  id,
                  lesson
                );

              }

              // --------------------------------------------
              // PRÓXIMA PERGUNTA
              // --------------------------------------------

              step();

            };


      $('fb').appendChild(
        nb
      );


      return r;

    };


    // ======================================================
    // RENDERIZA O TIPO DE QUESTÃO
    // ======================================================

    const body =
      $('body');


    if (
      q.type === 'ordenar'
    ) {

      body.appendChild(
        ordenar(
          q,
          submit
        )
      );


    } else if (
      q.type === 'associar'
    ) {

      body.appendChild(
        associar(
          q,
          submit
        )
      );


    } else if (
      q.type === 'preencher'
    ) {

      body.appendChild(
        preencher(
          q,
          submit
        )
      );


    } else {

      body.innerHTML =
        arr(q.options)
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
        .querySelectorAll(
          '.opt'
        )
        .forEach(
          b => {

            b.onclick =
              async () => {

                // Desabilita as opções
                body
                  .querySelectorAll(
                    '.opt'
                  )
                  .forEach(
                    x => {

                      x.disabled =
                        true;

                    }
                  );


                const r =
                  await submit(
                    Number(
                      b.dataset.n
                    )
                  );


                if (!r) {

                  return;

                }


                // Marca resposta correta
                body
                  .querySelectorAll(
                    '.opt'
                  )
                  .forEach(
                    x => {

                      if (
                        Number(
                          x.dataset.n
                        ) ===
                        Number(
                          r.answer
                        )
                      ) {

                        x.classList.add(
                          'ok'
                        );

                      }

                    }
                  );


                // Marca resposta errada
                if (
                  !r.correct
                ) {

                  b.classList.add(
                    'bad'
                  );

                }

              };

          }
        );

    }

  };


  // ========================================================
  // INICIA PELA APRESENTAÇÃO
  // ========================================================

  presentation();

}

// ==========================================================
// CONCLUSÃO DA LIÇÃO
// ==========================================================

const finish = async (lessonId, lesson) => {

  let r;

  try {

    r = await api(
      `/lessons/${lessonId}/complete`,
      'POST'
    );

  } catch (e) {

    alert(
      e.message ||
      'Não foi possível concluir o módulo.'
    );

    return home();
  }

  // Atualiza estatísticas
  refresh();

  // ========================================================
  // TELA DE CONCLUSÃO
  // ========================================================

  main.innerHTML = `

    <div
      class="card"
      style="text-align:center"
    >

      <h2>

        ${
          r.perfect
            ? icon('badge-check') + ' Lição perfeita!'
            : icon('party-popper') + ' Lição concluída!'
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

              ${icon('star')} +${r.gained} XP

              ·

              ${icon('coins')} +${r.coins} moedas

            </p>
          `
          : `
            <p class="mut">
              Revisão:
              sem XP extra.
            </p>
          `
      }

      <p>

        ${icon('flame')} Sequência:
        ${r.streak} dia(s)

      </p>

      ${
        r.levelUp
          ? `
            <h3>

              ${icon('medal')} Você subiu para
              o nível ${r.level}!

            </h3>
          `
          : ''
      }

      ${
        arr(r.badges)
          .map(
            b => `
              <p>

                ${icon('award')} Nova conquista:

                ${b.icon}

                <b>
                  ${esc(b.name)}
                </b>

              </p>
            `
          )
          .join('')
      }

    </div>


    <!-- ================================================== -->
    <!-- CONCLUSÃO DO MÓDULO -->
    <!-- ================================================== -->

    ${
      Array.isArray(
        lesson.conclusion
      ) &&
      lesson.conclusion.length
        ? `
          <div
            class="card lesson-content"
            style="margin-top:16px;"
          >

            <h3>
              ${icon('flag')} Conclusão do módulo
            </h3>

            ${lesson.conclusion
              .map(block)
              .join('')}

          </div>
        `
        : ''
    }


    <!-- ================================================== -->
    <!-- AVALIAÇÃO DO MÓDULO -->
    <!-- ================================================== -->

    ${
      lesson.evaluation_question
        ? `
          <div
            class="card"
            style="margin-top:16px;"
          >

            <h3>
              ${icon('star')} Avaliação do módulo
            </h3>

            <p>
              ${esc(
                lesson.evaluation_question
              )}
            </p>

            <p
              class="mut"
              style="
                text-align:center;
                margin-top:20px;
              "
            >
              Escolha uma nota de 1 a 5:
            </p>

            <div
              id="lessonRating"
              style="
                display:flex;
                justify-content:center;
                align-items:center;
                gap:8px;
                margin:20px 0;
                flex-wrap:wrap;
              "
            >

              ${
                [1, 2, 3, 4, 5]
                  .map(
                    n => `
                      <button
                        type="button"
                        class="lesson-rating-btn"
                        data-rating="${n}"
                        style="
                          font-size:28px;
                          padding:10px 14px;
                          border:2px solid var(--bd);
                          border-radius:12px;
                          background:transparent;
                          cursor:pointer;
                          transition:0.2s;
                        "
                      >

                        ${icon('star')}

                        <span
                          style="
                            display:block;
                            font-size:14px;
                            margin-top:3px;
                          "
                        >
                          ${n}
                        </span>

                      </button>
                    `
                  )
                  .join('')
              }

            </div>

            <div
              id="lessonEvaluationSelected"
              class="mut"
              style="
                text-align:center;
                margin-bottom:10px;
              "
            >
              Nenhuma nota selecionada.
            </div>

            <button
              class="btn"
              id="sendLessonEvaluation"
              style="
                margin-top:10px;
                width:100%;
              "
              disabled
            >
              ${icon('send')} Enviar avaliação
            </button>

            <div
              id="lessonEvaluationMsg"
              class="mut"
              style="
                margin-top:8px;
                text-align:center;
              "
            ></div>

          </div>
        `
        : ''
    }


    <!-- ================================================== -->
    <!-- VOLTAR -->
    <!-- ================================================== -->

    <button
      class="btn"
      onclick="home()"
      style="
        width:100%;
        margin-top:16px;
      "
    >
      Voltar às trilhas
    </button>

  `;


  // ========================================================
  // CONTROLE DAS ESTRELAS
  // ========================================================

  let selectedRating = 0;

  const ratingButtons =
    document.querySelectorAll(
      '.lesson-rating-btn'
    );

  const selected =
    document.getElementById(
      'lessonEvaluationSelected'
    );

  const sendButton =
    document.getElementById(
      'sendLessonEvaluation'
    );

  const msg =
    document.getElementById(
      'lessonEvaluationMsg'
    );


  // Se não existe avaliação configurada,
  // não há nada para configurar.

  if (
    !ratingButtons.length ||
    !selected ||
    !sendButton ||
    !msg
  ) {
    return;
  }


  // ========================================================
  // SELECIONAR NOTA
  // ========================================================

  ratingButtons.forEach(
    btn => {

      btn.onclick =
        () => {

          selectedRating =
            Number(
              btn.dataset.rating
            );

          ratingButtons.forEach(
            b => {

              b.style.background =
                'transparent';

              b.style.borderColor =
                'var(--bd)';

            }
          );

          btn.style.background =
            '#58cc02';

          btn.style.borderColor =
            '#58cc02';

          selected.innerHTML =
            `Nota selecionada: ${selectedRating} ${icon('star')}`;

          sendButton.disabled =
            false;

        };

    }
  );


  // ========================================================
  // ENVIAR AVALIAÇÃO
  // ========================================================

  sendButton.onclick =
    async () => {

      if (
        !Number.isInteger(
          selectedRating
        ) ||
        selectedRating < 1 ||
        selectedRating > 5
      ) {

        msg.innerHTML =
          icon('triangle-alert') + ' Selecione uma nota de 1 a 5.';

        return;
      }

      sendButton.disabled =
        true;

      sendButton.innerHTML =
        icon('hourglass') + ' Enviando...';

      msg.textContent = '';

      try {

        await api(
          `/lessons/${lessonId}/evaluation`,
          'POST',
          {
            rating:
              selectedRating
          }
        );

        msg.innerHTML =
          icon('circle-check') + ' Avaliação enviada com sucesso!';

        ratingButtons.forEach(
          b => {

            b.disabled =
              true;

            b.style.cursor =
              'default';

          }
        );

        sendButton.innerHTML =
          icon('circle-check') + ' Avaliação enviada';

      } catch (e) {

        msg.innerHTML =
          icon('circle-x') + ' ' +
          esc(
            e.message ||
            'Não foi possível enviar a avaliação.'
          );

        sendButton.disabled =
          false;

        sendButton.innerHTML =
          icon('send') + ' Enviar avaliação';
      }

    };

};   // <-- FECHA O finish()

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
  '<button class="link" onclick="gestao()">' +
  icon('arrow-left') +
  ' Gestão financeira</button>';

async function mesAtual() {
  const es =
    (
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
      icon('receipt'),
      'Gastos do mês',
      'Registre receitas e gastos e veja para onde vai seu dinheiro',
      'gastos()'
    ],

    [
      icon('trending-up'),
      'Simulador',
      'Veja seu dinheiro crescer com rendimento, receitas e gastos',
      'sim()'
    ],

    [
      icon('life-buoy'),
      'Reserva de emergência',
      'Descubra quanto guardar para os imprevistos',
      'reserva()'
    ],

    [
      icon('ruler'),
      'Regra 50/30/20',
      'Divida sua renda entre necessidades, desejos e poupança',
      'regra()'
    ]
  ];

  main.innerHTML = `
    <h2>
      ${icon('briefcase')} Gestão financeira
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

let GM =
  hojeStr().slice(0, 7);

async function gastos(m) {
  if (
    typeof m === 'string' &&
    m
  ) {
    GM = m;
  }

  const {
    entries: es
  } = await api(
    '/finance?month=' + GM
  );

  const soma = k =>
    es
      .filter(e => e.kind === k)
      .reduce(
        (t, e) => t + e.amount,
        0
      );

  const rec = soma('receita');
  const gas = soma('gasto');

  const saldo = rec - gas;

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

  const cats =
    Object.entries(por).sort(
      (a, b) => b[1] - a[1]
    );

  const dia =
    GM === hojeStr().slice(0, 7)
      ? hojeStr()
      : GM + '-01';

  main.innerHTML = `
    ${voltar}

    <h2>
      ${icon('receipt')} Gastos do mês
    </h2>

    <div class="row">

      <button
        class="btn sm sec"
        onclick="gastos('${shiftMes(
          GM,
          -1
        )}')"
      >
        ${icon('arrow-left')}
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
        ${icon('arrow-right')}
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
        ${icon('plus')} Novo lançamento
      </h3>

      <select
        id="lk"
        onchange="catsLanc()"
      >
        <option value="gasto">
          ${icon('trending-down')} Gasto
        </option>

        <option value="receita">
          ${icon('trending-up')} Receita
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
                              (v / gas) * 100
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
                            ? (v / gas) * 100
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
                    ? icon('trending-down')
                    : icon('trending-up')
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
                  ${icon('x')}
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
  const v =
    num($('lv').value);

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
        kind:
          $('lk').value,

        category:
          $('lc').value,

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

const delLanc =
  async id => {
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
          ${icon('x')}
        </button>

      </div>
    `
  );
}

function sim() {
  main.innerHTML = `
    ${voltar}

    <h2>
      ${icon('trending-up')} Simulador financeiro
    </h2>

    <p class="mut">
      Veja como seu dinheiro evolui com receitas,
      gastos e rendimento, e quando você chega à
      sua meta.
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
        ${icon('banknote')} Receitas mensais
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
        ${icon('receipt')} Gastos mensais
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
      ${icon('download')} Importar do meu mês atual
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

  const line = k =>
    `
      <polyline
        fill="none"
        stroke="${
          k === 'a'
            ? '#58cc02'
            : '#1cb0f6'
        }"
        stroke-width="3"
        points="
          ${
            pts
              .map(
                p =>
                  X(p.m).toFixed(1) +
                  ',' +
                  Y(p[k]).toFixed(1)
              )
              .join(' ')
          }
        "
      />
    `;

  const metaTxt =
    !meta
      ? ''
      : mesMeta === null
        ? `
          <p class="err">
            ${icon('target')} Com esses números,
            você não chega a
            ${brl(meta)}
            em ${anos} ano(s).
          </p>
        `
        : `
          <p style="color:var(--g)">
            <b>
              ${icon('target')} Meta de ${brl(meta)}
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
        Valor em poder de compra
        de hoje
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
              ${icon('triangle-alert')} Com esses gastos,
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
          {
            length: anos
          },
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
      taxa constante,
      sem impostos e sem tarifas.
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
      ${icon('life-buoy')} Reserva de emergência
    </h2>

    <p class="mut">
      A reserva cobre imprevistos,
      como perda de renda ou problemas
      de saúde. O comum é guardar de
      3 a 12 meses dos seus gastos.
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
    const {
      gas
    } = await mesAtual();

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

  const pct =
    alvo
      ? Math.min(
          100,
          Math.round(
            (tem / alvo) * 100
          )
        )
      : 0;

  const prazo =
    !alvo
      ? 'Informe seu gasto mensal.'
      : falta === 0
        ? 'Você já atingiu a reserva! ' + icon('party-popper')
        : mes
          ? `
            Guardando ${brl(mes)}
            por mês, você completa
            em
            ${Math.ceil(
              falta / mes
            )}
            mês(es).
          `
          : `
            Informe quanto consegue
            guardar por mês para ver
            o prazo.
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
        Você tem
        ${brl(tem)}
        (${pct}%).

        Falta
        ${brl(falta)}.
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
      ${icon('ruler')} Regra 50/30/20
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

    window.REGRA =
      m.es;

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
    (
      window.REGRA || []
    ).filter(
      e => e.kind === 'gasto'
    );

  const tem =
    es.length > 0;

  const s = L =>
    es
      .filter(
        e =>
          L.includes(
            e.category
          )
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

  const linha = (
    nome,
    p,
    real
  ) => `
    <div class="card">

      <div class="row">

        <b>
          ${nome}
        </b>

        <span>
          ideal: ${p}%
          ·
          ${brl(
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
              (
              ${
                r
                  ? Math.round(
                      (real / r) *
                      100
                    )
                  : 0
              }%
              )
            </small>
          `
          : ''
      }

    </div>
  `;

  $('res').innerHTML =
    linha(
      icon('house') + ' Necessidades',
      50,
      nec
    ) +

    linha(
      icon('party-popper') + ' Desejos',
      30,
      des
    ) +

    linha(
      icon('piggy-bank') + ' Poupança e dívidas',
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
// PAINEL DE DÚVIDAS (CHAT)
// ============================================================

const ROLE_LABEL = {
  adm: 'Administrador',
  professor: 'Professor',
  comum: 'Aluno'
};

const fmtDoubtDate = iso => {
  const d = new Date(iso);

  return isNaN(d)
    ? ''
    : d.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
};

let doubtsTrackFilter = '';

function doubtBubble(m, reply) {
  const staffAuthor = m.author.role !== 'comum';

  return `
    <div style="
      margin-top:8px;
      ${reply ? 'margin-left:18px;' : ''}
      padding:10px 12px;
      border-radius:12px;
      border:1px solid ${staffAuthor ? '#58cc02' : 'var(--bd)'};
    ">
      <div style="
        display:flex;
        gap:8px;
        align-items:center;
        flex-wrap:wrap;
      ">
        <b>${esc(m.author.name)}</b>
        ${
          staffAuthor
            ? `<span class="mut" style="font-size:12px">
                 · ${esc(ROLE_LABEL[m.author.role] || '')}
               </span>`
            : ''
        }
        <span class="mut" style="font-size:12px">
          ${esc(fmtDoubtDate(m.created_at))}
        </span>
        ${
          m.can_delete
            ? `<button
                 class="btn sm red"
                 style="margin-left:auto"
                 onclick="delDoubt(${m.id})"
               >${icon('trash-2')}</button>`
            : ''
        }
      </div>
      <div style="
        margin-top:6px;
        white-space:pre-wrap;
        word-break:break-word;
      ">${esc(m.body)}</div>
    </div>
  `;
}

async function doubts() {
  main.innerHTML =
    '<div class="card"><p class="mut">Carregando dúvidas…</p></div>';

  let data;

  try {
    const q = doubtsTrackFilter
      ? '?track_id=' + encodeURIComponent(doubtsTrackFilter)
      : '';

    data = await api('/doubts' + q);
  } catch (e) {
    main.innerHTML = `
      <div class="card">
        <p>${icon('circle-x')} ${esc(e.message || 'Não foi possível carregar as dúvidas.')}</p>
        <button class="btn" onclick="home()">Voltar</button>
      </div>`;
    return;
  }

  const list = arr(data.doubts);
  const tracks = arr(data.tracks);
  const staffUser = ['adm', 'professor'].includes(me()?.role);

  const trackOptions = tracks
    .map(
      t => `<option value="${t.id}">${esc(t.title)}</option>`
    )
    .join('');

  main.innerHTML = `
    <div class="card">
      <h2>${icon('message-square')} Painel de dúvidas</h2>
      <p class="mut">
        ${
          staffUser
            ? 'Responda as dúvidas dos alunos. Você pode excluir mensagens inadequadas.'
            : 'Tem alguma dúvida? Escreva aqui e um professor vai responder.'
        }
      </p>

      <textarea
        id="doubtText"
        maxlength="1000"
        rows="3"
        placeholder="Escreva sua dúvida…"
        style="width:100%;margin-top:8px"
      ></textarea>

      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <select id="doubtTrack" style="width:auto">
          <option value="">Sem trilha específica</option>
          ${trackOptions}
        </select>
        <button class="btn" onclick="sendDoubt()">${icon('send')} Enviar dúvida</button>
      </div>
      <div id="doubtMsg" class="mut" style="margin-top:6px"></div>
    </div>

    <div class="card" style="margin-top:12px">
      <label class="mut">Filtrar por trilha:</label>
      <select id="doubtFilter" style="width:auto" onchange="filterDoubts(this.value)">
        <option value="">Todas</option>
        ${trackOptions}
      </select>
    </div>

    ${
      list.length
        ? list
            .map(
              d => `
        <div class="card" style="margin-top:12px">
          <div class="mut" style="font-size:12px">
            ${d.track_title ? icon('library') + ' ' + esc(d.track_title) + ' · ' : ''}
            ${d.answered ? icon('circle-check') + ' Respondida' : icon('hourglass') + ' Aguardando resposta'}
          </div>

          ${doubtBubble(d, false)}
          ${arr(d.replies).map(r => doubtBubble(r, true)).join('')}

          ${
            staffUser || d.mine
              ? `<div style="display:flex;gap:8px;margin-top:10px">
                   <input
                     id="reply-${d.id}"
                     maxlength="1000"
                     placeholder="${staffUser ? 'Responder…' : 'Adicionar mensagem…'}"
                     style="flex:1"
                   >
                   <button class="btn sm" onclick="sendReply(${d.id})">Enviar</button>
                 </div>`
              : ''
          }
        </div>`
            )
            .join('')
        : '<div class="card" style="margin-top:12px"><p class="mut">Nenhuma dúvida por aqui ainda.</p></div>'
    }

    <button class="btn" onclick="home()" style="width:100%;margin-top:16px">
      Voltar às trilhas
    </button>
  `;

  const filter = document.getElementById('doubtFilter');

  if (filter) {
    filter.value = doubtsTrackFilter;
  }
}

function filterDoubts(value) {
  doubtsTrackFilter = value;
  doubts();
}

async function sendDoubt() {
  const text = document.getElementById('doubtText');
  const track = document.getElementById('doubtTrack');
  const msg = document.getElementById('doubtMsg');

  if (!text.value.trim()) {
    msg.innerHTML = icon('triangle-alert') + ' Escreva sua dúvida.';
    return;
  }

  try {
    await api('/doubts', 'POST', {
      body: text.value,
      track_id: track.value || null
    });

    await doubts();
  } catch (e) {
    msg.innerHTML = icon('circle-x') + ' ' + esc(e.message || 'Não foi possível enviar.');
  }
}

async function sendReply(id) {
  const input = document.getElementById('reply-' + id);

  if (!input || !input.value.trim()) {
    return;
  }

  try {
    await api(`/doubts/${id}/replies`, 'POST', {
      body: input.value
    });

    await doubts();
  } catch (e) {
    alert(e.message || 'Não foi possível enviar a resposta.');
  }
}

async function delDoubt(id) {
  if (!confirm('Excluir esta mensagem? Se for uma dúvida, as respostas também serão excluídas.')) {
    return;
  }

  try {
    await api(`/doubts/${id}`, 'DELETE');
    await doubts();
  } catch (e) {
    alert(e.message || 'Não foi possível excluir.');
  }
}

// ============================================================
// NAVEGAÇÃO: HISTÓRICO E BOTÃO VOLTAR
// ============================================================
// Cada tela (trilhas, perfil, ranking, dúvidas...) entra num
// histórico. O botão "← Voltar" aparece no topo do conteúdo e
// leva à tela anterior. Durante uma lição ele não aparece, para
// ninguém sair no meio sem querer; a lição tem os próprios botões.

(function () {
  const VIEWS = [
    'home',
    'badges',
    'profile',
    'rank',
    'gestao',
    'doubts',
    'gastos',
    'sim',
    'reserva',
    'regra',
    'showTrack',
    'showTrackConclusion',
    'showTrackEvaluation'
  ];

  const LESSON_VIEWS = ['openLesson'];

  const stack = [];
  const originals = {};
  let replaying = false;

  // Qual botão do menu representa cada tela.
  const NAV_FOR = {
    home: 'home',
    showTrack: 'home',
    showTrackConclusion: 'home',
    showTrackEvaluation: 'home',
    openLesson: 'home',
    badges: 'badges',
    profile: 'profile',
    rank: 'rank',
    doubts: 'doubts',
    gestao: 'gestao',
    gastos: 'gestao',
    sim: 'gestao',
    reserva: 'gestao',
    regra: 'gestao'
  };

  // Destaca só o botão da tela atual (antes "Trilhas" ficava fixo).
  function setActiveNav(viewName) {
    const target = NAV_FOR[viewName];

    document
      .querySelectorAll('.app-navigation-main .app-nav-button')
      .forEach(button => {
        const isCurrent =
          button.getAttribute('onclick') === target + '()';

        button.classList.toggle('active', isCurrent);

        if (isCurrent) {
          button.setAttribute('aria-current', 'page');
        } else {
          button.removeAttribute('aria-current');
        }
      });
  }

  const sameEntry = (a, b) => {
    if (!a || !b || a.name !== b.name) return false;

    try {
      return JSON.stringify(a.args) === JSON.stringify(b.args);
    } catch {
      return false;
    }
  };

  function push(entry) {
    // Telas transitórias (lição) não voltam a ser abertas.
    while (stack.length && stack[stack.length - 1].transient) {
      stack.pop();
    }

    // "Trilhas" é a raiz: recomeça o histórico.
    if (entry.name === 'home') {
      stack.length = 0;
    }

    if (!sameEntry(stack[stack.length - 1], entry)) {
      stack.push(entry);
    }
  }

  function wrap(name, transient) {
    const original = window[name];

    if (typeof original !== 'function') return;

    originals[name] = original;

    window[name] = function (...args) {
      if (!replaying) {
        push({ name, args, transient });
      }

      setActiveNav(name);

      return original.apply(this, args);
    };
  }

  VIEWS.forEach(name => wrap(name, false));
  LESSON_VIEWS.forEach(name => wrap(name, true));

  window.goBack = function () {
    // Descarta a tela atual e as lições que ficaram para trás.
    stack.pop();

    while (stack.length && stack[stack.length - 1].transient) {
      stack.pop();
    }

    const target = stack[stack.length - 1];

    if (!target) {
      return originals.home ? originals.home() : undefined;
    }

    replaying = true;
    setActiveNav(target.name);

    try {
      return originals[target.name](...target.args);
    } finally {
      replaying = false;
    }
  };

  // ----------------------------------------------------------
  // BOTÃO "← VOLTAR" NO TOPO DO CONTEÚDO
  // ----------------------------------------------------------

  const backButton = document.createElement('button');

  backButton.type = 'button';
  backButton.className = 'link';
  backButton.innerHTML = icon('arrow-left') + ' Voltar';
  backButton.style.marginBottom = '12px';
  backButton.setAttribute(
    'aria-label',
    'Voltar para a página anterior'
  );
  backButton.addEventListener('click', () => window.goBack());

  function syncBackButton() {
    const current = stack[stack.length - 1];

    const show =
      stack.length > 1 &&
      !!current &&
      !current.transient;

    if (show) {
      if (main.firstElementChild !== backButton) {
        main.prepend(backButton);
      }
    } else if (backButton.parentNode === main) {
      backButton.remove();
    }
  }

  // Cada tela redesenha o #main; o botão é recolocado a cada vez.
  new MutationObserver(syncBackButton).observe(main, {
    childList: true
  });
})();

// ============================================================
// INICIALIZAÇÃO
// ============================================================

home();