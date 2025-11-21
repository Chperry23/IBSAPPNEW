// Distributed Sync Endpoints - Multi-client offline-first sync
const DistributedSyncManager = require('./distributed-sync-manager');

function addDistributedSyncEndpoints(app, db) {
  console.log('🔧 Adding distributed sync endpoints for multi-client offline sync...');
  
  const mongoConnectionString = 'mongodb://172.16.10.124:27017/cabinet_pm_db';
  
  // Initialize sync manager
  async function initSyncManager() {
    const syncManager = new DistributedSyncManager(db, mongoConnectionString);
    await syncManager.initializeSyncColumns();
    return syncManager;
  }

  // Get distributed sync status with conflict info
  app.get('/api/distributed-sync/status', async (req, res) => {
    try {
      const syncManager = await initSyncManager();
      const status = await syncManager.getSyncStatus();
      await syncManager.disconnectFromMongoDB();
      
      res.json({
        success: true,
        status,
        message: 'Distributed sync status retrieved'
      });
    } catch (error) {
      console.error('Distributed sync status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Safe pull from master (conflict-aware)
  app.post('/api/distributed-sync/safe-pull', async (req, res) => {
    try {
      console.log('📥 SAFE PULL FROM MASTER REQUESTED (conflict-aware)');
      
      const syncManager = await initSyncManager();
      const result = await syncManager.safePullFromMaster();
      await syncManager.disconnectFromMongoDB();
      
      res.json(result);
    } catch (error) {
      console.error('Safe pull error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Safe push to master (local changes only)
  app.post('/api/distributed-sync/safe-push', async (req, res) => {
    try {
      console.log('📤 SAFE PUSH TO MASTER REQUESTED (local changes only)');
      
      const syncManager = await initSyncManager();
      const result = await syncManager.safePushToMaster();
      await syncManager.disconnectFromMongoDB();
      
      res.json(result);
    } catch (error) {
      console.error('Safe push error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Complete sync workflow (pull then push)
  app.post('/api/distributed-sync/full-sync', async (req, res) => {
    try {
      console.log('🔄 FULL DISTRIBUTED SYNC REQUESTED (pull + push)');
      
      const syncManager = await initSyncManager();
      
      // Step 1: Safe pull from master
      console.log('Step 1: Safe pulling from master...');
      const pullResult = await syncManager.safePullFromMaster();
      
      if (!pullResult.success) {
        await syncManager.disconnectFromMongoDB();
        return res.json({
          success: false,
          error: 'Pull phase failed',
          details: pullResult
        });
      }

      // Step 2: Safe push to master
      console.log('Step 2: Safe pushing local changes...');
      const pushResult = await syncManager.safePushToMaster();
      
      await syncManager.disconnectFromMongoDB();
      
      res.json({
        success: pushResult.success,
        pullResult,
        pushResult,
        message: `Full sync: Pulled ${pullResult.totalPulled} records (${pullResult.totalConflicts} conflicts), pushed ${pushResult.totalPushed} changes`
      });
      
    } catch (error) {
      console.error('Full distributed sync error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Test connection with device info
  app.post('/api/distributed-sync/test-connection', async (req, res) => {
    try {
      const syncManager = await initSyncManager();
      const connected = await syncManager.connectToMongoDB();
      
      if (connected) {
        const status = await syncManager.getSyncStatus();
        await syncManager.disconnectFromMongoDB();
        
        res.json({
          success: true,
          message: 'MongoDB connection successful',
          deviceId: syncManager.deviceId,
          status
        });
      } else {
        res.json({
          success: false,
          message: 'Failed to connect to MongoDB',
          deviceId: syncManager.deviceId
        });
      }
    } catch (error) {
      console.error('MongoDB connection test error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get device information
  app.get('/api/distributed-sync/device-info', async (req, res) => {
    try {
      const syncManager = await initSyncManager();
      
      res.json({
        success: true,
        deviceId: syncManager.deviceId,
        hostname: require('os').hostname(),
        platform: require('os').platform(),
        arch: require('os').arch(),
        syncTables: syncManager.syncTables
      });
    } catch (error) {
      console.error('Device info error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Force mark all records as synced (emergency use)
  app.post('/api/distributed-sync/mark-all-synced', async (req, res) => {
    try {
      console.log('⚠️ MARKING ALL RECORDS AS SYNCED (emergency operation)');
      
      const syncManager = await initSyncManager();
      let totalMarked = 0;
      
      for (const tableName of syncManager.syncTables) {
        try {
          const result = db.prepare(`UPDATE ${tableName} SET synced = 1 WHERE synced = 0 OR synced IS NULL`).run();
          console.log(`   ✅ Marked ${result.changes} records as synced in ${tableName}`);
          totalMarked += result.changes;
        } catch (error) {
          console.error(`❌ Error marking ${tableName} as synced:`, error.message);
        }
      }
      
      res.json({
        success: true,
        totalMarked,
        message: `Marked ${totalMarked} records as synced`
      });
      
    } catch (error) {
      console.error('Mark all synced error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Reset sync state (mark all as unsynced)
  app.post('/api/distributed-sync/reset-sync-state', async (req, res) => {
    try {
      console.log('🔄 RESETTING SYNC STATE (mark all as unsynced)');
      
      const syncManager = await initSyncManager();
      let totalReset = 0;
      
      for (const tableName of syncManager.syncTables) {
        try {
          const result = db.prepare(`UPDATE ${tableName} SET synced = 0`).run();
          console.log(`   ✅ Reset sync state for ${result.changes} records in ${tableName}`);
          totalReset += result.changes;
        } catch (error) {
          console.error(`❌ Error resetting ${tableName} sync state:`, error.message);
        }
      }
      
      // Clear last sync times
      try {
        db.prepare('DELETE FROM sync_metadata WHERE key LIKE ?').run(['last_sync_%']);
      } catch (error) {
        console.error('Error clearing last sync times:', error);
      }
      
      res.json({
        success: true,
        totalReset,
        message: `Reset sync state for ${totalReset} records`
      });
      
    } catch (error) {
      console.error('Reset sync state error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  console.log('✅ Distributed sync endpoints added successfully');
  console.log('📋 Available endpoints:');
  console.log('   GET  /api/distributed-sync/status');
  console.log('   GET  /api/distributed-sync/device-info');
  console.log('   POST /api/distributed-sync/test-connection');
  console.log('   POST /api/distributed-sync/safe-pull');
  console.log('   POST /api/distributed-sync/safe-push');
  console.log('   POST /api/distributed-sync/full-sync');
  console.log('   POST /api/distributed-sync/mark-all-synced');
  console.log('   POST /api/distributed-sync/reset-sync-state');
}

module.exports = addDistributedSyncEndpoints;
