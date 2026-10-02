const { DatabaseSync } = require('node:sqlite');
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
// Cria o primeiro ADM (a partir do .env / variáveis de ambiente) se ainda não existir
const email = process.env.ADMIN_EMAIL || 'admin@exemplo.com';
if (!db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) {
  db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
    .run(process.env.ADMIN_NAME || 'Administrador', email, bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10), 'adm');
}
module.exports = db;
