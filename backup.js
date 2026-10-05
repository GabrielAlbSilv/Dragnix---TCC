const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const BACKUP_FORMAT = 'DRAGNIX_BACKUP';
const BACKUP_VERSION = 1;
const APPLICATION_NAME = 'Dragnix';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Diretório dos uploads.
// Se UPLOAD_DIR estiver configurado no ambiente,
// ele será utilizado.
const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  path.join(__dirname, 'public', 'uploads');

// ============================================================
// EXTENSÕES DE MÍDIA
// ============================================================

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.avif',
  '.ico',
  '.tif',
  '.tiff'
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.avi',
  '.mkv',
  '.wmv',
  '.flv',
  '.mpeg',
  '.mpg',
  '.3gp',
  '.ogv',
  '.m2ts'
]);

const MEDIA_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS
]);

// ============================================================
// TABELAS ESSENCIAIS
// ============================================================

const REQUIRED_TABLES = [
  'users',
  'tracks',
  'lessons',
  'questions',
  'progress',
  'answers',
  'activity',
  'badges',
  'claims',
  'finance'
];

// ============================================================
// UTILITÁRIOS
// ============================================================

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function getBackupSecret() {
  const secret =
    process.env.BACKUP_SECRET;

  if (
    !secret ||
    secret.length < 16
  ) {
    throw new Error(
      'BACKUP_SECRET não configurado ou muito curto.'
    );
  }

  return secret;
}

// ============================================================
// UTILITÁRIOS DE CAMINHO / MÍDIA
// ============================================================

