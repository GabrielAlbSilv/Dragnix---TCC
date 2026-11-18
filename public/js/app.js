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

// Regras de negócio (GET /api/regras): % do XP ao refazer, custo das vidas...
window.DGX_REGRAS = null;
api('/regras').then(r => { window.DGX_REGRAS = r.regras; }).catch(() => {});

// % do XP numa nova tentativa de um módulo já concluído N vezes
const percentualRevisao = vezes => {
  const rep = window.DGX_REGRAS?.xp?.repeticao || [50, 30, 20];
  return vezes <= 1 ? rep[0] : vezes === 2 ? rep[1] : rep[2];
};

const setStats = d => {
  if ($('lvl') && d.level_name) {
    $('lvl').title = `Nível ${d.level} — ${d.level_name}`;
  }

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
  return api('/tracks').then(d => {
    setStats(d);

    if (Array.isArray(d.tracks)) {
      window.TRACKS = d.tracks.map(normalizeTrack);
    }

    return d;
  });
};



/* ============================================================
   DRAGNIX — DESAFIOS DO ALUNO
   ============================================================ */

const studentChallenges = new Map();
let challengeTimer = null;
let challengeBusy = false;

function challengeStopTimer() {
  if (challengeTimer !== null) {
    clearInterval(challengeTimer);
    challengeTimer = null;
  }
}

