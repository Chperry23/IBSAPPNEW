const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const { findChrome, getPuppeteer } = require('../utils/chrome');
const { generateIIPDF, generateCombinedIIPDF, buildBlankIIChecklistItems } = require('../services/pdf/iiReport');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/** Checklist PATCH semantics: JSON body may omit fields; only supplied keys overwrite (fixes wiped readings on partial autosave). */
function mergeChecklistPayload(body, prevRowOrNull) {
  const isInsert = !prevRowOrNull;
  const pick = (key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
    return isInsert ? null : prevRowOrNull[key];
  };
  return {
    answer: pick('answer'),
    comments: pick('comments'),
    performed_by: pick('performed_by'),
    date_completed: pick('date_completed'),
    measurement_ohms: pick('measurement_ohms'),
    measurement_ac_ma: pick('measurement_ac_ma'),
    measurement_dc_ma: pick('measurement_dc_ma'),
    measurement_voltage: pick('measurement_voltage'),
    measurement_frequency: pick('measurement_frequency'),
    recorded_value: pick('recorded_value'),
  };
}

/** Equipment section: PATCH semantics so one checkbox POST does not null the rest */
function mergeEquipmentPayload(body, prevRowOrNull) {
  const isInsert = !prevRowOrNull;
  const pick = (key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
    return isInsert ? null : prevRowOrNull[key];
  };
  return {
    clamp_on_rms_ammeter: pick('clamp_on_rms_ammeter'),
    digit_dvm: pick('digit_dvm'),
    fluke_1630_earth_ground: pick('fluke_1630_earth_ground'),
    fluke_mt8200_micromapper: pick('fluke_mt8200_micromapper'),
    notes: pick('notes'),
  };
}