function normalizeRelativePath(filePath) {
  return String(
    filePath
  )
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function isMediaFile(fileName) {
  const extension =
    path
      .extname(fileName)
      .toLowerCase();

  return MEDIA_EXTENSIONS.has(
    extension
  );
}

function isPathInsideBase(
  baseDir,
  targetPath
) {
  const base =
    path.resolve(
      baseDir
    );

  const target =
    path.resolve(
      targetPath
    );

  return (
    target === base ||
    target.startsWith(
      base + path.sep
    )
  );
}

// ============================================================
// NORMALIZAR LISTA DE MÍDIAS
// ============================================================
//
// Aceita:
// 1. media como array
// 2. media como objeto contendo { files: [] }
//
// Isso permite trabalhar tanto com backups novos
// quanto com backups antigos.
// ============================================================

function getMediaFiles(
  media
) {
  if (
    Array.isArray(media)
  ) {
    return media;
  }

  if (
    media &&
    typeof media === 'object' &&
    Array.isArray(media.files)
  ) {
    return media.files;
  }

  return null;
}

// ============================================================
// COLETAR MÍDIAS
// ============================================================

function collectMediaFiles(
  currentDir = UPLOAD_DIR,
  relativeDir = '',
  result = []
) {
  if (
    !fs.existsSync(
      currentDir
    )
  ) {
    return result;
  }

  const entries =
    fs.readdirSync(
      currentDir,
      {
        withFileTypes: true
      }
    );

  for (
    const entry of entries
  ) {
    const absolutePath =
      path.join(
        currentDir,
        entry.name
      );

    const relativePath =
      normalizeRelativePath(
        path.join(
          relativeDir,
          entry.name
        )
      );

    // Ignora links simbólicos.
    if (
      entry.isSymbolicLink()
    ) {
      continue;
    }

    if (
      entry.isDirectory()
    ) {
      collectMediaFiles(
        absolutePath,
        relativePath,
        result
      );

      continue;
    }

    if (
      !entry.isFile()
    ) {
      continue;
    }

    if (
      !isMediaFile(
        entry.name
      )
    ) {
      continue;
    }

    const fileBuffer =
      fs.readFileSync(
        absolutePath
      );

    const stats =
      fs.statSync(
        absolutePath
      );

    result.push({
      path:
        relativePath,

      size:
        stats.size,

      modifiedAt:
        stats.mtime.toISOString(),

      data:
        fileBuffer.toString(
          'base64'
        )
    });
  }

  return result;
}

// ============================================================
// RESUMO DAS MÍDIAS
// ============================================================

function mediaSummary(
  media
) {
  const files =
    getMediaFiles(
      media
    ) || [];

  const totalBytes =
    files.reduce(
      (
        total,
        file
      ) =>
        total +
        Number(
          file?.size || 0
        ),
      0
    );

  const images =
    files.filter(
      file =>
        file &&
        typeof file.path === 'string' &&
        IMAGE_EXTENSIONS.has(
          path
            .extname(
              file.path
            )
            .toLowerCase()
        )
    ).length;

  const videos =
    files.filter(
      file =>
        file &&
        typeof file.path === 'string' &&
        VIDEO_EXTENSIONS.has(
          path
            .extname(
              file.path
            )
            .toLowerCase()
        )
    ).length;

  return {
    files:
      files.length,

    images,

    videos,

    totalBytes
  };
}

// ============================================================
// COLETAR BANCO
// ============================================================

function collectDatabase(db) {
  const schema =
    db
      .prepare(`
        SELECT
          type,
          name,
          tbl_name,
          sql
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY
          CASE type
            WHEN 'table' THEN 1
            WHEN 'index' THEN 2
            WHEN 'trigger' THEN 3
            WHEN 'view' THEN 4
            ELSE 5
          END,
          name
      `)
      .all();

  const tables =
    schema
      .filter(
        item =>
          item.type === 'table'
      )
      .map(
        table => {
          const name =
            table.name;

          const identifier =
            quoteIdentifier(
              name
            );

          const columns =
            db
              .prepare(
                `PRAGMA table_info(${identifier})`
              )
              .all();

          const rows =
            db
              .prepare(
                `SELECT * FROM ${identifier}`
              )
              .all();

          return {
            name,
            columns,
            rows
          };
        }
      );

  return {
    schema,
    tables
  };
}

// ============================================================
// CRIPTOGRAFIA
// ============================================================

function deriveKey(
  secret,
  salt
) {
  return crypto.scryptSync(
    secret,
    salt,
    KEY_LENGTH,
    {
      N: 16384,
      r: 8,
      p: 1,
      maxmem:
        32 * 1024 * 1024
    }
  );
}

function encryptBackup(
  data
) {
  const secret =
    getBackupSecret();

  const salt =
    crypto.randomBytes(
      SALT_LENGTH
    );

  const iv =
    crypto.randomBytes(
      IV_LENGTH
    );

  const key =
    deriveKey(
      secret,
      salt
    );

  const json =
    JSON.stringify(
      data
    );

  const compressed =
    zlib.gzipSync(
      Buffer.from(
        json,
        'utf8'
      )
    );

  const cipher =
    crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      key,
      iv
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        compressed
      ),
      cipher.final()
    ]);

  const authTag =
    cipher.getAuthTag();

  const container = {
    format:
      BACKUP_FORMAT,

    version:
      BACKUP_VERSION,

    algorithm:
      ENCRYPTION_ALGORITHM,

    kdf:
      'scrypt',

    compression:
      'gzip',

    createdAt:
      new Date().toISOString(),

    salt:
      salt.toString(
        'base64'
      ),

    iv:
      iv.toString(
        'base64'
      ),

    authTag:
      authTag.toString(
        'base64'
      ),

    data:
      encrypted.toString(
        'base64'
      )
  };

  return Buffer.from(
    JSON.stringify(
      container,
      null,
      2
    ),
    'utf8'
  );
}

// ============================================================
// DESCRIPTOGRAFIA
// ============================================================

