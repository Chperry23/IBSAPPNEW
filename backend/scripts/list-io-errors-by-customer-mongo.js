/**
 * List I/O errors (session_diagnostics) in the master MongoDB for given customer codes.
 * Customer match: name or alias contains the code (e.g. 0001-0001-8950, 0001-0001-2552).
 *
 * Run from project root: node backend/scripts/list-io-errors-by-customer-mongo.js [code1] [code2] ...
 * Example: node backend/scripts/list-io-errors-by-customer-mongo.js 0001-0001-8950 0001-0001-2552
 *
 * With no args: lists I/O errors for any customer whose name or alias contains "0001-0001-8950" or "0001-0001-2552".
 */
const mongoose = require('mongoose');
const models = require('../models/mongodb-models');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

const codes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['0001-0001-8950', '0001-0001-2552'];

async function main() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB (master):', mongoUri.replace(/\/\/[^@]+@/, '//***@'));
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }

  const Customer = models.Customer;
  const Session = models.Session;
  const SessionDiagnostics = models.SessionDiagnostics;

  // Find customers matching any of the codes (name or alias contains code)
  const customers = await Customer.find({
    deleted: { $ne: 1 },
    $or: codes.map((code) => ({
      $or: [
        { name: new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { alias: new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ],
    })),
  })
    .lean()
    .exec();

  if (customers.length === 0) {
    console.log('\nNo customers found for codes:', codes.join(', '));
    await mongoose.disconnect();
    return;
  }

  console.log('\n--- Customers ---');
  customers.forEach((c) => {
    console.log(`  _id: ${c._id}, name: ${c.name || '(empty)'}, alias: ${c.alias || '(none)'}`);
  });

  const customerIds = customers.map((c) => c._id);
  const sessions = await Session.find({
    customer_id: { $in: customerIds },
    deleted: { $ne: 1 },
  })
    .lean()
    .exec();

  console.log('\n--- Sessions ---');
  console.log(`  Total sessions for these customers: ${sessions.length}`);
  sessions.slice(0, 20).forEach((s) => {
    console.log(`  ${s._id}  (customer_id: ${s.customer_id})  ${s.session_name || ''}`);
  });
  if (sessions.length > 20) {
    console.log(`  ... and ${sessions.length - 20} more`);
  }

  const sessionIds = sessions.map((s) => s._id);
  const diagnostics = await SessionDiagnostics.find({
    session_id: { $in: sessionIds },
    deleted: { $ne: 1 },
  })
    .sort({ session_id: 1, controller_name: 1, card_number: 1, channel_number: 1 })
    .lean()
    .exec();

  console.log('\n--- I/O Errors (session_diagnostics) on master ---');
  console.log(`  Total: ${diagnostics.length}`);

  if (diagnostics.length > 0) {
    const bySession = {};
    diagnostics.forEach((d) => {
      if (!bySession[d.session_id]) bySession[d.session_id] = [];
      bySession[d.session_id].push(d);
    });
    Object.keys(bySession).forEach((sid) => {
      const session = sessions.find((s) => s._id === sid);
      const sessionName = session ? session.session_name : sid;
      console.log(`\n  Session: ${sid}  (${sessionName})`);
      bySession[sid].forEach((d, i) => {
        console.log(
          `    ${i + 1}. ${d.controller_name} card ${d.card_number} ch ${d.channel_number ?? '-'}  ${d.error_type}  ${d.error_description || ''}`
        );
      });
    });
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
