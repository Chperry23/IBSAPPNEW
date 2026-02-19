/**
 * Tablet entry: uses backend (routes, db, init) with tablet paths and React build.
 * Set DB_PATH before requiring backend so config/database.js uses tablet DB path.
 */
const path = require('path');
const fs = require('fs');

const isPackaged = typeof process.pkg !== 'undefined';
const appBasePath = isPackaged ? path.dirname(process.execPath) : __dirname;

// --- File Logging: capture ALL console output to logs/ folder ---
const logsDir = path.join(appBasePath, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const now = new Date();
const logFileName = `cabinet-pm-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}.log`;
const logFilePath = path.join(logsDir, logFileName);
const latestLogPath = path.join(logsDir, 'latest.log');

let logStream;
try {
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
} catch (e) {
    // If we can't create the log stream, continue without file logging
}

function writeToLog(level, args) {
    if (!logStream) return;
    try {
        const timestamp = new Date().toISOString();
        const message = args.map(a => {
            if (a instanceof Error) return `${a.message}\n${a.stack}`;
            if (typeof a === 'object') { try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); } }
            return String(a);
        }).join(' ');
        logStream.write(`[${timestamp}] [${level}] ${message}\n`);
    } catch (e) { /* ignore logging errors */ }
}

const origLog = console.log.bind(console);
const origError = console.error.bind(console);
const origWarn = console.warn.bind(console);

console.log = function(...args) { origLog(...args); writeToLog('LOG', args); };
console.error = function(...args) { origError(...args); writeToLog('ERROR', args); };
console.warn = function(...args) { origWarn(...args); writeToLog('WARN', args); };

console.log(`Logging to: ${logFilePath}`);

function waitForKeyThenExit(code) {
    if (logStream) {
        try { logStream.end(); } catch(e) {}
    }
    try {
        fs.copyFileSync(logFilePath, latestLogPath);
    } catch(e) {}

    if (isPackaged) {
        console.log('\n--- Press any key to exit ---');
        try {
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.once('data', () => process.exit(code));
            } else {
                setTimeout(() => process.exit(code), 15000);
            }
        } catch(e) {
            setTimeout(() => process.exit(code), 15000);
        }
    } else {
        process.exit(code);
    }
}

process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error);
    waitForKeyThenExit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

const dataDir = path.join(appBasePath, 'data');
const dbPath = path.join(dataDir, 'cabinet_pm_tablet.db');
const reactBuildPath = path.join(appBasePath, 'frontend-react', 'dist');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

process.env.DB_PATH = dbPath;

console.log('Cabinet PM Tablet Server');
console.log('   Packaged:', isPackaged);
console.log('   Base:', appBasePath);
console.log('   DB:', dbPath);
console.log('   React build:', reactBuildPath);

// Verify critical paths exist before proceeding
if (isPackaged) {
    const sqlite3ExtPath = path.join(appBasePath, 'node_modules', 'sqlite3');
    const bindingPath = path.join(sqlite3ExtPath, 'lib', 'binding', 'napi-v6-win32-unknown-x64', 'node_sqlite3.node');
    console.log('   SQLite3 external module:', fs.existsSync(sqlite3ExtPath) ? 'FOUND' : 'MISSING');
    console.log('   SQLite3 native binding:', fs.existsSync(bindingPath) ? 'FOUND' : 'MISSING');

    if (!fs.existsSync(path.join(reactBuildPath, 'index.html'))) {
        console.error('FATAL: React build not found at:', reactBuildPath);
        console.error('The frontend-react/dist/ folder must be next to the executable.');
        waitForKeyThenExit(1);
    }
}

const PORT = process.env.PORT || 3000;

let createApp, db, initializeDatabase;
try {
    const server = require('./backend/server');
    createApp = server.createApp;
    db = server.db;
    initializeDatabase = server.initializeDatabase;
    console.log('Backend modules loaded successfully');
} catch (err) {
    console.error('FATAL: Failed to load backend modules:', err);
    waitForKeyThenExit(1);
    // Unreachable, but prevents linter warnings
    throw err;
}

let setupEnhancedMergeSyncEndpoints;
try {
    setupEnhancedMergeSyncEndpoints = require('./backend/services/enhanced-merge-sync-endpoints');
} catch (err) {
    console.warn('Enhanced Merge Sync module not available:', err.message);
    setupEnhancedMergeSyncEndpoints = null;
}

const { app } = createApp({
  appRoot: appBasePath,
  staticPath: reactBuildPath,
  catchAllPath: null,
});

initializeDatabase()
  .then(() => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';
    if (setupEnhancedMergeSyncEndpoints) {
      try {
        setupEnhancedMergeSyncEndpoints(app, db, mongoUri);
        console.log('Enhanced Merge Replication endpoints added');
      } catch (err) {
        console.warn('Enhanced Merge Sync not available:', err.message);
      }
    }

    app.get('*', (req, res) => {
      res.sendFile(path.join(reactBuildPath, 'index.html'), (err) => {
        if (err) res.status(500).send('Error loading page');
      });
    });

    app.listen(PORT, () => {
      console.log(`Cabinet PM Tablet running on http://localhost:${PORT}`);
      console.log('Default login: admin / cabinet123');
      if (isPackaged) {
        const { exec } = require('child_process');
        exec(`start http://localhost:${PORT}`, () => {});
      }
    });
  })
  .catch((err) => {
    console.error('Database init failed:', err);
    waitForKeyThenExit(1);
  });