function challengeOverlay(html) {
  challengeStopTimer();

  document.getElementById('studentChallengeOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'studentChallengeOverlay';
  overlay.className = 'student-challenge-overlay';

  overlay.innerHTML = `
    <div class="student-challenge-dialog"
         role="dialog"
         aria-modal="true"
         aria-label="Desafio da trilha">
      <button class="student-challenge-close"
              type="button"
              aria-label="Fechar"
              onclick="challengeClose()">×</button>
      <div id="studentChallengeContent">
        ${html}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function challengeClose() {
  challengeStopTimer();
  document.getElementById('studentChallengeOverlay')?.remove();
}


async function challengeGet(trackId, force = false) {
  if (!force && studentChallenges.has(trackId)) {
    return studentChallenges.get(trackId);
  }

  try {
    const data = await api(
      `/tracks/${Number(trackId)}/challenges`
    );

    const challenges = Array.isArray(data.challenges)
      ? data.challenges
      : [];

    studentChallenges.set(trackId, challenges);

    return challenges;
  } catch (error) {
    console.error(
      `Erro ao carregar desafios da trilha ${trackId}:`,
      error
    );

    throw error;
  }
}



async function challengeOpen(trackId, challengeId) {
  if (challengeBusy) return;

  challengeOverlay((window.dgxCarregando ? window.dgxCarregando.html('Carregando desafio…') : '<p>Carregando desafio…</p>'));

  try {
    const challenges = await challengeGet(trackId, true);

    const challenge = challenges.find(
      item => Number(item.id) === Number(challengeId)
    );

    if (!challenge) {
      throw new Error(
        'Este desafio não está disponível.'
      );
    }

    const typeNames = {
      tempo: '⚡ Contra o tempo',
      precisao: '🎯 Precisão',
      quebra_cabeca: '🧩 Quebra-cabeça',
      resistencia: '🔥 Resistência'
    };

    const completed = Boolean(challenge.completed);
    const remaining = Number(challenge.remaining ?? 0);
    const active = Boolean(challenge.active);

    challengeOverlay(`
      <div class="student-challenge-intro">
        <div class="student-challenge-hero-icon">
          ${completed ? '🏆' : '🎮'}
        </div>

        <span class="student-challenge-kicker">
          ${esc(typeNames[challenge.type] || 'Desafio especial')}
        </span>

        <h2>${esc(challenge.title)}</h2>

        <p>${esc(challenge.description || '')}</p>

        <div class="student-challenge-rewards">
          <div>
            ${icon('star')}
            <strong>
              ${Number(challenge.xp_reward || 0)
                .toLocaleString('pt-BR')}
            </strong>
            <small>XP</small>
          </div>

          <div>
            ${icon('target')}
            <strong>${remaining}</strong>
            <small>Tentativas restantes</small>
          </div>

          ${
            challenge.type === 'tempo'
              ? `
                <div>
                  ${icon('timer')}
                  <strong>
                    ${Number(challenge.time_limit)}s
                  </strong>
                  <small>Tempo</small>
                </div>
              `
              : ''
          }
        </div>

        <div class="student-challenge-achievement">
          ${icon(challenge.badge_icon || 'trophy')}

          <div>
            <strong>
              ${esc(challenge.badge_name || 'Conquista especial')}
            </strong>
            <small>
              ${esc(challenge.badge_description || '')}
            </small>
          </div>
        </div>

        ${
          completed
            ? `
              <p class="student-challenge-success">
                🏆 Você já conquistou esta recompensa!
              </p>
            `
            : !active && remaining <= 0
              ? `
                <p class="student-challenge-warning">
                  Você esgotou suas tentativas.
                </p>
              `
              : `
                <p class="mut">
                  Este desafio é opcional.
                  Suas tentativas e recompensas são
                  registradas individualmente.
                </p>
              `
        }

       <div class="student-challenge-buttons">
            ${
              !completed && (remaining > 0 || active)
                ? `
                  <button
                    type="button"
                    class="btn"
                    onclick="challengeStart(${Number(trackId)}, ${Number(challengeId)})"
                  >
                    ${active ? 'Continuar tentativa' : 'Iniciar desafio'}
                  </button>
                `
                : ''
            }

            <button
              type="button"
              class="btn sm"
              onclick="challengeClose()"
            >
              Voltar à trilha
            </button>
          </div>
    `);

  } catch (error) {
    challengeShowError(error);
  }
}


/* ============================================================
   DRAGNIX — EXECUÇÃO DOS DESAFIOS MULTITIPOS
============================================================ */

const CHALLENGE_PLAY_TYPES = {
  tempo: {
    icon: '⚡',
    name: 'Contra o tempo'
  },
  precisao: {
    icon: '🎯',
    name: 'Precisão'
  },
  quebra_cabeca: {
    icon: '🧩',
    name: 'Quebra-cabeça'
  },
  resistencia: {
    icon: '🔥',
    name: 'Resistência'
  }
};

async function challengeStart(trackId, challengeId) {
  if (challengeBusy) return;

  challengeBusy = true;

  challengeOverlay(`
    <div class="student-challenge-loading">
      ${icon('loader-circle')}
      <p>Preparando desafio...</p>
    </div>
  `);

  try {
    const data = await api(
      `/challenges/${Number(challengeId)}/start`,
      'POST'
    );

    challengeShowQuestion(trackId, challengeId, data);
  } catch (error) {
    challengeShowError(error);
  } finally {
    challengeBusy = false;
  }
}

function challengeShowQuestion(trackId, challengeId, data) {
  const type = data.type || 'tempo';
  const typeInfo = CHALLENGE_PLAY_TYPES[type] || {
    icon: '🏆',
    name: 'Desafio especial'
  };

  const options = Array.isArray(data.options)
    ? data.options
    : Array.isArray(data.question?.options)
      ? data.question.options
      : [];

  const questionText =
    typeof data.question === 'string'
      ? data.question
      : data.question?.prompt || '';

  const questionType = data.question?.question_type || 'multipla';

  const puzzle = questionType === 'ordenar';
  const timed = type === 'tempo';
  const attemptId = Number(data.attempt_id);

  
if (!['multipla', 'ordenar'].includes(questionType)) {
  challengeShowError(
    new Error('Tipo de questão não reconhecido.')
  );
  return;
}

if (type === 'quebra_cabeca' && questionType !== 'ordenar') {
  challengeShowError(
    new Error('O quebra-cabeça precisa de uma questão de ordenação.')
  );
  return;
}

if (type !== 'quebra_cabeca' && questionType !== 'multipla') {
  challengeShowError(
    new Error('Este desafio precisa de uma questão de múltipla escolha.')
  );
  return;
}


  if (!Number.isSafeInteger(attemptId) || attemptId <= 0) {
    challengeShowError(
      new Error('Identificador da tentativa inválido.')
    );
    return;
  }

  if (!options.length || !questionText) {
    challengeShowError(
      new Error('A questão não foi recebida corretamente.')
    );
    return;
  }

  let selected = null;
  let submitted = false;
  let puzzleOrder = [];

  const deadline = Number(data.deadline_at);
  const serverTime = Number(data.server_time);

  const hasClock =
    timed &&
    Number.isFinite(deadline) &&
    Number.isFinite(serverTime);

  const offset = hasClock
    ? serverTime - Date.now()
    : 0;

  const totalMs = hasClock
    ? Math.max(1, deadline - serverTime)
    : 1;

  const currentQuestion =
    Number(data.current_question ?? 0) + 1;

  const mistakes = Number(data.mistakes || 0);
  const tempoErrorsRemaining =
  Math.max(0, 3 - mistakes);
  const livesRemaining =
    data.lives_remaining == null
      ? null
      : Number(data.lives_remaining);

  challengeOverlay(`
    <div class="student-challenge-play">

      <div class="student-challenge-play-header">
        <span>
          ${typeInfo.icon}
          ${esc(typeInfo.name.toUpperCase())}
        </span>

        ${
          hasClock
            ? `<strong id="challengeClock">--:--</strong>`
            : `<strong>Questão ${currentQuestion}</strong>`
        }
      </div>

      ${
        hasClock
          ? `
            <div class="student-challenge-progress">
              <div id="challengeProgressBar"></div>
            </div>
          `
          : ''
      }

      ${
        type === 'resistencia'
          ? `
            <p class="mut">
              ❤️ Vidas restantes:
              <strong>${Math.max(0, livesRemaining ?? 0)}</strong>
              · Erros: ${mistakes}
            </p>
          `
          : ''
      }

      ${
        type === 'precisao'
          ? `
            <p class="mut">
              🎯 Acerte todas as questões.
              Um erro encerra a tentativa.
            </p>
          `
          : ''
      }
      ${
          timed
            ? `
              <p class="mut">
                ⚡ Erros: <strong>${mistakes}/3</strong>
                · Restantes:
                <strong>${tempoErrorsRemaining}</strong>
              </p>
            `
            : ''
        }

      <h2>${esc(questionText)}</h2>

      ${
        puzzle
          ? `
            <p class="student-challenge-hint">
              Toque nos itens na ordem correta.
              Toque novamente em um item selecionado
              para removê-lo da sequência.
            </p>

            <div
              id="challengePuzzleSelected"
              class="student-challenge-options"
            ></div>

            <p class="mut">Itens disponíveis</p>
          `
          : ''
      }

      <div
        id="challengeOptions"
        class="student-challenge-options"
      ></div>

      <p
        class="student-challenge-hint"
        id="challengeHint"
      >
        ${
          puzzle
            ? 'Organize todos os itens para confirmar.'
            : timed
              ? 'Escolha uma alternativa antes do tempo acabar.'
              : 'Selecione uma alternativa e confirme.'
        }
      </p>

      <button
        type="button"
        class="btn student-challenge-submit"
        id="challengeSubmit"
        disabled
      >
        Confirmar resposta
      </button>

    </div>
  `);

  const content = document.getElementById(
    'studentChallengeContent'
  );

  const optionsBox = content.querySelector(
    '#challengeOptions'
  );

  const submitButton = content.querySelector(
    '#challengeSubmit'
  );

  function renderOptions() {
    if (submitted) return;

    if (puzzle) {
      const selectedBox = content.querySelector(
        '#challengePuzzleSelected'
      );

      selectedBox.innerHTML = puzzleOrder.length
        ? puzzleOrder.map((index, position) => `
            <button
              type="button"
              class="student-challenge-option selected"
              data-puzzle-remove="${position}"
            >
              <strong>${position + 1}.</strong>
              <span>${esc(options[index])}</span>
              <span>×</span>
            </button>
          `).join('')
        : `
            <p class="mut">
              Nenhum item selecionado.
            </p>
          `;

      selectedBox.querySelectorAll(
        '[data-puzzle-remove]'
      ).forEach(button => {
        button.onclick = () => {
          puzzleOrder.splice(
            Number(button.dataset.puzzleRemove),
            1
          );
          renderOptions();
        };
      });

      optionsBox.innerHTML = options.map(
        (option, index) => {
          if (puzzleOrder.includes(index)) return '';

          return `
            <button
              type="button"
              class="student-challenge-option"
              data-puzzle-add="${index}"
            >
              <span>${esc(option)}</span>
            </button>
          `;
        }
      ).join('');

      optionsBox.querySelectorAll(
        '[data-puzzle-add]'
      ).forEach(button => {
        button.onclick = () => {
          puzzleOrder.push(
            Number(button.dataset.puzzleAdd)
          );
          renderOptions();
        };
      });

      submitButton.disabled =
        puzzleOrder.length !== options.length;

      return;
    }

    optionsBox.innerHTML = options.map(
      (option, index) => `
        <button
          type="button"
          class="student-challenge-option
            ${selected === index ? 'selected' : ''}"
          data-challenge-option="${index}"
        >
          <span class="student-challenge-option-letter">
            ${String.fromCharCode(65 + index)}
          </span>
          <span>${esc(option)}</span>
        </button>
      `
    ).join('');

    optionsBox.querySelectorAll(
      '[data-challenge-option]'
    ).forEach(button => {
      button.onclick = () => {
        selected = Number(
          button.dataset.challengeOption
        );
        renderOptions();
      };
    });

    submitButton.disabled = selected === null;
  }

  async function submitAnswer() {
    if (submitted || challengeBusy) return;

    if (puzzle && puzzleOrder.length !== options.length) {
      return;
    }

    if (!puzzle && selected === null) {
      return;
    }

    submitted = true;
    challengeBusy = true;
    challengeStopTimer();

    submitButton.disabled = true;
    submitButton.textContent = 'Verificando...';

    const body = puzzle
      ? { selected_order: [...puzzleOrder] }
      : { selected_answer: selected };

    try {
      const result = await api(
        `/challenges/attempts/${attemptId}/answer`,
        'POST',
        body
      );

      studentChallenges.delete(trackId);

     if (result.status === 'in_progress') {
          if (type === 'tempo') {
            // Avança diretamente para a próxima pergunta.
            // O prazo continua sendo o mesmo.
            challengeShowQuestion(
              trackId,
              challengeId,
              result
            );
          } else {
            challengeShowProgress(
              trackId,
              challengeId,
              result
            );
          }
        } else {
          challengeShowResult(trackId, result);
        }

    } catch (error) {
      if (error.status === 409) {
        challengeShowError(
          new Error(
            'Esta tentativa já foi encerrada. ' +
            'Volte à trilha para consultar o desafio.'
          )
        );
      } else {
        // A resposta pode não ter chegado ao servidor.
        // Não reenviar automaticamente para evitar
        // duplicação ou avanço indevido.
        challengeShowError(error);
      }
    } finally {
      challengeBusy = false;
    }
  }

  submitButton.onclick = submitAnswer;

  renderOptions();

  if (!timed) {
    return;
  }

  if (!hasClock) {
    challengeShowError(
      new Error('O servidor não informou o prazo do desafio.')
    );
    return;
  }

  function updateClock() {
    if (submitted) return;

    const remaining = Math.max(
      0,
      deadline - (Date.now() + offset)
    );

    const seconds = Math.ceil(remaining / 1000);

    const minutesPart = Math.floor(seconds / 60);
    const secondsPart = seconds % 60;

    const clock = document.getElementById(
      'challengeClock'
    );

    const bar = document.getElementById(
      'challengeProgressBar'
    );

    if (!clock || !bar) {
      challengeStopTimer();
      return;
    }

    clock.textContent =
      `${String(minutesPart).padStart(2, '0')}:` +
      `${String(secondsPart).padStart(2, '0')}`;

    bar.style.width =
      `${Math.max(0, remaining / totalMs) * 100}%`;

    const urgent = remaining <= 10000;

    clock.classList.toggle('urgent', urgent);
    bar.classList.toggle('urgent', urgent);

    if (remaining === 0) {
      submitted = true;
      challengeStopTimer();
      studentChallenges.delete(trackId);

      challengeOverlay(`
        <div class="student-challenge-result">
          <div class="student-challenge-result-icon">⌛</div>
          <h2>O tempo acabou!</h2>
          <p>
            O prazo da tentativa terminou.
            O servidor confirmará a expiração
            quando o desafio for consultado novamente.
          </p>

          <button
            class="btn"
            onclick="challengeOpen(${Number(trackId)}, ${Number(challengeId)})"
          >
            Voltar ao desafio
          </button>
        </div>
      `);
    }
  }

  updateClock();

  if (!submitted) {
    challengeTimer = setInterval(updateClock, 100);
  }
}

/* ============================================================
   PROGRESSO ENTRE QUESTÕES
============================================================ */

function challengeShowProgress(trackId, challengeId, result) {
  const correct = Boolean(result.correct);

  challengeOverlay(`
    <div class="student-challenge-result">
      <div class="student-challenge-result-icon">
        ${correct ? '✅' : '❤️'}
      </div>

      <h2>
        ${correct
          ? 'Resposta correta!'
          : 'Resposta incorreta!'}
      </h2>

      <p>
        ${esc(
          result.message ||
          'Continue para a próxima questão.'
        )}
      </p>

      ${
        result.lives_remaining != null
          ? `
            <p>
              ❤️ Vidas restantes:
              <strong>
                ${Number(result.lives_remaining)}
              </strong>
            </p>
          `
          : ''
      }

      <p class="mut">
        O desafio ainda não terminou.
        A recompensa será concedida
        somente após a vitória.
      </p>

      <button
        type="button"
        class="btn"
        id="challengeNextQuestion"
      >
        Próxima questão →
      </button>
    </div>
  `);

  document.getElementById(
    'challengeNextQuestion'
  ).onclick = () => {
    challengeShowQuestion(
      trackId,
      challengeId,
      result
    );
  };
}

/* ============================================================
   RESULTADO FINAL DOS DESAFIOS
============================================================ */

function challengeShowResult(trackId, result) {
  const status = result.status;

  const won = status === 'won';
  const lost = status === 'lost';
  const expired = status === 'expired';

  const gained = Math.max(
    0,
    Number(result.gained || 0)
  );

  const badgeCode = result.badge_code || null;

  const resultInfo = won
    ? {
        icon: '🏆',
        title: 'Desafio conquistado!',
        description:
          'Parabéns! Você concluiu o desafio com sucesso.'
      }
    : expired
      ? {
          icon: '⌛',
          title: 'Tempo esgotado!',
          description:
            'O prazo terminou antes da conclusão do desafio.'
        }
      : {
          icon: '💔',
          title: 'Tentativa encerrada!',
          description:
            'Você não conseguiu concluir o desafio desta vez.'
        };

  studentChallenges.delete(trackId);

  challengeOverlay(`
    <div class="student-challenge-result
      ${won ? 'victory' : 'defeat'}">

      <div class="student-challenge-result-icon">
        ${resultInfo.icon}
      </div>

      <h2>${resultInfo.title}</h2>

      <p>${resultInfo.description}</p>

      ${
        result.message
          ? `
            <p class="mut">
              ${esc(result.message)}
            </p>
          `
          : ''
      }

      ${
        won
          ? `
            <div class="student-challenge-win-xp">
              ${icon('star')}
              +${gained.toLocaleString('pt-BR')} XP
            </div>

            ${
              badgeCode
                ? `
                  <div class="student-challenge-achievement">
                    ${icon('trophy')}
                    <div>
                      <strong>
                        Conquista desbloqueada!
                      </strong>
                      <small>
                        Sua conquista foi registrada.
                      </small>
                    </div>
                  </div>
                `
                : ''
            }

            ${
              gained === 0
                ? `
                  <p class="mut">
                    Nenhum XP adicional foi concedido
                    nesta tentativa.
                  </p>
                `
                : ''
            }
          `
          : `
            <p class="mut">
              ${icon('info')}
              Nenhum XP foi concedido.
            </p>
          `
      }

      ${
        result.lives_remaining != null && !won
          ? `
            <p class="mut">
              ❤️ Vidas restantes:
              ${Math.max(0, Number(result.lives_remaining))}
            </p>
          `
          : ''
      }

      ${
        result.mistakes != null
          ? `
            <p class="mut">
              Erros registrados:
              ${Math.max(0, Number(result.mistakes))}
            </p>
          `
          : ''
      }

      <div class="student-challenge-buttons">

        <button
          type="button"
          class="btn"
          onclick="challengeFinish()"
        >
          ${icon('arrow-left')}
          Voltar às trilhas
        </button>

        ${
          lost || expired
            ? `
              <button
                type="button"
                class="btn sm sec"
                onclick="challengeFinish()"
              >
                Consultar tentativas restantes
              </button>
            `
            : ''
        }

      </div>

    </div>
  `);

  if (won) {
    refresh().catch(error => {
      console.error(
        'Erro ao atualizar XP após o desafio:',
        error
      );
    });
  }
}



async function challengeFinish() {
  challengeClose();
  studentChallenges.clear();

  try {
    await home();
  } catch (error) {
    console.error(
      'Erro ao atualizar as trilhas:',
      error
    );

    alert(
      'Não foi possível atualizar as trilhas. ' +
      'Tente novamente.'
    );
  }
}




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

  window.TRACKS =
    tracks;

  // As avaliações começam a carregar JÁ, junto com os desafios
  // (antes só começavam depois que todos os desafios chegavam)
  const avaliacoesPromessa = api('/lessons/ratings');
  avaliacoesPromessa.catch(() => {});

  
  // Carregar os desafios disponíveis sem bloquear
  // a exibição das trilhas em caso de erro.
  await Promise.all(
    tracks.map(async track => {
      // Trilha bloqueada não tem desafio liberado: nem pergunta ao servidor
      if (track.locked) {
        track.challengeData = [];
        return;
      }

      try {
        track.challengeData = await challengeGet(track.id, true);
      } catch (error) {
        console.warn(
          `Erro ao carregar desafio da trilha ${track.id}:`,
          error
        );
        track.challengeData = [];
      }
    })
  );



  // ==========================================================
  // CARREGAR MÉDIAS DAS AVALIAÇÕES DOS MÓDULOS
  // ==========================================================

  let lessonRatings = [];

  try {

    const ratingData =
      await avaliacoesPromessa;

    lessonRatings =
      arr(ratingData.ratings);

    // Notas que este usuário já deu (módulos e trilhas)
    window.MINHAS_NOTAS = {
      lessons: ratingData.mine?.lessons || {},
      tracks: ratingData.mine?.tracks || {}
    };

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
              // CARD DA TRILHA  (visual em css/trilhas-mapa.css)
              //
              // Mapa dos módulos em linha do tempo:
              //   feito    → círculo cheio com ✓
              //   atual    → círculo maior, com brilho e "Começar/Continuar"
              //   livre    → círculo com o número
              //   bloq     → cinza com cadeado (abre o aviso)
              // Apresentação, desafios, conclusão e avaliação aparecem como
              // paradas especiais no mesmo caminho.
              // ==================================================

              const proximo = !t.locked && t.lessons.find(l => !l.done && !l.locked);

              const estadoDo = l =>
                l.locked
                  ? 'bloq'
                  : l.done
                    ? 'feito'
                    : l === proximo
                      ? 'atual'
                      : 'livre';

              const notaTrilha =
                trackAverageRating !== null
                  ? `${icon('star')} <b>${trackAverageRating}</b> / 5 · ${trackRatingCount} ${trackRatingCount === 1 ? 'avaliação' : 'avaliações'}`
                  : `${icon('star')} Sem avaliações ainda`;

              const parada = ({ tipo, rotulo, acao, simbolo, titulo, detalhe, extra = '' }) => `
                <li class="trl__passo trl__passo--${tipo}">
                  <button
                    type="button"
                    class="trl__no"
                    aria-label="${rotulo}"
                    onclick="${acao}"
                    ${extra}
                  >
                    <span class="trl__circulo" aria-hidden="true">${simbolo}</span>
                    <span class="trl__info">
                      <b>${titulo}</b>
                      ${detalhe ? `<small>${detalhe}</small>` : ''}
                    </span>
                  </button>
                </li>
              `;

              return `
                <article
                  class="card trl${t.locked ? ' is-bloq' : ''}${allLessonsDone ? ' is-completa' : ''}"
                  style="--trl-cor:${c}"
                  aria-label="Trilha ${esc(t.title || '')}"
                >

                  <!-- ==========================================
                       TOPO: ícone, nome, nota e anel de progresso
                  =========================================== -->
                  <header class="trl__topo">
                    <span class="trl__ico" aria-hidden="true">${iconeTrilha(t.icon)}</span>

                    <div class="trl__titulo">
                      <h2>${esc(t.title)}</h2>
                      <p class="trl__nota">${notaTrilha}</p>
                    </div>

                    <div
                      class="trl__anel"
                      role="img"
                      aria-label="${pct}% da trilha concluída"
                      style="--p:${pct}"
                    >
                      <span>${pct}%</span>
                    </div>
                  </header>

                  ${t.description ? `<p class="trl__desc">${esc(t.description)}</p>` : ''}

                  ${
                    t.locked
                      ? `
                        <p class="trl__aviso">
                          ${icon('lock')} Para liberar esta trilha, conclua antes:
                          <b>${t.missing.map(esc).join(', ')}</b>
                        </p>
                      `
                      : ''
                  }

                  <!-- ==========================================
                       PROGRESSO GERAL
                  =========================================== -->
                  <div class="trl__prog">
                    <small>${n}/${t.lessons.length} módulos concluídos</small>
                    ${
                      proximo
                        ? `<button type="button" class="trl__seguir" onclick="openLesson(${Number(proximo.id)})">
                             ${n ? 'Continuar' : 'Começar'}: módulo ${t.lessons.indexOf(proximo) + 1} ${icon('arrow-right')}
                           </button>`
                        : allLessonsDone
                          ? `<span class="trl__selo">${icon('badge-check')} Trilha concluída</span>`
                          : ''
                    }
                  </div>

                  <div class="trl__barra" aria-hidden="true">
                    <div style="width:${pct}%"></div>
                  </div>

                  <!-- ==========================================
                       MAPA DOS MÓDULOS
                  =========================================== -->
                  <ol class="trl__mapa" aria-label="Módulos da trilha ${esc(t.title || '')}">

                    ${
                      t.presentation.length
                        ? parada({
                            tipo: 'extra',
                            rotulo: `Apresentação da trilha ${esc(t.title || '')}${t.locked ? ' (bloqueada)' : ''}`,
                            acao: t.locked ? `aviso(${t.id})` : `showTrack(${t.id})`,
                            simbolo: icon('pin'),
                            titulo: 'Apresentação',
                            detalhe: 'da trilha'
                          })
                        : ''
                    }

                    ${
                      t.lessons
                        .map((l, i) => {
                          const estado = estadoDo(l);
                          const p = Math.max(0, Math.min(100, Number(l.pct) || 0));
                          const nota =
                            l.average_rating !== null && Number(l.rating_count) > 0
                              ? ` · ${icon('star')} ${Number(l.average_rating).toFixed(1)}`
                              : '';

                          return `
                            <li class="trl__passo trl__passo--modulo is-${estado}">
                              <button
                                type="button"
                                class="trl__no"
                                aria-label="Módulo ${i + 1}: ${esc(l.title || '')}${l.locked ? ' (bloqueado)' : l.done ? ' (concluído)' : estado === 'atual' ? ' (próximo a fazer)' : ''}"
                                onclick="${l.locked ? `aviso(${t.id})` : `openLesson(${l.id})`}"
                              >
                                <span class="trl__circulo" aria-hidden="true">
                                  ${
                                    l.locked
                                      ? icon('lock')
                                      : l.done
                                        ? icon('check')
                                        : `<span class="trl__num">${i + 1}</span>`
                                  }
                                </span>

                                <span class="trl__info">
                                  <span class="trl__rotulo">
                                    Módulo ${i + 1}
                                    ${estado === 'atual' ? `<em class="trl__agora">${p > 0 ? 'Continuar' : 'Começar'}</em>` : ''}
                                  </span>
                                  <b>${esc(l.title || '')}</b>
                                  <span class="trl__mini" aria-hidden="true"><span style="width:${p}%"></span></span>
                                  <small>${p}% · +${Number(l.xp) || 0} XP${nota}</small>
                                </span>
                              </button>
                            </li>
                          `;
                        })
                        .join('')
                    }

                    <!-- ========================================
                         DESAFIOS
                    ========================================= -->
                    ${
                      Array.isArray(t.challengeData) && t.challengeData.length
                        ? t.challengeData.map(challenge => {
                            const challengeId = Number(challenge.id);
                            const completed = Boolean(challenge.completed);
                            const remaining = Number(challenge.remaining ?? 0);
                            const active = Boolean(challenge.active);

                            const types = {
                              tempo: { name: 'Contra o tempo', icon: 'zap' },
                              precisao: { name: 'Precisão', icon: 'target' },
                              quebra_cabeca: { name: 'Quebra-cabeça', icon: 'puzzle' },
                              resistencia: { name: 'Resistência', icon: 'flame' }
                            };

                            const type = types[challenge.type] || { name: 'Desafio especial', icon: 'trophy' };

                            const situacao = completed
                              ? '🏆 Conquistado'
                              : active
                                ? '▶ Em andamento'
                                : remaining > 0
                                  ? `+${Number(challenge.xp_reward || 0).toLocaleString('pt-BR')} XP`
                                  : '🔒 Tentativas esgotadas';

                            return `
                              <li class="trl__passo trl__passo--desafio${completed ? ' is-feito' : ''}">
                                <button
                                  type="button"
                                  class="trl__no"
                                  aria-label="Desafio ${esc(challenge.title)}: ${esc(type.name)}. ${esc(situacao)}"
                                  onclick="challengeOpen(${Number(t.id)}, ${challengeId})"
                                  title="${esc(challenge.title)}"
                                  ${t.locked ? 'disabled' : ''}
                                >
                                  <span class="trl__circulo" aria-hidden="true">${icon(completed ? 'trophy' : type.icon)}</span>
                                  <span class="trl__info">
                                    <span class="trl__rotulo">Desafio · ${esc(type.name)}</span>
                                    <b>${esc(challenge.title)}</b>
                                    <small>${situacao}</small>
                                  </span>
                                </button>
                              </li>
                            `;
                          }).join('')
                        : ''
                    }

                    <!-- ========================================
                         CONCLUSÃO E AVALIAÇÃO (SOMENTE EM 100%)
                    ========================================= -->
                    ${
                      allLessonsDone && t.conclusion.length
                        ? parada({
                            tipo: 'extra',
                            rotulo: `Conclusão da trilha ${esc(t.title || '')}`,
                            acao: `showTrackConclusion(${t.id})`,
                            simbolo: icon('flag'),
                            titulo: 'Conclusão',
                            detalhe: 'da trilha'
                          })
                        : ''
                    }

                    ${
                      allLessonsDone && t.evaluation_question
                        ? parada({
                            tipo: 'extra',
                            rotulo: `Avaliar a trilha ${esc(t.title || '')}`,
                            acao: `showTrackEvaluation(${t.id})`,
                            simbolo: icon('square-pen'),
                            titulo: 'Avaliação',
                            detalhe: 'da trilha'
                          })
                        : ''
                    }

                  </ol>
                </article>
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
        ${iconeTrilha(track.icon)}
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
        ${iconeTrilha(track.icon)}
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


  // Já avaliou antes: a nota aparece marcada e pode ser trocada
  const notaAnterior =
    Number(window.MINHAS_NOTAS?.tracks?.[id]) || 0;

  if (notaAnterior) {
    ratingButtons.forEach(b => {
      if (Number(b.dataset.rating) === notaAnterior) b.click();
    });

    selected.innerHTML =
      `Sua nota atual: ${notaAnterior} ${icon('star')} · escolha outra para mudar`;

    button.innerHTML =
      icon('send') + ' Atualizar avaliação';
  }

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

        // guarda a nota para mostrar da próxima vez
        if (window.MINHAS_NOTAS) {
          window.MINHAS_NOTAS.tracks[id] = selectedRating;
        }

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

  // Atalho: abre direto o próximo módulo a fazer
  const proximoModulo = !t.locked && t.lessons.find(l => !l.done && !l.locked);
  const numeroProximo = proximoModulo ? t.lessons.indexOf(proximoModulo) + 1 : 0;

  const continuarHtml = proximoModulo
    ? `
      <button
        class="btn"
        onclick="openLesson(${Number(proximoModulo.id)})"
        style="margin-right:8px"
      >
        ${t.lessons.some(l => l.done) ? 'Continuar' : 'Começar'}:
        módulo ${numeroProximo} ${icon('arrow-right')}
      </button>
    `
    : '';

  main.innerHTML = `
    <button
      class="link"
      onclick="home()"
    >
      ${icon('arrow-left')} Voltar
    </button>

    <h2>
      ${iconeTrilha(t.icon)}
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

                    ${
                      window.MINHAS_NOTAS?.tracks?.[t.id]
                        ? `<p class="mut">${icon('star')} Sua nota: <b>${Number(window.MINHAS_NOTAS.tracks[t.id])} de 5</b></p>`
                        : ''
                    }

                    <button
                      class="btn"
                      type="button"
                      onclick="showTrackEvaluation(${Number(t.id)})"
                      style="margin-top:10px"
                    >
                      ${icon('star')}
                      ${window.MINHAS_NOTAS?.tracks?.[t.id] ? 'Mudar minha nota' : 'Avaliar com estrelas'}
                    </button>
                  </div>
                `
                : ''
            }
          </div>
        `
        : ''
    }

    ${
      continuarHtml
    }

    <button
      class="btn${continuarHtml ? ' sec' : ''}"
      onclick="home()"
    >
      ${
        allLessonsDone
          ? 'Voltar às trilhas'
          : 'Ir para os módulos'
      }
    </button>
  `;

}

