const db = require('../backend/config/database');
const { recordChangeForRow } = require('../backend/utils/change-journal');

const CUSTOMER_ID = 296;
const SESSION_ID = '61302e52-9471-49fb-9b9b-4bc101dd7001';

(async () => {
  const cabinets = await db.prepare(
    `SELECT * FROM cabinets
     WHERE pm_session_id = ?
       AND COALESCE(deleted, 0) != 1
       AND (uuid IS NULL OR TRIM(uuid) = '')`
  ).all([SESSION_ID]);

  console.log(`Fixing ${cabinets.length} Penn State cabinet(s) missing uuid...`);

  for (const cab of cabinets) {
    await db.prepare(
      `UPDATE cabinets SET uuid = ?, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run([cab.id, cab.id]);

    const updated = await db.prepare('SELECT * FROM cabinets WHERE id = ?').get([cab.id]);
    await recordChangeForRow(db, 'cabinets', updated, 'upsert');
    console.log(`  ✓ ${updated.cabinet_name} (${updated.id})`);
  }

  await db.prepare(
    `UPDATE sessions SET synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run([SESSION_ID]);
  const session = await db.prepare('SELECT * FROM sessions WHERE id = ?').get([SESSION_ID]);
  if (session?.uuid) {
    await recordChangeForRow(db, 'sessions', session, 'upsert');
  }

  const stats = await db.prepare(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN uuid IS NOT NULL AND TRIM(uuid) != '' AND synced = 0 THEN 1 ELSE 0 END) as ready
     FROM cabinets WHERE pm_session_id = ? AND COALESCE(deleted, 0) != 1`
  ).get([SESSION_ID]);
  console.log('Ready to sync:', stats);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
