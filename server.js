require('dotenv').config({ quiet: true });

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const db = require('./db');
const {registerBackupRoutes} = require('./backup');

// As tabelas (inclusive lesson_evaluations, track_evaluations,
// evaluations e login_attempts) não são mais criadas aqui: o
// esquema é validado por db.ready() antes de o servidor iniciar.

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

// O banco agora é assíncrono e o Express 4 não trata Promises
// rejeitadas. Toda rota/middleware registrada abaixo (inclusive as
// do backup) repassa erros assíncronos ao next(), como acontecia
// com os erros síncronos.
function wrapAsync(handler) {
  if (
    typeof handler !== 'function' ||
    handler.length > 3 ||
    handler.handle
  ) {
    return handler;
  }

  return function asyncHandler(req, res, next) {
    const result = handler(req, res, next);

    if (result && typeof result.then === 'function') {
      result.catch(next);
    }
  };
}

for (const method of ['get', 'post', 'put', 'delete', 'use']) {
  const original = app[method].bind(app);

  app[method] = (...args) => original(...args.map(wrapAsync));
}

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

const json = express.json({
  limit: '2mb'
});

const jsonBig = express.json({
  limit: '40mb'
});

const jsonBackup = express.json({
  limit: '280mb'
});

// Foto de perfil: o navegador já reduz a imagem, mas a API
// aceita até ~2 MB de imagem (base64 ocupa ~33% a mais).
const jsonAvatar = express.json({
  limit: '8mb'
});

// Upload pode receber arquivos grandes.
// Demais requisições usam limite padrão.
app.use((req, res, next) => {
  if (
    (
      req.path === '/api/me/avatar' ||
      req.path === '/api/admin/avatars'
    ) &&
    req.headers.authorization
  ) {
    return jsonAvatar(req, res, next);
  }

  if (
    req.path === '/api/admin/upload' &&
    req.headers.authorization
  ) {
    return jsonBig(req, res, next);
  }

  if (
    (
      req.path === '/api/admin/backup/inspect' ||
      req.path === '/api/admin/backup/restore'
    ) &&
    req.headers.authorization
  ) {
    return jsonBackup(req, res, next);
  }

  return json(req, res, next);
});
// Arquivos estáticos do frontend.
app.use(
  express.static(PUBLIC_DIR)
);

// Ícones Lucide: se um SVG não estiver em public/icons,
// busca direto no pacote lucide-static (npm install).
app.use(
  '/icons',
  express.static(
    path.join(__dirname, 'node_modules', 'lucide-static', 'icons')
  )
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

app.get('/api/health', async (req, res) => {
  try {
    // Também verifica se o banco está respondendo.
    await db.prepare('SELECT 1').get();

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

// ============================================================
// FOTO DE PERFIL (AVATAR)
// ============================================================
//
// O banco guarda só o nome do arquivo (coluna users.avatar).
// O arquivo fica direto em UPLOAD_DIR (sem subpastas), por isso
// é incluído automaticamente no backup e na restauração.

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

// Nome gerado pelo próprio servidor. Qualquer outro valor
// (por exemplo, vindo de um backup adulterado) é ignorado.
// Foto enviada pelo próprio usuário (um arquivo por usuário).
const AVATAR_FILE_RE =
  /^avatar_\d+_[a-f0-9]{8,32}\.(jpg|png|webp)$/;

// Avatar da galeria cadastrada pelos administradores
// (o mesmo arquivo pode ser usado por vários usuários).
const PRESET_FILE_RE =
  /^preset_[a-f0-9]{8,32}\.(jpg|png|webp)$/;

const AVATAR_PRESET_MAX = 10;
const PRESET_LABEL_MAX = 30;

// Valores aceitos para EXIBIÇÃO (foto própria ou da galeria).
function safeAvatarFile(value) {
  const file = String(value || '');

  return (
    AVATAR_FILE_RE.test(file) ||
    PRESET_FILE_RE.test(file)
  )
    ? file
    : null;
}

function avatarUrl(user) {
  const file = safeAvatarFile(user?.avatar);

  return file
    ? '/uploads/' + file
    : null;
}

// Descobre o formato pelo conteúdo real do arquivo,
// sem confiar no nome ou no tipo informado pelo cliente.
function detectImageType(buffer) {
  if (
    buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'jpg';
  }

  if (
    buffer.length > 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a
      ])
    )
  ) {
    return 'png';
  }

  if (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

// Apaga apenas fotos enviadas pelo próprio usuário.
// Avatares da galeria nunca são apagados por aqui, pois
// podem estar em uso por outras pessoas.
function removeAvatarFile(value) {
  const file = String(value || '');

  if (!AVATAR_FILE_RE.test(file)) return;

  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, file));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(
        'Falha ao remover foto de perfil:',
        error.message
      );
    }
  }
}

// Lê e valida a imagem enviada em { data }.
// Retorna { buffer, type } ou { status, error }.
function readImageUpload(body) {
  let base64 = String(body?.data || '');

  if (base64.includes(',')) {
    base64 = base64.substring(base64.indexOf(',') + 1);
  }

  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) {
    return {
      status: 400,
      error: 'Nenhuma imagem foi enviada'
    };
  }

  if (buffer.length > AVATAR_MAX_BYTES) {
    return {
      status: 400,
      error: 'A foto deve ter no máximo 2 MB'
    };
  }

  const type = detectImageType(buffer);

  if (!type) {
    return {
      status: 400,
      error: 'Formato inválido. Use JPG, PNG ou WebP'
    };
  }

  return { buffer, type };
}

function removePresetFile(value) {
  const file = String(value || '');

  if (!PRESET_FILE_RE.test(file)) return;

  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, file));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(
        'Falha ao remover avatar da galeria:',
        error.message
      );
    }
  }
}

const pub = user => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar_url: avatarUrl(user)
});



 // ============================================================
 // PROTEÇÃO CONTRA BRUTE FORCE
 // ============================================================

const MAX_LOGIN_FAILURES = 5;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;

// Persistência do bloqueio na tabela login_attempts.

async function getLoginAttempt(email) {
  return await db.prepare(
    `SELECT failures, blocked_until
     FROM login_attempts
     WHERE email=?`
  ).get(email);
}

async function clearLoginAttempts(email) {
  await db.prepare(
    'DELETE FROM login_attempts WHERE email=?'
  ).run(email);
}

async function getRemainingBlockMs(email) {
  const attempt = await getLoginAttempt(email);

  if (!attempt || !attempt.blocked_until) {
    return 0;
  }

  const remaining = attempt.blocked_until - Date.now();

  if (remaining <= 0) {
    await clearLoginAttempts(email);
    return 0;
  }

  return remaining;
}

// Leitura e gravação na mesma transação: tentativas simultâneas
// não podem se sobrepor e "perder" erros na contagem.
function recordLoginFailure(email) {
  return db.transaction(async () => {
    const previous = await getLoginAttempt(email);
    const failures = Number(previous?.failures || 0) + 1;

    // Bloqueia a partir da sexta senha incorreta.
    const blockedUntil = failures > MAX_LOGIN_FAILURES
      ? Date.now() + LOGIN_BLOCK_MS
      : 0;

    await db.prepare(`
      INSERT INTO login_attempts (
        email, failures, blocked_until
      )
      VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        failures=excluded.failures,
        blocked_until=excluded.blocked_until
    `).run(email, failures, blockedUntil);

    return {
      failures,
      remainingAttempts: Math.max(
        0,
        MAX_LOGIN_FAILURES + 1 - failures
      ),
      blockedUntil
    };
  });
}


// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================================

async function auth(req, res, next) {
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
      await db
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
  } catch (error) {
    return res.status(401).json({
      error: 'Não autenticado'
    });
  }

  next();
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

// Administradores e professores.
const isStaff = user =>
  !!user &&
  (user.role === 'adm' || user.role === 'professor');

const staff = (req, res, next) => {
  if (!isStaff(req.user)) {
    return res.status(403).json({
      error:
        'Acesso restrito a professores e administradores'
    });
  }

  next();
};

// ============================================================
// BACKUP DO BANCO
// ============================================================

registerBackupRoutes(
  app,
  db,
  auth,
  adm
);

// ============================================================
// AUTENTICAÇÃO
// ============================================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirm
    } = req.body || {};

    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (
      !cleanName ||
      !cleanEmail ||
      typeof password !== 'string' ||
      password.length < 6
    ) {
      return res.status(400).json({
        error: 'Preencha nome, e-mail e senha (mín. 6 caracteres)'
      });
    }

    if (password !== confirm) {
      return res.status(400).json({
        error: 'As senhas não coincidem'
      });
    }

    // Lista de e-mails autorizados como administradores.
    const adminEmails = [
      process.env.ADMIN_EMAIL || '',
      ...(process.env.ADMIN_EMAILS || '').split(',')
    ]
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);

    const role = adminEmails.includes(cleanEmail)
      ? 'adm'
      : 'comum';

    const existing = await db
      .prepare('SELECT 1 FROM users WHERE email = ?')
      .get(cleanEmail);

    if (existing) {
      return res.status(409).json({
        error: 'E-mail já cadastrado'
      });
    }

    // Cada pessoa define sua própria senha.
    const hash = bcrypt.hashSync(password, 10);

    const id = (await db
      .prepare(`
        INSERT INTO users (name, email, password, role)
        VALUES (?, ?, ?, ?)
      `)
      .run(cleanName, cleanEmail, hash, role))
      .lastInsertRowid;

    const user = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id);

    return res.json({
      token: sign(user),
      user: pub(user)
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);

    return res.status(500).json({
      error: 'Erro interno ao realizar cadastro'
    });
  }
}); //   '/api/auth/register',


app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();

    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({
        error: 'Informe seu e-mail e senha.'
      });
    }

    // Verifica o bloqueio antes de validar a senha.
    const remainingMs = await getRemainingBlockMs(email);

    if (remainingMs > 0) {
      const remainingSeconds = Math.ceil(
        remainingMs / 1000
      );

      return res.status(429).json({
        error: 'Login temporariamente bloqueado.',
        code: 'LOGIN_BLOCKED',
        retryAfterSeconds: remainingSeconds
      });
    }

    const user = await db.prepare(
      'SELECT * FROM users WHERE email=?'
    ).get(email);

    const validPassword = user &&
      bcrypt.compareSync(password, user.password);

    if (!validPassword) {
      const attempt = await recordLoginFailure(email);

      if (attempt.blockedUntil > 0) {
        return res.status(429).json({
          error: 'Login temporariamente bloqueado.',
          code: 'LOGIN_BLOCKED',
          retryAfterSeconds: 600
        });
      }

      return res.status(401).json({
        error: 'E-mail ou senha inválidos.',
        code: 'INVALID_CREDENTIALS',
        remainingAttempts: attempt.remainingAttempts
      });
    }

    // Login correto: zera os erros anteriores.
    await clearLoginAttempts(email);

    return res.json({
      token: sign(user),
      user: pub(user)
    });

  } catch (error) {
    console.error('Erro no login:', error);

    return res.status(500).json({
      error: 'Erro interno ao realizar login'
    });
  }
});


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
// EDITAR PERFIL: NOME E FOTO
// ============================================================

const NAME_MIN = 2;
const NAME_MAX = 60;

