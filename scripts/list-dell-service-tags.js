const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/cabinet_pm_tablet.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

(async () => {
  const ws = await all(`
    SELECT name, dell_service_tag_number AS tag, computer_model, model
    FROM sys_workstations
    WHERE dell_service_tag_number IS NOT NULL
      AND TRIM(dell_service_tag_number) NOT IN ('', 'Not available', 'N/A', 'n/a')
    LIMIT 15
  `);
  console.log('workstations', JSON.stringify(ws, null, 2));

  const nodes = await all(`
    SELECT node_name, serial, node_type
    FROM nodes
    WHERE serial IS NOT NULL
      AND TRIM(serial) NOT IN ('', 'Not available', 'N/A', 'n/a')
      AND LENGTH(TRIM(serial)) BETWEEN 5 AND 10
    LIMIT 15
  `);
  console.log('nodes', JSON.stringify(nodes, null, 2));
  db.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
