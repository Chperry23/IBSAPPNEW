// Sync Migration Utility
// Prepares existing databases for enhanced merge replication
// Run this on each iPad/device before using the new sync system

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class SyncMigrationUtility {
  constructor(localDb) {
    this.localDb = localDb;
    
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
      'session_ii_equipment_used'
    ];
  }

  // ============================================================
  // MAIN MIGRATION FUNCTION
  // ============================================================

  async runFullMigration() {
    console.log('🔧 ========================================');
    console.log('🔧 SYNC MIGRATION UTILITY');
    console.log('🔧 Preparing database for merge replication');
    console.log('🔧 ========================================\n');

    const results = {
      success: true,
      steps: [],
      errors: []
    };

    try {
      // Step 1: Create sync_metadata table if not exists
      console.log('Step 1: Creating sync metadata table...');
      const step1 = await this.createSyncMetadataTable();
      results.steps.push(step1);

      // Step 2: Ensure device_id is set
      console.log('\nStep 2: Setting up device ID...');
      const step2 = await this.ensureDeviceId();
      results.steps.push(step2);

      // Step 3: Add sync columns to all tables
      console.log('\nStep 3: Adding sync columns to all tables...');
      const step3 = await this.addSyncColumnsToAllTables();
      results.steps.push(step3);

      // Step 4: Generate UUIDs for existing records
      console.log('\nStep 4: Generating UUIDs for existing records...');
      const step4 = await this.generateUUIDsForAllTables();
      results.steps.push(step4);

      // Step 5: Set device_id for existing records
      console.log('\nStep 5: Setting device_id for existing records...');
      const step5 = await this.setDeviceIdForAllTables();
      results.steps.push(step5);

      // Step 6: Initialize synced flag for existing records
      console.log('\nStep 6: Initializing sync flags...');
      const step6 = await this.initializeSyncedFlags();
      results.steps.push(step6);

      console.log('\n✅ ========================================');
      console.log('✅ MIGRATION COMPLETE');
      console.log('✅ Database is ready for merge replication');
      console.log('✅ ========================================\n');

      return {
        success: true,
        message: 'Migration completed successfully',
        results
      };

    } catch (error) {
      console.error('\n❌ ========================================');
      console.error('❌ MIGRATION FAILED');
      console.error(`❌ Error: ${error.message}`);
      console.error('❌ ========================================\n');

      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  // ============================================================
  // MIGRATION STEPS
  // ============================================================

  async createSyncMetadataTable() {
    return new Promise((resolve, reject) => {
      this.localDb.run(
        `CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (err) => {
          if (err) {
            console.error('   ❌ Failed to create sync_metadata table');
            reject(err);
          } else {
            console.log('   ✅ Sync metadata table created');
            resolve({ step: 'create_metadata_table', status: 'success' });
          }
        }
      );
    });
  }

  async ensureDeviceId() {
    return new Promise((resolve, reject) => {
      // Check if device_id exists
      this.localDb.get(
        `SELECT value FROM sync_metadata WHERE key = 'device_id'`,
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (row && row.value) {
            console.log(`   ✅ Device ID already exists: ${row.value}`);
            resolve({ 
              step: 'ensure_device_id', 
              status: 'success', 
              deviceId: row.value,
              action: 'existing' 
            });
          } else {
            // Generate new device ID
            const hostname = require('os').hostname();
            const deviceId = `${hostname}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

            this.localDb.run(
              `INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('device_id', ?)`,
              [deviceId],
              (insertErr) => {
                if (insertErr) {
                  console.error('   ❌ Failed to create device ID');
                  reject(insertErr);
                } else {
                  console.log(`   ✅ Generated new device ID: ${deviceId}`);
                  resolve({ 
                    step: 'ensure_device_id', 
                    status: 'success', 
                    deviceId,
                    action: 'created' 
                  });
                }
              }
            );
          }
        }
      );
    });
  }

  async addSyncColumnsToAllTables() {
    const columnsToAdd = [
      { name: 'uuid', type: 'TEXT' },
      { name: 'synced', type: 'INTEGER DEFAULT 0' },
      { name: 'device_id', type: 'TEXT' },
      { name: 'deleted', type: 'INTEGER DEFAULT 0' }
    ];

    const results = {};
    let totalAdded = 0;

    for (const tableName of this.syncTables) {
      console.log(`   📋 Processing ${tableName}...`);
      results[tableName] = [];

      for (const column of columnsToAdd) {
        try {
          await new Promise((resolve, reject) => {
            this.localDb.run(
              `ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.type}`,
              (err) => {
                if (err) {
                  if (err.message.includes('duplicate column')) {
                    // Column already exists, that's okay
                    results[tableName].push({ column: column.name, status: 'already_exists' });
                    resolve();
                  } else {
                    console.error(`      ❌ Error adding ${column.name}: ${err.message}`);
                    results[tableName].push({ column: column.name, status: 'error', error: err.message });
                    resolve(); // Don't reject, continue with other columns
                  }
                } else {
                  console.log(`      ✅ Added column: ${column.name}`);
                  results[tableName].push({ column: column.name, status: 'added' });
                  totalAdded++;
                  resolve();
                }
              }
            );
          });
        } catch (error) {
          // Continue with next column
        }
      }
    }

    console.log(`   ✅ Added ${totalAdded} new columns across all tables`);

    return {
      step: 'add_sync_columns',
      status: 'success',
      totalAdded,
      details: results
    };
  }

  async generateUUIDsForAllTables() {
    let totalGenerated = 0;
    const results = {};

    for (const tableName of this.syncTables) {
      try {
        // Get records without UUIDs
        const records = await new Promise((resolve, reject) => {
          this.localDb.all(
            `SELECT id FROM ${tableName} WHERE uuid IS NULL OR uuid = ''`,
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        if (records.length > 0) {
          console.log(`   📝 Generating UUIDs for ${records.length} records in ${tableName}...`);
          
          for (const record of records) {
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
          
          console.log(`   ✅ Generated ${records.length} UUIDs for ${tableName}`);
          results[tableName] = records.length;
          totalGenerated += records.length;
        } else {
          results[tableName] = 0;
        }
      } catch (error) {
        console.error(`   ❌ Error generating UUIDs for ${tableName}: ${error.message}`);
        results[tableName] = `Error: ${error.message}`;
      }
    }

    console.log(`   ✅ Generated ${totalGenerated} total UUIDs`);

    return {
      step: 'generate_uuids',
      status: 'success',
      totalGenerated,
      details: results
    };
  }

  async setDeviceIdForAllTables() {
    // Get device_id from metadata
    const deviceIdRow = await new Promise((resolve, reject) => {
      this.localDb.get(
        `SELECT value FROM sync_metadata WHERE key = 'device_id'`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!deviceIdRow) {
      throw new Error('Device ID not found in metadata');
    }

    const deviceId = deviceIdRow.value;
    let totalUpdated = 0;
    const results = {};

    console.log(`   📱 Using device ID: ${deviceId}`);

    for (const tableName of this.syncTables) {
      try {
        const updateResult = await new Promise((resolve, reject) => {
          this.localDb.run(
            `UPDATE ${tableName} SET device_id = ? WHERE device_id IS NULL OR device_id = ''`,
            [deviceId],
            function(err) {
              if (err) reject(err);
              else resolve(this.changes);
            }
          );
        });

        if (updateResult > 0) {
          console.log(`   ✅ Set device_id for ${updateResult} records in ${tableName}`);
        }
        results[tableName] = updateResult;
        totalUpdated += updateResult;
      } catch (error) {
        console.error(`   ❌ Error setting device_id for ${tableName}: ${error.message}`);
        results[tableName] = `Error: ${error.message}`;
      }
    }

    console.log(`   ✅ Set device_id for ${totalUpdated} total records`);

    return {
      step: 'set_device_ids',
      status: 'success',
      deviceId,
      totalUpdated,
      details: results
    };
  }

  async initializeSyncedFlags() {
    let totalUpdated = 0;
    const results = {};

    console.log('   🚩 Setting all existing records as synced=1 (initial state)...');

    for (const tableName of this.syncTables) {
      try {
        const updateResult = await new Promise((resolve, reject) => {
          this.localDb.run(
            `UPDATE ${tableName} SET synced = 1 WHERE synced IS NULL`,
            function(err) {
              if (err) reject(err);
              else resolve(this.changes);
            }
          );
        });

        if (updateResult > 0) {
          console.log(`   ✅ Initialized ${updateResult} records in ${tableName}`);
        }
        results[tableName] = updateResult;
        totalUpdated += updateResult;
      } catch (error) {
        console.error(`   ❌ Error initializing flags for ${tableName}: ${error.message}`);
        results[tableName] = `Error: ${error.message}`;
      }
    }

    console.log(`   ✅ Initialized ${totalUpdated} total records as synced`);

    return {
      step: 'initialize_synced_flags',
      status: 'success',
      totalUpdated,
      details: results
    };
  }

  // ============================================================
  // DIAGNOSTIC FUNCTIONS
  // ============================================================

  async checkMigrationStatus() {
    console.log('🔍 Checking migration status...\n');

    const status = {
      deviceId: null,
      tablesChecked: 0,
      readyForSync: true,
      issues: []
    };

    // Check device_id
    try {
      const deviceIdRow = await new Promise((resolve, reject) => {
        this.localDb.get(
          `SELECT value FROM sync_metadata WHERE key = 'device_id'`,
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (deviceIdRow && deviceIdRow.value) {
        status.deviceId = deviceIdRow.value;
        console.log(`✅ Device ID: ${status.deviceId}`);
      } else {
        status.readyForSync = false;
        status.issues.push('Device ID not set');
        console.log('❌ Device ID not set');
      }
    } catch (error) {
      status.readyForSync = false;
      status.issues.push(`Device ID check failed: ${error.message}`);
    }

    // Check each table
    console.log('\n📋 Checking tables...');
    for (const tableName of this.syncTables) {
      try {
        const tableInfo = await this.checkTableSyncColumns(tableName);
        status.tablesChecked++;

        if (!tableInfo.ready) {
          status.readyForSync = false;
          status.issues.push(`${tableName}: ${tableInfo.missing.join(', ')} missing`);
          console.log(`❌ ${tableName}: Missing columns: ${tableInfo.missing.join(', ')}`);
        } else {
          console.log(`✅ ${tableName}: Ready (${tableInfo.recordsWithoutUUID} records need UUIDs)`);
          
          if (tableInfo.recordsWithoutUUID > 0) {
            status.issues.push(`${tableName}: ${tableInfo.recordsWithoutUUID} records without UUIDs`);
          }
        }
      } catch (error) {
        status.readyForSync = false;
        status.issues.push(`${tableName}: ${error.message}`);
        console.log(`❌ ${tableName}: Error - ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(50));
    if (status.readyForSync && status.issues.length === 0) {
      console.log('✅ Database is READY for merge replication');
    } else {
      console.log('⚠️  Database needs migration');
      console.log('Issues found:', status.issues.length);
    }
    console.log('='.repeat(50));

    return status;
  }

  async checkTableSyncColumns(tableName) {
    return new Promise((resolve, reject) => {
      this.localDb.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) {
          reject(err);
          return;
        }

        const columnNames = columns.map(col => col.name);
        const requiredColumns = ['uuid', 'synced', 'device_id', 'deleted'];
        const missing = requiredColumns.filter(col => !columnNames.includes(col));

        const ready = missing.length === 0;

        if (ready) {
          // Check how many records don't have UUIDs
          this.localDb.get(
            `SELECT COUNT(*) as count FROM ${tableName} WHERE uuid IS NULL OR uuid = ''`,
            (countErr, row) => {
              if (countErr) {
                reject(countErr);
              } else {
                resolve({
                  ready,
                  missing,
                  recordsWithoutUUID: row ? row.count : 0
                });
              }
            }
          );
        } else {
          resolve({
            ready,
            missing,
            recordsWithoutUUID: 0
          });
        }
      });
    });
  }
}

module.exports = SyncMigrationUtility;

