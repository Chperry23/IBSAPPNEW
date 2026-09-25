/**
 * Tablet entry: uses backend (routes, db, init) with tablet paths and React build.
 * Set DB_PATH before requiring backend so config/database.js uses tablet DB path.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const isPackaged = typeof process.pkg !== 'undefined';
const appBasePath = isPackaged ? path.dirname(process.execPath) : __dirname;

// ─────────────────────────────────────────────────────────────────────────────
// CRASH REPORT — written SYNCHRONOUSLY so it survives an instant crash.
// The file lives right next to the exe so it's impossible to miss.
// ─────────────────────────────────────────────────────────────────────────────
const crashReportPath = path.join(appBasePath, 'STARTUP-CRASH-REPORT.txt');
const now = new Date();

function stamp(step, detail) {
    const line = `[${new Date().toISOString()}] ${step}${detail ? ': ' + detail : ''}\n`;
    try { fs.appendFileSync(crashReportPath, line); } catch (_) {}
}

function writeCrashHeader() {
    const header = [
        '='.repeat(70),
        '  CABINET PM — STARTUP CRASH REPORT',
        `  Generated: ${now.toLocaleString()}`,
        '='.repeat(70),
        '',
        `  EXE location  : ${process.execPath}`,
        `  Working dir   : ${process.cwd()}`,
        `  App base path : ${appBasePath}`,
        `  Packaged      : ${isPackaged}`,
        `  Node version  : ${process.version}`,
        `  NAPI version  : ${process.versions.napi}`,
        `  Platform      : ${process.platform} ${process.arch}`,
        `  OS            : ${os.type()} ${os.release()}`,
        `  Free RAM      : ${Math.round(os.freemem() / 1024 / 1024)} MB`,
        '',
        'STARTUP LOG:',
        '-'.repeat(70),
        '',
    ].join('\n');
    try { fs.writeFileSync(crashReportPath, header); } catch (_) {}
}

writeCrashHeader();
stamp('STEP 0', 'Crash report initialised — if the app crashes you will see the last step below');

// ─────────────────────────────────────────────────────────────────────────────
// Timestamped log file (rolled per run)
// ─────────────────────────────────────────────────────────────────────────────
const logsDir = path.join(appBasePath, 'logs');
try { if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true }); } catch (_) {}

const logFileName = `cabinet-pm-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}.log`;
const logFilePath  = path.join(logsDir, logFileName);
const latestLogPath = path.join(logsDir, 'latest.log');

// Use synchronous writes so nothing is lost on crash
function writeToLog(level, args) {
    try {
        const msg = args.map(a => {
            if (a instanceof Error) return `${a.message}\n${a.stack}`;
            if (a && typeof a === 'object') { try { return JSON.stringify(a, null, 2); } catch (_) { return String(a); } }
            return String(a);
        }).join(' ');
        const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
        fs.appendFileSync(logFilePath, line);
        // Also mirror into the crash report so there's one place to look
        fs.appendFileSync(crashReportPath, line);
    } catch (_) {}
}

const origLog   = console.log.bind(console);
const origError = console.error.bind(console);
const origWarn  = console.warn.bind(console);

console.log   = (...a) => { origLog(...a);   writeToLog('LOG',   a); };
console.error = (...a) => { origError(...a); writeToLog('ERROR', a); };
console.warn  = (...a) => { origWarn(...a);  writeToLog('WARN',  a); };

// ─────────────────────────────────────────────────────────────────────────────
// Unhandled error hooks — write to crash report before exiting
// ─────────────────────────────────────────────────────────────────────────────
function fatal(label, err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error(`\n${'!'.repeat(70)}`);
    console.error(`FATAL — ${label}`);
    console.error(msg);
    console.error('!'.repeat(70));
    stamp(`FATAL — ${label}`, msg);
    stamp('CRASH REPORT COMPLETE', `See also: ${logFilePath}`);
    try { fs.copyFileSync(logFilePath, latestLogPath); } catch (_) {}

    // Also try writing to Desktop so it's dead easy to find
    try {
        const desktop = path.join(os.homedir(), 'Desktop', 'CabinetPM-CRASH.txt');
        fs.copyFileSync(crashReportPath, desktop);
    } catch (_) {}

    if (isPackaged && process.platform === 'win32') {
        try {
            const { spawn } = require('child_process');
            const text = 'Cabinet PM could not start. Details are in STARTUP-CRASH-REPORT.txt next to the program.';
            spawn('powershell.exe', [
                '-NoProfile',
                '-WindowStyle', 'Hidden',
                '-Command',
                `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${text}','Cabinet PM')`,
            ], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } catch (_) {}
    }
    process.exit(1);
}

process.on('uncaughtException',  (err)    => fatal('Uncaught exception',     err));
process.on('unhandledRejection', (reason) => fatal('Unhandled promise rejection', reason));

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Environment diagnostics
// ─────────────────────────────────────────────────────────────────────────────
stamp('STEP 1', 'Running environment diagnostics');

const { loadCabinetPmEnv } = require('./backend/utils/cabinet-pm-env');
const cabinetEnv = loadCabinetPmEnv(appBasePath);
if (cabinetEnv.loaded.length) {
  stamp(
    'STEP 1',
    `cabinet-pm.env loaded (${cabinetEnv.loaded.length} file(s)); update URL ${process.env.CABINET_PM_UPDATE_URL ? 'set' : 'not set'}`
  );
}

// Packaged: DB under %APPDATA%\CabinetPM (survives installer upgrades).
// Dev: ./data. Legacy <exeDir>/data is migrated once if AppData is empty.
const { prepareTabletDatabase } = require('./backend/utils/tablet-paths');
const tabletDb = prepareTabletDatabase();
const dataDir = tabletDb.userDataDir;
const dbPath = tabletDb.dbPath;
const reactBuildPath = path.join(appBasePath, 'frontend-react', 'dist');

console.log('='.repeat(60));
console.log('  ECI Cabinet PM — Starting Up');
console.log('='.repeat(60));
console.log(`  Packaged      : ${isPackaged}`);
console.log(`  Node version  : ${process.version}  (NAPI ${process.versions.napi})`);
console.log(`  Exe location  : ${process.execPath}`);
console.log(`  Base path     : ${appBasePath}`);
console.log(`  User data     : ${dataDir}`);
console.log(`  DB path       : ${dbPath}`);
if (tabletDb.migration?.migrated) {
  console.log(`  DB migrated   : from ${tabletDb.migration.from}`);
}
console.log(`  React build   : ${reactBuildPath}`);
console.log(`  Crash report  : ${crashReportPath}`);
console.log(`  Log file      : ${logFilePath}`);
console.log('');
stamp('STEP 1', `DB path ${dbPath}${tabletDb.migration?.migrated ? ' (migrated from legacy data/)' : ''}`);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Check required folders / files
// ─────────────────────────────────────────────────────────────────────────────
stamp('STEP 2', 'Checking required files and folders');
console.log('Checking required files...');

const checks = [
    { label: 'data/ directory',           path: dataDir,                             required: false },
    { label: 'frontend-react/dist/',      path: reactBuildPath,                      required: true  },
    { label: 'frontend index.html',       path: path.join(reactBuildPath, 'index.html'), required: true },
    { label: 'backend/ directory',        path: path.join(appBasePath, 'backend'),   required: true  },
    { label: 'backend/server.js',         path: path.join(appBasePath, 'backend', 'server.js'), required: true },
    { label: 'node_modules/sqlite3/',     path: path.join(appBasePath, 'node_modules', 'sqlite3'), required: true },
];

let anyMissing = false;
for (const c of checks) {
    const exists = fs.existsSync(c.path);
    const status = exists ? '✅ FOUND  ' : (c.required ? '❌ MISSING' : '-- absent ');
    console.log(`  ${status} — ${c.label}`);
    console.log(`            ${c.path}`);
    if (!exists && c.required) {
        anyMissing = true;
        stamp(`MISSING REQUIRED FILE`, `${c.label} — ${c.path}`);
    }
}

// Scan for the actual sqlite3 native binding (don't assume the folder name)
const sqlite3BindingDir = path.join(appBasePath, 'node_modules', 'sqlite3', 'lib', 'binding');
console.log('');
console.log('Scanning sqlite3 native bindings...');
if (fs.existsSync(sqlite3BindingDir)) {
    const bindingFolders = fs.readdirSync(sqlite3BindingDir);
    if (bindingFolders.length === 0) {
        console.error('  ❌ sqlite3/lib/binding/ is EMPTY — native module missing!');
        stamp('sqlite3 binding', 'EMPTY — no .node file found');
        anyMissing = true;
    } else {
        bindingFolders.forEach(folder => {
            const nodeFile = path.join(sqlite3BindingDir, folder, 'node_sqlite3.node');
            const exists = fs.existsSync(nodeFile);
            console.log(`  ${exists ? '✅' : '❌'} ${folder}/node_sqlite3.node`);
            stamp('sqlite3 binding found', `${folder} — ${exists ? 'OK' : 'MISSING .node FILE'}`);
        });
    }
} else {
    console.error('  ❌ sqlite3/lib/binding/ directory does NOT exist');
    stamp('sqlite3 binding dir', 'MISSING');
    anyMissing = true;
}
console.log('');

if (anyMissing) {
    fatal('Missing required files — see list above', new Error(
        'One or more required files are missing.\n' +
        'Make sure you extracted the FULL ZIP file and all folders are present.\n' +
        `Check: ${crashReportPath}`
    ));
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Create data directory if needed
// ─────────────────────────────────────────────────────────────────────────────
stamp('STEP 3', 'Creating data directory');
try {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('Created data directory:', dataDir);
    }
} catch (err) {
    fatal('Cannot create data directory', err);
}

process.env.DB_PATH = dbPath;

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Load backend modules
// ─────────────────────────────────────────────────────────────────────────────
stamp('STEP 4', 'Loading backend/server.js');
console.log('Loading backend modules...');

let createApp, db, initializeDatabase;
try {
    const server = require('./backend/server');
    createApp        = server.createApp;
    db               = server.db;
    initializeDatabase = server.initializeDatabase;
    console.log('  ✅ backend/server.js loaded');
    stamp('STEP 4', 'backend/server.js loaded OK');
} catch (err) {
    fatal('Failed to load backend/server.js', err);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Load sync module (optional)
// ─────────────────────────────────────────────────────────────────────────────
stamp('STEP 5', 'Loading sync module');
let setupEnhancedMergeSyncEndpoints;
try {
    setupEnhancedMergeSyncEndpoints = require('./backend/services/enhanced-merge-sync-endpoints');
    console.log('  ✅ Sync module loaded');
    stamp('STEP 5', 'Sync module loaded OK');
} catch (err) {
    console.warn('  ⚠️  Sync module not available:', err.message);
    stamp('STEP 5', `Sync module skipped — ${err.message}`);
    setupEnhancedMergeSyncEndpoints = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Create Express app
// ─────────────────────────────────────────────────────────────────────────────
stamp('STEP 6', 'Creating Express app');
let app;
try {
    ({ app } = createApp({
        appRoot:      appBasePath,
        staticPath:   reactBuildPath,
        catchAllPath: null,
    }));
    console.log('  ✅ Express app created');
    stamp('STEP 6', 'Express app created OK');
} catch (err) {
    fatal('Failed to create Express app', err);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Initialise SQLite database
// ─────────────────────────────────────────────────────────────────────────────
stamp('STEP 7', 'Initialising SQLite database');
console.log('Initialising database...');

const PORT = process.env.PORT || 3000;

initializeDatabase()
    .then(() => {
        stamp('STEP 7', 'Database initialised OK');
        console.log('  ✅ Database ready');

        // ─────────────────────────────────────────────────────────────────────
        // STEP 8 — Register sync endpoints
        // ─────────────────────────────────────────────────────────────────────
        stamp('STEP 8', 'Registering sync endpoints');
        // Tablets default to HTTP sync API on master :3090; set SYNC_USE_LEGACY=1 for direct Mongo only
        if (process.env.SYNC_USE_LEGACY !== '1' && !process.env.SYNC_API_URL) {
            process.env.SYNC_API_URL = 'http://172.16.10.124:3090';
        }
        if (!process.env.CABINET_PM_UPDATE_URL) {
            process.env.CABINET_PM_UPDATE_URL = `${String(process.env.SYNC_API_URL || 'http://172.16.10.124:3090').replace(/\/$/, '')}/tablet-updates`;
        }
        const { getDefaultMongoUri } = require('./backend/utils/mongo-uri');
        const mongoUri = getDefaultMongoUri();
        if (setupEnhancedMergeSyncEndpoints) {
            try {
                setupEnhancedMergeSyncEndpoints(app, db, mongoUri);
                console.log('  ✅ Sync endpoints registered');
                stamp('STEP 8', 'Sync endpoints registered OK');
            } catch (err) {
                console.warn('  ⚠️  Sync endpoints skipped:', err.message);
                stamp('STEP 8', `Sync endpoints skipped — ${err.message}`);
            }
        }

        // Catch-all → serve React (never swallow API/auth endpoints)
        app.get('*', (req, res) => {
            const p = req.path || '';
            if (p.startsWith('/api') || p === '/login' || p === '/logout' || p === '/register') {
                return res.status(404).json({ error: 'Not found' });
            }
            res.sendFile(path.join(reactBuildPath, 'index.html'), (err) => {
                if (err) res.status(500).send('Error loading page');
            });
        });

        // ─────────────────────────────────────────────────────────────────────
        // STEP 9 — Start HTTP server
        // ─────────────────────────────────────────────────────────────────────
        stamp('STEP 9', `Starting HTTP server on port ${PORT}`);
        app.listen(PORT, () => {
            stamp('STARTUP COMPLETE', `Listening on http://localhost:${PORT}`);

            // On success, overwrite crash report with a clean success message
            try {
                fs.writeFileSync(crashReportPath,
                    `Cabinet PM started successfully at ${new Date().toLocaleString()}\n` +
                    `URL: http://localhost:${PORT}\n` +
                    `Log: ${logFilePath}\n`
                );
            } catch (_) {}
            try { fs.copyFileSync(logFilePath, latestLogPath); } catch (_) {}

            console.log('');
            console.log('='.repeat(60));
            console.log(`  ✅ Cabinet PM running on http://localhost:${PORT}`);
            console.log(`  📋 Default login: admin / cabinet123`);
            console.log('='.repeat(60));
            console.log('');

            if (isPackaged) {
                const { exec } = require('child_process');
                exec(`start http://localhost:${PORT}`, () => {});
            }
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                fatal(`Port ${PORT} is already in use`,
                    new Error(`Another program is using port ${PORT}.\nClose it or set the PORT environment variable to a different number.`)
                );
            } else {
                fatal('HTTP server error', err);
            }
        });
    })
    .catch((err) => {
        fatal('Database initialisation failed', err);
    });
