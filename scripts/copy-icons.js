// scripts/copy-icons.js

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'lucide-static',
  'icons'
);

const targetDir = path.join(
  __dirname,
  '..',
  'public',
  'icons'
);

const icons = [
  'book-open',
  'flag',
  'trophy',
  'clipboard-check',
  'zap',
  'heart',
  'circle-check',
  'lock',
  'user-round',
  'settings'
];

fs.mkdirSync(targetDir, { recursive: true });

for (const name of icons) {
  const source = path.join(sourceDir, `${name}.svg`);
  const target = path.join(targetDir, `${name}.svg`);

  if (!fs.existsSync(source)) {
    console.error(`Ícone não encontrado: ${name}.svg`);
    process.exitCode = 1;
    continue;
  }

  fs.copyFileSync(source, target);
  console.log(`Copiado: ${name}.svg`);
}