// Get all I&I documents for a session
router.get('/api/sessions/:sessionId/ii-documents', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const documents = await db.prepare('SELECT * FROM session_ii_documents WHERE session_id = ? AND deleted = 0 ORDER BY created_at').all([sessionId]);
    res.json(documents);
  } catch (error) {
    console.error('Get I&I documents error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new I&I document
router.post('/api/sessions/:sessionId/ii-documents', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { document_name, deltav_system_id, location } = req.body;
  
  try {
    const documentId = uuidv4();
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await db.prepare('INSERT INTO session_ii_documents (id, session_id, document_name, deltav_system_id, location, uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)').run([documentId, sessionId, document_name, deltav_system_id, location, uuid, now, now]);
    
    const document = await db.prepare('SELECT * FROM session_ii_documents WHERE id = ?').get([documentId]);
    res.json(document);
  } catch (error) {
    console.error('Create I&I document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get I&I document details
router.get('/api/ii-documents/:documentId', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  try {
    const document = await db.prepare('SELECT * FROM session_ii_documents WHERE id = ? AND deleted = 0').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
  } catch (error) {
    console.error('Get I&I document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/** Apply session default initials (and date when missing) to every checklist row on a cabinet document */
async function applyInitialsToDocument(documentId, sessionId, initials, defaultDate) {
  const templateItems = buildBlankIIChecklistItems();
  const now = new Date().toISOString();
  let updated = 0;

  for (const tpl of templateItems) {
    const existing = await db.prepare(
      'SELECT id, date_completed FROM session_ii_checklist WHERE document_id = ? AND section_name = ? AND item_name = ? AND deleted = 0'
    ).get([documentId, tpl.section_name, tpl.item_name]);

    if (existing) {
      await db.prepare(
        `UPDATE session_ii_checklist SET performed_by = ?, date_completed = COALESCE(date_completed, ?), synced = 0, updated_at = ? WHERE id = ?`
      ).run([initials, defaultDate, now, existing.id]);
    } else {
      await db.prepare(
        `INSERT INTO session_ii_checklist (session_id, document_id, section_name, item_name, performed_by, date_completed, uuid, synced, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run([sessionId, documentId, tpl.section_name, tpl.item_name, initials, defaultDate, crypto.randomUUID(), now, now]);
    }
    updated += 1;
  }

  return updated;
}

// Apply default initials to all checklist rows in every cabinet in an I&I session
router.post('/api/sessions/:sessionId/ii-apply-initials', requireAuth, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await db.prepare('SELECT * FROM sessions WHERE id = ? AND session_type = ?').get([sessionId, 'ii']);
    if (!session) {
      return res.status(404).json({ error: 'I&I session not found' });
    }

    const initials = (req.body?.initials || session.ii_initials || '').trim();
    if (!initials) {
      return res.status(400).json({ error: 'Set default initials in session header first' });
    }

    const defaultDate = session.ii_date_performed || new Date().toISOString().split('T')[0];
    const documents = await db.prepare(
      'SELECT id FROM session_ii_documents WHERE session_id = ? AND deleted = 0'
    ).all([sessionId]);

    if (!documents.length) {
      return res.status(400).json({ error: 'No cabinets in this I&I session' });
    }

    let rowsUpdated = 0;
    for (const doc of documents) {
      rowsUpdated += await applyInitialsToDocument(doc.id, sessionId, initials, defaultDate);
    }

    await db.prepare('UPDATE sessions SET updated_at = ?, synced = 0 WHERE id = ?').run([new Date().toISOString(), sessionId]);

    res.json({
      success: true,
      initials,
      documents: documents.length,
      rowsUpdated,
    });
  } catch (error) {
    console.error('Apply I&I initials (session) error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Apply default initials to all checklist rows on one cabinet document
router.post('/api/ii-documents/:documentId/ii-apply-initials', requireAuth, async (req, res) => {
  const { documentId } = req.params;

  try {
    const document = await db.prepare('SELECT * FROM session_ii_documents WHERE id = ? AND deleted = 0').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const session = await db.prepare('SELECT * FROM sessions WHERE id = ?').get([document.session_id]);
    const initials = (req.body?.initials || session?.ii_initials || '').trim();
    if (!initials) {
      return res.status(400).json({ error: 'Set default initials in session header first' });
    }

    const defaultDate = session?.ii_date_performed || new Date().toISOString().split('T')[0];
    const rowsUpdated = await applyInitialsToDocument(documentId, document.session_id, initials, defaultDate);

    res.json({ success: true, initials, rowsUpdated });
  } catch (error) {
    console.error('Apply I&I initials (document) error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save I&I header information for a session
router.post('/api/sessions/:sessionId/ii-header', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { deltav_system_id, ii_location, ii_performed_by, ii_date_performed, ii_customer_name, ii_prepared_for, ii_initials } = req.body;
  
  try {
    const now = new Date().toISOString();
    
    // Update the session with header information
    await db.prepare('UPDATE sessions SET deltav_system_id = ?, ii_location = ?, ii_performed_by = ?, ii_date_performed = ?, ii_customer_name = ?, ii_prepared_for = ?, ii_initials = ?, updated_at = ? WHERE id = ?').run([deltav_system_id, ii_location, ii_performed_by, ii_date_performed, ii_customer_name, ii_prepared_for, ii_initials, now, sessionId]);
    
    // Get the updated session
    const session = await db.prepare('SELECT * FROM sessions WHERE id = ?').get([sessionId]);
    
    res.json(session);
  } catch (error) {
    console.error('Save I&I header error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get I&I equipment checklist for a document
router.get('/api/ii-documents/:documentId/ii-equipment', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  console.log(`🔍 DEBUG: Getting I&I equipment for document ID: ${documentId}`);
  
  try {
    const equipment = await db.prepare('SELECT * FROM session_ii_equipment WHERE document_id = ? AND deleted = 0').get([documentId]);
    console.log(`✅ DEBUG: Found equipment:`, equipment);
    res.json(equipment || {});
  } catch (error) {
    console.error('❌ DEBUG: Get I&I equipment error:', error);
    console.error('❌ DEBUG: This likely means the document_id column does not exist in session_ii_equipment table');
    res.status(500).json({ error: 'Database error' });
  }
});

// Save I&I equipment checklist for a document
router.post('/api/ii-documents/:documentId/ii-equipment', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const body = req.body;

  console.log(`🔍 DEBUG: Saving I&I equipment for document ID: ${documentId}`);
  
  try {
    const document = await db.prepare('SELECT session_id FROM session_ii_documents WHERE id = ?').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const sessionId = document.session_id;
    console.log(`🔍 DEBUG: Found session_id: ${sessionId} for document: ${documentId}`);
    
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    
    const existing = await db.prepare('SELECT id FROM session_ii_equipment WHERE document_id = ? AND deleted = 0').get([documentId]);
    
    let equipment;
    if (existing) {
      const prevFull = await db.prepare('SELECT * FROM session_ii_equipment WHERE document_id = ? AND deleted = 0').get([documentId]);
      const merged = mergeEquipmentPayload(body, prevFull);
      console.log(`🔍 DEBUG: Updating existing equipment record (merged partial save)`);
      await db.prepare('UPDATE session_ii_equipment SET clamp_on_rms_ammeter = ?, digit_dvm = ?, fluke_1630_earth_ground = ?, fluke_mt8200_micromapper = ?, notes = ?, synced = 0, updated_at = ? WHERE document_id = ? AND deleted = 0').run([
        merged.clamp_on_rms_ammeter,
        merged.digit_dvm,
        merged.fluke_1630_earth_ground,
        merged.fluke_mt8200_micromapper,
        merged.notes,
        now,
        documentId
      ]);
      equipment = await db.prepare('SELECT * FROM session_ii_equipment WHERE document_id = ? AND deleted = 0').get([documentId]);
    } else {
      const merged = mergeEquipmentPayload(body, null);
      console.log(`🔍 DEBUG: Creating new equipment record with session_id: ${sessionId} and document_id: ${documentId}`);
      await db.prepare('INSERT INTO session_ii_equipment (session_id, document_id, clamp_on_rms_ammeter, digit_dvm, fluke_1630_earth_ground, fluke_mt8200_micromapper, notes, uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)').run([sessionId, documentId, merged.clamp_on_rms_ammeter, merged.digit_dvm, merged.fluke_1630_earth_ground, merged.fluke_mt8200_micromapper, merged.notes, uuid, now, now]);
      equipment = await db.prepare('SELECT * FROM session_ii_equipment WHERE document_id = ? AND deleted = 0').get([documentId]);
    }
    
    console.log(`✅ DEBUG: Successfully saved equipment:`, equipment);
    res.json(equipment || {});
  } catch (error) {
    console.error('❌ DEBUG: Save I&I equipment error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get I&I checklist items for a document
router.get('/api/ii-documents/:documentId/ii-checklist', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  console.log(`🔍 DEBUG: Getting I&I checklist for document ID: ${documentId}`);
  
  try {
    const items = await db.prepare('SELECT * FROM session_ii_checklist WHERE document_id = ? AND deleted = 0 ORDER BY section_name, item_name').all([documentId]);
    console.log(`✅ DEBUG: Found ${items.length} checklist items`);
    res.json(items);
  } catch (error) {
    console.error('❌ DEBUG: Get I&I checklist error:', error);
    console.error('❌ DEBUG: This likely means the document_id column does not exist in session_ii_checklist table');
    res.status(500).json({ error: 'Database error' });
  }
});

// Save I&I checklist item for a document
router.post('/api/ii-documents/:documentId/ii-checklist', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const body = req.body;
  const { section_name, item_name } = body;

  console.log(`🔍 DEBUG: Saving I&I checklist item for document ID: ${documentId}, section: ${section_name}, item: ${item_name}`);
  
  try {
    // Get the session_id for this document
    const document = await db.prepare('SELECT session_id FROM session_ii_documents WHERE id = ?').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const sessionId = document.session_id;
    console.log(`🔍 DEBUG: Found session_id: ${sessionId} for document: ${documentId}`);
    
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    
    const existing = await db.prepare('SELECT id FROM session_ii_checklist WHERE document_id = ? AND section_name = ? AND item_name = ? AND deleted = 0').get([documentId, section_name, item_name]);

    let item;
    if (existing) {
      const prevFull = await db.prepare('SELECT * FROM session_ii_checklist WHERE id = ?').get([existing.id]);
      const merged = mergeChecklistPayload(body, prevFull);
      console.log(`🔍 DEBUG: Updating existing checklist item (merged partial save)`);
      await db.prepare(
        `UPDATE session_ii_checklist SET answer = ?, comments = ?, performed_by = ?, date_completed = ?,
          measurement_ohms = ?, measurement_ac_ma = ?, measurement_dc_ma = ?, measurement_voltage = ?, measurement_frequency = ?,
          recorded_value = ?, synced = 0, updated_at = ? WHERE id = ?`
      ).run([
        merged.answer,
        merged.comments,
        merged.performed_by,
        merged.date_completed,
        merged.measurement_ohms,
        merged.measurement_ac_ma,
        merged.measurement_dc_ma,
        merged.measurement_voltage,
        merged.measurement_frequency,
        merged.recorded_value,
        now,
        existing.id
      ]);
      item = await db.prepare('SELECT * FROM session_ii_checklist WHERE id = ?').get([existing.id]);
    } else {
      const merged = mergeChecklistPayload(body, null);
      console.log(`🔍 DEBUG: Creating new checklist item with session_id: ${sessionId} and document_id: ${documentId}`);
      await db.prepare(
        `INSERT INTO session_ii_checklist (session_id, document_id, section_name, item_name, answer, comments, performed_by, date_completed,
          measurement_ohms, measurement_ac_ma, measurement_dc_ma, measurement_voltage, measurement_frequency, recorded_value,
          uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run([
        sessionId,
        documentId,
        section_name,
        item_name,
        merged.answer,
        merged.comments,
        merged.performed_by,
        merged.date_completed,
        merged.measurement_ohms,
        merged.measurement_ac_ma,
        merged.measurement_dc_ma,
        merged.measurement_voltage,
        merged.measurement_frequency,
        merged.recorded_value,
        uuid,
        now,
        now
      ]);
      item = await db.prepare('SELECT * FROM session_ii_checklist WHERE document_id = ? AND section_name = ? AND item_name = ? AND deleted = 0').get([documentId, section_name, item_name]);
    }

    console.log(`✅ DEBUG: Successfully saved checklist item:`, item);
    res.json(item);
  } catch (error) {
    console.error('❌ DEBUG: Save I&I checklist item error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get I&I equipment used for a document
router.get('/api/ii-documents/:documentId/ii-equipment-used', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  try {
    const equipment = await db.prepare('SELECT * FROM session_ii_equipment_used WHERE document_id = ? AND deleted = 0 ORDER BY manufacturer, type').all([documentId]);
    res.json(equipment);
  } catch (error) {
    console.error('Get I&I equipment used error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Save I&I equipment used for a document
router.post('/api/ii-documents/:documentId/ii-equipment-used', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const { manufacturer, type, serial_number, recalibration_date, used_in_section } = req.body;
  
  try {
    // Get the session_id for this document
    const document = await db.prepare('SELECT session_id FROM session_ii_documents WHERE id = ?').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const sessionId = document.session_id;
    const uuid = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await db.prepare('INSERT INTO session_ii_equipment_used (session_id, document_id, manufacturer, type, serial_number, recalibration_date, used_in_section, uuid, synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)').run([sessionId, documentId, manufacturer, type, serial_number, recalibration_date, used_in_section, uuid, now, now]);
    
    const equipment = await db.prepare('SELECT * FROM session_ii_equipment_used WHERE document_id = ? AND deleted = 0 ORDER BY manufacturer, type').all([documentId]);
    res.json(equipment);
  } catch (error) {
    console.error('Save I&I equipment used error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete I&I equipment used item
router.delete('/api/ii-equipment-used/:itemId', requireAuth, async (req, res) => {
  const { itemId } = req.params;
  
  try {
    await db.prepare('UPDATE session_ii_equipment_used SET deleted = 1, synced = 0, updated_at = ? WHERE id = ?').run([new Date().toISOString(), itemId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete I&I equipment used error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update I&I document
router.put('/api/ii-documents/:documentId', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const { document_name, deltav_system_id, location, performed_by, date_performed } = req.body;
  
  try {
    const now = new Date().toISOString();
    
    await db.prepare('UPDATE session_ii_documents SET document_name = ?, deltav_system_id = ?, location = ?, performed_by = ?, date_performed = ?, synced = 0, updated_at = ? WHERE id = ? AND deleted = 0').run([document_name, deltav_system_id, location, performed_by, date_performed, now, documentId]);
    
    const document = await db.prepare('SELECT * FROM session_ii_documents WHERE id = ? AND deleted = 0').get([documentId]);
    res.json(document);
  } catch (error) {
    console.error('Update I&I document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete I&I document
router.delete('/api/ii-documents/:documentId', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  
  try {
    const now = new Date().toISOString();
    
    // Soft delete the document
    await db.prepare('UPDATE session_ii_documents SET deleted = 1, synced = 0, updated_at = ? WHERE id = ?').run([now, documentId]);
    
    // Soft delete related data
    await db.prepare('UPDATE session_ii_equipment SET deleted = 1, synced = 0, updated_at = ? WHERE document_id = ?').run([now, documentId]);
    await db.prepare('UPDATE session_ii_checklist SET deleted = 1, synced = 0, updated_at = ? WHERE document_id = ?').run([now, documentId]);
    await db.prepare('UPDATE session_ii_equipment_used SET deleted = 1, synced = 0, updated_at = ? WHERE document_id = ?').run([now, documentId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete I&I document error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Export I&I document as PDF
router.post('/api/ii-documents/:documentId/export-pdf', requireAuth, async (req, res) => {
  const { documentId } = req.params;
  const pptr = getPuppeteer();
  if (!pptr) {
    return res.status(503).json({ error: 'PDF export is not available', details: 'Puppeteer is not available in this build. Install Google Chrome or Edge and use a full build with PDF support.' });
  }
  try {
    // Get document details
    const document = await db.prepare('SELECT * FROM session_ii_documents WHERE id = ? AND deleted = 0').get([documentId]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Get session details
    const session = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location as customer_location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get([document.session_id]);
    
    // Get checklist items
    const checklistItems = await db.prepare('SELECT * FROM session_ii_checklist WHERE document_id = ? AND deleted = 0 ORDER BY section_name, item_name').all([documentId]);
    
    // Get equipment used
    const equipmentUsed = await db.prepare('SELECT * FROM session_ii_equipment_used WHERE document_id = ? AND deleted = 0 ORDER BY manufacturer, type').all([documentId]);
    
    // Generate PDF content
    const pdfContent = generateIIPDF(document, session, checklistItems, equipmentUsed);
    
    // Generate PDF using Puppeteer
    const browser = await pptr.launch({
      executablePath: await findChrome(),
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--memory-pressure-off'
      ]
    });
    
    const page = await browser.newPage();
    page.setDefaultTimeout(90000); // 90 second timeout
    await page.setContent(pdfContent, { waitUntil: 'networkidle0', timeout: 90000 });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });
    
    await browser.close();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="II-Document-${document.document_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Export I&I PDF error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// Export all I&I documents in a session as combined PDF
router.post('/api/sessions/:sessionId/export-all-ii-pdfs', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const pptr = getPuppeteer();
  if (!pptr) {
    return res.status(503).json({ error: 'PDF export is not available', details: 'Puppeteer is not available in this build. Install Google Chrome or Edge and use a full build with PDF support.' });
  }
  try {
    console.log(`🔍 DEBUG: Exporting all I&I PDFs for session: ${sessionId}`);
    
    // Get session details
    const session = await db.prepare(`
      SELECT s.*, c.name as customer_name, c.location as customer_location
      FROM sessions s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ? AND s.session_type = 'ii'
    `).get([sessionId]);
    
    if (!session) {
      return res.status(404).json({ error: 'I&I session not found' });
    }
    
    // Get all documents in the session
    const documents = await db.prepare('SELECT * FROM session_ii_documents WHERE session_id = ? AND deleted = 0 ORDER BY document_name').all([sessionId]);
    
    if (documents.length === 0) {
      return res.status(404).json({ error: 'No documents found in this I&I session' });
    }
    
    console.log(`✅ DEBUG: Found ${documents.length} documents to export`);
    
    // Generate combined PDF content
    console.log(`🔄 DEBUG: Starting PDF content generation for ${documents.length} documents`);
    const pdfContent = await generateCombinedIIPDF(session, documents);
    console.log(`✅ DEBUG: PDF content generation completed`);
    
    // Generate PDF using Puppeteer
    const browser = await pptr.launch({
      executablePath: await findChrome(),
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--memory-pressure-off'
      ]
    });
    
    const page = await browser.newPage();
    page.setDefaultTimeout(120000); // 2 minute timeout for large content
    
    console.log(`🔄 DEBUG: Setting page content (${Math.round(pdfContent.length / 1024)} KB)...`);
    await page.setContent(pdfContent, { waitUntil: 'networkidle0', timeout: 120000 });
    console.log(`✅ DEBUG: Page content set successfully`);
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });
    
    await browser.close();
    
    const sessionName = session.session_name.replace(/[^a-zA-Z0-9]/g, '_');
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ECI_II_Report_${sessionName}.pdf"`);
    res.send(pdfBuffer);
    
    console.log(`✅ DEBUG: Combined I&I PDF exported successfully`);
    
  } catch (error) {
    console.error('Export combined I&I PDF error:', error);
    res.status(500).json({ error: 'Combined PDF generation failed' });
  }
});

module.exports = router;

