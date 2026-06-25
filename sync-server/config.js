module.exports = {
  port: parseInt(process.env.SYNC_SERVER_PORT || '3090', 10),
  mongoUri:
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/cabinet_pm_db?directConnection=true',
  chunkMaxBytes: parseInt(process.env.SYNC_CHUNK_MAX_BYTES || String(512 * 1024), 10),
  commitBatchSize: parseInt(process.env.SYNC_COMMIT_BATCH_SIZE || '250', 10),
  sessionTtlMs: parseInt(process.env.SYNC_SESSION_TTL_MS || String(24 * 60 * 60 * 1000), 10),
};