app.put(
  '/api/me/name',
  auth,
  async (req, res) => {
    try {
      // Normaliza espaços e remove caracteres de controle.
      const name = String(req.body?.name ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (name.length < NAME_MIN) {
        return res.status(400).json({
          error:
            `O nome precisa ter pelo menos ${NAME_MIN} caracteres`
        });
      }

      if (name.length > NAME_MAX) {
        return res.status(400).json({
          error:
            `O nome pode ter no máximo ${NAME_MAX} caracteres`
        });
      }

      await db.prepare(
        'UPDATE users SET name=? WHERE id=?'
      ).run(name, req.user.id);

      const user = await db
        .prepare('SELECT * FROM users WHERE id=?')
        .get(req.user.id);

      return res.json({
        ok: true,
        user: pub(user)
      });
    } catch (error) {
      console.error('Erro ao alterar nome:', error);

      return res.status(500).json({
        error: 'Erro ao alterar o nome'
      });
    }
  }
);

app.post(
  '/api/me/avatar',
  auth,
  async (req, res) => {
    let savedFile = null;

    try {
      // Aceita base64 puro ou data URL (data:image/jpeg;base64,...).
      const upload = readImageUpload(req.body);

      if (upload.error) {
        return res.status(upload.status).json({
          error: upload.error
        });
      }

      const { buffer, type } = upload;

      const filename =
        `avatar_${req.user.id}_` +
        crypto.randomBytes(8).toString('hex') +
        '.' + type;

      fs.writeFileSync(
        path.join(UPLOAD_DIR, filename),
        buffer
      );

      savedFile = filename;

      const previous = req.user.avatar;

      await db.prepare(
        'UPDATE users SET avatar=? WHERE id=?'
      ).run(filename, req.user.id);

      // Só apaga a foto antiga depois de gravar a nova no banco.
      if (previous && previous !== filename) {
        removeAvatarFile(previous);
      }

      const user = await db
        .prepare('SELECT * FROM users WHERE id=?')
        .get(req.user.id);

      return res.json({
        ok: true,
        user: pub(user)
      });
    } catch (error) {
      console.error('Erro ao salvar foto de perfil:', error);

      // Não deixa arquivo órfão se o banco falhou.
      if (savedFile) {
        removeAvatarFile(savedFile);
      }

      return res.status(500).json({
        error: 'Erro ao salvar a foto de perfil'
      });
    }
  }
);

// ============================================================
// GALERIA DE AVATARES (cadastrada pelos administradores)
// ============================================================

const presetRows = async () =>
  (await db
    .prepare(
      `SELECT id, file, label
       FROM avatar_presets
       ORDER BY position, id`
    )
    .all())
    .filter(
      row =>
        PRESET_FILE_RE.test(row.file)
    )
    .map(row => ({
      id: row.id,
      label: row.label || '',
      url: '/uploads/' + row.file
    }));

// Lista para qualquer usuário logado escolher.
app.get(
  '/api/avatars',
  auth,
  async (req, res) => {
    res.json({
      max: AVATAR_PRESET_MAX,
      presets: await presetRows()
    });
  }
);

// O usuário escolhe um avatar da galeria.
app.post(
  '/api/me/avatar/preset',
  auth,
  async (req, res) => {
    try {
      const id = Number(req.body?.id);

      const preset = Number.isInteger(id)
        ? await db
            .prepare(
              'SELECT file FROM avatar_presets WHERE id=?'
            )
            .get(id)
        : null;

      if (!preset || !PRESET_FILE_RE.test(preset.file)) {
        return res.status(404).json({
          error: 'Avatar não encontrado'
        });
      }

      const previous = req.user.avatar;

      await db.prepare(
        'UPDATE users SET avatar=? WHERE id=?'
      ).run(preset.file, req.user.id);

      // Se a pessoa tinha uma foto própria, ela deixa de ser usada.
      removeAvatarFile(previous);

      const user = await db
        .prepare('SELECT * FROM users WHERE id=?')
        .get(req.user.id);

      return res.json({
        ok: true,
        user: pub(user)
      });
    } catch (error) {
      console.error('Erro ao escolher avatar:', error);

      return res.status(500).json({
        error: 'Erro ao escolher o avatar'
      });
    }
  }
);

// Administrador adiciona um avatar à galeria (máx. 10).
app.post(
  '/api/admin/avatars',
  auth,
  adm,
  async (req, res) => {
    let savedFile = null;

    try {
      const total = Number(
        (await db
          .prepare('SELECT COUNT(*) AS n FROM avatar_presets')
          .get()).n
      );

      if (total >= AVATAR_PRESET_MAX) {
        return res.status(400).json({
          error:
            `A galeria já tem ${AVATAR_PRESET_MAX} avatares. ` +
            'Remova um para adicionar outro.'
        });
      }

      const upload = readImageUpload(req.body);

      if (upload.error) {
        return res.status(upload.status).json({
          error: upload.error
        });
      }

      const label = String(req.body?.label ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, PRESET_LABEL_MAX);

      const filename =
        'preset_' +
        crypto.randomBytes(8).toString('hex') +
        '.' + upload.type;

      fs.writeFileSync(
        path.join(UPLOAD_DIR, filename),
        upload.buffer
      );

      savedFile = filename;

      const position =
        Number(
          (await db
            .prepare(
              'SELECT COALESCE(MAX(position), 0) + 1 AS p FROM avatar_presets'
            )
            .get()).p
        );

      await db.prepare(
        `INSERT INTO avatar_presets
           (file, label, position, created_at)
         VALUES (?, ?, ?, ?)`
      ).run(
        filename,
        label || null,
        position,
        new Date().toISOString()
      );

      return res.json({
        ok: true,
        max: AVATAR_PRESET_MAX,
        presets: await presetRows()
      });
    } catch (error) {
      console.error('Erro ao adicionar avatar:', error);

      // Não deixa arquivo órfão se o banco falhou.
      if (savedFile) {
        removePresetFile(savedFile);
      }

      return res.status(500).json({
        error: 'Erro ao adicionar o avatar'
      });
    }
  }
);

// Administrador remove um avatar da galeria.
app.delete(
  '/api/admin/avatars/:id',
  auth,
  adm,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const preset = Number.isInteger(id)
        ? await db
            .prepare(
              'SELECT id, file FROM avatar_presets WHERE id=?'
            )
            .get(id)
        : null;

      if (!preset) {
        return res.status(404).json({
          error: 'Avatar não encontrado'
        });
      }

      // Quem estava usando este avatar volta a ficar sem foto.
      await db.prepare(
        'UPDATE users SET avatar=NULL WHERE avatar=?'
      ).run(preset.file);

      await db.prepare(
        'DELETE FROM avatar_presets WHERE id=?'
      ).run(preset.id);

      removePresetFile(preset.file);

      return res.json({
        ok: true,
        max: AVATAR_PRESET_MAX,
        presets: await presetRows()
      });
    } catch (error) {
      console.error('Erro ao remover avatar:', error);

      return res.status(500).json({
        error: 'Erro ao remover o avatar'
      });
    }
  }
);

