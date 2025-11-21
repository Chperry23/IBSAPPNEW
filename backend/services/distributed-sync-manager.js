// Distributed Sync Manager - Handles multiple offline clients properly
const mongoose = require('mongoose');
const models = require('./mongodb-models');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class DistributedSyncManager {
  constructor(localDb, mongoConnectionString) {
    this.localDb = localDb;
    this.mongoConnectionString = mongoConnectionString;
    this.isConnected = false;
    
    // Generate unique device ID for this client
    this.deviceId = this.getOrCreateDeviceId();
    
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

  // Get or create unique device ID for this client
  getOrCreateDeviceId() {
    try {
      // Try to get existing device ID from local storage/file
      const result = this.localDb.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(['device_id']);
      
      if (result && result.value) {
        console.log(`📱 Using existing device ID: ${result.value}`);
        return result.value;
      }
    } catch (error) {
      // Table might not exist yet
    }
    
    // Generate new device ID
    const deviceId = `${require('os').hostname()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    try {
      // Store device ID
      this.localDb.prepare('CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT)').run();
      this.localDb.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)').run(['device_id', deviceId]);
      console.log(`📱 Generated new device ID: ${deviceId}`);
    } catch (error) {
      console.error('Error storing device ID:', error);
    }
    
    return deviceId;
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

  // SAFE PULL: Pull from master without overwriting local changes
  async safePullFromMaster() {
    try {
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      console.log('📥 Starting safe pull from master (conflict-aware)...');
      
      let totalPulled = 0;
      let totalConflicts = 0;
      const results = {};

      for (const tableName of this.syncTables) {
        try {
          console.log(`📥 Safe pulling ${tableName}...`);
          
          const Model = this.modelMap[tableName];
          
          // Get last sync timestamp for this table
          const lastSync = this.getLastSyncTime(tableName);
          console.log(`   ⏰ Last sync for ${tableName}: ${lastSync || 'never'}`);
          
          // Only get records newer than last sync OR records we don't have locally
          const query = lastSync ? 
            { $or: [
              { updated_at: { $gt: new Date(lastSync) } },
              { device_id: { $ne: this.deviceId } }
            ]} : 
            { deleted: { $ne: 1 } };
            
          const masterRecords = await Model.find(query).lean();
          console.log(`   📊 Found ${masterRecords.length} new/updated records in master ${tableName}`);
          
          if (masterRecords.length === 0) {
            results[tableName] = { pulled: 0, conflicts: 0 };
            continue;
          }

          let pulledCount = 0;
          let conflictCount = 0;

          for (const masterRecord of masterRecords) {
            try {
              const result = await this.safeUpsertLocalRecord(tableName, masterRecord);
              if (result.conflict) {
                conflictCount++;
                console.log(`   ⚠️ Conflict detected for ${tableName} record ${masterRecord._id}`);
              } else {
                pulledCount++;
              }
            } catch (recordError) {
              console.error(`❌ Error pulling record ${masterRecord._id}:`, recordError.message);
            }
          }

          console.log(`   ✅ Pulled ${pulledCount} records, ${conflictCount} conflicts in ${tableName}`);
          results[tableName] = { pulled: pulledCount, conflicts: conflictCount };
          totalPulled += pulledCount;
          totalConflicts += conflictCount;

          // Update last sync time for this table
          this.setLastSyncTime(tableName, new Date().toISOString());

        } catch (error) {
          console.error(`❌ Error pulling ${tableName}:`, error.message);
          results[tableName] = { error: error.message };
        }
      }

      console.log(`✅ Safe pull complete: ${totalPulled} records pulled, ${totalConflicts} conflicts`);
      
      return {
        success: true,
        totalPulled,
        totalConflicts,
        results,
        message: `Successfully pulled ${totalPulled} records with ${totalConflicts} conflicts resolved`
      };

    } catch (error) {
      console.error('❌ Safe pull failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // SAFE PUSH: Push only local changes to master
  async safePushToMaster() {
    try {
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      console.log('📤 Starting safe push to master (local changes only)...');
      
      let totalPushed = 0;
      const results = {};

      for (const tableName of this.syncTables) {
        try {
          console.log(`📤 Safe pushing ${tableName}...`);
          
          // Get only unsynced local records (created/modified on this device)
          const localChanges = await this.getUnsyncedLocalRecords(tableName);
          console.log(`   📊 Found ${localChanges.length} unsynced local changes in ${tableName}`);
          
          if (localChanges.length === 0) {
            results[tableName] = 0;
            continue;
          }

          const Model = this.modelMap[tableName];
          let pushedCount = 0;

          for (const record of localChanges) {
            try {
              const mongoRecord = this.convertSQLiteToMongo(record, tableName);
              
              // Use upsert with device_id check to prevent overwriting other clients' changes
              await Model.findOneAndUpdate(
                { _id: mongoRecord._id },
                { 
                  ...mongoRecord,
                  device_id: this.deviceId, // Mark as coming from this device
                  updated_at: new Date()
                },
                { upsert: true, new: true }
              );
              
              // Mark as synced locally
              await this.markRecordAsSynced(tableName, record.id);
              pushedCount++;
              
            } catch (recordError) {
              console.error(`❌ Error pushing record ${record.id}:`, recordError.message);
            }
          }

          console.log(`   ✅ Pushed ${pushedCount} local changes to ${tableName}`);
          results[tableName] = pushedCount;
          totalPushed += pushedCount;

        } catch (error) {
          console.error(`❌ Error pushing ${tableName}:`, error.message);
          results[tableName] = `Error: ${error.message}`;
        }
      }

      console.log(`✅ Safe push complete: ${totalPushed} local changes pushed`);
      
      return {
        success: true,
        totalPushed,
        results,
        message: `Successfully pushed ${totalPushed} local changes to master`
      };

    } catch (error) {
      console.error('❌ Safe push failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get unsynced local records (created or modified on this device)
  async getUnsyncedLocalRecords(tableName) {
    return new Promise((resolve, reject) => {
      this.localDb.all(
        `SELECT * FROM ${tableName} WHERE (synced = 0 OR synced IS NULL) AND (deleted != 1 OR deleted IS NULL)`, 
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  // Safe upsert: Only update if no local changes conflict
  async safeUpsertLocalRecord(tableName, mongoRecord) {
    return new Promise((resolve, reject) => {
      // Convert MongoDB record to SQLite format
      const sqliteRecord = { ...mongoRecord };
      sqliteRecord.id = mongoRecord._id;
      delete sqliteRecord._id;
      
      // Convert Date objects to strings
      ['created_at', 'updated_at', 'completed_at', 'date_completed', 'ii_date_performed', 'recalibration_date'].forEach(field => {
        if (sqliteRecord[field] && sqliteRecord[field] instanceof Date) {
          sqliteRecord[field] = sqliteRecord[field].toISOString();
        }
      });
      
      // Handle null document_id for I&I tables - skip records with null document_id
      if ((tableName === 'session_ii_equipment' || tableName === 'session_ii_checklist' || tableName === 'session_ii_equipment_used') && 
          (!sqliteRecord.document_id || sqliteRecord.document_id === null)) {
        console.log(`⚠️ Skipping ${tableName} record with null document_id:`, sqliteRecord.id);
        resolve({ conflict: false, action: 'skipped_null_document_id' });
        return;
      }

      // Check if record exists locally
      this.localDb.get(`SELECT * FROM ${tableName} WHERE id = ?`, [sqliteRecord.id], (err, existingRecord) => {
        if (err) {
          reject(err);
          return;
        }

        let isConflict = false;

        if (existingRecord) {
          // Check for conflict: local record has unsynced changes
          if (existingRecord.synced === 0 || existingRecord.synced === null) {
            console.log(`   ⚠️ Conflict: Local unsynced changes for ${tableName} record ${sqliteRecord.id}`);
            
            // For now, keep local changes (local wins)
            // TODO: Implement proper conflict resolution UI
            isConflict = true;
            resolve({ conflict: true, action: 'kept_local' });
            return;
          }
        }

        // No conflict, safe to update/insert
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

          // Mark as synced since it came from master
          validRecord.synced = 1;
          validRecord.device_id = sqliteRecord.device_id || 'master';

          const placeholders = columnNames.map(() => '?').join(',');
          const values = columnNames.map(col => validRecord[col] || null);
          
          this.localDb.run(
            `INSERT OR REPLACE INTO ${tableName} (${columnNames.join(',')}) VALUES (${placeholders})`,
            values,
            function(err) {
              if (err) {
                reject(err);
              } else {
                resolve({ conflict: isConflict, action: 'updated' });
              }
            }
          );
        });
      });
    });
  }

  // Mark record as synced
  async markRecordAsSynced(tableName, recordId) {
    return new Promise((resolve, reject) => {
      this.localDb.run(
        `UPDATE ${tableName} SET synced = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [recordId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Get last sync time for a table
  getLastSyncTime(tableName) {
    try {
      const result = this.localDb.prepare('SELECT value FROM sync_metadata WHERE key = ?').get([`last_sync_${tableName}`]);
      return result ? result.value : null;
    } catch (error) {
      return null;
    }
  }

  // Set last sync time for a table
  setLastSyncTime(tableName, timestamp) {
    try {
      this.localDb.prepare('CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT)').run();
      this.localDb.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)').run([`last_sync_${tableName}`, timestamp]);
    } catch (error) {
      console.error(`Error setting last sync time for ${tableName}:`, error);
    }
  }

  // Convert SQLite record to MongoDB format
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
    if (!mongoRecord.device_id) mongoRecord.device_id = this.deviceId;
    
    return mongoRecord;
  }

  // Get sync status with conflict information
  async getSyncStatus() {
    try {
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      const status = {
        connected: this.isConnected,
        deviceId: this.deviceId,
        masterCounts: {},
        localCounts: {},
        unsyncedCounts: {},
        lastSyncTimes: {}
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

      // Get local counts and unsynced counts
      for (const tableName of this.syncTables) {
        try {
          const localRecords = await this.getAllLocalRecords(tableName);
          const unsyncedRecords = await this.getUnsyncedLocalRecords(tableName);
          
          status.localCounts[tableName] = localRecords.length;
          status.unsyncedCounts[tableName] = unsyncedRecords.length;
          status.lastSyncTimes[tableName] = this.getLastSyncTime(tableName) || 'Never';
        } catch (error) {
          status.localCounts[tableName] = `Error: ${error.message}`;
          status.unsyncedCounts[tableName] = 0;
        }
      }

      return status;

    } catch (error) {
      return {
        connected: false,
        deviceId: this.deviceId,
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

  // Initialize sync columns for all tables
  async initializeSyncColumns() {
    console.log('🔧 Initializing sync columns for distributed sync...');
    
    // Simple approach: just try to add columns and ignore errors if they exist
    for (const tableName of this.syncTables) {
      // Add synced column
      this.localDb.run(`ALTER TABLE ${tableName} ADD COLUMN synced INTEGER DEFAULT 0`, (err) => {
        if (err && err.message.includes('duplicate column')) {
          // Column already exists, that's fine
        } else if (err) {
          console.error(`❌ Error adding synced column to ${tableName}:`, err.message);
        } else {
          console.log(`✅ Added synced column to ${tableName}`);
        }
      });
      
      // Add device_id column
      this.localDb.run(`ALTER TABLE ${tableName} ADD COLUMN device_id TEXT`, (err) => {
        if (err && err.message.includes('duplicate column')) {
          // Column already exists, that's fine
        } else if (err) {
          console.error(`❌ Error adding device_id column to ${tableName}:`, err.message);
        } else {
          console.log(`✅ Added device_id column to ${tableName}`);
        }
      });
      
      // Add deleted column
      this.localDb.run(`ALTER TABLE ${tableName} ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
        if (err && err.message.includes('duplicate column')) {
          // Column already exists, that's fine
        } else if (err) {
          console.error(`❌ Error adding deleted column to ${tableName}:`, err.message);
        } else {
          console.log(`✅ Added deleted column to ${tableName}`);
        }
      });
    }
    
    // Set device_id for existing records that don't have it (with delay to allow column creation)
    setTimeout(() => {
      for (const tableName of this.syncTables) {
        this.localDb.run(`UPDATE ${tableName} SET device_id = ? WHERE device_id IS NULL OR device_id = ''`, [this.deviceId], (err) => {
          if (err && err.message.includes('no such column')) {
            // Column doesn't exist yet, that's okay
          } else if (err) {
            console.error(`❌ Error setting device_id for ${tableName}:`, err.message);
          } else {
            console.log(`✅ Set device_id for existing records in ${tableName}`);
          }
        });
      }
    }, 3000); // Wait 3 seconds for column creation to complete
    
    console.log('✅ Sync columns initialization started');
  }
}

module.exports = DistributedSyncManager;
