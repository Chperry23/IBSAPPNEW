/**
 * Quick check: list customers (location format) and sessions we want to fix.
 * Run: node backend/scripts/check-master-sessions-customers.js
 */
const mongoose = require('mongoose');
const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

const LOCATIONS = [
  '0001-0001-6482', '0001-0003-6709', '0001-0001-0811', '0001-0002-7154',
  '0001-0002-4037', '0001-0002-9967', '0001-0003-7072', '0001-0002-8728', '0001-0004-5940'
];
const SESSION_NAMES = [
  'PM-7/13/2025', 'Sherwood PM-9/15/2025', 'Texin - 9/29/2025', 'Site Logs - 9/29/2025',
  'ARG - 11/3/2025', 'MT STORM UNIT 1&2', 'MT STORM UNIT 3', 'Allnex - 1/05/2026', 'MPLX Harmon Creek'
];

async function run() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const customersCol = db.collection('customers');
  const sessionsCol = db.collection('sessions');

  console.log('=== Sample customers (first 15 with location) ===');
  const sampleCustomers = await customersCol.find({ deleted: { $ne: 1 } }).limit(15).project({ _id: 1, name: 1, location: 1 }).toArray();
  sampleCustomers.forEach(c => console.log('  _id:', c._id, ' location:', JSON.stringify(c.location), ' name:', (c.name || '').slice(0, 40)));

  console.log('\n=== Customers matching our target locations ===');
  for (const loc of LOCATIONS) {
    const c1 = await customersCol.findOne({ location: loc, deleted: { $ne: 1 } });
    const c2 = await customersCol.findOne({ location: new RegExp('^\\s*' + loc + '\\s*$'), deleted: { $ne: 1 } });
    const c3 = await customersCol.findOne({ $where: 'this.location && this.location.trim() === "' + loc + '"', deleted: { $ne: 1 } }).catch(() => null);
    console.log('  location "' + loc + '":', c1 ? 'found _id=' + c1._id : 'not found (exact)', c2 ? 'regex found' : '', c3 ? 'where found' : '');
  }

  console.log('\n=== Sessions matching our target names ===');
  for (const name of SESSION_NAMES) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const sessions = await sessionsCol.find({ session_name: re, deleted: { $ne: 1 } }).limit(3).toArray();
    if (sessions.length) {
      for (const s of sessions) {
        const cust = await customersCol.findOne({ _id: s.customer_id });
        console.log('  session_name:', JSON.stringify(s.session_name), ' customer_id:', s.customer_id, ' -> customer location:', cust ? JSON.stringify(cust.location) : 'N/A');
      }
    } else {
      console.log('  no session like:', name);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch(err => { console.error(err); process.exit(1); });
