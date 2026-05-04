const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');

// Global search — returns up to 5 results per category
// GET /api/search?q=term
router.get('/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ customers: [], sessions: [], cabinets: [], nodes: [] });
  }
  const like = `%${q}%`;

  try {
    const [customers, sessions, cabinets, workstations, controllers] = await Promise.all([
      db.prepare(`
        SELECT id, name, location as subtitle, 'customer' as type
        FROM customers
        WHERE name LIKE ? AND (deleted IS NULL OR deleted = 0)
        ORDER BY name LIMIT 5
      `).all([like]),

      db.prepare(`
        SELECT s.id, s.session_name as name, c.name as subtitle, 'session' as type
        FROM sessions s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.session_name LIKE ? AND (s.deleted IS NULL OR s.deleted = 0)
        ORDER BY s.created_at DESC LIMIT 5
      `).all([like]),

      db.prepare(`
        SELECT cab.id, cab.cabinet_name as name, s.session_name as subtitle, 'cabinet' as type
        FROM cabinets cab
        LEFT JOIN sessions s ON cab.pm_session_id = s.id
        WHERE cab.cabinet_name LIKE ? AND (cab.deleted IS NULL OR cab.deleted = 0)
        ORDER BY cab.cabinet_name LIMIT 5
      `).all([like]),

      db.prepare(`
        SELECT w.id + 1000000 as id, w.name, w.type as subtitle, 'node' as type, w.customer_id
        FROM sys_workstations w
        WHERE w.name LIKE ?
        ORDER BY w.name LIMIT 5
      `).all([like]),

      db.prepare(`
        SELECT c.id + 2000000 as id, c.name, 'Controller' as subtitle, 'node' as type, c.customer_id
        FROM sys_controllers c
        WHERE c.name LIKE ?
        ORDER BY c.name LIMIT 5
      `).all([like]),
    ]);

    // Merge node results (workstations + controllers), cap at 5 total
    const nodes = [...workstations, ...controllers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 5);

    res.json({ customers, sessions, cabinets, nodes });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
