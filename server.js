const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
<<<<<<< HEAD
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const db = require('./db');

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const parsedPort = Number.parseInt(process.env.PORT || '', 10);

const PORT =
  Number.isInteger(parsedPort) && parsedPort > 0
    ? parsedPort
    : 3000;

const HOST = '0.0.0.0';

const SECRET =
  process.env.JWT_SECRET || 'dev-secret';

const app = express();

app.disable('x-powered-by');

const PUBLIC_DIR =
  path.join(__dirname, 'public');

// Permite usar Persistent Disk no Render.
// Sem UPLOAD_DIR, continua usando public/uploads.
const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  path.join(PUBLIC_DIR, 'uploads');

fs.mkdirSync(UPLOAD_DIR, {
  recursive: true
});

// ============================================================
// MIDDLEWARES
// ============================================================

const json = express.json();

const jsonBig = express.json({
  limit: '40mb'
});

// Upload pode receber arquivos grandes.
// Demais requisições usam limite padrão.
app.use((req, res, next) => {
  if (
    req.path === '/api/admin/upload' &&
    req.headers.authorization
  ) {
    return jsonBig(req, res, next);
  }

  return json(req, res, next);
});

// Arquivos estáticos do frontend.
app.use(
  express.static(PUBLIC_DIR)
);

// Se os uploads estiverem em um Persistent Disk,
// eles continuam acessíveis pela URL /uploads/...
app.use(
  '/uploads',
  express.static(UPLOAD_DIR)
);

// ============================================================
// HEALTH CHECK
// ============================================================

// IMPORTANTE:
// Essa rota precisa ficar ANTES do middleware 404 de /api.
// O Render usa essa rota para verificar se o serviço está saudável.

app.get('/api/health', (req, res) => {
  try {
    // Também verifica se o SQLite está funcionando.
    db.prepare('SELECT 1').get();

    return res.status(200).json({
      ok: true,
      service: 'Dragnix',
      status: 'online'
    });
  } catch (error) {
    console.error(
      'Health check falhou:',
      error
    );

    return res.status(503).json({
      ok: false,
      service: 'Dragnix',
      status: 'unavailable'
    });
  }
});

// ============================================================
// AUTENTICAÇÃO / JWT
// ============================================================

const sign = user =>
  jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    SECRET,
    {
      expiresIn: '7d'
    }
  );

const pub = user => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role
});

// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================================

function auth(req, res, next) {
  try {
    const header =
      req.headers.authorization || '';

    if (
      !header.startsWith('Bearer ')
    ) {
      return res.status(401).json({
        error: 'Não autenticado'
      });
    }

    const token =
      header.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        error: 'Não autenticado'
      });
    }

    const payload =
      jwt.verify(
        token,
        SECRET
      );

    const user =
      db
        .prepare(
          'SELECT * FROM users WHERE id=?'
        )
        .get(payload.id);

    if (!user) {
      return res.status(401).json({
        error:
          'Usuário não encontrado'
      });
    }

    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Não autenticado'
    });
  }
}

const adm = (req, res, next) => {
  if (
    req.user?.role !== 'adm'
  ) {
    return res.status(403).json({
      error:
        'Acesso restrito a administradores'
    });
  }

  next();
};

// ============================================================
// AUTENTICAÇÃO
// ============================================================

app.post(
  '/api/auth/register',
  (req, res) => {
    try {
      const {
        name,
        email,
        password,
        confirm
      } = req.body || {};

      const cleanName =
        String(name || '').trim();

      const cleanEmail =
        String(email || '')
          .trim()
          .toLowerCase();

      if (
        !cleanName ||
        !cleanEmail ||
        !password ||
        password.length < 6
      ) {
        return res.status(400).json({
          error:
            'Preencha nome, e-mail e senha (mín. 6 caracteres)'
        });
      }

      if (
        password !== confirm
      ) {
        return res.status(400).json({
          error:
            'As senhas não coincidem'
        });
      }

      const existing =
        db
          .prepare(
            'SELECT 1 FROM users WHERE email=?'
          )
          .get(cleanEmail);

      if (existing) {
        return res.status(409).json({
          error:
            'E-mail já cadastrado'
        });
      }

      const hash =
        bcrypt.hashSync(
          password,
          10
        );

      const id =
        db
          .prepare(
            `INSERT INTO users(
              name,
              email,
              password,
              role
            )
            VALUES(?,?,?,?)`
          )
          .run(
            cleanName,
            cleanEmail,
            hash,
            'comum'
          )
          .lastInsertRowid;

      const user =
        db
          .prepare(
            'SELECT * FROM users WHERE id=?'
          )
          .get(id);

      return res.json({
        token: sign(user),
        user: pub(user)
      });
    } catch (error) {
      console.error(
        'Erro no cadastro:',
        error
      );

      return res.status(500).json({
        error:
          'Erro interno ao realizar cadastro'
      });
    }
  }
);

app.post(
  '/api/auth/login',
  (req, res) => {
    try {
      const email =
        String(
          req.body?.email || ''
        )
          .trim()
          .toLowerCase();

      const password =
        String(
          req.body?.password || ''
        );

      const user =
        db
          .prepare(
            'SELECT * FROM users WHERE email=?'
          )
          .get(email);

      if (
        !user ||
        !bcrypt.compareSync(
          password,
          user.password
        )
      ) {
        return res.status(401).json({
          error:
            'E-mail ou senha inválidos'
        });
      }

      return res.json({
        token: sign(user),
        user: pub(user)
      });
    } catch (error) {
      console.error(
        'Erro no login:',
        error
      );

      return res.status(500).json({
        error:
          'Erro interno ao realizar login'
      });
    }
  }
);

// ============================================================
// VERSÃO / GIT
// ============================================================

function gitInfo() {
  try {
    const git = args =>
      execFileSync(
        'git',
        args,
        {
          cwd: __dirname,
          stdio: [
            'ignore',
            'pipe',
            'ignore'
          ],
          timeout: 3000
        }
      )
        .toString()
        .trim();

    const result =
      git([
        'log',
        '-1',
        '--format=%h|%cI|%s'
      ]);

    if (!result) {
      throw new Error(
        'Nenhum commit encontrado'
      );
    }

    const [
      hash,
      date,
      ...messageParts
    ] = result.split('|');

    return {
      hash:
        hash || 'unknown',

      date:
        date ||
        new Date().toISOString(),

      message:
        messageParts.join('|') ||
        'Sem mensagem',

      dirty:
        git([
          'status',
          '--porcelain'
        ]).length > 0
    };
  } catch (error) {
    return {
      hash: 'online',
      date:
        new Date().toISOString(),
      message:
        'Versão publicada',
      dirty: false
    };
  }
}

app.get(
  '/api/version',
  (req, res) => {
    res.json(
      gitInfo()
    );
  }
);

// ============================================================
// USUÁRIO ATUAL
// ============================================================

app.get(
  '/api/auth/me',
  auth,
  (req, res) => {
    res.json(
      pub(req.user)
    );
  }
);

// ============================================================
// CONSTANTES E UTILIDADES
// ============================================================

const MAX_HEARTS = 5;

const REGEN_MS =
  30 * 60 * 1000;

const dayStr = date =>
  date.toLocaleDateString(
    'sv-SE',
    {
      timeZone:
        'America/Sao_Paulo'
    }
  );

const today = () =>
  dayStr(new Date());

const yesterday = () =>
  dayStr(
    new Date(
      Date.now() - 864e5
    )
  );

const streakOf = user =>
  user &&
  (
    user.last_day === today() ||
    user.last_day === yesterday()
  )
    ? user.streak
    : 0;

const shuffle = array => {
  const result = [
    ...array
  ];

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() * (i + 1)
      );

    [
      result[i],
      result[j]
    ] = [
      result[j],
      result[i]
    ];
  }

  return result;
};

