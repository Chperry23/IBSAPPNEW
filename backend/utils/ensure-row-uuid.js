const { v4: uuidv4 } = require('uuid');
const { SYNC_TABLES, STRING_ID_TABLES, PUSH_SKIP_TABLES } = require('../services/sync-tables');

function isBlankUuid(value) {
  return value == null || String(value).trim() === '';
}

/**
 * Assign a UUID to a local row if missing; persists to SQLite.
 * @returns {Promise<string>} uuid on the row after this call
 */
async function ensureRowUuid(db, tableName, record) {
  if (!isBlankUuid(record?.uuid)) return record.uuid;
  const uuid = uuidv4();
  await db.prepare(`UPDATE ${tableName} SET uuid = ? WHERE id = ?`).run([uuid, record.id]);
  return uuid;
}

/**
 * Backfill UUIDs for all rows in a table that are missing one.
 * @returns {Promise<number>} rows updated
 */
async function backfillTableUuids(db, tableName) {
  const rows = await db
    .prepare(`SELECT id FROM ${tableName} WHERE uuid IS NULL OR TRIM(uuid) = ''`)
    .all([]);
  if (!rows.length) return 0;
  const stmt = db.prepare(`UPDATE ${tableName} SET uuid = ? WHERE id = ?`);
  for (const row of rows) {
    await stmt.run([uuidv4(), row.id]);
  }
  return rows.length;
}

/** Tables where SQLite `id` is already a UUID string — copy id → uuid when missing. */
async function backfillStringIdTableUuids(db, tableName) {
  const rows = await db
    .prepare(
      `SELECT id FROM ${tableName}
       WHERE (uuid IS NULL OR TRIM(uuid) = '') AND id IS NOT NULL AND TRIM(id) != ''`
    )
    .all([]);
  if (!rows.length) return 0;
  const stmt = db.prepare(
    `UPDATE ${tableName} SET uuid = ?, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  for (const row of rows) {
    await stmt.run([String(row.id).trim(), row.id]);
  }
  return rows.length;
}

async function backfillMissingSessionUuids(db) {
  const rows = await db
    .prepare(
      `SELECT id FROM sessions
       WHERE (uuid IS NULL OR TRIM(uuid) = '') AND id IS NOT NULL AND TRIM(id) != ''`
    )
    .all([]);
  if (!rows.length) return 0;
  const stmt = db.prepare(
    `UPDATE sessions SET uuid = ?, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  );
  for (const row of rows) {
    await stmt.run([uuidv4(), row.id]);
  }
  return rows.length;
}

/**
 * Backfill missing uuids across all synced tables (skip users).
 * String-id tables: uuid = id. Sessions: new v4. Others: new v4.
 * Marks synced=0 only on rows that received a new uuid.
 */
async function backfillMissingUuidsForSyncTables(db) {
  const counts = {};
  for (const tableName of SYNC_TABLES) {
    if (PUSH_SKIP_TABLES.includes(tableName)) continue;

    if (STRING_ID_TABLES.has(tableName)) {
      if (tableName === 'sessions') {
        counts[tableName] = await backfillMissingSessionUuids(db);
      } else {
        counts[tableName] = await backfillStringIdTableUuids(db, tableName);
      }
      continue;
    }

    const rows = await db
      .prepare(`SELECT id FROM ${tableName} WHERE uuid IS NULL OR TRIM(uuid) = ''`)
      .all([]);
    if (!rows.length) {
      counts[tableName] = 0;
      continue;
    }
    const stmt = db.prepare(
      `UPDATE ${tableName} SET uuid = ?, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    );
    for (const row of rows) {
      await stmt.run([uuidv4(), row.id]);
    }
    counts[tableName] = rows.length;
  }
  return counts;
}

module.exports = {
  isBlankUuid,
  ensureRowUuid,
  backfillTableUuids,
  backfillStringIdTableUuids,
  backfillMissingSessionUuids,
  backfillMissingUuidsForSyncTables,
};
