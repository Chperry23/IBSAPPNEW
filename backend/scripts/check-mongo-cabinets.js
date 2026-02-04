/**
 * Check MongoDB cabinets for records with missing/empty cabinet_name
 * (these cause "NOT NULL constraint failed: cabinets.cabinet_name" during sync)
 *
 * Run from project root: node backend/scripts/check-mongo-cabinets.js
 * Or from backend: node scripts/check-mongo-cabinets.js
 */
const mongoose = require('mongoose');
const path = require('path');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

async function main() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB:', mongoUri.replace(/\/\/[^@]+@/, '//***@'));
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }

  const db = mongoose.connection.db;
  const cabinets = db.collection('cabinets');

  const all = await cabinets.find({ deleted: { $ne: 1 } }).toArray();
  const bad = all.filter(
    (doc) =>
      doc.cabinet_name == null ||
      (typeof doc.cabinet_name === 'string' && !doc.cabinet_name.trim())
  );

  console.log('\n--- Cabinets summary ---');
  console.log('Total (non-deleted):', all.length);
  console.log('Missing or empty cabinet_name:', bad.length);

  if (bad.length > 0) {
    console.log('\n--- Records with missing/empty cabinet_name (_id = sync error IDs) ---\n');
    bad.forEach((doc, i) => {
      console.log(
        `${i + 1}. _id: ${doc._id}\n   cabinet_name: ${JSON.stringify(doc.cabinet_name)}\n   cabinet_location: ${JSON.stringify(doc.cabinet_location)}\n   pm_session_id: ${doc.pm_session_id}\n`
      );
    });
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