const norm = value =>
  String(value ?? '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    )
    .replace(
      /,/g,
      '.'
    )
    .trim();

const pairs = array =>
  array.map(value => {
    const index =
      String(value).indexOf('=');

    if (index < 0) {
      return [
        String(value).trim(),
        ''
      ];
    }

    return [
      String(value)
        .slice(0, index)
        .trim(),

      String(value)
        .slice(index + 1)
        .trim()
    ];
  });

const one = (
  sql,
  ...args
) =>
  db
    .prepare(sql)
    .get(...args);

// ============================================================
// VIDAS
// ============================================================

function hearts(id) {
  const user =
    db
      .prepare(
        `SELECT
          hearts,
          hearts_at
         FROM users
         WHERE id=?`
      )
      .get(id);

  if (!user) {
    return {
      hearts: 0,
      at: Date.now(),
      next: 0
    };
  }

  const now =
    Date.now();

  let heartsValue =
    Number(
      user.hearts ?? 0
    );

  let at =
    Number(
      user.hearts_at ??
      now
    );

  if (
    heartsValue <
    MAX_HEARTS
  ) {
    const generated =
      Math.floor(
        (now - at) /
          REGEN_MS
      );

    if (
      generated > 0
    ) {
      heartsValue =
        Math.min(
          MAX_HEARTS,
          heartsValue +
            generated
        );

      at +=
        generated *
        REGEN_MS;

      db.prepare(
        `UPDATE users
         SET hearts=?,
             hearts_at=?
         WHERE id=?`
      ).run(
        heartsValue,
        at,
        id
      );
    }
  }

  return {
    hearts:
      heartsValue,

    at,

    next:
      heartsValue >=
      MAX_HEARTS
        ? 0
        : Math.ceil(
            (
              at +
              REGEN_MS -
              now
            ) / 1000
          )
  };
}

function loseHeart(id) {
  const state =
    hearts(id);

  const newHearts =
    Math.max(
      0,
      state.hearts - 1
    );

  const newTime =
    state.hearts >=
    MAX_HEARTS
      ? Date.now()
      : state.at;

  db.prepare(
    `UPDATE users
     SET hearts=?,
         hearts_at=?
     WHERE id=?`
  ).run(
    newHearts,
    newTime,
    id
  );

  return hearts(id);
}

// ============================================================
// PROGRESSO
// ============================================================

const isDone = (
  uid,
  lid
) =>
  !!db
    .prepare(
      `SELECT 1
       FROM progress
       WHERE user_id=?
       AND lesson_id=?`
    )
    .get(
      uid,
      lid
    );

// ============================================================
// CONQUISTAS
// ============================================================

const A = [
  [
    'primeiro',
    '🌱',
    'Primeiro passo',
    'Conclua 1 lição',
    s => s.n >= 1
  ],

  [
    'cinco',
    '📘',
    'Estudioso',
    'Conclua 5 lições',
    s => s.n >= 5
  ],

  [
    'perfeita',
    '💎',
    'Sem erros',
    'Conclua uma lição sem errar nenhuma questão',
    s => s.perf >= 1
  ],

  [
    's3',
    '🔥',
    '3 dias seguidos',
    'Alcance uma sequência de 3 dias',
    s => s.best >= 3
  ],

  [
    's7',
    '🏅',
    'Semana de fogo',
    'Alcance uma sequência de 7 dias',
    s => s.best >= 7
  ],

  [
    's30',
    '👑',
    'Mestre da constância',
    'Alcance uma sequência de 30 dias',
    s => s.best >= 30
  ],

  [
    'xp100',
    '⭐',
    '100 XP',
    'Alcance 100 XP',
    s => s.xp >= 100
  ],

  [
    'xp500',
    '🚀',
    '500 XP',
    'Alcance 500 XP',
    s => s.xp >= 500
  ],

  [
    'trilha',
    '🏆',
    'Trilha completa',
    'Conclua todas as lições de uma trilha',
    s => s.tracks >= 1
  ]
];

function unlocked(uid) {
  const progress =
    db
      .prepare(
        `SELECT
           COUNT(*) n,
           COALESCE(
             SUM(xp),
             0
           ) xp,
           COALESCE(
             SUM(perfect),
             0
           ) perf
         FROM progress
         WHERE user_id=?`
      )
      .get(uid);

  const best =
    db
      .prepare(
        `SELECT best_streak b
         FROM users
         WHERE id=?`
      )
      .get(uid)
      ?.b || 0;

  const tracks =
    db
      .prepare(
        `SELECT COUNT(*) c
         FROM tracks t
         WHERE EXISTS(
           SELECT 1
           FROM lessons l
           WHERE l.track_id=t.id
         )
         AND NOT EXISTS(
           SELECT 1
           FROM lessons l
           WHERE l.track_id=t.id
           AND l.id NOT IN(
             SELECT lesson_id
             FROM progress
             WHERE user_id=?
           )
         )`
      )
      .get(uid)
      .c;

  const state = {
    n: progress.n,
    xp: progress.xp,
    perf: progress.perf,
    best,
    tracks
  };

  return A
    .filter(
      item =>
        item[4](state)
    )
    .map(
      item => item[0]
    );
}

// ============================================================
// GAMIFICAÇÃO
// ============================================================

const LEVEL = xp =>
  Math.floor(
    Math.sqrt(
      Math.max(0, xp) / 40
    )
  ) + 1;

const LEVEL_XP = level =>
  (level - 1) ** 2 * 40;

const BADGES = {
  primeira: [
    '🌱',
    'Primeiro passo',
    'Conclua sua 1ª lição',
    c => c.lessons >= 1
  ],

  cinco: [
    '📘',
    'Estudioso',
    'Conclua 5 lições',
    c => c.lessons >= 5
  ],

  perfeita: [
    '💯',
    'Perfeição',
    'Termine uma lição sem errar',
    c => c.perfect >= 1
  ],

  trilha: [
    '🏁',
    'Trilha completa',
    'Conclua todas as lições de uma trilha',
    c => c.tracks >= 1
  ],

  s3: [
    '🔥',
    'Em chamas',
    'Sequência de 3 dias',
    c => c.streak >= 3
  ],

  s7: [
    '⚡',
    'Imparável',
    'Sequência de 7 dias',
    c => c.streak >= 7
  ],

  n5: [
    '🏆',
    'Nível 5',
    'Alcance o nível 5',
    c => c.level >= 5
  ]
};

const MISSIONS = {
  licao: [
    '📚',
    'Conclua 1 lição',
    'lessons',
    1
  ],

  acertos: [
    '🎯',
    'Acerte 5 questões',
    'correct',
    5
  ],

  xp: [
    '⭐',
    'Ganhe 30 XP',
    'xp',
    30
  ]
};

function stats(uid) {
  const xp =
    one(
      `SELECT
         COALESCE(
           SUM(xp),
           0
         ) v
       FROM progress
       WHERE user_id=?`,
      uid
    ).v;

  const tracks =
    one(
      `SELECT COUNT(*) v
       FROM tracks t
       WHERE EXISTS(
         SELECT 1
         FROM lessons
         WHERE track_id=t.id
       )
       AND NOT EXISTS(
         SELECT 1
         FROM lessons l
         WHERE l.track_id=t.id
         AND l.id NOT IN(
           SELECT lesson_id
           FROM progress
           WHERE user_id=?
         )
       )`,
      uid
    ).v;

  const user =
    one(
      `SELECT
         streak,
         last_day,
         coins
       FROM users
       WHERE id=?`,
      uid
    );

  return {
    xp,
    level: LEVEL(xp),
    tracks,
    streak: streakOf(user),
    coins:
      user?.coins || 0,

    lessons:
      one(
        `SELECT COUNT(*) v
         FROM progress
         WHERE user_id=?`,
        uid
      ).v,

    perfect:
      one(
        `SELECT COUNT(*) v
         FROM progress
         WHERE user_id=?
         AND perfect=1`,
        uid
      ).v
  };
}

function awardBadges(uid) {
  const state =
    stats(uid);

  const have =
    new Set(
      db
        .prepare(
          `SELECT code
           FROM badges
           WHERE user_id=?`
        )
        .all(uid)
        .map(
          row => row.code
        )
    );

  const fresh = [];

  for (
    const [
      code,
      badge
    ]
    of Object.entries(
      BADGES
    )
  ) {
    if (
      !have.has(code) &&
      badge[3](state)
    ) {
      db.prepare(
        `INSERT INTO badges(
          user_id,
          code
        )
        VALUES(?,?)`
      ).run(
        uid,
        code
      );

      fresh.push({
        icon: badge[0],
        name: badge[1]
      });
    }
  }

  return fresh;
}

// ============================================================
// ATIVIDADES DIÁRIAS
// ============================================================

const todayAct = uid =>
  one(
    `SELECT
       xp,
       lessons,
       correct
     FROM activity
     WHERE user_id=?
     AND day=?`,
    uid,
    today()
  ) || {
    xp: 0,
    lessons: 0,
    correct: 0
  };

function bump(
  uid,
  fields
) {
  db.prepare(
    `INSERT OR IGNORE INTO activity(
      user_id,
      day
    )
    VALUES(?,?)`
  ).run(
    uid,
    today()
  );

  for (
    const [
      key,
      value
    ]
    of Object.entries(
      fields
    )
  ) {
    db.prepare(
      `UPDATE activity
       SET ${key}=${key}+?
       WHERE user_id=?
       AND day=?`
    ).run(
      value,
      uid,
      today()
    );
  }
}

// ============================================================
// ÁREA DO ALUNO
// ============================================================

app.get(
  '/api/tracks',
  auth,
  (req, res) => {
    try {
      const done =
        new Set(
          db
            .prepare(
              `SELECT lesson_id
               FROM progress
               WHERE user_id=?`
            )
            .all(
              req.user.id
            )
            .map(
              row =>
                row.lesson_id
            )
        );

      const lessons =
        db
          .prepare(
            `SELECT
               id,
               track_id,
               title,
               position,
               xp
             FROM lessons
             ORDER BY position,id`
          )
          .all();

      const questionCount =
        Object.fromEntries(
          db
            .prepare(
              `SELECT
                 lesson_id l,
                 COUNT(*) n
               FROM questions
               GROUP BY lesson_id`
            )
            .all()
            .map(
              row => [
                row.l,
                row.n
              ]
            )
        );

      const answerCount =
        Object.fromEntries(
          db
            .prepare(
              `SELECT
                 q.lesson_id l,
                 COUNT(*) n
               FROM answers a
               JOIN questions q
                 ON q.id=a.question_id
               WHERE a.user_id=?
               GROUP BY q.lesson_id`
            )
            .all(
              req.user.id
            )
            .map(
              row => [
                row.l,
                row.n
              ]
            )
        );

      const tracks =
        db
          .prepare(
            `SELECT *
             FROM tracks
             ORDER BY position,id`
          )
          .all()
          .map(
            track => ({
              ...track,

              presentation:
                (() => {
                  try {
                    return JSON.parse(
                      track.presentation ||
                        '[]'
                    );
                  } catch {
                    return [];
                  }
                })(),

              lessons:
                lessons
                  .filter(
                    lesson =>
                      lesson.track_id ===
                      track.id
                  )
                  .map(
                    (
                      lesson,
                      index,
                      array
                    ) => ({
                      ...lesson,

                      done:
                        done.has(
                          lesson.id
                        ),

                      total:
                        questionCount[
                          lesson.id
                        ] || 0,

                      answered:
                        answerCount[
                          lesson.id
                        ] || 0,

                      pct:
                        done.has(
                          lesson.id
                        )
                          ? 100
                          : questionCount[
                              lesson.id
                            ]
                            ? Math.min(
                                99,
                                Math.round(
                                  (
                                    (
                                      answerCount[
                                        lesson.id
                                      ] || 0
                                    ) /
                                    questionCount[
                                      lesson.id
                                    ]
                                  ) *
                                  100
                                )
                              )
                            : 0,

                      locked:
                        req.user.role !==
                          'adm' &&
                        index > 0 &&
                        !done.has(
                          array[
                            index - 1
                          ].id
                        )
                    })
                  )
            })
          );

      const heartState =
        hearts(
          req.user.id
        );

      const state =
        stats(
          req.user.id
        );

      res.json({
        tracks,
        xp: state.xp,
        level: state.level,
        coins: state.coins,
        streak: state.streak,
        hearts:
          heartState.hearts,
        next:
          heartState.next
      });
    } catch (error) {
      console.error(
        'Erro ao carregar trilhas:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao carregar trilhas'
      });
    }
  }
);

