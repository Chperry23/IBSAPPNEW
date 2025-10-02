// MongoDB Cloud Sync API endpoints to add to your main server
const MongoCloudSyncManager = require('./mongo-cloud-sync');
const path = require('path');

function addMongoSyncEndpoints(app, db) {
  // Sync configuration - handle packaged executable paths
  const isPackaged = typeof process.pkg !== 'undefined';
  const LOCAL_DB_PATH = process.env.LOCAL_DB_PATH || (isPackaged ? 
    path.join(process.cwd(), 'cabinet_pm_tablet.db') : 
    path.join(__dirname, 'cabinet_pm_tablet.db'));
  
  // MongoDB connection string - configured for local server
  let mongoConnectionString = process.env.MONGO_CONNECTION_STRING || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

  // Initialize sync manager
  let syncManager = null;
  
  async function initSyncManager() {
    if (!syncManager && mongoConnectionString) {
      syncManager = new MongoCloudSyncManager(LOCAL_DB_PATH, mongoConnectionString);
      await syncManager.init();
    }
    return syncManager;
  }

  // GET /api/mongo-sync/status - Get current sync status
  app.get('/api/mongo-sync/status', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.json({ 
          success: true, 
          status: { 
            configured: false, 
            message: 'MongoDB connection not configured' 
          } 
        });
      }

      const sync = await initSyncManager();
      const status = await sync.getSyncStatus();
      status.configured = true;
      res.json({ success: true, status });
    } catch (error) {
      console.error('Error getting MongoDB sync status:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/mongo-sync/configure - Configure MongoDB connection
  app.post('/api/mongo-sync/configure', async (req, res) => {
    try {
      const { connectionString } = req.body;
      
      if (!connectionString) {
        return res.status(400).json({ 
          success: false, 
          error: 'MongoDB connection string is required' 
        });
      }

      // Test the connection
      const testSync = new MongoCloudSyncManager(LOCAL_DB_PATH, connectionString);
      await testSync.init();
      const testResult = await testSync.testConnection();
      await testSync.close();

      if (!testResult.success) {
        return res.status(400).json({ 
          success: false, 
          error: `Connection test failed: ${testResult.error}` 
        });
      }

      // Save connection string
      mongoConnectionString = connectionString;
      process.env.MONGO_CONNECTION_STRING = connectionString;
      
      // Reset sync manager to use new connection
      if (syncManager) {
        await syncManager.close();
        syncManager = null;
      }

      res.json({ 
        success: true, 
        message: 'MongoDB connection configured successfully',
        testResult 
      });
    } catch (error) {
      console.error('Error configuring MongoDB sync:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/mongo-sync/test - Test MongoDB connection
  app.post('/api/mongo-sync/test', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.status(400).json({ 
          success: false, 
          error: 'MongoDB connection not configured' 
        });
      }

      console.log('🧪 Testing MongoDB connection with enhanced options...');
      
      // Test connection directly with different options
      const { MongoClient } = require('mongodb');
      
      const testOptions = {
        serverSelectionTimeoutMS: 30000, // 30 seconds for wireless connections
        connectTimeoutMS: 30000,
        socketTimeoutMS: 30000,
        retryWrites: true,
        maxPoolSize: 10,
        minPoolSize: 1,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 30000
      };
      
      const testClient = new MongoClient(mongoConnectionString, testOptions);
      
      try {
        await testClient.connect();
        await testClient.db('cabinet_pm_db').admin().ping();
        console.log('✅ Direct MongoDB connection test successful');
        await testClient.close();
        
        res.json({ 
          success: true, 
          message: 'MongoDB connection successful!',
          database: 'cabinet_pm_db',
          connectionType: 'Direct test with enhanced options'
        });
      } catch (testError) {
        console.error('❌ Direct connection test failed:', testError.message);
        await testClient.close();
        
        res.json({ 
          success: false, 
          error: `Direct connection failed: ${testError.message}`,
          suggestion: 'Check MongoDB Atlas IP whitelist and user permissions'
        });
      }
      
    } catch (error) {
      console.error('Error testing MongoDB connection:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/mongo-sync/pull - Pull fresh data from MongoDB
  app.post('/api/mongo-sync/pull', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.status(400).json({ 
          success: false, 
          error: 'MongoDB connection not configured' 
        });
      }

      const sync = await initSyncManager();
      const result = await sync.pullFromCloud();
      res.json(result);
    } catch (error) {
      console.error('Error pulling from MongoDB:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/mongo-sync/push - Push changes to MongoDB
  app.post('/api/mongo-sync/push', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.status(400).json({ 
          success: false, 
          error: 'MongoDB connection not configured' 
        });
      }

      const sync = await initSyncManager();
      const result = await sync.pushToCloud();
      res.json(result);
    } catch (error) {
      console.error('Error pushing to MongoDB:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/mongo-sync/full-sync - Full sync (pull then push)
  app.post('/api/mongo-sync/full-sync', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.status(400).json({ 
          success: false, 
          error: 'MongoDB connection not configured' 
        });
      }

      const sync = await initSyncManager();
      const result = await sync.fullSync();
      res.json(result);
    } catch (error) {
      console.error('Error during full sync:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/mongo-sync/full-refresh - Full refresh (replace all local data with master)
  app.post('/api/mongo-sync/full-refresh', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.status(400).json({ 
          success: false, 
          error: 'MongoDB connection not configured' 
        });
      }

      const sync = await initSyncManager();
      const result = await sync.fullRefresh();
      res.json(result);
    } catch (error) {
      console.error('Error during full refresh:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/mongo-sync/setup - Initial setup (generate UUIDs)
  app.post('/api/mongo-sync/setup', async (req, res) => {
    try {
      const sync = await initSyncManager();
      if (!sync) {
        // Create sync manager without MongoDB connection for local setup
        const localSync = new MongoCloudSyncManager(LOCAL_DB_PATH, 'dummy://connection');
        await localSync.init();
        await localSync.generateMissingUUIDs();
        await localSync.close();
      } else {
        await sync.generateMissingUUIDs();
      }
      res.json({ success: true, message: 'MongoDB sync setup completed' });
    } catch (error) {
      console.error('Error setting up MongoDB sync:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/mongo-sync/initial-migration - Mark all existing records for sync
  app.post('/api/mongo-sync/initial-migration', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.status(400).json({ 
          success: false, 
          error: 'MongoDB connection not configured' 
        });
      }

      const sync = await initSyncManager();
      const totalMarked = await sync.initialMigration();
      res.json({ 
        success: true, 
        message: `Initial migration completed: ${totalMarked} records marked for sync`,
        recordsMarked: totalMarked
      });
    } catch (error) {
      console.error('Error during initial migration:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/mongo-sync/safety-check - Check if database is safe to push
  app.get('/api/mongo-sync/safety-check', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.json({ 
          success: false, 
          error: 'MongoDB connection not configured' 
        });
      }

      const sync = await initSyncManager();
      const safetyReport = {
        safe: true,
        warnings: [],
        localCounts: {},
        cloudCounts: {},
        unsyncedCounts: {}
      };
      
      for (const tableName of sync.syncTables) {
        // Get local record count
        const localCount = await sync.getQuery(sync.localDb, 
          `SELECT COUNT(*) as count FROM ${tableName}`
        );
        safetyReport.localCounts[tableName] = localCount.count;
        
        // Get cloud record count
        const cloudCount = await sync.collections[tableName].countDocuments({});
        safetyReport.cloudCounts[tableName] = cloudCount;
        
        // Get unsynced record count
        const unsyncedCount = await sync.getQuery(sync.localDb, 
          `SELECT COUNT(*) as count FROM ${tableName} WHERE synced = 0`
        );
        safetyReport.unsyncedCounts[tableName] = unsyncedCount.count;
        
        // Safety checks
        if (localCount.count === 0 && cloudCount > 0) {
          safetyReport.safe = false;
          safetyReport.warnings.push(`${tableName}: Local is empty but cloud has ${cloudCount} records`);
        } else if (localCount.count > 0 && cloudCount > localCount.count * 3) {
          safetyReport.warnings.push(`${tableName}: Local has ${localCount.count} but cloud has ${cloudCount} records (may be outdated)`);
        }
      }
      
      res.json({ success: true, safetyReport });
    } catch (error) {
      console.error('Error checking database safety:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/mongo-sync/cleanup-null-uuids - Clean up records with null UUIDs from MongoDB
  app.post('/api/mongo-sync/cleanup-null-uuids', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.status(400).json({ 
          success: false, 
          error: 'MongoDB connection not configured' 
        });
      }

      const sync = await initSyncManager();
      let totalDeleted = 0;
      const results = {};
      
      // Clean up null UUIDs from all sync tables
      for (const tableName of sync.syncTables) {
        const result = await sync.collections[tableName].deleteMany({
          $or: [
            { uuid: null },
            { uuid: 'null' },
            { uuid: '' },
            { uuid: { $exists: false } }
          ]
        });
        
        results[tableName] = result.deletedCount;
        totalDeleted += result.deletedCount;
        
        if (result.deletedCount > 0) {
          console.log(`🧹 Cleaned up ${result.deletedCount} null UUID records from ${tableName}`);
        }
      }
      
      res.json({ 
        success: true, 
        message: `Cleaned up ${totalDeleted} records with null UUIDs`,
        results: results,
        totalDeleted: totalDeleted
      });
    } catch (error) {
      console.error('Error cleaning up null UUIDs:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // DELETE /api/mongo-sync/delete-records - Delete specific records from MongoDB
  app.delete('/api/mongo-sync/delete-records', async (req, res) => {
    try {
      if (!mongoConnectionString) {
        return res.status(400).json({ 
          success: false, 
          error: 'MongoDB connection not configured' 
        });
      }

      const { tableName, filter } = req.body;
      
      if (!tableName || !filter) {
        return res.status(400).json({ 
          success: false, 
          error: 'tableName and filter are required' 
        });
      }

      const sync = await initSyncManager();
      
      // Delete from MongoDB
      const result = await sync.collections[tableName].deleteMany(filter);
      
      console.log(`🗑️ Deleted ${result.deletedCount} records from MongoDB ${tableName} collection`);
      
      res.json({ 
        success: true, 
        message: `Deleted ${result.deletedCount} records from ${tableName}`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error('Error deleting records from MongoDB:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/mongo-sync/device-info - Get device information
  app.get('/api/mongo-sync/device-info', async (req, res) => {
    try {
      const sync = new MongoCloudSyncManager(LOCAL_DB_PATH, 'dummy://connection');
      const deviceInfo = {
        deviceId: sync.deviceId,
        hostname: require('os').hostname(),
        platform: require('os').platform(),
        arch: require('os').arch(),
        nodeVersion: process.version
      };
      res.json({ success: true, deviceInfo });
    } catch (error) {
      console.error('Error getting device info:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Cleanup function for graceful shutdown
  async function cleanup() {
    if (syncManager) {
      await syncManager.close();
      syncManager = null;
    }
  }

  // Handle graceful shutdown
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  console.log('✅ MongoDB Cloud Sync endpoints added to server');
  
  return {
    cleanup,
    getSyncManager: () => syncManager
  };
}

module.exports = addMongoSyncEndpoints;
