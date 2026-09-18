/**
 * Tablet data / DB path helpers.
 * Packaged builds keep the SQLite DB under %APPDATA%\CabinetPM so installers
 * can replace Program Files without wiping field data.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_NAME = 'cabinet_pm_tablet.db';
const APP_FOLDER = 'CabinetPM';

function isPackaged() {
  return typeof process.pkg !== 'undefined';
}

function appBasePath() {
  return isPackaged() ? path.dirname(process.execPath) : path.resolve(__dirname, '../..');
}

/** User-writable data root (AppData on packaged Windows; ./data in dev). */
function resolveUserDataDir() {
  if (process.env.CABINET_PM_DATA_DIR) {
    return path.resolve(process.env.CABINET_PM_DATA_DIR);
  }
  if (isPackaged() && process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, APP_FOLDER);
  }
  if (isPackaged()) {
    return path.join(os.homedir(), '.cabinet-pm');
  }
  return path.join(appBasePath(), 'data');
}

function resolveDbPath() {
  if (process.env.DB_PATH) return path.resolve(process.env.DB_PATH);
  return path.join(resolveUserDataDir(), DB_NAME);
}

/**
 * One-time migrate from legacy `<exeDir>/data/cabinet_pm_tablet.db` into AppData.
 * Copies db + wal/shm if present. Never overwrites an existing AppData DB.
 */
function migrateLegacyDbIfNeeded(userDataDir = resolveUserDataDir()) {
  const destDb = path.join(userDataDir, DB_NAME);
  if (fs.existsSync(destDb)) {
    return { migrated: false, reason: 'appdata-exists', destDb };
  }

  const legacyDir = path.join(appBasePath(), 'data');
  const legacyDb = path.join(legacyDir, DB_NAME);
  if (!fs.existsSync(legacyDb)) {
    return { migrated: false, reason: 'no-legacy', destDb };
  }

  fs.mkdirSync(userDataDir, { recursive: true });
  const siblings = [DB_NAME, `${DB_NAME}-wal`, `${DB_NAME}-shm`];
  for (const name of siblings) {
    const src = path.join(legacyDir, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(userDataDir, name));
    }
  }

  // Marker so techs know the old folder is leftover, not the live DB
  try {
    fs.writeFileSync(
      path.join(legacyDir, 'MOVED-TO-APPDATA.txt'),
      [
        'Cabinet PM database was migrated to AppData.',
        `Live DB: ${destDb}`,
        'Do not copy this folder when updating the app — updates replace program files only.',
        new Date().toISOString(),
        '',
      ].join('\n'),
      'utf8'
    );
  } catch (_) {
    /* ignore */
  }

  return { migrated: true, from: legacyDb, destDb };
}

/**
 * Ensure user data dir exists, migrate legacy DB if needed, return paths.
 * Call before setting process.env.DB_PATH and requiring the backend.
 */
function prepareTabletDatabase() {
  const userDataDir = resolveUserDataDir();
  fs.mkdirSync(userDataDir, { recursive: true });
  const migration = migrateLegacyDbIfNeeded(userDataDir);
  const dbPath = resolveDbPath();
  return { userDataDir, dbPath, migration, appBasePath: appBasePath(), packaged: isPackaged() };
}

module.exports = {
  DB_NAME,
  APP_FOLDER,
  isPackaged,
  appBasePath,
  resolveUserDataDir,
  resolveDbPath,
  migrateLegacyDbIfNeeded,
  prepareTabletDatabase,
};