app.delete(
  '/api/me/avatar',
  auth,
  async (req, res) => {
    try {
      const previous = req.user.avatar;

      await db.prepare(
        'UPDATE users SET avatar=NULL WHERE id=?'
      ).run(req.user.id);

      removeAvatarFile(previous);

      const user = await db
        .prepare('SELECT * FROM users WHERE id=?')
        .get(req.user.id);

      return res.json({
        ok: true,
        user: pub(user)
      });
    } catch (error) {
      console.error('Erro ao remover foto de perfil:', error);

      return res.status(500).json({
        error: 'Erro ao remover a foto de perfil'
      });
    }
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

const one = async (
  sql,
  ...args
) =>
  await db
    .prepare(sql)
    .get(...args);

// Como Array.map, mas para callbacks que consultam o banco:
// executa um item por vez, na ordem (seguro dentro de transações).
const mapAsync = async (
  items,
  callback
) => {
  const result = [];

  for (const [index, item] of items.entries()) {
    result.push(await callback(item, index));
  }

  return result;
};

// ============================================================
// VIDAS
// ============================================================

async function hearts(id) {
  const user =
    await db
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

      await db.prepare(
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

async function loseHeart(id) {
  const state =
    await hearts(id);

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

  await db.prepare(
    `UPDATE users
     SET hearts=?,
         hearts_at=?
     WHERE id=?`
  ).run(
    newHearts,
    newTime,
    id
  );

  return await hearts(id);
}

// ============================================================
// PROGRESSO
// ============================================================

const isDone = async (
  uid,
  lid
) =>
  !!await db
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

async function unlocked(uid) {
  const progress =
    await db
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
    (await db
      .prepare(
        `SELECT best_streak b
         FROM users
         WHERE id=?`
      )
      .get(uid))
      ?.b || 0;


  const tracks =
    (await db
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
      .get(uid))
      .c;


  const challengeXp = (await db.prepare(`
    SELECT COALESCE(SUM(xp_awarded), 0) AS total
    FROM challenge_rewards
    WHERE user_id=?
  `).get(uid)).total;

  const state = {
    n: progress.n,
    xp: Number(progress.xp || 0) + Number(challengeXp || 0),
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

async function stats(uid) {

  const lessonXp = (await one(
    `SELECT COALESCE(SUM(xp), 0) AS v
     FROM progress
     WHERE user_id=?`,
    uid
  )).v;

  const challengeXp = (await one(
    `SELECT COALESCE(SUM(xp_awarded), 0) AS v
     FROM challenge_rewards
     WHERE user_id=?`,
    uid
  )).v;

  const xp = lessonXp + challengeXp;


  const tracks =
    (await one(
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
    )).v;

  const user =
    await one(
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
      (await one(
        `SELECT COUNT(*) v
         FROM progress
         WHERE user_id=?`,
        uid
      )).v,

    perfect:
      (await one(
        `SELECT COUNT(*) v
         FROM progress
         WHERE user_id=?
         AND perfect=1`,
        uid
      )).v
  };
}

async function awardBadges(uid) {
  const state =
    await stats(uid);

  const have =
    new Set(
      (await db
        .prepare(
          `SELECT code
           FROM badges
           WHERE user_id=?`
        )
        .all(uid))
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
      await db.prepare(
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

const todayAct = async uid =>
  await one(
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

async function bump(
  uid,
  fields
) {
  await db.prepare(
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
    await db.prepare(
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


/* ============================================================
   DESAFIOS — BACKEND
   ============================================================ */


// Transação de escrita: COMMIT se o callback terminar,
// ROLLBACK (feito por db.transaction) se ele lançar erro.
function challengeTransaction(callback) {
  return db.transaction(callback);
}


/* ============================================================
   DESAFIOS — ENCERRAMENTO ADMINISTRATIVO SEM PENALIDADE
   ============================================================ */

async function challengeCancelActiveAttempts(challengeId) {
  const now = Date.now();

  const result = await db.prepare(`
    UPDATE challenge_attempts
    SET
      status = 'expired',
      finished_at = ?,
      state_json = json_set(
        COALESCE(state_json, '{}'),
        '$.admin_cancelled',
        1
      )
    WHERE challenge_id = ?
      AND status = 'in_progress'
  `).run(now, challengeId);

  return Number(result.changes || 0);
}



const challengeJson = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

function challengePublic(row) {
  if (!row) return null;

  const {
    correct_answer,
    options,
    ...rest
  } = row;

  return {
    ...rest,
    options: challengeJson(options)
  };
}

function challengeError(res, error) {
  console.error('[DESAFIOS]', error);

  return res.status(500).json({
    error: 'Não foi possível processar o desafio.'
  });
}


/* ============================================================
   DESAFIOS MULTITIPOS — CONSULTA E CATÁLOGO
   ============================================================ */

const CHALLENGE_TYPE_INFO = Object.freeze({
  tempo: {
    name: 'Contra o tempo',
    icon: 'zap'
  },
  precisao: {
    name: 'Precisão',
    icon: 'target'
  },
  quebra_cabeca: {
    name: 'Quebra-cabeça',
    icon: 'puzzle'
  },
  resistencia: {
    name: 'Resistência',
    icon: 'flame'
  }
});

function challengeValidId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

function challengeConfig(value) {
  try {
    const parsed = JSON.parse(value || '{}');

    return parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
        ? parsed
        : {};
  } catch {
    return {};
  }
}

function challengeSummary(row) {
  return {
    id: row.id,
    track_id: row.track_id,
    title: row.title,
    description: row.description,
    type: row.type,
    type_name:
      CHALLENGE_TYPE_INFO[row.type]?.name ||
      'Desafio',
    type_icon:
      CHALLENGE_TYPE_INFO[row.type]?.icon ||
      'trophy',
    enabled: Boolean(row.enabled),
    time_limit: row.time_limit,
    xp_reward: row.xp_reward,
    max_attempts: row.max_attempts,
    badge_name: row.badge_name,
    badge_description: row.badge_description,
    badge_icon: row.badge_icon
  };
}

// Lista completa para professores e administradores.
app.get(
  '/api/admin/tracks/:trackId/challenges',
  auth,
  staff,
  async (req, res) => {
    try {
      const trackId = challengeValidId(
        req.params.trackId
      );

      if (!trackId) {
        return res.status(400).json({
          error: 'Trilha inválida.'
        });
      }

      const track = await db.prepare(`
        SELECT id
        FROM tracks
        WHERE id = ?
      `).get(trackId);

      if (!track) {
        return res.status(404).json({
          error: 'Trilha não encontrada.'
        });
      }

    const rows = await db.prepare(`
      SELECT *
      FROM challenges
      WHERE track_id = ?
        AND deleted_at IS NULL
      ORDER BY id
    `).all(trackId);

      const challenges = await mapAsync(rows, async row => {
        const questionRows = await db.prepare(`
          SELECT
            id,
            question_type,
            prompt,
            options,
            correct_answer,
            difficulty,
            position
          FROM challenge_questions
          WHERE challenge_id = ?
            AND revision = ?
          ORDER BY position, id
          `).all(
            row.id,
            Number(row.revision || 1)
          );

        const attempts = (await db.prepare(`
          SELECT COUNT(*) AS total
          FROM challenge_attempts
          WHERE challenge_id = ?
        `) .get(row.id)).total;

        

        return {
          ...row,
          options: challengeJson(row.options),
          config: challengeConfig(row.config_json),
          questions: questionRows.map(q => ({
            ...q,
            options: challengeJson(q.options)
          })),
          locked: attempts > 0,
          attempts_count: attempts
        };
      });

      return res.json({
        ok: true,
        challenges
      });

    } catch (error) {
      return challengeError(res, error);
    }
  }
);

// Lista pública dos desafios ativos da trilha.
app.get(
  '/api/tracks/:trackId/challenges',
  auth,
  async (req, res) => {
    try {
      const trackId = challengeValidId(
        req.params.trackId
      );

      if (!trackId) {
        return res.status(400).json({
          error: 'Trilha inválida.'
        });
      }

      const missingTracks = await trilhasFaltando(
        req.user,
        trackId
      );

      if (missingTracks.length) {
        return res.status(403).json({
          error:
            'Conclua primeiro as trilhas obrigatórias: ' +
            missingTracks.join(', ')
        });
      }

      const rows = await db.prepare(`
        SELECT *
        FROM challenges
        WHERE track_id = ?
          AND enabled = 1
          AND deleted_at IS NULL
        ORDER BY id
      `).all(trackId);


      const challenges = await mapAsync(rows, async row => {
        const attempts = (await db.prepare(`
          SELECT COUNT(*) AS total
          FROM challenge_attempts
          WHERE challenge_id = ?
            AND user_id = ?
            AND NOT (
              status = 'expired'
              AND COALESCE(
                json_extract(state_json, '$.admin_cancelled'),
                0
              ) = 1
            )
        `).get(row.id, req.user.id)).total;

        const reward = await db.prepare(`
          SELECT xp_awarded, awarded_at
          FROM challenge_rewards
          WHERE challenge_id = ?
            AND user_id = ?
        `).get(row.id, req.user.id);

        const active = await db.prepare(`
          SELECT id, deadline_at
          FROM challenge_attempts
          WHERE challenge_id = ?
            AND user_id = ?
            AND status = 'in_progress'
        `).get(row.id, req.user.id);

        return {
          ...challengeSummary(row),
          question_count: (await db.prepare(`
            SELECT COUNT(*) AS total
            FROM challenge_questions
            WHERE challenge_id = ?
              AND revision = ?
            `).get(
              row.id,
              Number(row.revision || 1)
            )).total,
          attempts,
          remaining: Math.max(
            0,
            row.max_attempts - attempts
          ),
          completed: Boolean(reward),
          reward: reward || null,
          active: active
            ? {
                id: active.id,
                deadline_at: active.deadline_at
              }
            : null
        };
      });

      return res.json({
        ok: true,
        challenges
      });

    } catch (error) {
      return challengeError(res, error);
    }
  }
);


/* ============================================================
   DESAFIOS MULTITIPOS — CADASTRO E EDIÇÃO
   ============================================================ */

// Valida e normaliza os dados recebidos do painel.
function challengeValidatePayload(body) {
  const data = body || {};

  const type = String(data.type || '').trim();

  if (!Object.hasOwn(CHALLENGE_TYPE_INFO, type)) {
    throw new Error('Selecione um tipo de desafio válido.');
  }

  const title = String(data.title || '').trim();
  const description = String(data.description || '').trim();

  if (!title || title.length > 120) {
    throw new Error('O título deve ter de 1 a 120 caracteres.');
  }

  if (description.length > 2000) {
    throw new Error('A descrição deve ter até 2000 caracteres.');
  }

  const xpReward = Number(data.xp_reward ?? 1000);
  const maxAttempts = Number(data.max_attempts ?? 1);
  const timeLimit = Number(data.time_limit ?? 30);

  if (!Number.isInteger(xpReward) ||
      xpReward < 0 || xpReward > 100000) {
    throw new Error('O XP deve estar entre 0 e 100000.');
  }

  if (!Number.isInteger(maxAttempts) ||
      maxAttempts < 1 || maxAttempts > 100) {
    throw new Error('O limite deve ser de 1 a 100 tentativas.');
  }

  if (!Number.isInteger(timeLimit) ||
      timeLimit < 5 || timeLimit > 3600) {
    throw new Error('O tempo deve estar entre 5 e 3600 segundos.');
  }

  const badgeName = String(
    data.badge_name || 'Conquistador'
  ).trim();

  const badgeDescription = String(
    data.badge_description || ''
  ).trim();

  const badgeIcon = String(
    data.badge_icon || 'trophy'
  ).trim();

  if (!badgeName || badgeName.length > 120 ||
      badgeDescription.length > 500 ||
      !badgeIcon || badgeIcon.length > 80) {
    throw new Error('Dados da conquista inválidos.');
  }

  const enabled =
    data.enabled === true || data.enabled === 1
      ? 1
      : 0;

  const config = data.config || {};

  if (!config || typeof config !== 'object' ||
      Array.isArray(config)) {
    throw new Error('Configuração inválida.');
  }

  const lives = Number(config.lives ?? 3);

  if (!Number.isInteger(lives) ||
      lives < 1 || lives > 10) {
    throw new Error('A resistência deve ter de 1 a 10 vidas.');
  }

  if (!Array.isArray(data.questions) ||
      data.questions.length < 1 ||
      data.questions.length > 50) {
    throw new Error('Informe de 1 a 50 questões.');
  }

    
  if (type === 'tempo' && data.questions.length < 2) {
    throw new Error(
      'O desafio Contra o Tempo deve ter pelo menos duas questões.'
    );
  }

  const questions = data.questions.map((raw, index) => {
    const prompt = String(raw.prompt || '').trim();

    if (!prompt || prompt.length > 2000) {
      throw new Error(
        `A questão ${index + 1} precisa de um enunciado válido.`
      );
    }

    const questionType =
      type === 'quebra_cabeca'
        ? 'ordenar'
        : 'multipla';

    const options = Array.isArray(raw.options)
      ? raw.options.map(v => String(v).trim())
      : [];

    if (options.length < 2 ||
        options.length > 10 ||
        options.some(v => !v || v.length > 500) ||
        new Set(options.map(v => v.toLowerCase())).size !==
          options.length) {
      throw new Error(
        `A questão ${index + 1} precisa de 2 a 10 opções distintas.`
      );
    }

    let correctAnswer;

    if (questionType === 'multipla') {
      // A tabela atual armazena o índice da alternativa.
      correctAnswer = Number(raw.correct_answer);

      if (!Number.isInteger(correctAnswer) ||
          correctAnswer < 0 ||
          correctAnswer >= options.length) {
        throw new Error(
          `Selecione a alternativa correta da questão ${index + 1}.`
        );
      }
    } else {
      // Para ordenação, o gabarito é representado
      // pela posição das opções no cadastro:
      // [0, 1, 2, ...].
      // O motor de respostas usará essa convenção.
      correctAnswer = 0;
    }

    const difficulty = Number(
      raw.difficulty ?? Math.min(index + 1, 10)
    );

    if (!Number.isInteger(difficulty) ||
        difficulty < 1 || difficulty > 10) {
      throw new Error(
        `Dificuldade inválida na questão ${index + 1}.`
      );
    }

    return {
      question_type: questionType,
      prompt,
      options,
      correct_answer: correctAnswer,
      difficulty,
      position: index
    };
  });

  if (type === 'resistencia') {
    // Mantém a progressão de dificuldade.
    for (let i = 1; i < questions.length; i++) {
      if (questions[i].difficulty <
          questions[i - 1].difficulty) {
        throw new Error(
          'Na Resistência, a dificuldade não pode diminuir.'
        );
      }
    }
  }

  return {
    title,
    description,
    type,
    enabled,
    time_limit: timeLimit,
    xp_reward: xpReward,
    max_attempts: maxAttempts,
    badge_name: badgeName,
    badge_description: badgeDescription,
    badge_icon: badgeIcon,
    config_json: JSON.stringify({
      lives: type === 'resistencia' ? lives : 1
    }),
    questions
  };
}

// Salva todas as questões de um desafio novo ou
// ainda sem tentativas.

/* ============================================================
   DESAFIOS — SALVAR QUESTÕES COM VERSIONAMENTO
   ============================================================ */

async function challengeSaveQuestions(challengeId, questions) {
  const challenge = await db.prepare(`
    SELECT revision
    FROM challenges
    WHERE id = ?
      AND deleted_at IS NULL
  `).get(challengeId);

  if (!challenge) {
    throw new Error(
      'Não foi possível salvar: desafio não encontrado.'
    );
  }

  const revision = Number(challenge.revision || 1);

  // Não exclui as questões de revisões anteriores.
  // Cada edição recebe um novo conjunto de questões.

  const insert = db.prepare(`
    INSERT INTO challenge_questions (
      challenge_id,
      revision,
      question_type,
      prompt,
      options,
      correct_answer,
      difficulty,
      position
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const question of questions) {
    await insert.run(
      challengeId,
      revision,
      question.question_type,
      question.prompt,
      JSON.stringify(question.options),
      question.correct_answer,
      question.difficulty,
      question.position
    );
  }

  return revision;
}


// Cria um novo desafio na trilha.
app.post(
  '/api/admin/tracks/:trackId/challenges',
  auth,
  staff,
  async (req, res) => {
    try {
      const trackId = challengeValidId(
        req.params.trackId
      );

      if (!trackId) {
        return res.status(400).json({
          error: 'Trilha inválida.'
        });
      }

      const track = await db.prepare(`
        SELECT id
        FROM tracks
        WHERE id = ?
      `).get(trackId);

      if (!track) {
        return res.status(404).json({
          error: 'Trilha não encontrada.'
        });
      }

      let data;

      try {
        data = challengeValidatePayload(req.body);
      } catch (error) {
        return res.status(400).json({
          error: error.message
        });
      }

      const saved = await challengeTransaction(async () => {
        const first = data.questions[0];

        const result = await db.prepare(`
          INSERT INTO challenges (
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
            config_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          trackId,
          data.title,
          data.description,
          data.type,
          data.enabled,
          first.prompt,
          JSON.stringify(first.options),
          first.correct_answer,
          data.time_limit,
          data.xp_reward,
          'pending',
          data.badge_name,
          data.badge_description,
          data.badge_icon,
          data.max_attempts,
          data.config_json
        );

        const challengeId = Number(
          result.lastInsertRowid
        );

        // Cada desafio recebe um código exclusivo,
        // mesmo quando pertence à mesma trilha.
        await db.prepare(`
          UPDATE challenges
          SET badge_code = ?
          WHERE id = ?
        `).run(
          `challenge_${challengeId}`,
          challengeId
        );

        await challengeSaveQuestions(
          challengeId,
          data.questions
        );

        return await db.prepare(`
          SELECT id, track_id, title, type, enabled
          FROM challenges
          WHERE id = ?
        `).get(challengeId);
      });

      return res.status(201).json({
        ok: true,
        challenge: saved
      });

    } catch (error) {
      return challengeError(res, error);
    }
  }
);


 // Edita um desafio específico, preservando recompensas anteriores.
app.put(
  '/api/admin/challenges/:challengeId',
  auth,
  staff,
  async (req, res) => {
    try {
      const challengeId = challengeValidId(
        req.params.challengeId
      );

      if (!challengeId) {
        return res.status(400).json({
          error: 'Desafio inválido.'
        });
      }

      let data;

      try {
        data = challengeValidatePayload(req.body);
      } catch (error) {
        return res.status(400).json({
          error: error.message
        });
      }

      const result = await challengeTransaction(async () => {
        const existing = await db.prepare(`
          SELECT *
          FROM challenges
          WHERE id = ?
            AND deleted_at IS NULL
        `).get(challengeId);

        if (!existing) {
          return null;
        }

        // Encerra tentativas em andamento sem consumir
        // uma tentativa do aluno e sem retirar XP.
        const cancelledAttempts =
          await challengeCancelActiveAttempts(challengeId);

        const first = data.questions[0];

        await db.prepare(`
          UPDATE challenges
          SET
            title = ?,
            description = ?,
            type = ?,
            enabled = ?,
            question = ?,
            options = ?,
            correct_answer = ?,
            time_limit = ?,
            xp_reward = ?,
            badge_name = ?,
            badge_description = ?,
            badge_icon = ?,
            max_attempts = ?,
            config_json = ?,
            revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND deleted_at IS NULL
        `).run(
          data.title,
          data.description,
          data.type,
          data.enabled,
          first.prompt,
          JSON.stringify(first.options),
          first.correct_answer,
          data.time_limit,
          data.xp_reward,
          data.badge_name,
          data.badge_description,
          data.badge_icon,
          data.max_attempts,
          data.config_json,
          challengeId
        );

        // Atualiza as questões sem apagar o histórico
        // das tentativas concluídas ou as recompensas.
        await challengeSaveQuestions(
          challengeId,
          data.questions
        );

        const updated = await db.prepare(`
          SELECT
            id,
            track_id,
            title,
            type,
            enabled,
            revision
          FROM challenges
          WHERE id = ?
        `).get(challengeId);

        return {
          challenge: updated,
          cancelledAttempts
        };
      });

      if (!result) {
        return res.status(404).json({
          error: 'Desafio não encontrado ou excluído.'
        });
      }

      return res.json({
        ok: true,
        challenge: result.challenge,
        cancelled_attempts: result.cancelledAttempts,
        message:
          'Desafio atualizado. Tentativas em andamento ' +
          'foram encerradas sem penalidade.'
      });

    } catch (error) {
      return challengeError(res, error);
    }
  }
);

/* ============================================================
   ADMINISTRAÇÃO — EXCLUSÃO LÓGICA DE DESAFIOS
   ============================================================ */

app.delete(
  '/api/admin/challenges/:challengeId',
  auth,
  adm,
  async (req, res) => {
    try {
      const challengeId = challengeValidId(
        req.params.challengeId
      );

      if (!challengeId) {
        return res.status(400).json({
          error: 'Desafio inválido.'
        });
      }

      const result = await challengeTransaction(async () => {
        const challenge = await db.prepare(`
          SELECT id, title
          FROM challenges
          WHERE id = ?
            AND deleted_at IS NULL
        `).get(challengeId);

        if (!challenge) {
          return null;
        }

        // Cancela tentativas em andamento sem penalidade.
        const cancelledAttempts =
          await challengeCancelActiveAttempts(challengeId);

        // Exclusão lógica: preserva o registro original.
        await db.prepare(`
          UPDATE challenges
          SET
            enabled = 0,
            deleted_at = CURRENT_TIMESTAMP,
            revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND deleted_at IS NULL
        `).run(challengeId);

        return {
          id: challenge.id,
          title: challenge.title,
          cancelledAttempts
        };
      });

      if (!result) {
        return res.status(404).json({
          error: 'Desafio não encontrado ou já excluído.'
        });
      }

      return res.json({
        ok: true,
        deleted: true,
        challenge_id: result.id,
        cancelled_attempts: result.cancelledAttempts,
        message:
          'Desafio excluído com sucesso. ' +
          'O histórico e as recompensas dos alunos foram preservados.'
      });

    } catch (error) {
      return challengeError(res, error);
    }
  }
);

// ============================================================
// ADMINISTRAÇÃO — CONSULTAR DESAFIO
// ============================================================

app.get('/api/admin/tracks/:trackId/challenge', auth, staff, async (req, res) => {
  try {
    const trackId = Number(req.params.trackId);

    if (!Number.isSafeInteger(trackId) || trackId <= 0) {
      return res.status(400).json({
        error: 'Trilha inválida.'
      });
    }

    const challenge = await db.prepare(
      'SELECT * FROM challenges WHERE track_id=?'
    ).get(trackId);

    return res.json({
      challenge: challenge
        ? {
            ...challenge,
            options: challengeJson(challenge.options)
          }
        : null
    });
  } catch (error) {
    return challengeError(res, error);
  }
});


/* ============================================================
   ADMINISTRAÇÃO — ROTA ANTIGA DE EDIÇÃO
   ============================================================ */

// A edição antiga foi desativada para impedir alterações
// que ignorem o controle de revisões, as tentativas dos
// alunos e a preservação das recompensas.
//
// O painel atualizado deve utilizar:
// POST /api/admin/tracks/:trackId/challenges
// PUT  /api/admin/challenges/:challengeId

app.put(
  '/api/admin/tracks/:trackId/challenge',
  auth,
  staff,
  (req, res) => {
    return res.status(410).json({
      ok: false,
      error:
        'Esta forma de edição foi descontinuada. ' +
        'Atualize o painel administrativo para utilizar ' +
        'o editor de desafios.'
    });
  }
);

// ============================================================
// ALUNO — VISUALIZAR DESAFIO
// ============================================================

app.get('/api/tracks/:trackId/challenge', auth, async (req, res) => {
  try {
    const trackId = Number(req.params.trackId);
    const uid = req.user.id;

    const missingTracks = await trilhasFaltando(req.user, trackId);

    if (missingTracks.length) {
      return res.status(403).json({
        error:
          'Conclua primeiro as trilhas obrigatórias: ' +
          missingTracks.join(', ')
      });
    }


    if (!Number.isSafeInteger(trackId) || trackId <= 0) {
      return res.status(400).json({ error: 'Trilha inválida.' });
    }

    const challenge = await db.prepare(
      'SELECT * FROM challenges WHERE track_id=? AND enabled=1 AND deleted_at IS NULL'
    ).get(trackId);

    if (!challenge) {
      return res.status(404).json({
        error: 'Desafio indisponível.'
      });
    }

   const attempts = (await db.prepare(`
    SELECT COUNT(*) AS total
    FROM challenge_attempts
    WHERE challenge_id = ?
      AND user_id = ?
      AND NOT (
        status = 'expired'
        AND COALESCE(
          json_extract(state_json, '$.admin_cancelled'),
          0
        ) = 1
      )
  `).get(challenge.id, uid)).total;

    const reward = await db.prepare(`
      SELECT xp_awarded, badge_code, awarded_at
      FROM challenge_rewards
      WHERE challenge_id=? AND user_id=?
    `).get(challenge.id, uid);

    const active = await db.prepare(`
      SELECT id, deadline_at
      FROM challenge_attempts
      WHERE challenge_id=? AND user_id=?
        AND status='in_progress'
    `).get(challenge.id, uid);

    const activeValid = active && Date.now() < active.deadline_at;

    const publicChallenge = challengePublic(challenge);

    // Não revelar alternativas antes de iniciar.
    delete publicChallenge.options;
    delete publicChallenge.question;

    return res.json({
      challenge: publicChallenge,
      attempts,
      remaining: Math.max(0, challenge.max_attempts - attempts),
      completed: Boolean(reward),
      reward: reward || null,
      active: activeValid
        ? { id: active.id, deadline_at: active.deadline_at }
        : null
    });
  } catch (error) {
    return challengeError(res, error);
  }
});


/* ============================================================
   DESAFIOS MULTITIPOS — INICIAR E RETOMAR
   ============================================================ */

const CHALLENGE_SESSION_MS = 24 * 60 * 60 * 1000;

function challengeReadState(value) {
  try {
    const state = JSON.parse(value || '{}');

    return state &&
      typeof state === 'object' &&
      !Array.isArray(state)
        ? state
        : {};
  } catch {
    return {};
  }
}

// Embaralhamento criptograficamente seguro.
// A ordem gerada é salva no banco para impedir
// que o aluno obtenha outra sequência ao atualizar.
function challengeShuffleIndexes(length) {
  const indexes = Array.from(
    { length },
    (_, index) => index
  );

  for (let i = indexes.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);

    [indexes[i], indexes[j]] = [
      indexes[j],
      indexes[i]
    ];
  }

  return indexes;
}

// Recupera a questão atual sem revelar o gabarito.
async function challengeCurrentQuestion(attempt, challenge) {
  const questions = await db.prepare(`
    SELECT
      id,
      question_type,
      prompt,
      options,
      difficulty,
      position
    FROM challenge_questions
    WHERE challenge_id = ?
    AND revision = ?
    ORDER BY position, id

 `).all(
  challenge.id,
  Number(attempt.challenge_revision || 1)
);

  const index = Number(attempt.current_question || 0);

  if (index < 0 || index >= questions.length) {
    return null;
  }

  const question = questions[index];
  const options = challengeJson(question.options);
  const state = challengeReadState(attempt.state_json);

  let order = state.order;

  if (
    !Array.isArray(order) ||
    order.length !== options.length ||
    new Set(order).size !== options.length ||
    order.some(
      value =>
        !Number.isInteger(value) ||
        value < 0 ||
        value >= options.length
    )
  ) {
    order = challengeShuffleIndexes(options.length);

    // O estado deve ser persistido antes de enviar
    // a questão ao aluno.
    state.order = order;

    await db.prepare(`
      UPDATE challenge_attempts
      SET state_json = ?
      WHERE id = ?
        AND status = 'in_progress'
    `).run(
      JSON.stringify(state),
      attempt.id
    );
  }

  const displayedOptions = order.map(
    originalIndex => options[originalIndex]
  );

  return {
    id: question.id,
    index,
    total: questions.length,
    question_type: question.question_type,
    prompt: question.prompt,
    options: displayedOptions,
    difficulty: question.difficulty
  };
}

async function challengeAttemptResponse(attempt, challenge) {
  const question = await challengeCurrentQuestion(
    attempt,
    challenge
  );

  const config = challengeConfig(
    challenge.config_json
  );

  const lives = challenge.type === 'resistencia'
    ? Number(config.lives || 3)
    : 1;

  return {
    ok: true,
    attempt_id: attempt.id,
    challenge_id: challenge.id,
    type: challenge.type,
    title: challenge.title,
    server_time: Date.now(),
    deadline_at: challenge.type === 'tempo'
      ? attempt.deadline_at
      : null,
    current_question: Number(
      attempt.current_question || 0
    ),
    mistakes: Number(attempt.mistakes || 0),
    lives_remaining: challenge.type === 'resistencia'
      ? Math.max(0, lives - Number(attempt.mistakes || 0))
      : null,
    question,
    // Campos de compatibilidade com o frontend antigo.
    ...(question
      ? {
          options: question.options
        }
      : {})
  };
}

// Inicia um desafio específico, independentemente
// de quantos desafios existam na mesma trilha.
app.post(
  '/api/challenges/:challengeId/start',
  auth,
  async (req, res) => {
    try {
      const challengeId = challengeValidId(
        req.params.challengeId
      );

      if (!challengeId) {
        return res.status(400).json({
          error: 'Desafio inválido.'
        });
      }

      const uid = req.user.id;

      
    const challenge = await db.prepare(`
      SELECT *
      FROM challenges
      WHERE id = ?
        AND enabled = 1
        AND deleted_at IS NULL
    `).get(challengeId);


      if (!challenge) {
        return res.status(404).json({
          error: 'Desafio indisponível.'
        });
      }

      const missingTracks = await trilhasFaltando(
        req.user,
        challenge.track_id
      );

      if (missingTracks.length) {
        return res.status(403).json({
          error:
            'Conclua primeiro as trilhas obrigatórias: ' +
            missingTracks.join(', ')
        });
      }

      const result = await challengeTransaction(async () => {
        const reward = await db.prepare(`
          SELECT id
          FROM challenge_rewards
          WHERE challenge_id = ?
            AND user_id = ?
        `).get(challengeId, uid);

        if (reward) {
          return {
            code: 409,
            error: 'Você já concluiu este desafio.'
          };
        }

        const now = Date.now();

        let attempt = await db.prepare(`
          SELECT *
          FROM challenge_attempts
          WHERE challenge_id = ?
            AND user_id = ?
            AND status = 'in_progress'
        `).get(challengeId, uid);

        if (attempt && now >= attempt.deadline_at) {
          await db.prepare(`
            UPDATE challenge_attempts
            SET
              status = 'expired',
              finished_at = ?
            WHERE id = ?
              AND status = 'in_progress'
          `).run(now, attempt.id);

          attempt = null;
        }

        if (!attempt) {
          const count = (await db.prepare(`
          SELECT COUNT(*) AS total
          FROM challenge_attempts
          WHERE challenge_id = ?
            AND user_id = ?
            AND NOT (
              status = 'expired'
              AND COALESCE(
                json_extract(state_json, '$.admin_cancelled'),
                0
              ) = 1
            )
        `).get(challengeId, uid)).total;

          if (count >= challenge.max_attempts) {
            return {
              code: 403,
              error: 'Você atingiu o limite de tentativas.'
            };
          }


        const questionCount = (await db.prepare(`
          SELECT COUNT(*) AS total
          FROM challenge_questions
          WHERE challenge_id = ?
            AND revision = ?
        `).get(
          challengeId,
          Number(challenge.revision || 1)
        )).total;

          if (questionCount === 0) {
            return {
              code: 409,
              error: 'Este desafio ainda não possui questões.'
            };
          }

          const deadline = challenge.type === 'tempo'
            ? now + challenge.time_limit * 1000
            : now + CHALLENGE_SESSION_MS;

          
        const inserted = await db.prepare(`
          INSERT INTO challenge_attempts (
            challenge_id,
            user_id,
            started_at,
            deadline_at,
            current_question,
            mistakes,
            state_json,
            status,
            challenge_revision
          )
          VALUES (?, ?, ?, ?, 0, 0, '{}', 'in_progress', ?)
        `).run(
          challengeId,
          uid,
          now,
          deadline,
          Number(challenge.revision || 1)
        );


          attempt = await db.prepare(`
            SELECT *
            FROM challenge_attempts
            WHERE id = ?
          `).get(Number(inserted.lastInsertRowid));
        }

        return await challengeAttemptResponse(
          attempt,
          challenge
        );
      });

      if (result.error) {
        return res.status(result.code).json({
          error: result.error
        });
      }

      return res.json(result);

    } catch (error) {
      return challengeError(res, error);
    }
  }
);

// ============================================================
// ALUNO — INICIAR DESAFIO
// ============================================================

app.post('/api/tracks/:trackId/challenge/start', auth, async (req, res) => {
  try {
    const trackId = Number(req.params.trackId);
    const uid = req.user.id;

    if (!Number.isSafeInteger(trackId) || trackId <= 0) {
      return res.status(400).json({ error: 'Trilha inválida.' });
    }

      const missingTracks = await trilhasFaltando(req.user, trackId);

      if (missingTracks.length) {
        return res.status(403).json({
          error:
            'Conclua primeiro as trilhas obrigatórias: ' +
            missingTracks.join(', ')
        });
      }

    const challenge = await db.prepare(
      'SELECT * FROM challenges WHERE track_id=? AND enabled=1 AND deleted_at IS NULL'
    ).get(trackId);

    if (!challenge) {
      return res.status(404).json({
        error: 'Desafio indisponível.'
      });
    }

    const startAttempt = () => challengeTransaction(async () => {
      const reward = await db.prepare(`
        SELECT id FROM challenge_rewards
        WHERE challenge_id=? AND user_id=?
      `).get(challenge.id, uid);

      if (reward) {
        return { error: 'Você já conquistou esta recompensa.', code: 409 };
      }

      const now = Date.now();

      const active = await db.prepare(`
        SELECT * FROM challenge_attempts
        WHERE challenge_id=? AND user_id=?
          AND status='in_progress'
      `).get(challenge.id, uid);

      if (active) {
        if (now < active.deadline_at) {
          return { attempt: active };
        }

        await db.prepare(`
          UPDATE challenge_attempts
          SET status='expired', finished_at=?
          WHERE id=? AND status='in_progress'
        `).run(now, active.id);
      }


      const count = (await db.prepare(`
        SELECT COUNT(*) AS total
        FROM challenge_attempts
        WHERE challenge_id = ?
          AND user_id = ?
          AND NOT (
            status = 'expired'
            AND COALESCE(
              json_extract(state_json, '$.admin_cancelled'),
              0
            ) = 1
          )
      `).get(challenge.id, uid)).total;

      if (count >= challenge.max_attempts) {
        return { error: 'Você atingiu o limite de tentativas.', code: 403 };
      }

      const deadline = now + challenge.time_limit * 1000;


      const result = await db.prepare(`
        INSERT INTO challenge_attempts (
          challenge_id,
          user_id,
          started_at,
          deadline_at,
          challenge_revision
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        challenge.id,
        uid,
        now,
        deadline,
        Number(challenge.revision || 1)
      );

      return {
        attempt: {
          id: Number(result.lastInsertRowid),
          started_at: now,
          deadline_at: deadline
        }
      };
    });

    const result = await startAttempt();

    if (result.error) {
      return res.status(result.code).json({ error: result.error });
    }

    return res.json({
      ok: true,
      attempt_id: result.attempt.id,
      server_time: Date.now(),
      deadline_at: result.attempt.deadline_at,
      question: challenge.question,
      options: challengeJson(challenge.options)
    });
  } catch (error) {
    return challengeError(res, error);
  }
});

// ============================================================
// ALUNO — RESPONDER AO DESAFIO
// ============================================================

/* ============================================================
   MOTOR DE RESPOSTAS — QUATRO TIPOS DE DESAFIO
   ============================================================ */

app.post(
  '/api/challenges/attempts/:attemptId/answer',
  auth,
  async (req, res) => {
    try {
      const attemptId = challengeValidId(
        req.params.attemptId
      );

      const uid = req.user.id;

      if (!attemptId) {
        return res.status(400).json({
          error: 'Tentativa inválida.'
        });
      }

      const access = await db.prepare(`
        SELECT c.track_id
        FROM challenge_attempts a
        JOIN challenges c
          ON c.id = a.challenge_id
        WHERE a.id = ?
          AND a.user_id = ?
      `).get(attemptId, uid);

      if (!access) {
        return res.status(404).json({
          error: 'Tentativa não encontrada.'
        });
      }

      const missingTracks = await trilhasFaltando(
        req.user,
        access.track_id
      );

      if (missingTracks.length) {
        return res.status(403).json({
          error:
            'Conclua primeiro as trilhas obrigatórias: ' +
            missingTracks.join(', ')
        });
      }

      const result = await challengeTransaction(async () => {
        const attempt = await db.prepare(`
          SELECT *
          FROM challenge_attempts
          WHERE id = ?
            AND user_id = ?
        `).get(attemptId, uid);

        if (!attempt) {
          return {
            code: 404,
            error: 'Tentativa não encontrada.'
          };
        }

        if (attempt.status !== 'in_progress') {
          return {
            code: 409,
            error: 'Esta tentativa já foi encerrada.'
          };
        }

        const challenge = await db.prepare(`
          SELECT *
          FROM challenges
          WHERE id = ?
        `).get(attempt.challenge_id);

        if (!challenge) {
          return {
            code: 404,
            error: 'Desafio não encontrado.'
          };
        }

        const now = Date.now();

        // O prazo é sempre verificado pelo servidor.
        if (now >= attempt.deadline_at) {
          await db.prepare(`
            UPDATE challenge_attempts
            SET
              status = 'expired',
              finished_at = ?
            WHERE id = ?
              AND status = 'in_progress'
          `).run(now, attemptId);

          return {
            ok: true,
            status: 'expired',
            gained: 0,
            message: challenge.type === 'tempo'
              ? 'O tempo acabou!'
              : 'A sessão expirou.'
          };
        }

       const questions = await db.prepare(`
          SELECT *
          FROM challenge_questions
          WHERE challenge_id = ?
            AND revision = ?
          ORDER BY position, id
        `).all(
          challenge.id,
          Number(attempt.challenge_revision || 1)
        );

        const index = Number(
          attempt.current_question || 0
        );

        if (
          !questions.length ||
          index < 0 ||
          index >= questions.length
        ) {
          return {
            code: 409,
            error: 'Questão atual indisponível.'
          };
        }

        const question = questions[index];
        const options = challengeJson(
          question.options
        );

        const state = challengeReadState(
          attempt.state_json
        );

        // Tentativas antigas não possuem ordem salva.
        // Nelas, a ordem original é preservada.
        let order = state.order;

        const validOrder =
          Array.isArray(order) &&
          order.length === options.length &&
          new Set(order).size === options.length &&
          order.every(
            value =>
              Number.isInteger(value) &&
              value >= 0 &&
              value < options.length
          );

        if (!validOrder) {
          order = options.map((_, i) => i);
        }

        let correct = false;
        let selectedAnswer = null;

        if (challenge.type === 'quebra_cabeca') {
          // selected_order representa os índices
          // das alternativas na ordem exibida.
          // Exemplo: [2, 0, 1].
          const submitted = req.body?.selected_order;

          const valid =
            Array.isArray(submitted) &&
            submitted.length === options.length &&
            new Set(submitted).size === options.length &&
            submitted.every(
              value =>
                Number.isInteger(value) &&
                value >= 0 &&
                value < options.length
            );

          if (!valid) {
            return {
              code: 400,
              error: 'Envie uma sequência válida.'
            };
          }

          // Converte a sequência exibida para os
          // índices originais do gabarito.
          const originalOrder = submitted.map(
            displayedIndex => order[displayedIndex]
          );

          correct = originalOrder.every(
            (value, position) => value === position
          );

        } else {
          const selected = req.body?.selected_answer;

          if (
            !Number.isSafeInteger(selected) ||
            selected < 0 ||
            selected >= options.length
          ) {
            return {
              code: 400,
              error: 'Selecione uma alternativa válida.'
            };
          }

          selectedAnswer = selected;

          // O índice exibido é convertido no índice
          // original antes de comparar com o gabarito.
          const originalIndex = order[selected];

          correct =
            originalIndex === Number(
              question.correct_answer
            );
        }

        const config = challengeConfig(
          challenge.config_json
        );

        const lives = challenge.type === 'resistencia'
          ? Math.max(
              1,
              Math.min(10, Number(config.lives || 3))
            )
          : 1;

        const mistakes =
          Number(attempt.mistakes || 0) +
          (correct ? 0 : 1);

        const nextIndex = index + 1;

        const isLast =
          nextIndex >= questions.length;

        let lost = false;
        let won = false;

        switch (challenge.type) {
          
            case 'tempo':
              // O quarto erro encerra a tentativa.
              lost = mistakes > 3;

              // Concluir todas as questões com até
              // três erros garante a vitória.
              won = !lost && isLast;
              break;

            case 'precisao':

            lost = !correct;
            won = correct && isLast;
            break;

          case 'quebra_cabeca':
            lost = !correct;
            won = correct && isLast;
            break;

          case 'resistencia':
            lost = mistakes >= lives;
            won = !lost && isLast;
            break;

          default:
            return {
              code: 409,
              error: 'Tipo de desafio não reconhecido.'
            };
        }

        if (lost) {
          await db.prepare(`
            UPDATE challenge_attempts
            SET
              status = 'lost',
              selected_answer = ?,
              mistakes = ?,
              finished_at = ?
            WHERE id = ?
              AND status = 'in_progress'
          `).run(
            selectedAnswer,
            mistakes,
            now,
            attemptId
          );

          return {
            ok: true,
            status: 'lost',
            correct,
            gained: 0,
            mistakes,
            lives_remaining: challenge.type === 'resistencia'
              ? 0
              : null,
            message: challenge.type === 'tempo' && mistakes > 3
            ? 'Você cometeu 4 erros. O desafio foi encerrado.'
            : 'Desafio não concluído.'
          };
        }

        if (won) {
          // Uma recompensa por aluno e desafio.
          // A restrição UNIQUE(user_id, challenge_id)
          // no banco também protege contra duplicação.
          const previousReward = await db.prepare(`
            SELECT id
            FROM challenge_rewards
            WHERE challenge_id = ?
              AND user_id = ?
          `).get(challenge.id, uid);

          if (previousReward) {
            await db.prepare(`
              UPDATE challenge_attempts
              SET
                status = 'lost',
                finished_at = ?
              WHERE id = ?
            `).run(now, attemptId);

            return {
              code: 409,
              error: 'A recompensa já foi recebida.'
            };
          }

          const baseXp = Math.max(
            0,
            Number(challenge.xp_reward) || 0
          );

          const xpAwarded = challenge.type === 'tempo'
            ? Math.floor(baseXp * (1 - mistakes * 0.10))
            : baseXp;

          await db.prepare(`
            UPDATE challenge_attempts
            SET
              status = 'won',
              selected_answer = ?,
              mistakes = ?,
              current_question = ?,
              finished_at = ?
            WHERE id = ?
              AND status = 'in_progress'
          `).run(
            selectedAnswer,
            mistakes,
            nextIndex,
            now,
            attemptId
          );

          await db.prepare(`
            INSERT INTO challenge_rewards (
              challenge_id,
              user_id,
              attempt_id,
              xp_awarded,
              badge_code,
              awarded_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            challenge.id,
            uid,
            attemptId,
            xpAwarded,
            challenge.badge_code,
            now
          );

          await db.prepare(`
            INSERT OR IGNORE INTO badges (
              user_id,
              code
            )
            VALUES (?, ?)
          `).run(
            uid,
            challenge.badge_code
          );

          // Registra o XP na atividade diária.
          // O XP total já é calculado a partir
          // de challenge_rewards.
          if (xpAwarded > 0) {
          await bump(uid, {
            xp: xpAwarded
          });
          }

          return {
            ok: true,
            status: 'won',
            correct,
            gained: xpAwarded,
            badge_code: challenge.badge_code,
            mistakes,
            lives_remaining: challenge.type === 'resistencia'
              ? Math.max(0, lives - mistakes)
              : null,
            message: 'Desafio concluído!'
          };
        }

        // Ainda existem questões e a tentativa
        // não foi perdida.
        // Apaga a ordem anterior para gerar uma
        // nova ordem para a próxima questão.
        delete state.order;

        await db.prepare(`
          UPDATE challenge_attempts
          SET
            current_question = ?,
            selected_answer = ?,
            mistakes = ?,
            state_json = ?
          WHERE id = ?
            AND status = 'in_progress'
        `).run(
          nextIndex,
          selectedAnswer,
          mistakes,
          JSON.stringify(state),
          attemptId
        );

        const updatedAttempt = await db.prepare(`
          SELECT *
          FROM challenge_attempts
          WHERE id = ?
        `).get(attemptId);

        const next = await challengeAttemptResponse(
          updatedAttempt,
          challenge
        );

        return {
          ...next,
          status: 'in_progress',
          correct,
          gained: 0,
          message: correct
          ? 'Resposta correta! Continue.'
          : challenge.type === 'tempo'
            ? `Resposta incorreta! ${mistakes}/3 erros permitidos.`
            : 'Resposta incorreta. Você perdeu uma vida.'
        };
      });

      if (result.error) {
        return res.status(result.code).json({
          error: result.error
        });
      }

      return res.json(result);

    } catch (error) {
      return challengeError(res, error);
    }
  }
);



// ============================================================
// ÁREA DO ALUNO
// ============================================================

app.get(
  '/api/tracks',
  auth,
  async (req, res) => {
    try {
      const done =
        new Set(
          (await db
            .prepare(
              `SELECT lesson_id
               FROM progress
               WHERE user_id=?`
            )
            .all(
              req.user.id
            ))
            .map(
              row =>
                row.lesson_id
            )
        );

       const completionCounts = Object.fromEntries(
  (await db.prepare(
    `SELECT lesson_id, review_count
     FROM progress
     WHERE user_id=?`
  )
  .all(req.user.id))
  .map(row => [
    row.lesson_id,
    Number(row.review_count || 1)
  ])
);

      const lessons =
        await db
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
          (await db
            .prepare(
              `SELECT
                 lesson_id l,
                 COUNT(*) n
               FROM questions
               GROUP BY lesson_id`
            )
            .all())
            .map(
              row => [
                row.l,
                row.n
              ]
            )
        );

      const answerCount =
        Object.fromEntries(
          (await db
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
            ))
            .map(
              row => [
                row.l,
                row.n
              ]
            )
        );

      const tracks =
        (await db
          .prepare(
            `SELECT *
             FROM tracks
             ORDER BY position,id`
          )
          .all())
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

                conclusion:
                (() => {
                  try {
                    return JSON.parse(
                      track.conclusion ||
                        '[]'
                    );
                  } catch {
                    return [];
                  }
                })(),

              evaluation_question:
                track.evaluation_question ||
                'Como você avalia esta trilha?',

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

                        // Quantidade de vezes que o aluno concluiu o módulo
                        completionCount:
                          completionCounts[lesson.id] || 0,

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
                        !isStaff(req.user) &&
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

      // Trilha bloqueada enquanto faltar concluir alguma trilha exigida.
      const porId = Object.fromEntries(tracks.map(t => [t.id, t]));

      for (const t of tracks) {
        t.prerequisites = lerPre(t.prerequisites).filter(id => porId[id]);

        t.missing =
          isStaff(req.user)
            ? []
            : t.prerequisites
                .filter(id => !(porId[id].lessons.length && porId[id].lessons.every(l => l.done)))
                .map(id => porId[id].title);

        t.locked = t.missing.length > 0;

        if (t.locked) {
          t.lessons.forEach(l => { l.locked = true; });
        }
      }

      const heartState =
        await hearts(
          req.user.id
        );

      const state =
        await stats(
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

// ============================================================
// MÉDIA DAS AVALIAÇÕES DOS MÓDULOS
// ============================================================

app.get(
  '/api/lessons/ratings',
  auth,
  async (req, res) => {

    try {

      const ratings =
        await db.prepare(`
          SELECT
            lesson_id,
            ROUND(AVG(rating), 1) AS average_rating,
            COUNT(*) AS rating_count
          FROM lesson_evaluations
          GROUP BY lesson_id
        `).all();

      res.json({
        ok: true,
        ratings
      });

    } catch (error) {

      console.error(
        'Erro ao buscar avaliações dos módulos:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao buscar avaliações dos módulos'
      });
    }
  }
);

app.get(
  '/api/lessons/:id',
  auth,
  async (req, res) => {
    try {
      const lesson =
        await db
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
        await isDone(
          req.user.id,
          lesson.id
        );

      const heartState =
        await hearts(
          req.user.id
        );

      const falta = await trilhasFaltando(req.user, lesson.track_id);

      if (falta.length) {
        return res.status(403).json({
          error: 'Trilha bloqueada. Conclua antes: ' + falta.join(', ') + ' 🔒'
        });
      }

      if (
        !isStaff(req.user)
      ) {
        const previous =
          await one(
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
          !await isDone(
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
        !isStaff(req.user)
      ) {
        return res.status(403).json({
          error:
            `Você está sem vidas. Próxima vida em ${Math.ceil(
              heartState.next / 60
            )} min (ou recarregue no Perfil).`
        });
      }

      // Reinicia a tentativa atual.
      await db.prepare(
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
        (await db
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
          ))
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

      let conclusion = [];

      try {
        conclusion =
          JSON.parse(
            lesson.conclusion ||
              '[]'
          );
      } catch {
        conclusion = [];
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

        conclusion,

        evaluation_question:
          lesson.evaluation_question ||
          'Como você avalia este módulo?',

        xp:
          lesson.xp,

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
  async (req, res) => {
    try {
      const question =
        await db
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

      // Resposta, atividade e vidas na mesma transação
      // (respostas simultâneas não descontam vidas em dobro).
      const heartState = await db.transaction(async () => {
        await db.prepare(
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
          await bump(
            req.user.id,
            {
              correct: 1
            }
          );
        }

        return !correct &&
          !await isDone(
            req.user.id,
            question.lesson_id
          )
            ? await loseHeart(
                req.user.id
              )
            : await hearts(
                req.user.id
              );
      });

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
// AVALIAÇÃO DE MÓDULO
// ============================================================

app.post(
  '/api/lessons/:id/evaluate',
  auth,
  async (req, res) => {
    try {
      const lesson =
        await db
          .prepare(
            `SELECT
               id,
               track_id
             FROM lessons
             WHERE id=?`
          )
          .get(
            req.params.id
          );

      if (!lesson) {
        return res.status(404).json({
          error:
            'Módulo não encontrado'
        });
      }

      const rating =
        Number(
          req.body?.rating
        );

      if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return res.status(400).json({
          error:
            'A avaliação deve ser de 1 a 5.'
        });
      }

      if (
        !isStaff(req.user) &&
        !await isDone(
          req.user.id,
          lesson.id
        )
      ) {
        return res.status(403).json({
          error:
            'Conclua o módulo antes de avaliá-lo.'
        });
      }

      await db.prepare(`
        INSERT INTO lesson_evaluations (
          user_id,
          lesson_id,
          rating,
          created_at
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT(user_id, lesson_id)
        DO UPDATE SET
          rating = excluded.rating,
          created_at = excluded.created_at
      `).run(
        req.user.id,
        lesson.id,
        rating,
        new Date().toISOString()
      );

      return res.json({
        ok: true,
        rating
      });

    } catch (error) {
      console.error(
        'Erro ao salvar avaliação do módulo:',
        error
      );

      return res.status(500).json({
        error:
          'Erro ao salvar avaliação do módulo'
      });
    }
  }
);


// ============================================================
// AVALIAÇÃO DE TRILHA
// ============================================================

app.post(
  '/api/tracks/:id/evaluate',
  auth,
  async (req, res) => {
    try {
      const track =
        await db
          .prepare(
            `SELECT id
             FROM tracks
             WHERE id=?`
          )
          .get(
            req.params.id
          );

      if (!track) {
        return res.status(404).json({
          error:
            'Trilha não encontrada'
        });
      }

      const rating =
        Number(
          req.body?.rating
        );

      if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return res.status(400).json({
          error:
            'A avaliação deve ser de 1 a 5.'
        });
      }

      if (
        !isStaff(req.user) &&
        !await trilhaConcluida(
          req.user.id,
          track.id
        )
      ) {
        return res.status(403).json({
          error:
            'Conclua todos os módulos antes de avaliar a trilha.'
        });
      }

      await db.prepare(`
        INSERT INTO track_evaluations (
          user_id,
          track_id,
          rating,
          created_at
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT(user_id, track_id)
        DO UPDATE SET
          rating = excluded.rating,
          created_at = excluded.created_at
      `).run(
        req.user.id,
        track.id,
        rating,
        new Date().toISOString()
      );

      return res.json({
        ok: true,
        rating
      });

    } catch (error) {
      console.error(
        'Erro ao salvar avaliação da trilha:',
        error
      );

      return res.status(500).json({
        error:
          'Erro ao salvar avaliação da trilha'
      });
    }
  }
);



// ============================================================
// CONCLUSÃO DA LIÇÃO
// ============================================================

app.post('/api/lessons/:id/complete', auth, async (req, res) => {
  try {
    const lesson = await db.prepare(
      'SELECT * FROM lessons WHERE id=?'
    ).get(req.params.id);

    const uid = req.user.id;

    if (!lesson) {
      return res.status(404).json({
        error: 'Lição não encontrada'
      });
    }

    if ((await trilhasFaltando(req.user, lesson.track_id)).length) {
      return res.status(403).json({
        error: 'Trilha bloqueada: conclua os pré-requisitos antes.'
      });
    }

    // Progresso, moedas, sequência e conquistas são gravados em
    // uma única transação: uma conclusão enviada duas vezes ao
    // mesmo tempo não pode contar em dobro nem ficar pela metade.
    const outcome = await db.transaction(async () => {
      const total = (await one(
        `SELECT COUNT(*) v
         FROM questions
         WHERE lesson_id=?`,
        lesson.id
      )).v;

      const result = await one(
        `SELECT
           COUNT(*) n,
           COALESCE(SUM(correct), 0) c
         FROM answers
         WHERE user_id=?
         AND question_id IN (
           SELECT id
           FROM questions
           WHERE lesson_id=?
         )`,
        uid,
        lesson.id
      );

      if (result.n < total) {
        return {
          status: 400,
          body: {
            error: 'Responda todas as questões'
          }
        };
      }

      const perfect = total > 0 && result.c === total ? 1 : 0;

      // Consulta quantas vezes o aluno concluiu o módulo.
      const previousProgress = await db.prepare(
        `SELECT xp, perfect, review_count
         FROM progress
         WHERE user_id=? AND lesson_id=?`
      ).get(uid, lesson.id);

      const repeated = !!previousProgress;

      const completionNumber = repeated
        ? Number(previousProgress.review_count || 1) + 1
        : 1;

      // 1ª = 100%, 2ª = 50%, 3ª = 30%, demais = 20%.
      const xpMultiplier =
        completionNumber === 1 ? 1 :
        completionNumber === 2 ? 0.5 :
        completionNumber === 3 ? 0.3 :
        0.2;

      const originalXp =
        Number(lesson.xp || 0) +
        result.c * 2 +
        (perfect ? 10 : 0);

      const gained = Math.floor(originalXp * xpMultiplier);

      // Moedas são concedidas apenas na primeira conclusão.
      const coins = repeated ? 0 : 5 + (perfect ? 5 : 0);

      if (repeated) {
        await db.prepare(
          `UPDATE progress
           SET xp=xp+?,
               perfect=MAX(perfect, ?),
               review_count=?
           WHERE user_id=? AND lesson_id=?`
        ).run(
          gained,
          perfect,
          completionNumber,
          uid,
          lesson.id
        );
      } else {
        await db.prepare(
          `INSERT INTO progress (
            user_id,
            lesson_id,
            xp,
            perfect,
            done_at,
            review_count
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          uid,
          lesson.id,
          gained,
          perfect,
          today(),
          1
        );

        await db.prepare(
          `UPDATE users
           SET coins=coins+?
           WHERE id=?`
        ).run(coins, uid);
      }

      await bump(uid, {
        xp: gained,
        lessons: repeated ? 0 : 1
    });

    // Mantém a sequência diária do aluno.
    const user = await one(
      `SELECT streak, last_day, best_streak
       FROM users
       WHERE id=?`,
      uid
    );

    let streak = user?.streak || 0;

    if (user?.last_day !== today()) {
      streak = user?.last_day === yesterday()
        ? (user.streak || 0) + 1
        : 1;

      const bestStreak = Math.max(
        user?.best_streak || 0,
        streak
      );

      await db.prepare(
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

    const state = await stats(uid);

    return {
      body: {
        ok: true,
        streak,
        gained,
        coins,
        perfect: !!perfect,
        hits: result.c,
        total,
        repeated,
        completionNumber,
        xpMultiplier,
        originalXp,
        level: state.level,
        levelUp: state.level > LEVEL(
          Math.max(0, state.xp - gained)
        ),
        badges: await awardBadges(uid)
      }
    };
    });

    if (outcome.status) {
      return res.status(outcome.status).json(outcome.body);
    }

    return res.json(outcome.body);

  } catch (error) {
    console.error('Erro ao concluir lição:', error);

    return res.status(500).json({
      error: 'Erro ao concluir lição'
    });
  }
});

// ============================================================
// AVALIAÇÃO DO MÓDULO
// ============================================================

app.post(
  '/api/lessons/:id/evaluation',
  auth,
  async (req, res) => {

    try {

      const lessonId =
        Number(req.params.id);

      const rating =
        Number(req.body?.rating);

      // ------------------------------------------------------
      // VALIDA ID
      // ------------------------------------------------------

      if (
        !Number.isInteger(lessonId) ||
        lessonId <= 0
      ) {
        return res.status(400).json({
          error:
            'Módulo inválido'
        });
      }

      // ------------------------------------------------------
      // VALIDA NOTA
      // ------------------------------------------------------

      if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return res.status(400).json({
          error:
            'A avaliação deve ser uma nota de 1 a 5'
        });
      }

      // ------------------------------------------------------
      // PROCURA O MÓDULO
      // ------------------------------------------------------

      const lesson =
        await db
          .prepare(
            `SELECT
               id,
               title,
               track_id
             FROM lessons
             WHERE id = ?`
          )
          .get(lessonId);

      if (!lesson) {
        return res.status(404).json({
          error:
            'Módulo não encontrado'
        });
      }

      // ------------------------------------------------------
      // VERIFICA SE O ALUNO CONCLUIU O MÓDULO
      // ------------------------------------------------------

      if (
        !await isDone(
          req.user.id,
          lessonId
        )
      ) {
        return res.status(403).json({
          error:
            'Conclua o módulo antes de avaliá-lo'
        });
      }

      // ------------------------------------------------------
      // SALVA / ATUALIZA A AVALIAÇÃO
      // ------------------------------------------------------

      await db.prepare(
        `INSERT INTO lesson_evaluations (
          user_id,
          lesson_id,
          rating,
          created_at
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT(user_id, lesson_id)
        DO UPDATE SET
          rating = excluded.rating,
          created_at = excluded.created_at`
      ).run(
        req.user.id,
        lessonId,
        rating,
        new Date().toISOString()
      );

      // ------------------------------------------------------
      // RESPOSTA
      // ------------------------------------------------------

      res.json({
        ok: true,

        message:
          'Avaliação do módulo enviada com sucesso',

        rating
      });

    } catch (error) {

      console.error(
        'Erro ao salvar avaliação do módulo:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao salvar avaliação do módulo'
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
  async (req, res) => {
    try {
      const uid =
        req.user.id;

      const state =
        await stats(uid);

      const activity =
        await todayAct(uid);

      const claimed =
        new Set(
          (await db
            .prepare(
              `SELECT code
               FROM claims
               WHERE user_id=?
               AND day=?`
            )
            .all(
              uid,
              today()
            ))
            .map(
              row => row.code
            )
        );

      const have =
        new Set(
          (await db
            .prepare(
              `SELECT code
               FROM badges
               WHERE user_id=?`
            )
            .all(uid))
            .map(
              row => row.code
            )
        );

      const challengeBadges =
        await db.prepare(`
          SELECT
            c.badge_code AS code,
            c.badge_icon AS icon,
            c.badge_name AS name,
            c.badge_description AS description,
            CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS got
          FROM challenges c
          LEFT JOIN challenge_rewards r
            ON r.challenge_id=c.id
            AND r.user_id=?
          WHERE (c.enabled = 1 AND c.deleted_at IS NULL)
          OR r.id IS NOT NULL
          ORDER BY c.id
        `).all(uid);

      const week =
        await db
          .prepare(
            `SELECT
               day,
               xp
             FROM activity
             WHERE user_id=?
             ORDER BY day DESC
             LIMIT 7`
          )
          .all(uid);

      res.json({
        ...state,

        name:
          req.user.name,

        avatar_url:
          avatarUrl(req.user),

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

       
        badges: [
          ...Object.entries(BADGES).map(([code, badge]) => ({
            code,
            icon: badge[0],
            name: badge[1],
            desc: badge[2],
            got: have.has(code)
          })),

          ...challengeBadges.map(row => ({
            code: row.code,
            icon: row.icon,
            name: row.name,
            desc: row.description,
            got: Boolean(row.got)
          }))
        ],


        week:
          week.reverse()
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
  async (req, res) => {
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
        await todayAct(
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

      // Registro do resgate e moedas: tudo ou nada.
      await db.transaction(async () => {
        const inserted =
          (await db
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
            )).changes;

        if (inserted) {
          await db.prepare(
            `UPDATE users
             SET coins=coins+10
             WHERE id=?`
          ).run(
            req.user.id
          );
        }
      });

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
  async (req, res) => {
    try {
      const COST = 30;

      // Saldo conferido e descontado na mesma transação:
      // compras simultâneas não gastam a mesma moeda duas vezes.
      const error = await db.transaction(async () => {
        const current =
          await hearts(
            req.user.id
          );

        if (
          current.hearts >=
          MAX_HEARTS
        ) {
          return 'Suas vidas já estão cheias';
        }

        const coins =
          (await one(
            `SELECT coins
             FROM users
             WHERE id=?`,
            req.user.id
          )).coins || 0;

        if (
          coins < COST
        ) {
          return `Você precisa de ${COST} moedas`;
        }

        await db.prepare(
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

        return null;
      });

      if (error) {
        return res.status(400).json({
          error
        });
      }

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
  async (req, res) => {
    try {
      const month =
        /^\d{4}-\d{2}$/.test(
          req.query.month || ''
        )
          ? req.query.month
          : today().slice(0, 7);

      const entries =
        await db
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
  async (req, res) => {
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
        await db
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
  async (req, res) => {
    try {
      await db.prepare(
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
  async (req, res) => {
    try {
      const rows =
        await db
          .prepare(
            `SELECT
               u.id,
               u.name,
               u.avatar,
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

            avatar_url:
              avatarUrl(row),

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
    'conclusion',
    'evaluation_question',
    'prerequisites',
    'position'
  ],

  lessons: [
    'track_id',
    'title',
    'intro',
    'presentation',
    'conclusion',
    'evaluation_question',
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
          field === 'content' ||
          field === 'presentation' ||
          field === 'conclusion' ||
          field === 'prerequisites'
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
// TRILHAS DEPENDENTES (PRÉ-REQUISITOS)
// ============================================================

// Uma trilha pode exigir a conclusão de outras trilhas.
// Trilha concluída = todos os módulos concluídos pelo aluno.

async function trilhaConcluida(uid, trackId) {
  const ls = await db
    .prepare('SELECT id FROM lessons WHERE track_id=?')
    .all(trackId);

  if (!ls.length) return false;

  for (const l of ls) {
    if (!await isDone(uid, l.id)) return false;
  }

  return true;
}

function lerPre(valor) {
  try {
    const lista = JSON.parse(valor || '[]');
    return Array.isArray(lista) ? lista.map(Number) : [];
  } catch {
    return [];
  }
}

// Títulos das trilhas exigidas que o aluno ainda não concluiu (ADM é liberado).
async function trilhasFaltando(user, trackId) {
  if (isStaff(user)) return [];

  const t = await one('SELECT prerequisites p FROM tracks WHERE id=?', trackId);
  const faltando = [];

  for (const id of lerPre(t && t.p)) {
    if (!await one('SELECT 1 FROM tracks WHERE id=?', id)) continue;
    if (await trilhaConcluida(user.id, id)) continue;

    faltando.push((await one('SELECT title FROM tracks WHERE id=?', id)).title);
  }

  return faltando;
}

// Valida a lista de pré-requisitos e impede dependência circular.
async function validarPre(trackId, lista) {
  const ids = [];

  for (const id of new Set((Array.isArray(lista) ? lista : []).map(Number))) {
    if (id && id !== trackId && await one('SELECT 1 FROM tracks WHERE id=?', id)) {
      ids.push(id);
    }
  }

  const exige = async id => lerPre((await one('SELECT prerequisites p FROM tracks WHERE id=?', id) || {}).p);
  const visto = new Set();
  const pilha = [...ids];

  while (pilha.length) {
    const x = pilha.pop();

    if (x === trackId) {
      throw new Error('Dependência circular: uma trilha não pode exigir outra que já depende dela');
    }

    if (!visto.has(x)) {
      visto.add(x);
      pilha.push(...await exige(x));
    }
  }

  return ids;
}

// ============================================================
// ÁRVORE ADMIN
// ============================================================

app.get(
  '/api/admin/tree',
  auth,
  staff,
  async (req, res) => {
    try {
      const questions =
        (await db
          .prepare(
            `SELECT *
             FROM questions
             ORDER BY position,id`
          )
          .all())
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
        (await db
          .prepare(
            `SELECT *
             FROM lessons
             ORDER BY position,id`
          )
          .all())
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
                conclusion:
                (() => {
                  try {
                    return JSON.parse(
                      lesson.conclusion ||
                        '[]'
                    );
                  } catch {
                    return [];
                  }
                })(),

              evaluation_question:
                lesson.evaluation_question ||
                'Como você avalia este módulo?',

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
        (await db
          .prepare(
            `SELECT *
             FROM tracks
             ORDER BY position,id`
          )
          .all())
          .map(
            track => ({
              ...track,
              prerequisites: lerPre(track.prerequisites),

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

              conclusion:
              (() => {
                try {
                  return JSON.parse(
                    track.conclusion ||
                      '[]'
                  );
                } catch {
                  return [];
                }
              })(),

            evaluation_question:
              track.evaluation_question ||
              'Como você avalia esta trilha?',

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
// PRÉ-REQUISITOS: ROTAS DO ADM
// ============================================================

// Precisam vir ANTES das rotas genéricas /api/admin/:res.

app.put(
  '/api/admin/tracks/:id',
  auth,
  staff,
  async (req, res, next) => {
    if (req.body && req.body.prerequisites !== undefined) {
      try {
        req.body.prerequisites = await validarPre(
          Number(req.params.id),
          req.body.prerequisites
        );
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }

    next('route');
  }
);

// Ao excluir uma trilha, ela sai dos pré-requisitos das outras.
app.delete(
  '/api/admin/tracks/:id',
  auth,
  adm,
  async (req, res, next) => {
    const id = Number(req.params.id);

    for (const t of await db.prepare('SELECT id,prerequisites FROM tracks').all()) {
      const lista = lerPre(t.prerequisites);

      if (lista.includes(id)) {
        await db.prepare('UPDATE tracks SET prerequisites=? WHERE id=?')
          .run(JSON.stringify(lista.filter(x => x !== id)), t.id);
      }
    }

    next('route');
  }
);

// ============================================================
// MÓDULOS
// ============================================================

const MAX_MODULES = 10;

app.post(
  '/api/admin/tracks',
  auth,
  staff,
  async (req, res) => {
    try {
      if (req.body && req.body.prerequisites !== undefined) {
        req.body.prerequisites = await validarPre(0, req.body.prerequisites);
      }

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

      // Trilha e primeiro módulo: tudo ou nada.
      const id = await db.transaction(async () => {
        const trackId =
          (await db
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
            ))
            .lastInsertRowid;

        await db.prepare(
          `INSERT INTO lessons(
            track_id,
            title,
            position,
            xp
          )
          VALUES(?,?,0,10)`
        ).run(
          trackId,
          'Módulo 1'
        );

        return trackId;
      });

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
  staff,
  async (req, res, next) => {
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
        await one(
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
        (await one(
          `SELECT COUNT(*) v
           FROM lessons
           WHERE track_id=?`,
          trackId
        )).v;

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
  staff,
  async (req, res, next) => {
    try {
      const lesson =
        await one(
          `SELECT track_id
           FROM lessons
           WHERE id=?`,
          req.params.id
        );

      if (
        lesson &&
        (await one(
          `SELECT COUNT(*) v
           FROM lessons
           WHERE track_id=?`,
          lesson.track_id
        )).v <= 1
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
  staff,
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
  staff,
  async (req, res) => {
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
        await db
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
  staff,
  async (req, res) => {
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

      await db.prepare(
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
  async (req, res) => {
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
        await db
          .prepare(
            `SELECT avatar
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
        'finance',
        'lesson_evaluations',
        'track_evaluations'
      ];

      // Dados dependentes e a conta: tudo ou nada.
      await db.transaction(async () => {
        for (
          const table
          of dependentTables
        ) {
          await db.prepare(
            `DELETE FROM ${table}
             WHERE user_id=?`
          ).run(id);
        }

        await db.prepare(
          `DELETE FROM users
           WHERE id=?`
        ).run(id);
      });

      // Remove também a foto de perfil do usuário excluído.
      removeAvatarFile(user.avatar);

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
  staff,
  async (req, res) => {
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

      await db.prepare(
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
  async (req, res) => {
    try {
      res.json(
        (await db
          .prepare(
            `SELECT
               id,
               name,
               email,
               role,
               avatar
             FROM users
             ORDER BY name`
          )
          .all())
          .map(
            ({ avatar, ...user }) => ({
              ...user,
              avatar_url: avatarUrl({ avatar })
            })
          )
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
  async (req, res) => {
    try {
      const role =
        req.body?.role;

      if (
        ![
          'comum',
          'professor',
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
        await db
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

      await db.prepare(
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

// ==========================================================
// AVALIAÇÃO DA TRILHA
// ==========================================================

app.post(
  '/api/tracks/:id/evaluation',
  auth,
  async (req, res) => {

    try {

      const trackId =
        Number(req.params.id);

      const rating =
        Number(req.body?.rating);

      // ------------------------------------------------------
      // VALIDA TRILHA
      // ------------------------------------------------------

      if (
        !Number.isInteger(trackId) ||
        trackId <= 0
      ) {
        return res.status(400).json({
          error: 'Trilha inválida'
        });
      }

      // ------------------------------------------------------
      // VALIDA NOTA
      // ------------------------------------------------------

      if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return res.status(400).json({
          error:
            'A avaliação deve ser uma nota de 1 a 5'
        });
      }

      // ------------------------------------------------------
      // PROCURA A TRILHA
      // ------------------------------------------------------

      const track =
        await db.prepare(`
          SELECT
            id,
            title
          FROM tracks
          WHERE id = ?
        `).get(trackId);

      if (!track) {
        return res.status(404).json({
          error: 'Trilha não encontrada'
        });
      }

      // ------------------------------------------------------
      // PROCURA OS MÓDULOS
      // ------------------------------------------------------

      const lessons =
        await db.prepare(`
          SELECT id
          FROM lessons
          WHERE track_id = ?
          ORDER BY position, id
        `).all(trackId);

      if (!lessons.length) {
        return res.status(400).json({
          error:
            'Esta trilha não possui módulos'
        });
      }

      // ------------------------------------------------------
      // VERIFICA SE TODOS OS MÓDULOS FORAM CONCLUÍDOS
      // ------------------------------------------------------

      let allDone = true;

      for (const lesson of lessons) {
        if (
          !await isDone(
            req.user.id,
            lesson.id
          )
        ) {
          allDone = false;
          break;
        }
      }

      if (!allDone) {
        return res.status(403).json({
          error:
            'Conclua todos os módulos da trilha antes de avaliá-la'
        });
      }

      // ------------------------------------------------------
      // SALVA / ATUALIZA A AVALIAÇÃO
      // ------------------------------------------------------

      await db.prepare(`
        INSERT INTO track_evaluations (
          user_id,
          track_id,
          rating,
          created_at
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT(user_id, track_id)
        DO UPDATE SET
          rating = excluded.rating,
          created_at = excluded.created_at
      `).run(
        req.user.id,
        track.id,
        rating,
        new Date().toISOString()
      );

      // ------------------------------------------------------
      // RESPOSTA
      // ------------------------------------------------------

      res.json({
        ok: true,
        message:
          'Avaliação da trilha enviada com sucesso',
        rating
      });

    } catch (error) {

      console.error(
        'Erro ao salvar avaliação da trilha:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao salvar avaliação da trilha'
      });
    }
  }
);
// ==========================================================
// AVALIAÇÃO DO MÓDULO
// ==========================================================
app.post(
  '/api/lessons/:id/evaluation',
  auth,
  async (req, res) => {

    try {

      const lessonId =
        Number(req.params.id);

      const rating =
        Number(req.body?.rating);

      // =====================================================
      // VALIDAR MÓDULO
      // =====================================================

      if (
        !Number.isInteger(lessonId) ||
        lessonId <= 0
      ) {
        return res.status(400).json({
          error: 'Módulo inválido'
        });
      }

      // =====================================================
      // VALIDAR NOTA
      // =====================================================

      if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return res.status(400).json({
          error:
            'A avaliação deve ser uma nota de 1 a 5'
        });
      }

      // =====================================================
      // VERIFICAR SE O MÓDULO EXISTE
      // =====================================================

      const lesson =
        await db.prepare(`
          SELECT
            id,
            track_id,
            title
          FROM lessons
          WHERE id = ?
        `).get(lessonId);

      if (!lesson) {
        return res.status(404).json({
          error:
            'Módulo não encontrado'
        });
      }

      // =====================================================
      // VERIFICAR SE O ALUNO CONCLUIU O MÓDULO
      // =====================================================

      if (
        !await isDone(
          req.user.id,
          lessonId
        )
      ) {
        return res.status(403).json({
          error:
            'Conclua o módulo antes de avaliá-lo'
        });
      }

      // =====================================================
      // SALVAR AVALIAÇÃO
      // APENAS UMA AVALIAÇÃO POR ALUNO/MÓDULO
      // =====================================================

      try {

        await db.prepare(`
          INSERT INTO lesson_evaluations (
            user_id,
            lesson_id,
            rating,
            created_at
          )
          VALUES (?, ?, ?, ?)
        `).run(
          req.user.id,
          lessonId,
          rating,
          new Date().toISOString()
        );

      } catch (error) {

        // O UNIQUE(user_id, lesson_id)
        // impede uma segunda avaliação.

        if (
          String(error.message)
            .toLowerCase()
            .includes('unique')
        ) {

          return res.status(409).json({
            error:
              'Você já avaliou este módulo.'
          });

        }

        throw error;
      }

      // =====================================================
      // SUCESSO
      // =====================================================

      res.json({
        ok: true,
        message:
          'Avaliação do módulo enviada com sucesso',
        rating
      });

    } catch (error) {

      console.error(
        'Erro ao salvar avaliação do módulo:',
        error
      );

      res.status(500).json({
        error:
          'Erro ao salvar avaliação do módulo'
      });
    }
  }
);

// ============================================================
// PAINEL DE DÚVIDAS (CHAT)
// ============================================================
// - Qualquer usuário logado cria dúvidas.
// - Professores/ADM respondem qualquer dúvida e podem excluir
//   qualquer mensagem.
// - Aluno só responde na própria dúvida e só apaga o que ele
//   mesmo escreveu (nunca mensagens de outras pessoas).

const DOUBT_MAX = 1000;
const DOUBT_LIMIT_PER_MINUTE = 5;

const doubtText = req =>
  String(req.body?.body ?? '').trim();

const doubtRows = `
  SELECT
    d.id,
    d.user_id,
    d.parent_id,
    d.track_id,
    d.body,
    d.created_at,
    u.name AS author_name,
    u.role AS author_role,
    u.avatar AS author_avatar,
    t.title AS track_title
  FROM doubts d
  JOIN users u ON u.id = d.user_id
  LEFT JOIN tracks t ON t.id = d.track_id
`;

const shapeDoubt = (row, viewer, hasReplies) => ({
  id: row.id,
  parent_id: row.parent_id,
  track_id: row.track_id,
  track_title: row.track_title,
  body: row.body,
  created_at: row.created_at,
  author: {
    id: row.user_id,
    name: row.author_name,
    role: row.author_role,
    avatar_url: avatarUrl({ avatar: row.author_avatar })
  },
  mine: row.user_id === viewer.id,
  can_delete:
    isStaff(viewer) ||
    (row.user_id === viewer.id && !hasReplies)
});

const tooFast = async user => {
  if (isStaff(user)) return false;

  const since = new Date(Date.now() - 60000).toISOString();

  const { n } = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM doubts
       WHERE user_id = ? AND created_at > ?`
    )
    .get(user.id, since);

  return n >= DOUBT_LIMIT_PER_MINUTE;
};

app.get('/api/doubts', auth, async (req, res) => {
  try {
    const trackId = Number(req.query.track_id);
    const filtered = Number.isInteger(trackId) && trackId > 0;

    const threads = await db
      .prepare(
        `${doubtRows}
         WHERE d.parent_id IS NULL
         ${filtered ? 'AND d.track_id = ?' : ''}
         ORDER BY d.id DESC
         LIMIT 100`
      )
      .all(...(filtered ? [trackId] : []));

    const repliesStmt = db.prepare(
      `${doubtRows}
       WHERE d.parent_id = ?
       ORDER BY d.id ASC`
    );

    const doubts = await mapAsync(threads, async row => {
      const replies = await repliesStmt.all(row.id);

      return {
        ...shapeDoubt(row, req.user, replies.length > 0),
        replies: replies.map(r => shapeDoubt(r, req.user, false)),
        answered: replies.some(
          r => r.author_role !== 'comum'
        )
      };
    });

    const tracks = await db
      .prepare('SELECT id, title FROM tracks ORDER BY position, id')
      .all();

    res.json({ ok: true, doubts, tracks });
  } catch (error) {
    console.error('Erro ao listar dúvidas:', error);
    res.status(500).json({ error: 'Erro ao carregar as dúvidas' });
  }
});

app.post('/api/doubts', auth, async (req, res) => {
  try {
    const body = doubtText(req);

    if (!body || body.length > DOUBT_MAX) {
      return res.status(400).json({
        error: `Escreva uma mensagem de até ${DOUBT_MAX} caracteres.`
      });
    }

    let trackId = null;

    if (req.body?.track_id) {
      trackId = Number(req.body.track_id);

      const track = Number.isInteger(trackId)
        ? await db.prepare('SELECT id FROM tracks WHERE id = ?').get(trackId)
        : null;

      if (!track) {
        return res.status(400).json({ error: 'Trilha inválida' });
      }
    }

    if (await tooFast(req.user)) {
      return res.status(429).json({
        error: 'Você está enviando mensagens rápido demais. Aguarde um instante.'
      });
    }

    const id = (await db
      .prepare(
        `INSERT INTO doubts (user_id, parent_id, track_id, body, created_at)
         VALUES (?, NULL, ?, ?, ?)`
      )
      .run(req.user.id, trackId, body, new Date().toISOString()))
      .lastInsertRowid;

    res.json({ ok: true, id: Number(id) });
  } catch (error) {
    console.error('Erro ao criar dúvida:', error);
    res.status(500).json({ error: 'Erro ao enviar a dúvida' });
  }
});

app.post('/api/doubts/:id/replies', auth, async (req, res) => {
  try {
    const parentId = Number(req.params.id);
    const body = doubtText(req);

    if (!body || body.length > DOUBT_MAX) {
      return res.status(400).json({
        error: `Escreva uma mensagem de até ${DOUBT_MAX} caracteres.`
      });
    }

    const parent = Number.isInteger(parentId)
      ? await db
          .prepare(
            'SELECT id, user_id, track_id FROM doubts WHERE id = ? AND parent_id IS NULL'
          )
          .get(parentId)
      : null;

    if (!parent) {
      return res.status(404).json({ error: 'Dúvida não encontrada' });
    }

    if (!isStaff(req.user) && parent.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Apenas professores respondem dúvidas de outros alunos.'
      });
    }

    if (await tooFast(req.user)) {
      return res.status(429).json({
        error: 'Você está enviando mensagens rápido demais. Aguarde um instante.'
      });
    }

    const id = (await db
      .prepare(
        `INSERT INTO doubts (user_id, parent_id, track_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        req.user.id,
        parent.id,
        parent.track_id,
        body,
        new Date().toISOString()
      ))
      .lastInsertRowid;

    res.json({ ok: true, id: Number(id) });
  } catch (error) {
    console.error('Erro ao responder dúvida:', error);
    res.status(500).json({ error: 'Erro ao enviar a resposta' });
  }
});

app.delete('/api/doubts/:id', auth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const row = Number.isInteger(id)
      ? await db
          .prepare('SELECT id, user_id, parent_id FROM doubts WHERE id = ?')
          .get(id)
      : null;

    if (!row) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    if (!isStaff(req.user)) {
      const replies = (await db
        .prepare('SELECT COUNT(*) AS n FROM doubts WHERE parent_id = ?')
        .get(row.id)).n;

      if (row.user_id !== req.user.id || replies > 0) {
        return res.status(403).json({
          error: 'Você não pode excluir esta mensagem.'
        });
      }
    }

    // As respostas de uma dúvida excluída saem junto (ON DELETE CASCADE).
    await db.prepare('DELETE FROM doubts WHERE id = ?').run(row.id);

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao excluir mensagem:', error);
    res.status(500).json({ error: 'Erro ao excluir a mensagem' });
  }
});

// ==========================================================
// 404 DA API
// ==========================================================

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

// Só começa a atender depois de conectar ao banco, validar o
// esquema e garantir os dados iniciais. Se algo falhar, o processo
// termina com erro em vez de subir com o banco inconsistente.
let server = null;

db.ready()
  .then(() => {
    server =
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
  })
  .catch(error => {
    console.error(
      'Falha ao preparar o banco de dados:',
      error.message
    );

    process.exit(1);
  });

// ============================================================
// ENCERRAMENTO SEGURO
// ============================================================

function shutdown(
  signal
) {
  console.log(
    `${signal} recebido. Encerrando servidor...`
  );

  if (!server) {
    process.exit(0);
  }

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