function decryptBackup(
  buffer
) {
  const secret =
    getBackupSecret();

  let container;

  try {
    container =
      JSON.parse(
        buffer.toString(
          'utf8'
        )
      );
  } catch {
    throw new Error(
      'Arquivo de backup inválido ou corrompido.'
    );
  }

  if (
    container?.format !==
    BACKUP_FORMAT
  ) {
    throw new Error(
      'O arquivo selecionado não é um backup do Dragnix.'
    );
  }

  if (
    container.version !==
    BACKUP_VERSION
  ) {
    throw new Error(
      `Versão de backup não suportada: ${container.version}`
    );
  }

  if (
    container.algorithm !==
    ENCRYPTION_ALGORITHM
  ) {
    throw new Error(
      'Algoritmo de criptografia não suportado.'
    );
  }

  if (
    container.kdf !==
    'scrypt'
  ) {
    throw new Error(
      'Método de derivação de chave não suportado.'
    );
  }

  if (
    container.compression !==
    'gzip'
  ) {
    throw new Error(
      'Método de compressão não suportado.'
    );
  }

  try {
    const salt =
      Buffer.from(
        container.salt,
        'base64'
      );

    const iv =
      Buffer.from(
        container.iv,
        'base64'
      );

    const authTag =
      Buffer.from(
        container.authTag,
        'base64'
      );

    const encrypted =
      Buffer.from(
        container.data,
        'base64'
      );

    if (
      salt.length !==
      SALT_LENGTH
    ) {
      throw new Error(
        'Salt inválido.'
      );
    }

    if (
      iv.length !==
      IV_LENGTH
    ) {
      throw new Error(
        'IV inválido.'
      );
    }

    if (
      authTag.length !==
      AUTH_TAG_LENGTH
    ) {
      throw new Error(
        'AuthTag inválido.'
      );
    }

    const key =
      deriveKey(
        secret,
        salt
      );

    const decipher =
      crypto.createDecipheriv(
        ENCRYPTION_ALGORITHM,
        key,
        iv
      );

    decipher.setAuthTag(
      authTag
    );

    const compressed =
      Buffer.concat([
        decipher.update(
          encrypted
        ),
        decipher.final()
      ]);

    const json =
      zlib
        .gunzipSync(
          compressed
        )
        .toString(
          'utf8'
        );

    const data =
      JSON.parse(
        json
      );

    if (
      data?.format !==
      BACKUP_FORMAT
    ) {
      throw new Error(
        'Estrutura interna do backup inválida.'
      );
    }

    return data;

  } catch (error) {

    console.error(
      'Falha interna ao descriptografar backup:',
      error
    );

    throw new Error(
      'Backup inválido, corrompido ou incompatível com a chave de segurança.'
    );
  }
}

// ============================================================
// VALIDAR MÍDIAS
// ============================================================

function validateMedia(
  media
) {
  // Backups antigos podem não possuir mídia.
  if (
    media === undefined ||
    media === null
  ) {
    return true;
  }

  const files =
    getMediaFiles(
      media
    );

  if (
    files === null
  ) {
    throw new Error(
      'A seção de mídias do backup é inválida.'
    );
  }

  const seenPaths =
    new Set();

  for (
    const file of files
  ) {

    if (
      !file ||
      typeof file !== 'object' ||
      Array.isArray(file)
    ) {
      throw new Error(
        'Registro de mídia inválido no backup.'
      );
    }

    if (
      typeof file.path !== 'string' ||
      !file.path.trim()
    ) {
      throw new Error(
        'Caminho de mídia inválido no backup.'
      );
    }

    const relativePath =
      normalizeRelativePath(
        file.path
      );

    // Proteção contra path traversal.
    if (
      !relativePath ||
      relativePath.startsWith('../') ||
      relativePath.includes('/../') ||
      relativePath === '..' ||
      path.isAbsolute(file.path)
    ) {
      throw new Error(
        `Caminho de mídia inseguro: ${file.path}`
      );
    }

    if (
      !isMediaFile(
        relativePath
      )
    ) {
      throw new Error(
        `Tipo de mídia não permitido: ${relativePath}`
      );
    }

    if (
      seenPaths.has(
        relativePath
      )
    ) {
      throw new Error(
        `Mídia duplicada no backup: ${relativePath}`
      );
    }

    seenPaths.add(
      relativePath
    );

    if (
      typeof file.data !== 'string' ||
      !file.data
    ) {
      throw new Error(
        `Dados ausentes para a mídia: ${relativePath}`
      );
    }

    let buffer;

    try {
      buffer =
        Buffer.from(
          file.data,
          'base64'
        );
    } catch {
      throw new Error(
        `Arquivo de mídia inválido: ${relativePath}`
      );
    }

    if (
      !buffer.length
    ) {
      throw new Error(
        `Arquivo de mídia vazio: ${relativePath}`
      );
    }

    if (
      file.size !== undefined
    ) {
      const declaredSize =
        Number(
          file.size
        );

      if (
        !Number.isFinite(
          declaredSize
        ) ||
        declaredSize < 0
      ) {
        throw new Error(
          `Tamanho inválido para a mídia: ${relativePath}`
        );
      }
    }

    // Verifica se o tamanho declarado corresponde
    // ao conteúdo real quando ambos estão disponíveis.
    if (
      file.size !== undefined &&
      Number(file.size) !== buffer.length
    ) {
      throw new Error(
        `O tamanho da mídia "${relativePath}" não corresponde aos dados armazenados.`
      );
    }
  }

  return true;
}

// ============================================================
// VALIDAR BACKUP
// ============================================================

