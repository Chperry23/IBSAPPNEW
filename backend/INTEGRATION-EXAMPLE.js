// INTEGRATION EXAMPLE
// How to add Enhanced Merge Replication to your existing server

const express = require('express');
const db = require('./config/database');
const setupEnhancedMergeSyncEndpoints = require('./services/enhanced-merge-sync-endpoints');

// Your MongoDB connection string
// IMPORTANT: Get this from environment variables in production!
const MONGO_CONNECTION_STRING = process.env.MONGODB_URI || 'mongodb://localhost:27017/cabinet_pm';

// =============================================================================
// OPTION 1: Add to existing server.js
// =============================================================================

// In your server.js file, add these lines:

/*
const setupEnhancedMergeSyncEndpoints = require('./services/enhanced-merge-sync-endpoints');

// After creating your Express app and before app.listen()
setupEnhancedMergeSyncEndpoints(app, db, MONGO_CONNECTION_STRING);
*/

// =============================================================================
// OPTION 2: Complete working example
// =============================================================================

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Your existing routes
app.get('/', (req, res) => {
  res.send('Cabinet PM Server');
});

// Add all your existing routes here...
// app.use('/api/sessions', sessionsRouter);
// app.use('/api/customers', customersRouter);
// etc.

// ✅ ADD ENHANCED MERGE REPLICATION ENDPOINTS
setupEnhancedMergeSyncEndpoints(app, db, MONGO_CONNECTION_STRING);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔄 Enhanced Merge Replication enabled`);
});

// =============================================================================
// OPTION 3: Using in code (programmatic sync)
// =============================================================================

const EnhancedMergeReplication = require('./services/enhanced-merge-replication');

async function performSyncExample() {
  const syncManager = new EnhancedMergeReplication(db, MONGO_CONNECTION_STRING);
  
  // Set conflict strategy
  syncManager.conflictStrategy = 'latest_wins';
  
  // Perform full sync
  const result = await syncManager.performFullMergeSync();
  
  if (result.success) {
    console.log(`✅ Sync complete!`);
    console.log(`   Pulled: ${result.totalPulled} records`);
    console.log(`   Pushed: ${result.totalPushed} records`);
    console.log(`   Conflicts: ${result.totalConflicts}`);
  } else {
    console.error('❌ Sync failed:', result.error);
  }
}

// =============================================================================
// OPTION 4: Using UUID helper in your controllers
// =============================================================================

const uuidHelper = require('./utils/uuid-helper');

// Example: Creating a new session
async function createSession(req, res) {
  const { customer_id, user_id, session_name } = req.body;
  
  // Get device ID from sync_metadata
  const deviceId = db.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(['device_id']).value;
  
  // Prepare new record with all sync fields
  const newSession = uuidHelper.prepareNewRecord({
    id: uuidHelper.generateUUID(), // Generate UUID for ID
    customer_id,
    user_id,
    session_name,
    session_type: 'pm',
    status: 'active'
  }, deviceId);
  
  // Insert into database
  db.prepare(`
    INSERT INTO sessions (
      id, customer_id, user_id, session_name, session_type, status,
      uuid, device_id, synced, deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newSession.id,
    newSession.customer_id,
    newSession.user_id,
    newSession.session_name,
    newSession.session_type,
    newSession.status,
    newSession.uuid,
    newSession.device_id,
    newSession.synced,
    newSession.deleted,
    newSession.created_at,
    newSession.updated_at
  );
  
  res.json({
    success: true,
    message: 'Session created',
    data: newSession
  });
}

