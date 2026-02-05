const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const db = require('./config/database');
const { initializeDatabase } = require('./config/init-db');
const requireAuth = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const sessionRoutes = require('./routes/sessions');
const cabinetRoutes = require('./routes/cabinets');
const nodeRoutes = require('./routes/nodes');
const nodeMaintenanceRoutes = require('./routes/nodeMaintenance');
const nodeTrackerRoutes = require('./routes/nodeTracker');
const diagnosticsRoutes = require('./routes/diagnostics');
const pmNotesRoutes = require('./routes/pmNotes');
const iiDocumentsRoutes = require('./routes/iiDocuments');
const systemRegistryRoutes = require('./routes/systemRegistry');

const PORT = process.env.PORT || 3000;

/**
 * Create Express app (shared by backend and tablet entry).
 * @param {Object} options
 * @param {string} [options.staticPath] - Directory for express.static (default: appRoot/frontend/public)
 * @param {string} [options.catchAllPath] - Path to index.html for SPA catch-all (e.g. React build). If set, /dashboard and /sync are omitted (React handles them).
 * @param {string} [options.appRoot] - App root for resolving paths (default: backend parent dir)
 */
function createApp(options = {}) {
  const isPackaged = typeof process.pkg !== 'undefined';
  const appRoot = options.appRoot != null
    ? options.appRoot
    : (isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..'));
  const staticPath = options.staticPath || path.join(appRoot, 'frontend', 'public');
  const catchAllPath = options.catchAllPath || null;

  const app = express();

  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  app.use(session({
    secret: 'cabinet-pm-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
  }));

  app.use(express.static(staticPath));
  if (staticPath !== path.join(appRoot, 'frontend', 'public')) {
    app.use('/assets', express.static(path.join(staticPath, 'assets')));
  } else {
    app.use('/assets', express.static(path.join(staticPath, 'assets')));
  }

  app.use('/', authRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/cabinets', cabinetRoutes);
  app.use('/', nodeRoutes);
  app.use('/api/sessions', nodeMaintenanceRoutes);
  app.use('/api/sessions', nodeTrackerRoutes);
  app.use('/api/sessions', diagnosticsRoutes);
  app.use('/api/sessions', pmNotesRoutes);
  app.use('/', iiDocumentsRoutes);
  app.use('/', systemRegistryRoutes);

  if (!catchAllPath) {
    app.get('/dashboard', requireAuth, (req, res) => {
      res.sendFile(path.join(staticPath, 'dashboard.html'));
    });
    app.get('/sync', requireAuth, (req, res) => {
      res.sendFile(path.join(staticPath, 'mongo-sync.html'));
    });
  }

  app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
    try {
      const stats = await db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM customers) as total_customers,
          (SELECT COUNT(*) FROM sessions WHERE (deleted IS NULL OR deleted = 0)) as total_sessions,
          (SELECT COUNT(*) FROM sessions WHERE status = 'completed' AND (deleted IS NULL OR deleted = 0)) as completed_sessions,
          (SELECT COUNT(*) FROM cabinets WHERE (deleted IS NULL OR deleted = 0)) as total_cabinets
      `).get();
      res.json(stats);
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.use((err, req, res, next) => {
    console.error('❌ Error:', err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
  });

  if (catchAllPath) {
    app.get('*', (req, res) => {
      res.sendFile(catchAllPath, (err) => {
        if (err) res.status(500).send('Error loading page');
      });
    });
  }

  return { app, db };
}

// Run when this file is executed directly (e.g. node backend/server.js)
if (require.main === module) {
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

  console.log('🚀 Starting Cabinet PM Server...');
  const isPackaged = typeof process.pkg !== 'undefined';
  const appRoot = isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
  const { app } = createApp({ appRoot });

  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log('🔑 Default login: admin / cabinet123');
        if (isPackaged) {
          const { exec } = require('child_process');
          exec(`start http://localhost:${PORT}`, () => {});
        }
      });
    })
    .catch((err) => {
      console.error('❌ Failed to initialize database:', err);
      process.exit(1);
    });
}

module.exports = { createApp, db, initializeDatabase };
