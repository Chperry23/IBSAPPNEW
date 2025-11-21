const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const { isSessionCompleted } = require('../utils/session');

// Get node tracker data for a session
router.get('/:sessionId/node-tracker', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const trackerData = await db.prepare(`
      SELECT node_id, completed, notes
      FROM session_node_tracker 
      WHERE session_id = ?
    `).all([sessionId]);
    
    // Convert to object format {nodeId: {completed: true, notes: ''}}
    const result = {};
    trackerData.forEach(item => {
      result[item.node_id] = {
        completed: Boolean(item.completed),
        notes: item.notes || ''
      };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Get node tracker error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save node tracker data for a session
router.post('/:sessionId/node-tracker', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const trackerData = req.body;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify node tracker data - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    // First, delete existing tracker data for this session
    await db.prepare('DELETE FROM session_node_tracker WHERE session_id = ?').run([sessionId]);
    
    // Insert new tracker data
    let insertedCount = 0;
    
    for (const [nodeId, tracker] of Object.entries(trackerData)) {
      // Only insert if at least one field has data
      const hasData = tracker.completed || (tracker.notes && tracker.notes.trim());
      
      if (hasData) {
        await db.prepare(`
          INSERT INTO session_node_tracker (
            session_id, node_id, completed, notes
          ) VALUES (?, ?, ?, ?)
        `).run([
          sessionId,
          parseInt(nodeId),
          tracker.completed ? 1 : 0,
          tracker.notes || null
        ]);
        insertedCount++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Node tracker data saved for ${insertedCount} nodes`
    });
  } catch (error) {
    console.error('Save node tracker error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

