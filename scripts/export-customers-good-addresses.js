/**
 * Export customers with complete address from system registry UserInfo import.
 * node scripts/export-customers-good-addresses.js [db-path] [output.csv]
 */
const fs = require('fs');
const path = require('path');

const dbPath = process.argv[2] || path.resolve(__dirname, '../data/cabinet_pm_tablet.db');
const outPath =
  process.argv[3] ||
  path.resolve(__dirname, '../exports/customers-good-addresses.csv');

process.env.DB_PATH = dbPath;
const db = require('../backend/config/database');

function csvEscape(val) {
  if (val == null || val === '') return '';
  const s = String(val).replace(/\r?\n/g, ' ').trim();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToCsv(row, headers) {
  return headers.map((h) => csvEscape(row[h])).join(',');
}

(async () => {
  const rows = await db.prepare(
    `SELECT
       c.id,
       c.name,
       c.alias,
       c.company_name,
       c.street_address,
       c.city,
       c.state,
       c.zip,
       c.country,
       c.contact_person,
       c.email,
       c.phone,
       c.dongle_id,
       c.location,
       c.contact_info,
       c.registry_version,
       (SELECT COUNT(*) FROM sys_workstations w
        WHERE w.customer_id = c.id AND COALESCE(w.deleted, 0) != 1) AS registry_workstations
     FROM customers c
     WHERE COALESCE(c.deleted, 0) != 1
       AND c.street_address IS NOT NULL AND TRIM(c.street_address) != ''
       AND c.city IS NOT NULL AND TRIM(c.city) != ''
       AND c.state IS NOT NULL AND TRIM(c.state) != ''
       AND c.zip IS NOT NULL AND TRIM(c.zip) != ''
     ORDER BY c.name`
  ).all([]);

  const headers = [
    'id',
    'name',
    'alias',
    'company_name',
    'street_address',
    'city',
    'state',
    'zip',
    'country',
    'contact_person',
    'email',
    'phone',
    'dongle_id',
    'registry_version',
    'registry_workstations',
  ];

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(rowToCsv(r, headers));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

  console.log(`Database: ${dbPath}`);
  console.log(`Exported ${rows.length} customer(s) with street + city + state + zip`);
  console.log(`Output: ${outPath}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
