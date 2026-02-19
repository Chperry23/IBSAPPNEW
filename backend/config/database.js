const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../data/cabinet_pm_tablet.db');
console.log('Initializing database at:', dbPath);

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    console.log('Creating data directory:', dataDir);
    fs.mkdirSync(dataDir, { recursive: true });
}

let sqlite3;
try {
    sqlite3 = require('sqlite3').verbose();
    console.log('sqlite3 module loaded successfully');
} catch (error) {
    console.error('FATAL: Failed to load sqlite3 module:', error.message);
    console.error('Stack:', error.stack);

    // Diagnostic info for packaged environments
    const isPackaged = typeof process.pkg !== 'undefined';
    if (isPackaged) {
        const exeDir = path.dirname(process.execPath);
        const extSqlite3 = path.join(exeDir, 'node_modules', 'sqlite3');
        const extBinding = path.join(extSqlite3, 'lib', 'binding', 'napi-v6-win32-unknown-x64', 'node_sqlite3.node');
        const extPreGyp = path.join(exeDir, 'node_modules', '@mapbox', 'node-pre-gyp');
        console.error('Diagnostics (packaged exe):');
        console.error('  Exe directory:', exeDir);
        console.error('  External sqlite3 exists:', fs.existsSync(extSqlite3));
        console.error('  Native binding exists:', fs.existsSync(extBinding));
        console.error('  @mapbox/node-pre-gyp exists:', fs.existsSync(extPreGyp));

        const extNodeModules = path.join(exeDir, 'node_modules');
        if (fs.existsSync(extNodeModules)) {
            try {
                const dirs = fs.readdirSync(extNodeModules);
                console.error('  node_modules contents:', dirs.join(', '));
            } catch(e) {}
        } else {
            console.error('  node_modules folder: MISSING');
        }
    }
    throw error;
}

let db;
try {
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Database connection failed:', err.message);
        } else {
            console.log('Database connected successfully');
        }
    });
} catch (error) {
    console.error('Critical database error:', error.message);
    console.error('Stack:', error.stack);
    throw error;
}

// Create a better-sqlite3 compatible wrapper for easier migration
const originalPrepare = db.prepare;
db.prepare = function(sql) {
  return {
    get: function(params) {
      return new Promise((resolve, reject) => {
        if (params === undefined) {
          db.get(sql, [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        } else if (Array.isArray(params)) {
          db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        } else {
          db.get(sql, [params], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        }
      });
    },
    all: function(params) {
      return new Promise((resolve, reject) => {
        if (params === undefined) {
          db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        } else if (Array.isArray(params)) {
          db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        } else {
          db.all(sql, [params], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        }
      });
    },
    run: function(params) {
      return new Promise((resolve, reject) => {
        if (params === undefined) {
          db.run(sql, [], function(err) {
            if (err) reject(err);
            else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
          });
        } else if (Array.isArray(params)) {
          db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
          });
        } else {
          db.run(sql, [params], function(err) {
            if (err) reject(err);
            else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
          });
        }
      });
    }
  };
};

module.exports = db;

