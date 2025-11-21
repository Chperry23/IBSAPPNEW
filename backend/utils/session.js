const db = require('../config/database');

// Helper function to check if session is completed
async function isSessionCompleted(sessionId) {
  try {
    const session = await db.prepare('SELECT status FROM sessions WHERE id = ?').get([sessionId]);
    return session && session.status === 'completed';
  } catch (err) {
    console.error('Error checking session status:', err);
    return false; // Fail safe
  }
}

module.exports = { isSessionCompleted };
