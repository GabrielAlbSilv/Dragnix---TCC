const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

// ============================================================
// BANCO DE DADOS
// ============================================================

const dbFile =
    process.env.DB_FILE ||
    path.join(__dirname, 'data.db');

const db = new DatabaseSync(dbFile);

// Ativa chaves estrangeiras
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
            CHECK(role IN ('comum', 'adm')),
        hearts INTEGER DEFAULT 5,
        hearts_at INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        last_day TEXT,
        best_streak INTEGER DEFAULT 0,
        coins INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT '📚',
        position INTEGER DEFAULT 0,
        presentation TEXT DEFAULT '[]',
        color TEXT DEFAULT '#58cc02'
    );

    CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY,
        track_id INTEGER NOT NULL
            REFERENCES tracks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        position INTEGER DEFAULT 0,
        intro TEXT DEFAULT '',
        presentation TEXT DEFAULT '[]',
        content TEXT DEFAULT '[]',
        xp INTEGER DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        lesson_id INTEGER NOT NULL
            REFERENCES lessons(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        answer INTEGER NOT NULL DEFAULT 0,
        position INTEGER DEFAULT 0,
        type TEXT DEFAULT 'multipla',
        explanation TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS progress (
        user_id INTEGER
            REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INTEGER
            REFERENCES lessons(id) ON DELETE CASCADE,
        xp INTEGER DEFAULT 10,
        perfect INTEGER DEFAULT 0,
        done_at TEXT,
        PRIMARY KEY(user_id, lesson_id)
    );
`);

// ============================================================
// MIGRAÇÕES
// ============================================================
//
// As migrações continuam sendo executadas individualmente.
// Isso permite que bancos antigos do Dragnix sejam atualizados
// sem precisar apagar o data.db.
//
// Caso uma coluna já exista, o erro é ignorado.
//

const migrations = [

    // --------------------------------------------------------
    // USERS
    // --------------------------------------------------------

    "ALTER TABLE users ADD COLUMN hearts INTEGER DEFAULT 5",
    "ALTER TABLE users ADD COLUMN hearts_at INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN last_day TEXT",
    "ALTER TABLE users ADD COLUMN best_streak INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0",

    // --------------------------------------------------------
    // TRACKS
    // --------------------------------------------------------

    "ALTER TABLE tracks ADD COLUMN presentation TEXT DEFAULT '[]'",
    "ALTER TABLE tracks ADD COLUMN color TEXT DEFAULT '#58cc02'",

    // --------------------------------------------------------
    // LESSONS
    // --------------------------------------------------------

    "ALTER TABLE lessons ADD COLUMN intro TEXT DEFAULT ''",
    "ALTER TABLE lessons ADD COLUMN presentation TEXT DEFAULT '[]'",
    "ALTER TABLE lessons ADD COLUMN content TEXT DEFAULT '[]'",
    "ALTER TABLE lessons ADD COLUMN xp INTEGER DEFAULT 10",

    // --------------------------------------------------------
    // QUESTIONS
    // --------------------------------------------------------

    "ALTER TABLE questions ADD COLUMN type TEXT DEFAULT 'multipla'",
    "ALTER TABLE questions ADD COLUMN explanation TEXT DEFAULT ''",

    // --------------------------------------------------------
    // PROGRESS
    // --------------------------------------------------------

    "ALTER TABLE progress ADD COLUMN perfect INTEGER DEFAULT 0",
    "ALTER TABLE progress ADD COLUMN done_at TEXT"
];

for (const sql of migrations) {
    try {
        db.exec(sql);
    } catch (error) {
        // A coluna provavelmente já existe.
        // Não interrompe a inicialização do banco.
    }
}

// ============================================================
// TABELAS COMPLEMENTARES
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS answers (
        user_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        correct INTEGER DEFAULT 0,
        PRIMARY KEY(user_id, question_id),
        FOREIGN KEY(user_id)
            REFERENCES users(id)
            ON DELETE CASCADE,
        FOREIGN KEY(question_id)
            REFERENCES questions(id)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity (
        user_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        xp INTEGER DEFAULT 0,
        lessons INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        PRIMARY KEY(user_id, day),
        FOREIGN KEY(user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS badges (
        user_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        PRIMARY KEY(user_id, code),
        FOREIGN KEY(user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claims (
        user_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        code TEXT NOT NULL,
        PRIMARY KEY(user_id, day, code),
        FOREIGN KEY(user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS finance (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL
            CHECK(kind IN ('gasto', 'receita')),
        category TEXT,
        description TEXT,
        amount REAL NOT NULL,
        day TEXT NOT NULL,
        FOREIGN KEY(user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );
`);

// ============================================================
// VALORES PADRÃO PARA DADOS ANTIGOS
// ============================================================

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
    SET last_day = NULL
    WHERE last_day IS NULL;

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

    UPDATE questions
    SET type = 'multipla'
    WHERE type IS NULL;

    UPDATE questions
    SET explanation = ''
    WHERE explanation IS NULL;

    UPDATE progress
    SET xp = 10
    WHERE xp IS NULL;

    UPDATE progress
    SET perfect = 0
    WHERE perfect IS NULL;
`);

// ============================================================
// ADMINISTRADOR PADRÃO
// ============================================================

const adminEmail =
    process.env.ADMIN_EMAIL ||
    'admin@exemplo.com';

const adminName =
    process.env.ADMIN_NAME ||
    'Administrador';

const adminPassword =
    process.env.ADMIN_PASSWORD ||
    'admin123';

const adminExists = db
    .prepare(`
        SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1
    `)
    .get(adminEmail);

if (!adminExists) {

    const hash = bcrypt.hashSync(
        adminPassword,
        10
    );

    db.prepare(`
        INSERT INTO users (
            name,
            email,
            password,
            role,
            hearts,
            hearts_at,
            streak,
            best_streak,
            coins
        )
        VALUES (?, ?, ?, 'adm', 5, 0, 0, 0, 0)
    `).run(
        adminName,
        adminEmail,
        hash
    );
}

// ============================================================
// GARANTIR PELO MENOS UM MÓDULO POR TRILHA
// ============================================================

const tracksWithoutLessons = db
    .prepare(`
        SELECT id
        FROM tracks
        WHERE NOT EXISTS (
            SELECT 1
            FROM lessons
            WHERE lessons.track_id = tracks.id
        )
    `)
    .all();

for (const track of tracksWithoutLessons) {

    db.prepare(`
        INSERT INTO lessons (
            track_id,
            title,
            position,
            xp,
            intro,
            presentation,
            content
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        track.id,
        'Módulo 1',
        0,
        10,
        '',
        '[]',
        '[]'
    );
}

// ============================================================
// EXPORTAÇÃO
// ============================================================

module.exports = db;