function validateBackup(
  data,
  db
) {
  if (
    !data ||
    data.format !==
      BACKUP_FORMAT
  ) {
    throw new Error(
      'Formato de backup inválido.'
    );
  }

  if (
    data.version !==
    BACKUP_VERSION
  ) {
    throw new Error(
      'Versão de backup incompatível.'
    );
  }

  if (
    data.application !==
    APPLICATION_NAME
  ) {
    throw new Error(
      'O arquivo não pertence ao Dragnix.'
    );
  }

  if (
    !Array.isArray(
      data.tables
    )
  ) {
    throw new Error(
      'O backup não contém tabelas válidas.'
    );
  }

  const backupTableNames =
    data.tables.map(
      table =>
        table.name
    );

  const duplicate =
    backupTableNames.some(
      (
        name,
        index
      ) =>
        backupTableNames.indexOf(
          name
        ) !== index
    );

  if (
    duplicate
  ) {
    throw new Error(
      'O backup contém tabelas duplicadas.'
    );
  }

  // ----------------------------------------------------------
  // TABELAS ESSENCIAIS
  // ----------------------------------------------------------

  for (
    const required of REQUIRED_TABLES
  ) {
    if (
      !backupTableNames.includes(
        required
      )
    ) {
      throw new Error(
        `A tabela obrigatória "${required}" não está presente no backup.`
      );
    }
  }

  // ----------------------------------------------------------
  // TABELAS
  // ----------------------------------------------------------

  for (
    const table of data.tables
  ) {

    if (
      typeof table.name !==
      'string'
    ) {
      throw new Error(
        'Nome de tabela inválido no backup.'
      );
    }

    const exists =
      db
        .prepare(`
          SELECT 1
          FROM sqlite_master
          WHERE type='table'
          AND name=?
        `)
        .get(
          table.name
        );

    if (
      !exists
    ) {
      throw new Error(
        `A tabela "${table.name}" não existe no banco atual.`
      );
    }

    if (
      !Array.isArray(
        table.columns
      )
    ) {
      throw new Error(
        `Estrutura inválida na tabela "${table.name}".`
      );
    }

    if (
      !Array.isArray(
        table.rows
      )
    ) {
      throw new Error(
        `Dados inválidos na tabela "${table.name}".`
      );
    }

    const currentColumns =
      db
        .prepare(
          `PRAGMA table_info(${quoteIdentifier(
            table.name
          )})`
        )
        .all()
        .map(
          column =>
            column.name
        );

    const backupColumns =
      table.columns.map(
        column =>
          column.name
      );

    const currentSorted =
      [...currentColumns]
        .sort();

    const backupSorted =
      [...backupColumns]
        .sort();

    if (
      JSON.stringify(
        currentSorted
      ) !==
      JSON.stringify(
        backupSorted
      )
    ) {
      throw new Error(
        `A estrutura da tabela "${table.name}" é incompatível com a versão atual do banco.`
      );
    }

    for (
      const row of table.rows
    ) {
      if (
        !row ||
        typeof row !==
          'object' ||
        Array.isArray(row)
      ) {
        throw new Error(
          `Registro inválido na tabela "${table.name}".`
        );
      }
    }
  }

  // ----------------------------------------------------------
  // ADM
  // ----------------------------------------------------------

  const users =
    data.tables.find(
      table =>
        table.name ===
        'users'
    );

  const adminCount =
    users.rows.filter(
      row =>
        row.role ===
        'adm'
    ).length;

  if (
    adminCount < 1
  ) {
    throw new Error(
      'O backup não possui nenhum administrador. Restauração bloqueada.'
    );
  }

  // ----------------------------------------------------------
  // MÍDIAS
  // ----------------------------------------------------------

  validateMedia(
    data.media
  );

  return true;
}

// ============================================================
// RESUMO
// ============================================================

function backupSummary(
  data
) {
  const tables =
    data.tables.map(
      table => ({
        name:
          table.name,

        rows:
          table.rows.length
      })
    );

  const totalRows =
    tables.reduce(
      (
        total,
        table
      ) =>
        total +
        table.rows,
      0
    );

  const users =
    data.tables.find(
      table =>
        table.name ===
        'users'
    );

  const tracks =
    data.tables.find(
      table =>
        table.name ===
        'tracks'
    );

  const lessons =
    data.tables.find(
      table =>
        table.name ===
        'lessons'
    );

  const questions =
    data.tables.find(
      table =>
        table.name ===
        'questions'
    );

  // CORREÇÃO:
  // aceita media como array ou como { files: [] }.
  const media =
    getMediaFiles(
      data.media
    ) || [];

  return {
    application:
      data.application,

    version:
      data.version,

    createdAt:
      data.createdAt,

    totalTables:
      tables.length,

    totalRows,

    users:
      users?.rows.length ||
      0,

    admins:
      users?.rows.filter(
        row =>
          row.role ===
          'adm'
      ).length || 0,

    tracks:
      tracks?.rows.length ||
      0,

    lessons:
      lessons?.rows.length ||
      0,

    questions:
      questions?.rows.length ||
      0,

    media:
      mediaSummary(
        media
      ),

    tables
  };
}

