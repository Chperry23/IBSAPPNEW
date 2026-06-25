const mongoose = require('mongoose');

const syncStagingSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, index: true },
    chunk_index: { type: Number, required: true },
    device_id: { type: String, required: true },
    tables: { type: mongoose.Schema.Types.Mixed },
    checksum: { type: String },
    received_at: { type: Date, default: Date.now },
  },
  { collection: 'sync_staging', versionKey: false }
);
syncStagingSchema.index({ token: 1, chunk_index: 1 }, { unique: true });

const syncSessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    device_id: { type: String, required: true, index: true },
    direction: { type: String, enum: ['upload', 'download'], default: 'upload' },
    status: {
      type: String,
      enum: ['open', 'staged', 'committed', 'failed', 'expired'],
      default: 'open',
    },
    chunks_received: { type: Number, default: 0 },
    rows_staged: { type: Number, default: 0 },
    rows_applied: { type: Number, default: 0 },
    cursor_before: { type: Number, default: 0 },
    cursor_after: { type: Number },
    error: { type: String },
    checksums: { type: mongoose.Schema.Types.Mixed },
    started_at: { type: Date, default: Date.now },
    completed_at: { type: Date },
  },
  { collection: 'sync_sessions', versionKey: false }
);

const syncChangeSchema = new mongoose.Schema(
  {
    server_version: { type: Number, required: true, unique: true, index: true },
    table_name: { type: String, required: true, index: true },
    uuid: { type: String, required: true, index: true },
    operation: { type: String, enum: ['upsert', 'delete'], required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    device_id: { type: String },
    sync_session_id: { type: String },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'sync_changes', versionKey: false }
);
syncChangeSchema.index({ server_version: 1 });
syncChangeSchema.index({ table_name: 1, uuid: 1 });

const syncMetaSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'sync_meta', versionKey: false }
);

module.exports = {
  SyncStaging: mongoose.model('SyncStaging', syncStagingSchema),
  SyncSession: mongoose.model('SyncSession', syncSessionSchema),
  SyncChange: mongoose.model('SyncChange', syncChangeSchema),
  SyncMeta: mongoose.model('SyncMeta', syncMetaSchema),
};
