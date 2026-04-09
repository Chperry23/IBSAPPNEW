const express    = require('express');
const router     = express.Router();
const db         = require('../config/database');
const requireAuth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const sp = require('../services/sharepoint');

// ── GET /api/sharepoint/status ────────────────────────────────────────────────
// Returns whether SharePoint credentials are configured
router.get('/api/sharepoint/status', requireAuth, (req, res) => {
  const cfg = sp.loadConfig();
  res.json({
    configured: sp.isConfigured(),
    siteHost:  cfg.siteHost,
    sitePath:  cfg.sitePath,
    listName:  cfg.listName,
  });
});

// ── GET /api/sharepoint/discover-lists ───────────────────────────────────────
// Returns all list names on the SharePoint site so you can verify/correct
// the listName value in sharepoint-config.json.
router.get('/api/sharepoint/discover-lists', requireAuth, async (req, res) => {
  if (!sp.isConfigured()) {
    return res.status(503).json({ success: false, error: 'SharePoint not configured. Add credentials to sharepoint-config.json.' });
  }
  try {
    const lists = await sp.discoverLists();
    res.json({ success: true, lists });
  } catch (err) {
    console.error('SharePoint discover-lists error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/sharepoint/sync-customer/:customerId ────────────────────────────
// Fetches all SharePoint list items, finds those whose Dongle ID list contains
// this customer's dongle_id, then upserts them into customer_notes.
router.post('/api/sharepoint/sync-customer/:customerId', requireAuth, async (req, res) => {
  const customerId = parseInt(req.params.customerId);

  if (!sp.isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'SharePoint not configured. Add credentials to sharepoint-config.json.',
    });
  }

  try {
    // Get customer's dongle_id for matching
    const customer = await db.prepare(`SELECT dongle_id, name FROM customers WHERE id = ?`).get([customerId]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

    const dongleId = (customer.dongle_id || '').trim();
    const custName = (customer.name || '').toLowerCase().trim();
    if (!dongleId && !custName) {
      return res.json({ success: true, added: 0, message: 'Customer has no dongle_id — nothing to match.' });
    }

    const items   = await sp.fetchListItems();
    let   added   = 0;
    let   updated = 0;

    for (const item of items) {
      const parsed = sp.parseListItem(item);
      if (!parsed.noteText || parsed.noteText === 'PLACEHOLDER' || parsed.noteText === 'Add any new notes') continue;

      // Match by dongle_id (preferred) or customer name
      const matchByDongle = dongleId && parsed.dongleIds.some(d => d.toLowerCase() === dongleId.toLowerCase());
      const matchByName   = !matchByDongle && custName && parsed.title.toLowerCase().includes(custName);
      if (!matchByDongle && !matchByName) continue;

      // Upsert: if we already have this sp_item_id stored, update; else insert
      const existing = parsed.spItemId
        ? await db.prepare(`SELECT id, note FROM customer_notes WHERE customer_id = ? AND sp_item_id = ?`)
                    .get([customerId, parsed.spItemId])
        : null;

      if (existing) {
        if (existing.note !== parsed.noteText) {
          await db.prepare(
            `UPDATE customer_notes SET note=?, synced=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`
          ).run([parsed.noteText, existing.id]);
          updated++;
        }
      } else {
        await db.prepare(
          `INSERT INTO customer_notes (customer_id, note, created_by, uuid, synced, deleted, source, sp_item_id)
           VALUES (?, ?, ?, ?, 0, 0, 'sharepoint', ?)`
        ).run([
          customerId,
          parsed.noteText,
          `SharePoint${parsed.category ? ' – ' + parsed.category : ''}`,
          uuidv4(),
          parsed.spItemId || null,
        ]);
        added++;
      }
    }

    res.json({ success: true, added, updated, total: items.length });
  } catch (err) {
    console.error('SharePoint sync error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/sharepoint/push-note ────────────────────────────────────────────
// Pushes a single note (by customer_notes.id) to SharePoint and marks it.
router.post('/api/sharepoint/push-note/:noteId', requireAuth, async (req, res) => {
  const noteId = parseInt(req.params.noteId);

  if (!sp.isConfigured()) {
    return res.status(503).json({ success: false, error: 'SharePoint not configured.' });
  }

  try {
    const note = await db.prepare(
      `SELECT cn.*, c.dongle_id, c.name as customer_name
       FROM customer_notes cn JOIN customers c ON cn.customer_id = c.id
       WHERE cn.id = ?`
    ).get([noteId]);
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });

    const result = await sp.pushNoteToSharePoint(
      note.dongle_id || note.customer_name,
      note.note,
      note.created_by || req.user?.username
    );

    // Mark as synced to SharePoint
    const spId = result?.id ? parseInt(result.id, 10) : null;
    await db.prepare(
      `UPDATE customer_notes SET source='sharepoint', sp_item_id=?, synced=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).run([spId, noteId]);

    res.json({ success: true, spItemId: spId });
  } catch (err) {
    console.error('SharePoint push error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