// ============================================================
// LIÇÕES
// ============================================================

app.get(
  '/api/lessons/:id',
  auth,
  (req, res) => {
    try {
      const lesson =
        db
          .prepare(
            `SELECT *
             FROM lessons
             WHERE id=?`
          )
          .get(
            req.params.id
          );

      if (!lesson) {
        return res.status(404).json({
          error:
            'Lição não encontrada'
        });
      }

      const done =
        isDone(
          req.user.id,
          lesson.id
        );

      const heartState =
        hearts(
          req.user.id
        );

      if (
        req.user.role !==
        'adm'
      ) {
        const previous =
          one(
            `SELECT id
             FROM lessons
             WHERE track_id=?
             AND (
               position<?
               OR (
                 position=?
                 AND id<?
               )
             )
             ORDER BY
               position DESC,
               id DESC
             LIMIT 1`,
            lesson.track_id,
            lesson.position,
            lesson.position,
            lesson.id
          );

        if (
          previous &&
          !isDone(
            req.user.id,
            previous.id
          )
        ) {
          return res.status(403).json({
            error:
              'Conclua a lição anterior primeiro 🔒'
          });
        }
      }

      if (
        heartState.hearts === 0 &&
        !done &&
        req.user.role !==
          'adm'
      ) {
        return res.status(403).json({
          error:
            `Você está sem vidas. Próxima vida em ${Math.ceil(
              heartState.next / 60
            )} min (ou recarregue no Perfil).`
        });
      }

      // Reinicia a tentativa atual.
      db.prepare(
        `DELETE FROM answers
         WHERE user_id=?
         AND question_id IN(
           SELECT id
           FROM questions
           WHERE lesson_id=?
         )`
      ).run(
        req.user.id,
        lesson.id
      );

      const questions =
        db
          .prepare(
            `SELECT
               id,
               prompt,
               options,
               type
             FROM questions
             WHERE lesson_id=?
             ORDER BY position,id`
          )
          .all(
            lesson.id
          )
          .map(
            question => {
              let options = [];

              try {
                options =
                  JSON.parse(
                    question.options ||
                      '[]'
                  );
              } catch {
                options = [];
              }

              const base = {
                id: question.id,
                prompt:
                  question.prompt,
                type:
                  question.type
              };

              if (
                question.type ===
                'ordenar'
              ) {
                return {
                  ...base,

                  items:
                    shuffle(
                      options.map(
                        (
                          text,
                          index
                        ) => ({
                          i: index,
                          t: text
                        })
                      )
                    )
                };
              }

              if (
                question.type ===
                'associar'
              ) {
                const parsed =
                  pairs(options);

                return {
                  ...base,

                  left:
                    parsed.map(
                      (
                        pair,
                        index
                      ) => ({
                        i: index,
                        t: pair[0]
                      })
                    ),

                  right:
                    shuffle(
                      parsed.map(
                        (
                          pair,
                          index
                        ) => ({
                          i: index,
                          t: pair[1]
                        })
                      )
                    )
                };
              }

              if (
                question.type ===
                'preencher'
              ) {
                return base;
              }

              return {
                ...base,
                options
              };
            }
          );

      let presentation = [];

      try {
        presentation =
          JSON.parse(
            lesson.presentation ||
              '[]'
          );
      } catch {
        presentation = [];
      }

      let content = [];

      try {
        content =
          JSON.parse(
            lesson.content ||
              '[]'
          );
      } catch {
        content = [];
      }

      if (
        !content.length &&
        lesson.intro
      ) {
        content = [
          {
            type: 'texto',
            value:
              lesson.intro
          }
        ];
      }

      res.json({
        id: lesson.id,
        title:
          lesson.title,
        presentation,
        content,
        xp: lesson.xp,
        questions,
        hearts:
          heartState.hearts,
        done
      });
    } catch (error) {
      console.error(
        'Erro ao carregar lição:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao carregar lição'
      });
    }
  }
);

// ============================================================
// QUESTÕES
// ============================================================

app.post(
  '/api/questions/:id/check',
  auth,
  (req, res) => {
    try {
      const question =
        db
          .prepare(
            'SELECT * FROM questions WHERE id=?'
          )
          .get(
            req.params.id
          );

      if (!question) {
        return res.status(404).json({
          error:
            'Questão não encontrada'
        });
      }

      let options = [];

      try {
        options =
          JSON.parse(
            question.options ||
              '[]'
          );
      } catch {
        options = [];
      }

      const answer =
        req.body?.answer;

      const multi =
        question.type ===
          'ordenar' ||
        question.type ===
          'associar';

      let correct = false;

      if (multi) {
        correct =
          Array.isArray(
            answer
          ) &&
          answer.length ===
            options.length &&
          answer.every(
            (
              value,
              index
            ) =>
              Number(value) ===
              index
          );
      } else if (
        question.type ===
        'preencher'
      ) {
        correct =
          options.some(
            option =>
              norm(option) ===
              norm(answer)
          );
      } else {
        correct =
          Number(answer) ===
          Number(
            question.answer
          );
      }

      db.prepare(
        `INSERT OR REPLACE INTO answers(
          user_id,
          question_id,
          correct
        )
        VALUES(?,?,?)`
      ).run(
        req.user.id,
        question.id,
        correct ? 1 : 0
      );

      if (correct) {
        bump(
          req.user.id,
          {
            correct: 1
          }
        );
      }

      const heartState =
        !correct &&
        !isDone(
          req.user.id,
          question.lesson_id
        )
          ? loseHeart(
              req.user.id
            )
          : hearts(
              req.user.id
            );

      res.json({
        correct,

        answer:
          multi ||
          question.type ===
            'preencher'
            ? null
            : question.answer,

        solution:
          multi ||
          question.type ===
            'preencher'
            ? options
            : null,

        explanation:
          question.explanation ||
          '',

        hearts:
          heartState.hearts
      });
    } catch (error) {
      console.error(
        'Erro ao corrigir questão:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao corrigir questão'
      });
    }
  }
);

// ============================================================
// CONCLUSÃO DA LIÇÃO
// ============================================================

app.post(
  '/api/lessons/:id/complete',
  auth,
  (req, res) => {
    try {
      const lesson =
        db
          .prepare(
            'SELECT * FROM lessons WHERE id=?'
          )
          .get(
            req.params.id
          );

      const uid =
        req.user.id;

      if (!lesson) {
        return res.status(404).json({
          error:
            'Lição não encontrada'
        });
      }

      const total =
        one(
          `SELECT COUNT(*) v
           FROM questions
           WHERE lesson_id=?`,
          lesson.id
        ).v;

      const result =
        one(
          `SELECT
             COUNT(*) n,
             COALESCE(
               SUM(correct),
               0
             ) c
           FROM answers
           WHERE user_id=?
           AND question_id IN(
             SELECT id
             FROM questions
             WHERE lesson_id=?
           )`,
          uid,
          lesson.id
        );

      if (
        result.n < total
      ) {
        return res.status(400).json({
          error:
            'Responda todas as questões'
        });
      }

      const perfect =
        total > 0 &&
        result.c === total
          ? 1
          : 0;

      let gained = 0;
      let coins = 0;

      if (
        !isDone(
          uid,
          lesson.id
        )
      ) {
        gained =
          Number(
            lesson.xp || 0
          ) +
          result.c * 2 +
          (perfect ? 10 : 0);

        coins =
          5 +
          (perfect ? 5 : 0);

        db.prepare(
          `INSERT INTO progress(
            user_id,
            lesson_id,
            xp,
            perfect,
            done_at
          )
          VALUES(?,?,?,?,?)`
        ).run(
          uid,
          lesson.id,
          gained,
          perfect,
          today()
        );

        db.prepare(
          `UPDATE users
           SET coins=coins+?
           WHERE id=?`
        ).run(
          coins,
          uid
        );

        bump(
          uid,
          {
            xp: gained,
            lessons: 1
          }
        );
      }

      const user =
        one(
          `SELECT
             streak,
             last_day,
             best_streak
           FROM users
           WHERE id=?`,
          uid
        );

      let streak =
        user?.streak || 0;

      if (
        user?.last_day !==
        today()
      ) {
        streak =
          user?.last_day ===
          yesterday()
            ? (user.streak || 0) +
              1
            : 1;

        const bestStreak =
          Math.max(
            user?.best_streak ||
              0,
            streak
          );

        db.prepare(
          `UPDATE users
           SET streak=?,
               last_day=?,
               best_streak=?
           WHERE id=?`
        ).run(
          streak,
          today(),
          bestStreak,
          uid
        );
      }

      const state =
        stats(uid);

      res.json({
        ok: true,
        streak,
        gained,
        coins,
        perfect:
          !!perfect,
        hits: result.c,
        total,
        level:
          state.level,

        levelUp:
          state.level >
          LEVEL(
            Math.max(
              0,
              state.xp -
                gained
            )
          ),

        badges:
          awardBadges(uid)
      });
    } catch (error) {
      console.error(
        'Erro ao concluir lição:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao concluir lição'
      });
    }
  }
);