// ============================================================
// RESTAURAÇÃO DO BANCO
// ============================================================

function restoreDatabase(
  db,
  data
) {
  validateBackup(
    data,
    db
  );

  const currentTables =
    db
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `)
      .all()
      .map(
        row =>
          row.name
      );

  const backupTables =
    data.tables
      .map(
        table =>
          table.name
      )
      .sort();

  const currentSorted =
    [...currentTables]
      .sort();

  if (
    JSON.stringify(
      currentSorted
    ) !==
    JSON.stringify(
      backupTables
    )
  ) {
    throw new Error(
      'O backup não corresponde à estrutura atual do banco.'
    );
  }

  const foreignKeys =
    db
      .prepare(
        'PRAGMA foreign_keys'
      )
      .get()
      ?.foreign_keys ?? 1;

  try {

    db.exec(
      'PRAGMA foreign_keys = OFF'
    );

    db.exec(
      'BEGIN TRANSACTION'
    );

    // --------------------------------------------------------
    // LIMPAR BANCO
    // --------------------------------------------------------

    for (
      const tableName of currentTables
    ) {
      db.exec(
        `DELETE FROM ${quoteIdentifier(
          tableName
        )}`
      );
    }

    // --------------------------------------------------------
    // RESTAURAR DADOS
    // --------------------------------------------------------

    for (
      const table of data.tables
    ) {

      if (
        table.rows.length ===
        0
      ) {
        continue;
      }

      const columns =
        table.columns.map(
          column =>
            column.name
        );

      const placeholders =
        columns
          .map(
            () => '?'
          )
          .join(
            ', '
          );

      const columnList =
        columns
          .map(
            quoteIdentifier
          )
          .join(
            ', '
          );

      const statement =
        db.prepare(
          `INSERT INTO ${quoteIdentifier(
            table.name
          )} (${columnList})
           VALUES (${placeholders})`
        );

      for (
        const row of table.rows
      ) {
        statement.run(
          ...columns.map(
            column =>
              row[column]
          )
        );
      }
    }

    // --------------------------------------------------------
    // INTEGRIDADE
    // --------------------------------------------------------

    const integrity =
      db
        .prepare(
          'PRAGMA foreign_key_check'
        )
        .all();

    if (
      integrity.length > 0
    ) {
      throw new Error(
        'A restauração gerou inconsistências de chaves estrangeiras.'
      );
    }

    db.exec(
      'COMMIT'
    );

    if (foreignKeys) {
      db.exec(
        'PRAGMA foreign_keys = ON'
      );
    }

    return true;

  } catch (error) {

    try {
      db.exec(
        'ROLLBACK'
      );
    } catch {}

    try {
      db.exec(
        'PRAGMA foreign_keys = ON'
      );
    } catch {}

    throw error;
  }
}

// ============================================================
// RESTAURAR MÍDIAS
// ============================================================

function restoreMedia(
  media
) {
  // CORREÇÃO:
  // aceita tanto array quanto objeto { files: [] }.
  const files =
    getMediaFiles(
      media
    ) || [];

  // Garante que a pasta exista.
  fs.mkdirSync(
    UPLOAD_DIR,
    {
      recursive: true
    }
  );

  // ----------------------------------------------------------
  // LIMPA MÍDIAS ATUAIS
  // ----------------------------------------------------------

  function removeExistingMedia(
    currentDir
  ) {
    if (
      !fs.existsSync(
        currentDir
      )
    ) {
      return;
    }

    const entries =
      fs.readdirSync(
        currentDir,
        {
          withFileTypes: true
        }
      );

    for (
      const entry of entries
    ) {

      const absolutePath =
        path.join(
          currentDir,
          entry.name
        );

      if (
        entry.isSymbolicLink()
      ) {
        continue;
      }

      if (
        entry.isDirectory()
      ) {
        removeExistingMedia(
          absolutePath
        );

        continue;
      }

      if (
        entry.isFile() &&
        isMediaFile(
          entry.name
        )
      ) {
        fs.unlinkSync(
          absolutePath
        );
      }
    }
  }

  removeExistingMedia(
    UPLOAD_DIR
  );

  // ----------------------------------------------------------
  // RESTAURA ARQUIVOS
  // ----------------------------------------------------------

  for (
    const file of files
  ) {

    const relativePath =
      normalizeRelativePath(
        file.path
      );

    const targetPath =
      path.resolve(
        UPLOAD_DIR,
        ...relativePath.split('/')
      );

    // Proteção contra path traversal.
    if (
      !isPathInsideBase(
        UPLOAD_DIR,
        targetPath
      )
    ) {
      throw new Error(
        `Caminho de mídia fora do diretório permitido: ${file.path}`
      );
    }

    if (
      !isMediaFile(
        relativePath
      )
    ) {
      throw new Error(
        `Tipo de mídia não permitido: ${relativePath}`
      );
    }

    const buffer =
      Buffer.from(
        file.data,
        'base64'
      );

    const parentDir =
      path.dirname(
        targetPath
      );

    fs.mkdirSync(
      parentDir,
      {
        recursive: true
      }
    );

    fs.writeFileSync(
      targetPath,
      buffer
    );
  }

  return true;
}

// ============================================================
// NOME DO BACKUP
// ============================================================

function backupFilename() {
  const now =
    new Date();

  const pad =
    value =>
      String(value)
        .padStart(
          2,
          '0'
        );

  const date =
    `${now.getFullYear()}-${pad(
      now.getMonth() + 1
    )}-${pad(
      now.getDate()
    )}`;

  const time =
    `${pad(
      now.getHours()
    )}-${pad(
      now.getMinutes()
    )}-${pad(
      now.getSeconds()
    )}`;

  return `dragnix-backup-${date}-${time}.dragnix`;
}

// ============================================================
// ROTAS
// ============================================================

function registerBackupRoutes(
  app,
  db,
  auth,
  adm
) {

  // ==========================================================
  // LIMPAR BANCO
  // ==========================================================

  app.post(
    '/api/admin/database/clear',
    auth,
    adm,
    (req, res) => {

      try {

        const adminCount =
          db
            .prepare(`
              SELECT COUNT(*) AS count
              FROM users
              WHERE role='adm'
            `)
            .get()
            .count;

        if (
          adminCount < 1
        ) {
          return res.status(500).json({
            error:
              'Operação bloqueada: nenhum administrador foi encontrado.'
          });
        }

        db.exec(
          'BEGIN IMMEDIATE'
        );

        try {

          db.exec(`
            DELETE FROM answers;
            DELETE FROM progress;
            DELETE FROM activity;
            DELETE FROM badges;
            DELETE FROM claims;
            DELETE FROM finance;
          `);

          db.exec(`
            DELETE FROM questions;
            DELETE FROM lessons;
            DELETE FROM tracks;
          `);

          const deletedUsers =
            db
              .prepare(`
                DELETE FROM users
                WHERE role <> 'adm'
              `)
              .run()
              .changes;

          const remainingAdmins =
            db
              .prepare(`
                SELECT COUNT(*) AS count
                FROM users
                WHERE role='adm'
              `)
              .get()
              .count;

          if (
            remainingAdmins < 1
          ) {
            throw new Error(
              'Falha de segurança: nenhuma conta ADM permaneceu.'
            );
          }

          db.exec(
            'COMMIT'
          );

          console.log(
            `Banco limpo pelo administrador ${req.user.email}. Usuários comuns removidos: ${deletedUsers}.`
          );

          return res.json({
            ok: true,

            message:
              'Banco de dados limpo com sucesso.',

            deletedUsers,

            remainingAdmins
          });

        } catch (error) {

          try {
            db.exec(
              'ROLLBACK'
            );
          } catch {}

          throw error;
        }

      } catch (error) {

        console.error(
          'Erro ao limpar banco:',
          error
        );

        return res.status(500).json({
          error:
            error.message ||
            'Não foi possível limpar o banco de dados.'
        });
      }
    }
  );

  // ==========================================================
  // VISÃO GERAL DO SISTEMA
  // ==========================================================

  app.get(
    '/api/admin/system/overview',
    auth,
    adm,
    (req, res) => {

      try {

        const tables =
          db
            .prepare(`
              SELECT name
              FROM sqlite_master
              WHERE type='table'
              AND name NOT LIKE 'sqlite_%'
              ORDER BY name
            `)
            .all()
            .map(
              row =>
                row.name
            );

        const tableData =
          tables.map(
            tableName => {

              const columns =
                db
                  .prepare(
                    `PRAGMA table_info(${quoteIdentifier(
                      tableName
                    )})`
                  )
                  .all();

              const count =
                db
                  .prepare(
                    `SELECT COUNT(*) AS count
                     FROM ${quoteIdentifier(
                       tableName
                     )}`
                  )
                  .get();

              return {
                name:
                  tableName,

                rows:
                  Number(
                    count?.count ||
                    0
                  ),

                columns:
                  columns.length
              };
            }
          );

        const totalRows =
          tableData.reduce(
            (
              total,
              table
            ) =>
              total +
              table.rows,
            0
          );

        const users =
          db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM users`
            )
            .get();

        const admins =
          db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM users
               WHERE role='adm'`
            )
            .get();

        const tracks =
          db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM tracks`
            )
            .get();

        const lessons =
          db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM lessons`
            )
            .get();

        const questions =
          db
            .prepare(
              `SELECT COUNT(*) AS count
               FROM questions`
            )
            .get();

        const media =
          collectMediaFiles();

        return res.json({
          ok: true,

          application:
            APPLICATION_NAME,

          server: {
            nodeVersion:
              process.version,

            platform:
              process.platform,

            generatedAt:
              new Date().toISOString()
          },

          database: {
            tableCount:
              tableData.length,

            totalRows,

            users:
              Number(
                users?.count ||
                0
              ),

            admins:
              Number(
                admins?.count ||
                0
              ),

            tracks:
              Number(
                tracks?.count ||
                0
              ),

            lessons:
              Number(
                lessons?.count ||
                0
              ),

            questions:
              Number(
                questions?.count ||
                0
              ),

            tables:
              tableData
          },

          media:
            mediaSummary(
              media
            )
        });

      } catch (error) {

        console.error(
          'Erro ao carregar visão geral do sistema:',
          error
        );

        return res.status(500).json({
          ok: false,

          error:
            error.message ||
            'Não foi possível carregar a visão geral.'
        });
      }
    }
  );

  // ==========================================================
  // VISUALIZAR TABELA
  // ==========================================================

  app.get(
    '/api/admin/system/table/:tableName',
    auth,
    adm,
    (req, res) => {

      try {

        const tableName =
          String(
            req.params.tableName ||
              ''
          ).trim();

        const tableExists =
          db
            .prepare(`
              SELECT name
              FROM sqlite_master
              WHERE type='table'
              AND name NOT LIKE 'sqlite_%'
              AND name=?
            `)
            .get(
              tableName
            );

        if (
          !tableExists
        ) {
          return res.status(404).json({
            ok: false,
            error:
              'Tabela não encontrada.'
          });
        }

        const columns =
          db
            .prepare(
              `PRAGMA table_info(${quoteIdentifier(
                tableName
              )})`
            )
            .all();

        const visibleColumns =
          columns.filter(
            column =>
              column.name !==
              'password'
          );

        const hiddenColumns =
          columns
            .filter(
              column =>
                column.name ===
                'password'
            )
            .map(
              column =>
                column.name
            );

        const columnList =
          visibleColumns
            .map(
              column =>
                quoteIdentifier(
                  column.name
                )
            )
            .join(
              ', '
            );

        let rows = [];

        if (
          columnList
        ) {
          rows =
            db
              .prepare(
                `SELECT ${columnList}
                 FROM ${quoteIdentifier(
                   tableName
                 )}`
              )
              .all();
        }

        return res.json({
          ok: true,

          table: {
            name:
              tableName,

            columns:
              visibleColumns.map(
                column =>
                  column.name
              ),

            hiddenColumns,

            rows,

            total:
              rows.length
          }
        });

      } catch (error) {

        console.error(
          'Erro ao carregar tabela:',
          error
        );

        return res.status(500).json({
          ok: false,

          error:
            error.message ||
            'Não foi possível carregar a tabela.'
        });
      }
    }
  );

  // ==========================================================
  // GERAR BACKUP
  // ==========================================================

  app.get(
    '/api/admin/backup/export',
    auth,
    adm,
    (req, res) => {

      try {

        const database =
          collectDatabase(
            db
          );

        const media =
          collectMediaFiles();

        const mediaInfo =
          mediaSummary(
            media
          );

        const backupData = {
          format:
            BACKUP_FORMAT,

          version:
            BACKUP_VERSION,

          application:
            APPLICATION_NAME,

          createdAt:
            new Date().toISOString(),

          nodeVersion:
            process.version,

          database: {
            tableCount:
              database.tables.length,

            rowCount:
              database.tables.reduce(
                (
                  total,
                  table
                ) =>
                  total +
                  table.rows.length,
                0
              ),

            tables:
              database.tables.map(
                table => ({
                  name:
                    table.name,

                  rows:
                    table.rows.length
                })
              )
          },

          // ====================================================
          // CORREÇÃO PRINCIPAL
          // ====================================================
          //
          // A mídia fica armazenada como um objeto com
          // metadados e uma lista em "files".
          //
          media: {
            fileCount:
              mediaInfo.files,

            imageCount:
              mediaInfo.images,

            videoCount:
              mediaInfo.videos,

            totalBytes:
              mediaInfo.totalBytes,

            files:
              media
          },

          schema:
            database.schema,

          tables:
            database.tables
        };

        const encrypted =
          encryptBackup(
            backupData
          );

        const filename =
          backupFilename();

        res.setHeader(
          'Content-Type',
          'application/octet-stream'
        );

        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${filename}"`
        );

        res.setHeader(
          'Content-Length',
          encrypted.length
        );

        res.setHeader(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, private'
        );

        res.setHeader(
          'Pragma',
          'no-cache'
        );

        console.log(
          `Backup gerado por ${req.user.email}: ${filename} | mídias: ${mediaInfo.files} | imagens: ${mediaInfo.images} | vídeos: ${mediaInfo.videos}`
        );

        return res.send(
          encrypted
        );

      } catch (error) {

        console.error(
          'Erro ao gerar backup:',
          error
        );

        return res.status(500).json({
          error:
            error.message ||
            'Não foi possível gerar o backup.'
        });
      }
    }
  );

  // ==========================================================
  // LER / VALIDAR
  // ==========================================================

  app.post(
    '/api/admin/backup/inspect',
    auth,
    adm,
    (req, res) => {

      try {

        const base64 =
          String(
            req.body?.data ||
              ''
          );

        if (
          !base64
        ) {
          return res.status(400).json({
            error:
              'Nenhum arquivo foi enviado.'
          });
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
              'Arquivo vazio.'
          });
        }

        const backup =
          decryptBackup(
            buffer
          );

        validateBackup(
          backup,
          db
        );

        const summary =
          backupSummary(
            backup
          );

        console.log(
          `Backup validado por ${req.user.email}: ${summary.totalRows} registros | mídias: ${summary.media.files}`
        );

        return res.json({
          ok: true,

          summary
        });

      } catch (error) {

        console.error(
          'Erro ao ler backup:',
          error
        );

        return res.status(400).json({
          error:
            error.message ||
            'Não foi possível ler o backup.'
        });
      }
    }
  );

  // ==========================================================
  // RESTAURAR
  // ==========================================================

  app.post(
    '/api/admin/backup/restore',
    auth,
    adm,
    (req, res) => {

      try {

        const base64 =
          String(
            req.body?.data ||
              ''
          );

        if (
          !base64
        ) {
          return res.status(400).json({
            error:
              'Nenhum arquivo foi enviado.'
          });
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
              'Arquivo vazio.'
          });
        }

        const backup =
          decryptBackup(
            buffer
          );

        validateBackup(
          backup,
          db
        );

        const summary =
          backupSummary(
            backup
          );

        // ------------------------------------------------------
        // RESTAURA BANCO
        // ------------------------------------------------------

        restoreDatabase(
          db,
          backup
        );

        // ------------------------------------------------------
        // RESTAURA MÍDIAS
        // ------------------------------------------------------

        restoreMedia(
          backup.media?.files ||
          backup.media ||
          []
        );

        console.log(
          `Backup restaurado por ${req.user.email}: ${summary.totalRows} registros | mídias: ${summary.media.files}`
        );

        return res.json({
          ok: true,

          message:
            'Backup restaurado com sucesso.',

          summary
        });

      } catch (error) {

        console.error(
          'Erro ao restaurar backup:',
          error
        );

        return res.status(400).json({
          error:
            error.message ||
            'Não foi possível restaurar o backup.'
        });
      }
    }
  );
}

// ============================================================
// EXPORTAÇÃO
// ============================================================

module.exports = {
  registerBackupRoutes
};