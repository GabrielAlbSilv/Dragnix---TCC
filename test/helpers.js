// Utilitários dos testes de integração.
//
// SEGURANÇA: os testes usam somente bancos libSQL locais e
// descartáveis (URL file: em uma pasta temporária). O servidor é
// iniciado com cwd na pasta temporária, então o .env do projeto
// (com as credenciais reais do Turso) nunca é carregado.

const { spawn, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');

const ADMIN = {
  email: 'admin@teste.local',
  password: 'senha-admin-teste'
};

const BACKUP_SECRET = 'segredo-de-backup-somente-para-testes';

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dragnix-test-'));
  const uploads = path.join(dir, 'uploads');

  fs.mkdirSync(uploads);

  return {
    dir,
    uploads,
    url: 'file:' + path.join(dir, 'test.db').replace(/\\/g, '/'),
    cleanup() {
      // No Windows o arquivo do banco pode ficar bloqueado por
      // alguns instantes depois de fechado.
      try {
        fs.rmSync(dir, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 200
        });
      } catch (error) {
        console.warn('Pasta temporária não removida:', dir, error.code);
      }
    }
  };
}

function testEnv(sandbox, extra = {}) {
  if (!sandbox.url.startsWith('file:')) {
    throw new Error('Os testes só podem usar bancos locais descartáveis.');
  }

  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    TURSO_DATABASE_URL: sandbox.url,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET: 'jwt-secret-de-teste',
    ADMIN_NAME: 'Admin Teste',
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    ADMIN_EMAILS: '',
    BACKUP_SECRET,
    UPLOAD_DIR: sandbox.uploads,
    ...extra
  };
}

function provision(sandbox) {
  return execFileSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'db-schema.js'), 'provision'],
    { cwd: sandbox.dir, env: testEnv(sandbox), encoding: 'utf8' }
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });

    server.on('error', reject);
  });
}

// Inicia o servidor e espera /api/health responder.
// Se o processo terminar antes, devolve { exitCode, output }.
async function startServer(sandbox) {
  const port = await freePort();

  const child = spawn(
    process.execPath,
    [path.join(ROOT, 'server.js')],
    {
      cwd: sandbox.dir,
      env: testEnv(sandbox, { PORT: String(port) }),
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });

  const exited = new Promise(resolve =>
    child.on('exit', code => resolve(code))
  );

  const base = `http://127.0.0.1:${port}`;

  for (let i = 0; i < 100; i++) {
    const code = await Promise.race([
      exited,
      new Promise(resolve => setTimeout(() => resolve(undefined), 100))
    ]);

    if (code !== undefined) {
      return { exitCode: code, output };
    }

    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) break;
    } catch {
      // ainda iniciando
    }
  }

  return {
    base,
    output: () => output,
    async stop() {
      child.kill();
      await exited;
    }
  };
}

function client(base) {
  async function request(method, url, { token, body } = {}) {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: 'Bearer ' + token } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const type = res.headers.get('content-type') || '';

    const data = type.includes('application/json')
      ? await res.json()
      : Buffer.from(await res.arrayBuffer());

    return { status: res.status, data };
  }

  return {
    get: (url, opts) => request('GET', url, opts),
    post: (url, opts) => request('POST', url, opts),
    put: (url, opts) => request('PUT', url, opts),
    del: (url, opts) => request('DELETE', url, opts)
  };
}

// Mesmo formato de backup.js (aes-256-gcm + scrypt + gzip).
function backupKey(salt) {
  return crypto.scryptSync(BACKUP_SECRET, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024
  });
}

function decryptBackupFile(buffer) {
  const container = JSON.parse(buffer.toString('utf8'));
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    backupKey(Buffer.from(container.salt, 'base64')),
    Buffer.from(container.iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(container.authTag, 'base64'));

  const compressed = Buffer.concat([
    decipher.update(Buffer.from(container.data, 'base64')),
    decipher.final()
  ]);

  return { container, data: JSON.parse(zlib.gunzipSync(compressed).toString('utf8')) };
}

function encryptBackupFile(container, data) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupKey(salt), iv);

  const encrypted = Buffer.concat([
    cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8'))),
    cipher.final()
  ]);

  return Buffer.from(JSON.stringify({
    ...container,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  }));
}

module.exports = {
  ADMIN,
  makeSandbox,
  testEnv,
  provision,
  startServer,
  client,
  decryptBackupFile,
  encryptBackupFile
};
