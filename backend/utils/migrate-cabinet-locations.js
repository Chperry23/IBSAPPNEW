/**
 * Legacy tablets wrote session locations to cabinet_names (local-only).
 * Copy into synced cabinet_locations so upload includes them.
 */
async function migrateCabinetNamesIntoLocations(db) {
  try {
    const names = await db
      .prepare(
        `SELECT id, session_id, location_name, description, is_collapsed, sort_order, created_at, updated_at, deleted
         FROM cabinet_names`
      )
      .all([]);
    if (!names.length) return { copied: 0, backfilledUuid: 0 };

    let copied = 0;
    for (const row of names) {
      const exists = await db.prepare(`SELECT id FROM cabinet_locations WHERE id = ?`).get([row.id]);
      if (exists) continue;

      const uuid = String(row.id);
      await db
        .prepare(
          `INSERT INTO cabinet_locations
             (id, session_id, location_name, description, is_collapsed, sort_order,
              uuid, synced, deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
        )
        .run([
          row.id,
          row.session_id,
          row.location_name,
          row.description || '',
          row.is_collapsed || 0,
          row.sort_order || 0,
          uuid,
          row.deleted || 0,
          row.created_at || null,
          row.updated_at || null,
        ]);
      copied += 1;
    }

    let backfilledUuid = 0;
    const missingUuid = await db
      .prepare(
        `SELECT id FROM cabinet_locations
         WHERE (uuid IS NULL OR TRIM(uuid) = '') AND id IS NOT NULL AND TRIM(id) != ''`
      )
      .all([]);
    for (const row of missingUuid) {
      await db
        .prepare(
          `UPDATE cabinet_locations SET uuid = ?, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        )
        .run([String(row.id).trim(), row.id]);
      backfilledUuid += 1;
    }

    return { copied, backfilledUuid };
  } catch (e) {
    if (/no such table/i.test(String(e.message || e))) {
      return { copied: 0, backfilledUuid: 0, skipped: true };
    }
    throw e;
  }
}

/**
 * Cabinets reference location_id UUIDs with no cabinet_locations row (legacy bug / lost rows).
 * Insert placeholder names so grouping works; names can be renamed in the PM session UI.
 */
async function reconstructPhantomCabinetLocations(db) {
  const groups = await db
    .prepare(
      `SELECT c.pm_session_id AS session_id, c.location_id AS id, COUNT(*) AS cabinet_count
       FROM cabinets c
       LEFT JOIN cabinet_locations cl ON cl.id = c.location_id
       WHERE COALESCE(c.deleted, 0) = 0
         AND c.location_id IS NOT NULL AND TRIM(c.location_id) != ''
         AND cl.id IS NULL
       GROUP BY c.pm_session_id, c.location_id
       ORDER BY c.pm_session_id, c.location_id`
    )
    .all([]);

  if (!groups.length) return { inserted: 0 };

  const sessionCounter = new Map();
  let inserted = 0;
  for (const g of groups) {
    const sessionId = g.session_id;
    const locId = String(g.id).trim();
    const idx = (sessionCounter.get(sessionId) || 0) + 1;
    sessionCounter.set(sessionId, idx);
    const locationName = `Recovered location ${idx}`;

    await db
      .prepare(
        `INSERT INTO cabinet_locations
           (id, session_id, location_name, description, is_collapsed, sort_order,
            uuid, synced, deleted, created_at, updated_at)
         VALUES (?, ?, ?, '', 0, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run([locId, sessionId, locationName, idx, locId]);
    inserted += 1;
  }

  return { inserted };
}

module.exports = {
  migrateCabinetNamesIntoLocations,
  reconstructPhantomCabinetLocations,
};
