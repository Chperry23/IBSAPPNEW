/**
 * Fix sessions that were incorrectly assigned to the wrong customer
 * (e.g. after a sync that matched by integer customer_id instead of customer uuid).
 *
 * Run from project root:
 *   node backend/scripts/fix-session-customer-assignments.js
 *
 * Uses DB_PATH env or default data/cabinet_pm_tablet.db.
 *
 * Session names are matched with LIKE %name% so slight variations still match.
 * Customer is matched by exact location (e.g. 0001-0001-6482).
 */

const path = require('path');
const fs = require('fs');

// Session name (substring match) -> correct customer location
const SESSION_TO_CORRECT_CUSTOMER = [
  { sessionName: 'PM-7/13/2025', correctCustomerLocation: '0001-0001-6482' },
  { sessionName: 'Sherwood PM-9/15/2025', correctCustomerLocation: '0001-0003-6709' },
  { sessionName: 'Texin - 9/29/2025', correctCustomerLocation: '0001-0001-0811' },
  { sessionName: 'Site Logs - 9/29/2025', correctCustomerLocation: '0001-0002-7154' },
  { sessionName: 'ARG - 11/3/2025', correctCustomerLocation: '0001-0002-4037' },
  { sessionName: 'MT STORM UNIT 1&2 - 11/12/2025', correctCustomerLocation: '0001-0002-9967' },
  { sessionName: 'MT STORM UNIT 3 - 11/12/2025', correctCustomerLocation: '0001-0003-7072' },
  { sessionName: 'Allnex - 9/22/2025', correctCustomerLocation: '0001-0002-8728' },
  { sessionName: 'Allnex - 1/05/2026', correctCustomerLocation: '0001-0002-8728' },
  { sessionName: 'SPU - 9/29/2025', correctCustomerLocation: '0001-0003-4662' },
  { sessionName: 'MPLX Harmon Creek - 12/11/2025', correctCustomerLocation: '0001-0004-5940' }
];

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../data/cabinet_pm_tablet.db');

async function run() {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);

  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  const runSql = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });

  console.log('Fix session -> customer assignments');
  console.log('DB:', dbPath);
  if (!fs.existsSync(dbPath)) {
    console.error('Database file not found.');
    process.exit(1);
  }
  console.log('');

  let totalFixed = 0;
  for (const { sessionName, correctCustomerLocation } of SESSION_TO_CORRECT_CUSTOMER) {
    const customer = await get(
      'SELECT id, name, location FROM customers WHERE TRIM(location) = ? AND (deleted IS NULL OR deleted = 0)',
      [String(correctCustomerLocation).trim()]
    );
    if (!customer) {
      console.log(`  Skip "${sessionName}": no customer with location "${correctCustomerLocation}"`);
      continue;
    }

    const sessions = await all(
      'SELECT id, session_name, customer_id FROM sessions WHERE session_name LIKE ? AND (deleted IS NULL OR deleted = 0)',
      ['%' + sessionName + '%']
    );

    if (sessions.length === 0) {
      console.log(`  Skip "${sessionName}": no session found`);
      continue;
    }

    for (const session of sessions) {
      if (session.customer_id === customer.id) {
        console.log(`  OK  "${session.session_name}" already on customer ${correctCustomerLocation} (${customer.name})`);
        continue;
      }
      await runSql('UPDATE sessions SET customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        customer.id,
        session.id
      ]);
      const oldCust = await get('SELECT location, name FROM customers WHERE id = ?', [session.customer_id]);
      console.log(
        `  FIX "${session.session_name}" -> customer ${correctCustomerLocation} (${customer.name}) [was: ${oldCust ? oldCust.location + ' ' + oldCust.name : session.customer_id}]`
      );
      totalFixed++;
    }
  }

  db.close();
  console.log('');
  console.log('Done. Sessions corrected:', totalFixed);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
