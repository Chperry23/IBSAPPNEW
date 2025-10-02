console.log('🔧 Loading mongo-cloud-sync.js...');

const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const os = require('os');

console.log('✅ Dependencies loaded for mongo-cloud-sync.js');

class MongoCloudSyncManager {
  constructor(localDbPath, mongoConnectionString) {
    console.log('🔧 Creating MongoCloudSyncManager with localDbPath:', localDbPath);
    this.localDbPath = localDbPath;
    this.mongoConnectionString = mongoConnectionString;
    this.localDb = null;
    this.mongoClient = null;
    this.database = null;
    this.deviceId = this.generateDeviceId();
    this.collections = {};
    
    // Tables to sync
    this.syncTables = [
      'sessions',
      'cabinets', 
      'session_node_maintenance',
      'session_node_tracker',
      'cabinet_locations',
      'session_pm_notes',
      'customers',
      'users',
      'nodes'
    ];
    
    // Read-only tables (master -> devices)
    this.readOnlyTables = [];
  }

  // Generate unique device identifier
  generateDeviceId() {
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    return `${hostname}_${platform}_${arch}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  // Initialize database connections
  async init() {
    console.log('🔧 Initializing MongoCloudSyncManager...');
    
    // Initialize local SQLite connection
    this.localDb = new sqlite3.Database(this.localDbPath);
    
    // Add sync columns to local database
    await this.addSyncColumns();
    
    console.log('✅ MongoCloudSyncManager initialized');
  }

  // Connect to MongoDB
  async connectToMongo() {
    if (!this.mongoConnectionString || this.mongoConnectionString === 'dummy://connection') {
      throw new Error('MongoDB connection string not configured');
    }

    try {
      // Dynamic import of mongodb (since it might not be installed initially)
      const { MongoClient } = require('mongodb');
      
      console.log('🔗 Connecting to MongoDB...');
      
      // Add connection options compatible with older MongoDB versions
      const connectionOptions = {
        serverSelectionTimeoutMS: 45000, // 45 seconds for wireless
        connectTimeoutMS: 45000, // 45 seconds
        socketTimeoutMS: 45000, // 45 seconds
        retryWrites: true,
        maxPoolSize: 10,
        minPoolSize: 1,
        maxIdleTimeMS: 45000,
        waitQueueTimeoutMS: 45000
        // Removed unsupported options: heartbeatFrequencyMS, serverSelectionRetryDelayMS
      };
      
      this.mongoClient = new MongoClient(this.mongoConnectionString, connectionOptions);
      await this.mongoClient.connect();
      
      this.database = this.mongoClient.db('cabinet_pm_db');
      
      // Initialize collections
      for (const table of [...this.syncTables, ...this.readOnlyTables]) {
        this.collections[table] = this.database.collection(table);
      }
      
      console.log('✅ Connected to MongoDB successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }
  }

  // Disconnect from MongoDB
  async disconnectFromMongo() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
      this.database = null;
      this.collections = {};
      console.log('🔌 Disconnected from MongoDB');
    }
  }

  // Test internet connectivity to MongoDB
  async testConnection() {
    try {
      await this.connectToMongo();
      
      // Test with a simple ping
      await this.database.admin().ping();
      
      await this.disconnectFromMongo();
      return { success: true, message: 'Successfully connected to MongoDB cloud' };
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Add sync columns to existing tables if they don't exist
  async addSyncColumns() {
    console.log('🔧 Checking and adding sync columns to existing tables...');
    
    const requiredColumns = [
      { name: 'uuid', type: 'TEXT' },
      { name: 'synced', type: 'INTEGER DEFAULT 0' },
      { name: 'device_id', type: `TEXT DEFAULT '${this.deviceId}'` },
      { name: 'deleted', type: 'INTEGER DEFAULT 0' },
      { name: 'created_at', type: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
      { name: 'updated_at', type: 'TEXT DEFAULT CURRENT_TIMESTAMP' }
    ];
    
    for (const table of this.syncTables) {
      try {
        // Check if table exists
        const tableExists = await this.getQuery(this.localDb, 
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]
        );
        
        if (!tableExists) {
          console.log(`⚠️  Table ${table} does not exist, skipping`);
          continue;
        }
        
        // Get current schema
        const currentSchema = await this.allQuery(this.localDb, `PRAGMA table_info(${table})`);
        const currentColumns = currentSchema.map(col => col.name);
        
        let addedColumns = 0;
        let hasAllColumns = true;
        
        // Add missing columns one by one
        for (const column of requiredColumns) {
          if (!currentColumns.includes(column.name)) {
            try {
              await this.runQuery(this.localDb, `ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.type}`);
              console.log(`   ✅ Added ${column.name} column to ${table}`);
              addedColumns++;
              hasAllColumns = false;
            } catch (error) {
              if (error.message.includes('duplicate column name')) {
                // Column already exists, this is fine
                console.log(`   ℹ️  Column ${column.name} already exists in ${table}`);
              } else {
                console.error(`   ❌ Error adding ${column.name} to ${table}:`, error.message);
                hasAllColumns = false;
              }
            }
          }
        }
        
        if (hasAllColumns && addedColumns === 0) {
          console.log(`ℹ️ Sync columns already exist in ${table}`);
        } else if (addedColumns > 0) {
          console.log(`🔧 Added ${addedColumns} missing sync columns to ${table}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing table ${table}:`, error.message);
      }
    }
  }

  // Helper function to run SQL queries with promises
  runQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  // Helper function to get query results
  getQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Helper function to get all query results
  allQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Generate UUIDs for existing records that don't have them
  async generateMissingUUIDs() {
    for (const table of this.syncTables) {
      const records = await this.allQuery(this.localDb, `SELECT id FROM ${table} WHERE uuid IS NULL OR uuid = ''`);
      for (const record of records) {
        const uuid = uuidv4();
        await this.runQuery(this.localDb, 
          `UPDATE ${table} SET uuid = ?, synced = 0, device_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
          [uuid, this.deviceId, record.id]
        );
      }
      console.log(`✅ Generated ${records.length} UUIDs for ${table}`);
    }
  }

  // Initial migration: Mark ALL existing records for sync
  async initialMigration() {
    console.log('🔄 Starting initial migration of all existing data...');
    let totalMarked = 0;
    
    for (const table of this.syncTables) {
      try {
        // Count existing records
        const countResult = await this.getQuery(this.localDb, `SELECT COUNT(*) as count FROM ${table}`);
        const existingCount = countResult.count;
        
        if (existingCount === 0) {
          console.log(`   ℹ️ No records in ${table}`);
          continue;
        }
        
        // Generate UUIDs for records without them
        const recordsWithoutUuid = await this.allQuery(this.localDb, `SELECT id FROM ${table} WHERE uuid IS NULL OR uuid = ''`);
        for (const record of recordsWithoutUuid) {
          const uuid = uuidv4();
          await this.runQuery(this.localDb, 
            `UPDATE ${table} SET uuid = ?, device_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
            [uuid, this.deviceId, record.id]
          );
        }
        
        // Mark ALL records as unsynced for initial push
        const result = await this.runQuery(this.localDb, 
          `UPDATE ${table} SET synced = 0, device_id = ?, updated_at = CURRENT_TIMESTAMP WHERE device_id IS NULL OR device_id = ''`, 
          [this.deviceId]
        );
        
        // Also ensure existing records have proper metadata
        await this.runQuery(this.localDb, 
          `UPDATE ${table} SET synced = 0 WHERE synced IS NULL`
        );
        
        const markedCount = await this.getQuery(this.localDb, `SELECT COUNT(*) as count FROM ${table} WHERE synced = 0`);
        console.log(`   ✅ Marked ${markedCount.count} records in ${table} for sync`);
        totalMarked += markedCount.count;
        
      } catch (error) {
        console.error(`   ❌ Error migrating ${table}:`, error.message);
      }
    }
    
    console.log(`✅ Initial migration completed: ${totalMarked} total records marked for sync`);
    return totalMarked;
  }

  // PULL: Download fresh data from MongoDB cloud
  async pullFromCloud() {
    console.log('📥 Pulling fresh data from MongoDB cloud...');
    
    try {
      await this.connectToMongo();
      
      const results = {
        readOnlyTables: {},
        syncTables: {},
        totalPulled: 0,
        details: {
          readOnly: {},
          sync: {}
        }
      };

      console.log('📊 PULL ANALYSIS - Downloading data from MongoDB:');

      // 1. Pull read-only tables (customers, users, nodes) - complete replace
      console.log('📋 Read-Only Tables (Master Data):');
      for (const table of this.readOnlyTables) {
        const beforeCount = await this.getLocalRecordCount(table);
        const count = await this.pullReadOnlyTable(table);
        const afterCount = await this.getLocalRecordCount(table);
        
        results.readOnlyTables[table] = count;
        results.totalPulled += count;
        results.details.readOnly[table] = {
          before: beforeCount,
          downloaded: count,
          after: afterCount,
          replaced: beforeCount !== afterCount
        };
        
        console.log(`   📥 ${table}: Downloaded ${count} records (Local: ${beforeCount} → ${afterCount})`);
      }

      // 2. Pull sync tables (sessions, cabinets, etc.) - merge with existing
      console.log('📋 Sync Tables (Merged Data):');
      for (const table of this.syncTables) {
        const beforeCount = await this.getLocalRecordCount(table);
        const count = await this.pullSyncTable(table);
        const afterCount = await this.getLocalRecordCount(table);
        
        results.syncTables[table] = count;
        results.totalPulled += count;
        results.details.sync[table] = {
          before: beforeCount,
          downloaded: count,
          after: afterCount,
          merged: count > 0
        };
        
        if (count > 0) {
          console.log(`   📥 ${table}: Merged ${count} new/updated records (Local: ${beforeCount} → ${afterCount})`);
        } else {
          console.log(`   ℹ️ ${table}: No new updates (Local: ${beforeCount} records)`);
        }
      }
      
      await this.disconnectFromMongo();
      
      console.log('📥 PULL SUMMARY:');
      console.log(`   📊 Total Records Downloaded: ${results.totalPulled}`);
      console.log(`   📋 Read-only tables: ${Object.keys(results.readOnlyTables).length} updated`);
      console.log(`   📋 Sync tables: ${Object.values(results.syncTables).filter(count => count > 0).length} had updates`);
      
      // Update last sync time after successful pull
      await this.updateLastSyncTime();
      
      console.log(`✅ Pull completed successfully`);
      
      return { success: true, message: 'Data pulled from cloud successfully', results };
      
    } catch (error) {
      console.error('❌ Error pulling from cloud:', error);
      await this.disconnectFromMongo();
      return { success: false, error: error.message };
    }
  }

  // Pull read-only table (replace local with cloud data)
  async pullReadOnlyTable(tableName) {
    console.log(`   Pulling ${tableName}...`);
    
    // Get all records from MongoDB
    const cloudRecords = await this.collections[tableName].find({}).toArray();
    
    // Clear local table
    await this.runQuery(this.localDb, `DELETE FROM ${tableName}`);
    
    if (cloudRecords.length === 0) {
      console.log(`   ✅ No records in cloud for ${tableName}`);
      return 0;
    }
    
    // Get column names from first record (excluding MongoDB _id)
    const firstRecord = cloudRecords[0];
    const columns = Object.keys(firstRecord).filter(col => col !== '_id');
    const placeholders = columns.map(() => '?').join(',');
    
    // Insert cloud records into local with datatype conversion
    for (const record of cloudRecords) {
      try {
        const values = columns.map(col => this.convertDataType(record[col], tableName, col));
        await this.runQuery(this.localDb, 
          `INSERT OR REPLACE INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`, 
          values
        );
        const recordInfo = this.getRecordInfo(tableName, record);
        console.log(`     ⬇️ Pulled record${recordInfo}`);
      } catch (error) {
        console.error(`❌ Error inserting record into ${tableName}:`, error.message);
        console.error(`   Record data:`, JSON.stringify(record, null, 2));
        console.error(`   Columns:`, columns);
        console.error(`   Values:`, columns.map(col => record[col]));
        throw error; // Re-throw to stop the sync process
      }
    }
    
    console.log(`   ✅ Pulled ${cloudRecords.length} records from ${tableName}`);
    return cloudRecords.length;
  }

  // Pull sync table (merge with existing data from other devices)
  async pullSyncTable(tableName) {
    console.log(`   Pulling ${tableName}...`);
    
    // For session_node_maintenance, get existing local combinations to avoid downloading duplicates
    let existingCombinations = [];
    if (tableName === 'session_node_maintenance') {
      const localRecords = await this.allQuery(this.localDb, 
        `SELECT DISTINCT session_id, node_id FROM ${tableName}`
      );
      existingCombinations = localRecords.map(r => ({ session_id: r.session_id, node_id: r.node_id }));
      console.log(`🔧 DEBUG: Found ${existingCombinations.length} existing (session_id, node_id) combinations locally`);
    }
    
    // Get records from MongoDB that are newer than our last sync
    // or from other devices that we don't have (excluding deleted records)
    let mongoQuery = {
      $and: [
        { deleted: { $ne: 1 } }, // Exclude deleted records
        {
          $or: [
            { device_id: { $ne: this.deviceId } }, // Records from other devices
            { updated_at: { $gt: await this.getLastSyncTime() } } // Recently updated records
          ]
        }
      ]
    };
    
    // For session_node_maintenance, exclude combinations that already exist locally
    if (tableName === 'session_node_maintenance' && existingCombinations.length > 0) {
      mongoQuery.$and.push({
        $nor: existingCombinations.map(combo => ({
          session_id: combo.session_id,
          node_id: combo.node_id
        }))
      });
      console.log(`🔧 DEBUG: Excluding ${existingCombinations.length} existing combinations from MongoDB query`);
    }
    
    const cloudRecords = await this.collections[tableName].find(mongoQuery).toArray();

    console.log(`     📊 Found ${cloudRecords.length} potential records to sync for ${tableName}`);
    
    let pulledCount = 0;
    let skippedNullUuid = 0;
    let skippedAlreadyCurrent = 0;
    let updatedRecords = 0;
    let insertedRecords = 0;
    let errorCount = 0;
    
    for (const cloudRecord of cloudRecords) {
      // Skip records with null or empty UUIDs to prevent infinite loops
      if (!cloudRecord.uuid || cloudRecord.uuid === 'null' || cloudRecord.uuid.trim() === '') {
        const recordInfo = this.getRecordInfo(tableName, cloudRecord);
        console.log(`     ⚠️ Skipping record with null UUID${recordInfo} - needs UUID generation`);
        skippedNullUuid++;
        continue;
      }
      
      // Check if we have this record locally
      const localRecord = await this.getQuery(this.localDb, 
        `SELECT * FROM ${tableName} WHERE uuid = ?`, [cloudRecord.uuid]
      );
      
      if (localRecord) {
        // Update if cloud record is newer
        const cloudUpdated = new Date(cloudRecord.updated_at);
        const localUpdated = new Date(localRecord.updated_at);
        
        if (cloudUpdated > localUpdated) {
          try {
            await this.updateLocalRecord(tableName, cloudRecord);
            const recordInfo = this.getRecordInfo(tableName, cloudRecord);
            console.log(`     🔄 Updated local record ${cloudRecord.uuid}${recordInfo}`);
            pulledCount++;
            updatedRecords++;
          } catch (updateError) {
            console.error(`❌ Failed to update record in ${tableName}:`, updateError.message);
            console.error(`   UUID: ${cloudRecord.uuid}`);
            errorCount++;
          }
        } else {
          console.log(`     ℹ️ Local record ${cloudRecord.uuid} is already current (${localUpdated.toISOString()} >= ${cloudUpdated.toISOString()})`);
          skippedAlreadyCurrent++;
        }
      } else {
        // Insert new record from other device
        try {
          await this.insertLocalRecord(tableName, cloudRecord);
          const recordInfo = this.getRecordInfo(tableName, cloudRecord);
          console.log(`     ➕ Added new record ${cloudRecord.uuid}${recordInfo}`);
          pulledCount++;
          insertedRecords++;
        } catch (insertError) {
          console.error(`❌ Failed to insert record in ${tableName}:`, insertError.message);
          console.error(`   UUID: ${cloudRecord.uuid}`);
          console.error(`   Record data: ${JSON.stringify(cloudRecord).substring(0, 200)}...`);
          errorCount++;
        }
      }
    }
    
    console.log(`   📊 ${tableName} SYNC BREAKDOWN:`);
    console.log(`     📥 Downloaded from cloud: ${cloudRecords.length} records`);
    console.log(`     ➕ Inserted new: ${insertedRecords}`);
    console.log(`     🔄 Updated existing: ${updatedRecords}`);
    console.log(`     ℹ️ Skipped (already current): ${skippedAlreadyCurrent}`);
    console.log(`     ⚠️ Skipped (null UUID): ${skippedNullUuid}`);
    console.log(`     ❌ Errors: ${errorCount}`);
    console.log(`     ✅ Total processed: ${pulledCount}`);
    
    return cloudRecords.length; // Return total downloaded, not just processed
  }

  // PUSH: Upload local changes to MongoDB cloud
  async pushToCloud() {
    console.log('📤 Pushing changes to MongoDB cloud...');
    
    try {
      await this.connectToMongo();
      
      const results = {
        sessions: 0,
        cabinets: 0,
        session_node_maintenance: 0,
        session_node_tracker: 0,
        cabinet_locations: 0,
        session_diagnostics: 0,
        totalPushed: 0,
        details: {}
      };

      // First, get counts of unsynced records for detailed logging
      console.log('📊 PUSH ANALYSIS - Checking unsynced records:');
      for (const table of this.syncTables) {
        const unsyncedCount = await this.getUnsyncedCount(table);
        console.log(`   📋 ${table}: ${unsyncedCount} unsynced records ready to push`);
        results.details[table] = { unsynced: unsyncedCount, pushed: 0 };
      }

      // Push each table's unsynced records
      for (const table of this.syncTables) {
        const pushedCount = await this.pushTableToCloud(table);
        results[table] = pushedCount;
        results.totalPushed += pushedCount;
        results.details[table].pushed = pushedCount;
        
        if (pushedCount > 0) {
          console.log(`   ✅ ${table}: Successfully pushed ${pushedCount} records to MongoDB`);
        } else {
          console.log(`   ℹ️ ${table}: No records to push (already synced)`);
        }
      }
      
      await this.disconnectFromMongo();
      
      console.log('📤 PUSH SUMMARY:');
      console.log(`   📊 Total Records Pushed: ${results.totalPushed}`);
      Object.entries(results.details).forEach(([table, detail]) => {
        if (detail.pushed > 0) {
          console.log(`   📋 ${table}: ${detail.pushed}/${detail.unsynced} records uploaded`);
        }
      });
      console.log(`✅ Push completed successfully`);
      return { success: true, results };
      
    } catch (error) {
      console.error('❌ Error pushing to cloud:', error);
      await this.disconnectFromMongo();
      return { success: false, error: error.message };
    }
  }

  // Helper method to get count of unsynced records
  async getUnsyncedCount(tableName) {
    try {
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName} WHERE synced = 0`);
      const result = stmt.get();
      return result ? result.count : 0;
    } catch (error) {
      console.warn(`Warning: Could not get unsynced count for ${tableName}:`, error.message);
      return 0;
    }
  }

  // Helper method to get total record count in local table
  async getLocalRecordCount(tableName) {
    try {
      const result = await this.getQuery(this.localDb, `SELECT COUNT(*) as count FROM ${tableName}`, []);
      return result ? result.count : 0;
    } catch (error) {
      console.warn(`Warning: Could not get record count for ${tableName}:`, error.message);
      return 0;
    }
  }

  // Push unsynced records from a specific table to MongoDB
  async pushTableToCloud(tableName) {
    console.log(`   Pushing ${tableName}...`);
    
    // Get unsynced records from local database
    const unsyncedRecords = await this.allQuery(this.localDb, 
      `SELECT * FROM ${tableName} WHERE synced = 0`
    );
    
    // Safety check: Warn if pushing from a potentially empty/outdated database
    if (unsyncedRecords.length === 0) {
      console.log(`   ℹ️ No unsynced records to push from ${tableName}`);
      return 0;
    }
    
    // Additional safety: Check if local database seems outdated
    const totalLocalRecords = await this.getQuery(this.localDb, 
      `SELECT COUNT(*) as count FROM ${tableName}`
    );
    const cloudRecordCount = await this.collections[tableName].countDocuments({});
    
    if (totalLocalRecords.count === 0 && cloudRecordCount > 0) {
      console.log(`   ⚠️ WARNING: Local ${tableName} is empty but cloud has ${cloudRecordCount} records. Skipping push for safety.`);
      return 0;
    }
    
    if (totalLocalRecords.count > 0 && cloudRecordCount > totalLocalRecords.count * 3) {
      console.log(`   ⚠️ WARNING: Local ${tableName} has ${totalLocalRecords.count} records but cloud has ${cloudRecordCount}. Database may be outdated.`);
    }
    
    let pushedCount = 0;
    
    for (const record of unsyncedRecords) {
      // Convert SQLite record to MongoDB document
      const mongoDoc = { ...record };
      // Preserve original SQLite ID for restoration when pulling back
      if (mongoDoc.id) {
        mongoDoc.original_id = mongoDoc.id;
        delete mongoDoc.id; // Remove to avoid MongoDB conflicts
      }
      
      // Convert timestamps to proper Date objects for MongoDB
      if (mongoDoc.created_at) {
        mongoDoc.created_at = new Date(mongoDoc.created_at);
      }
      if (mongoDoc.updated_at) {
        mongoDoc.updated_at = new Date(mongoDoc.updated_at);
      }
      if (mongoDoc.completed_at) {
        mongoDoc.completed_at = new Date(mongoDoc.completed_at);
      }
      
      // Ensure created_at exists for time-series collections
      if (!mongoDoc.created_at || isNaN(mongoDoc.created_at.getTime())) {
        mongoDoc.created_at = new Date();
      }
      
      // Check if record already exists (to avoid duplicates)
      const existingDoc = await this.collections[tableName].findOne({ uuid: record.uuid });
      
      if (record.deleted === 1) {
        // Handle deletion
        if (existingDoc) {
          await this.collections[tableName].deleteOne({ uuid: record.uuid });
          const recordInfo = this.getRecordInfo(tableName, record);
          console.log(`   🗑️ Deleted record ${record.uuid} from ${tableName}${recordInfo}`);
        } else {
          console.log(`   ⚠️ Record ${record.uuid} not found in ${tableName} for deletion, skipping`);
        }
      } else if (!existingDoc) {
        // Insert new document (works for both regular and time-series collections)
        await this.collections[tableName].insertOne(mongoDoc);
        const recordInfo = this.getRecordInfo(tableName, record);
        console.log(`   ✅ Inserted new record ${record.uuid} to ${tableName}${recordInfo}`);
      } else {
        // Update existing document
        delete mongoDoc._id; // Remove _id to avoid conflicts
        await this.collections[tableName].replaceOne({ uuid: record.uuid }, mongoDoc);
        const recordInfo = this.getRecordInfo(tableName, record);
        console.log(`   🔄 Updated existing record ${record.uuid} in ${tableName}${recordInfo}`);
      }
      
      pushedCount++;
    }
    
    // Mark local records as synced
    await this.runQuery(this.localDb, `UPDATE ${tableName} SET synced = 1 WHERE synced = 0`);
    
    console.log(`   ✅ Pushed ${pushedCount} records from ${tableName}`);
    return pushedCount;
  }

  // Insert cloud record into local database
  async insertLocalRecord(tableName, cloudRecord) {
    console.log(`🔧 DEBUG: insertLocalRecord called for ${tableName}, UUID: ${cloudRecord.uuid}`);
    
    // Get table schema - for sessions table, include id column since it's TEXT PRIMARY KEY, not auto-increment
    const tableInfo = await this.allQuery(this.localDb, `PRAGMA table_info(${tableName})`);
    let columns;
    if (tableName === 'sessions') {
      // Sessions table has TEXT PRIMARY KEY id, so we need to include it
      columns = tableInfo.map(col => col.name);
    } else {
      // Other tables have INTEGER AUTOINCREMENT id, so exclude it
      columns = tableInfo.map(col => col.name).filter(col => col !== 'id');
    }
    
    // Prepare values (include id for sessions table, exclude for others)
    const values = columns.map(col => cloudRecord[col] || null);
    
    const placeholders = columns.map(() => '?').join(',');
    
    try {
      const convertedValues = values.map((val, idx) => this.convertDataType(val, tableName, columns[idx]));
      console.log(`🔧 DEBUG: About to INSERT into ${tableName} (excluding id)`);
      console.log(`🔧 DEBUG: Columns: ${columns.join(', ')}`);
      console.log(`🔧 DEBUG: Values: ${convertedValues.join(', ')}`);
      
      // First check if record already exists by UUID
      let existingRecord = await this.getQuery(this.localDb, 
        `SELECT id FROM ${tableName} WHERE uuid = ?`, [cloudRecord.uuid]
      );
      
      if (existingRecord) {
        console.log(`🔧 DEBUG: Record exists with UUID, ID: ${existingRecord.id}, updating instead`);
        
        // Update all columns except uuid (id is not in our columns list)
        const updateColumns = columns.filter(col => col !== 'uuid');
        const updateValues = [];
        const updatePlaceholders = [];
        
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          if (col !== 'uuid') {
            updatePlaceholders.push(`${col} = ?`);
            updateValues.push(convertedValues[i]);
          }
        }
        
        await this.runQuery(this.localDb,
          `UPDATE ${tableName} SET ${updatePlaceholders.join(', ')} WHERE uuid = ?`,
          [...updateValues, cloudRecord.uuid]
        );
        console.log(`🔧 DEBUG: Successfully updated existing record by UUID`);
      } else {
        // No record with this UUID, but check for composite unique constraints
        if (tableName === 'session_node_maintenance' && cloudRecord.session_id && cloudRecord.node_id) {
          existingRecord = await this.getQuery(this.localDb, 
            `SELECT id, uuid FROM ${tableName} WHERE session_id = ? AND node_id = ?`, 
            [cloudRecord.session_id, cloudRecord.node_id]
          );
          
          if (existingRecord) {
            console.log(`🔧 DEBUG: Record exists with (session_id, node_id) constraint, ID: ${existingRecord.id}, UUID: ${existingRecord.uuid}, updating instead`);
            
            // Update all columns except uuid (id is not in our columns list)
            const updateColumns = columns.filter(col => col !== 'uuid');
            const updateValues = [];
            const updatePlaceholders = [];
            
            for (let i = 0; i < columns.length; i++) {
              const col = columns[i];
              if (col !== 'uuid') {
                updatePlaceholders.push(`${col} = ?`);
                updateValues.push(convertedValues[i]);
              }
            }
            
            await this.runQuery(this.localDb,
              `UPDATE ${tableName} SET ${updatePlaceholders.join(', ')} WHERE session_id = ? AND node_id = ?`,
              [...updateValues, cloudRecord.session_id, cloudRecord.node_id]
            );
            console.log(`🔧 DEBUG: Successfully updated existing record by (session_id, node_id)`);
          } else {
            // Record doesn't exist, insert new (without id - let SQLite auto-generate)
            console.log(`🔧 DEBUG: Record doesn't exist, inserting new record`);
            await this.runQuery(this.localDb, 
              `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`, 
              convertedValues
            );
            console.log(`🔧 DEBUG: Successfully inserted new record`);
          }
        } else {
          // Record doesn't exist, insert new (without id - let SQLite auto-generate)
          console.log(`🔧 DEBUG: Record doesn't exist, inserting new record`);
          await this.runQuery(this.localDb, 
            `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`, 
            convertedValues
          );
          console.log(`🔧 DEBUG: Successfully inserted new record`);
        }
      }
      
      console.log(`🔧 DEBUG: INSERT OR REPLACE completed for ${cloudRecord.uuid}`);
      
      // Verify the record was actually inserted
      const checkRecord = await this.getQuery(this.localDb, 
        `SELECT uuid FROM ${tableName} WHERE uuid = ?`, [cloudRecord.uuid]
      );
      
      if (checkRecord) {
        console.log(`🔧 DEBUG: ✅ Record ${cloudRecord.uuid} successfully persisted in ${tableName}`);
      } else {
        console.log(`🔧 DEBUG: ❌ Record ${cloudRecord.uuid} NOT found after insert in ${tableName}`);
      }
      
    } catch (error) {
      console.error(`❌ Error inserting record into ${tableName}:`, error.message);
      console.error(`   Columns:`, columns);
      console.error(`   Values:`, values);
      console.error(`   Record:`, JSON.stringify(cloudRecord, null, 2));
      throw error;
    }
  }

  // Update local record with cloud data
  async updateLocalRecord(tableName, cloudRecord) {
    // Get table schema (exclude primary keys)
    const tableInfo = await this.allQuery(this.localDb, `PRAGMA table_info(${tableName})`);
    const columns = tableInfo
      .filter(col => !col.pk && col.name !== 'uuid') // Exclude primary keys and UUID
      .map(col => col.name);
    
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const values = columns.map(col => {
      let value;
      // Handle original_id restoration for id field, or use uuid as fallback
      if (col === 'id') {
        if (cloudRecord.original_id) {
          value = cloudRecord.original_id; // Restore original SQLite ID
        } else if (cloudRecord.uuid) {
          value = cloudRecord.uuid; // Use UUID as ID if no original_id
        } else {
          value = null;
        }
      } else {
        value = cloudRecord[col] || null;
      }
      return this.convertDataType(value, tableName, col);
    });
    values.push(cloudRecord.uuid); // Add UUID for WHERE clause
    
    try {
      await this.runQuery(this.localDb, 
        `UPDATE ${tableName} SET ${setClause} WHERE uuid = ?`, 
        values
      );
    } catch (error) {
      console.error(`❌ Error updating record in ${tableName}:`, error.message);
      console.error(`   Columns:`, columns);
      console.error(`   Values:`, values);
      console.error(`   UUID:`, cloudRecord.uuid);
      console.error(`   Record:`, JSON.stringify(cloudRecord, null, 2));
      throw error;
    }
  }

  // Convert data types to be compatible with SQLite
  convertDataType(value, tableName, columnName) {
    // Handle null/undefined values
    if (value === null || value === undefined) {
      return null;
    }
    
    // Handle specific column types based on common patterns
    switch (columnName) {
      case 'id':
        // ID can be integer, UUID string, or null depending on table
        if (typeof value === 'string') {
          // Check if it's a numeric string (for integer IDs)
          if (value.match(/^\d+$/)) {
            return parseInt(value);
          }
          // Check if it's a UUID string (for UUID IDs like sessions)
          if (value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            return value; // Keep UUID as string
          }
          // Other non-empty strings are kept as-is
          return value.trim() === '' ? null : value;
        }
        return typeof value === 'number' ? value : null;
        
      case 'synced':
      case 'deleted':
      case 'redundant':
        // Boolean fields should be 0 or 1
        if (typeof value === 'boolean') {
          return value ? 1 : 0;
        }
        if (typeof value === 'string') {
          return (value === 'true' || value === '1') ? 1 : 0;
        }
        return value === 1 ? 1 : 0;
        
      case 'created_at':
      case 'updated_at':
      case 'completed_at':
      case 'assigned_at':
        // Date fields should be ISO strings or null
        if (value instanceof Date) {
          return value.toISOString();
        }
        if (typeof value === 'string') {
          if (value.trim() === '') {
            return null;
          }
          // Check if it's already a valid ISO date string
          if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
            return value; // Already a valid ISO string
          }
          // Try to parse as date and convert to ISO
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toISOString();
          }
        }
        return null;
        
      case 'uuid':
      case 'device_id':
      case 'session_name':
      case 'cabinet_location':
      case 'customer_name':
      case 'node_name':
        // Text fields should be strings or null
        if (typeof value === 'string' && value.trim() === '') {
          return null;
        }
        return typeof value === 'string' ? value : String(value);
        
      default:
        // For other fields, try to maintain type but handle edge cases
        if (typeof value === 'string' && value.trim() === '') {
          return null;
        }
        return value;
    }
  }

  // Get readable record information for logging
  getRecordInfo(tableName, record) {
    try {
      switch (tableName) {
        case 'sessions':
          return record.id ? ` (Session: ${record.id})` : '';
        case 'cabinets':
          return record.cabinet_location ? ` (Cabinet: ${record.cabinet_location})` : '';
        case 'session_node_maintenance':
          return record.session_id && record.node_id ? ` (Session: ${record.session_id}, Node: ${record.node_id})` : '';
        case 'session_node_tracker':
          return record.session_id && record.node_id ? ` (Session: ${record.session_id}, Node: ${record.node_id})` : '';
        case 'cabinet_locations':
          return record.location_name ? ` (Location: ${record.location_name})` : '';
        case 'customers':
          return record.name ? ` (Customer: ${record.name})` : '';
        case 'nodes':
          return record.node_name ? ` (Node: ${record.node_name})` : '';
        case 'users':
          return record.username ? ` (User: ${record.username})` : '';
        default:
          return '';
      }
    } catch (error) {
      return '';
    }
  }

  // Get last sync timestamp
  async getLastSyncTime() {
    try {
      // Get last sync time from sync_metadata table
      const result = await this.getQuery(this.localDb, 
        `SELECT value FROM sync_metadata WHERE key = 'last_pull_time'`
      );
      
      if (result && result.value) {
        console.log(`🔧 DEBUG: Found stored last sync time: ${result.value}`);
        return result.value;
      } else {
        // If no last sync time, return 24 hours ago for initial sync
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        const fallbackTime = yesterday.toISOString();
        console.log(`🔧 DEBUG: No stored sync time, using fallback: ${fallbackTime}`);
        return fallbackTime;
      }
    } catch (error) {
      console.warn('Could not get last sync time:', error.message);
      // Fallback to 24 hours ago
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      const fallbackTime = yesterday.toISOString();
      console.log(`🔧 DEBUG: Error getting sync time, using fallback: ${fallbackTime}`);
      return fallbackTime;
    }
  }

  // Update last sync time after successful pull
  async updateLastSyncTime() {
    console.log('🔧 DEBUG: updateLastSyncTime() called');
    try {
      const now = new Date().toISOString();
      console.log(`🔧 DEBUG: Current time: ${now}`);
      
      // Create sync_metadata table if it doesn't exist
      await this.runQuery(this.localDb, `
        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('🔧 DEBUG: sync_metadata table created/verified');
      
      // Insert or update last sync time
      await this.runQuery(this.localDb, `
        INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) 
        VALUES ('last_pull_time', ?, CURRENT_TIMESTAMP)
      `, [now]);
      console.log('🔧 DEBUG: last_pull_time inserted/updated');
      
      console.log(`   ⏰ Updated last sync time to: ${now}`);
    } catch (error) {
      console.error('❌ Could not update last sync time:', error.message);
      console.error('❌ Full error:', error);
    }
  }

  // Get sync status
  async getSyncStatus() {
    const status = {
      deviceId: this.deviceId,
      unsyncedRecords: {},
      totalUnsynced: 0,
      mongoConnectionString: this.mongoConnectionString ? '✅ Configured' : '❌ Not configured',
      lastSync: await this.getLastSyncTime()
    };

    for (const table of this.syncTables) {
      try {
        const count = await this.getQuery(this.localDb, 
          `SELECT COUNT(*) as count FROM ${table} WHERE synced = 0`
        );
        status.unsyncedRecords[table] = count ? count.count : 0;
        status.totalUnsynced += status.unsyncedRecords[table];
      } catch (error) {
        status.unsyncedRecords[table] = 0;
      }
    }

    return status;
  }

  // Full sync: Pull then Push
  async fullSync() {
    console.log('🔄 Starting full sync (pull + push)...');
    
    const results = {
      pull: null,
      push: null,
      success: false
    };

    try {
      // First pull latest data from cloud
      results.pull = await this.pullFromCloud();
      
      if (!results.pull.success) {
        throw new Error(`Pull failed: ${results.pull.error}`);
      }

      // Then push our changes
      results.push = await this.pushToCloud();
      
      if (!results.push.success) {
        throw new Error(`Push failed: ${results.push.error}`);
      }

      results.success = true;
      console.log('✅ Full sync completed successfully');
      
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      results.error = error.message;
    }

    return results;
  }

  // Full refresh: completely replace local data with master data
  async fullRefresh() {
    console.log('🔄 Starting full refresh (replace all local data with master data)...');
    
    try {
      // Ensure MongoDB connection is established
      if (!this.mongoClient || !this.database || Object.keys(this.collections).length === 0) {
        console.log('🔗 MongoDB not connected, establishing connection...');
        await this.connectToMongo();
      }
      
      // Verify collections are available
      if (Object.keys(this.collections).length === 0) {
        throw new Error('MongoDB collections not initialized. Please check your MongoDB connection.');
      }
      
      let totalRefreshed = 0;
      const results = {};
      
      // Process each sync table
      for (const tableName of this.syncTables) {
        // Check if collection exists
        if (!this.collections[tableName]) {
          console.log(`⚠️ Skipping ${tableName} - collection not found in MongoDB`);
          continue;
        }
        console.log(`🗑️ Clearing local ${tableName} table...`);
        
        // Delete all existing records from this table
        await this.runQuery(this.localDb, `DELETE FROM ${tableName}`);
        
        console.log(`📥 Downloading all ${tableName} from master...`);
        
        // Get ALL records from MongoDB (no filtering, no device checks)
        const allCloudRecords = await this.collections[tableName].find({
          deleted: { $ne: 1 } // Only exclude explicitly deleted records
        }).toArray();
        
        console.log(`   📊 Found ${allCloudRecords.length} records in master ${tableName}`);
        
        let insertedCount = 0;
        
        // Insert each record exactly as-is from master
        for (const cloudRecord of allCloudRecords) {
          try {
            await this.insertExactRecord(tableName, cloudRecord);
            insertedCount++;
          } catch (error) {
            console.error(`❌ Error inserting record ${cloudRecord.id || cloudRecord.uuid}:`, error.message);
          }
        }
        
        console.log(`   ✅ Inserted ${insertedCount} records into local ${tableName}`);
        results[tableName] = insertedCount;
        totalRefreshed += insertedCount;
      }
      
      // Update sync timestamp
      await this.updateLastSyncTime();
      
      return {
        success: true,
        totalRefreshed,
        results,
        message: `Full refresh completed: ${totalRefreshed} records refreshed`
      };
      
    } catch (error) {
      console.error('❌ Full refresh failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Insert record exactly as-is from master (no UUID mapping or conflict resolution)
  async insertExactRecord(tableName, cloudRecord) {
    // Get table schema - include ALL columns
    const tableInfo = await this.allQuery(this.localDb, `PRAGMA table_info(${tableName})`);
    const columns = tableInfo.map(col => col.name);
    
    // Prepare values exactly as they are in master
    const values = columns.map(col => {
      const value = cloudRecord[col];
      // Convert MongoDB ObjectId to string if needed
      if (value && typeof value === 'object' && value._id) {
        return value._id.toString();
      }
      return value || null;
    });
    
    const placeholders = columns.map(() => '?').join(',');
    
    try {
      const convertedValues = values.map((val, idx) => this.convertDataType(val, tableName, columns[idx]));
      
      await this.runQuery(this.localDb, 
        `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`, 
        convertedValues
      );
      
    } catch (error) {
      console.error(`❌ Error inserting exact record into ${tableName}:`, error.message);
      console.error(`   Columns:`, columns);
      console.error(`   Values:`, values);
      throw error;
    }
  }

  // Close database connections
  async close() {
    if (this.localDb) {
      this.localDb.close();
    }
    await this.disconnectFromMongo();
  }
}

// Export for use in main application
console.log('✅ Exporting MongoCloudSyncManager class');
module.exports = MongoCloudSyncManager;

// CLI usage example
if (require.main === module) {
  async function main() {
    const localDbPath = './cabinet_pm_tablet.db';
    const mongoConnectionString = process.argv[3] || process.env.MONGO_CONNECTION_STRING;
    
    if (!mongoConnectionString) {
      console.error('❌ MongoDB connection string required');
      console.log('Usage: node mongo-cloud-sync.js [command] [mongo_connection_string]');
      console.log('Or set MONGO_CONNECTION_STRING environment variable');
      return;
    }
    
    const syncManager = new MongoCloudSyncManager(localDbPath, mongoConnectionString);
    await syncManager.init();
    
    const command = process.argv[2];
    
    try {
      switch (command) {
        case 'pull':
          const pullResult = await syncManager.pullFromCloud();
          console.log('Pull Result:', pullResult);
          break;
          
        case 'push':
          const pushResult = await syncManager.pushToCloud();
          console.log('Push Result:', pushResult);
          break;
          
        case 'sync':
          const syncResult = await syncManager.fullSync();
          console.log('Sync Result:', syncResult);
          break;
          
        case 'status':
          const status = await syncManager.getSyncStatus();
          console.log('Sync Status:', status);
          break;
          
        case 'setup':
          await syncManager.generateMissingUUIDs();
          console.log('✅ Setup completed - UUIDs generated');
          break;
          
        case 'test':
          const testResult = await syncManager.testConnection();
          console.log('Connection Test:', testResult);
          break;
          
        default:
          console.log('Usage: node mongo-cloud-sync.js [pull|push|sync|status|setup|test] [mongo_connection_string]');
          console.log('');
          console.log('Commands:');
          console.log('  pull   - Download latest data from MongoDB cloud');
          console.log('  push   - Upload local changes to MongoDB cloud');
          console.log('  sync   - Full sync (pull then push)');
          console.log('  status - Show sync status');
          console.log('  setup  - Generate UUIDs for existing records');
          console.log('  test   - Test MongoDB connection');
      }
    } catch (error) {
      console.error('❌ Command failed:', error.message);
    }
    
    await syncManager.close();
  }
  
  main().catch(console.error);
}
