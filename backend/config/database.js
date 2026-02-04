const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Determine database path: env DB_PATH (tablet/packaged) or default under project data/
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../data/cabinet_pm_tablet.db');
console.log('📊 Initializing database at:', dbPath);

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    console.log('📁 Creating data directory:', dataDir);
    fs.mkdirSync(dataDir, { recursive: true });
}

let db;
try {
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ Database connection failed:', err);
            // Log error to file if needed
            fs.writeFileSync(path.join(dataDir, 'error.log'), `${new Date().toISOString()} - DATABASE ERROR: ${err.message}\n`, { flag: 'a' });
            throw err;
        } else {
            console.log('✅ Database connected successfully');
        }
    });
} catch (error) {
    console.error('❌ Critical database error:', error);
    process.exit(1);
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

