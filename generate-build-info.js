#!/usr/bin/env node
/**
 * Generates build-info.json with a unique build ID, version, timestamp, and git info.
 * Called automatically by build scripts; can also be run standalone: node generate-build-info.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

function gitInfo() {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    return { commit, branch, dirty };
  } catch {
    return { commit: 'unknown', branch: 'unknown', dirty: false };
  }
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const dateStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
const timeStamp = `${pad(now.getHours())}${pad(now.getMinutes())}`;

const git = gitInfo();

// Short unique hash: 6 hex chars from timestamp + random bytes
const hash = crypto
  .createHash('sha256')
  .update(`${now.toISOString()}-${crypto.randomBytes(4).toString('hex')}`)
  .digest('hex')
  .slice(0, 6);

const buildId = `${pkg.version}-${dateStamp}.${timeStamp}-${hash}`;

const info = {
  version: pkg.version,
  buildId,
  buildDate: now.toISOString(),
  buildDateHuman: now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  git: {
    commit: git.commit,
    branch: git.branch,
    dirty: git.dirty,
  },
};

const outPath = path.join(__dirname, 'build-info.json');
fs.writeFileSync(outPath, JSON.stringify(info, null, 2));

console.log(`✅ Build info generated: ${buildId}`);
console.log(`   Version : ${info.version}`);
console.log(`   Date    : ${info.buildDateHuman}`);
console.log(`   Git     : ${git.commit} (${git.branch})${git.dirty ? ' [dirty]' : ''}`);
console.log(`   File    : ${outPath}`);

module.exports = info;