// ============================================================
// RANKING
// ============================================================

async function rank() {
  // Ranking da semana com o banner do ganhador (js/ranking-semana.js)
  if (window.dgxRankingSemana) {
    return window.dgxRankingSemana.montar(main);
  }

  // reserva: lista simples (se o js/ranking-semana.js não carregar)
  const r = await api('/ranking');

  main.innerHTML =
    '<h2>' + icon('trophy') + ' Ranking</h2>' +
    (r.map((u, n) => `
      <div class="card row"${u.me ? ' style="border-color:var(--g)"' : ''}>
        <span>${n + 1}º ${avatarHtml(u, 'sm')} ${esc(u.name)} <small class="mut">Nv ${u.level}</small></span>
        <span>${icon('star')} ${u.xp} · ${icon('flame')} ${u.streak}</span>
      </div>
    `).join('') || '<p class="mut">Ainda não há alunos no ranking.</p>');
}

// ============================================================
// PERFIL
// ============================================================
// ---------- Auxiliares da tela de perfil ----------




/* ============================================================
   AÇÕES DO PERFIL — DRAGNIX
   ============================================================ */

function profileFeedback(message, error = false) {
  const el = document.getElementById('profileFeedback');
  if (!el) return;

  el.textContent = message;
  el.classList.toggle('error', error);
}

