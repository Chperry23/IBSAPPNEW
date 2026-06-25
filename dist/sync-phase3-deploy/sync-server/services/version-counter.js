const { SyncMeta } = require('../models/sync-meta');

const COUNTER_KEY = 'server_version';

async function getServerVersion() {
  const doc = await SyncMeta.findById(COUNTER_KEY).lean();
  return doc?.value?.current ?? 0;
}

async function allocateVersions(count, session) {
  const opts = session ? { session } : {};
  const existing = await SyncMeta.findById(COUNTER_KEY).session(session || null);
  const current = existing?.value?.current ?? 0;
  const next = current + count;
  await SyncMeta.findOneAndUpdate(
    { _id: COUNTER_KEY },
    { $set: { value: { current: next }, updated_at: new Date() } },
    { upsert: true, ...opts }
  );
  const start = current + 1;
  return { start, end: next };
}

module.exports = { getServerVersion, allocateVersions, COUNTER_KEY };
