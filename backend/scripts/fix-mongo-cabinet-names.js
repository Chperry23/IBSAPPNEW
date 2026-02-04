/**
 * Set cabinet_name = cabinet_location for cabinets where cabinet_name is missing/empty.
 * (cabinet_name is the new field; cabinet_location was the old "name" field.)
 *
 * Run from project root: node backend/scripts/fix-mongo-cabinet-names.js
 */
const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

async function main() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }

  const db = mongoose.connection.db;
  const cabinets = db.collection('cabinets');

  const all = await cabinets.find({ deleted: { $ne: 1 } }).toArray();
  const needFix = all.filter(
    (doc) =>
      doc.cabinet_name == null ||
      (typeof doc.cabinet_name === 'string' && !doc.cabinet_name.trim())
  );

  console.log(`Found ${needFix.length} cabinets with missing/empty cabinet_name (will set to cabinet_location).`);

  if (needFix.length === 0) {
    await mongoose.disconnect();
    console.log('Nothing to update.');
    return;
  }

  let updated = 0;
  for (const doc of needFix) {
    const newName =
      doc.cabinet_location != null && String(doc.cabinet_location).trim()
        ? String(doc.cabinet_location).trim()
        : 'Unnamed Cabinet';
    const result = await cabinets.updateOne(
      { _id: doc._id },
      { $set: { cabinet_name: newName, updated_at: new Date() } }
    );
    if (result.modifiedCount) updated++;
  }

  console.log(`Updated ${updated} cabinet(s).`);
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
