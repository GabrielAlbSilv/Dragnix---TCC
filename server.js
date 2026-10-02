const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const app = express();
app.use(express.json());
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
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Preencha nome, e-mail e senha (mín. 6 caracteres)' });
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
app.get('/api/auth/me', auth, (req, res) => res.json(pub(req.user)));

// ---------- Área do aluno (comum e ADM) ----------
app.get('/api/tracks', auth, (req, res) => {
  const done = new Set(db.prepare('SELECT lesson_id FROM progress WHERE user_id=?').all(req.user.id).map(r => r.lesson_id));
  const lessons = db.prepare('SELECT * FROM lessons ORDER BY position,id').all();
  const tracks = db.prepare('SELECT * FROM tracks ORDER BY position,id').all()
    .map(t => ({ ...t, lessons: lessons.filter(l => l.track_id === t.id).map(l => ({ ...l, done: done.has(l.id) })) }));
  const xp = db.prepare('SELECT COALESCE(SUM(xp),0) xp FROM progress WHERE user_id=?').get(req.user.id).xp;
  res.json({ tracks, xp });
});
app.get('/api/lessons/:id', auth, (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lição não encontrada' });
  const questions = db.prepare('SELECT id,prompt,options FROM questions WHERE lesson_id=? ORDER BY position,id').all(lesson.id)
    .map(q => ({ ...q, options: JSON.parse(q.options) })); // resposta correta não é enviada
  res.json({ ...lesson, questions });
});
app.post('/api/questions/:id/check', auth, (req, res) => {
  const q = db.prepare('SELECT answer FROM questions WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Questão não encontrada' });
  res.json({ correct: Number(req.body.answer) === q.answer, answer: q.answer });
});
app.post('/api/lessons/:id/complete', auth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO progress(user_id,lesson_id) VALUES(?,?)').run(req.user.id, req.params.id);
  res.json({ ok: true });
});

// ---------- Área do ADM: criar/editar trilhas, lições e questões ----------
const FIELDS = {
  tracks: ['title', 'description', 'icon', 'position'],
  lessons: ['track_id', 'title', 'position'],
  questions: ['lesson_id', 'prompt', 'options', 'answer', 'position'],
};
const clean = (res, body) => FIELDS[res].reduce((o, f) => {
  if (body[f] !== undefined) o[f] = f === 'options' ? JSON.stringify(body[f]) : body[f];
  return o;
}, {});

app.get('/api/admin/tree', auth, adm, (req, res) => {
  const qs = db.prepare('SELECT * FROM questions ORDER BY position,id').all().map(q => ({ ...q, options: JSON.parse(q.options) }));
  const ls = db.prepare('SELECT * FROM lessons ORDER BY position,id').all().map(l => ({ ...l, questions: qs.filter(q => q.lesson_id === l.id) }));
  res.json(db.prepare('SELECT * FROM tracks ORDER BY position,id').all().map(t => ({ ...t, lessons: ls.filter(l => l.track_id === t.id) })));
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
