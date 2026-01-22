// Enhanced Merge Sync Endpoints
// API routes for the enhanced merge replication system

const express = require('express');
const EnhancedMergeReplication = require('./enhanced-merge-replication');
const SyncMigrationUtility = require('./sync-migration-utility');

function setupEnhancedMergeSyncEndpoints(app, localDb, mongoConnectionString) {
  const syncManager = new EnhancedMergeReplication(localDb, mongoConnectionString);
  const migrationUtility = new SyncMigrationUtility(localDb);

  // ============================================================
  // CORE SYNC ENDPOINTS
  // ============================================================

  // Perform full merge sync (Pull + Push)
  app.post('/api/sync/enhanced-merge/full', async (req, res) => {
    try {
      console.log('📡 API: Full merge sync requested');
      const result = await syncManager.performFullMergeSync();
      
      res.json({
        success: result.success,
        message: result.message,
        data: {
          pulled: result.totalPulled,
          pushed: result.totalPushed,
          conflicts: result.totalConflicts,
          conflictsResolved: result.conflictsResolved,
          pullResults: result.pullResults,
          pushResults: result.pushResults,
          errors: result.errors
        }
      });
    } catch (error) {
      console.error('❌ Full merge sync failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Pull from master only
  app.post('/api/sync/enhanced-merge/pull', async (req, res) => {
    try {
      console.log('📡 API: Pull from master requested');
      const result = await syncManager.pullFromMaster();
      
      res.json({
        success: result.success,
        message: result.message,
        data: {
          pulled: result.totalPulled,
          conflicts: result.totalConflicts,
          conflictsResolved: result.conflictsResolved,
          results: result.results
        }
      });
    } catch (error) {
      console.error('❌ Pull from master failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Push to master only
  app.post('/api/sync/enhanced-merge/push', async (req, res) => {
    try {
      console.log('📡 API: Push to master requested');
      const result = await syncManager.pushToMaster();
      
      res.json({
        success: result.success,
        message: result.message,
        data: {
          pushed: result.totalPushed,
          deleted: result.totalDeleted,
          results: result.results
        }
      });
    } catch (error) {
      console.error('❌ Push to master failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================
  // ENHANCED SYNC WITH ORPHAN CLEANUP
  // ============================================================

  // Perform full merge sync with orphan cleanup (RECOMMENDED)
  app.post('/api/sync/enhanced-merge/full-with-cleanup', async (req, res) => {
    try {
      console.log('📡 API: Full merge sync with orphan cleanup requested');
      const result = await syncManager.performFullMergeSyncWithCleanup();
      
      res.json({
        success: result.success,
        message: result.message,
        data: {
          pulled: result.totalPulled,
          orphansRemoved: result.totalOrphansRemoved,
          pushed: result.totalPushed,
          conflicts: result.totalConflicts,
          conflictsResolved: result.conflictsResolved,
          pullResults: result.pullResults,
          orphanResults: result.orphanResults,
          pushResults: result.pushResults,
          errors: result.errors
        }
      });
    } catch (error) {
      console.error('❌ Full merge sync with cleanup failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Pull with orphan cleanup
  app.post('/api/sync/enhanced-merge/pull-with-cleanup', async (req, res) => {
    try {
      console.log('📡 API: Pull with orphan cleanup requested');
      const result = await syncManager.pullFromMasterWithCleanup();
      
      res.json({
        success: result.success,
        message: result.message,
        data: {
          pulled: result.pullResults?.totalPulled || 0,
          orphansRemoved: result.orphanResults?.totalOrphansRemoved || 0,
          conflicts: result.pullResults?.totalConflicts || 0,
          conflictsResolved: result.pullResults?.conflictsResolved || [],
          pullResults: result.pullResults,
          orphanResults: result.orphanResults
        }
      });
    } catch (error) {
      console.error('❌ Pull with cleanup failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Orphan detection and cleanup only
  app.post('/api/sync/enhanced-merge/cleanup-orphans', async (req, res) => {
    try {
      console.log('📡 API: Orphan cleanup requested');
      const result = await syncManager.detectAndCleanOrphans();
      
      res.json({
        success: result.success,
        message: result.message,
        data: {
          orphansRemoved: result.totalOrphansRemoved,
          results: result.results
        }
      });
    } catch (error) {
      console.error('❌ Orphan cleanup failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get sync status
  app.get('/api/sync/enhanced-merge/status', async (req, res) => {
    try {
      const status = await syncManager.getSyncStatus();
      
      res.json({
        success: true,
        status: status  // Frontend expects 'status' not 'data'
      });
    } catch (error) {
      console.error('❌ Failed to get sync status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Set conflict resolution strategy
  app.post('/api/sync/enhanced-merge/strategy', (req, res) => {
    try {
      const { strategy } = req.body;
      
      if (!['local_wins', 'master_wins', 'latest_wins'].includes(strategy)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid strategy. Must be: local_wins, master_wins, or latest_wins'
        });
      }

      syncManager.conflictStrategy = strategy;
      
      console.log(`⚖️  Conflict resolution strategy set to: ${strategy}`);
      
      res.json({
        success: true,
        message: `Conflict strategy set to: ${strategy}`,
        data: { strategy }
      });
    } catch (error) {
      console.error('❌ Failed to set conflict strategy:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================
  // MIGRATION ENDPOINTS
  // ============================================================

  // Run full migration
  app.post('/api/sync/migration/run', async (req, res) => {
    try {
      console.log('🔧 API: Migration requested');
      const result = await migrationUtility.runFullMigration();
      
      res.json(result);
    } catch (error) {
      console.error('❌ Migration failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Check migration status
  app.get('/api/sync/migration/status', async (req, res) => {
    try {
      const status = await migrationUtility.checkMigrationStatus();
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('❌ Failed to check migration status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Generate UUIDs for records without them
  app.post('/api/sync/migration/generate-uuids', async (req, res) => {
    try {
      console.log('🔑 API: UUID generation requested');
      const result = await migrationUtility.generateUUIDsForAllTables();
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('❌ UUID generation failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Ensure sync columns exist
  app.post('/api/sync/migration/ensure-columns', async (req, res) => {
    try {
      console.log('🔧 API: Sync column setup requested');
      const result = await migrationUtility.addSyncColumnsToAllTables();
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('❌ Column setup failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================
  // SCHEMA MANAGEMENT ENDPOINTS
  // ============================================================

  // Ensure sync columns in runtime
  app.post('/api/sync/schema/ensure-columns', async (req, res) => {
    try {
      console.log('🔧 API: Runtime sync column check requested');
      await syncManager.ensureSyncColumns();
      
      res.json({
        success: true,
        message: 'Sync columns ensured'
      });
    } catch (error) {
      console.error('❌ Failed to ensure sync columns:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Generate missing UUIDs
  app.post('/api/sync/schema/generate-uuids', async (req, res) => {
    try {
      console.log('🔑 API: Runtime UUID generation requested');
      await syncManager.generateMissingUUIDs();
      
      res.json({
        success: true,
        message: 'UUIDs generated for records without them'
      });
    } catch (error) {
      console.error('❌ Failed to generate UUIDs:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================
  // DIAGNOSTIC ENDPOINTS
  // ============================================================

  // Get device info
  app.get('/api/sync/device/info', (req, res) => {
    try {
      const os = require('os');
      const deviceId = syncManager.deviceId;
      const hostname = os.hostname();
      const platform = os.platform();
      const arch = os.arch();
      
      res.json({
        success: true,
        deviceId,
        hostname,
        platform,
        arch,
        conflictStrategy: syncManager.conflictStrategy,
        syncTables: syncManager.syncTables
      });
    } catch (error) {
      console.error('❌ Failed to get device info:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Test MongoDB connection
  app.get('/api/sync/connection/test', async (req, res) => {
    try {
      const connected = await syncManager.connectToMongoDB();
      
      if (connected) {
        await syncManager.disconnectFromMongoDB();
      }
      
      res.json({
        success: connected,
        message: connected ? 'MongoDB connection successful' : 'MongoDB connection failed'
      });
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get unsynced counts per table
  app.get('/api/sync/unsynced/counts', async (req, res) => {
    try {
      const counts = {};
      
      for (const tableName of syncManager.syncTables) {
        try {
          const unsyncedRecords = await syncManager.getUnsyncedLocalRecords(tableName);
          counts[tableName] = unsyncedRecords.length;
        } catch (error) {
          counts[tableName] = `Error: ${error.message}`;
        }
      }
      
      res.json({
        success: true,
        data: counts
      });
    } catch (error) {
      console.error('❌ Failed to get unsynced counts:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get last sync times per table
  app.get('/api/sync/last-sync/times', (req, res) => {
    try {
      const times = {};
      
      for (const tableName of syncManager.syncTables) {
        times[tableName] = syncManager.getLastSyncTime(tableName) || 'Never';
      }
      
      res.json({
        success: true,
        data: times
      });
    } catch (error) {
      console.error('❌ Failed to get last sync times:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Mark all records as synced (synced = 1)
  app.post('/api/sync/enhanced-merge/mark-all-synced', async (req, res) => {
    try {
      console.log('📝 Marking all local records as synced...');
      let totalMarked = 0;
      
      for (const tableName of syncManager.syncTables) {
        const result = localDb.prepare(`UPDATE ${tableName} SET synced = 1`).run();
        totalMarked += result.changes;
        console.log(`   ✅ ${tableName}: ${result.changes} records marked as synced`);
      }
      
      res.json({
        success: true,
        totalMarked,
        message: `Marked ${totalMarked} records as synced`
      });
    } catch (error) {
      console.error('❌ Failed to mark all as synced:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Reset sync state - mark all as unsynced (synced = 0) so they can be pushed
  app.post('/api/sync/enhanced-merge/reset-sync-state', async (req, res) => {
    try {
      console.log('🔄 Resetting sync state for all local records...');
      let totalReset = 0;
      
      for (const tableName of syncManager.syncTables) {
        const result = localDb.prepare(`UPDATE ${tableName} SET synced = 0`).run();
        totalReset += result.changes;
        console.log(`   🔄 ${tableName}: ${result.changes} records marked as unsynced`);
      }
      
      res.json({
        success: true,
        totalReset,
        message: `Reset sync state for ${totalReset} records. They are now ready to push.`
      });
    } catch (error) {
      console.error('❌ Failed to reset sync state:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  console.log('✅ Enhanced Merge Sync endpoints registered');
  console.log('   - POST /api/sync/enhanced-merge/full');
  console.log('   - POST /api/sync/enhanced-merge/pull');
  console.log('   - POST /api/sync/enhanced-merge/push');
  console.log('   - POST /api/sync/enhanced-merge/full-with-cleanup (⭐ RECOMMENDED)');
  console.log('   - POST /api/sync/enhanced-merge/pull-with-cleanup');
  console.log('   - POST /api/sync/enhanced-merge/cleanup-orphans');
  console.log('   - GET  /api/sync/enhanced-merge/status');
  console.log('   - POST /api/sync/enhanced-merge/strategy');
  console.log('   - POST /api/sync/enhanced-merge/mark-all-synced');
  console.log('   - POST /api/sync/enhanced-merge/reset-sync-state');
  console.log('   - POST /api/sync/migration/run');
  console.log('   - GET  /api/sync/migration/status');
  console.log('   - POST /api/sync/migration/generate-uuids');
  console.log('   - POST /api/sync/migration/ensure-columns');
  console.log('   - POST /api/sync/schema/ensure-columns');
  console.log('   - POST /api/sync/schema/generate-uuids');
  console.log('   - GET  /api/sync/device/info');
  console.log('   - GET  /api/sync/connection/test');
  console.log('   - GET  /api/sync/unsynced/counts');
  console.log('   - GET  /api/sync/last-sync/times');
}

module.exports = setupEnhancedMergeSyncEndpoints;

