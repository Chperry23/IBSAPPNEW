#!/usr/bin/env node
/**
 * Mark I/O errors (session_diagnostics) as unsynced for a customer so the next Sync → Push uploads them.
 * Use when I/O errors were captured on an old app version that couldn't sync them — run on the DB that has the data (e.g. your new-version app).
 *
 * Usage: node scripts/repush-io-errors-for-customer.js "Customer Name"
 * Example: node scripts/repush-io-errors-for-customer.js "Land O Lakes"
 *
 * Then run Sync in the app and click Push (or Full sync).
 */

const path = require('path');
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../data/cabinet_pm_tablet.db');

const customerName = process.argv[2];
if (!customerName) {
  console.error('Usage: node scripts/repush-io-errors-for-customer.js "Customer Name"');
  console.error('Example: node scripts/repush-io-errors-for-customer.js "Land O Lakes"');
  process.exit(1);
}

// Use the app's database (same as server)
process.env.DB_PATH = dbPath;
const db = require('../backend/config/database');

async function main() {
  const customers = await db.prepare('SELECT id, name FROM customers WHERE name LIKE ?').all(['%' + customerName.trim() + '%']);
  if (customers.length === 0) {
    console.error('No customer found matching:', customerName);
    process.exit(1);
  }
  const customerIds = customers.map((c) => c.id);
  console.log('Customer(s):', customers.map((c) => c.name).join(', '));

  const placeholders = customerIds.map(() => '?').join(',');
  const sessions = await db.prepare(`SELECT id FROM sessions WHERE customer_id IN (${placeholders})`).all(customerIds);
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) {
    console.log('No sessions found for this customer.');
    process.exit(0);
  }
  console.log('Sessions:', sessionIds.length);

  const ph = sessionIds.map(() => '?').join(',');
  const result = await db.prepare(
    `UPDATE session_diagnostics SET synced = 0, updated_at = CURRENT_TIMESTAMP WHERE session_id IN (${ph})`
  ).run(sessionIds);
  console.log('Marked', result.changes, 'I/O error record(s) as unsynced.');
  console.log('Next: Open the app → Sync → click Push (or Full sync) to upload them.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
