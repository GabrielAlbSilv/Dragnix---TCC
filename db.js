const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

// ============================================================
// BANCO DE DADOS
// ============================================================

const dbFile = process.env.DB_FILE || path.join(__dirname, 'data.db');

const db = new DatabaseSync(dbFile);

db.exec('PRAGMA foreign_keys = ON');

// ============================================================
// TABELAS PRINCIPAIS
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'comum'
            CHECK(role IN ('comum', 'professor', 'adm'))
    );

    CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '📚',
        position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY,
        track_id INTEGER NOT NULL
            REFERENCES tracks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        lesson_id INTEGER NOT NULL
            REFERENCES lessons(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        answer INTEGER NOT NULL DEFAULT 0,
        position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS progress (
        user_id INTEGER
            REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INTEGER
            REFERENCES lessons(id) ON DELETE CASCADE,
        xp INTEGER DEFAULT 10,
        PRIMARY KEY(user_id, lesson_id)
    );
`);

// ============================================================
// MIGRAÇÕES
// ============================================================

// Cada alteração é executada individualmente.
// Se a coluna já existir, o erro é ignorado.

const migrations = [
    // USERS
    "ALTER TABLE users ADD COLUMN hearts INTEGER DEFAULT 5",
    "ALTER TABLE users ADD COLUMN hearts_at INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN last_day TEXT",
    "ALTER TABLE users ADD COLUMN best_streak INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0",

    // Foto de perfil: guarda apenas o NOME do arquivo (ex.: avatar_3_ab12cd34.jpg).
    // O arquivo fica em UPLOAD_DIR e entra no backup junto com as demais mídias.
    "ALTER TABLE users ADD COLUMN avatar TEXT",

    // TRACKS
    "ALTER TABLE tracks ADD COLUMN presentation TEXT DEFAULT '[]'",
    "ALTER TABLE tracks ADD COLUMN conclusion TEXT DEFAULT '[]'",
"ALTER TABLE tracks ADD COLUMN evaluation_question TEXT DEFAULT ''",
    "ALTER TABLE tracks ADD COLUMN prerequisites TEXT DEFAULT '[]'",
    "ALTER TABLE tracks ADD COLUMN color TEXT DEFAULT '#58cc02'",

    // LESSONS
    "ALTER TABLE lessons ADD COLUMN conclusion TEXT DEFAULT '[]'",
    "ALTER TABLE lessons ADD COLUMN evaluation_question TEXT DEFAULT ''",
    "ALTER TABLE lessons ADD COLUMN intro TEXT DEFAULT ''",
    "ALTER TABLE lessons ADD COLUMN presentation TEXT DEFAULT '[]'",
    "ALTER TABLE lessons ADD COLUMN content TEXT DEFAULT '[]'",
    "ALTER TABLE lessons ADD COLUMN xp INTEGER DEFAULT 10",

    // QUESTIONS
    "ALTER TABLE questions ADD COLUMN type TEXT DEFAULT 'multipla'",
    "ALTER TABLE questions ADD COLUMN explanation TEXT DEFAULT ''",

    // PROGRESS
    "ALTER TABLE progress ADD COLUMN perfect INTEGER DEFAULT 0",
    "ALTER TABLE progress ADD COLUMN done_at TEXT",
"   ALTER TABLE progress ADD COLUMN review_count INTEGER NOT NULL DEFAULT 1"
];

for (const sql of migrations) {
    try {
        db.exec(sql);
    } catch {
        // Coluna provavelmente já existe.
    }
}

// ============================================================
// MIGRAÇÃO: PERMITIR O CARGO 'professor'
// ============================================================

// Bancos antigos têm CHECK(role IN ('comum','adm')) e o SQLite não
// permite alterar essa regra. Recriamos a tabela users mantendo todos
// os dados. As chaves estrangeiras ficam desligadas durante a troca
// para que o DROP TABLE não apague progresso, respostas etc.

const usersSql = (
    db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    ).get() || {}
).sql || '';

if (usersSql && !usersSql.includes("'professor'")) {
    const newSql = usersSql
        .replace(
            /CREATE TABLE\s+(IF NOT EXISTS\s+)?["`]?users["`]?/i,
            'CREATE TABLE users_new'
        )
        .replace(
            /CHECK\s*\(\s*role\s+IN\s*\([^)]*\)\s*\)/i,
            "CHECK(role IN ('comum', 'professor', 'adm'))"
        );

    db.exec('PRAGMA foreign_keys = OFF');

    try {
        db.exec('BEGIN');
        db.exec('DROP TABLE IF EXISTS users_new');
        db.exec(newSql);
        db.exec('INSERT INTO users_new SELECT * FROM users');
        db.exec('DROP TABLE users');
        db.exec('ALTER TABLE users_new RENAME TO users');
        db.exec('COMMIT');
    } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
    } finally {
        db.exec('PRAGMA foreign_keys = ON');
    }
}

