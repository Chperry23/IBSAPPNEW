// Clean Sync Endpoints - Proper MongoDB schema-based sync
const MongoDBSyncManager = require('./mongodb-sync-manager');

function addCleanSyncEndpoints(app, db) {
  console.log('🔧 Adding clean sync endpoints with proper MongoDB schemas...');
  
  const mongoConnectionString = 'mongodb://172.16.10.124:27017/cabinet_pm_db';
  
  // Initialize sync manager
  async function initSyncManager() {
    const syncManager = new MongoDBSyncManager(db, mongoConnectionString);
    return syncManager;
  }

  // Get sync status with proper schema info
  app.get('/api/clean-sync/status', async (req, res) => {
    try {
      const syncManager = await initSyncManager();
      const status = await syncManager.getSyncStatus();
      await syncManager.disconnectFromMongoDB();
      
      res.json({
        success: true,
        status,
        message: 'Clean sync status retrieved'
      });
    } catch (error) {
      console.error('Clean sync status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // NUCLEAR OPTION: Reset master database completely
  app.post('/api/clean-sync/reset-master', async (req, res) => {
    try {
      console.log('💥 MASTER DATABASE RESET REQUESTED - This will delete ALL master data!');
      
      const syncManager = await initSyncManager();
      const result = await syncManager.resetMasterDatabase();
      await syncManager.disconnectFromMongoDB();
      
      res.json(result);
    } catch (error) {
      console.error('Master database reset error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Push entire local database to master
  app.post('/api/clean-sync/push-all', async (req, res) => {
    try {
      console.log('📤 PUSH ALL TO MASTER REQUESTED');
      
      const syncManager = await initSyncManager();
      const result = await syncManager.pushAllToMaster();
      await syncManager.disconnectFromMongoDB();
      
      res.json(result);
    } catch (error) {
      console.error('Push all to master error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Pull from master to local
  app.post('/api/clean-sync/pull-all', async (req, res) => {
    try {
      console.log('📥 PULL ALL FROM MASTER REQUESTED');
      
      const syncManager = await initSyncManager();
      const result = await syncManager.pullFromMaster();
      await syncManager.disconnectFromMongoDB();
      
      res.json(result);
    } catch (error) {
      console.error('Pull all from master error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Complete reset and repopulate workflow
  app.post('/api/clean-sync/reset-and-repopulate', async (req, res) => {
    try {
      console.log('🔄 COMPLETE RESET AND REPOPULATE WORKFLOW REQUESTED');
      
      const syncManager = await initSyncManager();
      
      // Step 1: Reset master database
      console.log('Step 1: Resetting master database...');
      const resetResult = await syncManager.resetMasterDatabase();
      
      if (!resetResult.success) {
        await syncManager.disconnectFromMongoDB();
        return res.json({
          success: false,
          error: 'Failed to reset master database',
          details: resetResult
        });
      }

      // Step 2: Push all local data to master
      console.log('Step 2: Pushing all local data to master...');
      const pushResult = await syncManager.pushAllToMaster();
      
      await syncManager.disconnectFromMongoDB();
      
      res.json({
        success: pushResult.success,
        resetResult,
        pushResult,
        message: `Complete workflow: Reset ${resetResult.totalDeleted} records, pushed ${pushResult.totalPushed} records`
      });
      
    } catch (error) {
      console.error('Reset and repopulate workflow error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Test MongoDB connection with proper schemas
  app.post('/api/clean-sync/test-connection', async (req, res) => {
    try {
      const syncManager = await initSyncManager();
      const connected = await syncManager.connectToMongoDB();
      
      if (connected) {
        const status = await syncManager.getSyncStatus();
        await syncManager.disconnectFromMongoDB();
        
        res.json({
          success: true,
          message: 'MongoDB connection successful with proper schemas',
          status
        });
      } else {
        res.json({
          success: false,
          message: 'Failed to connect to MongoDB'
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

  console.log('✅ Clean sync endpoints added successfully');
  console.log('📋 Available endpoints:');
  console.log('   GET  /api/clean-sync/status');
  console.log('   POST /api/clean-sync/test-connection');
  console.log('   POST /api/clean-sync/reset-master');
  console.log('   POST /api/clean-sync/push-all');
  console.log('   POST /api/clean-sync/pull-all');
  console.log('   POST /api/clean-sync/reset-and-repopulate');
}

module.exports = addCleanSyncEndpoints;
