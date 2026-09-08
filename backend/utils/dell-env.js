/**
 * Load KEY=value from DELL.env (repo root). Never commit that file.
 */
const fs = require('fs');
const path = require('path');

let cached = null;
let cachedMtime = null;

function envPath() {
  return process.env.DELL_ENV_PATH || path.resolve(__dirname, '../../DELL.env');
}

function loadDellEnv(force = false) {
  const file = envPath();
  if (!fs.existsSync(file)) {
    cached = {};
    return cached;
  }
  const mtime = fs.statSync(file).mtimeMs;
  if (!force && cached && cachedMtime === mtime) return cached;

  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  cached = env;
  cachedMtime = mtime;
  return env;
}

module.exports = { loadDellEnv, envPath };
