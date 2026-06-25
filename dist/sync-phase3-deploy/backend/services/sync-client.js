/**
 * Tablet sync client — HTTP protocol to sync-server on master.
 * Falls back to legacy direct-Mongo replication when SYNC_API_URL is unset.
 */
const zlib = require('zlib');
const { promisify } = require('util');
const { SYNC_TABLES, REGISTRY_TABLES } = require('./sync-tables');
const {
  buildChangesetFromJournal,
  markChangesSynced,
  getSyncCursor,
  setSyncCursor,
  recordChangeForRow,
} = require('../utils/change-journal');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

function getSyncApiUrl() {
  return (
    process.env.SYNC_API_URL ||
    process.env.SYNC_SERVER_URL ||
    null
  );
}

const REGISTRY_PAGE_SIZE = 20000;

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function chunkObject(obj, maxBytes) {
  const tables = { ...obj };
  const chunks = [];
  let current = {};

  const sizeOf = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8');

  for (const [table, rows] of Object.entries(tables)) {
    if (!rows?.length) continue;
    let batch = [];
    for (const row of rows) {
      const tryBatch = [...batch, row];
      const tryTables = { ...current, [table]: tryBatch };
      if (sizeOf(tryTables) > maxBytes && batch.length > 0) {
        chunks.push({ ...current });
        current = { [table]: [row] };
        batch = [row];
      } else {
        batch = tryBatch;
        current[table] = batch;
      }
    }
  }
  if (Object.keys(current).length > 0) chunks.push(current);
  if (chunks.length === 0 && Object.keys(tables).length > 0) chunks.push(tables);
  return chunks;
}

class SyncClient {
  constructor(localDb, legacyReplication = null) {
    this.localDb = localDb;
    this.legacy = legacyReplication;
    this.baseUrl = getSyncApiUrl()?.replace(/\/$/, '');
  }

  isEnabled() {
    return !!this.baseUrl;
  }

  async getDeviceId() {
    if (this.legacy) return this.legacy.getOrCreateDeviceId();
    const row = await this.localDb
      .prepare(`SELECT value FROM sync_metadata WHERE key = 'device_id'`)
      .get([]);
    return row?.value || 'unknown_device';
  }