// ============================================================
// PERFIL
// ============================================================

app.get(
  '/api/me/profile',
  auth,
  (req, res) => {
    try {
      const uid =
        req.user.id;

      const state =
        stats(uid);

      const activity =
        todayAct(uid);

      const claimed =
        new Set(
          db
            .prepare(
              `SELECT code
               FROM claims
               WHERE user_id=?
               AND day=?`
            )
            .all(
              uid,
              today()
            )
            .map(
              row => row.code
            )
        );

      const have =
        new Set(
          db
            .prepare(
              `SELECT code
               FROM badges
               WHERE user_id=?`
            )
            .all(uid)
            .map(
              row => row.code
            )
        );

      res.json({
        ...state,

        name:
          req.user.name,

        curXp:
          LEVEL_XP(
            state.level
          ),

        nextXp:
          LEVEL_XP(
            state.level + 1
          ),

        missions:
          Object.entries(
            MISSIONS
          ).map(
            ([
              code,
              [
                icon,
                label,
                key,
                goal
              ]
            ]) => ({
              code,
              icon,
              label,
              goal,

              value:
                Math.min(
                  activity[key],
                  goal
                ),

              done:
                activity[key] >=
                goal,

              claimed:
                claimed.has(
                  code
                )
            })
          ),

        badges:
          Object.entries(
            BADGES
          ).map(
            ([
              code,
              badge
            ]) => ({
              code,
              icon: badge[0],
              name: badge[1],
              desc: badge[2],
              got:
                have.has(code)
            })
          ),

        week:
          db
            .prepare(
              `SELECT
                 day,
                 xp
               FROM activity
               WHERE user_id=?
               ORDER BY day DESC
               LIMIT 7`
            )
            .all(uid)
            .reverse()
      });
    } catch (error) {
      console.error(
        'Erro ao carregar perfil:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao carregar perfil'
      });
    }
  }
);

// ============================================================
// MISSÕES
// ============================================================

app.post(
  '/api/missions/:code/claim',
  auth,
  (req, res) => {
    try {
      const mission =
        MISSIONS[
          req.params.code
        ];

      if (!mission) {
        return res.status(404).json({
          error:
            'Missão não encontrada'
        });
      }

      const activity =
        todayAct(
          req.user.id
        );

      if (
        activity[
          mission[2]
        ] <
        mission[3]
      ) {
        return res.status(400).json({
          error:
            'Missão ainda não concluída'
        });
      }

      const inserted =
        db
          .prepare(
            `INSERT OR IGNORE INTO claims(
              user_id,
              day,
              code
            )
            VALUES(?,?,?)`
          )
          .run(
            req.user.id,
            today(),
            req.params.code
          ).changes;

      if (inserted) {
        db.prepare(
          `UPDATE users
           SET coins=coins+10
           WHERE id=?`
        ).run(
          req.user.id
        );
      }

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        'Erro ao resgatar missão:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao resgatar missão'
      });
    }
  }
);

// ============================================================
// LOJA - VIDAS
// ============================================================

app.post(
  '/api/shop/hearts',
  auth,
  (req, res) => {
    try {
      const COST = 30;

      const current =
        hearts(
          req.user.id
        );

      if (
        current.hearts >=
        MAX_HEARTS
      ) {
        return res.status(400).json({
          error:
            'Suas vidas já estão cheias'
        });
      }

      const coins =
        one(
          `SELECT coins
           FROM users
           WHERE id=?`,
          req.user.id
        ).coins || 0;

      if (
        coins < COST
      ) {
        return res.status(400).json({
          error:
            `Você precisa de ${COST} moedas`
        });
      }

      db.prepare(
        `UPDATE users
         SET coins=coins-?,
             hearts=?,
             hearts_at=?
         WHERE id=?`
      ).run(
        COST,
        MAX_HEARTS,
        Date.now(),
        req.user.id
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        'Erro ao comprar vidas:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao comprar vidas'
      });
    }
  }
);

// ============================================================
// FINANCEIRO
// ============================================================

app.get(
  '/api/finance',
  auth,
  (req, res) => {
    try {
      const month =
        /^\d{4}-\d{2}$/.test(
          req.query.month || ''
        )
          ? req.query.month
          : today().slice(0, 7);

      const entries =
        db
          .prepare(
            `SELECT
               id,
               kind,
               category,
               description,
               amount,
               day
             FROM finance
             WHERE user_id=?
             AND substr(day,1,7)=?
             ORDER BY day DESC,id DESC`
          )
          .all(
            req.user.id,
            month
          );

      res.json({
        month,
        entries
      });
    } catch (error) {
      console.error(
        'Erro ao carregar financeiro:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao carregar dados financeiros'
      });
    }
  }
);

app.post(
  '/api/finance',
  auth,
  (req, res) => {
    try {
      const {
        kind,
        category,
        description,
        amount,
        day
      } = req.body || {};

      const value =
        Number(amount);

      if (
        ![
          'gasto',
          'receita'
        ].includes(kind)
      ) {
        return res.status(400).json({
          error:
            'Tipo inválido'
        });
      }

      if (
        !(value > 0) ||
        value > 1e9
      ) {
        return res.status(400).json({
          error:
            'Informe um valor maior que zero'
        });
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          day || ''
        )
      ) {
        return res.status(400).json({
          error:
            'Data inválida'
        });
      }

      const result =
        db
          .prepare(
            `INSERT INTO finance(
              user_id,
              kind,
              category,
              description,
              amount,
              day
            )
            VALUES(?,?,?,?,?,?)`
          )
          .run(
            req.user.id,
            kind,
            String(
              category ||
                'Outros'
            ).slice(0, 40),
            String(
              description || ''
            ).slice(0, 100),
            Math.round(
              value * 100
            ) / 100,
            day
          );

      res.json({
        id:
          Number(
            result.lastInsertRowid
          )
      });
    } catch (error) {
      console.error(
        'Erro ao salvar lançamento:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao salvar lançamento'
      });
    }
  }
);

app.delete(
  '/api/finance/:id',
  auth,
  (req, res) => {
    try {
      db.prepare(
        `DELETE FROM finance
         WHERE id=?
         AND user_id=?`
      ).run(
        req.params.id,
        req.user.id
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        'Erro ao excluir lançamento:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao excluir lançamento'
      });
    }
  }
);

// ============================================================
// RANKING
// ============================================================

app.get(
  '/api/ranking',
  auth,
  (req, res) => {
    try {
      const rows =
        db
          .prepare(
            `SELECT
               u.id,
               u.name,
               u.streak,
               u.last_day,
               COALESCE(
                 SUM(p.xp),
                 0
               ) xp
             FROM users u
             LEFT JOIN progress p
               ON p.user_id=u.id
             WHERE u.role='comum'
             GROUP BY u.id
             ORDER BY xp DESC,u.name
             LIMIT 20`
          )
          .all();

      res.json(
        rows.map(
          row => ({
            name:
              row.name,

            xp:
              row.xp,

            level:
              LEVEL(row.xp),

            streak:
              streakOf(row),

            me:
              row.id ===
              req.user.id
          })
        )
      );
    } catch (error) {
      console.error(
        'Erro ao carregar ranking:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao carregar ranking'
      });
    }
  }
);

// ============================================================
// ADMINISTRAÇÃO
// ============================================================

const FIELDS = {
  tracks: [
    'title',
    'description',
    'icon',
    'color',
    'presentation',
    'position'
  ],

  lessons: [
    'track_id',
    'title',
    'intro',
    'presentation',
    'content',
    'xp',
    'position'
  ],

  questions: [
    'lesson_id',
    'type',
    'prompt',
    'options',
    'answer',
    'explanation',
    'position'
  ]
};

const clean = (
  resource,
  body
) =>
  FIELDS[resource].reduce(
    (
      result,
      field
    ) => {
      if (
        body[field] !==
        undefined
      ) {
        if (
          field ===
            'content' ||
          field ===
            'presentation'
        ) {
          result[field] =
            JSON.stringify(
              body[field]
            );
        } else if (
          field ===
          'options'
        ) {
          result[field] =
            JSON.stringify(
              body.type ===
                'vf'
                ? [
                    'Verdadeiro',
                    'Falso'
                  ]
                : body[field]
            );
        } else {
          result[field] =
            body[field];
        }
      }

      return result;
    },
    {}
  );

// ============================================================
// ÁRVORE ADMIN
// ============================================================

app.get(
  '/api/admin/tree',
  auth,
  adm,
  (req, res) => {
    try {
      const questions =
        db
          .prepare(
            `SELECT *
             FROM questions
             ORDER BY position,id`
          )
          .all()
          .map(
            question => {
              let options = [];

              try {
                options =
                  JSON.parse(
                    question.options ||
                      '[]'
                  );
              } catch {
                options = [];
              }

              return {
                ...question,
                options
              };
            }
          );

      const lessons =
        db
          .prepare(
            `SELECT *
             FROM lessons
             ORDER BY position,id`
          )
          .all()
          .map(
            lesson => ({
              ...lesson,

              presentation:
                (() => {
                  try {
                    return JSON.parse(
                      lesson.presentation ||
                        '[]'
                    );
                  } catch {
                    return [];
                  }
                })(),

              content:
                (() => {
                  try {
                    return JSON.parse(
                      lesson.content ||
                        '[]'
                    );
                  } catch {
                    return [];
                  }
                })(),

              questions:
                questions.filter(
                  question =>
                    question.lesson_id ===
                    lesson.id
                )
            })
          );

      const tracks =
        db
          .prepare(
            `SELECT *
             FROM tracks
             ORDER BY position,id`
          )
          .all()
          .map(
            track => ({
              ...track,

              presentation:
                (() => {
                  try {
                    return JSON.parse(
                      track.presentation ||
                        '[]'
                    );
                  } catch {
                    return [];
                  }
                })(),

              lessons:
                lessons.filter(
                  lesson =>
                    lesson.track_id ===
                    track.id
                )
            })
          );

      res.json(
        tracks
      );
    } catch (error) {
      console.error(
        'Erro ao carregar árvore ADM:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao carregar dados administrativos'
      });
    }
  }
);

