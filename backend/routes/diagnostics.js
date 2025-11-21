const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const { isSessionCompleted } = require('../utils/session');

// Get diagnostics for a session
router.get('/:sessionId/diagnostics', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    const diagnostics = await db.prepare(`
      SELECT * FROM session_diagnostics 
      WHERE session_id = ? AND (deleted IS NULL OR deleted = 0)
      ORDER BY controller_name, card_number, channel_number
    `).all([sessionId]);
    
    res.json(diagnostics);
  } catch (error) {
    console.error('Get diagnostics error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Clean up duplicate diagnostics for a session
router.post('/:sessionId/diagnostics/cleanup', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify diagnostics - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    // Find duplicates (same controller, card, channel but different IDs)
    const duplicates = await db.prepare(`
      SELECT controller_name, card_number, channel_number, COUNT(*) as count
      FROM session_diagnostics 
      WHERE session_id = ? AND (deleted IS NULL OR deleted = 0)
      GROUP BY controller_name, card_number, channel_number
      HAVING COUNT(*) > 1
    `).all([sessionId]);
    
    let cleanedCount = 0;
    
    for (const duplicate of duplicates) {
      // Get all records for this channel
      const records = await db.prepare(`
        SELECT * FROM session_diagnostics 
        WHERE session_id = ? AND controller_name = ? AND card_number = ? AND channel_number = ?
        AND (deleted IS NULL OR deleted = 0)
        ORDER BY updated_at DESC
      `).all([sessionId, duplicate.controller_name, duplicate.card_number, duplicate.channel_number]);
      
      // Keep the most recent one, delete the rest
      for (let i = 1; i < records.length; i++) {
        await db.prepare(`
          UPDATE session_diagnostics SET 
            deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run([records[i].id]);
        cleanedCount++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Cleaned up ${cleanedCount} duplicate diagnostics`,
      duplicatesFound: duplicates.length,
      recordsCleaned: cleanedCount
    });
  } catch (error) {
    console.error('Cleanup diagnostics error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save diagnostics for a session
router.post('/:sessionId/diagnostics', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const diagnostic = req.body;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify diagnostics - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    const result = await db.prepare(`
      INSERT INTO session_diagnostics (
        session_id, controller_name, card_number, channel_number, 
        error_type, error_description, notes, synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run([
      sessionId,
      diagnostic.controller_name,
      diagnostic.card_number,
      diagnostic.channel_number || null,
      diagnostic.error_type,
      diagnostic.error_description || null,
      diagnostic.notes || null
    ]);
    
    res.json({ 
      success: true, 
      id: result.lastInsertRowid,
      message: 'Diagnostic saved successfully'
    });
  } catch (error) {
    console.error('Save diagnostic error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update diagnostic
router.put('/:sessionId/diagnostics/:diagnosticId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const diagnosticId = req.params.diagnosticId;
  const diagnostic = req.body;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify diagnostics - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    const result = await db.prepare(`
      UPDATE session_diagnostics SET
        controller_name = ?, card_number = ?, channel_number = ?,
        error_type = ?, error_description = ?, notes = ?, 
        synced = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND session_id = ?
    `).run([
      diagnostic.controller_name,
      diagnostic.card_number,
      diagnostic.channel_number || null,
      diagnostic.error_type,
      diagnostic.error_description || null,
      diagnostic.notes || null,
      diagnosticId,
      sessionId
    ]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Diagnostic not found' });
    }
    
    res.json({ success: true, message: 'Diagnostic updated successfully' });
  } catch (error) {
    console.error('Update diagnostic error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete diagnostic (soft delete for sync)
router.delete('/:sessionId/diagnostics/:diagnosticId', requireAuth, async (req, res) => {
  const sessionId = req.params.sessionId;
  const diagnosticId = req.params.diagnosticId;
  
  try {
    // Check if session is completed
    if (await isSessionCompleted(sessionId)) {
      return res.status(403).json({ 
        error: 'Cannot modify diagnostics - PM session is completed',
        message: 'This PM session has been completed and cannot be modified. Create a new session to make changes.'
      });
    }
    
    // Soft delete for sync tracking
    const result = await db.prepare(`
      UPDATE session_diagnostics SET 
        deleted = 1, synced = 0, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND session_id = ?
    `).run([diagnosticId, sessionId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Diagnostic not found' });
    }
    
    res.json({ success: true, message: 'Diagnostic marked for deletion and will be synced to cloud' });
  } catch (error) {
    console.error('Delete diagnostic error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

