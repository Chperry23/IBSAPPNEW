/**
 * Serve tablet update feed over HTTP (same host as sync API).
 * Field PCs can reach :3090 without SMB credentials; UNC shares often fail for tablet users.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const router = express.Router();

function updatesDir() {
  const dir = config.tabletUpdatesDir;
  if (!dir) return null;
  return dir.replace(/\//g, '\\').replace(/\\+$/, '');
}

router.get('/tablet-updates/version.json', (req, res) => {
  const dir = updatesDir();
  if (!dir) {
    return res.status(503).json({ error: 'TABLET_UPDATES_DIR not configured on sync server' });
  }
  const feedPath = path.join(dir, 'version.json');
  if (!fs.existsSync(feedPath)) {
    return res.status(404).json({ error: `version.json not found in ${dir}` });
  }
  res.sendFile(feedPath);
});

router.get('/tablet-updates/:fileName', (req, res) => {
  const dir = updatesDir();
  if (!dir) {
    return res.status(503).json({ error: 'TABLET_UPDATES_DIR not configured on sync server' });
  }
  const fileName = path.basename(req.params.fileName || '');
  if (!fileName || fileName !== req.params.fileName) {
    return res.status(400).json({ error: 'Invalid file name' });
  }
  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath, fileName);
});

module.exports = router;
