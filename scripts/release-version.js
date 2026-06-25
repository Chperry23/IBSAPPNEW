#!/usr/bin/env node
/**
 * Bump SemVer in package.json and update CHANGELOG.md [Unreleased] → [X.Y.Z].
 *
 * Usage:
 *   node scripts/release-version.js patch
 *   node scripts/release-version.js minor
 *   node scripts/release-version.js major
 *   node scripts/release-version.js 2.1.0
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const changelogPath = path.join(root, 'CHANGELOG.md');

function parseSemver(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function bump(current, kind) {
  if (['patch', 'minor', 'major'].includes(kind)) {
    const v = parseSemver(current);
    if (kind === 'major') return `${v.major + 1}.0.0`;
    if (kind === 'minor') return `${v.major}.${v.minor + 1}.0`;
    return `${v.major}.${v.minor}.${v.patch + 1}`;
  }
  parseSemver(kind);
  return kind;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function updateChangelog(oldVersion, newVersion) {
  if (!fs.existsSync(changelogPath)) {
    console.warn('No CHANGELOG.md — skipping');
    return;
  }

  let text = fs.readFileSync(changelogPath, 'utf8');
  const date = todayIso();
  const newSection = `## [${newVersion}] - ${date}`;

  const unreleasedRe = /## \[Unreleased\]\r?\n([\s\S]*?)(?=\r?\n## \[)/;
  const match = text.match(unreleasedRe);
  const body = match ? match[1].trimEnd() : '\n### Added\n- \n';

  const freshUnreleased = '## [Unreleased]\n\n### Added\n- \n\n';
  if (match) {
    text = text.replace(unreleasedRe, `${freshUnreleased}${newSection}\n${body}\n\n`);
  } else {
    text = `${freshUnreleased}${newSection}\n${body}\n\n${text}`;
  }

  const compare = 'https://github.com/Chperry23/IBSAPPNEW/compare';
  text = text.replace(/\[Unreleased\]:[^\n]*/g, `[Unreleased]: ${compare}/v${newVersion}...develop`);
  const versionLine = `[${newVersion}]: ${compare}/v${oldVersion}...v${newVersion}`;
  if (!text.includes(`[${newVersion}]:`)) {
    text = text.trimEnd() + `\n${versionLine}\n`;
  }

  fs.writeFileSync(changelogPath, text);
}

const kind = process.argv[2];
if (!kind) {
  console.error('Usage: node scripts/release-version.js <patch|minor|major|X.Y.Z>');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;
let newVersion;
try {
  newVersion = bump(oldVersion, kind);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

pkg.version = newVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
updateChangelog(oldVersion, newVersion);

try {
  require('../generate-build-info.js');
} catch (_) {}

console.log(`✅ Version ${oldVersion} → ${newVersion}`);
console.log('   Updated: package.json, CHANGELOG.md, build-info.json');
console.log(`   Next: git tag -a v${newVersion} -m "v${newVersion}" && git push origin main --tags`);
