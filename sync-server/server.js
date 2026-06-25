#!/usr/bin/env node
/**
 * Cabinet PM Sync API — runs on master machine (default port 3090).
 * Run from repo root: node sync-server/server.js
 */
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const config = require('./config');
const syncRoutes = require('./routes/sync');
const healthRoutes = require('./routes/health');

// Ensure models load (registers mongoose schemas for app collections)
require(path.join(__dirname, '../backend/models/mongodb-models'));
require('./models/sync-meta');

const app = express();
app.use(healthRoutes);
app.use(syncRoutes);
app.use(express.json({ limit: '2mb' }));

async function start() {
  console.log('Cabinet PM Sync API starting...');
  console.log('Mongo:', config.mongoUri.replace(/\/\/[^@]+@/, '//***@'));
  await mongoose.connect(config.mongoUri);
  console.log('Mongo connected');

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Sync API listening on http://0.0.0.0:${config.port}`);
    console.log(`Health: http://localhost:${config.port}/health`);
    console.log(`Dashboard: http://localhost:${config.port}/dashboard`);
  });
}

start().catch((err) => {
  console.error('Sync API failed to start:', err);
  process.exit(1);
});