// ============================================================
// TABELAS COMPLEMENTARES
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS answers (
        user_id INTEGER,
        question_id INTEGER,
        correct INTEGER,
        PRIMARY KEY(user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS activity (
        user_id INTEGER,
        day TEXT,
        xp INTEGER DEFAULT 0,
        lessons INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        PRIMARY KEY(user_id, day)
    );

    CREATE TABLE IF NOT EXISTS lesson_evaluations (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS track_evaluations (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        created_at TEXT NOT NULL,
        PRIMARY KEY(user_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS doubts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER
            REFERENCES doubts(id) ON DELETE CASCADE,
        track_id INTEGER
            REFERENCES tracks(id) ON DELETE SET NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_doubts_parent
        ON doubts(parent_id);

    -- Galeria de avatares prontos, cadastrados pelos administradores
    -- (máximo de 10, controlado pelo servidor). 'file' é o nome do
    -- arquivo em UPLOAD_DIR; o usuário que escolhe um avatar da galeria
    -- passa a ter esse mesmo nome em users.avatar.
    CREATE TABLE IF NOT EXISTS avatar_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file TEXT NOT NULL UNIQUE,
        label TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS badges (
        user_id INTEGER,
        code TEXT,
        PRIMARY KEY(user_id, code)
    );

    CREATE TABLE IF NOT EXISTS claims (
        user_id INTEGER,
        day TEXT,
        code TEXT,
        PRIMARY KEY(user_id, day, code)
    );

    CREATE TABLE IF NOT EXISTS finance (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL
            CHECK(kind IN ('gasto', 'receita')),
        category TEXT,
        description TEXT,
        amount REAL NOT NULL,
        day TEXT NOT NULL
    );
`);


/* ============================================================
   DESAFIOS — ESTRUTURA DO BANCO DE DADOS
   ============================================================ */

db.exec(`
    -- ========================================================
    -- CONFIGURAÇÃO DOS DESAFIOS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        track_id INTEGER NOT NULL UNIQUE
            REFERENCES tracks(id) ON DELETE CASCADE,

        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',

        type TEXT NOT NULL DEFAULT 'tempo'
            CHECK(type IN ('tempo')),

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

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_challenges_enabled
        ON challenges(enabled);

    -- ========================================================
    -- TENTATIVAS DOS ALUNOS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS challenge_attempts (
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
            )),

        CHECK(deadline_at > started_at)
    );

    CREATE INDEX IF NOT EXISTS idx_challenge_attempts_user
        ON challenge_attempts(user_id, challenge_id);

    CREATE UNIQUE INDEX IF NOT EXISTS
        idx_challenge_one_active_attempt
        ON challenge_attempts(user_id, challenge_id)
        WHERE status = 'in_progress';

    -- ========================================================
    -- RECOMPENSAS ÚNICAS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS challenge_rewards (
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
    );

    CREATE INDEX IF NOT EXISTS idx_challenge_rewards_user
        ON challenge_rewards(user_id);
`);


/* ============================================================
   MIGRAÇÃO — DESAFIOS COM MÚLTIPLOS TIPOS
   ============================================================ */

function migrateChallengeTypes() {
    const allowedTypes = [
        'tempo',
        'precisao',
        'quebra_cabeca',
        'resistencia'
    ];

    const challengeSchema = db.prepare(`
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'challenges'
    `).get()?.sql || '';

    if (!challengeSchema) {
        throw new Error(
            'Tabela challenges não encontrada.'
        );
    }

    const challengeColumns = db.prepare(`
        PRAGMA table_info(challenges)
    `).all();

    const hasConfigJson = challengeColumns.some(
        column => column.name === 'config_json'
    );

    const hasOldUniqueTrack = /track_id\s+INTEGER\s+NOT\s+NULL\s+UNIQUE/i
        .test(challengeSchema);

    const supportsAllTypes = allowedTypes.every(
        type => challengeSchema.includes(`'${type}'`)
    );

    const needsRebuild =
        hasOldUniqueTrack || !supportsAllTypes;

    const attemptColumns = db.prepare(`
        PRAGMA table_info(challenge_attempts)
    `).all().map(column => column.name);

    // O SQLite exige desativar as chaves estrangeiras
    // antes de iniciar a transação de reconstrução.
    if (db.inTransaction) {
        throw new Error(
            'Não é possível migrar desafios dentro de outra transação.'
        );
    }

    db.exec('PRAGMA foreign_keys = OFF');

    try {
        db.exec('BEGIN IMMEDIATE');

        if (needsRebuild) {
            db.exec(`
                CREATE TABLE challenges_new (
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
                )
            `);

            db.exec(`
                INSERT INTO challenges_new (
                    id,
                    track_id,
                    title,
                    description,
                    type,
                    enabled,
                    question,
                    options,
                    correct_answer,
                    time_limit,
                    xp_reward,
                    badge_code,
                    badge_name,
                    badge_description,
                    badge_icon,
                    max_attempts,
                    config_json,
                    created_at,
                    updated_at
                )
                SELECT
                    id,
                    track_id,
                    title,
                    description,
                    type,
                    enabled,
                    question,
                    options,
                    correct_answer,
                    time_limit,
                    xp_reward,
                    badge_code,
                    badge_name,
                    badge_description,
                    badge_icon,
                    max_attempts,
                    ${
                        hasConfigJson
                            ? 'config_json'
                            : "'{}'"
                    },
                    created_at,
                    updated_at
                FROM challenges
            `);

            db.exec('DROP TABLE challenges');

            db.exec(`
                ALTER TABLE challenges_new
                RENAME TO challenges
            `);

            db.exec(`
                CREATE INDEX IF NOT EXISTS
                    idx_challenges_enabled
                ON challenges(enabled)
            `);

            db.exec(`
                CREATE INDEX IF NOT EXISTS
                    idx_challenges_track
                ON challenges(track_id)
            `);
        } else if (!hasConfigJson) {
            db.exec(`
                ALTER TABLE challenges
                ADD COLUMN config_json TEXT
                NOT NULL DEFAULT '{}'
            `);
        }

        // Cada desafio pode ter várias questões.
        db.exec(`
            CREATE TABLE IF NOT EXISTS challenge_questions (
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
            )
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS
                idx_challenge_questions_order
            ON challenge_questions(
                challenge_id,
                position,
                id
            )
        `);

        // Preserva os desafios antigos:
        // a pergunta original vira a primeira questão.
        db.exec(`
            INSERT INTO challenge_questions (
                challenge_id,
                question_type,
                prompt,
                options,
                correct_answer,
                difficulty,
                position
            )
            SELECT
                c.id,
                'multipla',
                c.question,
                c.options,
                c.correct_answer,
                1,
                0
            FROM challenges c
            WHERE NOT EXISTS (
                SELECT 1
                FROM challenge_questions q
                WHERE q.challenge_id = c.id
            )
        `);

        // Estado de execução de desafios com várias questões.
        if (!attemptColumns.includes('current_question')) {
            db.exec(`
                ALTER TABLE challenge_attempts
                ADD COLUMN current_question INTEGER
                NOT NULL DEFAULT 0
            `);
        }

        if (!attemptColumns.includes('mistakes')) {
            db.exec(`
                ALTER TABLE challenge_attempts
                ADD COLUMN mistakes INTEGER
                NOT NULL DEFAULT 0
            `);
        }

        if (!attemptColumns.includes('state_json')) {
            db.exec(`
                ALTER TABLE challenge_attempts
                ADD COLUMN state_json TEXT
                NOT NULL DEFAULT '{}'
            `);
        }

        // Verifica se a migração preservou os vínculos.
        const errors = db.prepare(`
            PRAGMA foreign_key_check
        `).all();

        if (errors.length) {
            throw new Error(
                'Falha de integridade na migração dos desafios: ' +
                JSON.stringify(errors.slice(0, 5))
            );
        }

        db.exec('COMMIT');

        console.log(
            '[DRAGNIX] Banco preparado para desafios multitipos.'
        );

    } catch (error) {
        try {
            db.exec('ROLLBACK');
        } catch {}

        throw error;

    } finally {
        db.exec('PRAGMA foreign_keys = ON');
    }
}

migrateChallengeTypes();


/* ============================================================
   MIGRAÇÃO — CONTROLE ADMINISTRATIVO DOS DESAFIOS
   ============================================================ */

function migrateChallengeAdministration() {
  const columns = db.prepare(`
    PRAGMA table_info(challenges)
  `).all().map(column => column.name);

  if (!columns.includes('deleted_at')) {
    db.exec(`
      ALTER TABLE challenges
      ADD COLUMN deleted_at TEXT DEFAULT NULL
    `);
  }

  if (!columns.includes('revision')) {
    db.exec(`
      ALTER TABLE challenges
      ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS
      idx_challenges_deleted_at
    ON challenges(deleted_at)
  `);

  console.log(
    '[DRAGNIX] Controle administrativo dos desafios preparado.'
  );
}

migrateChallengeAdministration();

/* ============================================================
   MIGRAÇÃO — VERSIONAMENTO DAS QUESTÕES DOS DESAFIOS
   ============================================================ */

function migrateChallengeQuestionVersions() {
  const columns = db.prepare(`
    PRAGMA table_info(challenge_questions)
  `).all().map(column => column.name);

  if (!columns.includes('revision')) {
    db.exec(`
      ALTER TABLE challenge_questions
      ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS
      idx_challenge_questions_revision
    ON challenge_questions(
      challenge_id,
      revision,
      position
    )
  `);

  console.log(
    '[DRAGNIX] Versionamento das questões preparado.'
  );
}

migrateChallengeQuestionVersions();


/* ============================================================
   MIGRAÇÃO — REVISÃO UTILIZADA EM CADA TENTATIVA
   ============================================================ */

function migrateChallengeAttemptVersions() {
  const columns = db.prepare(`
    PRAGMA table_info(challenge_attempts)
  `).all().map(column => column.name);

  if (!columns.includes('challenge_revision')) {
    db.exec(`
      ALTER TABLE challenge_attempts
      ADD COLUMN challenge_revision INTEGER NOT NULL DEFAULT 1
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS
      idx_challenge_attempts_revision
    ON challenge_attempts(
      challenge_id,
      challenge_revision
    )
  `);

  console.log(
    '[DRAGNIX] Revisões das tentativas preparadas.'
  );
}

migrateChallengeAttemptVersions();



// ============================================================
// VALORES PADRÃO PARA DADOS ANTIGOS
// ============================================================

// Garante que registros antigos não fiquem com valores NULL
// depois das migrações.

db.exec(`
    UPDATE users
    SET hearts = 5
    WHERE hearts IS NULL;

    UPDATE users
    SET hearts_at = 0
    WHERE hearts_at IS NULL;

    UPDATE users
    SET streak = 0
    WHERE streak IS NULL;

    UPDATE users
    SET best_streak = 0
    WHERE best_streak IS NULL;

    UPDATE users
    SET coins = 0
    WHERE coins IS NULL;

    UPDATE tracks
    SET presentation = '[]'
    WHERE presentation IS NULL;

    UPDATE tracks
    SET color = '#58cc02'
    WHERE color IS NULL;

    UPDATE tracks
    SET conclusion = '[]'
    WHERE conclusion IS NULL;

    UPDATE tracks
    SET evaluation_question = ''
    WHERE evaluation_question IS NULL;

    UPDATE lessons
    SET intro = ''
    WHERE intro IS NULL;

    UPDATE lessons
    SET presentation = '[]'
    WHERE presentation IS NULL;

    UPDATE lessons
    SET content = '[]'
    WHERE content IS NULL;

    UPDATE lessons
    SET xp = 10
    WHERE xp IS NULL;

    UPDATE lessons
    SET conclusion = '[]'
    WHERE conclusion IS NULL;

    UPDATE lessons
    SET evaluation_question = ''
    WHERE evaluation_question IS NULL;

    UPDATE questions
    SET type = 'multipla'
    WHERE type IS NULL;

    UPDATE questions
    SET explanation = ''
    WHERE explanation IS NULL;

    UPDATE progress
    SET perfect = 0
    WHERE perfect IS NULL;
`);


/* ============================================================
   ADMINISTRADOR PRINCIPAL
   ============================================================ */

const adminEmail = (
    process.env.ADMIN_EMAIL || 'admin@exemplo.com'
).trim().toLowerCase();

const adminName =
    process.env.ADMIN_NAME || 'Administrador';

const adminPassword =
    process.env.ADMIN_PASSWORD || 'admin123';

// Cria somente o administrador principal.
// Os demais administradores devem se cadastrar
// com seus próprios e-mails e senhas.

const adminExists = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(adminEmail);

if (!adminExists) {
    const hash = bcrypt.hashSync(adminPassword, 10);

    db.prepare(`
        INSERT INTO users (name, email, password, role)
        VALUES (?, ?, ?, 'adm')
    `).run(
        adminName,
        adminEmail,
        hash
    );
}

// Promove contas adicionais autorizadas que já existem.
// Não cria contas e não modifica suas senhas.

const additionalAdminEmails = (
    process.env.ADMIN_EMAILS || ''
)
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

const promoteAdmin = db.prepare(`
    UPDATE users
    SET role = 'adm'
    WHERE email = ?
`);

for (const email of additionalAdminEmails) {
    promoteAdmin.run(email);
}

// ============================================================
// GARANTIR PELO MENOS UM MÓDULO POR TRILHA
// ============================================================

const tracksWithoutLessons = db
    .prepare(`
        SELECT id
        FROM tracks
        WHERE id NOT IN (
            SELECT track_id
            FROM lessons
        )
    `)
    .all();

for (const track of tracksWithoutLessons) {
    db.prepare(`
        INSERT INTO lessons(
            track_id,
            title,
            position,
            xp
        )
        VALUES(?,?,?,?)
    `).run(
        track.id,
        'Módulo 1',
        0,
        10
    );
}

// ============================================================
// EXPORTAÇÃO
// ============================================================

module.exports = db;