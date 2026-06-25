/**
 * Local change journal for the new sync protocol.
 * Complements synced flags during transition; cleared after successful API commit.
 */
const { SYNC_TABLES } = require('../services/sync-tables');

async function recordChange(db, tableName, rowUuid, operation = 'upsert', payload = null) {
  if (!tableName || !rowUuid) return;
  const payloadJson = payload ? JSON.stringify(payload) : null;
  await db
    .prepare(
      `INSERT INTO change_log (table_name, row_uuid, operation, payload_json, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run([tableName, rowUuid, operation, payloadJson]);
}

async function recordChangeForRow(db, tableName, row, operation = 'upsert') {
  const uuid = row?.uuid;
  if (!uuid) return;
  await recordChange(db, tableName, uuid, operation, row);
}

async function getPendingChanges(db) {
  return db
    .prepare(
      `SELECT id, table_name, row_uuid, operation, payload_json, created_at
       FROM change_log WHERE synced_at IS NULL ORDER BY id ASC`
    )
    .all([]);
}

async function markChangesSynced(db, ids) {
  if (!ids?.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await db
    .prepare(`UPDATE change_log SET synced_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`)
    .run(ids);
}

/** Mark every pending journal entry as uploaded (after successful push). */
async function markAllPendingJournalSynced(db) {
  const result = await db
    .prepare(`UPDATE change_log SET synced_at = CURRENT_TIMESTAMP WHERE synced_at IS NULL`)
    .run([]);
  return result?.changes ?? 0;
}

/**
 * Remove journal noise: rows already synced=1 should not inflate push build or counts.
 * Registry imports can create 100k+ trigger entries while rows are later marked synced.
 */
async function pruneStaleChangeLog(db) {
  let total = 0;
  for (const tableName of SYNC_TABLES) {
    const result = await db
      .prepare(
        `DELETE FROM change_log
         WHERE synced_at IS NULL
           AND table_name = ?
           AND row_uuid IN (
             SELECT uuid FROM ${tableName}
             WHERE synced = 1 AND uuid IS NOT NULL AND TRIM(uuid) != ''
           )`
      )
      .run([tableName]);
    total += result?.changes ?? 0;
  }
  return total;
}

async function getSyncCursor(db) {
  const row = await db.prepare(`SELECT value FROM sync_metadata WHERE key = 'server_version_cursor'`).get([]);
  return row?.value ? parseInt(row.value, 10) : 0;
}

async function setSyncCursor(db, cursor) {
  await db
    .prepare(
      `INSERT INTO sync_metadata (key, value, updated_at) VALUES ('server_version_cursor', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    )
    .run([String(cursor)]);
}

/** Load full row from SQLite for journal payload when pushing */
async function loadRowByUuid(db, tableName, rowUuid) {
  return db.prepare(`SELECT * FROM ${tableName} WHERE uuid = ?`).get([rowUuid]);
}

/** Build grouped changeset from pending journal + live row data */
async function buildChangesetFromJournal(db) {
  const pending = await getPendingChanges(db);
  const tables = {};
  const journalIds = [];
  const seen = new Set();

  for (const entry of pending) {
    journalIds.push(entry.id);
    const key = `${entry.table_name}:${entry.row_uuid}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let row = entry.payload_json ? JSON.parse(entry.payload_json) : null;
    if (!row) {
      row = await loadRowByUuid(db, entry.table_name, entry.row_uuid);
    }
    if (!row) continue;

    if (!tables[entry.table_name]) tables[entry.table_name] = [];
    tables[entry.table_name].push(row);
  }

  return { tables, journalIds };
}

module.exports = {
  recordChange,
  recordChangeForRow,
  getPendingChanges,
  markChangesSynced,
  markAllPendingJournalSynced,
  pruneStaleChangeLog,
  getSyncCursor,
  setSyncCursor,
  loadRowByUuid,
  buildChangesetFromJournal,
};