// ============================================================
// MÓDULOS
// ============================================================

const MAX_MODULES = 10;

app.post(
  '/api/admin/tracks',
  auth,
  adm,
  (req, res) => {
    try {
      const data =
        clean(
          'tracks',
          req.body || {}
        );

      const keys =
        Object.keys(data);

      if (
        !keys.length
      ) {
        return res.status(400).json({
          error:
            'Nenhum dado informado'
        });
      }

      const id =
        db
          .prepare(
            `INSERT INTO tracks(${keys})
             VALUES(${keys.map(
               () => '?'
             )})`
          )
          .run(
            ...Object.values(
              data
            )
          )
          .lastInsertRowid;

      db.prepare(
        `INSERT INTO lessons(
          track_id,
          title,
          position,
          xp
        )
        VALUES(?,?,0,10)`
      ).run(
        id,
        'Módulo 1'
      );

      res.json({
        id
      });
    } catch (error) {
      console.error(
        'Erro ao criar trilha:',
        error
      );

      res.status(400).json({
        error:
          error.message
      });
    }
  }
);

app.post(
  '/api/admin/lessons',
  auth,
  adm,
  (req, res, next) => {
    try {
      const trackId =
        Number(
          req.body?.track_id
        );

      if (
        !Number.isInteger(
          trackId
        ) ||
        trackId <= 0
      ) {
        return res.status(400).json({
          error:
            'Trilha inválida'
        });
      }

      const trackExists =
        one(
          `SELECT 1
           FROM tracks
           WHERE id=?`,
          trackId
        );

      if (!trackExists) {
        return res.status(404).json({
          error:
            'Trilha não encontrada'
        });
      }

      const count =
        one(
          `SELECT COUNT(*) v
           FROM lessons
           WHERE track_id=?`,
          trackId
        ).v;

      if (
        count >=
        MAX_MODULES
      ) {
        return res.status(400).json({
          error:
            `Cada trilha pode ter no máximo ${MAX_MODULES} módulos`
        });
      }

      next('route');
    } catch (error) {
      console.error(
        'Erro ao verificar limite de módulos:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao verificar limite de módulos'
      });
    }
  }
);

app.delete(
  '/api/admin/lessons/:id',
  auth,
  adm,
  (req, res, next) => {
    try {
      const lesson =
        one(
          `SELECT track_id
           FROM lessons
           WHERE id=?`,
          req.params.id
        );

      if (
        lesson &&
        one(
          `SELECT COUNT(*) v
           FROM lessons
           WHERE track_id=?`,
          lesson.track_id
        ).v <= 1
      ) {
        return res.status(400).json({
          error:
            'Cada trilha precisa ter ao menos 1 módulo'
        });
      }

      next('route');
    } catch (error) {
      console.error(
        'Erro ao verificar módulo:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao verificar módulo'
      });
    }
  }
);

// ============================================================
// UPLOAD
// ============================================================

const ALLOWED_EXTENSIONS =
  new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'mp4',
    'webm'
  ]);

app.post(
  '/api/admin/upload',
  auth,
  adm,
  (req, res) => {
    try {
      const originalName =
        String(
          req.body?.name ||
            ''
        );

      const extension =
        originalName
          .split('.')
          .pop()
          .toLowerCase();

      if (
        !ALLOWED_EXTENSIONS.has(
          extension
        )
      ) {
        return res.status(400).json({
          error:
            'Formato não permitido (use png, jpg, gif, webp, mp4 ou webm)'
        });
      }

      let base64 =
        String(
          req.body?.data ||
            ''
        );

      // Aceita tanto base64 puro quanto data URL:
      // data:image/png;base64,...
      if (
        base64.includes(',')
      ) {
        base64 =
          base64.substring(
            base64.indexOf(',') +
              1
          );
      }

      const buffer =
        Buffer.from(
          base64,
          'base64'
        );

      if (
        !buffer.length
      ) {
        return res.status(400).json({
          error:
            'Arquivo vazio'
        });
      }

      if (
        buffer.length >
        25 *
          1024 *
          1024
      ) {
        return res.status(400).json({
          error:
            'Arquivo maior que 25 MB'
        });
      }

      const filename =
        crypto
          .randomBytes(8)
          .toString('hex') +
        '.' +
        extension;

      const filepath =
        path.join(
          UPLOAD_DIR,
          filename
        );

      fs.writeFileSync(
        filepath,
        buffer
      );

      return res.json({
        url:
          '/uploads/' +
          filename
      });
    } catch (error) {
      console.error(
        'Erro no upload:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao enviar arquivo'
      });
    }
  }
);

// ============================================================
// ADMIN - CRUD GENÉRICO
// ============================================================

app.post(
  '/api/admin/:res',
  auth,
  adm,
  (req, res) => {
    try {
      const resource =
        req.params.res;

      if (
        !FIELDS[resource]
      ) {
        return res.status(404).json({
          error:
            'Recurso não encontrado'
        });
      }

      const data =
        clean(
          resource,
          req.body || {}
        );

      const keys =
        Object.keys(data);

      if (
        !keys.length
      ) {
        return res.status(400).json({
          error:
            'Nenhum dado informado'
        });
      }

      const result =
        db
          .prepare(
            `INSERT INTO ${resource}(${keys})
             VALUES(${keys.map(
               () => '?'
             )})`
          )
          .run(
            ...Object.values(
              data
            )
          );

      res.json({
        id:
          result.lastInsertRowid
      });
    } catch (error) {
      console.error(
        'Erro ao criar registro ADM:',
        error
      );

      res.status(400).json({
        error:
          error.message
      });
    }
  }
);

app.put(
  '/api/admin/:res/:id',
  auth,
  adm,
  (req, res) => {
    try {
      const resource =
        req.params.res;

      if (
        !FIELDS[resource]
      ) {
        return res.status(404).json({
          error:
            'Recurso não encontrado'
        });
      }

      const data =
        clean(
          resource,
          req.body || {}
        );

      const keys =
        Object.keys(data);

      if (
        !keys.length
      ) {
        return res.status(400).json({
          error:
            'Nenhum dado informado'
        });
      }

      db.prepare(
        `UPDATE ${resource}
         SET ${keys.map(
           key => `${key}=?`
         )}
         WHERE id=?`
      ).run(
        ...Object.values(
          data
        ),
        req.params.id
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        'Erro ao atualizar registro ADM:',
        error
      );

      res.status(400).json({
        error:
          error.message
      });
    }
  }
);

// ============================================================
// ADMIN - USUÁRIOS
// ============================================================

app.delete(
  '/api/admin/users/:id',
  auth,
  adm,
  (req, res) => {
    try {
      const id =
        Number(
          req.params.id
        );

      if (
        id ===
        req.user.id
      ) {
        return res.status(400).json({
          error:
            'Você não pode excluir a própria conta'
        });
      }

      const user =
        db
          .prepare(
            `SELECT 1
             FROM users
             WHERE id=?`
          )
          .get(id);

      if (!user) {
        return res.status(404).json({
          error:
            'Usuário não encontrado'
        });
      }

      const dependentTables = [
        'progress',
        'answers',
        'activity',
        'badges',
        'claims',
        'finance'
      ];

      for (
        const table
        of dependentTables
      ) {
        db.prepare(
          `DELETE FROM ${table}
           WHERE user_id=?`
        ).run(id);
      }

      db.prepare(
        `DELETE FROM users
         WHERE id=?`
      ).run(id);

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        'Erro ao excluir usuário:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao excluir usuário'
      });
    }
  }
);

// ============================================================
// ADMIN - EXCLUSÃO GENÉRICA
// ============================================================

app.delete(
  '/api/admin/:res/:id',
  auth,
  adm,
  (req, res) => {
    try {
      const resource =
        req.params.res;

      if (
        !FIELDS[resource]
      ) {
        return res.status(404).json({
          error:
            'Recurso não encontrado'
        });
      }

      db.prepare(
        `DELETE FROM ${resource}
         WHERE id=?`
      ).run(
        req.params.id
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        'Erro ao excluir registro ADM:',
        error
      );

      res.status(400).json({
        error:
          error.message
      });
    }
  }
);

// ============================================================
// ADMIN - LISTAGEM DE USUÁRIOS
// ============================================================

app.get(
  '/api/admin/users',
  auth,
  adm,
  (req, res) => {
    try {
      res.json(
        db
          .prepare(
            `SELECT
               id,
               name,
               email,
               role
             FROM users
             ORDER BY name`
          )
          .all()
      );
    } catch (error) {
      console.error(
        'Erro ao listar usuários:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao listar usuários'
      });
    }
  }
);

// ============================================================
// ADMIN - ALTERAR PERFIL
// ============================================================