function updateProfileUser(user) {
  if (!user) return;

  const current = me() || {};
  localStorage.setItem('user', JSON.stringify({
    ...current,
    ...user
  }));

  // Atualiza na hora o nome e a foto do cabeçalho (js/profile.js)
  // e o card do perfil (js/shell-extra.js).
  document.dispatchEvent(new CustomEvent('dgx:perfil-mudou'));
}

// ALTERAR NOME

function editName() {
  const view = document.getElementById('profileNameView');
  const form = document.getElementById('profileNameForm');
  const input = document.getElementById('profileNameInput');

  if (!view || !form || !input) return;

  view.style.display = 'none';
  form.style.display = 'flex';
  input.focus();
  input.select();
}

function cancelName() {
  const view = document.getElementById('profileNameView');
  const form = document.getElementById('profileNameForm');

  if (view) view.style.display = '';
  if (form) form.style.display = 'none';

  profileFeedback('');
}

async function saveName() {
  const input = document.getElementById('profileNameInput');
  if (!input) return;

  const name = input.value.trim().replace(/\s+/g, ' ');

  if (name.length < 2 || name.length > 60) {
    profileFeedback(
      'O nome deve ter entre 2 e 60 caracteres.',
      true
    );
    return;
  }

  const buttons = document.querySelectorAll(
    '#profileNameForm button'
  );

  buttons.forEach(btn => btn.disabled = true);
  profileFeedback('Salvando nome...');

  try {
    const result = await api('/me/name', 'PUT', { name });

    updateProfileUser(result.user);
    await profile();

    profileFeedback('Nome atualizado com sucesso!');
  } catch (error) {
    profileFeedback(error.message, true);
    buttons.forEach(btn => btn.disabled = false);
  }
}

// ENVIAR FOTO

async function onAvatarPicked(input) {
  const file = input.files?.[0];
  if (!file) return;

  const allowed = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  if (!allowed.includes(file.type)) {
    profileFeedback(
      'Selecione uma imagem JPG, PNG ou WebP.',
      true
    );
    input.value = '';
    return;
  }

  const maxSize = 10 * 1024 * 1024;

  if (file.size > maxSize) {
    profileFeedback(
      'A imagem original deve ter no máximo 10 MB.',
      true
    );
    input.value = '';
    return;
  }

  input.disabled = true;
  profileFeedback('Otimizando e enviando foto...');

  try {
    // Usa o redimensionamento já existente em api.js.
    const data = await resizeAvatar(file);

    const result = await api('/me/avatar', 'POST', {
      data
    });

    updateProfileUser(result.user);

    await profile();

    profileFeedback('Foto atualizada com sucesso!');
  } catch (error) {
    profileFeedback(error.message, true);
  } finally {
    input.disabled = false;
    input.value = '';
  }
}
// REMOVER FOTO OU AVATAR

async function removeAvatar() {
  if (!confirm('Deseja remover seu avatar atual?')) return;

  profileFeedback('Removendo avatar...');

  try {
    const result = await api('/me/avatar', 'DELETE');

    updateProfileUser(result.user);
    await profile();

    profileFeedback('Avatar removido com sucesso!');
  } catch (error) {
    profileFeedback(error.message, true);
  }
}

// ABRIR E FECHAR GALERIA

async function toggleAvatarGallery() {
  const gallery = document.getElementById('avatarGallery');
  if (!gallery) return;

  if (gallery.style.display !== 'none') {
    gallery.style.display = 'none';
    return;
  }

  gallery.style.display = 'block';
  gallery.innerHTML = (window.dgxCarregando ? window.dgxCarregando.html('Carregando avatares…', { compacto: true }) : '<p>Carregando avatares…</p>');

  try {
    const result = await api('/avatars');
    const presets = Array.isArray(result.presets)
      ? result.presets
      : [];

    if (!gallery.isConnected ||
        gallery.style.display === 'none') return;

    if (!presets.length) {
      gallery.textContent = 'Nenhum avatar disponível.';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'avatar-gallery';

    presets.forEach(preset => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'avatar-option';
      button.title = preset.label || 'Selecionar avatar';
      button.setAttribute('aria-label', button.title);

      const img = document.createElement('img');
      img.src = preset.url;
      img.alt = preset.label || 'Avatar';
      img.loading = 'lazy';

      button.appendChild(img);

      button.addEventListener('click', () => {
        chooseProfileAvatar(preset.id);
      });

      grid.appendChild(button);
    });

    gallery.replaceChildren(grid);
  } catch (error) {
    if (gallery.isConnected) {
      gallery.textContent = 'Erro ao carregar avatares.';
    }
    profileFeedback(error.message, true);
  }
}

// SELECIONAR AVATAR

async function chooseProfileAvatar(id) {
  const gallery = document.getElementById('avatarGallery');
  const buttons = gallery?.querySelectorAll('button') || [];

  buttons.forEach(btn => btn.disabled = true);
  profileFeedback('Atualizando avatar...');

  try {
    const result = await api(
      '/me/avatar/preset',
      'POST',
      { id }
    );

    updateProfileUser(result.user);
    await profile();

    profileFeedback('Avatar atualizado com sucesso!');
  } catch (error) {
    buttons.forEach(btn => btn.disabled = false);
    profileFeedback(error.message, true);
  }
}


function profileBadgeIcon(b) {
  const lucide = [
    'trophy', 'zap', 'crown', 'flame',
    'medal', 'star', 'gem', 'award'
  ];

  return lucide.includes(b.icon)
    ? icon(b.icon)
    : (conquistaImagem(b.icon, b.name) || esc(b.icon || '🏆'));
}

