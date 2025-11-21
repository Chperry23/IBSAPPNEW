const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Config
const db = require('./config/database');
const { initializeDatabase } = require('./config/init-db');

// Middleware
const requireAuth = require('./middleware/auth');

// Utils
const { findChrome } = require('./utils/pdf');

// Routes Imports
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

// Add comprehensive error handling for executable
process.on('uncaughtException', (error) => {
    console.error('❌ UNCAUGHT EXCEPTION:', error);
    console.error('Stack:', error.stack);
    try {
        fs.writeFileSync('error.log', `${new Date().toISOString()} - UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n`, { flag: 'a' });
        console.log('💾 Error logged to error.log');
    } catch (e) {
        console.error('Failed to write error log:', e);
    }
    console.log('🔄 Server will continue running. Press Ctrl+C to exit...');
    console.log('📋 Check error.log for details. Window will stay open for debugging.');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
    try {
        fs.writeFileSync('error.log', `${new Date().toISOString()} - UNHANDLED REJECTION: ${reason}\n`, { flag: 'a' });
        console.log('💾 Error logged to error.log');
    } catch (e) {
        console.error('Failed to write error log:', e);
    }
});

// Log startup information
console.log('🚀 Starting Cabinet PM Tablet Server...');
console.log('📁 Working directory:', process.cwd());
console.log('📁 __dirname:', __dirname);
console.log('📁 Process argv:', process.argv);
console.log('📁 Node version:', process.version);

const app = express();
const PORT = process.env.PORT || 3000;

// Determine if running as packaged executable
const isPackaged = typeof process.pkg !== 'undefined';

// Set up proper paths
const appRoot = isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
const frontendPath = path.join(appRoot, 'frontend');

console.log('🔧 Environment Setup:');
console.log(`   Packaged: ${isPackaged}`);
console.log(`   App Root: ${appRoot}`);
console.log(`   Frontend Path: ${frontendPath}`);

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
  secret: 'cabinet-pm-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
app.use(express.static(path.join(frontendPath, 'public')));
app.use('/assets', express.static(path.join(frontendPath, 'public/assets')));

// Use Routes
app.use('/', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/cabinets', cabinetRoutes);
app.use('/', nodeRoutes); // Node routes have full paths like /api/customers/:customerId/nodes
app.use('/api/sessions', nodeMaintenanceRoutes); // Mount at /api/sessions, routes use /:sessionId/node-maintenance
app.use('/api/sessions', nodeTrackerRoutes); // Mount at /api/sessions, routes use /:sessionId/node-tracker
app.use('/api/sessions', diagnosticsRoutes); // Mount at /api/sessions, routes use /:sessionId/diagnostics
app.use('/api/sessions', pmNotesRoutes); // Mount at /api/sessions, routes use /:sessionId/pm-notes
app.use('/', iiDocumentsRoutes); // II routes have full paths

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(frontendPath, 'public', 'dashboard.html'));
});

// Sync - Default to MongoDB Cloud Sync
app.get('/sync', requireAuth, (req, res) => {
  res.sendFile(path.join(frontendPath, 'public', 'mongo-sync.html'));
});

// NEW: Optimized dashboard statistics endpoint
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    // Get all statistics in one efficient query
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize and start
initializeDatabase().then(() => {
        app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🌐 Open http://localhost:${PORT} in your browser`);
        console.log('💾 Tablet version with SQLite database');
            console.log('🔑 Default login: admin / cabinet123');
      
      // Auto-open browser when running as executable
      if (isPackaged) {
        console.log('🌐 Auto-opening browser...');
        const { exec } = require('child_process');
        exec(`start http://localhost:${PORT}`, (error) => {
          if (error) {
            console.log('⚠️  Could not auto-open browser, please open manually');
          }
        });
      }
    });
}).catch(err => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
});
