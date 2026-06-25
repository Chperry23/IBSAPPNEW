const db = require('../backend/config/database');

(async () => {
  const patterns = ['%Node 0 Controller%', '%Node 0%', '%NODE0%'];
  const tables = [
    { table: 'nodes', col: 'node_name' },
    { table: 'sys_controllers', col: 'name' },
    { table: 'sys_workstations', col: 'name' },
    { table: 'session_node_maintenance', col: 'node_name' },
  ];

  for (const p of patterns) {
    console.log(`\n=== LIKE ${p} ===`);
    for (const { table, col } of tables) {
      const rows = await db.prepare(
        `SELECT * FROM ${table} WHERE ${col} LIKE ? AND COALESCE(deleted,0)!=1 LIMIT 20`
      ).all([p]);
      if (rows.length) {
        console.log(`  ${table}.${col}: ${rows.length}`);
        rows.forEach((r) =>
          console.log(`    id=${r.id} customer=${r.customer_id} ${col}=${r[col]} uuid=${r.uuid}`)
        );
      }
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
