/**
 * Load KEY=value from cabinet-pm.env into process.env.
 * Never commit cabinet-pm.env. Existing process.env values win over files.
 * AppData file overrides the copy beside the exe (survives installer upgrades).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function parseEnvFile(file) {
  if (!file || !fs.existsSync(file)) return null;
  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[line.slice(0, eq).trim()] = value;
  }
  return env;
}

function candidateFiles(appBasePath) {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return [
    path.join(appBasePath, 'cabinet-pm.env'),
    path.join(appData, 'CabinetPM', 'cabinet-pm.env'),
  ];
}

/**
 * @param {string} appBasePath repo root in dev, exe directory when packaged
 * @returns {{ loaded: string[], keys: string[] }}
 */
function loadCabinetPmEnv(appBasePath) {
  const fromFiles = new Set();
  const loaded = [];
  for (const file of candidateFiles(appBasePath)) {
    const parsed = parseEnvFile(file);
    if (!parsed) continue;
    loaded.push(file);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] && !fromFiles.has(key)) continue;
      process.env[key] = value;
      fromFiles.add(key);
    }
  }
  return { loaded, keys: [...fromFiles] };
}

module.exports = {
  loadCabinetPmEnv,
  parseEnvFile,
  candidateFiles,
};