function profileLocalToday() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function profile() {
  const p = await api('/me/profile');

  refresh();

  // ---------- Dados derivados ----------

  const week = arr(p.week);
  const missions = arr(p.missions);
  const badgeList = arr(p.badges);

  const topXp = Math.max(...week.map(x => x.xp), 1);
  const weekTotal = week.reduce((sum, x) => sum + x.xp, 0);

  const span = (p.nextXp - p.curXp) || 1;

  const levelPct = Math.max(
    0,
    Math.min(100, ((p.xp - p.curXp) / span) * 100)
  );

  const xpMissing = Math.max(0, p.nextXp - p.xp);

  const missionsDone = missions.filter(m => m.claimed || m.done).length;

  // Conquistadas primeiro; a ordem original é mantida em cada grupo.
  const earned = badgeList.filter(b => b.got);
  const locked = badgeList.filter(b => !b.got);
  const sortedBadges = [...earned, ...locked];

  const todayKey = profileLocalToday();
  const weekDays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const stats = [
    { icon: 'flame',       value: p.streak,  label: 'Dias seguidos', cls: 'streak' },
    { icon: 'coins',       value: p.coins,   label: 'Moedas',        cls: 'coins'  },
    { icon: 'book',        value: p.lessons, label: 'Lições',        cls: 'lessons' },
    { icon: 'badge-check', value: p.perfect, label: 'Perfeitas',     cls: 'perfect' },
    { icon: 'flag',        value: p.tracks,  label: 'Trilhas',       cls: 'tracks' }
  ];

  const custoVidas = Number(p.refillCost ?? 30);
  const canBuyHearts = Number(p.coins) >= custoVidas;

  // ---------- Tela ----------

  main.innerHTML = `
    <!-- ============ CABEÇALHO ============ -->
    <section class="card pf-hero" aria-label="Seu perfil">

      <div class="pf-cover" aria-hidden="true"></div>

      <div class="pf-hero-body">

        <div class="pf-avatar-wrap">

          ${avatarHtml(
            { name: p.name, avatar_url: p.avatar_url },
            'lg'
          )}

          <span
            class="pf-level-chip"
            title="Nível ${p.level}${p.level_name ? ' — ' + esc(p.level_name) : ''}"
          >
            ${icon('medal')} Nv ${p.level}
          </span>

        </div>

        <div
          class="profile-name"
          id="profileNameView"
        >
          <h2>${esc(p.name)}</h2>

          <button
            class="pf-icon-btn"
            type="button"
            onclick="editName()"
            title="Alterar nome"
            aria-label="Alterar nome"
          >
            ${icon('pencil')}
          </button>
        </div>

        <div
          class="profile-name-form"
          id="profileNameForm"
          style="display:none"
        >
          <input
            type="text"
            id="profileNameInput"
            class="profile-name-input"
            value="${esc(p.name)}"
            maxlength="60"
            autocomplete="name"
            aria-label="Seu nome"
            onkeydown="
              if (event.key === 'Enter') saveName();
              if (event.key === 'Escape') cancelName();
            "
          >

          <div class="profile-name-actions">
            <button
              class="btn sm"
              type="button"
              onclick="saveName()"
            >
              ${icon('check')} Salvar
            </button>

            <button
              class="btn sm sec"
              type="button"
              onclick="cancelName()"
            >
              Cancelar
            </button>
          </div>
        </div>

        <div class="pf-avatar-actions">

          <input
            type="file"
            id="avatarInput"
            accept="image/*"
            hidden
            onchange="onAvatarPicked(this)"
          >

          <button
            class="btn sm sec"
            type="button"
            onclick="document.getElementById('avatarInput').click()"
          >
            ${icon('camera')}
            ${p.avatar_url ? 'Trocar foto' : 'Enviar foto'}
          </button>

          <button
            class="btn sm sec"
            type="button"
            onclick="toggleAvatarGallery()"
          >
            ${icon('smile')} Escolher avatar
          </button>

          ${
            p.avatar_url
              ? `
                <button
                  class="btn sm sec pf-danger"
                  type="button"
                  onclick="removeAvatar()"
                >
                  ${icon('trash-2')} Remover
                </button>
              `
              : ''
          }

        </div>

        <div
          id="avatarGallery"
          class="avatar-gallery-box"
          style="display:none"
        ></div>

        <div
          class="profile-feedback"
          id="profileFeedback"
          role="status"
          aria-live="polite"
        ></div>

        <!-- Progresso de nível -->
        <div class="pf-level">

          <div class="pf-level-top">
            <strong>Nível ${p.level}${p.level_name ? ' · ' + esc(p.level_name) : ''}</strong>
            <span class="mut">
              ${p.xp} / ${p.nextXp} XP
            </span>
          </div>

          <div
            class="bar pf-bar"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${Math.round(levelPct)}"
            aria-label="Progresso para o nível ${p.level + 1}"
          >
            <div style="width:${levelPct}%"></div>
          </div>

          <p class="mut pf-level-hint">
            Faltam <b>${xpMissing} XP</b>
            para o nível ${p.level + 1}
          </p>

        </div>

      </div>

    </section>


    <!-- ============ ESTATÍSTICAS ============ -->
    <div class="pf-stats">
      ${stats
        .map(
          s => `
            <div class="pf-stat pf-stat-${s.cls}">
              <span class="pf-stat-icon">${icon(s.icon)}</span>
              <strong>${s.value}</strong>
              <small>${s.label}</small>
            </div>
          `
        )
        .join('')}
    </div>


    <!-- ============ LOJA ============ -->
    <div class="card pf-shop">

      <span class="pf-shop-icon">${icon('heart')}</span>

      <div class="pf-shop-text">
        <strong>Recarregar vidas</strong>
        <small class="mut">
          Troque ${custoVidas} moedas por vidas e continue estudando.
        </small>
      </div>

      <button
        class="btn sm"
        type="button"
        onclick="buyHearts()"
        ${canBuyHearts ? '' : 'disabled'}
        title="${
          canBuyHearts
            ? 'Recarregar vidas'
            : `Você precisa de ${custoVidas} moedas`
        }"
      >
        ${custoVidas} ${icon('coins')}
      </button>

    </div>


    <!-- ============ MISSÕES ============ -->
    <div class="pf-section-head">
      <h3>${icon('target')} Missões de hoje</h3>
      <span class="pf-pill">
        ${missionsDone}/${missions.length}
      </span>
    </div>

    ${
      missions.length
        ? missions
            .map(m => {
              const pct = Math.max(
                0,
                Math.min(100, (m.value / (m.goal || 1)) * 100)
              );

              return `
                <div class="card pf-mission${m.claimed ? ' is-claimed' : ''}">

                  <span
                    class="pf-mission-emoji"
                    aria-hidden="true"
                  >${m.icon}</span>

                  <div class="pf-mission-body">

                    <div class="pf-mission-title">
                      <strong>${esc(m.label)}</strong>
                      <small class="mut">
                        ${m.value}/${m.goal}
                      </small>
                    </div>

                    <div class="bar pf-bar-sm">
                      <div style="width:${pct}%"></div>
                    </div>

                  </div>

                  <div class="pf-mission-action">
                    ${
                      m.claimed
                        ? `
                          <span class="pf-claimed">
                            ${icon('circle-check')} Resgatado
                          </span>
                        `
                        : m.done
                          ? `
                            <button
                              class="btn sm"
                              type="button"
                              onclick="claim('${esc(m.code)}')"
                            >
                              +10 ${icon('coins')}
                            </button>
                          `
                          : `<span class="pf-pending mut">Em andamento</span>`
                    }
                  </div>

                </div>
              `;
            })
            .join('')
        : `
          <div class="card pf-empty">
            <p class="mut">Nenhuma missão disponível hoje.</p>
          </div>
        `
    }


    <!-- ============ CONQUISTAS ============ -->
    <div class="pf-section-head">
      <h3>${icon('award')} Conquistas</h3>
      <span class="pf-pill">
        ${earned.length}/${badgeList.length}
      </span>
    </div>

    ${
      badgeList.length
        ? `
          <div class="badges pf-badges">
            ${sortedBadges
              .map(
                b => `
                  <div
                    class="bdg ${b.got ? 'is-got' : 'off'}"
                    title="${esc(b.desc)}"
                  >
                    <span>${profileBadgeIcon(b)}</span>

                    <small><b>${esc(b.name)}</b></small>

                    <small class="mut">${esc(b.desc)}</small>
                  </div>
                `
              )
              .join('')}
          </div>
        `
        : `
          <div class="card pf-empty">
            <p class="mut">Ainda não há conquistas cadastradas.</p>
          </div>
        `
    }


    <!-- ============ XP DA SEMANA ============ -->
    <div class="pf-section-head">
      <h3>${icon('calendar')} XP dos últimos dias</h3>
      <span class="pf-pill">${weekTotal} XP</span>
    </div>

    <div class="card pf-week-card">
      ${
        week.length
          ? `
            <div class="pf-week">
              ${week
                .map(w => {
                  const date = new Date(w.day + 'T00:00:00');
                  const label = isNaN(date)
                    ? ''
                    : weekDays[date.getDay()];

                  const height = w.xp > 0
                    ? Math.max(6, (w.xp / topXp) * 100)
                    : 3;

                  return `
                    <div
                      class="pf-day${w.day === todayKey ? ' is-today' : ''}"
                      role="img"
                      aria-label="${w.day.slice(8)}/${w.day.slice(5, 7)}: ${w.xp} XP"
                    >
                      <span class="pf-day-xp">${w.xp}</span>

                      <div class="pf-day-track">
                        <div
                          class="pf-day-bar"
                          style="height:${height}%"
                        ></div>
                      </div>

                      <small class="pf-day-label">
                        ${label}<br>
                        ${w.day.slice(8)}/${w.day.slice(5, 7)}
                      </small>
                    </div>
                  `;
                })
                .join('')}
            </div>
          `
          : `
            <p class="mut pf-empty-text">
              ${icon('calendar')}
              Sem atividade ainda. Conclua uma lição para começar!
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
               
              ${
                [
                  'trophy', 'zap', 'crown', 'flame',
                  'medal', 'star', 'gem', 'award'
                ].includes(b.icon)
                  ? icon(b.icon)
                  : (conquistaImagem(b.icon, b.name) || esc(b.icon || '🏆'))
              }
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
      id="fa" aria-label="Sua resposta"
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
// NAVEGAÇÃO ENTRE MÓDULOS E PARTES DA EXPLICAÇÃO
// ==========================================================

// Onde o módulo está dentro da trilha (anterior / próximo)
function moduloVizinhos(lesson) {
  // A resposta de /lessons/:id não traz o track_id: procura a trilha
  // que contém este módulo.
  const t = arr(window.TRACKS).find(
    x => Number(x.id) === Number(lesson.track_id) ||
      arr(x.lessons).some(l => Number(l.id) === Number(lesson.id))
  );

  if (!t) return null;

  const lessons = arr(t.lessons);
  const idx = lessons.findIndex(l => Number(l.id) === Number(lesson.id));

  if (idx < 0) return null;

  return {
    track: t,
    idx,
    total: lessons.length,
    prev: lessons[idx - 1] || null,
    next: lessons[idx + 1] || null
  };
}

// Divide a explicação em partes: cada texto abre uma parte nova
// e as imagens/vídeos ficam junto do texto que vem antes deles.
function explicacaoPaginas(content) {
  const paginas = [];

  arr(content).forEach(b => {
    const atual = paginas[paginas.length - 1];
    const ehTexto = b && b.type === 'texto';

    if (!atual || (ehTexto && atual.some(x => x && x.type === 'texto'))) {
      paginas.push([b]);
    } else {
      atual.push(b);
    }
  });

  return paginas;
}

// Setas ← → do teclado passam as partes da explicação
document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (!main) return;

  const t = e.target;

  if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], .student-challenge-overlay')) {
    return;
  }

  const alvo =
    e.key === 'ArrowRight' ? main.querySelector('[data-lexp="prox"]') :
    e.key === 'ArrowLeft' ? main.querySelector('[data-lexp="ant"]') :
    null;

  if (alvo && !alvo.disabled) {
    e.preventDefault();
    alvo.click();
  }
});

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
  // NAVEGAÇÃO DO MÓDULO (etapas, partes e módulos vizinhos)
  // ========================================================

  const ctx = moduloVizinhos(lesson);
  const paginas = explicacaoPaginas(lesson.content);

  let tela = '';                 // etapa aberta agora
  let paginaExp = 0;             // parte da explicação aberta
  let pendente = false;          // resposta corrigida esperando "Continuar"
  let respondidas = 0;           // perguntas respondidas nesta tentativa
  let liberouQuestoes = !lesson.content.length;

  const etapas = [
    { id: 'apresentacao', nome: 'Apresentação' },
    ...(lesson.content.length ? [{ id: 'explicacao', nome: 'Explicação' }] : []),
    ...(lesson.questions.length ? [{ id: 'questoes', nome: 'Questões' }] : [])
  ];

  const navTopo = () => {
    const atual = etapas.findIndex(e => e.id === tela);

    return `
      <nav class="lnav" aria-label="Navegação do módulo">

        <div class="lnav__linha">

          <button type="button" class="lnav__sair" data-lnav="sair">
            ${icon('arrow-left')} Trilhas
          </button>

          <span class="lnav__onde">
            ${
              ctx
                ? `${iconeTrilha(ctx.track.icon)} ${esc(ctx.track.title || '')}
                   <b>· Módulo ${ctx.idx + 1} de ${ctx.total}</b>`
                : esc(lesson.title || 'Módulo')
            }
          </span>

        </div>

        <ol class="lnav__etapas">
          ${etapas.map((e, n) => {
            const travada = e.id === 'questoes' && !liberouQuestoes;

            return `
              <li>
                <button
                  type="button"
                  data-lnav="${e.id}"
                  class="lnav__etapa${n === atual ? ' is-on' : ''}${n < atual ? ' is-feito' : ''}"
                  ${n === atual ? 'aria-current="step"' : ''}
                  ${travada ? 'disabled title="Leia a explicação até o fim para liberar"' : ''}
                >
                  <span class="lnav__num">
                    ${travada ? icon('lock') : n < atual ? icon('check') : n + 1}
                  </span>
                  <span class="lnav__nome">${e.nome}</span>
                </button>
              </li>
            `;
          }).join('')}
        </ol>

      </nav>
    `;
  };

  // Botões "módulo anterior / próximo módulo"
  const navModulos = () => {
    if (!ctx || (!ctx.prev && !ctx.next)) return '';

    const lado = (l, dir) => {
      if (!l) return '<span></span>';

      const n = ctx.track.lessons.indexOf(l) + 1;
      const travado = !!l.locked;

      return `
        <button
          type="button"
          class="lnav-mod lnav-mod--${dir}"
          data-lmod="${l.id}"
          ${travado ? 'disabled title="Conclua este módulo para liberar o próximo"' : ''}
        >
          ${dir === 'ant' ? icon('chevron-left') : ''}
          <span>
            <small>${dir === 'ant' ? 'Módulo anterior' : 'Próximo módulo'}</small>
            <b>${travado ? icon('lock') + ' ' : ''}${n}. ${esc(l.title || '')}</b>
          </span>
          ${dir === 'prox' ? icon('chevron-right') : ''}
        </button>
      `;
    };

    return `
      <div class="lnav-mods">
        ${lado(ctx.prev, 'ant')}
        ${lado(ctx.next, 'prox')}
      </div>
    `;
  };

  // Liga os botões da navegação depois de cada tela
  const ligarNav = () => {
    window.scrollTo(0, 0);

    main.querySelectorAll('[data-lnav]').forEach(b => {
      b.onclick = () => {
        const alvo = b.dataset.lnav;

        if (alvo === 'sair') {
          if (
            respondidas > 0 &&
            i < lesson.questions.length &&
            !confirm('Sair do módulo agora? As respostas desta tentativa não serão salvas.')
          ) {
            return;
          }

          return home();
        }

        // Com uma resposta corrigida na tela, primeiro "Continuar"
        if (pendente || alvo === tela) return;

        if (alvo === 'apresentacao') presentation();
        else if (alvo === 'explicacao') explain(paginaExp);
        else if (alvo === 'questoes' && liberouQuestoes) step();
      };
    });

    main.querySelectorAll('[data-lmod]').forEach(b => {
      b.onclick = () => openLesson(Number(b.dataset.lmod));
    });
  };

  const travarNav = () => {
    main.querySelectorAll('.lnav__etapa').forEach(b => {
      b.disabled = true;
    });
  };


  // ========================================================
  // APRESENTAÇÃO DO MÓDULO
  // ========================================================

  const presentation = () => {

    tela = 'apresentacao';

    main.innerHTML = `

      ${navTopo()}

      <div class="card">

        <h1 role="heading" aria-level="2">
          ${esc(lesson.title || 'Módulo')}
        </h1>

                
        ${lesson.done ? `
          <div class="card" role="status" style="
            margin: 14px 0;
            padding: 16px;
            border: 1px solid #e7b85b;
            background: rgba(231,184,91,.10);
            text-align: left;
          ">
            <strong>
              ${icon('info')} Você está revisando este módulo!
            </strong>

            <p style="margin: 8px 0 0;">
              Você já concluiu este conteúdo anteriormente.
              Nesta tentativa, receberá apenas
              <strong>${
                percentualRevisao(lesson.completionCount || 1)
              }% do XP calculado.</strong>
            </p>

            <p class="mut" style="margin-top: 8px;">
              Continue praticando para reforçar seus conhecimentos!
            </p>
          </div>
        ` : ''}


        ${
          lesson.presentation.length
            ? `
              <div class="lesson-content">
                ${lesson.presentation.map(block).join('')}
              </div>
            `
            : lesson.description
              ? `
                <div class="intro">
                  ${esc(lesson.description)}
                </div>
              `
              : `
                <p class="mut">
                  Este módulo ainda não possui uma apresentação.
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
              ? (paginaExp > 0 || liberouQuestoes ? 'Continuar explicação ' : 'Começar explicação ') + icon('arrow-right')
              : 'Começar módulo ' + icon('arrow-right')
          }
        </button>

      </div>

      ${navModulos()}

    `;

    ligarNav();

    $('go0').onclick = () => {

      if (lesson.content.length) {

        explain(paginaExp);

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

  const explain = (p = 0) => {

    if (!lesson.content.length) {

      if (lesson.questions.length) {

        return step();

      }

      return finish(id, lesson);

    }

    const total = paginas.length;

    paginaExp = Math.max(0, Math.min(Number(p) || 0, total - 1));

    const ultima = paginaExp === total - 1;

    if (ultima) liberouQuestoes = true;

    tela = 'explicacao';

    const textoFim = lesson.questions.length
      ? (i > 0 ? 'Voltar às questões ' : 'Ir para as questões ')
      : 'Concluir módulo ';

    main.innerHTML = `

      ${navTopo()}

      <div class="card lexp">

        <div class="lexp__topo">

          <h2>
            ${icon('lightbulb')} Explicação
          </h2>

          ${total > 1 ? `<span class="lexp__parte">Parte ${paginaExp + 1} de ${total}</span>` : ''}

        </div>

        ${
          total > 1
            ? `<div class="lexp__barra" aria-hidden="true"><div style="width:${((paginaExp + 1) / total) * 100}%"></div></div>`
            : ''
        }

        <div class="lesson-content lexp__conteudo">
          ${paginas[paginaExp].map(block).join('')}
        </div>

        ${
          total > 1
            ? `
              <div class="lexp__pontos" role="group" aria-label="Partes da explicação">
                ${paginas.map((_, n) => `
                  <button
                    type="button"
                    data-lexp-pag="${n}"
                    class="${n === paginaExp ? 'is-on' : ''}${n < paginaExp ? ' is-feito' : ''}"
                    aria-label="Parte ${n + 1} de ${total}"
                    ${n === paginaExp ? 'aria-current="step"' : ''}
                  ></button>
                `).join('')}
              </div>
            `
            : ''
        }

      </div>

      <div class="lexp__acoes">

        <button type="button" class="btn sec" data-lexp="ant">
          ${icon('arrow-left')} ${paginaExp === 0 ? 'Apresentação' : 'Parte anterior'}
        </button>

        <button
          id="go"
          type="button"
          class="btn"
          data-lexp="${ultima ? 'fim' : 'prox'}"
        >
          ${ultima ? textoFim : 'Próxima parte '}${icon('arrow-right')}
        </button>

      </div>

      ${total > 1 ? '<p class="lexp__dica mut">Dica: use as setas ← e → do teclado para passar as partes.</p>' : ''}

    `;

    ligarNav();

    main.querySelector('[data-lexp="ant"]').onclick = () => {

      if (paginaExp === 0) {

        presentation();

      } else {

        explain(paginaExp - 1);

      }

    };

    main.querySelectorAll('[data-lexp-pag]').forEach(b => {

      b.onclick = () => explain(Number(b.dataset.lexpPag));

    });

    $('go').onclick = () => {

      if (!ultima) {

        explain(paginaExp + 1);

      } else if (lesson.questions.length) {

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


    tela = 'questoes';
    pendente = false;
    liberouQuestoes = true;

    main.innerHTML = `

      ${navTopo()}

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

      <div id="fb" role="status" aria-live="polite"></div>

    `;

    ligarNav();


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

      // Resposta corrigida: as etapas travam até clicar em "Continuar"
      pendente = true;
      respondidas++;
      travarNav();

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

  // Atualiza estatísticas (e a lista de módulos, para liberar o próximo)
  await refresh().catch(() => {});

  const vizinhos = moduloVizinhos(lesson);
  let proximoHtml = '';

  if (vizinhos && vizinhos.next && !vizinhos.next.locked) {
    proximoHtml = `
      <button
        class="btn"
        onclick="openLesson(${Number(vizinhos.next.id)})"
        style="width:100%;margin-top:16px;"
      >
        Próximo módulo: ${esc(vizinhos.next.title || 'Módulo ' + (vizinhos.idx + 2))} ${icon('arrow-right')}
      </button>
    `;
  } else if (
    vizinhos &&
    !vizinhos.next &&
    vizinhos.track.lessons.every(l => l.done) &&
    vizinhos.track.conclusion.length
  ) {
    proximoHtml = `
      <button
        class="btn"
        onclick="showTrack(${Number(vizinhos.track.id)})"
        style="width:100%;margin-top:16px;"
      >
        ${icon('flag')} Ver a conclusão da trilha
      </button>
    `;
  }

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
        Nenhum XP recebido nesta tentativa.
      </p>
    `
}

