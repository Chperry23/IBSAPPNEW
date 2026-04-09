const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');

// GET /api/custom-error-types — list active custom error types
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.prepare(
      `SELECT id, label, description, icon, uuid, created_at
       FROM custom_io_error_types
       WHERE deleted = 0
       ORDER BY created_at ASC`
    ).all([]);
    res.json(rows);
  } catch (error) {
    console.error('GET custom-error-types error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/custom-error-types — create a new custom error type
router.post('/', requireAuth, async (req, res) => {
  try {
    const { label, description, icon } = req.body;
    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: 'label is required' });
    }
    const id = uuidv4();
    await db.prepare(
      `INSERT INTO custom_io_error_types (label, description, icon, uuid, synced, deleted)
       VALUES (?, ?, ?, ?, 0, 0)`
    ).run([String(label).trim(), description || null, icon || '⚠️', id]);

    const created = await db.prepare(
      `SELECT id, label, description, icon, uuid, created_at
       FROM custom_io_error_types WHERE uuid = ?`
    ).get([id]);
    res.json(created);
  } catch (error) {
    console.error('POST custom-error-types error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/custom-error-types/:id — soft delete
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.prepare(
      `UPDATE custom_io_error_types SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run([id]);
    res.json({ success: true });
  } catch (error) {
    console.error('DELETE custom-error-types error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
