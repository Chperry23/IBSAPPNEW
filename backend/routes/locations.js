const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');

// Helper function to check if session is completed
async function isSessionCompleted(sessionId) {
  const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
  return session && session.status === 'completed';
}

// Get all locations for a session
// Note: This route usually sits under /api/sessions/:sessionId/locations
// I will handle this by mounting this router or by using mergeParams if nested
// For now, I'll stick to the original URL structure but handle it here if the main server mounts it correctly,
// OR I can define it as /sessions/:sessionId/locations if mounted at /api
// Let's assume I mount this at /api/locations for the direct ID access,
// and /api/sessions/:sessionId/locations will be handled here as well if I mount it at /api

// Update: In server.js I'll probably mount this at /api
// So routes will be /locations/:locationId and /sessions/:sessionId/locations

// Get all locations for a session
router.get('/sessions/:sessionId/locations', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const locations = await db.prepare(`
      SELECT * FROM cabinet_names 
      WHERE session_id = ? 
      ORDER BY sort_order, location_name
    `).all([sessionId]);
    
    res.json(locations);
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new location
router.post('/sessions/:sessionId/locations', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const { location_name, description } = req.body;
  
  if (!location_name || !location_name.trim()) {
    return res.status(400).json({ error: 'Location name is required' });
  }
  
  const locationId = uuidv4();
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot add location - PM session is completed',
        message: 'This PM session has been completed and cannot be modified.'
      });
    }
    
    await db.prepare(`
      INSERT INTO cabinet_names (id, session_id, location_name, description, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run([
      locationId,
      sessionId,
      location_name.trim(),
      description || '',
      0
    ]);
    
    const location = {
      id: locationId,
      session_id: sessionId,
      location_name: location_name.trim(),
      description: description || '',
      is_collapsed: 0,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
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

// Update location
router.put('/locations/:locationId', requireAuth, async (req, res) => {
  const locationId = req.params.locationId;
  const { location_name, description, is_collapsed, sort_order } = req.body;
  
  try {
    const result = await db.prepare(`
      UPDATE cabinet_names SET 
        location_name = ?, description = ?, is_collapsed = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([
      location_name,
      description || '',
      is_collapsed || 0,
      sort_order || 0,
      locationId
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

// Delete location
router.delete('/locations/:locationId', requireAuth, async (req, res) => {
  const locationId = req.params.locationId;
  
  try {
    // First, unassign any cabinets from this location
    await db.prepare('UPDATE cabinets SET location_id = NULL WHERE location_id = ?').run([locationId]);
    
    // Delete the location
    const result = await db.prepare('DELETE FROM cabinet_names WHERE id = ?').run([locationId]);
    
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