${
  r.repeated
    ? `
      <div class="card" style="
        margin-top: 14px;
        padding: 14px;
        border: 1px solid #e7b85b;
        background: rgba(231,184,91,.10);
        text-align: center;
      ">
        <strong>
          ${icon('info')} Revisão concluída!
        </strong>

        <p style="margin: 8px 0 0;">
          Esta foi sua
          <strong>${r.completionNumber}ª conclusão</strong>
          deste módulo.
        </p>

        <p style="margin: 8px 0 0;">
          Você recebeu
          <strong>
            ${Math.round((r.xpMultiplier ?? 0.5) * 100)}%
          </strong>
          do XP calculado nesta tentativa.
        </p>
      </div>
    `
    : ''
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

               
              ${
                [
                  'trophy', 'zap', 'crown', 'flame',
                  'medal', 'star', 'gem', 'award'
                ].includes(b.icon)
                  ? icon(b.icon)
                  : (conquistaImagem(b.icon, b.name) || esc(b.icon || '🏆'))
              }

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

    ${proximoHtml}

    <button
      class="btn${proximoHtml ? ' sec' : ''}"
      onclick="home()"
      style="
        width:100%;
        margin-top:${proximoHtml ? '10px' : '16px'};
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



  // Já avaliou antes: a nota aparece marcada e pode ser trocada
  const notaAnterior =
    Number(window.MINHAS_NOTAS?.lessons?.[lessonId]) || 0;

  if (notaAnterior) {
    ratingButtons.forEach(b => {
      if (Number(b.dataset.rating) === notaAnterior) b.click();
    });

    selected.innerHTML =
      `Sua nota atual: ${notaAnterior} ${icon('star')} · escolha outra para mudar`;

    sendButton.innerHTML =
      icon('send') + ' Atualizar avaliação';
  }

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

        // guarda a nota para mostrar da próxima vez
        if (window.MINHAS_NOTAS) {
          window.MINHAS_NOTAS.lessons[lessonId] = selectedRating;
        }

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
        aria-label="Mês anterior"
        title="Mês anterior"
      >
        ${icon('arrow-left')}
      </button>

      <input
        type="month"
        aria-label="Mês dos lançamentos"
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
        aria-label="Próximo mês"
        title="Próximo mês"
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
        aria-label="Tipo de lançamento"
        onchange="catsLanc()"
      >
        <option value="gasto">
          ${icon('trending-down')} Gasto
        </option>

        <option value="receita">
          ${icon('trending-up')} Receita
        </option>
      </select>

      <select id="lc" aria-label="Categoria"></select>

      <input
        id="ld"
        aria-label="Descrição (opcional)"
        placeholder="Descrição (opcional)"
      >

      <input
        id="lv"
        aria-label="Valor em reais"
        inputmode="decimal"
        placeholder="Valor (R$)"
      >

      <input
        id="ldia"
        aria-label="Data do lançamento"
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
                  aria-label="Excluir lançamento"
                  title="Excluir lançamento"
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
          aria-label="Descrição"
          value="${esc(nome)}"
        >

        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="R$ por mês"
          aria-label="Valor por mês em reais"
          value="${esc(valor)}"
        >

        <button
          class="btn sm red"
          onclick="this.parentNode.remove()"
          aria-label="Remover linha"
          title="Remover linha"
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
        ${avatarHtml(m.author, 'sm')}
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
                 aria-label="Excluir mensagem"
                 title="Excluir mensagem"
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
  main.innerHTML = (window.dgxCarregando ? window.dgxCarregando.html('Carregando dúvidas…') : '<p>Carregando dúvidas…</p>');

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

  // Abas: "Assistente com IA" (js/assistente.js) e "Perguntar a um professor".
  // Aluno começa na IA; professor/adm começa nas dúvidas dos alunos.
  const temAssistente = !!window.dgxAssistente;
  const pendentes = list.filter(d => !d.answered).length;
  const aba = temAssistente ? (doubtsAba || (staffUser ? 'prof' : 'ia')) : 'prof';

  main.innerHTML = `
    ${temAssistente ? `
    <div class="dv-abas" role="tablist" aria-label="Formas de tirar dúvidas">
      <button type="button" class="dv-aba" role="tab" id="dvAbaIa" aria-controls="dvPainelIa"
        aria-selected="${aba === 'ia'}" tabindex="${aba === 'ia' ? 0 : -1}" onclick="dvTrocarAba('ia')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        Nix · Assistente IA
      </button>
      <button type="button" class="dv-aba" role="tab" id="dvAbaProf" aria-controls="dvPainelProf"
        aria-selected="${aba === 'prof'}" tabindex="${aba === 'prof' ? 0 : -1}" onclick="dvTrocarAba('prof')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>
        ${staffUser ? 'Dúvidas dos alunos' : 'Fórum de dúvidas'}
        ${staffUser && pendentes ? `<span class="dv-aba__qtd" aria-label="${pendentes} sem resposta">${pendentes}</span>` : ''}
      </button>
    </div>

    <section id="dvPainelIa" role="tabpanel" aria-labelledby="dvAbaIa" ${aba === 'ia' ? '' : 'hidden'}>
      <div id="dgxAssistente"></div>
    </section>
    ` : ''}

    <section id="dvPainelProf" ${temAssistente ? 'role="tabpanel" aria-labelledby="dvAbaProf"' : ''} ${aba === 'prof' ? '' : 'hidden'}>
    <div class="card">
      <h2>${icon('message-square')} ${staffUser ? 'Dúvidas dos alunos' : 'Fórum de dúvidas'}</h2>
      <p class="mut">
        ${
          staffUser
            ? 'Responda as dúvidas dos alunos. Você pode excluir mensagens inadequadas.'
            : 'Tem alguma dúvida? Escreva aqui e um professor vai responder.'
        }
      </p>

      <textarea
        id="doubtText"
        aria-label="Sua dúvida"
        maxlength="1000"
        rows="3"
        placeholder="Escreva sua dúvida…"
        style="width:100%;margin-top:8px"
      ></textarea>

      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <select id="doubtTrack" style="width:auto" aria-label="Trilha da dúvida">
          <option value="">Sem trilha específica</option>
          ${trackOptions}
        </select>
        <button class="btn" onclick="sendDoubt()">${icon('send')} Enviar dúvida</button>
      </div>
      <div id="doubtMsg" class="mut" style="margin-top:6px"></div>
    </div>

    <div class="card" style="margin-top:12px">
      <label class="mut" for="doubtFilter">Filtrar por trilha:</label>
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
                     aria-label="${staffUser ? 'Responder à dúvida' : 'Adicionar mensagem à dúvida'}"
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
    </section>

    <button class="btn" onclick="home()" style="width:100%;margin-top:16px">
      Voltar às trilhas
    </button>
  `;

  const filter = document.getElementById('doubtFilter');

  if (filter) {
    filter.value = doubtsTrackFilter;
  }

  // Assistente com IA: "Perguntar a um professor" leva a dúvida para a outra aba
  if (temAssistente) {
    window.dgxAssistente.montar(document.getElementById('dgxAssistente'), {
      aoPerguntarProfessor: texto => {
        dvTrocarAba('prof');
        const campo = document.getElementById('doubtText');
        if (campo) {
          campo.value = texto;
          campo.scrollIntoView({ block: 'center' });
          campo.focus();
        }
      }
    });

    // setas do teclado trocam de aba (padrão de abas acessíveis)
    document.querySelector('.dv-abas')?.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const proxima = doubtsAba === 'ia' ? 'prof' : 'ia';
      dvTrocarAba(proxima);
      document.getElementById(proxima === 'ia' ? 'dvAbaIa' : 'dvAbaProf')?.focus();
    });
  }

  doubtsAba = aba;
}