app.put(
  '/api/admin/users/:id/role',
  auth,
  adm,
  (req, res) => {
    try {
      const role =
        req.body?.role;

      if (
        ![
          'comum',
          'adm'
        ].includes(role)
      ) {
        return res.status(400).json({
          error:
            'Perfil inválido'
        });
      }

      const id =
        Number(
          req.params.id
        );

      if (
        id ===
        req.user.id
      ) {
        return res.status(400).json({
          error:
            'Você não pode alterar o próprio perfil'
        });
      }

      const user =
        db
          .prepare(
            `SELECT 1
             FROM users
             WHERE id=?`
          )
          .get(id);

      if (!user) {
        return res.status(404).json({
          error:
            'Usuário não encontrado'
        });
      }

      db.prepare(
        `UPDATE users
         SET role=?
         WHERE id=?`
      ).run(
        role,
        id
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(
        'Erro ao alterar perfil:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao alterar perfil'
      });
    }
  }
);

// ============================================================
// ROTA PRINCIPAL
// ============================================================

app.get(
  '/',
  (req, res) => {
    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'index.html'
      )
    );
  }
);

// ============================================================
// TRATAMENTO DE JSON INVÁLIDO
// ============================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    if (
      error instanceof
        SyntaxError &&
      error.status === 400 &&
      error.type ===
        'entity.parse.failed'
    ) {
      return res.status(400).json({
        error:
          'JSON inválido'
      });
    }

    next(error);
  }
);

// ============================================================
// 404 DAS APIs
// ============================================================

// IMPORTANTE:
// Fica DEPOIS de todas as rotas /api,
// inclusive /api/health.

app.use(
  '/api',
  (req, res) => {
    res.status(404).json({
      error:
        'Endpoint não encontrado'
    });
  }
);

// ============================================================
// 404 GERAL
// ============================================================

app.use(
  (req, res) => {
    res.status(404).send(
      'Página não encontrada'
    );
  }
);

// ============================================================
// TRATAMENTO GLOBAL DE ERROS
// ============================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      'Erro não tratado:',
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({
      error:
        'Erro interno do servidor'
    });
  }
);

// ============================================================
// INICIALIZAÇÃO
// ============================================================

const server =
  app.listen(
    PORT,
    HOST,
    () => {
      console.log(
        `Dragnix rodando em ${HOST}:${PORT}`
      );

      console.log(
        `Frontend: ${PUBLIC_DIR}`
      );

      console.log(
        `Uploads: ${UPLOAD_DIR}`
      );
    }
  );

// ============================================================
// ENCERRAMENTO SEGURO
// ============================================================

function shutdown(
  signal
) {
  console.log(
    `${signal} recebido. Encerrando servidor...`
  );

  server.close(
    () => {
      try {
        if (
          typeof db.close ===
          'function'
        ) {
          db.close();
        }
      } catch (error) {
        console.error(
          'Erro ao fechar banco:',
          error
        );
      }

      process.exit(0);
    }
  );
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);
=======
const fs = require('fs'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const app = express();
const json = express.json(), jsonBig = express.json({ limit: '40mb' }); // o limite maior vale só para o upload do ADM
app.use((req, res, next) => (req.path === '/api/admin/upload' && req.headers.authorization ? jsonBig : json)(req, res, next));
app.use(express.static(path.join(__dirname, 'public')));

const sign = u => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '7d' });
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// ---------- Middlewares ----------
function auth(req, res, next) {
  try {
    const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(p.id);
    if (!u) throw 0;
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Não autenticado' }); }
}
const adm = (req, res, next) => req.user.role === 'adm' ? next() : res.status(403).json({ error: 'Acesso restrito a administradores' });

// ---------- Autenticação ----------
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, confirm } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Preencha nome, e-mail e senha (mín. 6 caracteres)' });
  if (password !== confirm) return res.status(400).json({ error: 'As senhas não coincidem' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'E-mail já cadastrado' });
  // Todo cadastro público é "comum". ADM só é promovido por outro ADM.
  const id = db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run(name, email, bcrypt.hashSync(password, 10), 'comum').lastInsertRowid;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  res.json({ token: sign(u), user: pub(u) });
});
app.post('/api/auth/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(req.body.email || '');
  if (!u || !bcrypt.compareSync(req.body.password || '', u.password)) return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  res.json({ token: sign(u), user: pub(u) });
});
// Último commit do git (lido na hora, então acompanha novos commits sem reiniciar). Público: a splash usa antes do login.
function gitInfo() {
  try { // 1º: comando git
    const git = args => execFileSync('git', args, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim();
    const [hash, date, ...msg] = git(['log', '-1', '--format=%h|%cI|%s']).split('|');
    return { hash, date, message: msg.join('|'), dirty: git(['status', '--porcelain']).length > 0 };
  } catch {
    // 2º: sem o comando git (não está no PATH, "dubious ownership" no Windows etc.), lê o histórico em .git/logs/HEAD
    const linhas = fs.readFileSync(path.join(__dirname, '.git', 'logs', 'HEAD'), 'utf8').trim().split('\n');
    const [meta, msg = ''] = linhas[linhas.length - 1].split('\t');
    const m = meta.match(/^\w+ (\w+) .* (\d+) [+-]\d{4}$/);
    return { hash: m[1].slice(0, 7), date: new Date(m[2] * 1000).toISOString(), message: msg.replace(/^[^:]+: ?/, ''), dirty: false };
  }
}
app.get('/api/version', (req, res) => {
  try { res.json(gitInfo()); } catch { res.json({ error: 'pasta .git não encontrada' }); }
});
app.get('/api/auth/me', auth, (req, res) => res.json(pub(req.user)));

// ---------- Constantes e utilidades ----------
const MAX_HEARTS = 5, REGEN_MS = 30 * 60 * 1000; // 1 vida a cada 30 min
const DAILY_GOAL = 2, PERFECT_BONUS = 5;          // meta diária (lições) e XP extra por lição sem erros
const dayStr = d => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const today = () => dayStr(new Date()), yesterday = () => dayStr(new Date(Date.now() - 864e5));
const streakOf = u => (u.last_day === today() || u.last_day === yesterday()) ? u.streak : 0;
const shuffle = a => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '.').trim();
const pairs = o => o.map(s => { const k = s.indexOf('='); return k < 0 ? [s.trim(), ''] : [s.slice(0, k).trim(), s.slice(k + 1).trim()]; });
const errs = new Map(); // erros por tentativa (usuário:lição) para detectar lição perfeita
function hearts(id) {
  const u = db.prepare('SELECT hearts,hearts_at FROM users WHERE id=?').get(id), now = Date.now();
  let h = u.hearts, at = u.hearts_at;
  if (h < MAX_HEARTS) {
    const g = Math.floor((now - at) / REGEN_MS);
    if (g > 0) { h = Math.min(MAX_HEARTS, h + g); at += g * REGEN_MS; db.prepare('UPDATE users SET hearts=?,hearts_at=? WHERE id=?').run(h, at, id); }
  }
  return { hearts: h, at, next: h >= MAX_HEARTS ? 0 : Math.ceil((at + REGEN_MS - now) / 1000) };
}
function loseHeart(id) {
  const s = hearts(id);
  db.prepare('UPDATE users SET hearts=?,hearts_at=? WHERE id=?').run(Math.max(0, s.hearts - 1), s.hearts >= MAX_HEARTS ? Date.now() : s.at, id);
  return hearts(id);
}
const isDone = (uid, lid) => !!db.prepare('SELECT 1 FROM progress WHERE user_id=? AND lesson_id=?').get(uid, lid);
const goalDone = uid => db.prepare('SELECT COUNT(*) c FROM progress WHERE user_id=? AND done_at=?').get(uid, today()).c;
const totalXp = uid => db.prepare('SELECT COALESCE(SUM(xp),0) xp FROM progress WHERE user_id=?').get(uid).xp;

// ---------- Conquistas (calculadas a partir do progresso) ----------
const A = [
  ['primeiro', '🌱', 'Primeiro passo', 'Conclua 1 lição', s => s.n >= 1],
  ['cinco', '📘', 'Estudioso', 'Conclua 5 lições', s => s.n >= 5],
  ['perfeita', '💎', 'Sem erros', 'Conclua uma lição sem errar nenhuma questão', s => s.perf >= 1],
  ['s3', '🔥', '3 dias seguidos', 'Alcance uma sequência de 3 dias', s => s.best >= 3],
  ['s7', '🏅', 'Semana de fogo', 'Alcance uma sequência de 7 dias', s => s.best >= 7],
  ['s30', '👑', 'Mestre da constância', 'Alcance uma sequência de 30 dias', s => s.best >= 30],
  ['xp100', '⭐', '100 XP', 'Alcance 100 XP', s => s.xp >= 100],
  ['xp500', '🚀', '500 XP', 'Alcance 500 XP', s => s.xp >= 500],
  ['trilha', '🏆', 'Trilha completa', 'Conclua todas as lições de uma trilha', s => s.tracks >= 1],
];
function unlocked(uid) {
  const p = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(xp),0) xp, COALESCE(SUM(perfect),0) perf FROM progress WHERE user_id=?').get(uid);
  const best = db.prepare('SELECT best_streak b FROM users WHERE id=?').get(uid).b;
  const tracks = db.prepare(`SELECT COUNT(*) c FROM tracks t WHERE EXISTS(SELECT 1 FROM lessons l WHERE l.track_id=t.id)
    AND NOT EXISTS(SELECT 1 FROM lessons l WHERE l.track_id=t.id AND l.id NOT IN (SELECT lesson_id FROM progress WHERE user_id=?))`).get(uid).c;
  const s = { n: p.n, xp: p.xp, perf: p.perf, best, tracks };
  return A.filter(a => a[4](s)).map(a => a[0]);
}

