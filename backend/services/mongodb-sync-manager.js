// MongoDB Sync Manager - Clean sync with proper schemas
const mongoose = require('mongoose');
const models = require('./mongodb-models');

class MongoDBSyncManager {
  constructor(localDb, mongoConnectionString) {
    this.localDb = localDb;
    this.mongoConnectionString = mongoConnectionString;
    this.isConnected = false;
    
    // All tables that need to be synced
    this.syncTables = [
      'users',
      'customers', 
      'sessions',
      'cabinets',
      'nodes',
      'session_node_maintenance',
      'session_node_tracker',
      'cabinet_locations',
      'session_pm_notes',
      'session_ii_documents',
      'session_ii_equipment',
      'session_ii_checklist',
      'session_ii_equipment_used'
    ];
    
    // Map table names to MongoDB models
    this.modelMap = {
      'users': models.User,
      'customers': models.Customer,
      'sessions': models.Session,
      'cabinets': models.Cabinet,
      'nodes': models.Node,
      'session_node_maintenance': models.SessionNodeMaintenance,
      'session_node_tracker': models.SessionNodeTracker,
      'cabinet_locations': models.CabinetLocation,
      'session_pm_notes': models.SessionPMNotes,
      'session_ii_documents': models.SessionIIDocument,
      'session_ii_equipment': models.SessionIIEquipment,
      'session_ii_checklist': models.SessionIIChecklist,
      'session_ii_equipment_used': models.SessionIIEquipmentUsed
    };
  }