// Troca de aba sem recarregar (a conversa com a IA continua na tela)
let doubtsAba = null;

// Atalho para o Nix (app.html#nix, menu "Minha área" e comando de voz "Nix"):
// abre a tela de Dúvidas já na aba do assistente, com o cursor no campo
async function nix() {
  doubtsAba = 'ia';
  await doubts();
  dvTrocarAba('ia');
  document.querySelector('.dv-abas')?.scrollIntoView({ block: 'start' });
  document.getElementById('asCampo')?.focus({ preventScroll: true });
}

function dvTrocarAba(aba) {
  doubtsAba = aba;
  const ia = aba === 'ia';

  document.getElementById('dvPainelIa')?.toggleAttribute('hidden', !ia);
  document.getElementById('dvPainelProf')?.toggleAttribute('hidden', ia);

  [['dvAbaIa', ia], ['dvAbaProf', !ia]].forEach(([id, ligado]) => {
    const botao = document.getElementById(id);
    if (!botao) return;
    botao.setAttribute('aria-selected', String(ligado));
    botao.tabIndex = ligado ? 0 : -1;
  });
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
      .querySelectorAll('[data-app-nav]')
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

    // Título do topo da página acompanha a tela aberta.
    const info = VIEW_INFO[target];

    if (info) {
      const titulo = document.getElementById('appTitulo');
      const subtitulo = document.getElementById('appSubtitulo');

      if (titulo) titulo.textContent = info.titulo;
      if (subtitulo) subtitulo.textContent = info.sub;

      document.title = info.titulo + ' | Dragnix';
    }
  }

  // Título, subtítulo e texto da tela de carregamento de cada área.
  const VIEW_INFO = {
    home: {
      titulo: 'Minhas trilhas',
      sub: 'Continue seus estudos e aprenda novos conteúdos.',
      carregando: 'Carregando suas trilhas…'
    },
    badges: {
      titulo: 'Conquistas',
      sub: 'Veja suas conquistas e tudo que já desbloqueou.',
      carregando: 'Carregando conquistas…'
    },
    profile: {
      titulo: 'Meu perfil',
      sub: 'Edite seu nome e sua foto e acompanhe seu progresso.',
      carregando: 'Carregando seu perfil…'
    },
    rank: {
      titulo: 'Ranking',
      sub: 'Compare seu desempenho com outros alunos.',
      carregando: 'Carregando ranking…'
    },
    doubts: {
      titulo: 'Dúvidas',
      sub: 'Pergunte ao Nix, nosso assistente com IA, ou no Fórum de dúvidas.',
      carregando: 'Carregando dúvidas…'
    },
    gestao: {
      titulo: 'Gestão financeira',
      sub: 'Ferramentas para organizar e planejar o seu dinheiro.',
      carregando: 'Carregando…'
    }
  };

  // Textos da tela de carregamento das telas que não estão no menu.
  const LOADING_TEXT = {
    showTrack: 'Carregando a trilha…',
    openLesson: 'Carregando o módulo…',
    gastos: 'Carregando seus gastos…'
  };

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

  // O endereço acompanha a tela aberta (app.html#ranking, #perfil...).
  // Antes ele ficava com a tela anterior: depois de abrir o perfil por
  // app.html#perfil e ir para o Ranking, recarregar a página (F5, voltar do
  // navegador) reabria o perfil. replaceState não cria entrada no histórico.
  const HASH_DA_TELA = {
    badges: 'conquistas',
    profile: 'perfil',
    rank: 'ranking',
    doubts: 'duvidas',
    gestao: 'gestao'
  };

  function marcarEndereco(name, args) {
    let hash = HASH_DA_TELA[name] || '';

    if (name === 'showTrack' && Number(args[0]) > 0) {
      hash = 'trilha-' + Number(args[0]);
    }

    const atual = window.location.hash.replace(/^#/, '');

    if (atual === hash) return;

    try {
      history.replaceState(
        history.state,
        '',
        window.location.pathname + window.location.search + (hash ? '#' + hash : '')
      );
    } catch {
      // sem permissão para mudar o endereço: segue sem marcar
    }
  }

  // Região invisível que o leitor de tela lê quando a tela muda
  const anuncio = document.createElement('div');
  anuncio.className = 'a11y-anuncio';
  anuncio.setAttribute('role', 'status');
  anuncio.setAttribute('aria-live', 'polite');
  anuncio.style.cssText =
    'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;' +
    'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap';
  document.body.appendChild(anuncio);

  function anunciarTela() {
    const titulo =
      main.querySelector('h1, h2')?.textContent.trim().replace(/\s+/g, ' ') ||
      document.getElementById('appTitulo')?.textContent.trim() ||
      document.title;

    anuncio.textContent = '';

    // pequena pausa: alguns leitores ignoram a mesma frase repetida
    setTimeout(() => {
      anuncio.textContent = 'Tela aberta: ' + titulo;
    }, 120);
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
      marcarEndereco(name, args);

      const texto =
        LOADING_TEXT[name] ||
        VIEW_INFO[NAV_FOR[name]]?.carregando ||
        'Carregando…';

      // Enquanto a tela busca dados no banco, a tela anterior some na hora
      // e a mini-tela de carregamento fica no lugar (js/carregando.js).
      const result = window.dgxCarregando?.trocar
        ? window.dgxCarregando.trocar(main, texto, () => original.apply(this, args))
        : original.apply(this, args);

      Promise.resolve(result).then(anunciarTela, () => {});

      return result;
    };
  }

  VIEWS.forEach(name => wrap(name, false));
  LESSON_VIEWS.forEach(name => wrap(name, true));

  // Entrou no app vindo de outra página do site (ex.: Ranking pelo menu
  // da página inicial): o Voltar também aparece e leva de volta para ela.
  const VEIO_DE_FORA = (() => {
    try {
      const ref = new URL(document.referrer);
      return ref.origin === location.origin && ref.pathname !== location.pathname;
    } catch {
      return false;
    }
  })();

  window.goBack = function () {
    // Primeira tela aberta no app: volta para a página anterior do site
    // ou, se abriu direto, para Minhas trilhas.
    if (stack.length <= 1) {
      const atual = stack[stack.length - 1];

      if (VEIO_DE_FORA && history.length > 1) {
        history.back();
        return;
      }

      if (atual && atual.name !== 'home') {
        stack.length = 0;
        return window.home ? window.home() : undefined;
      }

      window.location.href = 'pag-inicial.html';
      return;
    }

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
    marcarEndereco(target.name, target.args);

    try {
      return originals[target.name](...target.args);
    } finally {
      replaying = false;
    }
  };

  // ----------------------------------------------------------
  // BOTÃO "← VOLTAR" NO TOPO DO CONTEÚDO
  // ----------------------------------------------------------
