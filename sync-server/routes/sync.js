const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const config = require('../config');
const { SyncStaging, SyncSession } = require('../models/sync-meta');
const { commitSession } = require('../services/commit');
const {
  getChangesSince,
  getRegistryManifest,
  getRegistrySnapshot,
  getRegistryTablePage,
  gzipJson,
} = require('../services/pull');
const { REGISTRY_TABLES } = require('../../backend/services/sync-tables');
const { getServerVersion } = require('../services/version-counter');

const gunzip = promisify(zlib.gunzip);
const router = express.Router();

function newToken() {
  return crypto.randomBytes(16).toString('hex');
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  return null;
}

router.post('/sync/begin', express.json(), async (req, res) => {
  try {
    const { device_id, cursor = 0, direction = 'upload' } = req.body || {};
    if (!device_id) {
      return res.status(400).json({ success: false, error: 'device_id required' });
    }
    const token = newToken();
    await SyncSession.create({
      _id: token,
      device_id,
      direction,
      status: 'open',
      cursor_before: parseInt(cursor, 10) || 0,
    });
    const current = await getServerVersion();
    res.json({
      success: true,
      token,
      server_version: current,
      chunk_max_bytes: config.chunkMaxBytes,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sync/upload/:token/status', async (req, res) => {
  try {
    const chunks = await SyncStaging.find({ token: req.params.token })
      .select('chunk_index checksum received_at')
      .sort({ chunk_index: 1 })
      .lean();
    const session = await SyncSession.findById(req.params.token).lean();
    res.json({
      success: true,
      status: session?.status || 'unknown',
      chunks_received: chunks.map((c) => c.chunk_index),
      rows_staged: session?.rows_staged ?? 0,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put(
  '/sync/upload/:token/:chunkIndex',
  express.raw({ type: '*/*', limit: '10mb' }),
  async (req, res) => {
    try {
      const { token, chunkIndex } = req.params;
      const session = await SyncSession.findById(token);
      if (!session) return res.status(404).json({ success: false, error: 'Unknown session' });
      if (session.status === 'committed') {
        return res.status(409).json({ success: false, error: 'Session already committed' });
      }

      let tables;
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        tables = req.body.tables || req.body;
      } else {
        const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
        let text;
        if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
          text = (await gunzip(raw)).toString('utf8');
        } else {
          text = raw.toString('utf8');
        }
        const payload = JSON.parse(text);
        tables = payload.tables || payload;
      }
      const checksum = crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex').slice(0, 16);
      const idx = parseInt(chunkIndex, 10);

      await SyncStaging.findOneAndUpdate(
        { token, chunk_index: idx },
        {
          $set: {
            token,
            chunk_index: idx,
            device_id: session.device_id,
            tables,
            checksum,
            received_at: new Date(),
          },
        },
        { upsert: true }
      );

      const rowCount = Object.values(tables).reduce((n, rows) => n + (rows?.length || 0), 0);
      const chunkCount = await SyncStaging.countDocuments({ token });
      await SyncSession.updateOne(
        { _id: token },
        { $set: { status: 'staged', chunks_received: chunkCount, rows_staged: rowCount } }
      );

      res.json({ success: true, chunk_index: idx, checksum, rows_in_chunk: rowCount });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

router.post('/sync/commit/:token', async (req, res) => {
  try {
    const result = await commitSession(req.params.token);
    res.json({
      success: true,
      cursor: result.cursor,
      rows_applied: result.rowsApplied,
      checksums: result.checksums,
      already_committed: !!result.alreadyCommitted,
    });
  } catch (err) {
    await SyncSession.updateOne(
      { _id: req.params.token },
      { $set: { status: 'failed', error: err.message, completed_at: new Date() } }
    );
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sync/changes', async (req, res) => {
  try {
    const since = parseInt(req.query.since, 10) || 0;
    const limit = Math.min(parseInt(req.query.limit, 10) || 5000, 10000);
    const gzipResponse = req.query.gzip === '1' || req.headers['accept-encoding']?.includes('gzip');

    const result = await getChangesSince(since, limit);
    const registry = await getRegistryManifest();
    const body = { success: true, ...result, registry_manifest: registry };

    if (gzipResponse) {
      const buf = await gzipJson(body);
      res.set('Content-Encoding', 'gzip');
      res.set('Content-Type', 'application/json');
      return res.send(buf);
    }
    res.json(body);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sync/registry-table/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    if (!REGISTRY_TABLES.includes(tableName)) {
      return res.status(400).json({ success: false, error: `Invalid registry table: ${tableName}` });
    }
    const skip = parseInt(req.query.skip, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 20000;
    const gzipResponse = req.query.gzip === '1';

    const page = await getRegistryTablePage(tableName, skip, limit);
    const body = { success: true, ...page };

    if (gzipResponse) {
      const buf = await gzipJson(body);
      res.set('Content-Encoding', 'gzip');
      res.set('Content-Type', 'application/json');
      return res.send(buf);
    }
    res.json(body);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sync/registry/:customerId', async (req, res) => {
  try {
    const snapshot = await getRegistrySnapshot(parseInt(req.params.customerId, 10));
    const gzipResponse = req.query.gzip === '1';
    if (gzipResponse) {
      const buf = await gzipJson(snapshot);
      res.set('Content-Encoding', 'gzip');
      res.set('Content-Type', 'application/json');
      return res.send(buf);
    }
    res.json({ success: true, snapshot });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sync/ack', express.json(), async (req, res) => {
  try {
    const { device_id, cursor } = req.body || {};
    res.json({ success: true, device_id, cursor });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
