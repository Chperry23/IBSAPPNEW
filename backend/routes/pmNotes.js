const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Get PM notes for a session
router.get('/:sessionId/pm-notes', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const pmNotes = await db.prepare(
      'SELECT * FROM session_pm_notes WHERE session_id = ? AND deleted = 0'
    ).get([sessionId]);
    
    if (!pmNotes) {
      return res.status(404).json({ error: 'PM Notes not found' });
    }
    
    // Parse common_tasks JSON if it exists
    if (pmNotes.common_tasks) {
      try {
        pmNotes.common_tasks = JSON.parse(pmNotes.common_tasks);
      } catch (e) {
        pmNotes.common_tasks = [];
      }
    } else {
      pmNotes.common_tasks = [];
    }
    
    res.json(pmNotes);
  } catch (error) {
    console.error('Get PM notes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save PM notes for a session
router.post('/:sessionId/pm-notes', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { common_tasks, additional_work_notes, troubleshooting_notes, recommendations_notes } = req.body;
  
  try {
    // Generate UUID for sync
    const uuid = uuidv4();
    const now = new Date().toISOString();
    
    // Convert common_tasks array to JSON string
    const commonTasksJson = JSON.stringify(common_tasks || []);
    
    // Check if PM notes already exist for this session
    const existingNotes = await db.prepare(
      'SELECT id FROM session_pm_notes WHERE session_id = ? AND deleted = 0'
    ).get([sessionId]);
    
    let pmNotes;
    
    if (existingNotes) {
      // Update existing notes
      await db.prepare(
        'UPDATE session_pm_notes SET common_tasks = ?, additional_work_notes = ?, troubleshooting_notes = ?, recommendations_notes = ?, synced = 0, updated_at = ? WHERE session_id = ? AND deleted = 0'
      ).run([commonTasksJson, additional_work_notes, troubleshooting_notes, recommendations_notes, now, sessionId]);
      
      // Get the updated record
      pmNotes = await db.prepare(
        'SELECT * FROM session_pm_notes WHERE session_id = ? AND deleted = 0'
      ).get([sessionId]);
      
      // Parse common_tasks back to array
      if (pmNotes && pmNotes.common_tasks) {
        try {
          pmNotes.common_tasks = JSON.parse(pmNotes.common_tasks);
        } catch (e) {
          pmNotes.common_tasks = [];
        }
      }
    } else {
      // Create new notes
      await db.prepare(
        'INSERT INTO session_pm_notes (session_id, common_tasks, additional_work_notes, troubleshooting_notes, recommendations_notes, uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
      ).run([sessionId, commonTasksJson, additional_work_notes, troubleshooting_notes, recommendations_notes, uuid, now, now]);
      
      // Get the created record
      pmNotes = await db.prepare(
        'SELECT * FROM session_pm_notes WHERE session_id = ? AND deleted = 0'
      ).get([sessionId]);
      
      // Parse common_tasks back to array
      if (pmNotes && pmNotes.common_tasks) {
        try {
          pmNotes.common_tasks = JSON.parse(pmNotes.common_tasks);
        } catch (e) {
          pmNotes.common_tasks = [];
        }
      }
    }
    
    res.json({ success: true, pmNotes });
  } catch (error) {
    console.error('Save PM notes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