// ---------- Gamificação ----------
const LEVEL = xp => Math.floor(Math.sqrt(xp / 40)) + 1, LEVEL_XP = n => (n - 1) ** 2 * 40;
const BADGES = {
  primeira: ['🌱', 'Primeiro passo', 'Conclua sua 1ª lição', c => c.lessons >= 1],
  cinco: ['📘', 'Estudioso', 'Conclua 5 lições', c => c.lessons >= 5],
  perfeita: ['💯', 'Perfeição', 'Termine uma lição sem errar', c => c.perfect >= 1],
  trilha: ['🏁', 'Trilha completa', 'Conclua todas as lições de uma trilha', c => c.tracks >= 1],
  s3: ['🔥', 'Em chamas', 'Sequência de 3 dias', c => c.streak >= 3],
  s7: ['⚡', 'Imparável', 'Sequência de 7 dias', c => c.streak >= 7],
  n5: ['🏆', 'Nível 5', 'Alcance o nível 5', c => c.level >= 5],
};
const MISSIONS = { licao: ['📚', 'Conclua 1 lição', 'lessons', 1], acertos: ['🎯', 'Acerte 5 questões', 'correct', 5], xp: ['⭐', 'Ganhe 30 XP', 'xp', 30] };
const one = (sql, ...a) => db.prepare(sql).get(...a);
function stats(uid) {
  const xp = one('SELECT COALESCE(SUM(xp),0) v FROM progress WHERE user_id=?', uid).v;
  const tracks = one(`SELECT COUNT(*) v FROM tracks t WHERE EXISTS(SELECT 1 FROM lessons WHERE track_id=t.id) AND NOT EXISTS(
    SELECT 1 FROM lessons l WHERE l.track_id=t.id AND l.id NOT IN (SELECT lesson_id FROM progress WHERE user_id=?))`, uid).v;
  const u = one('SELECT streak,last_day,coins FROM users WHERE id=?', uid);
  return { xp, level: LEVEL(xp), tracks, streak: streakOf(u), coins: u.coins,
    lessons: one('SELECT COUNT(*) v FROM progress WHERE user_id=?', uid).v, perfect: one('SELECT COUNT(*) v FROM progress WHERE user_id=? AND perfect=1', uid).v };
}
function awardBadges(uid) {
  const s = stats(uid), have = new Set(db.prepare('SELECT code FROM badges WHERE user_id=?').all(uid).map(r => r.code)), fresh = [];
  for (const [code, b] of Object.entries(BADGES)) if (!have.has(code) && b[3](s)) { db.prepare('INSERT INTO badges(user_id,code) VALUES(?,?)').run(uid, code); fresh.push({ icon: b[0], name: b[1] }); }
  return fresh;
}
const todayAct = uid => one('SELECT xp,lessons,correct FROM activity WHERE user_id=? AND day=?', uid, today()) || { xp: 0, lessons: 0, correct: 0 };
function bump(uid, f) {
  db.prepare('INSERT OR IGNORE INTO activity(user_id,day) VALUES(?,?)').run(uid, today());
  for (const [k, v] of Object.entries(f)) db.prepare(`UPDATE activity SET ${k}=${k}+? WHERE user_id=? AND day=?`).run(v, uid, today());
}

