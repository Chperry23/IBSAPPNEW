/**
 * Stage files for Inno Setup into dist/installer-payload.
 * Run after: npm run build:frontend && npm run build:exe && npm run build:info
 *
 *   node scripts/stage-installer-payload.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist', 'installer-payload');

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

rmrf(out);
fs.mkdirSync(out, { recursive: true });

const exe = path.join(root, 'dist', 'CabinetPM.exe');
if (!fs.existsSync(exe)) {
  console.error('Missing dist/CabinetPM.exe — run npm run build:exe first');
  process.exit(1);
}
copyFile(exe, path.join(out, 'CabinetPM.exe'));

for (const f of ['build-info.json', 'START-CABINET-PM-EXE.bat', 'DIAGNOSE.bat', 'README-TABLET.txt']) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) copyFile(src, path.join(out, f));
}

copyDir(path.join(root, 'backend'), path.join(out, 'backend'));
copyDir(path.join(root, 'frontend-react', 'dist'), path.join(out, 'frontend-react', 'dist'));

// Empty data placeholder — live DB is AppData; do not ship tablet DBs
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(out, 'data', 'README.txt'),
  'Live database is stored in %APPDATA%\\CabinetPM\\ — not in this folder.\n',
  'utf8'
);

console.log('Staged installer payload at', out);
console.log('Next: ISCC.exe installer\\cabinet-pm.iss');
