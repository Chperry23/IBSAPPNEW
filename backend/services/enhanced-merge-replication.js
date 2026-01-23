// Enhanced Merge Replication Manager
// Implements proper bi-directional sync with conflict resolution and tombstone handling
const mongoose = require('mongoose');
const models = require('../models/mongodb-models');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class EnhancedMergeReplication {
  constructor(localDb, mongoConnectionString) {
    this.localDb = localDb;
    this.mongoConnectionString = mongoConnectionString;
    this.isConnected = false;
    
    // Device ID will be initialized asynchronously
    this.deviceId = null;
    this.deviceIdPromise = this.getOrCreateDeviceId();
    
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
      'session_ii_equipment_used',
      'csv_import_history'
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
      'session_ii_equipment_used': models.SessionIIEquipmentUsed,
      'csv_import_history': models.CSVImportHistory
    };

    // Conflict resolution strategy: 'local_wins', 'master_wins', 'latest_wins'
    this.conflictStrategy = 'latest_wins';
  }

  // ============================================================
  // DEVICE IDENTIFICATION
  // ============================================================

  async getOrCreateDeviceId() {
    try {
      const result = await this.localDb.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(['device_id']);
      
      if (result && result.value) {
        console.log(`📱 Using existing device ID: ${result.value}`);
        this.deviceId = result.value;
        return result.value;
      }
    } catch (error) {
      // Table might not exist yet, will create it below
      console.log('📱 sync_metadata table not found or empty, creating new device ID...');
    }
    
    // Generate new device ID based on hostname and random string
    const deviceId = `${require('os').hostname()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    try {
      await this.localDb.prepare('CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)').run();
      await this.localDb.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)').run(['device_id', deviceId]);
      console.log(`📱 Generated new device ID: ${deviceId}`);
      this.deviceId = deviceId;
    } catch (error) {
      console.error('Error storing device ID:', error);
      this.deviceId = deviceId; // Use it anyway
    }
    
    return deviceId;
  }

  // Ensure device ID is initialized before using it
  async ensureDeviceId() {
    if (!this.deviceId) {
      this.deviceId = await this.deviceIdPromise;
    }
    return this.deviceId;
  }

  // ============================================================
  // MONGODB CONNECTION
  // ============================================================

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

  // ============================================================
  // FULL MERGE SYNC (Pull then Push)
  // ============================================================

  async performFullMergeSync() {
    try {
      // Ensure device ID is initialized
      await this.ensureDeviceId();
      
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      console.log('🔄 Starting Full Merge Sync (Pull → Push)...');
      console.log(`📱 Device ID: ${this.deviceId}`);
      console.log(`⚖️  Conflict Strategy: ${this.conflictStrategy}`);

      const syncResults = {
        pullResults: {},
        pushResults: {},
        totalPulled: 0,
        totalPushed: 0,
        totalConflicts: 0,
        conflictsResolved: [],
        errors: []
      };

      // STEP 1: PULL FROM MASTER (Import changes)
      console.log('\n📥 ===== STEP 1: PULL FROM MASTER =====');
      const pullResults = await this.pullFromMaster();
      syncResults.pullResults = pullResults;
      syncResults.totalPulled = pullResults.totalPulled || 0;
      syncResults.totalConflicts = pullResults.totalConflicts || 0;
      syncResults.conflictsResolved = pullResults.conflictsResolved || [];

      if (!pullResults.success) {
        syncResults.errors.push(`Pull failed: ${pullResults.error}`);
      }

      // STEP 2: PUSH TO MASTER (Export local changes)
      console.log('\n📤 ===== STEP 2: PUSH TO MASTER =====');
      const pushResults = await this.pushToMaster();
      syncResults.pushResults = pushResults;
      syncResults.totalPushed = pushResults.totalPushed || 0;

      if (!pushResults.success) {
        syncResults.errors.push(`Push failed: ${pushResults.error}`);
      }

      // STEP 3: SUMMARY
      console.log('\n✅ ===== MERGE SYNC COMPLETE =====');
      console.log(`📥 Pulled: ${syncResults.totalPulled} records`);
      console.log(`📤 Pushed: ${syncResults.totalPushed} records`);
      console.log(`⚠️  Conflicts Resolved: ${syncResults.totalConflicts}`);
      if (syncResults.errors.length > 0) {
        console.log(`❌ Errors: ${syncResults.errors.length}`);
      }

      return {
        success: syncResults.errors.length === 0,
        ...syncResults,
        message: `Merge sync complete: Pulled ${syncResults.totalPulled}, Pushed ${syncResults.totalPushed}, Conflicts ${syncResults.totalConflicts}`
      };

    } catch (error) {
      console.error('❌ Full merge sync failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================
  // PULL FROM MASTER (Step 1 of Merge)
  // ============================================================

  async pullFromMaster() {
    try {
      console.log('📥 Pulling changes from master database...');
      
      let totalPulled = 0;
      let totalConflicts = 0;
      const conflictsResolved = [];
      const results = {};

      for (const tableName of this.syncTables) {
        try {
          console.log(`\n📥 Processing table: ${tableName}`);
          
          const Model = this.modelMap[tableName];
          const lastSync = this.getLastSyncTime(tableName);
          
          console.log(`   ⏰ Last sync: ${lastSync || 'never'}`);

          // Query strategy:
          // 1. Get all records updated since last sync
          // 2. Include tombstones (deleted=1) so we can propagate deletions
          // 3. If never synced, get everything
          let query = {};
          if (lastSync) {
            query = {
              $or: [
                { updated_at: { $gt: new Date(lastSync) } },
                { deleted: 1, updated_at: { $gt: new Date(lastSync) } }
              ]
            };
          }
          // If no last sync, get non-deleted records only (initial sync)
          else {
            query = { deleted: { $ne: 1 } };
          }
            
          const masterRecords = await Model.find(query).lean();
          console.log(`   📊 Found ${masterRecords.length} changed records on master`);
          
          if (masterRecords.length === 0) {
            results[tableName] = { pulled: 0, conflicts: 0, deleted: 0 };
            continue;
          }

          let pulledCount = 0;
          let conflictCount = 0;
          let deletedCount = 0;

          for (const masterRecord of masterRecords) {
            try {
              const result = await this.mergeRecordFromMaster(tableName, masterRecord);
              
              if (result.action === 'deleted') {
                deletedCount++;
              } else if (result.conflict) {
                conflictCount++;
                conflictsResolved.push({
                  table: tableName,
                  recordId: masterRecord._id,
                  resolution: result.resolution
                });
              } else {
                pulledCount++;
              }
            } catch (recordError) {
              console.error(`   ❌ Error processing record ${masterRecord._id}:`, recordError.message);
            }
          }

          console.log(`   ✅ Pulled: ${pulledCount}, Conflicts: ${conflictCount}, Deleted: ${deletedCount}`);
          results[tableName] = { pulled: pulledCount, conflicts: conflictCount, deleted: deletedCount };
          totalPulled += pulledCount;
          totalConflicts += conflictCount;

          // Update last sync time
          this.setLastSyncTime(tableName, new Date().toISOString());

        } catch (error) {
          console.error(`   ❌ Error pulling ${tableName}:`, error.message);
          results[tableName] = { error: error.message };
        }
      }

      return {
        success: true,
        totalPulled,
        totalConflicts,
        conflictsResolved,
        results,
        message: `Pull complete: ${totalPulled} records, ${totalConflicts} conflicts`
      };

    } catch (error) {
      console.error('❌ Pull from master failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================
  // MERGE SINGLE RECORD FROM MASTER
  // ============================================================

  async mergeRecordFromMaster(tableName, masterRecord) {
    return new Promise((resolve, reject) => {
      // Convert MongoDB record to SQLite format
      const masterData = this.convertMongoToSQLite(masterRecord);
      const recordId = masterData.id;

      // Check if this is a deletion tombstone
      if (masterData.deleted === 1) {
        // ✅ PHYSICALLY DELETE the record locally (don't just mark as deleted)
        this.localDb.get(`SELECT * FROM ${tableName} WHERE id = ?`, [recordId], (err, localRecord) => {
          if (err) {
            reject(err);
            return;
          }

          if (localRecord) {
            // Check if local has unsynced changes
            if (localRecord.synced === 0 || localRecord.synced === null) {
              // CONFLICT: Local has changes but master says delete
              console.log(`   ⚠️  DELETION CONFLICT: ${tableName}.${recordId} has local changes`);
              
              // Use conflict strategy
              if (this.conflictStrategy === 'local_wins') {
                console.log(`   🏠 Keeping local record (local_wins policy)`);
                resolve({ action: 'kept_local', conflict: true, resolution: 'local_wins_deletion' });
                return;
              }
            }

            // Proceed with deletion - CASCADE to related tables
            this.cascadeDelete(tableName, recordId)
              .then(() => {
                console.log(`   🗑️  Physically deleted: ${tableName}.${recordId} (and related records)`);
                resolve({ action: 'deleted', conflict: false });
              })
              .catch(reject);
          } else {
            // Record doesn't exist locally, nothing to delete
            resolve({ action: 'deleted', conflict: false });
          }
        });
        return;
      }

      // Check if record exists locally
      this.localDb.get(`SELECT * FROM ${tableName} WHERE id = ?`, [recordId], (err, localRecord) => {
        if (err) {
          reject(err);
          return;
        }

        // CASE 1: Record doesn't exist locally - simple insert
        if (!localRecord) {
          this.insertOrUpdateLocalRecord(tableName, masterData, true)
            .then(() => resolve({ action: 'inserted', conflict: false }))
            .catch(reject);
          return;
        }

        // CASE 2: Record exists locally
        // Check if local has unsynced changes
        if (localRecord.synced === 0 || localRecord.synced === null) {
          // CONFLICT: Both sides have changes
          console.log(`   ⚠️  CONFLICT detected for ${tableName}.${recordId}`);
          
          const resolution = this.resolveConflict(localRecord, masterData);
          
          if (resolution.winner === 'master') {
            // Master wins - overwrite local
            this.insertOrUpdateLocalRecord(tableName, masterData, true)
              .then(() => resolve({ 
                action: 'updated', 
                conflict: true, 
                resolution: 'master_wins' 
              }))
              .catch(reject);
          } else {
            // Local wins - keep local, don't update
            console.log(`   🏠 Keeping local changes (will be pushed later)`);
            resolve({ 
              action: 'kept_local', 
              conflict: true, 
              resolution: 'local_wins' 
            });
          }
        } else {
          // No conflict - local is synced, safe to update
          this.insertOrUpdateLocalRecord(tableName, masterData, true)
            .then(() => resolve({ action: 'updated', conflict: false }))
            .catch(reject);
        }
      });
    });
  }

  // ============================================================
  // CONFLICT RESOLUTION
  // ============================================================

  resolveConflict(localRecord, masterRecord) {
    switch (this.conflictStrategy) {
      case 'master_wins':
        return { winner: 'master', reason: 'Master always wins policy' };
      
      case 'local_wins':
        return { winner: 'local', reason: 'Local always wins policy' };
      
      case 'latest_wins':
      default:
        // Compare timestamps - most recent update wins
        const localTime = new Date(localRecord.updated_at || localRecord.created_at).getTime();
        const masterTime = new Date(masterRecord.updated_at || masterRecord.created_at).getTime();
        
        if (masterTime > localTime) {
          return { 
            winner: 'master', 
            reason: `Master newer (${new Date(masterTime).toISOString()} vs ${new Date(localTime).toISOString()})` 
          };
        } else {
          return { 
            winner: 'local', 
            reason: `Local newer (${new Date(localTime).toISOString()} vs ${new Date(masterTime).toISOString()})` 
          };
        }
    }
  }

  // ============================================================
  // PUSH TO MASTER (Step 2 of Merge)
  // ============================================================

  async pushToMaster() {
    try {
      console.log('📤 Pushing local changes to master database...');
      
      let totalPushed = 0;
      let totalDeleted = 0;
      const results = {};

      for (const tableName of this.syncTables) {
        try {
          console.log(`\n📤 Processing table: ${tableName}`);
          
          // Get all unsynced local records (including deletions)
          const unsyncedRecords = await this.getUnsyncedLocalRecords(tableName);
          console.log(`   📊 Found ${unsyncedRecords.length} unsynced local changes`);
          
          if (unsyncedRecords.length === 0) {
            results[tableName] = { pushed: 0, deleted: 0 };
            continue;
          }

          const Model = this.modelMap[tableName];
          let pushedCount = 0;
          let deletedCount = 0;

          for (const record of unsyncedRecords) {
            try {
              // Check if this is a deletion
              if (record.deleted === 1) {
                // Delete from master
                await Model.deleteOne({ _id: record.id });
                console.log(`   🗑️  Deleted from master: ${tableName}.${record.id}`);
                
                // Mark as synced locally (keep tombstone for now)
                await this.markRecordAsSynced(tableName, record.id);
                deletedCount++;
              } else {
                // Upsert to master
                const mongoRecord = this.convertSQLiteToMongo(record, tableName);
                
                await Model.findOneAndUpdate(
                  { _id: mongoRecord._id },
                  {
                    ...mongoRecord,
                    device_id: this.deviceId,
                    updated_at: new Date()
                  },
                  { upsert: true, new: true }
                );
                
                // Mark as synced locally
                await this.markRecordAsSynced(tableName, record.id);
                pushedCount++;
              }
            } catch (recordError) {
              console.error(`   ❌ Error pushing record ${record.id}:`, recordError.message);
            }
          }

          console.log(`   ✅ Pushed: ${pushedCount}, Deleted: ${deletedCount}`);
          results[tableName] = { pushed: pushedCount, deleted: deletedCount };
          totalPushed += pushedCount;
          totalDeleted += deletedCount;

        } catch (error) {
          console.error(`   ❌ Error pushing ${tableName}:`, error.message);
          results[tableName] = { error: error.message };
        }
      }

      return {
        success: true,
        totalPushed,
        totalDeleted,
        results,
        message: `Push complete: ${totalPushed} records, ${totalDeleted} deleted`
      };

    } catch (error) {
      console.error('❌ Push to master failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================
  // DATABASE HELPERS
  // ============================================================

  async getUnsyncedLocalRecords(tableName) {
    return new Promise((resolve, reject) => {
      // Get records where synced = 0 (includes both updates and deletions)
      this.localDb.all(
        `SELECT * FROM ${tableName} WHERE (synced = 0 OR synced IS NULL)`,
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

  async insertOrUpdateLocalRecord(tableName, record, markAsSynced = true) {
    return new Promise((resolve, reject) => {
      // Get table schema
      this.localDb.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
          reject(err);
          return;
        }

        const columnNames = columns.map(col => col.name);
        const validRecord = {};
        
        // Only include fields that exist in the table
        columnNames.forEach(col => {
          if (record.hasOwnProperty(col)) {
            validRecord[col] = record[col];
          }
        });

        // Mark as synced if requested
        if (markAsSynced) {
          validRecord.synced = 1;
        }

        const placeholders = columnNames.map(() => '?').join(',');
        const values = columnNames.map(col => validRecord[col] !== undefined ? validRecord[col] : null);
        
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

  async markRecordAsSynced(tableName, recordId) {
    return new Promise((resolve, reject) => {
      this.localDb.run(
        `UPDATE ${tableName} SET synced = 1 WHERE id = ?`,
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

  // ============================================================
  // CONVERSION HELPERS
  // ============================================================

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
    
    // Ensure sync fields have defaults
    if (!mongoRecord.synced) mongoRecord.synced = 0;
    if (!mongoRecord.deleted) mongoRecord.deleted = 0;
    if (!mongoRecord.device_id) mongoRecord.device_id = this.deviceId;
    if (!mongoRecord.uuid) mongoRecord.uuid = uuidv4();
    
    return mongoRecord;
  }

  convertMongoToSQLite(mongoRecord) {
    const sqliteRecord = { ...mongoRecord };
    
    // Convert _id to id for SQLite
    sqliteRecord.id = mongoRecord._id;
    delete sqliteRecord._id;
    delete sqliteRecord.__v; // Remove mongoose version key
    
    // Convert Date objects to ISO strings
    ['created_at', 'updated_at', 'completed_at', 'date_completed', 'ii_date_performed', 'recalibration_date'].forEach(field => {
      if (sqliteRecord[field] && sqliteRecord[field] instanceof Date) {
        sqliteRecord[field] = sqliteRecord[field].toISOString();
      }
    });
    
    return sqliteRecord;
  }

  // ============================================================
  // SYNC METADATA
  // ============================================================

  getLastSyncTime(tableName) {
    try {
      const result = this.localDb.prepare('SELECT value FROM sync_metadata WHERE key = ?').get([`last_sync_${tableName}`]);
      return result ? result.value : null;
    } catch (error) {
      return null;
    }
  }

  setLastSyncTime(tableName, timestamp) {
    try {
      this.localDb.prepare('CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT)').run();
      const result = this.localDb.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)').run([`last_sync_${tableName}`, timestamp]);
      
      console.log(`   ⏰ Set last sync time for ${tableName}: ${timestamp} (changes: ${result.changes})`);
      
      // Verify it was saved
      const verify = this.localDb.prepare('SELECT value FROM sync_metadata WHERE key = ?').get([`last_sync_${tableName}`]);
      if (!verify) {
        console.error(`   ❌ Failed to verify last sync time for ${tableName}`);
      } else {
        console.log(`   ✅ Verified last sync time for ${tableName}: ${verify.value}`);
      }
    } catch (error) {
      console.error(`❌ Error setting last sync time for ${tableName}:`, error);
      console.error(`   Full error:`, error.stack);
    }
  }

  // ============================================================
  // SYNC STATUS & DIAGNOSTICS
  // ============================================================

  async getSyncStatus() {
    try {
      // Ensure device ID is initialized
      await this.ensureDeviceId();
      
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      const status = {
        connected: this.isConnected,
        deviceId: this.deviceId,
        conflictStrategy: this.conflictStrategy,
        masterCounts: {},
        localCounts: {},
        unsyncedCounts: {},
        lastSyncTimes: {},
        health: 'healthy'
      };

      // Get master counts
      for (const tableName of this.syncTables) {
        try {
          const Model = this.modelMap[tableName];
          const count = await Model.countDocuments({ deleted: { $ne: 1 } });
          status.masterCounts[tableName] = count;
        } catch (error) {
          status.masterCounts[tableName] = `Error: ${error.message}`;
          status.health = 'degraded';
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
          status.health = 'degraded';
        }
      }

      return status;

    } catch (error) {
      return {
        connected: false,
        deviceId: this.deviceId,
        health: 'unhealthy',
        error: error.message
      };
    }
  }

  async getAllLocalRecords(tableName) {
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

  // ============================================================
  // SCHEMA SETUP & MIGRATION
  // ============================================================

  async ensureSyncColumns() {
    // Ensure device ID is initialized
    await this.ensureDeviceId();
    
    console.log('🔧 Ensuring all tables have sync columns...');
    
    const columnsToAdd = [
      { name: 'uuid', type: 'TEXT' },
      { name: 'synced', type: 'INTEGER DEFAULT 0' },
      { name: 'device_id', type: 'TEXT' },
      { name: 'deleted', type: 'INTEGER DEFAULT 0' }
    ];

    for (const tableName of this.syncTables) {
      for (const column of columnsToAdd) {
        try {
          await new Promise((resolve, reject) => {
            this.localDb.run(
              `ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.type}`,
              (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  console.error(`   ❌ Error adding ${column.name} to ${tableName}:`, err.message);
                  reject(err);
                } else if (!err) {
                  console.log(`   ✅ Added ${column.name} to ${tableName}`);
                  resolve();
                } else {
                  resolve(); // Column already exists
                }
              }
            );
          });
        } catch (error) {
          // Continue even if some columns fail
        }
      }
    }

    // Set device_id for existing records without it
    for (const tableName of this.syncTables) {
      try {
        await new Promise((resolve, reject) => {
          this.localDb.run(
            `UPDATE ${tableName} SET device_id = ? WHERE device_id IS NULL OR device_id = ''`,
            [this.deviceId],
            function(err) {
              if (err) {
                reject(err);
              } else {
                if (this.changes > 0) {
                  console.log(`   ✅ Set device_id for ${this.changes} records in ${tableName}`);
                }
                resolve();
              }
            }
          );
        });
      } catch (error) {
        console.error(`   ❌ Error setting device_id for ${tableName}:`, error.message);
      }
    }

    console.log('✅ Sync columns check complete');
  }

  async generateMissingUUIDs() {
    console.log('🔑 Generating UUIDs for records without them...');
    
    for (const tableName of this.syncTables) {
      try {
        const recordsWithoutUUID = await new Promise((resolve, reject) => {
          this.localDb.all(
            `SELECT id FROM ${tableName} WHERE uuid IS NULL OR uuid = ''`,
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        if (recordsWithoutUUID.length > 0) {
          console.log(`   📝 Generating UUIDs for ${recordsWithoutUUID.length} records in ${tableName}`);
          
          for (const record of recordsWithoutUUID) {
            const newUUID = uuidv4();
            await new Promise((resolve, reject) => {
              this.localDb.run(
                `UPDATE ${tableName} SET uuid = ? WHERE id = ?`,
                [newUUID, record.id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          }
          
          console.log(`   ✅ Generated UUIDs for ${tableName}`);
        }
      } catch (error) {
        console.error(`   ❌ Error generating UUIDs for ${tableName}:`, error.message);
      }
    }

    console.log('✅ UUID generation complete');
  }

  // ============================================================
  // CASCADE DELETION - Delete record and all related records
  // ============================================================

  async cascadeDelete(tableName, recordId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Define cascade relationships (parent -> children)
        const cascadeRules = {
          'sessions': [
            { table: 'cabinets', foreignKey: 'pm_session_id' },
            { table: 'session_node_maintenance', foreignKey: 'session_id' },
            { table: 'session_node_tracker', foreignKey: 'session_id' },
            { table: 'cabinet_locations', foreignKey: 'session_id' },
            { table: 'session_pm_notes', foreignKey: 'session_id' },
            { table: 'session_ii_documents', foreignKey: 'session_id' },
            { table: 'session_ii_equipment', foreignKey: 'session_id' },
            { table: 'session_ii_checklist', foreignKey: 'session_id' },
            { table: 'session_ii_equipment_used', foreignKey: 'session_id' }
          ],
          'customers': [
            { table: 'sessions', foreignKey: 'customer_id' },
            { table: 'nodes', foreignKey: 'customer_id' }
          ],
          'nodes': [
            { table: 'session_node_maintenance', foreignKey: 'node_id' },
            { table: 'session_node_tracker', foreignKey: 'node_id' }
          ],
          'session_ii_documents': [
            { table: 'session_ii_equipment', foreignKey: 'document_id' },
            { table: 'session_ii_checklist', foreignKey: 'document_id' },
            { table: 'session_ii_equipment_used', foreignKey: 'document_id' }
          ],
          'cabinet_locations': [
            { table: 'cabinets', foreignKey: 'location_id' }
          ]
        };

        // First, cascade delete children if this table has cascade rules
        if (cascadeRules[tableName]) {
          for (const rule of cascadeRules[tableName]) {
            try {
              const deleteResult = await new Promise((res, rej) => {
                this.localDb.run(
                  `DELETE FROM ${rule.table} WHERE ${rule.foreignKey} = ?`,
                  [recordId],
                  function(err) {
                    if (err) rej(err);
                    else {
                      if (this.changes > 0) {
                        console.log(`      ↳ Cascade deleted ${this.changes} records from ${rule.table}`);
                      }
                      res(this.changes);
                    }
                  }
                );
              });
            } catch (error) {
              console.error(`      ❌ Error cascade deleting from ${rule.table}:`, error.message);
              // Continue with other deletions even if one fails
            }
          }
        }

        // Finally, delete the parent record
        this.localDb.run(
          `DELETE FROM ${tableName} WHERE id = ?`,
          [recordId],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.changes);
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  // ============================================================
  // ORPHAN DETECTION & CLEANUP
  // ============================================================

  async detectAndCleanOrphans() {
    try {
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      console.log('\n🧹 Starting orphan detection and cleanup...');
      console.log('   (Finding local records that no longer exist in master)');
      
      let totalOrphansRemoved = 0;
      const results = {};

      for (const tableName of this.syncTables) {
        try {
          console.log(`\n🔍 Checking ${tableName} for orphans...`);
          
          // Get all local record IDs (exclude deleted ones)
          const localRecords = await new Promise((resolve, reject) => {
            this.localDb.all(
              `SELECT id FROM ${tableName} WHERE (deleted IS NULL OR deleted = 0)`,
              (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
              }
            );
          });

          if (localRecords.length === 0) {
            console.log(`   ✅ No records to check`);
            results[tableName] = 0;
            continue;
          }

          console.log(`   📊 Checking ${localRecords.length} local records against master...`);

          const Model = this.modelMap[tableName];
          let orphansFound = 0;

          // Check each local record against master
          for (const localRecord of localRecords) {
            try {
              // Check if this ID exists in master (and is not deleted)
              const masterRecord = await Model.findOne({ 
                _id: localRecord.id,
                deleted: { $ne: 1 }
              }).lean();

              if (!masterRecord) {
                // This record doesn't exist in master (orphan) - remove it
                console.log(`   🗑️  Orphan found: ${tableName}.${localRecord.id} (doesn't exist in master)`);
                await this.cascadeDelete(tableName, localRecord.id);
                orphansFound++;
              }
            } catch (recordError) {
              console.error(`   ❌ Error checking record ${localRecord.id}:`, recordError.message);
            }
          }

          console.log(`   ✅ Removed ${orphansFound} orphaned records from ${tableName}`);
          results[tableName] = orphansFound;
          totalOrphansRemoved += orphansFound;

        } catch (error) {
          console.error(`   ❌ Error checking ${tableName}:`, error.message);
          results[tableName] = `Error: ${error.message}`;
        }
      }

      console.log(`\n✅ Orphan cleanup complete: ${totalOrphansRemoved} orphaned records removed`);

      return {
        success: true,
        totalOrphansRemoved,
        results,
        message: `Removed ${totalOrphansRemoved} orphaned records`
      };

    } catch (error) {
      console.error('❌ Orphan detection failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================
  // ENHANCED PULL WITH ORPHAN CLEANUP
  // ============================================================

  async pullFromMasterWithCleanup() {
    try {
      console.log('📥 Starting enhanced pull with orphan cleanup...');
      
      // Step 1: Normal pull
      const pullResults = await this.pullFromMaster();
      
      if (!pullResults.success) {
        return pullResults;
      }

      // Step 2: Detect and clean orphans
      const orphanResults = await this.detectAndCleanOrphans();

      return {
        success: true,
        pullResults,
        orphanResults,
        message: `Pull complete: ${pullResults.totalPulled} pulled, ${orphanResults.totalOrphansRemoved} orphans removed`
      };

    } catch (error) {
      console.error('❌ Enhanced pull failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================
  // FULL MERGE SYNC WITH ORPHAN CLEANUP
  // ============================================================

  async performFullMergeSyncWithCleanup() {
    try {
      // Ensure device ID is initialized
      await this.ensureDeviceId();
      
      if (!this.isConnected) {
        await this.connectToMongoDB();
      }

      console.log('🔄 Starting Full Merge Sync with Orphan Cleanup (Pull → Orphan Cleanup → Push)...');
      console.log(`📱 Device ID: ${this.deviceId}`);
      console.log(`⚖️  Conflict Strategy: ${this.conflictStrategy}`);

      const syncResults = {
        pullResults: {},
        orphanResults: {},
        pushResults: {},
        totalPulled: 0,
        totalOrphansRemoved: 0,
        totalPushed: 0,
        totalConflicts: 0,
        conflictsResolved: [],
        errors: []
      };

      // STEP 1: PULL FROM MASTER (Import changes)
      console.log('\n📥 ===== STEP 1: PULL FROM MASTER =====');
      const pullResults = await this.pullFromMaster();
      syncResults.pullResults = pullResults;
      syncResults.totalPulled = pullResults.totalPulled || 0;
      syncResults.totalConflicts = pullResults.totalConflicts || 0;
      syncResults.conflictsResolved = pullResults.conflictsResolved || [];

      if (!pullResults.success) {
        syncResults.errors.push(`Pull failed: ${pullResults.error}`);
      }

      // STEP 2: ORPHAN CLEANUP (Remove records that don't exist in master)
      console.log('\n🧹 ===== STEP 2: ORPHAN CLEANUP =====');
      const orphanResults = await this.detectAndCleanOrphans();
      syncResults.orphanResults = orphanResults;
      syncResults.totalOrphansRemoved = orphanResults.totalOrphansRemoved || 0;

      if (!orphanResults.success) {
        syncResults.errors.push(`Orphan cleanup failed: ${orphanResults.error}`);
      }

      // STEP 3: PUSH TO MASTER (Export local changes)
      console.log('\n📤 ===== STEP 3: PUSH TO MASTER =====');
      const pushResults = await this.pushToMaster();
      syncResults.pushResults = pushResults;
      syncResults.totalPushed = pushResults.totalPushed || 0;

      if (!pushResults.success) {
        syncResults.errors.push(`Push failed: ${pushResults.error}`);
      }

      // STEP 4: SUMMARY
      console.log('\n✅ ===== MERGE SYNC COMPLETE =====');
      console.log(`📥 Pulled: ${syncResults.totalPulled} records`);
      console.log(`🧹 Orphans Removed: ${syncResults.totalOrphansRemoved} records`);
      console.log(`📤 Pushed: ${syncResults.totalPushed} records`);
      console.log(`⚠️  Conflicts Resolved: ${syncResults.totalConflicts}`);
      if (syncResults.errors.length > 0) {
        console.log(`❌ Errors: ${syncResults.errors.length}`);
      }

      return {
        success: syncResults.errors.length === 0,
        ...syncResults,
        message: `Merge sync complete: Pulled ${syncResults.totalPulled}, Orphans ${syncResults.totalOrphansRemoved}, Pushed ${syncResults.totalPushed}, Conflicts ${syncResults.totalConflicts}`
      };

    } catch (error) {
      console.error('❌ Full merge sync with cleanup failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = EnhancedMergeReplication;

