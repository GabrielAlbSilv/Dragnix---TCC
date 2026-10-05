const { DatabaseSync } = require('node:sqlite'); // SQLite embutido no Node 22.5+
const bcrypt = require('bcryptjs');
const db = new DatabaseSync(process.env.DB_FILE || 'data.db');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'comum' CHECK(role IN ('comum','adm')));
CREATE TABLE IF NOT EXISTS tracks(id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', icon TEXT DEFAULT '📚', position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY, track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, title TEXT NOT NULL, position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, prompt TEXT NOT NULL, options TEXT NOT NULL DEFAULT '[]', answer INTEGER NOT NULL DEFAULT 0, position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS progress(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE, xp INTEGER DEFAULT 10, PRIMARY KEY(user_id, lesson_id));
`);
// Migrações (seguras para bancos já existentes: ignora se a coluna já existe)
for (const sql of [
  "ALTER TABLE users ADD COLUMN hearts INTEGER DEFAULT 5",
  "ALTER TABLE users ADD COLUMN hearts_at INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN last_day TEXT",
  "ALTER TABLE lessons ADD COLUMN intro TEXT DEFAULT ''",
  "ALTER TABLE questions ADD COLUMN type TEXT DEFAULT 'multipla'",
  "ALTER TABLE questions ADD COLUMN explanation TEXT DEFAULT ''",
  "ALTER TABLE lessons ADD COLUMN xp INTEGER DEFAULT 10",
  "ALTER TABLE progress ADD COLUMN perfect INTEGER DEFAULT 0",
  "ALTER TABLE progress ADD COLUMN done_at TEXT",
  "ALTER TABLE users ADD COLUMN best_streak INTEGER DEFAULT 0",
]) { try { db.exec(sql); } catch {} }

for (const sql of [
  "ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0",
  "ALTER TABLE tracks ADD COLUMN presentation TEXT DEFAULT '[]'",
  "ALTER TABLE lessons ADD COLUMN presentation TEXT DEFAULT '[]'",
  "ALTER TABLE lessons ADD COLUMN content TEXT DEFAULT '[]'",
  "ALTER TABLE tracks ADD COLUMN color TEXT DEFAULT '#58cc02'",
  "ALTER TABLE lessons ADD COLUMN xp INTEGER DEFAULT 10",
  "ALTER TABLE questions ADD COLUMN explanation TEXT DEFAULT ''",
  "ALTER TABLE progress ADD COLUMN perfect INTEGER DEFAULT 0",
]) { try { db.exec(sql); } catch {} }
db.exec(`
CREATE TABLE IF NOT EXISTS answers(user_id INTEGER, question_id INTEGER, correct INTEGER, PRIMARY KEY(user_id,question_id));
CREATE TABLE IF NOT EXISTS activity(user_id INTEGER, day TEXT, xp INTEGER DEFAULT 0, lessons INTEGER DEFAULT 0, correct INTEGER DEFAULT 0, PRIMARY KEY(user_id,day));
CREATE TABLE IF NOT EXISTS badges(user_id INTEGER, code TEXT, PRIMARY KEY(user_id,code));
CREATE TABLE IF NOT EXISTS claims(user_id INTEGER, day TEXT, code TEXT, PRIMARY KEY(user_id,day,code));
CREATE TABLE IF NOT EXISTS finance(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('gasto','receita')), category TEXT, description TEXT, amount REAL NOT NULL, day TEXT NOT NULL);
`);

const email = process.env.ADMIN_EMAIL || 'admin@exemplo.com';
if (!db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) {
  db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
    .run(process.env.ADMIN_NAME || 'Administrador', email, bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10), 'adm');
}
// Toda trilha precisa ter ao menos 1 módulo (cria o "Módulo 1" para trilhas que ainda não têm nenhum)
for (const t of db.prepare('SELECT id FROM tracks WHERE id NOT IN (SELECT track_id FROM lessons)').all())
  db.prepare("INSERT INTO lessons(track_id,title,position,xp) VALUES(?,?,0,10)").run(t.id, 'Módulo 1');
module.exports = db;