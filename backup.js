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

// Tabelas que podem não existir em backups antigos (feitos antes de
// a tabela ser criada). Ao restaurar um backup sem elas, ficam vazias.


const OPTIONAL_TABLES = [
  'doubts',

  // Sistema de desafios
  'challenges',
  'challenge_questions',
  'challenge_attempts',
  'challenge_rewards',

  // Segurança de autenticação
  'login_attempts',

  // Avaliações
  'lesson_evaluations',
  'track_evaluations',
  'evaluations'
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

   
    // ----------------------------------------------------------
    // COMPATIBILIDADE ENTRE VERSÕES DAS COLUNAS
    // ----------------------------------------------------------

    const currentColumns = db.prepare(
      `PRAGMA table_info(${quoteIdentifier(table.name)})`
    ).all();

    const backupColumns = table.columns.map(
      column => column.name
    );

    const currentColumnNames = new Set(
      currentColumns.map(column => column.name)
    );

    // Impede importar colunas que não existem no banco atual.
    const unknownColumns = backupColumns.filter(
      name => !currentColumnNames.has(name)
    );

    if (unknownColumns.length > 0) {
      throw new Error(
        `A tabela "${table.name}" contém colunas desconhecidas: ` +
        unknownColumns.join(', ')
      );
    }

    // Impede nomes duplicados no cabeçalho do backup.
    if (new Set(backupColumns).size !== backupColumns.length) {
      throw new Error(
        `A tabela "${table.name}" possui colunas duplicadas.`
      );
    }

    // Verifica se as colunas novas podem receber
    // valores padrão ou NULL.
    const missingRequiredColumns = currentColumns.filter(
      column =>
        !backupColumns.includes(column.name) &&
        column.notnull === 1 &&
        column.dflt_value === null &&
        column.pk === 0
    );

    if (missingRequiredColumns.length > 0) {
      throw new Error(
        `O backup não possui colunas obrigatórias na tabela ` +
        `"${table.name}": ` +
        missingRequiredColumns.map(
          column => column.name
        ).join(', ')
      );
    }


    // ----------------------------------------------------------
    // VALIDAR REGISTROS DO BACKUP
    // ----------------------------------------------------------

    for (const row of table.rows) {

      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row)
      ) {
        throw new Error(
          `Registro inválido na tabela "${table.name}".`
        );
      }

      // Impede campos não declarados no backup.
      const unexpectedFields = Object.keys(row).filter(
        name => !backupColumns.includes(name)
      );

      if (unexpectedFields.length > 0) {
        throw new Error(
          `Registro da tabela "${table.name}" contém ` +
          `campos inesperados: ${unexpectedFields.join(', ')}`
        );
      }

      // Impede registros sem os campos declarados.
      const absentFields = backupColumns.filter(
        name => !Object.prototype.hasOwnProperty.call(row, name)
      );

      if (absentFields.length > 0) {
        throw new Error(
          `Registro incompleto na tabela "${table.name}": ` +
          absentFields.join(', ')
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
  data,
  restoreFiles = null
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
    currentTables
      .filter(
        name =>
          !OPTIONAL_TABLES.includes(name) ||
          backupTables.includes(name)
      )
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

  
  // ==========================================================
  // PROTEÇÃO DE DESAFIOS EM BACKUPS ANTIGOS
  // ==========================================================

  
  const challengeTables = [
    'challenges',
    'challenge_questions',
    'challenge_attempts',
    'challenge_rewards'
  ];

  const missingChallengeTables = challengeTables.filter(
    name => !backupTables.includes(name)
  );

  const tablesWithExistingData = missingChallengeTables.filter(
    name => {
      const exists = db.prepare(`
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
      `).get(name);

      if (!exists) return false;

      const row = db.prepare(
        `SELECT COUNT(*) AS total FROM "${name}"`
      ).get();

      return Number(row.total) > 0;
    }
  );

  if (tablesWithExistingData.length) {
    throw new Error(
      'Este backup é anterior ao sistema de desafios e ' +
      'não contém dados para as seguintes tabelas: ' +
      tablesWithExistingData.join(', ') + '. ' +
      'A restauração foi bloqueada para evitar perda ' +
      'de desafios, tentativas ou recompensas. ' +
      'Faça primeiro um backup atualizado.'
    );
  }


  // ==========================================================
  // PROTEÇÃO GERAL DAS TABELAS OPCIONAIS
  // ==========================================================

  const missingOptionalTables = OPTIONAL_TABLES.filter(
    name =>
      currentTables.includes(name) &&
      !backupTables.includes(name)
  );

  const missingTablesWithData = missingOptionalTables.filter(
    name => {
      const row = db.prepare(
        `SELECT COUNT(*) AS total
         FROM ${quoteIdentifier(name)}`
      ).get();

      return Number(row?.total || 0) > 0;
    }
  );

  if (missingTablesWithData.length > 0) {
    throw new Error(
      'Restauração bloqueada: o backup não contém ' +
      'as seguintes tabelas que possuem dados atuais: ' +
      missingTablesWithData.join(', ') + '. ' +
      'Faça um backup atualizado antes de continuar.'
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

    
    // --------------------------------------------------------
    // LIMPAR APENAS AS TABELAS PRESENTES NO BACKUP
    // --------------------------------------------------------

    // Tabelas opcionais ausentes no backup não serão
    // apagadas automaticamente.
    //
    // A verificação de integridade no final da transação
    // continua obrigatória.

    for (const tableName of currentTables) {
      if (!backupTables.includes(tableName)) {
        continue;
      }

      db.exec(
        `DELETE FROM ${quoteIdentifier(tableName)}`
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

    
    // --------------------------------------------------------
    // RESTAURAR MÍDIAS ANTES DE CONFIRMAR O BANCO
    // --------------------------------------------------------

    // --------------------------------------------------------
    // COORDENAR BANCO E MÍDIAS
    // --------------------------------------------------------

    let mediaOperation = null;

    try {
      if (typeof restoreFiles === 'function') {
        mediaOperation = restoreFiles();
      }

      // Confirma o banco somente após instalar as mídias.
      db.exec('COMMIT');

    } catch (error) {

      // Reverte a troca das mídias, se ela já ocorreu.
      if (mediaOperation?.rollback) {
        try {
          mediaOperation.rollback();
        } catch (mediaError) {
          console.error(
            'Falha ao recuperar mídias originais:',
            mediaError
          );
        }
      }

      throw error;
    }

    // O banco já foi confirmado.
    // A limpeza das mídias antigas é uma operação secundária.
    if (mediaOperation?.commit) {
      try {
        mediaOperation.commit();
      } catch (cleanupError) {
        console.error(
          'Falha ao remover cópia antiga dos uploads:',
          cleanupError
        );
      }
    }


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


function restoreMedia(media) {
  // Backups antigos sem seção de mídias não alteram uploads.
  if (media === undefined || media === null) {
    return {
      commit() {},
      rollback() {}
    };
  }

  validateMedia(media);

  const files = getMediaFiles(media) || [];
  const liveDir = path.resolve(UPLOAD_DIR);
  const parentDir = path.dirname(liveDir);

  fs.mkdirSync(parentDir, { recursive: true });

  // Preparação e recuperação ficam em diretório temporário.
  // Não movemos nem renomeamos a pasta uploads.
  const os = require('os');
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dragnix-restore-')
  );

  const stagingDir = path.join(workDir, 'staging');
  const rollbackDir = path.join(workDir, 'rollback');

  fs.mkdirSync(stagingDir);
  fs.mkdirSync(rollbackDir);

  let changesStarted = false;
  let finalized = false;

  function assertSafeTree(directory) {
    if (!fs.existsSync(directory)) return;

    const stat = fs.lstatSync(directory);

    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(
        'Diretório de uploads inválido: ' + directory
      );
    }

    for (const entry of fs.readdirSync(directory, {
      withFileTypes: true
    })) {
      const target = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        throw new Error(
          'Link simbólico não permitido: ' + target
        );
      }

      if (entry.isDirectory()) {
        assertSafeTree(target);
      } else if (!entry.isFile()) {
        throw new Error(
          'Tipo de arquivo não permitido: ' + target
        );
      }
    }
  }

  function listMedia(directory, relative = '', result = []) {
    if (!fs.existsSync(directory)) return result;

    for (const entry of fs.readdirSync(directory, {
      withFileTypes: true
    })) {
      const relativePath = relative
        ? path.join(relative, entry.name)
        : entry.name;

      const absolutePath = path.join(directory, relativePath);

      if (entry.isDirectory()) {
        listMedia(directory, relativePath, result);
      } else if (entry.isFile() && isMediaFile(entry.name)) {
        result.push(relativePath);
      }
    }

    return result;
  }

  function copyMedia(source, destination) {
    for (const relativePath of listMedia(source)) {
      const from = path.join(source, relativePath);
      const to = path.join(destination, relativePath);

      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }

  function removeMedia(directory) {
    for (const relativePath of listMedia(directory)) {
      fs.unlinkSync(path.join(directory, relativePath));
    }
  }

  function installMedia(source, destination) {
    for (const relativePath of listMedia(source)) {
      const from = path.join(source, relativePath);
      const to = path.join(destination, relativePath);

      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }

  function cleanup() {
    if (!finalized) {
      fs.rmSync(workDir, {
        recursive: true,
        force: true
      });

      finalized = true;
    }
  }

  function rollback() {
    if (finalized) return;

    if (changesStarted) {
      // Retira as mídias instaladas e recupera as anteriores.
      removeMedia(liveDir);
      installMedia(rollbackDir, liveDir);
    }

    cleanup();
  }

  try {
    assertSafeTree(liveDir);

    // Guarda cópia das mídias atuais.
    copyMedia(liveDir, rollbackDir);

    // Prepara todas as mídias do backup antes de alterar uploads.
    for (const file of files) {
      const relativePath = normalizeRelativePath(file.path);

      const targetPath = path.resolve(
        stagingDir,
        ...relativePath.split('/')
      );

      if (
        targetPath === stagingDir ||
        !isPathInsideBase(stagingDir, targetPath) ||
        !isMediaFile(relativePath)
      ) {
        throw new Error(
          'Caminho de mídia inválido: ' + file.path
        );
      }

      fs.mkdirSync(path.dirname(targetPath), {
        recursive: true
      });

      fs.writeFileSync(
        targetPath,
        Buffer.from(file.data, 'base64'),
        { flag: 'wx' }
      );
    }

    fs.mkdirSync(liveDir, { recursive: true });

    changesStarted = true;

    // Substitui somente os arquivos de mídia.
    removeMedia(liveDir);
    installMedia(stagingDir, liveDir);

    return {
      commit() {
        try {
          cleanup();
        } catch (error) {
          console.error(
            'Falha ao limpar arquivos temporários:',
            error
          );
        }
      },

      rollback
    };

  } catch (error) {
    try {
      rollback();
    } catch (rollbackError) {
      console.error(
        'ERRO CRÍTICO: falha ao recuperar uploads:',
        rollbackError
      );

      throw new Error(
        'Falha na restauração das mídias e na recuperação ' +
        'dos arquivos anteriores. Verifique os logs. ' +
        'Erro original: ' + error.message
      );
    }

    throw error;
  }
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
            DELETE FROM lesson_evaluations;
            DELETE FROM track_evaluations;
            DELETE FROM doubts;
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
        // PRÉ-VALIDAÇÃO DAS MÍDIAS
        // ------------------------------------------------------

        // Verifica o conteúdo das mídias antes de alterar
        // qualquer registro do banco de dados.
        validateMedia(backup.media);

     
        // ------------------------------------------------------
        // RESTAURAR BANCO E MÍDIAS
        // ------------------------------------------------------

                
        restoreDatabase(
          db,
          backup,
          () => {
            return restoreMedia(backup.media);
          }
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