// ---------- Área do aluno (comum e ADM) ----------
app.get('/api/tracks', auth, (req, res) => {
  const done = new Set(db.prepare('SELECT lesson_id FROM progress WHERE user_id=?').all(req.user.id).map(r => r.lesson_id));
  const lessons = db.prepare('SELECT id,track_id,title,position,xp FROM lessons ORDER BY position,id').all();
  // andamento de cada módulo: concluído = 100%; senão, perguntas respondidas na tentativa atual / total
  const qn = Object.fromEntries(db.prepare('SELECT lesson_id l, COUNT(*) n FROM questions GROUP BY lesson_id').all().map(r => [r.l, r.n]));
  const an = Object.fromEntries(db.prepare('SELECT q.lesson_id l, COUNT(*) n FROM answers a JOIN questions q ON q.id=a.question_id WHERE a.user_id=? GROUP BY q.lesson_id').all(req.user.id).map(r => [r.l, r.n]));
  const tracks = db.prepare('SELECT * FROM tracks ORDER BY position,id').all().map(t => ({ ...t, presentation: JSON.parse(t.presentation || '[]'),
    lessons: lessons.filter(l => l.track_id === t.id).map((l, i, arr) => ({ ...l, done: done.has(l.id), total: qn[l.id] || 0, answered: an[l.id] || 0, pct: done.has(l.id) ? 100 : qn[l.id] ? Math.min(99, Math.round((an[l.id] || 0) / qn[l.id] * 100)) : 0, locked: req.user.role !== 'adm' && i > 0 && !done.has(arr[i - 1].id) })) }));
  const h = hearts(req.user.id), st = stats(req.user.id);
  res.json({ tracks, xp: st.xp, level: st.level, coins: st.coins, streak: st.streak, hearts: h.hearts, next: h.next });
});
app.get('/api/lessons/:id', auth, (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lição não encontrada' });
  const done = isDone(req.user.id, lesson.id), h = hearts(req.user.id);
  if (req.user.role !== 'adm') {
    const prev = one('SELECT id FROM lessons WHERE track_id=? AND (position<? OR (position=? AND id<?)) ORDER BY position DESC,id DESC LIMIT 1', lesson.track_id, lesson.position, lesson.position, lesson.id);
    if (prev && !isDone(req.user.id, prev.id)) return res.status(403).json({ error: 'Conclua a lição anterior primeiro 🔒' });
  }
  if (h.hearts === 0 && !done) return res.status(403).json({ error: `Você está sem vidas. Próxima vida em ${Math.ceil(h.next / 60)} min (ou recarregue no Perfil).` });
  db.prepare('DELETE FROM answers WHERE user_id=? AND question_id IN (SELECT id FROM questions WHERE lesson_id=?)').run(req.user.id, lesson.id);
  const questions = db.prepare('SELECT id,prompt,options,type FROM questions WHERE lesson_id=? ORDER BY position,id').all(lesson.id).map(q => {
    const o = JSON.parse(q.options), b = { id: q.id, prompt: q.prompt, type: q.type };
    if (q.type === 'ordenar') return { ...b, items: shuffle(o.map((t, i) => ({ i, t }))) };
    if (q.type === 'associar') { const p = pairs(o); return { ...b, left: p.map((x, i) => ({ i, t: x[0] })), right: shuffle(p.map((x, i) => ({ i, t: x[1] }))) }; }
    return q.type === 'preencher' ? b : { ...b, options: o };
  });
  res.json({ id: lesson.id, title: lesson.title, presentation: JSON.parse(lesson.presentation || '[]'), content: (() => { const c = JSON.parse(lesson.content || '[]'); return c.length ? c : lesson.intro ? [{ type: 'texto', value: lesson.intro }] : []; })(), xp: lesson.xp, questions, hearts: h.hearts, done });
});
app.post('/api/questions/:id/check', auth, (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Questão não encontrada' });
  const opts = JSON.parse(q.options), a = req.body.answer, multi = q.type === 'ordenar' || q.type === 'associar';
  const correct = multi ? Array.isArray(a) && a.length === opts.length && a.every((v, k) => Number(v) === k)
    : q.type === 'preencher' ? opts.some(x => norm(x) === norm(a)) : Number(a) === q.answer;
  db.prepare('INSERT OR REPLACE INTO answers(user_id,question_id,correct) VALUES(?,?,?)').run(req.user.id, q.id, correct ? 1 : 0);
  if (correct) bump(req.user.id, { correct: 1 });
  const h = !correct && !isDone(req.user.id, q.lesson_id) ? loseHeart(req.user.id) : hearts(req.user.id);
  res.json({ correct, answer: multi || q.type === 'preencher' ? null : q.answer, solution: multi || q.type === 'preencher' ? opts : null, explanation: q.explanation || '', hearts: h.hearts });
});
app.post('/api/lessons/:id/complete', auth, (req, res) => {
  const L = db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id), uid = req.user.id;
  if (!L) return res.status(404).json({ error: 'Lição não encontrada' });
  const total = one('SELECT COUNT(*) v FROM questions WHERE lesson_id=?', L.id).v;
  const r = one('SELECT COUNT(*) n, COALESCE(SUM(correct),0) c FROM answers WHERE user_id=? AND question_id IN (SELECT id FROM questions WHERE lesson_id=?)', uid, L.id);
  if (r.n < total) return res.status(400).json({ error: 'Responda todas as questões' });
  const perfect = total > 0 && r.c === total ? 1 : 0;
  let gained = 0, coins = 0;
  if (!isDone(uid, L.id)) {
    gained = L.xp + r.c * 2 + (perfect ? 10 : 0); coins = 5 + (perfect ? 5 : 0);
    db.prepare('INSERT INTO progress(user_id,lesson_id,xp,perfect) VALUES(?,?,?,?)').run(uid, L.id, gained, perfect);
    db.prepare('UPDATE users SET coins=coins+? WHERE id=?').run(coins, uid);
    bump(uid, { xp: gained, lessons: 1 });
  }
  const u = one('SELECT streak,last_day FROM users WHERE id=?', uid); let streak = u.streak;
  if (u.last_day !== today()) { streak = u.last_day === yesterday() ? u.streak + 1 : 1; db.prepare('UPDATE users SET streak=?,last_day=? WHERE id=?').run(streak, today(), uid); }
  const st = stats(uid);
  res.json({ ok: true, streak, gained, coins, perfect: !!perfect, hits: r.c, total, level: st.level, levelUp: st.level > LEVEL(st.xp - gained), badges: awardBadges(uid) });
});
app.get('/api/me/profile', auth, (req, res) => {
  const uid = req.user.id, s = stats(uid), t = todayAct(uid);
  const claimed = new Set(db.prepare('SELECT code FROM claims WHERE user_id=? AND day=?').all(uid, today()).map(r => r.code));
  const have = new Set(db.prepare('SELECT code FROM badges WHERE user_id=?').all(uid).map(r => r.code));
  res.json({ ...s, name: req.user.name, curXp: LEVEL_XP(s.level), nextXp: LEVEL_XP(s.level + 1),
    missions: Object.entries(MISSIONS).map(([code, [icon, label, key, goal]]) => ({ code, icon, label, goal, value: Math.min(t[key], goal), done: t[key] >= goal, claimed: claimed.has(code) })),
    badges: Object.entries(BADGES).map(([code, b]) => ({ icon: b[0], name: b[1], desc: b[2], got: have.has(code) })),
    week: db.prepare('SELECT day,xp FROM activity WHERE user_id=? ORDER BY day DESC LIMIT 7').all(uid).reverse() });
});
app.post('/api/missions/:code/claim', auth, (req, res) => {
  const m = MISSIONS[req.params.code];
  if (!m || todayAct(req.user.id)[m[2]] < m[3]) return res.status(400).json({ error: 'Missão ainda não concluída' });
  if (db.prepare('INSERT OR IGNORE INTO claims(user_id,day,code) VALUES(?,?,?)').run(req.user.id, today(), req.params.code).changes)
    db.prepare('UPDATE users SET coins=coins+10 WHERE id=?').run(req.user.id);
  res.json({ ok: true });
});
app.post('/api/shop/hearts', auth, (req, res) => {
  const COST = 30;
  if (hearts(req.user.id).hearts >= MAX_HEARTS) return res.status(400).json({ error: 'Suas vidas já estão cheias' });
  if (one('SELECT coins FROM users WHERE id=?', req.user.id).coins < COST) return res.status(400).json({ error: `Você precisa de ${COST} moedas` });
  db.prepare('UPDATE users SET coins=coins-?,hearts=?,hearts_at=? WHERE id=?').run(COST, MAX_HEARTS, Date.now(), req.user.id);
  res.json({ ok: true });
});
// ---------- Gestão financeira: receitas e gastos de cada usuário (cada um só vê os próprios) ----------
app.get('/api/finance', auth, (req, res) => {
  const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7);
  res.json({ month: m, entries: db.prepare('SELECT id,kind,category,description,amount,day FROM finance WHERE user_id=? AND substr(day,1,7)=? ORDER BY day DESC,id DESC').all(req.user.id, m) });
});
app.post('/api/finance', auth, (req, res) => {
  const { kind, category, description, amount, day } = req.body, v = Number(amount);
  if (!['gasto', 'receita'].includes(kind)) return res.status(400).json({ error: 'Tipo inválido' });
  if (!(v > 0) || v > 1e9) return res.status(400).json({ error: 'Informe um valor maior que zero' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return res.status(400).json({ error: 'Data inválida' });
  const r = db.prepare('INSERT INTO finance(user_id,kind,category,description,amount,day) VALUES(?,?,?,?,?,?)')
    .run(req.user.id, kind, String(category || 'Outros').slice(0, 40), String(description || '').slice(0, 100), Math.round(v * 100) / 100, day);
  res.json({ id: Number(r.lastInsertRowid) });
});
app.delete('/api/finance/:id', auth, (req, res) => {
  db.prepare('DELETE FROM finance WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});
app.get('/api/ranking', auth, (req, res) => {
  const rows = db.prepare(`SELECT u.id,u.name,u.streak,u.last_day,COALESCE(SUM(p.xp),0) xp FROM users u
    LEFT JOIN progress p ON p.user_id=u.id WHERE u.role='comum' GROUP BY u.id ORDER BY xp DESC,u.name LIMIT 20`).all();
  res.json(rows.map(r => ({ name: r.name, xp: r.xp, level: LEVEL(r.xp), streak: streakOf(r), me: r.id === req.user.id })));
});

// ---------- Área do ADM: criar/editar trilhas, lições e questões ----------
const FIELDS = {
  tracks: ['title', 'description', 'icon', 'color', 'presentation', 'position'],
  lessons: ['track_id', 'title', 'intro', 'presentation', 'content', 'xp', 'position'],
  questions: ['lesson_id', 'type', 'prompt', 'options', 'answer', 'explanation', 'position'],
};
const clean = (res, body) => FIELDS[res].reduce((o, f) => {
  if (body[f] !== undefined) o[f] = (f === 'content' || f === 'presentation') ? JSON.stringify(body[f]) : f === 'options' ? JSON.stringify(body.type === 'vf' ? ['Verdadeiro', 'Falso'] : body[f]) : body[f];
  return o;
}, {});

app.get('/api/admin/tree', auth, adm, (req, res) => {
  const qs = db.prepare('SELECT * FROM questions ORDER BY position,id').all().map(q => ({ ...q, options: JSON.parse(q.options) }));
  const ls = db.prepare('SELECT * FROM lessons ORDER BY position,id').all().map(l => ({ ...l, presentation: JSON.parse(l.presentation || '[]'), content: JSON.parse(l.content || '[]'), questions: qs.filter(q => q.lesson_id === l.id) }));
  res.json(db.prepare('SELECT * FROM tracks ORDER BY position,id').all().map(t => ({ ...t, presentation: JSON.parse(t.presentation || '[]'), lessons: ls.filter(l => l.track_id === t.id) })));
});
// ---------- Módulos: mínimo 1 e máximo 10 por trilha (precisam vir ANTES das rotas genéricas /api/admin/:res) ----------
const MAX_MODULES = 10;
app.post('/api/admin/tracks', auth, adm, (req, res) => { // toda trilha nasce com o "Módulo 1"
  const d = clean('tracks', req.body), k = Object.keys(d);
  try {
    const id = db.prepare(`INSERT INTO tracks(${k}) VALUES(${k.map(() => '?')})`).run(...Object.values(d)).lastInsertRowid;
    db.prepare('INSERT INTO lessons(track_id,title,position,xp) VALUES(?,?,0,10)').run(id, 'Módulo 1');
    res.json({ id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/lessons', auth, adm, (req, res, next) => {
  if (one('SELECT COUNT(*) v FROM lessons WHERE track_id=?', Number(req.body.track_id)).v >= MAX_MODULES)
    return res.status(400).json({ error: `Cada trilha pode ter no máximo ${MAX_MODULES} módulos` });
  next('route');
});
app.delete('/api/admin/lessons/:id', auth, adm, (req, res, next) => {
  const l = one('SELECT track_id FROM lessons WHERE id=?', req.params.id);
  if (l && one('SELECT COUNT(*) v FROM lessons WHERE track_id=?', l.track_id).v <= 1)
    return res.status(400).json({ error: 'Cada trilha precisa ter ao menos 1 módulo' });
  next('route');
});
// Upload de imagens/vídeos da explicação (precisa vir ANTES da rota genérica /api/admin/:res)
const UP = path.join(__dirname, 'public', 'uploads'); fs.mkdirSync(UP, { recursive: true });
const EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm']);
app.post('/api/admin/upload', auth, adm, (req, res) => {
  const ext = String(req.body.name || '').split('.').pop().toLowerCase();
  if (!EXT.has(ext)) return res.status(400).json({ error: 'Formato não permitido (use png, jpg, gif, webp, mp4 ou webm)' });
  const buf = Buffer.from(String(req.body.data || ''), 'base64');
  if (!buf.length || buf.length > 25 * 1024 * 1024) return res.status(400).json({ error: 'Arquivo vazio ou maior que 25 MB' });
  const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UP, name), buf);
  res.json({ url: '/uploads/' + name });
});
app.post('/api/admin/:res', auth, adm, (req, res) => {
  if (!FIELDS[req.params.res]) return res.status(404).end();
  const d = clean(req.params.res, req.body), k = Object.keys(d);
  try {
    const r = db.prepare(`INSERT INTO ${req.params.res}(${k}) VALUES(${k.map(() => '?')})`).run(...Object.values(d));
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/:res/:id', auth, adm, (req, res) => {
  if (!FIELDS[req.params.res]) return res.status(404).end();
  const d = clean(req.params.res, req.body), k = Object.keys(d);
  try {
    db.prepare(`UPDATE ${req.params.res} SET ${k.map(c => c + '=?')} WHERE id=?`).run(...Object.values(d), req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Excluir conta (precisa vir ANTES da rota genérica /api/admin/:res/:id)
app.delete('/api/admin/users/:id', auth, adm, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Você não pode excluir a própria conta' });
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)) return res.status(404).json({ error: 'Usuário não encontrado' });
  for (const t of ['progress', 'answers', 'activity', 'badges', 'claims', 'finance']) db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(id);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  res.json({ ok: true });
});
app.delete('/api/admin/:res/:id', auth, adm, (req, res) => {
  if (!FIELDS[req.params.res]) return res.status(404).end();
  db.prepare(`DELETE FROM ${req.params.res} WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});
app.get('/api/admin/users', auth, adm, (req, res) => res.json(db.prepare('SELECT id,name,email,role FROM users ORDER BY name').all()));
app.put('/api/admin/users/:id/role', auth, adm, (req, res) => {
  if (!['comum', 'adm'].includes(req.body.role)) return res.status(400).json({ error: 'Perfil inválido' });
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Você não pode alterar o próprio perfil' });
  db.prepare('UPDATE users SET role=? WHERE id=?').run(req.body.role, req.params.id);
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3000, () => console.log('Rodando em http://localhost:' + (process.env.PORT || 3000)));
>>>>>>> 90e1c4d6af2e1b3b15f1d564bafdedda6fddbb80
