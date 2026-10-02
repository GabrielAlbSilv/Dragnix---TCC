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

// ---------- Vidas, sequência e utilidades ----------
const MAX_HEARTS = 5, REGEN_MS = 30 * 60 * 1000; // 1 vida a cada 30 min
const dayStr = d => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const today = () => dayStr(new Date()), yesterday = () => dayStr(new Date(Date.now() - 864e5));
const streakOf = u => (u.last_day === today() || u.last_day === yesterday()) ? u.streak : 0;
const shuffle = a => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
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

// ---------- Área do aluno (comum e ADM) ----------
app.get('/api/tracks', auth, (req, res) => {
  const done = new Set(db.prepare('SELECT lesson_id FROM progress WHERE user_id=?').all(req.user.id).map(r => r.lesson_id));
  const lessons = db.prepare('SELECT id,track_id,title,position FROM lessons ORDER BY position,id').all();
  const tracks = db.prepare('SELECT * FROM tracks ORDER BY position,id').all()
    .map(t => ({ ...t, lessons: lessons.filter(l => l.track_id === t.id).map(l => ({ ...l, done: done.has(l.id) })) }));
  const xp = db.prepare('SELECT COALESCE(SUM(xp),0) xp FROM progress WHERE user_id=?').get(req.user.id).xp;
  const h = hearts(req.user.id), u = db.prepare('SELECT streak,last_day FROM users WHERE id=?').get(req.user.id);
  res.json({ tracks, xp, hearts: h.hearts, next: h.next, streak: streakOf(u) });
});
app.get('/api/lessons/:id', auth, (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lição não encontrada' });
  const done = isDone(req.user.id, lesson.id), h = hearts(req.user.id);
  if (h.hearts === 0 && !done) return res.status(403).json({ error: `Você está sem vidas. Próxima vida em ${Math.ceil(h.next / 60)} min.` });
  const questions = db.prepare('SELECT id,prompt,options,type FROM questions WHERE lesson_id=? ORDER BY position,id').all(lesson.id).map(q => {
    const o = JSON.parse(q.options), base = { id: q.id, prompt: q.prompt, type: q.type };
    // a resposta correta nunca é enviada; itens de "ordenar" saem embaralhados
    return q.type === 'ordenar' ? { ...base, items: shuffle(o.map((t, i) => ({ i, t }))) } : { ...base, options: o };
  });
  res.json({ id: lesson.id, title: lesson.title, intro: lesson.intro || '', questions, hearts: h.hearts, done });
});
app.post('/api/questions/:id/check', auth, (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Questão não encontrada' });
  const ord = q.type === 'ordenar', opts = JSON.parse(q.options), a = req.body.answer;
  const correct = ord ? Array.isArray(a) && a.length === opts.length && a.every((v, k) => Number(v) === k) : Number(a) === q.answer;
  // errar tira uma vida (exceto ao revisar lições já concluídas)
  const h = !correct && !isDone(req.user.id, q.lesson_id) ? loseHeart(req.user.id) : hearts(req.user.id);
  res.json({ correct, answer: ord ? null : q.answer, solution: ord ? opts : null, hearts: h.hearts });
});
app.post('/api/lessons/:id/complete', auth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO progress(user_id,lesson_id) VALUES(?,?)').run(req.user.id, req.params.id);
  const u = db.prepare('SELECT streak,last_day FROM users WHERE id=?').get(req.user.id);
  let streak = u.streak;
  if (u.last_day !== today()) {
    streak = u.last_day === yesterday() ? u.streak + 1 : 1;
    db.prepare('UPDATE users SET streak=?,last_day=? WHERE id=?').run(streak, today(), req.user.id);
  }
  res.json({ ok: true, streak });
});
app.get('/api/ranking', auth, (req, res) => {
  const rows = db.prepare(`SELECT u.id,u.name,u.streak,u.last_day,COALESCE(SUM(p.xp),0) xp FROM users u
    LEFT JOIN progress p ON p.user_id=u.id GROUP BY u.id ORDER BY xp DESC,u.name LIMIT 20`).all();
  res.json(rows.map(r => ({ name: r.name, xp: r.xp, streak: streakOf(r), me: r.id === req.user.id })));
});

// ---------- Área do ADM: criar/editar trilhas, lições e questões ----------
const FIELDS = {
  tracks: ['title', 'description', 'icon', 'position'],
  lessons: ['track_id', 'title', 'intro', 'position'],
  questions: ['lesson_id', 'type', 'prompt', 'options', 'answer', 'position'],
};
const clean = (res, body) => FIELDS[res].reduce((o, f) => {
  if (body[f] !== undefined) o[f] = f === 'options' ? JSON.stringify(body.type === 'vf' ? ['Verdadeiro', 'Falso'] : body[f]) : body[f];
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
