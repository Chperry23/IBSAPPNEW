const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');

// Get all customers
router.get('/', requireAuth, async (req, res) => {
  try {
    const customers = await db.prepare('SELECT * FROM customers ORDER BY name').all([]);
    res.json(customers);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// NEW: Efficient endpoint to get all customers with session counts
router.get('/with-counts', requireAuth, async (req, res) => {
  try {
    // Get all customers with session counts in one efficient query (exclude deleted sessions)
    const customersWithCounts = await db.prepare(`
      SELECT c.*, 
             COUNT(s.id) as session_count,
             COUNT(CASE WHEN s.status != 'completed' THEN 1 END) as active_sessions
      FROM customers c
      LEFT JOIN sessions s ON c.id = s.customer_id AND (s.deleted IS NULL OR s.deleted = 0)
      GROUP BY c.id, c.name, c.location, c.contact_info, c.created_at, c.updated_at
      ORDER BY c.name
    `).all([]);
    
    res.json(customersWithCounts);
  } catch (error) {
    console.error('Get customers with counts error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get custom equipment models for a customer by type (e.g. Switch)
router.get('/:customerId/custom-models/:type', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  const equipmentType = (req.params.type || '').trim();
  if (!equipmentType) {
    return res.status(400).json({ error: 'Equipment type is required' });
  }
  try {
    const rows = await db.prepare(
      'SELECT model_name FROM customer_custom_equipment_models WHERE customer_id = ? AND equipment_type = ? ORDER BY model_name'
    ).all([customerId, equipmentType]);
    res.json(rows.map(r => r.model_name));
  } catch (error) {
    console.error('Get custom models error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add custom equipment model for a customer (saved so others can use the selection)
router.post('/:customerId/custom-models', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  const { equipment_type, model_name } = req.body;
  const name = (model_name || '').trim();
  const type = (equipment_type || '').trim();
  if (!name || !type) {
    return res.status(400).json({ error: 'equipment_type and model_name are required' });
  }
  try {
    await db.prepare(
      'INSERT OR IGNORE INTO customer_custom_equipment_models (customer_id, equipment_type, model_name) VALUES (?, ?, ?)'
    ).run([customerId, type, name]);
    const rows = await db.prepare(
      'SELECT model_name FROM customer_custom_equipment_models WHERE customer_id = ? AND equipment_type = ? ORDER BY model_name'
    ).all([customerId, type]);
    res.json({ success: true, models: rows.map(r => r.model_name) });
  } catch (error) {
    console.error('Add custom model error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get individual customer
router.get('/:customerId', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  
  try {
    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get([customerId]);
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json(customer);
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create customer
router.post('/', requireAuth, async (req, res) => {
  const { name, location, contact_info, alias } = req.body;
  
  try {
    const result = await db.prepare('INSERT INTO customers (name, location, contact_info, alias) VALUES (?, ?, ?, ?)').run([name, location, contact_info || null, alias || null]);
    
    const customer = {
      id: result.lastInsertRowid,
      name,
      location,
      contact_info,
      alias: alias || null,
      created_at: new Date().toISOString()
    };
    
    res.json({ success: true, customer });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update customer
router.put('/:customerId', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  const { 
    name, location, contact_info, contact_person, email, phone, address,
    system_username, system_password, company_name, street_address, city, state, zip, country, dongle_id, alias
  } = req.body;
  
  try {
    const result = await db.prepare(`
      UPDATE customers SET 
        name = ?, location = ?, contact_info = ?, 
        contact_person = ?, email = ?, phone = ?, address = ?,
        system_username = ?, system_password = ?,
        company_name = ?, street_address = ?, city = ?, state = ?, zip = ?, country = ?, dongle_id = ?, alias = ?,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run([
      name, location, contact_info, 
      contact_person, email, phone, address,
      system_username, system_password,
      company_name, street_address, city, state, zip, country, dongle_id, alias ?? null,
      customerId
    ]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete customer
router.delete('/:customerId', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  
  try {
    // Delete all related records first due to foreign key constraints
    // Delete in proper order: metric history -> cabinets -> sessions -> nodes -> customer
    await db.prepare('DELETE FROM customer_metric_history WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM cabinets WHERE pm_session_id IN (SELECT id FROM sessions WHERE customer_id = ?)').run([customerId]);
    await db.prepare('DELETE FROM sessions WHERE customer_id = ?').run([customerId]);
    await db.prepare('DELETE FROM nodes WHERE customer_id = ?').run([customerId]);
    const result = await db.prepare('DELETE FROM customers WHERE id = ?').run([customerId]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get customer metric history (for trend over time)
router.get('/:customerId/metric-history', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  
  try {
    const history = await db.prepare(`
      SELECT id, customer_id, session_id, session_name, recorded_at, error_count, risk_score, risk_level,
             total_components, failed_components, cabinet_count, created_at
      FROM customer_metric_history
      WHERE customer_id = ?
      ORDER BY recorded_at DESC
    `).all([customerId]);
    
    res.json(history);
  } catch (error) {
    console.error('Get customer metric history error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get PM sessions for a customer
router.get('/:customerId/sessions', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);
  
  try {
    // Get sessions with user info and cabinet count (exclude deleted)
    const customerSessions = await db.prepare(`
      SELECT s.*, u.username,
             (SELECT COUNT(*) FROM cabinets c WHERE c.pm_session_id = s.id AND COALESCE(c.deleted, 0) = 0) as cabinet_count
      FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.customer_id = ? AND (s.deleted IS NULL OR s.deleted = 0)
      ORDER BY s.created_at DESC
    `).all([customerId]);
    
    res.json(customerSessions);
  } catch (error) {
    console.error('Get customer sessions error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