// Example: Updating a session
async function updateSession(req, res) {
  const { id } = req.params;
  const { session_name } = req.body;
  
  // Update with sync flags
  db.prepare(`
    UPDATE sessions 
    SET session_name = ?,
        synced = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(session_name, id);
  
  res.json({
    success: true,
    message: 'Session updated (marked for sync)'
  });
}

// Example: Soft deleting a session
async function deleteSession(req, res) {
  const { id } = req.params;
  
  // Soft delete (mark as deleted, not remove)
  db.prepare(`
    UPDATE sessions 
    SET deleted = 1,
        synced = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
  
  res.json({
    success: true,
    message: 'Session deleted (marked for sync)'
  });
}

// =============================================================================
// OPTION 5: Running migration on server startup
// =============================================================================

const SyncMigrationUtility = require('./services/sync-migration-utility');

async function ensureDatabaseReady() {
  const migrationUtility = new SyncMigrationUtility(db);
  
  // Check if migration is needed
  const status = await migrationUtility.checkMigrationStatus();
  
  if (!status.readyForSync) {
    console.log('⚠️  Database not ready for sync, running migration...');
    const result = await migrationUtility.runFullMigration();
    
    if (result.success) {
      console.log('✅ Migration complete, database ready');
    } else {
      console.error('❌ Migration failed:', result.error);
      process.exit(1);
    }
  } else {
    console.log('✅ Database already ready for sync');
  }
}

// Call this before starting the server
// ensureDatabaseReady().then(() => {
//   app.listen(PORT, () => console.log('Server started'));
// });

// =============================================================================
// OPTION 6: Scheduled auto-sync (every hour)
// =============================================================================

const EnhancedMergeReplicationScheduled = require('./services/enhanced-merge-replication');

function setupAutoSync(intervalMinutes = 60) {
  const syncManager = new EnhancedMergeReplicationScheduled(db, MONGO_CONNECTION_STRING);
  
  const intervalMs = intervalMinutes * 60 * 1000;
  
  setInterval(async () => {
    console.log('🔄 Running scheduled sync...');
    
    try {
      const result = await syncManager.performFullMergeSync();
      
      if (result.success) {
        console.log(`✅ Scheduled sync complete: ${result.totalPulled} pulled, ${result.totalPushed} pushed`);
      } else {
        console.error(`❌ Scheduled sync failed: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Scheduled sync error:', error);
    }
  }, intervalMs);
  
  console.log(`⏰ Auto-sync scheduled every ${intervalMinutes} minutes`);
}

// Enable auto-sync
// setupAutoSync(60); // Every hour

// =============================================================================
// OPTION 7: Frontend sync button integration
// =============================================================================

// Add this to your frontend JavaScript:
/*

// Sync button handler
document.getElementById('sync-button').addEventListener('click', async () => {
  const statusDiv = document.getElementById('sync-status');
  statusDiv.textContent = 'Syncing...';
  
  try {
    const response = await fetch('/api/sync/enhanced-merge/full', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (result.success) {
      statusDiv.textContent = `✅ Sync complete: ${result.data.pulled} pulled, ${result.data.pushed} pushed`;
      
      if (result.data.conflicts > 0) {
        statusDiv.textContent += ` (${result.data.conflicts} conflicts resolved)`;
      }
    } else {
      statusDiv.textContent = `❌ Sync failed: ${result.error}`;
    }
  } catch (error) {
    statusDiv.textContent = `❌ Sync error: ${error.message}`;
  }
});

// Check sync status on page load
async function checkSyncStatus() {
  try {
    const response = await fetch('/api/sync/enhanced-merge/status');
    const result = await response.json();
    
    if (result.success) {
      const status = result.data;
      
      // Calculate total unsynced
      const totalUnsynced = Object.values(status.unsyncedCounts).reduce((sum, count) => sum + count, 0);
      
      const statusBadge = document.getElementById('sync-badge');
      if (totalUnsynced > 0) {
        statusBadge.textContent = `${totalUnsynced} unsynced`;
        statusBadge.className = 'badge badge-warning';
      } else {
        statusBadge.textContent = 'All synced';
        statusBadge.className = 'badge badge-success';
      }
    }
  } catch (error) {
    console.error('Failed to check sync status:', error);
  }
}

// Check status every 30 seconds
checkSyncStatus();
setInterval(checkSyncStatus, 30000);

*/

// =============================================================================
// EXPORT FOR USE IN OTHER FILES
// =============================================================================

module.exports = {
  setupEnhancedMergeSyncEndpoints,
  performSyncExample,
  createSession,
  updateSession,
  deleteSession,
  ensureDatabaseReady,
  setupAutoSync
};

