// ============================================================
// ESQUEMA DO BANCO (FONTE OFICIAL)
// ============================================================
//
// Definições copiadas literalmente do sqlite_master do data.db
// original (as mesmas de schema-current.json). Não edite à mão:
// o servidor compara o banco Turso com este texto na inicialização
// e se recusa a iniciar se houver qualquer diferença.
//
// sqlite_sequence não aparece aqui: o próprio SQLite/libSQL a cria
// junto com as tabelas que usam AUTOINCREMENT.

const SCHEMA = [
  {
    type: 'table',
    name: 'users',
    table: 'users',
    sql: `CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'comum'
            CHECK(role IN ('comum', 'professor', 'adm'))
    , hearts INTEGER DEFAULT 5, hearts_at INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, last_day TEXT, best_streak INTEGER DEFAULT 0, coins INTEGER DEFAULT 0, avatar TEXT)`
  },
  {
    type: 'table',
    name: 'tracks',
    table: 'tracks',
    sql: `CREATE TABLE tracks (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '📚',
        position INTEGER DEFAULT 0
    , presentation TEXT DEFAULT '[]', conclusion TEXT DEFAULT '[]', evaluation_question TEXT DEFAULT '', prerequisites TEXT DEFAULT '[]', color TEXT DEFAULT '#58cc02')`
  },
  {
    type: 'table',
    name: 'lessons',
    table: 'lessons',
    sql: `CREATE TABLE lessons (
        id INTEGER PRIMARY KEY,
        track_id INTEGER NOT NULL
            REFERENCES tracks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        position INTEGER DEFAULT 0
    , conclusion TEXT DEFAULT '[]', evaluation_question TEXT DEFAULT '', intro TEXT DEFAULT '', presentation TEXT DEFAULT '[]', content TEXT DEFAULT '[]', xp INTEGER DEFAULT 10)`
  },
  {
    type: 'table',
    name: 'questions',
    table: 'questions',
    sql: `CREATE TABLE questions (
        id INTEGER PRIMARY KEY,
        lesson_id INTEGER NOT NULL
            REFERENCES lessons(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        answer INTEGER NOT NULL DEFAULT 0,
        position INTEGER DEFAULT 0
    , type TEXT DEFAULT 'multipla', explanation TEXT DEFAULT '')`
  },
  {
    type: 'table',
    name: 'progress',
    table: 'progress',
    sql: `CREATE TABLE progress (
        user_id INTEGER
            REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INTEGER
            REFERENCES lessons(id) ON DELETE CASCADE,
        xp INTEGER DEFAULT 10, perfect INTEGER DEFAULT 0, done_at TEXT, review_count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(user_id, lesson_id)
    )`
  },
  {
    type: 'table',
    name: 'answers',
    table: 'answers',
    sql: `CREATE TABLE answers (
        user_id INTEGER,
        question_id INTEGER,
        correct INTEGER,
        PRIMARY KEY(user_id, question_id)
    )`
  },
  {
    type: 'table',
    name: 'activity',
    table: 'activity',
    sql: `CREATE TABLE activity (
        user_id INTEGER,
        day TEXT,
        xp INTEGER DEFAULT 0,
        lessons INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        PRIMARY KEY(user_id, day)
    )`
  },
  {
    type: 'table',
    name: 'lesson_evaluations',
    table: 'lesson_evaluations',
    sql: `CREATE TABLE lesson_evaluations (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_id, lesson_id)
    )`
  },
  {
    type: 'table',
    name: 'track_evaluations',
    table: 'track_evaluations',
    sql: `CREATE TABLE track_evaluations (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        created_at TEXT NOT NULL,
        PRIMARY KEY(user_id, track_id)
    )`
  },
  {
    type: 'table',
    name: 'doubts',
    table: 'doubts',
    sql: `CREATE TABLE doubts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER
            REFERENCES doubts(id) ON DELETE CASCADE,
        track_id INTEGER
            REFERENCES tracks(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
    )`
  },
  {
    type: 'table',
    name: 'avatar_presets',
    table: 'avatar_presets',
    sql: `CREATE TABLE avatar_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file TEXT NOT NULL UNIQUE,
        label TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    )`
  },
  {
    type: 'table',
    name: 'badges',
    table: 'badges',
    sql: `CREATE TABLE badges (
        user_id INTEGER,
        code TEXT,
        PRIMARY KEY(user_id, code)
    )`
  },
  {
    type: 'table',
    name: 'claims',
    table: 'claims',
    sql: `CREATE TABLE claims (
        user_id INTEGER,
        day TEXT,
        code TEXT,
        PRIMARY KEY(user_id, day, code)
    )`
  },
  {
    type: 'table',
    name: 'finance',
    table: 'finance',
    sql: `CREATE TABLE finance (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL
            CHECK(kind IN ('gasto', 'receita')),
        category TEXT,
        description TEXT,
        amount REAL NOT NULL,
        day TEXT NOT NULL
    )`
  },
  {
    type: 'table',
    name: 'challenge_questions',
    table: 'challenge_questions',
    sql: `CREATE TABLE challenge_questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                challenge_id INTEGER NOT NULL
                    REFERENCES challenges(id)
                    ON DELETE CASCADE,

                question_type TEXT NOT NULL DEFAULT 'multipla'
                    CHECK(question_type IN (
                        'multipla',
                        'ordenar'
                    )),

                prompt TEXT NOT NULL,

                options TEXT NOT NULL DEFAULT '[]',

                correct_answer INTEGER NOT NULL DEFAULT 0,

                difficulty INTEGER NOT NULL DEFAULT 1
                    CHECK(difficulty BETWEEN 1 AND 10),

                position INTEGER NOT NULL DEFAULT 0,

                created_at TEXT NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            , revision INTEGER NOT NULL DEFAULT 1)`
  },
  {
    type: 'table',
    name: 'challenge_attempts',
    table: 'challenge_attempts',
    sql: `CREATE TABLE challenge_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        challenge_id INTEGER NOT NULL
            REFERENCES challenges(id) ON DELETE CASCADE,

        user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE CASCADE,

        started_at INTEGER NOT NULL,
        deadline_at INTEGER NOT NULL,

        finished_at INTEGER,

        selected_answer INTEGER,

        status TEXT NOT NULL DEFAULT 'in_progress'
            CHECK(status IN (
                'in_progress',
                'won',
                'lost',
                'expired'
            )), current_question INTEGER
                NOT NULL DEFAULT 0, mistakes INTEGER
                NOT NULL DEFAULT 0, state_json TEXT
                NOT NULL DEFAULT '{}', challenge_revision INTEGER NOT NULL DEFAULT 1,

        CHECK(deadline_at > started_at)
    )`
  },
  {
    type: 'table',
    name: 'challenge_rewards',
    table: 'challenge_rewards',
    sql: `CREATE TABLE challenge_rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        challenge_id INTEGER NOT NULL
            REFERENCES challenges(id) ON DELETE CASCADE,

        user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE CASCADE,

        attempt_id INTEGER NOT NULL UNIQUE
            REFERENCES challenge_attempts(id),

        xp_awarded INTEGER NOT NULL DEFAULT 0
            CHECK(xp_awarded >= 0),

        badge_code TEXT NOT NULL,

        awarded_at INTEGER NOT NULL,

        UNIQUE(user_id, challenge_id)
    )`
  },
  {
    type: 'table',
    name: 'challenges',
    table: 'challenges',
    sql: `CREATE TABLE "challenges" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,

                    track_id INTEGER NOT NULL
                        REFERENCES tracks(id)
                        ON DELETE CASCADE,

                    title TEXT NOT NULL,

                    description TEXT NOT NULL DEFAULT '',

                    type TEXT NOT NULL DEFAULT 'tempo'
                        CHECK(type IN (
                            'tempo',
                            'precisao',
                            'quebra_cabeca',
                            'resistencia'
                        )),

                    enabled INTEGER NOT NULL DEFAULT 0
                        CHECK(enabled IN (0, 1)),

                    question TEXT NOT NULL,

                    options TEXT NOT NULL DEFAULT '[]',

                    correct_answer INTEGER NOT NULL DEFAULT 0
                        CHECK(correct_answer >= 0),

                    time_limit INTEGER NOT NULL DEFAULT 30
                        CHECK(time_limit BETWEEN 5 AND 3600),

                    xp_reward INTEGER NOT NULL DEFAULT 1000
                        CHECK(xp_reward BETWEEN 0 AND 100000),

                    badge_code TEXT NOT NULL,

                    badge_name TEXT NOT NULL,

                    badge_description TEXT NOT NULL DEFAULT '',

                    badge_icon TEXT NOT NULL DEFAULT 'trophy',

                    max_attempts INTEGER NOT NULL DEFAULT 1
                        CHECK(max_attempts BETWEEN 1 AND 100),

                    config_json TEXT NOT NULL DEFAULT '{}',

                    created_at TEXT NOT NULL
                        DEFAULT CURRENT_TIMESTAMP,

                    updated_at TEXT NOT NULL
                        DEFAULT CURRENT_TIMESTAMP
                , deleted_at TEXT DEFAULT NULL, revision INTEGER NOT NULL DEFAULT 1)`
  },
  {
    type: 'table',
    name: 'evaluations',
    table: 'evaluations',
    sql: `CREATE TABLE evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lesson_id INTEGER,
    track_id INTEGER,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, lesson_id),
    UNIQUE(user_id, track_id)
  )`
  },
  {
    type: 'table',
    name: 'login_attempts',
    table: 'login_attempts',
    sql: `CREATE TABLE login_attempts (
    email TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    blocked_until INTEGER NOT NULL DEFAULT 0
  )`
  },
  {
    type: 'index',
    name: 'idx_doubts_parent',
    table: 'doubts',
    sql: `CREATE INDEX idx_doubts_parent
        ON doubts(parent_id)`
  },
<<<<<<< HEAD
=======
  
  {
    type: 'table',
    name: 'password_resets',
    table: 'password_resets',
    sql: `CREATE TABLE password_resets (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at INTEGER NOT NULL
  )`
  },

  // Regras de negócio editáveis no painel (níveis, XP, moedas, vidas,
  // missões). Chave 'regras' com o JSON. Criada no Turso por:
  //   node scripts/add-app-settings.js
  {
    type: 'table',
    name: 'app_settings',
    table: 'app_settings',
    sql: `CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`
  },

  // Conquistas criadas pelos administradores (ícone + condição).
  // Quem ganhou fica em badges com o código "custom:<id>".
  // Criada no Turso por: node scripts/add-custom-badges.js
  {
    type: 'table',
    name: 'custom_badges',
    table: 'custom_badges',
    sql: `CREATE TABLE custom_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL,
    condition_type TEXT NOT NULL,
    condition_value INTEGER NOT NULL DEFAULT 1,
    track_id INTEGER DEFAULT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TEXT NOT NULL
  )`
  },

>>>>>>> 1907a42 (Alterações vindas da Versão Web x5)
  {
    type: 'index',
    name: 'idx_challenges_enabled',
    table: 'challenges',
    sql: `CREATE INDEX idx_challenges_enabled
                ON challenges(enabled)
            `
  },
  {
    type: 'index',
    name: 'idx_challenges_track',
    table: 'challenges',
    sql: `CREATE INDEX idx_challenges_track
                ON challenges(track_id)
            `
  },
  {
    type: 'index',
    name: 'idx_challenge_attempts_user',
    table: 'challenge_attempts',
    sql: `CREATE INDEX idx_challenge_attempts_user
        ON challenge_attempts(user_id, challenge_id)`
  },
  {
    type: 'index',
    name: 'idx_challenge_one_active_attempt',
    table: 'challenge_attempts',
    sql: `CREATE UNIQUE INDEX idx_challenge_one_active_attempt
        ON challenge_attempts(user_id, challenge_id)
        WHERE status = 'in_progress'`
  },
  {
    type: 'index',
    name: 'idx_challenge_rewards_user',
    table: 'challenge_rewards',
    sql: `CREATE INDEX idx_challenge_rewards_user
        ON challenge_rewards(user_id)`
  },
  {
    type: 'index',
    name: 'idx_challenge_questions_order',
    table: 'challenge_questions',
    sql: `CREATE INDEX idx_challenge_questions_order
            ON challenge_questions(
                challenge_id,
                position,
                id
            )
        `
  },
  {
    type: 'index',
    name: 'idx_challenges_deleted_at',
    table: 'challenges',
    sql: `CREATE INDEX idx_challenges_deleted_at
    ON challenges(deleted_at)
  `
  },
  {
    type: 'index',
    name: 'idx_challenge_questions_revision',
    table: 'challenge_questions',
    sql: `CREATE INDEX idx_challenge_questions_revision
    ON challenge_questions(
      challenge_id,
      revision,
      position
    )
  `
  },
  {
    type: 'index',
    name: 'idx_challenge_attempts_revision',
    table: 'challenge_attempts',
    sql: `CREATE INDEX idx_challenge_attempts_revision
    ON challenge_attempts(
      challenge_id,
      challenge_revision
    )
  `
  }
];

module.exports = { SCHEMA };
