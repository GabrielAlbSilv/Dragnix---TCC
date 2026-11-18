// Testes de ponta a ponta: o servidor real (server.js) rodando
// contra um banco libSQL local descartável.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@libsql/client');

const {
  ADMIN,
  makeSandbox,
  provision,
  startServer,
  client,
  decryptBackupFile,
  encryptBackupFile
} = require('./helpers');

test('o servidor não inicia com banco vazio', async () => {
  const sandbox = makeSandbox();

  try {
    const result = await startServer(sandbox);

    assert.equal(result.exitCode, 1);
    assert.match(result.output, /banco está vazio/);
  } finally {
    sandbox.cleanup();
  }
});

test('o servidor não inicia se o esquema for diferente', async () => {
  const sandbox = makeSandbox();

  try {
    provision(sandbox);

    const raw = createClient({ url: sandbox.url });
    await raw.execute('ALTER TABLE users ADD COLUMN extra TEXT');
    raw.close();

    const result = await startServer(sandbox);

    assert.equal(result.exitCode, 1);
    assert.match(result.output, /Definição diferente: table users/);
  } finally {
    sandbox.cleanup();
  }
});

test('aplicação completa sobre o libSQL', async t => {
  const sandbox = makeSandbox();

  assert.match(provision(sandbox), /validado/);

  const server = await startServer(sandbox);
  assert.ok(server.base, 'servidor não iniciou: ' + server.output);

  const api = client(server.base);

  t.after(async () => {
    await server.stop();
    sandbox.cleanup();
  });

  let adminToken;
  let studentToken;
  let student;
  let trackId;
  let lessonId;
  let questionId;

  await t.test('health check consulta o banco', async () => {
    const res = await api.get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
  });

  await t.test('login do administrador criado na inicialização', async () => {
    const res = await api.post('/api/auth/login', {
      body: { email: ADMIN.email, password: ADMIN.password }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.user.role, 'adm');
    adminToken = res.data.token;
  });

  await t.test('cadastro, login e /api/auth/me', async () => {
    const reg = await api.post('/api/auth/register', {
      body: {
        name: 'Aluno',
        email: 'ALUNO@teste.local',
        password: 'segredo1',
        confirm: 'segredo1'
      }
    });

    assert.equal(reg.status, 200);
    assert.equal(reg.data.user.role, 'comum');
    assert.equal(reg.data.user.email, 'aluno@teste.local');
    assert.equal(typeof reg.data.user.id, 'number');

    const dup = await api.post('/api/auth/register', {
      body: {
        name: 'Outro',
        email: 'aluno@teste.local',
        password: 'segredo1',
        confirm: 'segredo1'
      }
    });

    assert.equal(dup.status, 409);

    const login = await api.post('/api/auth/login', {
      body: { email: 'aluno@teste.local', password: 'segredo1' }
    });

    assert.equal(login.status, 200);
    studentToken = login.data.token;
    student = login.data.user;

    const me = await api.get('/api/auth/me', { token: studentToken });
    assert.equal(me.status, 200);
    assert.equal(me.data.id, student.id);
  });

  await t.test('rotas protegidas e autorização por perfil', async () => {
    assert.equal((await api.get('/api/tracks')).status, 401);
    assert.equal((await api.get('/api/tracks', { token: 'invalido' })).status, 401);
    assert.equal((await api.get('/api/admin/users', { token: studentToken })).status, 403);
    assert.equal((await api.get('/api/admin/tree', { token: studentToken })).status, 403);
    assert.equal((await api.get('/api/admin/users', { token: adminToken })).status, 200);
  });

  await t.test('bloqueio de login após tentativas incorretas', async () => {
    await api.post('/api/auth/register', {
      body: {
        name: 'Alvo',
        email: 'alvo@teste.local',
        password: 'correta1',
        confirm: 'correta1'
      }
    });

    const wrong = () => api.post('/api/auth/login', {
      body: { email: 'alvo@teste.local', password: 'errada' }
    });

    const first = await wrong();
    assert.equal(first.status, 401);
    assert.equal(first.data.remainingAttempts, 5);

    // Tentativas simultâneas não podem "sumir" da contagem.
    await Promise.all([wrong(), wrong(), wrong(), wrong()]);

    const sixth = await wrong();
    assert.equal(sixth.status, 429);
    assert.equal(sixth.data.code, 'LOGIN_BLOCKED');

    const blocked = await api.post('/api/auth/login', {
      body: { email: 'alvo@teste.local', password: 'correta1' }
    });

    assert.equal(blocked.status, 429);
  });

  await t.test('administração: trilha, módulo e questão', async () => {
    const track = await api.post('/api/admin/tracks', {
      token: adminToken,
      body: { title: 'Trilha Teste', description: 'desc', presentation: [] }
    });

    assert.equal(track.status, 200);
    assert.equal(typeof track.data.id, 'number');
    trackId = track.data.id;

    const tree = await api.get('/api/admin/tree', { token: adminToken });
    const created = tree.data.find(item => item.id === trackId);

    assert.equal(created.lessons.length, 1);
    assert.equal(created.lessons[0].title, 'Módulo 1');
    lessonId = created.lessons[0].id;

    const question = await api.post('/api/admin/questions', {
      token: adminToken,
      body: {
        lesson_id: lessonId,
        type: 'multipla',
        prompt: '2 + 2?',
        options: ['3', '4'],
        answer: 1,
        position: 0
      }
    });

    assert.equal(question.status, 200);
    questionId = question.data.id;

    const edit = await api.put(`/api/admin/lessons/${lessonId}`, {
      token: adminToken,
      body: { xp: 20, content: [{ type: 'texto', value: 'Olá' }] }
    });

    assert.equal(edit.status, 200);

    // Cada trilha precisa ter ao menos um módulo.
    const del = await api.del(`/api/admin/lessons/${lessonId}`, { token: adminToken });
    assert.equal(del.status, 400);
  });

  await t.test('aluno: trilhas, lição, resposta e conclusão', async () => {
    const tracks = await api.get('/api/tracks', { token: studentToken });

    assert.equal(tracks.status, 200);
    assert.equal(tracks.data.hearts, 5);

    const track = tracks.data.tracks.find(item => item.id === trackId);
    assert.equal(track.lessons[0].total, 1);
    assert.equal(track.lessons[0].done, false);

    const lesson = await api.get(`/api/lessons/${lessonId}`, { token: studentToken });
    assert.equal(lesson.status, 200);
    assert.equal(lesson.data.questions.length, 1);
    assert.deepEqual(lesson.data.content, [{ type: 'texto', value: 'Olá' }]);

    const incomplete = await api.post(`/api/lessons/${lessonId}/complete`, { token: studentToken });
    assert.equal(incomplete.status, 400);

    const wrong = await api.post(`/api/questions/${questionId}/check`, {
      token: studentToken,
      body: { answer: 0 }
    });

    assert.equal(wrong.data.correct, false);
    assert.equal(wrong.data.hearts, 4);

    const right = await api.post(`/api/questions/${questionId}/check`, {
      token: studentToken,
      body: { answer: 1 }
    });

    assert.equal(right.data.correct, true);
    assert.equal(right.data.hearts, 4);

    const done = await api.post(`/api/lessons/${lessonId}/complete`, { token: studentToken });

    assert.equal(done.status, 200);
    assert.equal(done.data.perfect, true);
    assert.equal(done.data.gained, 20 + 2 + 10);
    assert.equal(done.data.coins, 10);
    assert.equal(done.data.repeated, false);
    assert.equal(done.data.streak, 1);
    assert.ok(done.data.badges.some(badge => badge.name === 'Primeiro passo'));

<<<<<<< HEAD
=======
    // Reenviar a conclusão sem responder de novo não vale XP outra vez
    const replay = await api.post(`/api/lessons/${lessonId}/complete`, { token: studentToken });
    assert.equal(replay.status, 400);

    // Refaz o módulo: abre, responde e conclui
    await api.get(`/api/lessons/${lessonId}`, { token: studentToken });
    await api.post(`/api/questions/${questionId}/check`, {
      token: studentToken,
      body: { answer: 1 }
    });

>>>>>>> 1907a42 (Alterações vindas da Versão Web x5)
    const again = await api.post(`/api/lessons/${lessonId}/complete`, { token: studentToken });
    assert.equal(again.data.repeated, true);
    assert.equal(again.data.completionNumber, 2);
    assert.equal(again.data.coins, 0);
    assert.equal(again.data.gained, 16);

    const after = await api.get('/api/tracks', { token: studentToken });
    const lessonState = after.data.tracks.find(item => item.id === trackId).lessons[0];

    assert.equal(lessonState.done, true);
    assert.equal(lessonState.completionCount, 2);
    assert.equal(after.data.xp, 48);
    assert.equal(after.data.coins, 10);
  });

  await t.test('perfil, missões, loja, avaliação e ranking', async () => {
    const profile = await api.get('/api/me/profile', { token: studentToken });

    assert.equal(profile.status, 200);
    assert.equal(profile.data.lessons, 1);
    assert.equal(profile.data.week.length, 1);

    // 10 moedas da lição; cada missão concluída vale 10.
    const poor = await api.post('/api/shop/hearts', { token: studentToken });
    assert.equal(poor.status, 400);
    assert.match(poor.data.error, /30 moedas/);

    const claim = await api.post('/api/missions/licao/claim', { token: studentToken });
    assert.equal(claim.status, 200);

    // Resgatar de novo não dá moedas em dobro.
    await api.post('/api/missions/licao/claim', { token: studentToken });

    const notYet = await api.post('/api/missions/acertos/claim', { token: studentToken });
    assert.equal(notYet.status, 400);

    await api.post('/api/missions/xp/claim', { token: studentToken });

    assert.equal((await api.get('/api/tracks', { token: studentToken })).data.coins, 30);

    const shop = await api.post('/api/shop/hearts', { token: studentToken });
    assert.equal(shop.status, 200);

    const tracks = await api.get('/api/tracks', { token: studentToken });
    assert.equal(tracks.data.hearts, 5);
    assert.equal(tracks.data.coins, 0);

    const full = await api.post('/api/shop/hearts', { token: studentToken });
    assert.equal(full.status, 400);

    const rating = await api.post(`/api/lessons/${lessonId}/evaluate`, {
      token: studentToken,
      body: { rating: 5 }
    });

    assert.equal(rating.status, 200);

    const ratings = await api.get('/api/lessons/ratings', { token: studentToken });
    assert.deepEqual(ratings.data.ratings, [
      { lesson_id: lessonId, average_rating: 5, rating_count: 1 }
    ]);

    const trackRating = await api.post(`/api/tracks/${trackId}/evaluation`, {
      token: studentToken,
      body: { rating: 4 }
    });

    assert.equal(trackRating.status, 200);

    const ranking = await api.get('/api/ranking', { token: studentToken });
    assert.equal(ranking.data.find(row => row.me).xp, 48);
  });

  await t.test('desafios: cadastro, início, resposta e recompensa', async () => {
    const created = await api.post(`/api/admin/tracks/${trackId}/challenges`, {
      token: adminToken,
      body: {
        type: 'precisao',
        title: 'Desafio',
        enabled: true,
        xp_reward: 100,
        max_attempts: 2,
        questions: [
          { prompt: 'Capital?', options: ['A', 'B'], correct_answer: 0 }
        ]
      }
    });

    assert.equal(created.status, 201);
    const challengeId = created.data.challenge.id;

    const list = await api.get(`/api/tracks/${trackId}/challenges`, { token: studentToken });
    assert.equal(list.data.challenges[0].question_count, 1);

    const start = await api.post(`/api/challenges/${challengeId}/start`, { token: studentToken });
    assert.equal(start.status, 200);
    assert.equal(start.data.question.options.length, 2);

    // A ordem das alternativas é embaralhada e salva no banco.
    const shown = start.data.question.options.indexOf('A');

    const answer = await api.post(`/api/challenges/attempts/${start.data.attempt_id}/answer`, {
      token: studentToken,
      body: { selected_answer: shown }
    });

    assert.equal(answer.status, 200);
    assert.equal(answer.data.status, 'won');
    assert.equal(answer.data.gained, 100);

    const again = await api.post(`/api/challenges/${challengeId}/start`, { token: studentToken });
    assert.equal(again.status, 409);

    // Editar o desafio cria uma nova revisão das questões.
    const edit = await api.put(`/api/admin/challenges/${challengeId}`, {
      token: adminToken,
      body: {
        type: 'precisao',
        title: 'Desafio v2',
        enabled: true,
        questions: [
          { prompt: 'Nova?', options: ['X', 'Y'], correct_answer: 1 }
        ]
      }
    });

    assert.equal(edit.status, 200);
    assert.equal(edit.data.challenge.revision, 2);

    const tracks = await api.get('/api/tracks', { token: studentToken });
    assert.equal(tracks.data.xp, 148);
  });

  await t.test('financeiro e dúvidas', async () => {
    const entry = await api.post('/api/finance', {
      token: studentToken,
      body: { kind: 'gasto', amount: 12.345, day: '2026-11-04', category: 'Livros' }
    });

    assert.equal(typeof entry.data.id, 'number');

    const month = await api.get('/api/finance?month=2026-11', { token: studentToken });
    assert.equal(month.data.entries[0].amount, 12.35);

    await api.del(`/api/finance/${entry.data.id}`, { token: studentToken });
    assert.equal(
      (await api.get('/api/finance?month=2026-11', { token: studentToken })).data.entries.length,
      0
    );

    const doubt = await api.post('/api/doubts', {
      token: studentToken,
      body: { body: 'Como faço?', track_id: trackId }
    });

    const reply = await api.post(`/api/doubts/${doubt.data.id}/replies`, {
      token: adminToken,
      body: { body: 'Assim.' }
    });

    assert.equal(reply.status, 200);

    const doubts = await api.get('/api/doubts', { token: studentToken });
    assert.equal(doubts.data.doubts[0].replies.length, 1);
    assert.equal(doubts.data.doubts[0].answered, true);

    // Com resposta, o aluno não pode mais apagar a própria dúvida.
    const denied = await api.del(`/api/doubts/${doubt.data.id}`, { token: studentToken });
    assert.equal(denied.status, 403);

    // Staff apaga; as respostas saem junto (ON DELETE CASCADE).
    const removed = await api.del(`/api/doubts/${doubt.data.id}`, { token: adminToken });
    assert.equal(removed.status, 200);
    assert.equal((await api.get('/api/doubts', { token: studentToken })).data.doubts.length, 0);
  });

  await t.test('erro do banco em rota assíncrona mantém a resposta original', async () => {
    // lesson_id inexistente viola a chave estrangeira.
    const res = await api.post('/api/admin/questions', {
      token: adminToken,
      body: { lesson_id: 999999, prompt: 'x', options: [], answer: 0 }
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /FOREIGN KEY/);

    const health = await api.get('/api/health');
    assert.equal(health.status, 200);
  });

  await t.test('pré-requisitos: middlewares assíncronos com next(route)', async () => {
    const other = await api.post('/api/admin/tracks', {
      token: adminToken,
      body: { title: 'Pré-requisito' }
    });

    const set = await api.put(`/api/admin/tracks/${trackId}`, {
      token: adminToken,
      body: { prerequisites: [other.data.id, 999999] }
    });

    assert.equal(set.status, 200);

    let tree = await api.get('/api/admin/tree', { token: adminToken });
    assert.deepEqual(tree.data.find(item => item.id === trackId).prerequisites, [other.data.id]);

    // Dependência circular é recusada.
    const circular = await api.put(`/api/admin/tracks/${other.data.id}`, {
      token: adminToken,
      body: { prerequisites: [trackId] }
    });

    assert.equal(circular.status, 400);
    assert.match(circular.data.error, /circular/);

    // Aluno ainda não concluiu a trilha exigida.
    const locked = await api.get(`/api/lessons/${lessonId}`, { token: studentToken });
    assert.equal(locked.status, 403);

    // Excluir a trilha exigida a remove dos pré-requisitos.
    const removed = await api.del(`/api/admin/tracks/${other.data.id}`, { token: adminToken });
    assert.equal(removed.status, 200);

    tree = await api.get('/api/admin/tree', { token: adminToken });
    assert.deepEqual(tree.data.find(item => item.id === trackId).prerequisites, []);
    assert.equal(tree.data.find(item => item.id === other.data.id), undefined);

    assert.equal((await api.get(`/api/lessons/${lessonId}`, { token: studentToken })).status, 200);
  });

  let backupFile;

  await t.test('backup: visão geral, exportação e validação', async () => {
    fs.writeFileSync(path.join(sandbox.uploads, 'imagem.png'), Buffer.from('png-original'));

    const overview = await api.get('/api/admin/system/overview', { token: adminToken });
    assert.equal(overview.status, 200);
<<<<<<< HEAD
    assert.equal(overview.data.database.tableCount, 20);
=======
    assert.equal(overview.data.database.tableCount, 23);
>>>>>>> 1907a42 (Alterações vindas da Versão Web x5)

    const table = await api.get('/api/admin/system/table/users', { token: adminToken });
    assert.equal(table.status, 200);
    assert.ok(!table.data.table.columns.includes('password'));
    assert.deepEqual(table.data.table.hiddenColumns, ['password']);

    const exported = await api.get('/api/admin/backup/export', { token: adminToken });
    assert.equal(exported.status, 200);
    backupFile = exported.data;

    const { data } = decryptBackupFile(backupFile);
<<<<<<< HEAD
    assert.equal(data.tables.length, 20);
=======
    assert.equal(data.tables.length, 23);
>>>>>>> 1907a42 (Alterações vindas da Versão Web x5)
    assert.equal(data.media.files.length, 1);

    const users = data.tables.find(item => item.name === 'users');
    assert.ok(users.columns.some(column => column.name === 'avatar'));
    assert.equal(users.rows.length, 3);

    const inspect = await api.post('/api/admin/backup/inspect', {
      token: adminToken,
      body: { data: backupFile.toString('base64') }
    });

    assert.equal(inspect.status, 200);
    assert.equal(inspect.data.summary.users, 3);
    assert.equal(inspect.data.summary.media.files, 1);

    const forbidden = await api.post('/api/admin/backup/inspect', {
      token: studentToken,
      body: { data: backupFile.toString('base64') }
    });

    assert.equal(forbidden.status, 403);
  });

  await t.test('restauração com erro não altera banco nem mídias', async () => {
    const before = await api.get('/api/admin/system/overview', { token: adminToken });

    const { container, data } = decryptBackupFile(backupFile);

    // Módulo apontando para uma trilha que não existe.
    data.tables.find(item => item.name === 'lessons').rows[0].track_id = 424242;
    data.tables.find(item => item.name === 'tracks').rows[0].title = 'NÃO DEVE APARECER';
    data.media.files[0].data = Buffer.from('png-do-backup-ruim').toString('base64');
    data.media.files[0].size = Buffer.from('png-do-backup-ruim').length;

    const bad = encryptBackupFile(container, data);

    const res = await api.post('/api/admin/backup/restore', {
      token: adminToken,
      body: { data: bad.toString('base64') }
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /chaves estrangeiras|FOREIGN KEY/);

    const after = await api.get('/api/admin/system/overview', { token: adminToken });
    assert.deepEqual(after.data.database.tables, before.data.database.tables);

    const tree = await api.get('/api/admin/tree', { token: adminToken });
    assert.equal(tree.data.find(item => item.id === trackId).title, 'Trilha Teste');

    assert.equal(
      fs.readFileSync(path.join(sandbox.uploads, 'imagem.png'), 'utf8'),
      'png-original'
    );
  });

  await t.test('restauração válida substitui dados e mídias', async () => {
    const { container, data } = decryptBackupFile(backupFile);

    data.tables.find(item => item.name === 'tracks').rows[0].title = 'Restaurada';
    data.media.files[0].data = Buffer.from('png-restaurado').toString('base64');
    data.media.files[0].size = Buffer.from('png-restaurado').length;

    // Alteração feita depois do backup: deve sumir na restauração.
    await api.post('/api/finance', {
      token: studentToken,
      body: { kind: 'receita', amount: 1, day: '2026-11-04' }
    });

    const res = await api.post('/api/admin/backup/restore', {
      token: adminToken,
      body: { data: encryptBackupFile(container, data).toString('base64') }
    });

    assert.equal(res.status, 200, JSON.stringify(res.data));

    const tree = await api.get('/api/admin/tree', { token: adminToken });
    assert.equal(tree.data.find(item => item.id === trackId).title, 'Restaurada');

    assert.equal(
      (await api.get('/api/finance?month=2026-11', { token: studentToken })).data.entries.length,
      0
    );

    assert.equal(
      fs.readFileSync(path.join(sandbox.uploads, 'imagem.png'), 'utf8'),
      'png-restaurado'
    );

    // Progresso, recompensas e login continuam funcionando.
    const tracks = await api.get('/api/tracks', { token: studentToken });
    assert.equal(tracks.data.xp, 148);
  });

  await t.test('exclusão de usuário remove os dados dependentes', async () => {
    const users = await api.get('/api/admin/users', { token: adminToken });
    const target = users.data.find(user => user.email === 'alvo@teste.local');

    const res = await api.del(`/api/admin/users/${target.id}`, { token: adminToken });
    assert.equal(res.status, 200);

    const self = await api.del(`/api/admin/users/${users.data.find(u => u.role === 'adm').id}`, {
      token: adminToken
    });

    assert.equal(self.status, 400);
  });

  await t.test('limpar banco preserva apenas administradores', async () => {
    const res = await api.post('/api/admin/database/clear', { token: adminToken });

    assert.equal(res.status, 200);
    assert.equal(res.data.deletedUsers, 1);
    assert.equal(res.data.remainingAdmins, 1);

    const overview = await api.get('/api/admin/system/overview', { token: adminToken });
    const rows = Object.fromEntries(
      overview.data.database.tables.map(item => [item.name, item.rows])
    );

    assert.equal(rows.users, 1);
    assert.equal(rows.tracks, 0);
    assert.equal(rows.challenges, 0);
    assert.equal(rows.challenge_rewards, 0);
    assert.equal(rows.progress, 0);
  });
});
