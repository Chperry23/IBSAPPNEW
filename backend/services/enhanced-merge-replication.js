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
    
    // All tables that need to be synced (session_node_tracker removed – no longer used)
    this.syncTables = [
      'users',
      'customers',
      'sessions',
      'cabinets',
      'nodes',
      'session_node_maintenance',
      'cabinet_locations',
      'session_pm_notes',
      'session_ii_documents',
      'session_ii_equipment',
      'session_ii_checklist',
      'session_ii_equipment_used',
      // System Registry tables (replaces legacy CSV import; synced so pull sees registry)
      'sys_workstations',
      'sys_smart_switches',
      'sys_io_devices',
      'sys_controllers',
      'sys_charms_io_cards',
      'sys_charms',
      'sys_ams_systems',
      'customer_metric_history'
    ];

    // Map table names to MongoDB models
    this.modelMap = {
      'users': models.User,
      'customers': models.Customer,
      'sessions': models.Session,
      'cabinets': models.Cabinet,
      'nodes': models.Node,
      'session_node_maintenance': models.SessionNodeMaintenance,
      'cabinet_locations': models.CabinetLocation,
      'session_pm_notes': models.SessionPMNotes,
      'session_ii_documents': models.SessionIIDocument,
      'session_ii_equipment': models.SessionIIEquipment,
      'session_ii_checklist': models.SessionIIChecklist,
      'session_ii_equipment_used': models.SessionIIEquipmentUsed,
      // System Registry models (replaces CSV import)
      'sys_workstations': models.SysWorkstation,
      'sys_smart_switches': models.SysSmartSwitch,
      'sys_io_devices': models.SysIODevice,
      'sys_controllers': models.SysController,
      'sys_charms_io_cards': models.SysCharmsIOCard,
      'sys_charms': models.SysCharm,
      'sys_ams_systems': models.SysAMSSystem,
      'customer_metric_history': models.CustomerMetricHistory
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

      const syncMs = (pullResults.totalMs || 0) + (pushResults.totalMs || 0);
      console.log(`⏱️  Total sync time: ${syncMs}ms (pull: ${pullResults.totalMs || 0}ms, push: ${pushResults.totalMs || 0}ms)`);
      return {
        success: syncResults.errors.length === 0,
        ...syncResults,
        totalMs: syncMs,
        message: `Merge sync complete: Pulled ${syncResults.totalPulled}, Pushed ${syncResults.totalPushed}, Conflicts ${syncResults.totalConflicts} in ${syncMs}ms`
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
      const pullStart = Date.now();
      await this.ensureSyncTablesSupportMasterIds();

      let totalPulled = 0;
      let totalConflicts = 0;
      const conflictsResolved = [];
      const results = {};

      for (const tableName of this.syncTables) {
        try {
          console.log(`\n📥 Processing table: ${tableName}`);
          
          const Model = this.modelMap[tableName];
          const lastSync = await this.getLastSyncTime(tableName);
          
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

          // SECOND PASS: Only when we have a prior sync AND record counts differ between master and local.
          // This fixes: local was wiped/reset but master has records — the timestamp-based pull returns 0,
          // so we must reconcile. Using a fast COUNT check to skip the expensive reconcile when not needed.
          if (lastSync) {
            const [masterCount, localCountRow] = await Promise.all([
              Model.countDocuments({ deleted: { $ne: 1 } }),
              new Promise((res, rej) => {
                // COALESCE so NULL deleted values are treated as 0 (not excluded by != 1)
                this.localDb.get(
                  `SELECT COUNT(*) as c FROM ${tableName} WHERE COALESCE(deleted, 0) != 1`,
                  (err, row) => err ? rej(err) : res(row)
                );
              })
            ]);
            const localCount = localCountRow ? localCountRow.c : 0;

            if (masterCount !== localCount) {
              console.log(`   🔍 Count mismatch (master: ${masterCount}, local: ${localCount}) — reconciling...`);

              // Fetch all master active IDs and all local IDs in two bulk queries
              const [activeMasterIds, localRows] = await Promise.all([
                Model.find({ deleted: { $ne: 1 } }).select('_id').limit(10000).lean(),
                new Promise((res, rej) => {
                  this.localDb.all(`SELECT id, deleted FROM ${tableName}`, (err, rows) => {
                    if (err) rej(err); else res(rows || []);
                  });
                })
              ]);

              const localMap = new Map(localRows.map(r => [r.id, r]));

              // Find master IDs that are absent or explicitly deleted locally
              // Treat NULL deleted same as 0 (not deleted) to match the COUNT query above
              const missingIds = activeMasterIds
                .map(({ _id }) => _id)
                .filter(_id => {
                  const local = localMap.get(_id);
                  return !local || (local.deleted != null && local.deleted === 1);
                });

              let reconciledCount = 0;
              if (missingIds.length > 0) {
                const missingRecords = await Model.find({
                  _id: { $in: missingIds },
                  deleted: { $ne: 1 }
                }).lean();

                for (const masterRecord of missingRecords) {
                  try {
                    const result = await this.mergeRecordFromMaster(tableName, masterRecord);
                    if (result.action === 'inserted' || result.action === 'updated') {
                      reconciledCount++;
                    }
                  } catch (err) {
                    // Skip individual record errors
                  }
                }
              }

              if (reconciledCount > 0) {
                console.log(`   🔄 Reconciled ${reconciledCount} missing/deleted records from master`);
                pulledCount += reconciledCount;
              }
            }
          }

          console.log(`   ✅ Pulled: ${pulledCount}, Conflicts: ${conflictCount}, Deleted: ${deletedCount}`);
          results[tableName] = { pulled: pulledCount, conflicts: conflictCount, deleted: deletedCount };
          totalPulled += pulledCount;
          totalConflicts += conflictCount;

          // Update last sync time
          await this.setLastSyncTime(tableName, new Date().toISOString());

        } catch (error) {
          console.error(`   ❌ Error pulling ${tableName}:`, error.message);
          results[tableName] = { error: error.message };
        }
      }

      const totalMs = Date.now() - pullStart;
      console.log(`\n📥 Pull complete in ${totalMs}ms`);
      return {
        success: true,
        totalPulled,
        totalConflicts,
        totalMs,
        conflictsResolved,
        results,
        message: `Pull complete: ${totalPulled} records, ${totalConflicts} conflicts in ${totalMs}ms`
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
    // Convert MongoDB record to SQLite format
    const masterData = this.convertMongoToSQLite(masterRecord);
    const recordId = masterData.id;

    // Resolve customer_id by customer uuid so sessions/nodes/sys_* link to the correct local customer
    // (master and local can have different integer ids for the same customer; master may use ObjectId refs)
    const tablesNeedingCustomerResolution = [
      'sessions', 'nodes',
      'sys_charms', 'sys_charms_io_cards', 'sys_controllers', 'sys_workstations', 'sys_smart_switches',
      'sys_io_devices', 'sys_ams_systems', 'customer_metric_history'
    ];
    if (tablesNeedingCustomerResolution.includes(tableName) && masterRecord.customer_id != null) {
      masterData.customer_id = await this.resolveMasterCustomerIdToLocal(masterRecord.customer_id);
    }

    return new Promise((resolve, reject) => {
      // cabinets.cabinet_name is NOT NULL - ensure we never insert null/empty
      if (tableName === 'cabinets') {
        const name = (masterData.cabinet_name != null && String(masterData.cabinet_name).trim())
          ? String(masterData.cabinet_name).trim()
          : (masterData.cabinet_location != null && String(masterData.cabinet_location).trim()
            ? String(masterData.cabinet_location).trim()
            : 'Unnamed Cabinet');
        masterData.cabinet_name = name;
      }

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
            // Local wins - keep local BUT mark as synced to prevent re-pushing
            console.log(`   🏠 Keeping local changes (marking as handled)`);
            this.markRecordAsSynced(tableName, recordId)
              .then(() => resolve({ 
                action: 'kept_local', 
                conflict: true, 
                resolution: 'local_wins' 
              }))
              .catch(reject);
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
    // CRITICAL: Always prefer master if local is deleted but master is active
    if (localRecord.deleted === 1 && masterRecord.deleted === 0) {
      return {
        winner: 'master',
        reason: 'Master has active record, local is deleted - master wins'
      };
    }
    
    // CRITICAL: Always prefer master if master is newer and local is deleted
    if (localRecord.deleted === 1) {
      const masterTime = new Date(masterRecord.updated_at || masterRecord.created_at).getTime();
      const localTime = new Date(localRecord.updated_at || localRecord.created_at).getTime();
      
      if (masterTime > localTime) {
        return {
          winner: 'master',
          reason: 'Master is newer than local deletion - master wins'
        };
      }
    }
    
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
      const pushStart = Date.now();

      let totalPushed = 0;
      let totalDeleted = 0;
      const results = {};

      for (const tableName of this.syncTables) {
        const tableStart = Date.now();
        try {
          console.log(`\n📤 Processing table: ${tableName}`);

          const unsyncedRecords = await this.getUnsyncedLocalRecords(tableName);
          console.log(`   📊 Found ${unsyncedRecords.length} unsynced local changes`);

          if (unsyncedRecords.length === 0) {
            results[tableName] = { pushed: 0, deleted: 0, ms: 0 };
            continue;
          }

          const Model = this.modelMap[tableName];

          // Split into deletions vs upserts
          const toDelete = unsyncedRecords.filter(r => r.deleted === 1);
          const toUpsert  = unsyncedRecords.filter(r => r.deleted !== 1);
          const syncedIds = [];

          // --- Batch deletes (one deleteMany instead of N deleteOne) ---
          let deletedCount = 0;
          if (toDelete.length > 0) {
            const deleteIds = toDelete.map(r => r.id);
            await Model.deleteMany({ _id: { $in: deleteIds } });
            deletedCount = toDelete.length;
            syncedIds.push(...deleteIds);
            console.log(`   🗑️  Deleted ${deletedCount} records from master`);
          }

          // --- Batch upserts via bulkWrite (one round-trip per table) ---
          let pushedCount = 0;
          if (toUpsert.length > 0) {
            // Pre-resolve customer_id mappings for sessions/nodes in parallel
            let customerIdMap = {};
            if (tableName === 'sessions' || tableName === 'nodes') {
              const uniqueCustomerIds = [...new Set(
                toUpsert.map(r => r.customer_id).filter(id => id != null)
              )];
              await Promise.all(uniqueCustomerIds.map(async (localId) => {
                customerIdMap[localId] = await this.resolveLocalCustomerIdToMaster(localId);
              }));
            }

            const bulkOps = toUpsert.map(record => {
              let recordToPush = record;
              if ((tableName === 'sessions' || tableName === 'nodes') && record.customer_id != null) {
                recordToPush = { ...record, customer_id: customerIdMap[record.customer_id] ?? record.customer_id };
              }
              const mongoRecord = this.convertSQLiteToMongo(recordToPush, tableName);
              return {
                replaceOne: {
                  filter: { _id: mongoRecord._id },
                  replacement: { ...mongoRecord, device_id: this.deviceId, updated_at: new Date() },
                  upsert: true
                }
              };
            });

            const bulkResult = await Model.bulkWrite(bulkOps, { ordered: false });
            pushedCount = toUpsert.length;
            syncedIds.push(...toUpsert.map(r => r.id));
            console.log(`   📤 bulkWrite: ${bulkResult.upsertedCount} inserted, ${bulkResult.modifiedCount} updated`);
          }

          // Bulk-mark all touched records as synced in one SQL statement
          if (syncedIds.length > 0) {
            await this.markRecordsAsSynced(tableName, syncedIds);
          }

          const tableMs = Date.now() - tableStart;
          console.log(`   ✅ Pushed: ${pushedCount}, Deleted: ${deletedCount} (${tableMs}ms)`);
          results[tableName] = { pushed: pushedCount, deleted: deletedCount, ms: tableMs };
          totalPushed += pushedCount;
          totalDeleted += deletedCount;

        } catch (error) {
          console.error(`   ❌ Error pushing ${tableName}:`, error.message);
          results[tableName] = { error: error.message };
        }
      }

      const totalMs = Date.now() - pushStart;
      console.log(`\n📤 Push complete in ${totalMs}ms`);
      return {
        success: true,
        totalPushed,
        totalDeleted,
        totalMs,
        results,
        message: `Push complete: ${totalPushed} records, ${totalDeleted} deleted in ${totalMs}ms`
      };

    } catch (error) {
      console.error('❌ Push to master failed:', error);
      return { success: false, error: error.message };
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

  async getLocalRecord(tableName, recordId) {
    return new Promise((resolve, reject) => {
      this.localDb.get(
        `SELECT * FROM ${tableName} WHERE id = ?`,
        [recordId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
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
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  // Bulk version — one SQL statement for N ids instead of N round-trips
  async markRecordsAsSynced(tableName, ids) {
    if (!ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    return new Promise((resolve, reject) => {
      this.localDb.run(
        `UPDATE ${tableName} SET synced = 1 WHERE id IN (${placeholders})`,
        ids,
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
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
    ['created_at', 'updated_at', 'completed_at', 'date_completed', 'ii_date_performed', 'recalibration_date', 'assigned_at'].forEach(field => {
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
    ['created_at', 'updated_at', 'completed_at', 'date_completed', 'ii_date_performed', 'recalibration_date', 'assigned_at'].forEach(field => {
      if (sqliteRecord[field] && sqliteRecord[field] instanceof Date) {
        sqliteRecord[field] = sqliteRecord[field].toISOString();
      }
    });
    
    return sqliteRecord;
  }

  /**
   * Resolve master (MongoDB) customer _id to local (SQLite) customer id by uuid.
   * Prevents sessions/nodes from being linked to the wrong customer when master and
   * local use different integer ids for the same customer.
   */
  async resolveMasterCustomerIdToLocal(masterCustomerId) {
    if (masterCustomerId == null) return masterCustomerId;
    try {
      if (!this.isConnected) await this.connectToMongoDB();
      const Customer = this.modelMap['customers'];
      const masterCust = await Customer.findById(masterCustomerId).lean();
      if (!masterCust || !masterCust.uuid) return masterCustomerId;
      const local = await new Promise((resolve, reject) => {
        this.localDb.get('SELECT id FROM customers WHERE uuid = ?', [masterCust.uuid], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      return local ? local.id : masterCustomerId;
    } catch (err) {
      console.warn('   Could not resolve master customer_id to local (using raw id):', err.message);
      return masterCustomerId;
    }
  }

  /**
   * Resolve local (SQLite) customer id to master (MongoDB) customer _id by uuid.
   * When pushing sessions/nodes we must send master's _id so master stores correct links.
   */
  async resolveLocalCustomerIdToMaster(localCustomerId) {
    if (localCustomerId == null) return localCustomerId;
    try {
      const local = await new Promise((resolve, reject) => {
        this.localDb.get('SELECT uuid FROM customers WHERE id = ?', [localCustomerId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      if (!local || !local.uuid) return localCustomerId;
      if (!this.isConnected) await this.connectToMongoDB();
      const Customer = this.modelMap['customers'];
      const masterCust = await Customer.findOne({ uuid: local.uuid }).lean();
      return masterCust ? masterCust._id : localCustomerId;
    } catch (err) {
      console.warn('   Could not resolve local customer_id to master (using raw id):', err.message);
      return localCustomerId;
    }
  }

  // ============================================================
  // SYNC METADATA
  // ============================================================

  async getLastSyncTime(tableName) {
    try {
      const result = await this.localDb.prepare('SELECT value FROM sync_metadata WHERE key = ?').get([`last_sync_${tableName}`]);
      return result ? result.value : null;
    } catch (error) {
      return null;
    }
  }

  async setLastSyncTime(tableName, timestamp) {
    try {
      await this.localDb.prepare('CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT)').run();
      const result = await this.localDb.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)').run([`last_sync_${tableName}`, timestamp]);
      
      console.log(`   ⏰ Set last sync time for ${tableName}: ${timestamp} (changes: ${result.changes})`);
      
      // Verify it was saved
      const verify = await this.localDb.prepare('SELECT value FROM sync_metadata WHERE key = ?').get([`last_sync_${tableName}`]);
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
          status.lastSyncTimes[tableName] = (await this.getLastSyncTime(tableName)) || 'Never';
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

  /**
   * Ensure sys_charms and sys_charms_io_cards use id TEXT so we can store
   * MongoDB ObjectId from master. If table has id INTEGER, recreate with id TEXT and copy data.
   */
  async ensureSyncTablesSupportMasterIds() {
    for (const tableName of ['sys_charms', 'sys_charms_io_cards']) {
      try {
        const columns = await new Promise((resolve, reject) => {
          this.localDb.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });
        const idCol = columns.find((c) => c.name === 'id');
        if (!idCol || String(idCol.type || '').toUpperCase().includes('TEXT')) {
          continue;
        }
        const colList = columns.map((c) => {
          const type = c.name === 'id' ? 'TEXT' : (c.type || 'TEXT');
          const pk = c.name === 'id' ? ' PRIMARY KEY' : '';
          return `${c.name} ${type}${pk}`;
        }).join(', ');
        const allNames = columns.map((c) => c.name).join(', ');
        const selectList = columns.map((c) => c.name === 'id' ? 'CAST(id AS TEXT)' : c.name).join(', ');
        await new Promise((resolve, reject) => {
          this.localDb.run(`CREATE TABLE ${tableName}_sync_new (${colList})`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        await new Promise((resolve, reject) => {
          this.localDb.run(`INSERT INTO ${tableName}_sync_new (${allNames}) SELECT ${selectList} FROM ${tableName}`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        await new Promise((resolve, reject) => {
          this.localDb.run(`DROP TABLE ${tableName}`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        await new Promise((resolve, reject) => {
          this.localDb.run(`ALTER TABLE ${tableName}_sync_new RENAME TO ${tableName}`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        console.log(`   🔧 Migrated ${tableName} to id TEXT for sync`);
      } catch (e) {
        console.warn(`   ⚠️ Migration ${tableName} (id TEXT) skipped:`, e.message);
      }
    }
  }

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
            { table: 'session_node_maintenance', foreignKey: 'node_id' }
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

