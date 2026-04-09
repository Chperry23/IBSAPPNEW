/**
 * One-time migration: no_errors_checked (inverted) → has_io_errors (matches UI).
 * has_io_errors = 1: Errors column checked — controller has I/O issues to track.
 * has_io_errors = 0: No I/O issues.
 */
const db = require('./database');

async function migrateSessionNodeMaintenanceHasIoErrors() {
  try {
    const cols = await db.prepare('PRAGMA table_info(session_node_maintenance)').all();
    if (!cols || cols.length === 0) return;

    const names = new Set(cols.map((c) => c.name));
    if (!names.has('has_io_errors')) {
      await db.prepare(
        'ALTER TABLE session_node_maintenance ADD COLUMN has_io_errors INTEGER DEFAULT 1'
      ).run();
      console.log('✅ Added session_node_maintenance.has_io_errors');
    }

    const cols2 = await db.prepare('PRAGMA table_info(session_node_maintenance)').all();
    const names2 = new Set(cols2.map((c) => c.name));

    if (names2.has('no_errors_checked')) {
      await db.prepare(`
        UPDATE session_node_maintenance SET has_io_errors =
          CASE WHEN no_errors_checked IN (1, '1') THEN 0 ELSE 1 END
      `).run();
      console.log('✅ Migrated no_errors_checked → has_io_errors');

      try {
        await db.prepare(
          'ALTER TABLE session_node_maintenance DROP COLUMN no_errors_checked'
        ).run();
        console.log('✅ Dropped legacy no_errors_checked');
      } catch (dropErr) {
        console.warn(
          '⚠️ Could not DROP no_errors_checked (SQLite 3.35+). App uses has_io_errors only.'
        );
      }
    }
  } catch (e) {
    console.error('migrateSessionNodeMaintenanceHasIoErrors:', e.message);
    throw e;
  }
}

module.exports = { migrateSessionNodeMaintenanceHasIoErrors };