// ============================================================
// BOTÃO VOLTAR — NAVEGAÇÃO INTERNA
// ============================================================

const backButton = document.createElement('button');

backButton.type = 'button';
backButton.className = 'dragnix-back-btn';

backButton.innerHTML = `
  <span class="dragnix-back-icon" aria-hidden="true">
    ${icon('arrow-left')}
  </span>
  <span class="dragnix-back-label">Voltar</span>
`;

backButton.setAttribute(
  'aria-label',
  'Voltar para a tela anterior'
);

backButton.addEventListener('click', () => {
  window.goBack();
});

// Botões "← Voltar" antigos no topo de algumas telas (trilha, gestão
// financeira): com o Voltar geral visível eles ficariam repetidos lado a lado.
function botoesAntigosDoTopo() {
  const titulo = main.querySelector('h1, h2');
  return [...main.querySelectorAll('button.link')].filter(b =>
    b.querySelector('[data-lucide="arrow-left"], .lucide-arrow-left') &&
    (!titulo || (b.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING))
  );
}

function syncBackButton() {
  const current = stack[stack.length - 1];

  // aparece com histórico dentro do app, ao entrar vindo de outra página,
  // ou ao abrir direto uma tela que não é a de Minhas trilhas
  const show =
    !!current &&
    !current.transient &&
    (stack.length > 1 || VEIO_DE_FORA || current.name !== 'home');

  if (show) {
    if (main.firstElementChild !== backButton) {
      main.prepend(backButton);
    }
    botoesAntigosDoTopo().forEach(b => { b.hidden = true; });
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

// Inicialização da área do aluno
// Atalhos por endereço: app.html#conquistas, #perfil, #ranking, #duvidas, #nix, #gestao
const APP_HASH_VIEWS = {
  nix: 'nix',
  conquistas: 'badges',
  perfil: 'profile',
  ranking: 'rank',
  duvidas: 'doubts',
  gestao: 'gestao'
};

// Já dentro do app.html: o link "Editar perfil" do cabeçalho só troca o #hash.
// app.html#trilha-ID abre a apresentação da trilha (atalho do painel de gestão)
const abrirTrilhaPorHash = () => {
  const m = window.location.hash.match(/^#trilha-(\d+)$/);

  if (!m) return false;

  const id = Number(m[1]);

  if ((window.TRACKS || []).some(t => Number(t.id) === id)) {
    showTrack(id);
  }

  return true;
};

window.addEventListener('hashchange', () => {
  if (abrirTrilhaPorHash()) return;

  const view = APP_HASH_VIEWS[window.location.hash.slice(1)];

  if (view && typeof window[view] === 'function') {
    window[view]();
  }
});

// Endereço de entrada (ex.: app.html#ranking), guardado antes de abrir Trilhas,
// que marca o próprio endereço
const HASH_INICIAL = window.location.hash;

// Endereço pedindo uma tela (ex.: app.html#perfil, vindo do "Editar perfil"):
// abre DIRETO essa tela, com a mini-tela dela, em vez de mostrar
// "Carregando suas trilhas…" antes. Os números do topo (nível, moedas...)
// e a lista de trilhas carregam em segundo plano.
const VIEW_INICIAL = APP_HASH_VIEWS[HASH_INICIAL.slice(1)];
const ABRE_LICAO = new URLSearchParams(window.location.search).has('lesson');

if (VIEW_INICIAL && !ABRE_LICAO && typeof window[VIEW_INICIAL] === 'function') {
  window[VIEW_INICIAL]();
  refresh().catch(() => {});
} else Promise.resolve(home()).then(async () => {
  if (HASH_INICIAL && window.location.hash !== HASH_INICIAL) {
    history.replaceState(history.state, '', window.location.pathname + window.location.search + HASH_INICIAL);
  }

  abrirTrilhaPorHash();

  const view = APP_HASH_VIEWS[window.location.hash.slice(1)];

  if (view && typeof window[view] === 'function') {
    window[view]();
  }

  const params = new URLSearchParams(window.location.search);
  const lessonId = params.get('lesson');

  if (!lessonId || !/^[1-9]\d*$/.test(lessonId)) return;

  try {
    await openLesson(Number(lessonId));

    // Remove o parâmetro da URL após a tentativa de abertura
    window.history.replaceState(null, '', window.location.pathname);
  } catch (error) {
    console.error('Erro ao abrir a lição:', error);
  }
});