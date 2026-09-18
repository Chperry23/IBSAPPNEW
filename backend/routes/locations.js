const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');

async function isSessionCompleted(sessionId) {
  const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
  return session && session.status === 'completed';
}

// Synced table: cabinet_locations (uuid + synced). Do not use local-only cabinet_names.

router.get('/sessions/:sessionId/locations', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;

  try {
    const locations = await db
      .prepare(
        `
      SELECT * FROM cabinet_locations
      WHERE session_id = ? AND COALESCE(deleted, 0) = 0
      ORDER BY sort_order, location_name
    `
      )
      .all([sessionId]);

    res.json(locations);
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/sessions/:sessionId/locations', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const { location_name, description } = req.body;

  if (!location_name || !location_name.trim()) {
    return res.status(400).json({ error: 'Location name is required' });
  }

  const locationId = uuidv4();
  const rowUuid = uuidv4();

  try {
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({
        error: 'Cannot add location - PM session is completed',
        message: 'This PM session has been completed and cannot be modified.',
      });
    }

    await db
      .prepare(
        `
      INSERT INTO cabinet_locations
        (id, session_id, location_name, description, sort_order, uuid, synced, deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0)
    `
      )
      .run([locationId, sessionId, location_name.trim(), description || '', 0, rowUuid]);

    const location = {
      id: locationId,
      session_id: sessionId,
      location_name: location_name.trim(),
      description: description || '',
      is_collapsed: 0,
      sort_order: 0,
      uuid: rowUuid,
      synced: 0,
      deleted: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    res.json({ success: true, location });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Location name already exists in this session' });
    }
    console.error('Create location error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/locations/:locationId', requireAuth, async (req, res) => {
  const locationId = req.params.locationId;
  const { location_name, description, is_collapsed, sort_order } = req.body;

  try {
    const existing = await db
      .prepare(`SELECT session_id FROM cabinet_locations WHERE id = ? AND COALESCE(deleted, 0) = 0`)
      .get([locationId]);
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }
    if (await isSessionCompleted(existing.session_id)) {
      return res.status(403).json({ error: 'Cannot modify location on a completed session' });
    }

    const result = await db
      .prepare(
        `
      UPDATE cabinet_locations SET
        location_name = ?, description = ?, is_collapsed = ?, sort_order = ?,
        synced = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
      )
      .run([
        location_name,
        description || '',
        is_collapsed || 0,
        sort_order || 0,
        locationId,
      ]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ success: true, message: 'Location updated successfully' });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/locations/:locationId', requireAuth, async (req, res) => {
  const locationId = req.params.locationId;

  try {
    const existing = await db
      .prepare(`SELECT session_id FROM cabinet_locations WHERE id = ? AND COALESCE(deleted, 0) = 0`)
      .get([locationId]);
    if (!existing) {
      return res.status(404).json({ error: 'Location not found' });
    }
    if (await isSessionCompleted(existing.session_id)) {
      return res.status(403).json({ error: 'Cannot delete location on a completed session' });
    }

    await db.prepare('UPDATE cabinets SET location_id = NULL, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE location_id = ?').run([
      locationId,
    ]);

    // Soft-delete so cloud push propagates the removal
    const result = await db
      .prepare(
        `
      UPDATE cabinet_locations
      SET deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
      )
      .run([locationId]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ success: true, message: 'Location deleted successfully' });
  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
