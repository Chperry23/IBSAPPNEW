/** Registry rows synced to Mongo require a non-empty `name`. */

const REGISTRY_NAME_TABLES = [
  'sys_workstations',
  'sys_controllers',
  'sys_charms_io_cards',
  'sys_smart_switches',
];

function slugify(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

const PLACEHOLDER_VALUES = new Set([
  '',
  'not available',
  'n/a',
  'na',
  'none',
  'unknown',
  'undefined',
]);

function isPlaceholderValue(value) {
  if (value == null) return true;
  return PLACEHOLDER_VALUES.has(String(value).trim().toLowerCase());
}

function firstUsableSerial(row, getField) {
  const candidates = getField
    ? [
        getField(row, 'SerialNumber'),
        getField(row, 'DellServiceTagNumber'),
      ]
    : [row.serial_number, row.dell_service_tag_number];
  for (const c of candidates) {
    if (!isPlaceholderValue(c)) return String(c).trim();
  }
  return null;
}

/**
 * Resolve a name from imported XML fields; return null to skip row.
 */
function resolveRegistryImportName(getField, item, kind) {
  const name = String(getField(item, 'Name') || '').trim();
  if (name) return name;

  const serial = firstUsableSerial(item, getField);
  if (serial) return `${kind}-${serial}`;

  const model = slugify(getField(item, 'Model'));
  if (model) return `${model}-unnamed`;

  return null;
}

/**
 * Assign a stable fallback name for rows already stored with blank name.
 */
function deriveRegistryNameFallback(tableName, row) {
  const prefix = tableName.replace(/^sys_/, '').replace(/_/g, '-').toUpperCase();
  const serial = firstUsableSerial(row);
  if (serial) return `${prefix}-${serial}`;
  const model = slugify(row.model);
  if (model) return `${model}-${row.id}`;
  return `${prefix}-${row.id}`;
}

async function nameExists(db, tableName, customerId, name, excludeId) {
  const row = await db
    .prepare(
      `SELECT id FROM ${tableName}
       WHERE customer_id = ? AND name = ? AND id != ? AND COALESCE(deleted, 0) != 1`
    )
    .get([customerId, name, excludeId]);
  return Boolean(row);
}

async function uniqueRegistryName(db, tableName, customerId, row, baseName) {
  let candidate = baseName;
  let n = 2;
  while (await nameExists(db, tableName, customerId, candidate, row.id)) {
    candidate = `${baseName}-${n}`;
    n += 1;
  }
  return candidate;
}

/**
 * Fix blank registry names in SQLite before push (marks rows unsynced).
 * @returns {number} rows repaired
 */
async function repairEmptyRegistryNames(db, { recordChangeForRow } = {}) {
  let fixed = 0;

  for (const tableName of REGISTRY_NAME_TABLES) {
    const rows = await db
      .prepare(
        `SELECT * FROM ${tableName}
         WHERE COALESCE(deleted, 0) != 1 AND (name IS NULL OR TRIM(name) = '')`
      )
      .all();

    for (const row of rows) {
      const base = deriveRegistryNameFallback(tableName, row);
      const name = await uniqueRegistryName(db, tableName, row.customer_id, row, base);
      await db
        .prepare(
          `UPDATE ${tableName}
           SET name = ?, synced = 0, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run([name, row.id]);

      if (recordChangeForRow) {
        const updated = await db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get([row.id]);
        await recordChangeForRow(db, tableName, updated, 'upsert');
      }

      console.log(`🔧 Registry name repair: ${tableName} id=${row.id} → "${name}"`);
      fixed += 1;
    }
  }

  return fixed;
}

module.exports = {
  REGISTRY_NAME_TABLES,
  resolveRegistryImportName,
  deriveRegistryNameFallback,
  repairEmptyRegistryNames,
};