  async connectToMongoDB() {
    try {
      console.log('🔗 Connecting to MongoDB master server...');
      await mongoose.connect(this.mongoConnectionString);
      this.isConnected = true;
      console.log('✅ Connected to MongoDB master server');
      return true;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async disconnectFromMongoDB() {
    if (this.isConnected) {
      await mongoose.disconnect();
      this.isConnected = false;
      console.log('🔌 Disconnected from MongoDB');
    }
  }

  // NUCLEAR OPTION: Completely reset the master database
  async resetMasterDatabase() {
    try {
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      console.log('💥 RESETTING MASTER DATABASE - This will delete ALL data!');
      
      let totalDeleted = 0;
      const results = {};

      // Drop each collection completely
      for (const tableName of this.syncTables) {
        try {
          const Model = this.modelMap[tableName];
          const deleteResult = await Model.deleteMany({});
          const deletedCount = deleteResult.deletedCount || 0;
          
          console.log(`🗑️ Cleared ${tableName}: ${deletedCount} records deleted`);
          results[tableName] = deletedCount;
          totalDeleted += deletedCount;
        } catch (error) {
          console.error(`❌ Error clearing ${tableName}:`, error.message);
          results[tableName] = `Error: ${error.message}`;
        }
      }

      console.log(`✅ Master database reset complete: ${totalDeleted} total records deleted`);
      
      return {
        success: true,
        totalDeleted,
        results,
        message: `Master database completely reset. ${totalDeleted} records deleted.`
      };

    } catch (error) {
      console.error('❌ Master database reset failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Push entire local database to master (after reset)
  async pushAllToMaster() {
    try {
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      console.log('📤 Pushing entire local database to master...');
      
      let totalPushed = 0;
      const results = {};

      for (const tableName of this.syncTables) {
        try {
          console.log(`📤 Pushing ${tableName}...`);
          
          // Get all records from local SQLite
          const localRecords = await this.getAllLocalRecords(tableName);
          console.log(`   📊 Found ${localRecords.length} local records in ${tableName}`);
          
          if (localRecords.length === 0) {
            results[tableName] = 0;
            continue;
          }

          const Model = this.modelMap[tableName];
          let pushedCount = 0;

          // Insert each record using the proper MongoDB model
          for (const record of localRecords) {
            try {
              const mongoRecord = this.convertSQLiteToMongo(record, tableName);
              
              // Use upsert to handle any conflicts
              await Model.findOneAndUpdate(
                { _id: mongoRecord._id },
                mongoRecord,
                { upsert: true, new: true }
              );
              
              pushedCount++;
            } catch (recordError) {
              console.error(`❌ Error pushing record ${record.id}:`, recordError.message);
            }
          }

          console.log(`   ✅ Pushed ${pushedCount} records to ${tableName}`);
          results[tableName] = pushedCount;
          totalPushed += pushedCount;

        } catch (error) {
          console.error(`❌ Error pushing ${tableName}:`, error.message);
          results[tableName] = `Error: ${error.message}`;
        }
      }

      console.log(`✅ Push to master complete: ${totalPushed} total records pushed`);
      
      return {
        success: true,
        totalPushed,
        results,
        message: `Successfully pushed ${totalPushed} records to master database`
      };

    } catch (error) {
      console.error('❌ Push to master failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Pull from master to local (clean sync)
  async pullFromMaster() {
    try {
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      console.log('📥 Pulling from master to local...');
      
      let totalPulled = 0;
      const results = {};

      for (const tableName of this.syncTables) {
        try {
          console.log(`📥 Pulling ${tableName}...`);
          
          const Model = this.modelMap[tableName];
          const masterRecords = await Model.find({ deleted: { $ne: 1 } }).lean();
          console.log(`   📊 Found ${masterRecords.length} master records in ${tableName}`);
          
          if (masterRecords.length === 0) {
            results[tableName] = 0;
            continue;
          }

          let pulledCount = 0;

          // Insert/update each record in local SQLite
          for (const record of masterRecords) {
            try {
              await this.upsertLocalRecord(tableName, record);
              pulledCount++;
            } catch (recordError) {
              console.error(`❌ Error pulling record ${record._id}:`, recordError.message);
            }
          }

          console.log(`   ✅ Pulled ${pulledCount} records to local ${tableName}`);
          results[tableName] = pulledCount;
          totalPulled += pulledCount;

        } catch (error) {
          console.error(`❌ Error pulling ${tableName}:`, error.message);
          results[tableName] = `Error: ${error.message}`;
        }
      }

      console.log(`✅ Pull from master complete: ${totalPulled} total records pulled`);
      
      return {
        success: true,
        totalPulled,
        results,
        message: `Successfully pulled ${totalPulled} records from master database`
      };

    } catch (error) {
      console.error('❌ Pull from master failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper: Get all records from local SQLite table
  getAllLocalRecords(tableName) {
    return new Promise((resolve, reject) => {
      this.localDb.all(`SELECT * FROM ${tableName} WHERE deleted != 1 OR deleted IS NULL`, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  // Helper: Convert SQLite record to MongoDB format
  convertSQLiteToMongo(record, tableName) {
    const mongoRecord = { ...record };
    
    // Convert id to _id for MongoDB
    mongoRecord._id = record.id;
    delete mongoRecord.id;
    
    // Convert date strings to Date objects
    ['created_at', 'updated_at', 'completed_at', 'date_completed', 'ii_date_performed', 'recalibration_date'].forEach(field => {
      if (mongoRecord[field] && typeof mongoRecord[field] === 'string') {
        mongoRecord[field] = new Date(mongoRecord[field]);
      }
    });
    
    // Ensure required fields have defaults
    if (!mongoRecord.synced) mongoRecord.synced = 0;
    if (!mongoRecord.deleted) mongoRecord.deleted = 0;
    
    return mongoRecord;
  }

  // Helper: Insert/update record in local SQLite
  async upsertLocalRecord(tableName, mongoRecord) {
    return new Promise((resolve, reject) => {
      // Convert MongoDB record back to SQLite format
      const sqliteRecord = { ...mongoRecord };
      sqliteRecord.id = mongoRecord._id;
      delete sqliteRecord._id;
      
      // Convert Date objects back to strings
      ['created_at', 'updated_at', 'completed_at', 'date_completed', 'ii_date_performed', 'recalibration_date'].forEach(field => {
        if (sqliteRecord[field] && sqliteRecord[field] instanceof Date) {
          sqliteRecord[field] = sqliteRecord[field].toISOString();
        }
      });

      // Get table columns
      this.localDb.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
          reject(err);
          return;
        }

        const columnNames = columns.map(col => col.name);
        const validRecord = {};
        
        // Only include fields that exist in the table
        columnNames.forEach(col => {
          if (sqliteRecord.hasOwnProperty(col)) {
            validRecord[col] = sqliteRecord[col];
          }
        });

        // Create INSERT OR REPLACE statement
        const placeholders = columnNames.map(() => '?').join(',');
        const values = columnNames.map(col => validRecord[col] || null);
        
        this.localDb.run(
          `INSERT OR REPLACE INTO ${tableName} (${columnNames.join(',')}) VALUES (${placeholders})`,
          values,
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.changes);
            }
          }
        );
      });
    });
  }

  // Get sync status
  async getSyncStatus() {
    try {
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      const status = {
        connected: this.isConnected,
        masterCounts: {},
        localCounts: {}
      };

      // Get master counts
      for (const tableName of this.syncTables) {
        try {
          const Model = this.modelMap[tableName];
          const count = await Model.countDocuments({ deleted: { $ne: 1 } });
          status.masterCounts[tableName] = count;
        } catch (error) {
          status.masterCounts[tableName] = `Error: ${error.message}`;
        }
      }

      // Get local counts
      for (const tableName of this.syncTables) {
        try {
          const localRecords = await this.getAllLocalRecords(tableName);
          status.localCounts[tableName] = localRecords.length;
        } catch (error) {
          status.localCounts[tableName] = `Error: ${error.message}`;
        }
      }

      return status;

    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

module.exports = MongoDBSyncManager;