  async fetchJson(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    let text;
    // Node fetch may auto-decompress while leaving Content-Encoding: gzip — detect by magic bytes
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      text = (await gunzip(buf)).toString('utf8');
    } else {
      text = buf.toString('utf8');
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON from ${path}: ${text.slice(0, 120)}`);
    }
    if (!res.ok) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return body;
  }

  async testConnection() {
    if (!this.isEnabled()) {
      return { success: false, mode: 'legacy', error: 'SYNC_API_URL not configured' };
    }
    try {
      const health = await this.fetchJson('/health');
      return {
        success: health.status === 'ok',
        mode: 'sync-api',
        server_version: health.server_version,
        url: this.baseUrl,
      };
    } catch (err) {
      return { success: false, mode: 'sync-api', error: err.message, url: this.baseUrl };
    }
  }

  async buildFullChangeset() {
    const { tables, journalIds } = await buildChangesetFromJournal(this.localDb);
    const seen = new Set();
    for (const t of Object.values(tables)) {
      for (const r of t) seen.add(`${r.uuid}`);
    }

    for (const tableName of SYNC_TABLES) {
      const rows = await this.localDb
        .prepare(
          `SELECT * FROM ${tableName} WHERE synced = 0 AND uuid IS NOT NULL AND TRIM(uuid) != ''`
        )
        .all([]);
      for (const row of rows) {
        if (seen.has(row.uuid)) continue;
        seen.add(row.uuid);
        if (!tables[tableName]) tables[tableName] = [];
        tables[tableName].push(row);
      }
    }
    return { tables, journalIds };
  }

  async push(onProgress) {
    if (!this.isEnabled()) {
      if (!this.legacy) throw new Error('No sync API URL and no legacy replication');
      return this.legacy.pushToMaster();
    }

    const deviceId = await this.getDeviceId();
    const cursor = await getSyncCursor(this.localDb);
    const { tables, journalIds } = await this.buildFullChangeset();
    const rowCount = Object.values(tables).reduce((n, r) => n + r.length, 0);

    if (rowCount === 0) {
      return { success: true, totalPushed: 0, message: 'Nothing to upload', mode: 'sync-api' };
    }

    const begin = await this.fetchJson('/sync/begin', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, cursor, direction: 'upload' }),
    });

    const token = begin.token;
    const maxBytes = begin.chunk_max_bytes || 512 * 1024;
    const chunks = chunkObject(tables, maxBytes);

    for (let i = 0; i < chunks.length; i++) {
      const body = JSON.stringify({ tables: chunks[i] });
      const res = await fetch(`${this.baseUrl}/sync/upload/${token}/${i}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const json = JSON.parse(buf.toString('utf8'));
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Chunk upload failed: HTTP ${res.status}`);
      }
      if (onProgress) onProgress({ phase: 'upload', chunk: i + 1, total: chunks.length });
    }

    const commit = await this.fetchJson(`/sync/commit/${token}`, { method: 'POST' });
    if (onProgress) onProgress({ phase: 'commit', done: true });

    for (const [tableName, rows] of Object.entries(tables)) {
      for (const row of rows) {
        await this.localDb
          .prepare(`UPDATE ${tableName} SET synced = 1 WHERE uuid = ?`)
          .run([row.uuid]);
      }
    }
    if (journalIds.length) await markChangesSynced(this.localDb, journalIds);

    return {
      success: true,
      totalPushed: commit.rows_applied ?? rowCount,
      cursor: commit.cursor,
      mode: 'sync-api',
      message: `Uploaded ${commit.rows_applied ?? rowCount} records via sync API`,
    };
  }

  async applyChange(change) {
    const { table_name, operation, payload, uuid } = change;
    if (!payload && !uuid) return { action: 'skipped' };

    const row = payload || {};
    if (operation === 'delete') {
      await this.localDb
        .prepare(
          `UPDATE ${table_name} SET deleted = 1, synced = 1, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?`
        )
        .run([uuid]);
      return { action: 'deleted' };
    }

    if (this.legacy?.mergeRecordFromMaster) {
      const mongoRecord = { ...row, _id: row.id ?? row._id, uuid };
      const result = await this.legacy.mergeRecordFromMaster(table_name, mongoRecord, { bootstrap: false });
      return result;
    }

    const existing = await this.localDb
      .prepare(`SELECT id FROM ${table_name} WHERE uuid = ?`)
      .get([uuid]);
    const cols = Object.keys(row).filter((k) => k !== 'id');
    if (existing) {
      const sets = cols.map((c) => `${c} = ?`).join(', ');
      await this.localDb
        .prepare(
          `UPDATE ${table_name} SET ${sets}, synced = 1, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?`
        )
        .run([...cols.map((c) => row[c]), uuid]);
      return { action: 'updated' };
    }

    const insertCols = ['uuid', ...cols.filter((c) => c !== 'uuid')];
    const placeholders = insertCols.map(() => '?').join(', ');
    await this.localDb
      .prepare(
        `INSERT INTO ${table_name} (${insertCols.join(', ')}, synced, updated_at)
         VALUES (${placeholders}, 1, CURRENT_TIMESTAMP)`
      )
      .run(insertCols.map((c) => row[c]));
    return { action: 'inserted' };
  }

  async applyRegistryManifestVersions(manifest) {
    let updated = 0;
    for (const entry of manifest || []) {
      const result = await this.localDb
        .prepare(
          `UPDATE customers SET registry_version = ?, synced = 1
           WHERE id = ? OR uuid = ?`
        )
        .run([entry.registry_version ?? 0, entry.customer_id, entry.customer_uuid]);
      if (result?.changes > 0) updated += 1;
    }
    return { updated };
  }

  async buildBootstrapCustomerIdMap() {
    const customers = await this.localDb
      .prepare(`SELECT id, uuid FROM customers WHERE COALESCE(deleted, 0) != 1`)
      .all([]);
    const map = new Map();
    for (const row of customers) {
      map.set(String(row.id), row.id);
      map.set(Number(row.id), row.id);
      if (row.uuid) map.set(`uuid:${row.uuid}`, row.id);
    }
    if (this.legacy?.isConnected) {
      try {
        const Customer = this.legacy.modelMap?.customers;
        if (Customer) {
          for (const row of customers) {
            if (!row.uuid) continue;
            const masterCust = await Customer.findOne({ uuid: row.uuid }).select('_id').lean();
            if (masterCust?._id != null) {
              map.set(String(masterCust._id), row.id);
              map.set(Number(masterCust._id), row.id);
            }
          }
        }
      } catch (err) {
        console.warn(`   ⚠️  Customer id map (mongo): ${err.message}`);
      }
    }
    return map;
  }

  resolveBootstrapCustomerId(customerMap, masterCustomerId) {
    if (masterCustomerId == null) return masterCustomerId;
    return (
      customerMap.get(String(masterCustomerId)) ??
      customerMap.get(Number(masterCustomerId)) ??
      masterCustomerId
    );
  }

  async bulkInsertRegistryRows(tableName, mongoRows, customerMap) {
    if (!mongoRows.length) return 0;
    const columnNames = await this.legacy.getTableColumnNames(tableName);
    const BATCH_SIZE = 250;
    const placeholders = `(${columnNames.map(() => '?').join(', ')})`;

    await runSql(this.localDb, 'BEGIN IMMEDIATE');
    try {
      for (let offset = 0; offset < mongoRows.length; offset += BATCH_SIZE) {
        const batch = mongoRows.slice(offset, offset + BATCH_SIZE);
        const valueSets = [];
        const params = [];
        for (const mongoRow of batch) {
          const row = this.legacy.convertMongoToSQLite(mongoRow);
          row.synced = 1;
          row.deleted = row.deleted ?? 0;
          if (row.customer_id != null) {
            row.customer_id = this.resolveBootstrapCustomerId(customerMap, row.customer_id);
          }
          valueSets.push(placeholders);
          for (const col of columnNames) {
            params.push(Object.prototype.hasOwnProperty.call(row, col) ? row[col] : null);
          }
        }
        const sql = `INSERT OR REPLACE INTO ${tableName} (${columnNames.join(', ')}) VALUES ${valueSets.join(', ')}`;
        await runSql(this.localDb, sql, params);
      }
      await runSql(this.localDb, 'COMMIT');
    } catch (err) {
      await runSql(this.localDb, 'ROLLBACK');
      throw err;
    }
    return mongoRows.length;
  }

  async bulkBootstrapRegistry(onProgress) {
    const startMs = Date.now();
    let totalRows = 0;
    const now = new Date().toISOString();
    const customerMap = await this.buildBootstrapCustomerIdMap();

    for (let ti = 0; ti < REGISTRY_TABLES.length; ti++) {
      const tableName = REGISTRY_TABLES[ti];
      const tableStart = Date.now();
      let skip = 0;
      const allRows = [];
      let total = 0;

      while (true) {
        const page = await this.fetchJson(
          `/sync/registry-table/${tableName}?skip=${skip}&limit=${REGISTRY_PAGE_SIZE}&gzip=1`
        );
        total = page.total ?? 0;
        const rows = page.rows || [];
        allRows.push(...rows);
        if (onProgress) {
          onProgress({
            phase: 'registry',
            table: tableName,
            tableIndex: ti + 1,
            tableTotal: REGISTRY_TABLES.length,
            fetched: allRows.length,
            total,
          });
        }
        if (!page.hasMore || rows.length === 0) break;
        skip += rows.length;
      }

      if (allRows.length === 0) {
        if (this.legacy?.setLastSyncTime) await this.legacy.setLastSyncTime(tableName, now);
        continue;
      }

      await this.bulkInsertRegistryRows(tableName, allRows, customerMap);

      if (this.legacy?.setLastSyncTime) await this.legacy.setLastSyncTime(tableName, now);
      totalRows += allRows.length;
      console.log(
        `   📦 Registry bulk ${tableName}: ${allRows.length} rows in ${Date.now() - tableStart}ms`
      );
    }

    console.log(`   📦 Registry bulk total: ${totalRows} rows in ${Date.now() - startMs}ms`);
    return totalRows;
  }

  async pullRegistrySnapshots(manifest) {
    if (!manifest?.length) return { updated: 0 };
    let updated = 0;

    for (const entry of manifest) {
      const local = await this.localDb
        .prepare(`SELECT id, registry_version FROM customers WHERE uuid = ? OR id = ?`)
        .get([entry.customer_uuid, entry.customer_id]);
      if (!local) continue;
      const localVer = local.registry_version ?? 0;
      const remoteVer = entry.registry_version ?? 0;
      if (remoteVer <= localVer) continue;

      const snapRes = await this.fetchJson(`/sync/registry/${entry.customer_id}?gzip=1`);
      const snapshot = snapRes.snapshot || snapRes;

      for (const table of REGISTRY_TABLES) {
        const rows = snapshot.tables?.[table] || [];
        await this.localDb
          .prepare(`UPDATE ${table} SET deleted = 1, synced = 1 WHERE customer_id = ?`)
          .run([local.id]);
        for (const mongoRow of rows) {
          const sqliteRow = this.legacy
            ? this.legacy.convertMongoToSQLite(mongoRow)
            : { ...mongoRow, id: mongoRow._id };
          sqliteRow.customer_id = local.id;
          sqliteRow.deleted = 0;
          sqliteRow.synced = 1;
          const existing = await this.localDb
            .prepare(`SELECT id FROM ${table} WHERE uuid = ?`)
            .get([sqliteRow.uuid]);
          if (existing) {
            const cols = Object.keys(sqliteRow).filter((k) => k !== 'id');
            const sets = cols.map((c) => `${c} = ?`).join(', ');
            await this.localDb
              .prepare(`UPDATE ${table} SET ${sets} WHERE uuid = ?`)
              .run([...cols.map((c) => sqliteRow[c]), sqliteRow.uuid]);
          } else {
            const cols = Object.keys(sqliteRow).filter((k) => k !== 'id');
            const ph = cols.map(() => '?').join(', ');
            await this.localDb
              .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph})`)
              .run(cols.map((c) => sqliteRow[c]));
          }
        }
      }
      await this.localDb
        .prepare(`UPDATE customers SET registry_version = ?, synced = 1 WHERE id = ?`)
        .run([remoteVer, local.id]);
      updated += 1;
    }
    return { updated };
  }

  async pull(onProgress) {
    if (!this.isEnabled()) {
      if (!this.legacy) throw new Error('No sync API URL and no legacy replication');
      return this.legacy.pullFromMaster();
    }

    const deviceId = await this.getDeviceId();

    // Fresh install: sync_changes only has incremental uploads, not a full snapshot.
    // Pull entire cloud DB first when there are no customers/sessions/cabinets yet.
    if (this.legacy && (await this.legacy.localEmptyForBootstrap())) {
      console.log('📥 Fresh install — full cloud bootstrap (sync API mode)...');
      // Remove orphan rows from a mistaken incremental-only pull (no customers/sessions yet)
      await this.localDb.prepare('DELETE FROM session_node_maintenance').run([]);
      await this.localDb.prepare('DELETE FROM customer_metric_history').run([]);
      await this.localDb.prepare('DELETE FROM change_log').run([]);
      const connected = await this.legacy.connectToMongoDB();
      if (!connected) {
        return {
          success: false,
          error: 'Cannot reach MongoDB for initial download — check network/VPN.',
          mode: 'sync-api+bootstrap',
        };
      }
      const bootstrapStart = Date.now();
      const bootstrap = await this.legacy.pullFromMaster({
        bootstrap: true,
        skipTables: [...REGISTRY_TABLES],
      });
      if (!bootstrap.success) {
        return { ...bootstrap, mode: 'sync-api+bootstrap' };
      }
      const pmMs = Date.now() - bootstrapStart;

      const registryStart = Date.now();
      const registryRows = await this.bulkBootstrapRegistry(onProgress);
      const registryMs = Date.now() - registryStart;

      await this.localDb.prepare('DELETE FROM change_log').run([]);

      const health = await this.fetchJson('/health');
      const manifestResult = await this.fetchJson('/sync/changes?since=0&limit=1');
      const registryVersions = await this.applyRegistryManifestVersions(
        manifestResult.registry_manifest
      );
      const newCursor = health.server_version ?? manifestResult.current ?? 0;
      await setSyncCursor(this.localDb, newCursor);
      await this.fetchJson('/sync/ack', {
        method: 'POST',
        body: JSON.stringify({ device_id: deviceId, cursor: newCursor }),
      });

      const totalPulled = (bootstrap.totalPulled ?? 0) + registryRows;
      const totalMs = Date.now() - bootstrapStart;
      return {
        success: true,
        totalPulled,
        cursor: newCursor,
        mode: 'sync-api+bootstrap',
        registryUpdated: registryVersions.updated,
        pmMs,
        registryMs,
        totalMs,
        message: `First-time download: ${totalPulled} records (PM ${pmMs}ms + registry ${registryMs}ms)`,
      };
    }

    const since = await getSyncCursor(this.localDb);
    let totalPulled = 0;
    let cursor = since;
    let hasMore = true;
    let lastResult = null;

    while (hasMore) {
      const result = await this.fetchJson(`/sync/changes?since=${cursor}&gzip=1`);
      lastResult = result;
      const changes = result.changes || [];
      hasMore = !!result.hasMore;

      for (const change of changes) {
        await this.applyChange(change);
        totalPulled += 1;
        cursor = Math.max(cursor, change.server_version);
      }

      if (onProgress) onProgress({ phase: 'pull', pulled: totalPulled, cursor });
      if (changes.length === 0) hasMore = false;
    }

    const registry = await this.pullRegistrySnapshots(lastResult?.registry_manifest);
    const newCursor = lastResult?.current ?? cursor;
    await setSyncCursor(this.localDb, newCursor);

    await this.fetchJson('/sync/ack', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, cursor: newCursor }),
    });

    return {
      success: true,
      totalPulled,
      cursor: newCursor,
      mode: 'sync-api',
      registryUpdated: registry.updated,
      message: `Pulled ${totalPulled} changes (cursor ${newCursor})`,
    };
  }

  async fullSync(onProgress) {
    const pullResult = await this.pull(onProgress);
    const pushResult = await this.push(onProgress);
    return {
      success: pullResult.success && pushResult.success,
      totalPulled: pullResult.totalPulled ?? 0,
      totalPushed: pushResult.totalPushed ?? 0,
      message: 'Sync complete',
      pull: pullResult,
      push: pushResult,
    };
  }
}

module.exports = SyncClient;
