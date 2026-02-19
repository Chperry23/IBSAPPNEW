/**
 * Fix sessions in MongoDB (master) that were incorrectly assigned to the wrong customer.
 * Run from project root:
 *   MONGODB_URI=mongodb://... node backend/scripts/fix-session-customer-assignments-mongo.js
 *
 * Session names are matched with regex (substring). Customer is matched by exact location.
 */

const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

const SESSION_TO_CORRECT_CUSTOMER = [
  { sessionName: 'PM-7/13/2025', correctCustomerLocation: '0001-0001-6482' },
  { sessionName: 'Sherwood PM - 9/15/2025', correctCustomerLocation: '0001-0003-7310' },
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

async function run() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const sessionsCol = db.collection('sessions');
  const customersCol = db.collection('customers');

  console.log('Fix session -> customer assignments (MongoDB)');
  console.log('URI:', mongoUri.replace(/\/\/[^@]+@/, '//***@'));
  console.log('');

  // In master DB, customer code (e.g. 0001-0001-6482) is in "name" field; "location" is descriptive text.
  let totalFixed = 0;
  for (const { sessionName, correctCustomerLocation } of SESSION_TO_CORRECT_CUSTOMER) {
    const code = String(correctCustomerLocation).trim();
    const customer = await customersCol.findOne({
      $or: [
        { name: code },
        { name: { $regex: new RegExp('^\\s*' + code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') } }
      ],
      deleted: { $ne: 1 }
    });
    if (!customer) {
      console.log(`  Skip "${sessionName}": no customer with name/code "${correctCustomerLocation}"`);
      continue;
    }

    const re = new RegExp(sessionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const sessions = await sessionsCol.find({ session_name: re, deleted: { $ne: 1 } }).toArray();

    if (sessions.length === 0) {
      console.log(`  Skip "${sessionName}": no session found`);
      continue;
    }

    for (const session of sessions) {
      if (session.customer_id === customer._id) {
        console.log(`  OK  "${session.session_name}" already on customer ${correctCustomerLocation}`);
        continue;
      }
      await sessionsCol.updateOne(
        { _id: session._id },
        { $set: { customer_id: customer._id, updated_at: new Date() } }
      );
      console.log(`  FIX "${session.session_name}" -> customer ${correctCustomerLocation} (was _id ${session.customer_id})`);
      totalFixed++;
    }
  }

  await mongoose.disconnect();
  console.log('');
  console.log('Done. Sessions corrected:', totalFixed);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
