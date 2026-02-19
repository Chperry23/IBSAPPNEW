/**
 * Soft-delete customers in MongoDB whose name (SI key) is not in ECI SYSTEMS.csv.
 * Run from project root: node backend/scripts/cleanup-invalid-customers-mongo.js
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

// Load valid SI keys from ECI SYSTEMS.csv (first column = name)
function loadValidSiKeys() {
  const csvPath = path.resolve(__dirname, '../../ECI SYSTEMS.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error('ECI SYSTEMS.csv not found at ' + csvPath);
  }
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const set = new Set();
  for (let i = 1; i < lines.length; i++) {
    const firstCol = lines[i].split(',')[0].trim();
    if (firstCol) set.add(firstCol);
  }
  return set;
}

const VALID_CUSTOMER_SI_KEYS = loadValidSiKeys();

function normalizeKey(name) {
  return name && String(name).trim();
}

async function run() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const customersCol = db.collection('customers');

  console.log('Cleanup customers not in valid list (MongoDB)');
  console.log('URI:', mongoUri.replace(/\/\/[^@]+@/, '//***@'));
  console.log('Valid SI keys count:', VALID_CUSTOMER_SI_KEYS.size);
  console.log('');

  const customers = await customersCol.find({ deleted: { $ne: 1 } }).toArray();
  const invalid = customers.filter((c) => !VALID_CUSTOMER_SI_KEYS.has(normalizeKey(c.name)));

  if (invalid.length === 0) {
    console.log('All customers are in the valid list. Nothing to remove.');
    await mongoose.disconnect();
    return;
  }

  console.log('Customers not in valid list (will be soft-deleted):');
  invalid.slice(0, 30).forEach((c) => console.log('  ', c._id, ' name:', JSON.stringify(c.name)));
  if (invalid.length > 30) console.log('  ... and', invalid.length - 30, 'more');

  const ids = invalid.map((c) => c._id);
  const result = await customersCol.updateMany(
    { _id: { $in: ids } },
    { $set: { deleted: 1, updated_at: new Date() } }
  );
  console.log('\nMarked as deleted:', result.modifiedCount, 'customer(s)');
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
