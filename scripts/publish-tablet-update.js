/**
 * Publish version.json + the setup exe to an update folder (UNC, local, or a GitHub asset folder).
 *
 *   node scripts/publish-tablet-update.js --out \\server\share\CabinetPM\updates
 *   node scripts/publish-tablet-update.js --out ./dist/release-feed --notes "Bug fixes"
 *   node scripts/publish-tablet-update.js --out ./dist/release-feed --installer-url https://github.com/.../CabinetPM-Setup-2.0.2.exe
 *
 * Tablets point CABINET_PM_UPDATE_URL at --out (the folder, not version.json).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] || null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function newestSetupExe() {
  const dir = path.join(root, 'dist', 'installer');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((n) => /^CabinetPM-Setup-.*\.exe$/i.test(n))
    .map((n) => {
      const full = path.join(dir, n);
      return { full, name: n, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

const out = arg('--out');
if (!out) {
  console.error('Usage: node scripts/publish-tablet-update.js --out <folder> [--notes "..."] [--installer-url <https-or-filename>]');
  process.exit(1);
}

const pkg = readJson(path.join(root, 'package.json'));
let buildInfo = { version: pkg.version, buildId: pkg.version, buildDate: new Date().toISOString() };
const infoPath = path.join(root, 'build-info.json');
if (fs.existsSync(infoPath)) {
  buildInfo = { ...buildInfo, ...readJson(infoPath) };
}

const setup = newestSetupExe();
const explicitInstaller = arg('--installer');
const installerPath = explicitInstaller || setup?.full || null;
if (!installerPath || !fs.existsSync(installerPath)) {
  console.error('No installer found. Build one first (npm run build:installer) or pass --installer <path>.');
  process.exit(1);
}

const fileName = path.basename(installerPath);
const destDir = path.resolve(out);
fs.mkdirSync(destDir, { recursive: true });
const destExe = path.join(destDir, fileName);
if (path.resolve(installerPath) !== path.resolve(destExe)) {
  fs.copyFileSync(installerPath, destExe);
}

const installerUrl = arg('--installer-url') || fileName;
const feed = {
  version: buildInfo.version || pkg.version,
  buildId: buildInfo.buildId || pkg.version,
  buildDate: buildInfo.buildDate || new Date().toISOString(),
  notes: arg('--notes') || `Cabinet PM ${buildInfo.version || pkg.version}`,
  installerUrl,
  minSchemaSafe: true,
};

fs.writeFileSync(path.join(destDir, 'version.json'), JSON.stringify(feed, null, 2) + '\n', 'utf8');
console.log('Published update feed:');
console.log('  folder   ', destDir);
console.log('  version  ', feed.version, feed.buildId);
console.log('  installer', fileName);
console.log('  feed URL ', installerUrl);
console.log('Point tablets at this folder with CABINET_PM_UPDATE_URL (see docs/tablet-updates.md).');
