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

for (const f of ['build-info.json', 'cabinet-pm.env', 'Launch-CabinetPM.vbs', 'START-CABINET-PM-EXE.bat', 'DIAGNOSE.bat', 'README-TABLET.txt']) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) copyFile(src, path.join(out, f));
}

// sqlite3 is a native module and cannot live inside the pkg snapshot.
// It must sit next to CabinetPM.exe, with the packages it loads at startup.
const nativeModuleDirs = [
  'node_modules/sqlite3',
  'node_modules/@mapbox',
  'node_modules/node-addon-api',
  'node_modules/detect-libc',
  'node_modules/nopt',
  'node_modules/abbrev',
  'node_modules/semver',
  'node_modules/make-dir',
  'node_modules/npmlog',
  'node_modules/are-we-there-yet',
  'node_modules/console-control-strings',
  'node_modules/gauge',
  'node_modules/set-blocking',
  'node_modules/delegates',
  'node_modules/readable-stream',
  'node_modules/string_decoder',
  'node_modules/safe-buffer',
  'node_modules/util-deprecate',
  'node_modules/inherits',
  'node_modules/has-unicode',
  'node_modules/wide-align',
  'node_modules/string-width',
  'node_modules/strip-ansi',
  'node_modules/ansi-regex',
  'node_modules/is-fullwidth-code-point',
  'node_modules/emoji-regex',
  'node_modules/color-support',
  'node_modules/signal-exit',
  'node_modules/aproba',
  'node_modules/object-assign',
  'node_modules/tar',
  'node_modules/minipass',
  'node_modules/minizlib',
  'node_modules/yallist',
  'node_modules/chownr',
  'node_modules/fs-minipass',
  'node_modules/mkdirp',
  'node_modules/rimraf',
  'node_modules/glob',
  'node_modules/inflight',
  'node_modules/once',
  'node_modules/wrappy',
  'node_modules/balanced-match',
  'node_modules/brace-expansion',
  'node_modules/minimatch',
  'node_modules/fs.realpath',
  'node_modules/node-fetch',
  'node_modules/whatwg-url',
  'node_modules/tr46',
  'node_modules/webidl-conversions',
  'node_modules/https-proxy-agent',
  'node_modules/agent-base',
  'node_modules/debug',
  'node_modules/ms',
];
if (!fs.existsSync(path.join(root, 'node_modules', 'sqlite3', 'lib', 'binding'))) {
  console.error('Missing node_modules/sqlite3 native binding — run npm install');
  process.exit(1);
}
for (const rel of nativeModuleDirs) {
  copyDir(path.join(root, rel), path.join(out, rel));
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
