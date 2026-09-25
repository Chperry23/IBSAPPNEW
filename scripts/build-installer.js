/**
 * Stage the installer payload and compile installer/cabinet-pm.iss with Inno Setup.
 *
 *   node scripts/build-installer.js
 *
 * Looks for ISCC.exe via INNO_SETUP_PATH, then the default Inno Setup 6 install folders.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function appVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return String(pkg.version || '0.0.0');
}

function findIscc() {
  const localApp = process.env.LOCALAPPDATA || '';
  const candidates = [
    process.env.INNO_SETUP_PATH,
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    localApp && path.join(localApp, 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

execFileSync(process.execPath, [path.join(root, 'scripts', 'stage-installer-payload.js')], {
  stdio: 'inherit',
  cwd: root,
});

const version = appVersion();
const iscc = findIscc();
const script = path.join(root, 'installer', 'cabinet-pm.iss');

if (!iscc) {
  console.log('');
  console.log('Inno Setup compiler (ISCC.exe) was not found.');
  console.log('Install Inno Setup 6, or set INNO_SETUP_PATH to ISCC.exe, then run:');
  console.log(`  ISCC.exe /DMyAppVersion=${version} installer\\cabinet-pm.iss`);
  process.exit(0);
}

console.log('Compiling installer with', iscc);
execFileSync(iscc, [`/DMyAppVersion=${version}`, script], { stdio: 'inherit', cwd: root });
console.log('Installer output: dist/installer/');
