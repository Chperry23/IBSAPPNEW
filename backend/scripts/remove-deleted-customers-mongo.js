/**
 * Permanently remove customer documents that are marked deleted (deleted: 1).
 * After running cleanup-invalid-customers-mongo.js, the invalid customers are
 * only soft-deleted; this script removes them from the collection so the
 * customer count in MongoDB matches the actual number of kept customers.
 *
 * Run: node backend/scripts/remove-deleted-customers-mongo.js
 *
 * Note: Sessions/nodes that still reference a removed customer_id will have
 * an orphaned reference (that customer _id no longer exists). The app may
 * show "unknown" or null for those. To fix, run session fix scripts or
 * reassign those sessions to a valid customer.
 */

const mongoose = require('mongoose');

const mongoUri = process.env.MONGODB_URI || 'mongodb://172.16.10.124:27017/cabinet_pm_db';

async function run() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  const customersCol = db.collection('customers');

  const deletedCount = await customersCol.countDocuments({ deleted: 1 });
  const activeCount = await customersCol.countDocuments({ $or: [{ deleted: { $ne: 1 } }, { deleted: { $exists: false } }] });

  console.log('Remove deleted customers (hard delete) from MongoDB');
  console.log('URI:', mongoUri.replace(/\/\/[^@]+@/, '//***@'));
  console.log('');
  console.log('Current: total documents =', deletedCount + activeCount, ', active =', activeCount, ', deleted =', deletedCount);

  if (deletedCount === 0) {
    console.log('No deleted customers to remove.');
    await mongoose.disconnect();
    return;
  }

  const result = await customersCol.deleteMany({ deleted: 1 });
  console.log('\nPermanently removed:', result.deletedCount, 'customer document(s)');
  console.log('Customers collection now has', activeCount, 'document(s).');
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
