// Enhanced Merge Replication Manager
// Implements proper bi-directional sync with conflict resolution and tombstone handling
const mongoose = require('mongoose');
const models = require('../models/mongodb-models');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { normalizeMongoUri } = require('../utils/mongo-uri');

class EnhancedMergeReplication {
  constructor(localDb, mongoConnectionString) {
    this.localDb = localDb;
    this.mongoConnectionString = normalizeMongoUri(mongoConnectionString);
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
      'session_diagnostics',
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
      'customer_metric_history',
      'customer_notes'
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
      'session_diagnostics': models.SessionDiagnostics,
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
      'customer_metric_history': models.CustomerMetricHistory,
      'customer_notes': models.CustomerNote
    };

    // Conflict resolution strategy: 'local_wins', 'master_wins', 'latest_wins'
    this.conflictStrategy = 'latest_wins';

    /** @type {Map<string, string[]>} PRAGMA table_info names per table — avoids N×PRAGMA per pull */
    this._tableColumnNamesCache = new Map();
    /** @type {Map<string, number|string>} master Mongo customer _id → local customers.id */
    this._masterCustomerResolveCache = new Map();
  }

  invalidateTableColumnCache(tableName = null) {
    if (tableName) this._tableColumnNamesCache.delete(tableName);
    else this._tableColumnNamesCache.clear();
  }

  async getTableColumnNames(tableName) {
    if (this._tableColumnNamesCache.has(tableName)) {
      return this._tableColumnNamesCache.get(tableName);
    }
    const names = await new Promise((resolve, reject) => {
      this.localDb.all(`PRAGMA table_info(${tableName})`, (err, cols) => {
        if (err) reject(err);
        else resolve((cols || []).map((c) => c.name));
      });
    });
    this._tableColumnNamesCache.set(tableName, names);
    return names;
  }

  /** True when this device has no PM data yet — safe for one-shot fast pull from cloud */
  async localEmptyForBootstrap() {
    const countActive = (table) =>
      new Promise((resolve, reject) => {
        this.localDb.get(
          `SELECT COUNT(*) as c FROM ${table} WHERE COALESCE(deleted, 0) != 1`,
          (err, row) => (err ? reject(err) : resolve(row ? row.c : 0))
        );
      });
    const [cust, sess, cab] = await Promise.all([
      countActive('customers'),
      countActive('sessions'),
      countActive('cabinets'),
    ]);
    return cust === 0 && sess === 0 && cab === 0;
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
    const connStart = Date.now();
    const dns  = require('dns').promises;
    const net  = require('net');
    const os   = require('os');

    // ── Parse the connection string for diagnostics ──────────────────────────
    let parsedHost = '(unknown)';
    let parsedPort = 27017;
    let parsedDb   = '(unknown)';
    try {
      // Strip mongodb+srv:// or mongodb:// prefix then grab first host token
      const stripped = this.mongoConnectionString
        .replace(/^mongodb(\+srv)?:\/\//, '')
        .replace(/^[^@]+@/, '');           // remove user:pass@
      const hostPart = stripped.split('/')[0].split(',')[0]; // first host
      const dbPart   = stripped.split('/')[1]?.split('?')[0] || '(none)';
      const colonIdx = hostPart.lastIndexOf(':');
      if (colonIdx > 0) {
        parsedHost = hostPart.slice(0, colonIdx);
        parsedPort = parseInt(hostPart.slice(colonIdx + 1), 10) || 27017;
      } else {
        parsedHost = hostPart;
      }
      parsedDb = dbPart;
    } catch (_) { /* parsing is best-effort */ }

    console.log('');
    console.log('🔗 ═══════════════════════════════════════════════════════');
    console.log('🔗  Connecting to MongoDB master server');
    console.log(`🔗  Host          : ${parsedHost}`);
    console.log(`🔗  Port          : ${parsedPort}`);
    console.log(`🔗  Database      : ${parsedDb}`);
    console.log(`🔗  This machine  : ${os.hostname()} (${Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address).join(', ') || 'no external IPv4 found'})`);
    console.log('🔗 ═══════════════════════════════════════════════════════');

    // ── DNS resolution check (skipped for bare IP addresses) ────────────────
    if (parsedHost && parsedHost !== '(unknown)') {
      if (net.isIP(parsedHost) !== 0) {
        console.log(`🌐 DNS skip: ${parsedHost} is a bare IP address — no DNS lookup needed`);
      } else {
        try {
          const dnsStart = Date.now();
          const addrs = await dns.resolve4(parsedHost).catch(() => dns.resolve6(parsedHost));
          console.log(`🌐 DNS OK  : ${parsedHost} → ${addrs.join(', ')} (${Date.now() - dnsStart}ms)`);
        } catch (dnsErr) {
          console.error(`❌ DNS FAIL: Cannot resolve "${parsedHost}" — ${dnsErr.code || dnsErr.message}`);
          console.error('   This usually means the hostname is unreachable from this machine.');
          console.error('   Check: VPN connected? DNS server reachable? Hostname correct in .env?');
        }
      }
    }

    // ── TCP port reachability check ───────────────────────────────────────────
    if (parsedHost && parsedHost !== '(unknown)') {
      await new Promise(resolve => {
        const tcpStart = Date.now();
        const socket   = new net.Socket();
        const timeout  = 5000;
        socket.setTimeout(timeout);
        socket.connect(parsedPort, parsedHost, () => {
          console.log(`🔌 TCP OK  : ${parsedHost}:${parsedPort} reachable (${Date.now() - tcpStart}ms)`);
          socket.destroy();
          resolve();
        });
        socket.on('error', (err) => {
          console.error(`❌ TCP FAIL: ${parsedHost}:${parsedPort} — ${err.code || err.message} (${Date.now() - tcpStart}ms)`);
          console.error(`   Code: ${err.code}`);
          if (err.code === 'ECONNREFUSED') console.error('   MongoDB port is closed or not listening on that host.');
          if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') console.error('   Host unreachable — check VPN/firewall/routing.');
          socket.destroy();
          resolve();
        });
        socket.on('timeout', () => {
          console.error(`❌ TCP TOUT: ${parsedHost}:${parsedPort} timed out after ${timeout}ms`);
          console.error('   Firewall may be silently dropping packets. Check VPN and port rules.');
          socket.destroy();
          resolve();
        });
      });
    }

    // ── Mongoose connect ──────────────────────────────────────────────────────
    try {
      console.log('🔗 Attempting mongoose.connect()...');
      await mongoose.connect(this.mongoConnectionString, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS:         15000,
        socketTimeoutMS:          30000,
      });
      this.isConnected = true;
      const elapsed = Date.now() - connStart;
      console.log(`✅ MongoDB connected  (total: ${elapsed}ms)`);
      console.log('');
      return true;
    } catch (error) {
      const elapsed = Date.now() - connStart;
      console.error('');
      console.error('❌ ═══════════════════════════════════════════════════════');
      console.error('❌  MongoDB connection FAILED');
      console.error(`❌  Error       : ${error.message}`);
      console.error(`❌  Error code  : ${error.code || error.codeName || '(none)'}`);
      console.error(`❌  Error name  : ${error.name}`);
      console.error(`❌  Elapsed     : ${elapsed}ms`);
      if (error.reason) {
        console.error(`❌  Topology    : ${JSON.stringify(error.reason)}`);
      }
      console.error('❌ ─────────────────────────────────────────────────────');
      console.error('❌  Checklist:');
      console.error('❌    • Is the VPN tunnel active on this machine?');
      console.error('❌    • Can you ping the MongoDB host from this machine?');
      console.error(`❌    • Is port ${parsedPort} open in the firewall between this machine and the host?`);
      console.error('❌    • Is the MongoDB Atlas IP allowlist up to date for this VPN exit IP?');
      console.error('❌    • Are the MONGO_URI credentials in .env correct?');
      console.error('❌ ═══════════════════════════════════════════════════════');
      console.error('');
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

  async pullFromMaster(options = {}) {
    const bootstrap = options.bootstrap === true;
    try {
      console.log(
        bootstrap
          ? '📥 Bootstrap pull: loading full cloud snapshot (fast path, empty local PM data)...'
          : '📥 Pulling changes from master database...'
      );
      const pullStart = Date.now();
      await this.ensureSyncTablesSupportMasterIds();

      if (bootstrap) {
        const empty = await this.localEmptyForBootstrap();
        if (!empty) {
          return {
            success: false,
            error:
              'First-time fast download is only available when there are no customers, sessions, or cabinets yet. Use the regular Download button.',
          };
        }
        this._masterCustomerResolveCache = new Map();
        console.log('   ✅ Local DB eligible for bootstrap (no customers / sessions / cabinets)');
      }

      let totalPulled = 0;
      let totalConflicts = 0;
      const conflictsResolved = [];
      const results = {};

      const skipSet = new Set(options.skipTables || []);
      const tablesToPull =
        skipSet.size > 0 ? this.syncTables.filter((t) => !skipSet.has(t)) : this.syncTables;
      if (skipSet.size > 0) {
        console.log(`   ⏭️  Skipping ${skipSet.size} table(s) for bulk snapshot: ${[...skipSet].join(', ')}`);
      }

      for (const tableName of tablesToPull) {
        try {
          console.log(`\n📥 Processing table: ${tableName}`);
          
          const Model = this.modelMap[tableName];
          const lastSync = bootstrap ? null : await this.getLastSyncTime(tableName);
          
          console.log(`   ⏰ Last sync: ${bootstrap ? '(bootstrap — full table)' : lastSync || 'never'}`);

          // Query strategy:
          // 1. Get all records updated since last sync
          // 2. Include tombstones (deleted=1) so we can propagate deletions
          // 3. If never synced, get everything
          // Bootstrap: always full active snapshot only (no per-row existence/conflict work)
          let query = {};
          if (bootstrap) {
            query = { deleted: { $ne: 1 } };
          } else if (lastSync) {
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
              const result = await this.mergeRecordFromMaster(tableName, masterRecord, { bootstrap });
              
              if (result.action === 'deleted') {
                deletedCount++;
              } else if (result.conflict) {
                conflictCount++;
                conflictsResolved.push({
                  table: tableName,
                  recordId: masterRecord._id,
                  resolution: result.resolution
                });
              } else if (result.action === 'skipped_tombstone') {
                // Bootstrap path ignores remote tombstones when local is empty
              } else {
                pulledCount++;
              }
            } catch (recordError) {
              console.error(`   ❌ Error processing record ${masterRecord._id}:`, recordError.message);
            }
          }

          // SECOND PASS: reconcile rows that never arrived (timestamp pull miss) or id collision across devices
          if (!bootstrap && lastSync) {
            const businessKeyReconcileTables = ['session_diagnostics', 'session_node_maintenance'];
            let reconciledCount = 0;

            if (businessKeyReconcileTables.includes(tableName)) {
              const localSessionRows = await new Promise((res, rej) => {
                this.localDb.all(
                  `SELECT id, customer_id, session_name FROM sessions WHERE COALESCE(deleted, 0) != 1`,
                  (err, rows) => (err ? rej(err) : res(rows || []))
                );
              });
              const sessionIds = localSessionRows.map((r) => r.id).filter(Boolean);
              const extraMasterSessionIds = await this.getMasterSessionIdsForLocalSessions(localSessionRows);
              const allSessionIds = [...new Set([...sessionIds, ...extraMasterSessionIds])];
              if (allSessionIds.length > 0) {
                console.log(
                  `   🔍 Business-key reconcile for ${tableName} (${sessionIds.length} local + ${extraMasterSessionIds.length} master-mapped sessions)...`
                );
                const masterRecords = await Model.find({
                  session_id: { $in: allSessionIds },
                  deleted: { $ne: 1 },
                }).lean();

                for (const masterRecord of masterRecords) {
                  try {
                    const masterData = this.convertMongoToSQLite(masterRecord);
                    await this.remapSessionIdFromMasterToLocal(masterData, tableName);
                    const localByKey = await this.findLocalRecordByBusinessKey(tableName, masterData);
                    if (!localByKey) {
                      const result = await this.mergeRecordFromMaster(tableName, masterRecord, { bootstrap });
                      if (result.action === 'inserted' || result.action === 'updated') {
                        reconciledCount++;
                      }
                    }
                  } catch (err) {
                    console.warn(
                      `   ⚠️  Business-key reconcile error ${tableName}:`,
                      err.message
                    );
                  }
                }
              }
            } else {
              const [masterCount, localCountRow] = await Promise.all([
                Model.countDocuments({ deleted: { $ne: 1 } }),
                new Promise((res, rej) => {
                  this.localDb.get(
                    `SELECT COUNT(*) as c FROM ${tableName} WHERE COALESCE(deleted, 0) != 1`,
                    (err, row) => (err ? rej(err) : res(row))
                  );
                }),
              ]);
              const localCount = localCountRow ? localCountRow.c : 0;

              if (masterCount !== localCount) {
                console.log(`   🔍 Count mismatch (master: ${masterCount}, local: ${localCount}) — reconciling...`);

                const [activeMasterIds, localRows] = await Promise.all([
                  Model.find({ deleted: { $ne: 1 } }).select('_id').limit(10000).lean(),
                  new Promise((res, rej) => {
                    this.localDb.all(`SELECT id, deleted FROM ${tableName}`, (err, rows) => {
                      if (err) rej(err);
                      else res(rows || []);
                    });
                  }),
                ]);

                const localMap = new Map(localRows.map((r) => [r.id, r]));
                const missingIds = activeMasterIds
                  .map(({ _id }) => _id)
                  .filter((_id) => {
                    const local = localMap.get(_id);
                    return !local || (local.deleted != null && local.deleted === 1);
                  });

                if (missingIds.length > 0) {
                  const missingRecords = await Model.find({
                    _id: { $in: missingIds },
                    deleted: { $ne: 1 },
                  }).lean();

                  for (const masterRecord of missingRecords) {
                    try {
                      const result = await this.mergeRecordFromMaster(tableName, masterRecord, { bootstrap });
                      if (result.action === 'inserted' || result.action === 'updated') {
                        reconciledCount++;
                      }
                    } catch (err) {
                      // Skip individual record errors
                    }
                  }
                }
              }
            }

            if (reconciledCount > 0) {
              console.log(`   🔄 Reconciled ${reconciledCount} records from master`);
              pulledCount += reconciledCount;
            }

            const registryGaps = await this.reconcileCustomerRegistryGaps(tableName);
            if (registryGaps > 0) {
              console.log(`   🔄 Registry customer-gap reconcile: ${registryGaps} ${tableName} rows`);
              pulledCount += registryGaps;
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
      if (bootstrap) {
        this._masterCustomerResolveCache = new Map();
      }
      return {
        success: true,
        totalPulled,
        totalConflicts,
        totalMs,
        conflictsResolved,
        results,
        bootstrap,
        message: bootstrap
          ? `Bootstrap pull complete: ${totalPulled} records in ${totalMs}ms`
          : `Pull complete: ${totalPulled} records, ${totalConflicts} conflicts in ${totalMs}ms`,
      };

    } catch (error) {
      console.error('❌ Pull from master failed:', error);
      if (options.bootstrap) {
        this._masterCustomerResolveCache = new Map();
      }
      return {
        success: false,
        error: error.message
      };
    }
  }

  // I&I rows use auto-increment SQLite ids that differ per device — match on business keys for sync
  findLocalRecordByBusinessKey(tableName, sqliteRow) {
    return new Promise((resolve, reject) => {
      if (tableName === 'session_ii_checklist') {
        if (!sqliteRow.document_id || !sqliteRow.section_name || !sqliteRow.item_name) {
          resolve(null);
          return;
        }
        this.localDb.get(
          `SELECT * FROM session_ii_checklist WHERE document_id = ? AND section_name = ? AND item_name = ? AND COALESCE(deleted, 0) != 1`,
          [sqliteRow.document_id, sqliteRow.section_name, sqliteRow.item_name],
          (err, row) => (err ? reject(err) : resolve(row || null))
        );
        return;
      }
      if (tableName === 'session_ii_equipment') {
        if (!sqliteRow.document_id) {
          resolve(null);
          return;
        }
        this.localDb.get(
          `SELECT * FROM session_ii_equipment WHERE document_id = ? AND COALESCE(deleted, 0) != 1`,
          [sqliteRow.document_id],
          (err, row) => (err ? reject(err) : resolve(row || null))
        );
        return;
      }
      if (tableName === 'session_ii_equipment_used' && sqliteRow.uuid) {
        this.localDb.get(
          `SELECT * FROM session_ii_equipment_used WHERE uuid = ? AND COALESCE(deleted, 0) != 1`,
          [sqliteRow.uuid],
          (err, row) => (err ? reject(err) : resolve(row || null))
        );
        return;
      }
      // PM diagnostics / maintenance use auto-increment ids that collide across tablets
      if (tableName === 'session_diagnostics') {
        if (!sqliteRow.session_id || !sqliteRow.controller_name || sqliteRow.card_number == null || !sqliteRow.error_type) {
          resolve(null);
          return;
        }
        const ch = sqliteRow.channel_number != null ? sqliteRow.channel_number : -1;
        this.localDb.get(
          `SELECT * FROM session_diagnostics
           WHERE session_id = ? AND controller_name = ? AND card_number = ?
             AND COALESCE(channel_number, -1) = ? AND error_type = ?
             AND COALESCE(deleted, 0) != 1`,
          [sqliteRow.session_id, sqliteRow.controller_name, sqliteRow.card_number, ch, sqliteRow.error_type],
          (err, row) => (err ? reject(err) : resolve(row || null))
        );
        return;
      }
      if (tableName === 'session_node_maintenance') {
        if (!sqliteRow.session_id || sqliteRow.node_id == null) {
          resolve(null);
          return;
        }
        this.localDb.get(
          `SELECT * FROM session_node_maintenance
           WHERE session_id = ? AND node_id = ? AND COALESCE(deleted, 0) != 1`,
          [sqliteRow.session_id, sqliteRow.node_id],
          (err, row) => (err ? reject(err) : resolve(row || null))
        );
        return;
      }
      resolve(null);
    });
  }

  /** When upserting by business key, keep the master's _id so replaceOne does not fork rows */
  async resolveMongoIdForUpsert(tableName, mongoRecord) {
    const businessKeyTables = [
      'session_ii_checklist',
      'session_ii_equipment',
      'session_ii_equipment_used',
      'session_diagnostics',
      'session_node_maintenance',
    ];
    if (!businessKeyTables.includes(tableName)) {
      return mongoRecord;
    }
    const Model = this.modelMap[tableName];
    const filter = this.getMongoUpsertFilter(tableName, mongoRecord);
    const existing = await Model.findOne(filter).select('_id').lean();
    if (existing) {
      mongoRecord._id = existing._id;
      return mongoRecord;
    }

    const preferredId = mongoRecord._id;
    if (preferredId != null) {
      const idTaken = await Model.findById(preferredId).select('_id').lean();
      if (!idTaken) {
        mongoRecord._id = preferredId;
        return mongoRecord;
      }
    }
    mongoRecord._id = await this.allocateNextMasterNumericId(tableName);
    return mongoRecord;
  }

  /** Allocate monotonic numeric _id for tables where local auto-increment ids collide across tablets */
  async allocateNextMasterNumericId(tableName) {
    if (!this._nextMasterIdByTable) this._nextMasterIdByTable = {};
    if (this._nextMasterIdByTable[tableName] == null) {
      const Model = this.modelMap[tableName];
      const maxDoc = await Model.findOne().sort({ _id: -1 }).select('_id').lean();
      this._nextMasterIdByTable[tableName] = (maxDoc?._id ?? 0) + 1;
    }
    const id = this._nextMasterIdByTable[tableName];
    this._nextMasterIdByTable[tableName] = id + 1;
    return id;
  }

  getMongoUpsertFilter(tableName, mongoRecord) {
    switch (tableName) {
      case 'session_ii_checklist':
        if (mongoRecord.uuid) return { uuid: mongoRecord.uuid };
        return {
          document_id: mongoRecord.document_id,
          section_name: mongoRecord.section_name,
          item_name: mongoRecord.item_name,
        };
      case 'session_ii_equipment':
        return { document_id: mongoRecord.document_id };
      case 'session_ii_equipment_used':
        if (mongoRecord.uuid) return { uuid: mongoRecord.uuid };
        return { _id: mongoRecord._id };
      case 'session_diagnostics':
        if (mongoRecord.uuid) return { uuid: mongoRecord.uuid };
        return {
          session_id: mongoRecord.session_id,
          controller_name: mongoRecord.controller_name,
          card_number: mongoRecord.card_number,
          channel_number: mongoRecord.channel_number ?? null,
          error_type: mongoRecord.error_type,
        };
      case 'session_node_maintenance':
        if (mongoRecord.uuid) return { uuid: mongoRecord.uuid };
        return { session_id: mongoRecord.session_id, node_id: mongoRecord.node_id };
      default:
        return { _id: mongoRecord._id };
    }
  }

  // ============================================================
  // MERGE SINGLE RECORD FROM MASTER
  // ============================================================

  /**
   * Master session UUID may differ from a tablet-created session with the same name.
   * Rewrites session_id / pm_session_id to the local session row (customer uuid + session_name).
   */
  async remapSessionIdFromMasterToLocal(masterData, tableName) {
    const sessionIdField = tableName === 'cabinets' ? 'pm_session_id' : 'session_id';
    const masterSid = masterData[sessionIdField];
    if (!masterSid) return;

    const localSess = await new Promise((resolve, reject) => {
      this.localDb.get(
        `SELECT id FROM sessions WHERE id = ? AND COALESCE(deleted, 0) != 1`,
        [masterSid],
        (err, row) => (err ? reject(err) : resolve(row || null))
      );
    });
    if (localSess) return;

    try {
      if (!this.isConnected) await this.connectToMongoDB();
      const Session = this.modelMap.sessions;
      const Customer = this.modelMap.customers;
      const masterSessDoc = await Session.findById(masterSid).lean();
      if (!masterSessDoc?.session_name || masterSessDoc.customer_id == null) return;

      const masterCust = await Customer.findById(masterSessDoc.customer_id).lean();
      if (!masterCust?.uuid) return;

      const localCust = await new Promise((resolve, reject) => {
        this.localDb.get(
          'SELECT id FROM customers WHERE uuid = ? AND COALESCE(deleted, 0) != 1',
          [masterCust.uuid],
          (err, row) => (err ? reject(err) : resolve(row || null))
        );
      });
      if (!localCust) return;

      const localMatch = await new Promise((resolve, reject) => {
        this.localDb.get(
          `SELECT id FROM sessions WHERE customer_id = ? AND session_name = ? AND COALESCE(deleted, 0) != 1`,
          [localCust.id, masterSessDoc.session_name],
          (err, row) => (err ? reject(err) : resolve(row || null))
        );
      });
      if (localMatch) {
        masterData[sessionIdField] = localMatch.id;
      }
    } catch (err) {
      console.warn(`   ⚠️  Could not remap session id for ${tableName}:`, err.message);
    }
  }

  /** Master session ids for local sessions (same customer uuid + session_name) */
  async getMasterSessionIdsForLocalSessions(localSessionRows) {
    const extra = [];
    try {
      if (!this.isConnected) await this.connectToMongoDB();
      const Session = this.modelMap.sessions;
      const Customer = this.modelMap.customers;
      for (const ls of localSessionRows) {
        const localCust = await new Promise((resolve, reject) => {
          this.localDb.get(
            'SELECT uuid FROM customers WHERE id = ?',
            [ls.customer_id],
            (err, row) => (err ? reject(err) : resolve(row || null))
          );
        });
        if (!localCust?.uuid) continue;
        const masterCust = await Customer.findOne({ uuid: localCust.uuid, deleted: { $ne: 1 } }).lean();
        if (!masterCust) continue;
        const masterSess = await Session.findOne({
          customer_id: masterCust._id,
          session_name: ls.session_name || ls.id,
          deleted: { $ne: 1 },
        }).lean();
        if (masterSess?._id && masterSess._id !== ls.id) {
          extra.push(masterSess._id);
        }
      }
    } catch (err) {
      console.warn('   ⚠️  getMasterSessionIdsForLocalSessions:', err.message);
    }
    return extra;
  }

  /** Pull sys_* rows when this tablet has fewer registry rows than master for the same customer uuid */
  async reconcileCustomerRegistryGaps(tableName) {
    const registryTables = [
      'sys_workstations', 'sys_controllers', 'sys_smart_switches',
      'sys_io_devices', 'sys_charms_io_cards', 'sys_charms', 'sys_ams_systems',
    ];
    if (!registryTables.includes(tableName)) return 0;

    const Model = this.modelMap[tableName];
    const Customer = this.modelMap.customers;
    let reconciledCount = 0;

    const localCustomers = await new Promise((resolve, reject) => {
      this.localDb.all(
        `SELECT id, uuid, name FROM customers WHERE uuid IS NOT NULL AND TRIM(uuid) != '' AND COALESCE(deleted, 0) != 1`,
        (err, rows) => (err ? reject(err) : resolve(rows || []))
      );
    });

    for (const lc of localCustomers) {
      try {
        const masterCust = await Customer.findOne({ uuid: lc.uuid, deleted: { $ne: 1 } }).lean();
        if (!masterCust) continue;

        const localCount = await new Promise((resolve, reject) => {
          this.localDb.get(
            `SELECT COUNT(*) as c FROM ${tableName} WHERE customer_id = ? AND COALESCE(deleted, 0) != 1`,
            [lc.id],
            (err, row) => (err ? reject(err) : resolve(row?.c ?? 0))
          );
        });
        const masterCount = await Model.countDocuments({ customer_id: masterCust._id, deleted: { $ne: 1 } });
        if (localCount >= masterCount) continue;

        console.log(
          `   📋 Registry gap ${tableName} for ${lc.name || lc.id}: local=${localCount} master=${masterCount}`
        );

        const masterRecords = await Model.find({
          customer_id: masterCust._id,
          deleted: { $ne: 1 },
        }).lean();

        for (const masterRecord of masterRecords) {
          try {
            const result = await this.mergeRecordFromMaster(tableName, masterRecord, { bootstrap: true });
            if (result.action === 'inserted' || result.action === 'updated') {
              reconciledCount++;
            }
          } catch (err) {
            console.warn(`   ⚠️  Registry gap merge failed ${tableName} _id=${masterRecord._id}:`, err.message);
          }
        }
      } catch (err) {
        console.warn(`   ⚠️  Registry gap for customer ${lc.id}:`, err.message);
      }
    }

    return reconciledCount;
  }

  async mergeRecordFromMaster(tableName, masterRecord, options = {}) {
    const bootstrap = options.bootstrap === true;
    // Convert MongoDB record to SQLite format
    const masterData = this.convertMongoToSQLite(masterRecord);

    const sessionScopedTables = [
      'session_diagnostics', 'session_node_maintenance', 'session_pm_notes',
      'session_ii_documents', 'session_ii_checklist', 'session_ii_equipment',
      'session_ii_equipment_used', 'cabinets',
    ];
    if (sessionScopedTables.includes(tableName)) {
      await this.remapSessionIdFromMasterToLocal(masterData, tableName);
    }

    const localByKey = await this.findLocalRecordByBusinessKey(tableName, masterData);
    if (localByKey) {
      masterData.id = localByKey.id;
    }
    const recordId = masterData.id;

    // Resolve customer_id by customer uuid so sessions/nodes/sys_* link to the correct local customer
    // (master and local can have different integer ids for the same customer; master may use ObjectId refs)
    const tablesNeedingCustomerResolution = [
      'sessions', 'nodes',
      'sys_charms', 'sys_charms_io_cards', 'sys_controllers', 'sys_workstations', 'sys_smart_switches',
      'sys_io_devices', 'sys_ams_systems', 'customer_metric_history', 'customer_notes'
    ];
    if (tablesNeedingCustomerResolution.includes(tableName) && masterRecord.customer_id != null) {
      masterData.customer_id = await this.resolveMasterCustomerIdToLocal(masterRecord.customer_id);
    }

    // cabinets.cabinet_name is NOT NULL - ensure we never insert null/empty
    const ensureCabinetName = () => {
      if (tableName !== 'cabinets') return;
      const name = (masterData.cabinet_name != null && String(masterData.cabinet_name).trim())
        ? String(masterData.cabinet_name).trim()
        : (masterData.cabinet_location != null && String(masterData.cabinet_location).trim()
          ? String(masterData.cabinet_location).trim()
          : 'Unnamed Cabinet');
      masterData.cabinet_name = name;
    };

    // ── Bootstrap: local PM domain is empty — insert-only path (no SELECT / conflict checks per row)
    if (bootstrap) {
      ensureCabinetName();
      if (masterData.deleted === 1) {
        return { action: 'skipped_tombstone', conflict: false };
      }
      if (!localByKey && masterData.id != null && ['session_diagnostics', 'session_node_maintenance'].includes(tableName)) {
        const rowAtId = await new Promise((res, rej) => {
          this.localDb.get(`SELECT * FROM ${tableName} WHERE id = ?`, [masterData.id], (e, r) => (e ? rej(e) : res(r || null)));
        });
        if (rowAtId) {
          const sameKey =
            tableName === 'session_diagnostics'
              ? rowAtId.session_id === masterData.session_id &&
                rowAtId.controller_name === masterData.controller_name &&
                Number(rowAtId.card_number) === Number(masterData.card_number) &&
                (rowAtId.channel_number != null ? rowAtId.channel_number : -1) ===
                  (masterData.channel_number != null ? masterData.channel_number : -1) &&
                rowAtId.error_type === masterData.error_type
              : rowAtId.session_id === masterData.session_id &&
                Number(rowAtId.node_id) === Number(masterData.node_id);
          if (!sameKey) delete masterData.id;
        }
      }
      if (localByKey) {
        await this.insertOrUpdateLocalRecord(tableName, masterData, true);
        return { action: 'updated', conflict: false };
      }
      await this.insertOrUpdateLocalRecord(tableName, masterData, true);
      return { action: 'inserted', conflict: false };
    }

    return new Promise((resolve, reject) => {
      ensureCabinetName();

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

        const idCollisionTables = ['session_diagnostics', 'session_node_maintenance'];
        let rowAtId = localRecord;
        if (!localByKey && rowAtId && idCollisionTables.includes(tableName)) {
          const sameKey =
            tableName === 'session_diagnostics'
              ? rowAtId.session_id === masterData.session_id &&
                rowAtId.controller_name === masterData.controller_name &&
                Number(rowAtId.card_number) === Number(masterData.card_number) &&
                (rowAtId.channel_number != null ? rowAtId.channel_number : -1) ===
                  (masterData.channel_number != null ? masterData.channel_number : -1) &&
                rowAtId.error_type === masterData.error_type
              : rowAtId.session_id === masterData.session_id &&
                Number(rowAtId.node_id) === Number(masterData.node_id);
          if (!sameKey) {
            // Same numeric id on this tablet belongs to a different logical row — insert fresh
            delete masterData.id;
            rowAtId = null;
          }
        }

        // CASE 1: Record doesn't exist locally - insert (or update if matched by business key but id types differed)
        if (!rowAtId) {
          if (localByKey) {
            masterData.id = localByKey.id;
          }
          this.insertOrUpdateLocalRecord(tableName, masterData, true)
            .then(() => resolve({ action: localByKey ? 'updated' : 'inserted', conflict: false }))
            .catch(reject);
          return;
        }

        // CASE 2: Record exists locally
        // Check if local has unsynced changes
        if (rowAtId.synced === 0 || rowAtId.synced === null) {
          // CONFLICT: Both sides have changes
          console.log(`   ⚠️  CONFLICT detected for ${tableName}.${recordId}`);
          
          const resolution = this.resolveConflict(rowAtId, masterData);
          
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
            // Local wins - keep local BUT mark as synced to prevent re-pushing.
            // Exception: for sessions, always apply master's session_name if master is
            // the source of a name change (master's session_name differs from local's).
            // This ensures a rename pushed from one device always propagates even when
            // the receiving device has newer unsynced changes (e.g., cabinet completion).
            if (tableName === 'sessions' && masterData.session_name &&
                masterData.session_name !== rowAtId.session_name) {
              const masterNameTime = new Date(masterData.updated_at || masterData.created_at).getTime();
              const localNameTime  = new Date(rowAtId.updated_at || rowAtId.created_at).getTime();
              if (masterNameTime > localNameTime) {
                console.log(`   🏷️  Applying master session_name "${masterData.session_name}" to local-wins session ${recordId}`);
                this.localDb.run(
                  `UPDATE sessions SET session_name = ?, synced = 0 WHERE id = ?`,
                  [masterData.session_name, recordId],
                  (updateErr) => {
                    if (updateErr) console.warn(`   ⚠️  Could not apply session_name: ${updateErr.message}`);
                    this.markRecordAsSynced(tableName, recordId)
                      .then(() => resolve({ action: 'kept_local_name_merged', conflict: true, resolution: 'local_wins_name_merged' }))
                      .catch(reject);
                  }
                );
                return;
              }
            }
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

            const bulkOps = [];
            for (const record of toUpsert) {
              let recordToPush = record;
              if ((tableName === 'sessions' || tableName === 'nodes') && record.customer_id != null) {
                recordToPush = { ...record, customer_id: customerIdMap[record.customer_id] ?? record.customer_id };
              }
              let mongoRecord = this.convertSQLiteToMongo(recordToPush, tableName);
              mongoRecord = await this.resolveMongoIdForUpsert(tableName, mongoRecord);
              const filter = this.getMongoUpsertFilter(tableName, mongoRecord);
              bulkOps.push({
                replaceOne: {
                  filter,
                  replacement: { ...mongoRecord, device_id: this.deviceId, updated_at: new Date() },
                  upsert: true
                }
              });
            }

            const bulkResult = await Model.bulkWrite(bulkOps, { ordered: false });
            const writeErrors = bulkResult.getWriteErrors ? bulkResult.getWriteErrors() : [];

            if (writeErrors.length > 0) {
              console.warn(`   ⚠️  bulkWrite had ${writeErrors.length} write error(s):`);
              writeErrors.slice(0, 5).forEach(e => console.warn(`      [${e.index}] ${e.errmsg}`));
            }

            const failedIndices = new Set(writeErrors.map((e) => e.index));
            const wroteAnything =
              bulkResult.upsertedCount > 0 ||
              bulkResult.modifiedCount > 0 ||
              bulkResult.matchedCount > 0;

            let successfulIds;
            if (!wroteAnything && toUpsert.length > 0) {
              console.warn(`   ⚠️  bulkWrite produced no writes for ${toUpsert.length} record(s) — none marked synced`);
              successfulIds = [];
            } else if (writeErrors.length === 0) {
              successfulIds = toUpsert.map((r) => r.id);
            } else {
              successfulIds = toUpsert
                .filter((_, idx) => !failedIndices.has(idx))
                .map((r) => r.id);
            }
            syncedIds.push(...successfulIds);
            pushedCount = successfulIds.length;
            console.log(`   📤 bulkWrite: ${bulkResult.upsertedCount} inserted, ${bulkResult.modifiedCount} updated${writeErrors.length ? `, ${writeErrors.length} errors` : ''}`);
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
    const columnNames = await this.getTableColumnNames(tableName);

    const validRecord = {};

    // Only include fields that exist in the table
    columnNames.forEach((col) => {
      if (Object.prototype.hasOwnProperty.call(record, col)) {
        validRecord[col] = record[col];
      }
    });

    // Mark as synced if requested
    if (markAsSynced) {
      validRecord.synced = 1;
    }

    const placeholders = columnNames.map(() => '?').join(',');
    const values = columnNames.map((col) => (validRecord[col] !== undefined ? validRecord[col] : null));

    return new Promise((resolve, reject) => {
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

  // Bulk version — one SQL statement for N ids instead of N round-trips.
  // Normalises ids: numeric strings are cast to Number so the WHERE clause
  // matches regardless of whether the column is TEXT or INTEGER affinity.
  async markRecordsAsSynced(tableName, ids) {
    if (!ids || ids.length === 0) return 0;
    const normIds = ids.map(id =>
      (id !== null && id !== undefined && id !== '' && !isNaN(Number(id))) ? Number(id) : id
    );
    const placeholders = normIds.map(() => '?').join(',');
    return new Promise((resolve, reject) => {
      this.localDb.run(
        `UPDATE ${tableName} SET synced = 1 WHERE id IN (${placeholders})`,
        normIds,
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
    
    // Convert id to _id for MongoDB.
    // All schemas in this app use Number for _id. SQLite TEXT columns (migrated
    // from INTEGER) return ids as JS strings — cast back to Number so the
    // replaceOne filter matches existing MongoDB docs and avoids silent type-
    // mismatch failures in bulkWrite.
    const rawId = record.id;
    mongoRecord._id = (rawId !== null && rawId !== undefined && rawId !== '' && !isNaN(Number(rawId)))
      ? Number(rawId)
      : rawId;
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
    // Stable uuid required for sync; checklist/equipment rows get uuid on first save in the API
    if (
      !mongoRecord.uuid &&
      tableName !== 'session_ii_checklist' &&
      tableName !== 'session_ii_equipment' &&
      tableName !== 'session_diagnostics' &&
      tableName !== 'session_node_maintenance'
    ) {
      mongoRecord.uuid = uuidv4();
    }
    
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
    const cacheKey = String(masterCustomerId);
    if (this._masterCustomerResolveCache.has(cacheKey)) {
      return this._masterCustomerResolveCache.get(cacheKey);
    }
    try {
      if (!this.isConnected) await this.connectToMongoDB();
      const Customer = this.modelMap['customers'];
      const masterCust = await Customer.findById(masterCustomerId).lean();
      if (!masterCust || !masterCust.uuid) {
        this._masterCustomerResolveCache.set(cacheKey, masterCustomerId);
        return masterCustomerId;
      }
      const local = await new Promise((resolve, reject) => {
        this.localDb.get('SELECT id FROM customers WHERE uuid = ?', [masterCust.uuid], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      const resolved = local ? local.id : masterCustomerId;
      this._masterCustomerResolveCache.set(cacheKey, resolved);
      return resolved;
    } catch (err) {
      console.warn('   Could not resolve master customer_id to local (using raw id):', err.message);
      this._masterCustomerResolveCache.set(cacheKey, masterCustomerId);
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
   * Originally intended to migrate sys_charms/sys_charms_io_cards to TEXT ids to
   * support MongoDB ObjectIds. However, both MongoDB schemas use Number _id (not
   * ObjectId), so the TEXT migration was incorrect and broke SQLite AUTOINCREMENT,
   * causing new records to receive id = NULL. This function is now a no-op.
   */
  async ensureSyncTablesSupportMasterIds() {
    for (const tableName of []) { // disabled — TEXT id migration caused NULL ids
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
    this.invalidateTableColumnCache();
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
            { table: 'session_diagnostics', foreignKey: 'session_id' },
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

