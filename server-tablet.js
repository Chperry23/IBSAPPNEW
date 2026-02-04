/**
 * Tablet entry: uses backend (routes, db, init) with tablet paths and React build.
 * Set DB_PATH before requiring backend so config/database.js uses tablet DB path.
 */
const path = require('path');
const fs = require('fs');

process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION:', error);
    try {
        fs.writeFileSync('error.log', `${new Date().toISOString()} - UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n`, { flag: 'a' });
  } catch (e) {}
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
    try {
        fs.writeFileSync('error.log', `${new Date().toISOString()} - UNHANDLED REJECTION: ${reason}\n`, { flag: 'a' });
  } catch (e) {}
});

const isPackaged = typeof process.pkg !== 'undefined';
const appBasePath = isPackaged ? path.dirname(process.execPath) : __dirname;
const dataDir = path.join(appBasePath, 'data');
const dbPath = path.join(dataDir, 'cabinet_pm_tablet.db');
const reactBuildPath = path.join(appBasePath, 'frontend-react', 'dist');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

process.env.DB_PATH = dbPath;

console.log('🚀 Cabinet PM Tablet Server');
console.log('   Packaged:', isPackaged);
console.log('   Base:', appBasePath);
console.log('   DB:', dbPath);
console.log('   React build:', reactBuildPath);

const PORT = process.env.PORT || 3000;
const { createApp, db, initializeDatabase } = require('./backend/server');
const setupEnhancedMergeSyncEndpoints = require('./backend/services/enhanced-merge-sync-endpoints');

const { app } = createApp({
  appRoot: appBasePath,
  staticPath: reactBuildPath,
  catchAllPath: null,
});

initializeDatabase()
  .then(() => {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';
    try {
      setupEnhancedMergeSyncEndpoints(app, db, mongoUri);
      console.log('✅ Enhanced Merge Replication endpoints added');
    } catch (err) {
      console.log('❌ Enhanced Merge Sync not available:', err.message);
    }

    app.get('*', (req, res) => {
      res.sendFile(path.join(reactBuildPath, 'index.html'), (err) => {
        if (err) res.status(500).send('Error loading page');
      });
    });

        app.listen(PORT, () => {
      console.log(`🚀 Cabinet PM Tablet running on http://localhost:${PORT}`);
            console.log('🔑 Default login: admin / cabinet123');
      if (isPackaged) {
        const { exec } = require('child_process');
        exec(`start http://localhost:${PORT}`, () => {});
      }
    });
  })
  .catch((err) => {
    console.error('❌ Database init failed:', err);
    process.exit(1);
  });
