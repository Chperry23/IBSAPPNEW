const express = require('express');
const mongoose = require('mongoose');
const { SyncSession } = require('../models/sync-meta');
const { getServerVersion } = require('../services/version-counter');

const router = express.Router();

router.get('/health', async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoOk = mongoState === 1;
  let serverVersion = null;
  if (mongoOk) {
    try {
      serverVersion = await getServerVersion();
    } catch (_) {}
  }
  res.json({
    status: mongoOk ? 'ok' : 'degraded',
    mongo: mongoOk ? 'connected' : 'disconnected',
    server_version: serverVersion,
    uptime_sec: Math.floor(process.uptime()),
    ts: new Date().toISOString(),
  });
});

router.get('/dashboard', async (req, res) => {
  try {
    const sessions = await SyncSession.find()
      .sort({ started_at: -1 })
      .limit(50)
      .lean();
    const serverVersion = await getServerVersion();
    const rows = sessions
      .map(
        (s) => `<tr>
          <td>${s.device_id || ''}</td>
          <td>${s.direction}</td>
          <td>${s.status}</td>
          <td>${s.rows_staged ?? 0}</td>
          <td>${s.rows_applied ?? 0}</td>
          <td>${s.cursor_after ?? '—'}</td>
          <td>${s.started_at ? new Date(s.started_at).toLocaleString() : ''}</td>
        </tr>`
      )
      .join('');

    res.type('html').send(`<!DOCTYPE html>
<html><head><title>Cabinet PM Sync</title>
<style>
  body{font-family:system-ui,sans-serif;margin:2rem;background:#f5f5f5}
  h1{color:#1a365d}
  table{border-collapse:collapse;width:100%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  th,td{padding:.5rem .75rem;border-bottom:1px solid #e2e8f0;text-align:left;font-size:.9rem}
  th{background:#edf2f7}
  .meta{color:#4a5568;margin-bottom:1rem}
</style></head><body>
<h1>Cabinet PM Sync Health</h1>
<p class="meta">Server version: <strong>${serverVersion}</strong> · <a href="/health">JSON health</a></p>
<table>
  <thead><tr><th>Device</th><th>Dir</th><th>Status</th><th>Staged</th><th>Applied</th><th>Cursor</th><th>Started</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="7">No sessions yet</td></tr>'}</tbody>
</table>
</body></html>`);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

module.exports = router;
