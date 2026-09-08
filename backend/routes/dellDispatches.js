/**
 * Dell parts / HDD dispatch API — customer queue, CRUD, warranty, SDSR submit.
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const requireAuth = require('../middleware/auth');
const { syncFieldsForInsert, afterSyncableWrite, softDeleteSyncRow } = require('../utils/sync-write-helper');
const { lookupWarranty, lookupWarrantyBatched } = require('../services/dell-warranty');
const sdsr = require('../services/dell-sdsr');
const { loadDellEnv } = require('../utils/dell-env');

const ID_WORKSTATION = 1000000;
const OPEN_STATUSES = new Set(['draft', 'queued', 'submitted', 'issued', 'shipped']);

function attachmentsDir() {
  const isPackaged = typeof process.pkg !== 'undefined';
  const root = isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '../..');
  const dir = path.join(root, 'data', 'dell-dispatch');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isDellServiceTag(tag) {
  const t = String(tag || '').trim().toUpperCase();
  return /^[A-Z0-9]{5,10}$/.test(t) && t.length >= 5;
}

async function resolveWorkstation(nodeId) {
  if (nodeId == null) return null;
  const id = Number(nodeId);
  if (id >= ID_WORKSTATION && id < 2000000) {
    return db.prepare(
      `SELECT id, name, type, model, computer_model, dell_service_tag_number
       FROM sys_workstations WHERE id = ? AND COALESCE(deleted,0)=0`
    ).get([id - ID_WORKSTATION]);
  }
  // Custom node with serial that might be a Dell tag
  const node = await db.prepare(
    `SELECT id, node_name as name, node_type as type, model, serial as dell_service_tag_number
     FROM nodes WHERE id = ? AND COALESCE(deleted,0)=0`
  ).get([id]);
  return node || null;
}

async function getCustomer(customerId) {
  return db.prepare(
    `SELECT * FROM customers WHERE id = ? AND COALESCE(deleted,0)=0`
  ).get([customerId]);
}

/** GET /api/dell-dispatches — all open/recent (dashboard) */
router.get('/api/dell-dispatches', requireAuth, async (req, res) => {
  try {
    const status = (req.query.status || 'open').toLowerCase();
    let sql = `
      SELECT d.*, c.name as customer_name
      FROM dell_dispatches d
      LEFT JOIN customers c ON c.id = d.customer_id
      WHERE COALESCE(d.deleted,0)=0
    `;
    const params = [];
    if (status === 'open') {
      sql += ` AND d.status IN ('draft','queued','submitted','issued','shipped')`;
    } else if (status !== 'all') {
      sql += ` AND d.status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY COALESCE(d.updated_at, d.created_at) DESC LIMIT 200`;
    const rows = await db.prepare(sql).all(params);
    res.json(rows);
  } catch (error) {
    console.error('List dell dispatches error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/** GET /api/dell-dispatches/status-summary — open count for dashboard */
router.get('/api/dell-dispatches/status-summary', requireAuth, async (req, res) => {
  try {
    const row = await db.prepare(`
      SELECT COUNT(*) as open_count
      FROM dell_dispatches
      WHERE COALESCE(deleted,0)=0
        AND status IN ('draft','queued','submitted','issued','shipped')
    `).get([]);
    res.json({ open_count: row?.open_count || 0 });
  } catch (error) {
    console.error('Dell dispatch summary error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/** GET /api/dell-dispatches/connection — CheckLogin probe (no create) */
router.get('/api/dell-dispatches/connection', requireAuth, async (req, res) => {
  try {
    const env = loadDellEnv();
    const login = await sdsr.checkLogin();
    res.json({
      configured: Boolean(env.DELL_DISPATCH_CLIENT_ID && env.DELL_DISPATCH_TECH_EMAIL),
      sandbox: String(env.DELL_DISPATCH_API_URL || '').includes('Sandbox'),
      ...login,
    });
  } catch (error) {
    res.json({ configured: false, ok: false, ready: false, error: error.message });
  }
});

/** GET /api/customers/:customerId/dell-parts/needed */
router.get('/api/customers/:customerId/dell-parts/needed', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  try {
    const rows = await db.prepare(`
      SELECT m.node_id, m.notes, m.updated_at as flagged_at,
             s.id as session_id, s.session_name, s.created_at as session_date
      FROM session_node_maintenance m
      JOIN sessions s ON m.session_id = s.id
      WHERE s.customer_id = ?
        AND m.hdd_replaced = 1
        AND COALESCE(m.deleted,0)=0
        AND COALESCE(s.deleted,0)=0
      ORDER BY s.created_at DESC
    `).all([customerId]);

    const byNode = new Map();
    for (const row of rows) {
      const key = String(row.node_id);
      if (!byNode.has(key)) byNode.set(key, row);
    }

    const needed = [];
    for (const row of byNode.values()) {
      const ws = await resolveWorkstation(row.node_id);
      const tag = String(ws?.dell_service_tag_number || '').trim().toUpperCase();
      const dellCapable = isDellServiceTag(tag);

      let existing = null;
      if (dellCapable) {
        existing = await db.prepare(`
          SELECT id, status, dps_number, work_order, part_number, updated_at
          FROM dell_dispatches
          WHERE customer_id = ? AND UPPER(TRIM(service_tag)) = ?
            AND COALESCE(deleted,0)=0
            AND status IN ('draft','queued','submitted','issued','shipped')
          ORDER BY updated_at DESC LIMIT 1
        `).get([customerId, tag]);
      }

      needed.push({
        node_id: row.node_id,
        node_name: ws?.name || `Node ${row.node_id}`,
        node_type: ws?.type || 'Workstation',
        model: ws?.computer_model || ws?.model || null,
        service_tag: dellCapable ? tag : null,
        dell_capable: dellCapable,
        session_id: row.session_id,
        session_name: row.session_name,
        session_date: row.session_date,
        notes: row.notes || '',
        existing_dispatch: existing || null,
        needs_request: dellCapable && !existing,
      });
    }

    res.json(needed);
  } catch (error) {
    console.error('Dell parts needed error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/** GET /api/customers/:customerId/dell-dispatches */
router.get('/api/customers/:customerId/dell-dispatches', requireAuth, async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT * FROM dell_dispatches
      WHERE customer_id = ? AND COALESCE(deleted,0)=0
      ORDER BY COALESCE(updated_at, created_at) DESC
    `).all([req.params.customerId]);
    res.json(rows);
  } catch (error) {
    console.error('Customer dell dispatches error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/** GET /api/dell-dispatches/warranty/:serviceTag */
router.get('/api/dell-dispatches/warranty/:serviceTag', requireAuth, async (req, res) => {
  try {
    const results = await lookupWarranty(req.params.serviceTag);
    res.json(results[0] || { serviceTag: req.params.serviceTag, invalid: true, inCoverage: false });
  } catch (error) {
    console.error('Warranty lookup error:', error);
    res.status(502).json({ error: error.message || 'Warranty lookup failed' });
  }
});

/**
 * Map a workstation DB row to the API shape. Recomputes inCoverage from cached end date.
 */
function mapWorkstationWarrantyRow(w) {
  const tag = String(w.dell_service_tag_number || '').trim().toUpperCase();
  const hasTag = isDellServiceTag(tag);
  const checkedAt = w.warranty_checked_at || null;
  let warranty = null;
  if (hasTag && checkedAt) {
    const ends = w.warranty_ends || null;
    const inCoverage =
      ends != null && String(ends).trim() !== ''
        ? new Date(ends).getTime() >= Date.now()
        : w.warranty_in_coverage == null
          ? null
          : Boolean(w.warranty_in_coverage);
    warranty = {
      product: w.warranty_product || null,
      model: null,
      shipDate: w.warranty_ship_date || null,
      warrantyEnds: ends,
      inCoverage,
      serviceLevel: w.warranty_service_level || null,
      invalid: Boolean(w.warranty_invalid),
      cached: true,
    };
  }
  return {
    id: w.id,
    node_id: ID_WORKSTATION + Number(w.id),
    name: w.name,
    type: w.type,
    model: w.computer_model || w.model || null,
    os_name: w.os_name || null,
    service_tag: hasTag ? tag : (w.dell_service_tag_number || null),
    dell_capable: hasTag,
    warranty,
    warranty_checked_at: checkedAt,
  };
}

/**
 * GET /api/customers/:customerId/dell-warranty/workstations
 * Local cache only — does not call Dell.
 */
router.get('/api/customers/:customerId/dell-warranty/workstations', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  try {
    const workstations = await db.prepare(`
      SELECT id, name, type, model, computer_model, dell_service_tag_number, os_name,
             warranty_ends, warranty_in_coverage, warranty_product, warranty_service_level,
             warranty_ship_date, warranty_invalid, warranty_checked_at
      FROM sys_workstations
      WHERE customer_id = ? AND COALESCE(deleted, 0) = 0
      ORDER BY name
    `).all([customerId]);

    const rows = workstations.map(mapWorkstationWarrantyRow);
    const tagCount = rows.filter((r) => r.dell_capable).length;
    const checkedTimes = rows.map((r) => r.warranty_checked_at).filter(Boolean);
    const latestCheck = checkedTimes.length
      ? checkedTimes.sort().reverse()[0]
      : null;
    const uncheckedWithTag = rows.filter((r) => r.dell_capable && !r.warranty).length;

    res.json({
      workstations: rows,
      tag_count: tagCount,
      unchecked_count: uncheckedWithTag,
      from_cache: true,
      warranty_error: null,
      checked_at: latestCheck,
    });
  } catch (error) {
    console.error('Workstation warranty list error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/customers/:customerId/dell-warranty/workstations/refresh
 * Calls Dell TechDirect, writes results onto sys_workstations, returns updated list.
 */
router.post('/api/customers/:customerId/dell-warranty/workstations/refresh', requireAuth, async (req, res) => {
  const customerId = req.params.customerId;
  try {
    const workstations = await db.prepare(`
      SELECT id, name, type, model, computer_model, dell_service_tag_number, os_name, uuid
      FROM sys_workstations
      WHERE customer_id = ? AND COALESCE(deleted, 0) = 0
      ORDER BY name
    `).all([customerId]);

    const tagged = workstations
      .map((w) => ({
        ...w,
        tag: String(w.dell_service_tag_number || '').trim().toUpperCase(),
      }))
      .filter((w) => isDellServiceTag(w.tag));

    let warrantyError = null;
    let warrantyByTag = new Map();
    const checkedAt = new Date().toISOString();

    if (tagged.length) {
      try {
        const results = await lookupWarrantyBatched(tagged.map((w) => w.tag));
        for (const row of results) {
          if (row.serviceTag) warrantyByTag.set(String(row.serviceTag).toUpperCase(), row);
        }
      } catch (e) {
        warrantyError = e.message || 'Warranty lookup failed';
        console.error('Customer workstation warranty refresh error:', e);
        return res.status(502).json({ error: warrantyError });
      }

      for (const w of tagged) {
        const warr = warrantyByTag.get(w.tag);
        const ends = warr?.warrantyEnds || null;
        const inCoverage = warr
          ? warr.inCoverage
            ? 1
            : 0
          : null;
        await db.prepare(`
          UPDATE sys_workstations SET
            warranty_ends = ?,
            warranty_in_coverage = ?,
            warranty_product = ?,
            warranty_service_level = ?,
            warranty_ship_date = ?,
            warranty_invalid = ?,
            warranty_checked_at = ?,
            synced = 0,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run([
          ends,
          inCoverage,
          warr?.product || null,
          warr?.serviceLevel || null,
          warr?.shipDate || null,
          warr?.invalid ? 1 : 0,
          checkedAt,
          w.id,
        ]);
        await afterSyncableWrite(db, 'sys_workstations', w.id);
      }
    }

    const refreshed = await db.prepare(`
      SELECT id, name, type, model, computer_model, dell_service_tag_number, os_name,
             warranty_ends, warranty_in_coverage, warranty_product, warranty_service_level,
             warranty_ship_date, warranty_invalid, warranty_checked_at
      FROM sys_workstations
      WHERE customer_id = ? AND COALESCE(deleted, 0) = 0
      ORDER BY name
    `).all([customerId]);

    const rows = refreshed.map(mapWorkstationWarrantyRow);
    res.json({
      workstations: rows,
      tag_count: tagged.length,
      unchecked_count: 0,
      from_cache: false,
      warranty_error: null,
      checked_at: tagged.length ? checkedAt : null,
      message: tagged.length
        ? `Updated warranty for ${tagged.length} Dell tag${tagged.length === 1 ? '' : 's'}`
        : 'No Dell service tags to check',
    });
  } catch (error) {
    console.error('Workstation warranty refresh error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/** GET /api/dell-dispatches/parts/:serviceTag */
router.get('/api/dell-dispatches/parts/:serviceTag', requireAuth, async (req, res) => {
  try {
    const result = await sdsr.getPartsByServiceTag(req.params.serviceTag);
    res.json(result);
  } catch (error) {
    console.error('Get parts error:', error);
    res.status(502).json({ ok: false, error: error.message, parts: [] });
  }
});

/** GET /api/customers/:customerId/dell-dispatches/prefill?nodeId= */
router.get('/api/customers/:customerId/dell-dispatches/prefill', requireAuth, async (req, res) => {
  try {
    const customer = await getCustomer(req.params.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const nodeId = req.query.nodeId ? Number(req.query.nodeId) : null;
    const ws = nodeId != null ? await resolveWorkstation(nodeId) : null;
    const tag = String(ws?.dell_service_tag_number || '').trim().toUpperCase();

    let sessionNotes = '';
    let sessionId = null;
    if (nodeId != null) {
      const maint = await db.prepare(`
        SELECT m.notes, m.session_id
        FROM session_node_maintenance m
        JOIN sessions s ON s.id = m.session_id
        WHERE s.customer_id = ? AND m.node_id = ? AND m.hdd_replaced = 1
          AND COALESCE(m.deleted,0)=0 AND COALESCE(s.deleted,0)=0
        ORDER BY s.created_at DESC LIMIT 1
      `).get([req.params.customerId, nodeId]);
      sessionNotes = maint?.notes || '';
      sessionId = maint?.session_id || null;
    }

    const env = loadDellEnv();
    let warranty = null;
    if (isDellServiceTag(tag)) {
      try {
        const list = await lookupWarranty(tag);
        warranty = list[0] || null;
      } catch (e) {
        warranty = { error: e.message };
      }
    }

    res.json({
      customer_id: customer.id,
      customer_name: customer.name,
      session_id: sessionId,
      node_id: nodeId,
      node_name: ws?.name || null,
      service_tag: isDellServiceTag(tag) ? tag : null,
      product_line: warranty?.product || ws?.computer_model || ws?.model || null,
      troubleshooting_note: String(sessionNotes || '').slice(0, 1000),
      primary_contact_name: customer.contact_person || '',
      primary_contact_phone: customer.phone || '',
      primary_contact_email: customer.email || '',
      alternate_contact_name: '',
      alternate_contact_phone: '',
      ship_address_line1: customer.street_address || customer.address || '',
      ship_address_line2: '',
      ship_city: customer.city || '',
      ship_state: customer.state || '',
      ship_zip: customer.zip || '',
      ship_country: customer.country || 'US',
      ship_timezone: 'US/Eastern',
      tech_email: env.DELL_DISPATCH_TECH_EMAIL || '',
      branch_name: env.DELL_DISPATCH_GROUP_NAME || '',
      dell_customer_name: env.DELL_DISPATCH_CUSTOMER_NAME || '',
      track: 'Tier 1',
      warranty,
    });
  } catch (error) {
    console.error('Prefill error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

function mapBodyToRow(body, customerId) {
  return {
    customer_id: customerId,
    session_id: body.session_id || null,
    node_id: body.node_id != null ? Number(body.node_id) : null,
    node_name: body.node_name || null,
    service_tag: String(body.service_tag || '').trim().toUpperCase(),
    product_line: body.product_line || null,
    part_number: body.part_number || null,
    part_description: body.part_description || null,
    part_qty: Number(body.part_qty) || 1,
    part_ppid: body.part_ppid || null,
    troubleshooting_note: String(body.troubleshooting_note || '').slice(0, 1000),
    primary_contact_name: body.primary_contact_name || null,
    primary_contact_phone: body.primary_contact_phone || null,
    primary_contact_email: body.primary_contact_email || null,
    alternate_contact_name: body.alternate_contact_name || null,
    alternate_contact_phone: body.alternate_contact_phone || null,
    ship_address_line1: body.ship_address_line1 || null,
    ship_address_line2: body.ship_address_line2 || null,
    ship_city: body.ship_city || null,
    ship_state: body.ship_state || null,
    ship_zip: body.ship_zip || null,
    ship_country: body.ship_country || 'US',
    ship_timezone: body.ship_timezone || 'US/Eastern',
    reference_po: body.reference_po || null,
    request_complete_care: body.request_complete_care ? 1 : 0,
    request_return_to_depot: body.request_return_to_depot ? 1 : 0,
    request_onsite_technician: body.request_onsite_technician ? 1 : 0,
    branch_name: body.branch_name || null,
    dell_customer_name: body.dell_customer_name || null,
    track: body.track || 'Tier 1',
    warranty_ends: body.warranty_ends || null,
    warranty_in_coverage: body.warranty_in_coverage == null ? null : (body.warranty_in_coverage ? 1 : 0),
    created_by: body.created_by || null,
  };
}

async function saveAttachments(dispatchId, files) {
  if (!Array.isArray(files) || !files.length) return [];
  const dir = path.join(attachmentsDir(), String(dispatchId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const file of files.slice(0, 8)) {
    if (!file?.filename || !file?.base64) continue;
    const safeName = path.basename(file.filename).replace(/[^\w.\-]+/g, '_');
    const filePath = path.join(dir, `${Date.now()}_${safeName}`);
    fs.writeFileSync(filePath, Buffer.from(file.base64, 'base64'));
    const result = await db.prepare(`
      INSERT INTO dell_dispatch_attachments (dispatch_id, filename, mime_type, file_path, description)
      VALUES (?, ?, ?, ?, ?)
    `).run([
      dispatchId,
      safeName,
      file.mime_type || file.mimeType || 'application/octet-stream',
      filePath,
      file.description || safeName,
    ]);
    saved.push({
      id: result.lastInsertRowid,
      filename: safeName,
      mime_type: file.mime_type || file.mimeType,
      description: file.description || safeName,
      base64: file.base64,
    });
  }
  return saved;
}

async function trySubmitToDell(row, attachmentPayloads) {
  const login = await sdsr.checkLogin();
  if (!login.ok || !login.ready) {
    return {
      status: 'queued',
      dell_last_error: login.error || 'Dell SDSR CheckLogin failed — saved locally for later submit',
      dps_number: null,
      work_order: null,
    };
  }

  const created = await sdsr.createDispatch({
    serviceTag: row.service_tag,
    techEmail: row.primary_contact_email || loadDellEnv().DELL_DISPATCH_TECH_EMAIL,
    branchName: row.branch_name,
    dellCustomerName: row.dell_customer_name,
    track: row.track,
    primaryContactName: row.primary_contact_name,
    primaryContactPhone: row.primary_contact_phone,
    primaryContactEmail: row.primary_contact_email,
    alternateContactName: row.alternate_contact_name,
    alternateContactPhone: row.alternate_contact_phone,
    countryIsoCode: row.ship_country || 'US',
    city: row.ship_city,
    state: row.ship_state,
    zip: row.ship_zip,
    addressLine1: row.ship_address_line1,
    addressLine2: row.ship_address_line2,
    timezone: row.ship_timezone,
    referencePo: row.reference_po,
    requestCompleteCare: Boolean(row.request_complete_care),
    requestReturnToDepot: Boolean(row.request_return_to_depot),
    requestOnsiteTechnician: Boolean(row.request_onsite_technician),
    troubleshootingNote: row.troubleshooting_note,
    parts: row.part_number
      ? [{ partNumber: row.part_number, ppid: row.part_ppid, quantity: row.part_qty || 1 }]
      : [],
    attachments: (attachmentPayloads || []).map((a) => ({
      filename: a.filename,
      mimeType: a.mime_type || a.mimeType,
      description: a.description,
      base64: a.base64,
    })),
  });

  if (!created.ok) {
    return {
      status: 'queued',
      dell_last_error: created.error || 'CreateDispatch failed',
      dps_number: null,
      work_order: null,
    };
  }

  return {
    status: 'submitted',
    dell_last_error: null,
    dps_number: created.dpsNumber || created.dispatchCode || null,
    work_order: created.workOrder || created.dispatchCode || null,
    dell_status_raw: created.result || null,
  };
}

/** POST /api/customers/:customerId/dell-dispatches — create + optional submit */
router.post('/api/customers/:customerId/dell-dispatches', requireAuth, async (req, res) => {
  const customerId = Number(req.params.customerId);
  try {
    const customer = await getCustomer(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const body = req.body || {};
    const row = mapBodyToRow(body, customerId);
    if (!isDellServiceTag(row.service_tag)) {
      return res.status(400).json({ error: 'Valid Dell service tag required' });
    }

    const draftOnly = Boolean(body.draft_only);
    const sync = syncFieldsForInsert('dell_dispatches');
    const insert = await db.prepare(`
      INSERT INTO dell_dispatches (
        customer_id, session_id, node_id, node_name, service_tag, product_line,
        part_number, part_description, part_qty, part_ppid, troubleshooting_note,
        primary_contact_name, primary_contact_phone, primary_contact_email,
        alternate_contact_name, alternate_contact_phone,
        ship_address_line1, ship_address_line2, ship_city, ship_state, ship_zip, ship_country, ship_timezone,
        reference_po, request_complete_care, request_return_to_depot, request_onsite_technician,
        branch_name, dell_customer_name, track, status,
        warranty_ends, warranty_in_coverage, created_by,
        uuid, synced, deleted, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,0,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).run([
      row.customer_id, row.session_id, row.node_id, row.node_name, row.service_tag, row.product_line,
      row.part_number, row.part_description, row.part_qty, row.part_ppid, row.troubleshooting_note,
      row.primary_contact_name, row.primary_contact_phone, row.primary_contact_email,
      row.alternate_contact_name, row.alternate_contact_phone,
      row.ship_address_line1, row.ship_address_line2, row.ship_city, row.ship_state, row.ship_zip, row.ship_country, row.ship_timezone,
      row.reference_po, row.request_complete_care, row.request_return_to_depot, row.request_onsite_technician,
      row.branch_name, row.dell_customer_name, row.track, draftOnly ? 'draft' : 'queued',
      row.warranty_ends, row.warranty_in_coverage, row.created_by || req.session?.username || null,
      sync.uuid,
    ]);

    const dispatchId = insert.lastInsertRowid;
    const savedFiles = await saveAttachments(dispatchId, body.attachments || []);

    let submitResult = { status: draftOnly ? 'draft' : 'queued', dell_last_error: null, dps_number: null, work_order: null };
    if (!draftOnly) {
      submitResult = await trySubmitToDell({ ...row, id: dispatchId }, savedFiles);
    }

    await db.prepare(`
      UPDATE dell_dispatches SET
        status = ?, dps_number = ?, work_order = ?, dell_last_error = ?,
        dell_status_raw = ?,
        submitted_at = CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
        last_status_at = CURRENT_TIMESTAMP,
        synced = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([
      submitResult.status,
      submitResult.dps_number,
      submitResult.work_order,
      submitResult.dell_last_error,
      submitResult.dell_status_raw || null,
      submitResult.status,
      dispatchId,
    ]);

    await afterSyncableWrite(db, 'dell_dispatches', dispatchId);
    const saved = await db.prepare('SELECT * FROM dell_dispatches WHERE id = ?').get([dispatchId]);
    res.json({
      success: true,
      dispatch: saved,
      dell_ready: submitResult.status === 'submitted',
      message:
        submitResult.status === 'submitted'
          ? `Submitted to Dell${submitResult.dps_number ? ` — DPS ${submitResult.dps_number}` : ''}`
          : submitResult.status === 'draft'
            ? 'Draft saved'
            : `Saved locally (${submitResult.dell_last_error || 'queued for Dell'})`,
    });
  } catch (error) {
    console.error('Create dell dispatch error:', error);
    res.status(500).json({ error: error.message || 'Database error' });
  }
});

/** POST /api/dell-dispatches/:id/submit — retry SDSR submit for queued/draft */
router.post('/api/dell-dispatches/:id/submit', requireAuth, async (req, res) => {
  try {
    const row = await db.prepare('SELECT * FROM dell_dispatches WHERE id = ? AND COALESCE(deleted,0)=0').get([req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const atts = await db.prepare('SELECT * FROM dell_dispatch_attachments WHERE dispatch_id = ?').all([row.id]);
    const payloads = atts.map((a) => {
      let base64 = '';
      try {
        if (a.file_path && fs.existsSync(a.file_path)) {
          base64 = fs.readFileSync(a.file_path).toString('base64');
        }
      } catch (_) {}
      return { filename: a.filename, mime_type: a.mime_type, description: a.description, base64 };
    });

    const submitResult = await trySubmitToDell(row, payloads);
    await db.prepare(`
      UPDATE dell_dispatches SET
        status = ?, dps_number = COALESCE(?, dps_number), work_order = COALESCE(?, work_order),
        dell_last_error = ?, dell_status_raw = ?,
        submitted_at = CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
        last_status_at = CURRENT_TIMESTAMP, synced = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([
      submitResult.status,
      submitResult.dps_number,
      submitResult.work_order,
      submitResult.dell_last_error,
      submitResult.dell_status_raw || null,
      submitResult.status,
      row.id,
    ]);
    await afterSyncableWrite(db, 'dell_dispatches', row.id);
    const saved = await db.prepare('SELECT * FROM dell_dispatches WHERE id = ?').get([row.id]);
    res.json({ success: true, dispatch: saved, message: submitResult.dell_last_error || 'Submitted' });
  } catch (error) {
    console.error('Submit dell dispatch error:', error);
    res.status(500).json({ error: error.message || 'Submit failed' });
  }
});

/** POST /api/dell-dispatches/:id/refresh-status */
router.post('/api/dell-dispatches/:id/refresh-status', requireAuth, async (req, res) => {
  try {
    const row = await db.prepare('SELECT * FROM dell_dispatches WHERE id = ? AND COALESCE(deleted,0)=0').get([req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const code = row.dps_number || row.work_order;
    if (!code) return res.status(400).json({ error: 'No DPS / work order to check yet' });

    const status = await sdsr.getDispatchStatus(code);
    if (!status.ok) {
      await db.prepare(`
        UPDATE dell_dispatches SET dell_last_error = ?, last_status_at = CURRENT_TIMESTAMP, synced = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run([status.error, row.id]);
      await afterSyncableWrite(db, 'dell_dispatches', row.id);
      return res.status(502).json({ error: status.error });
    }

    const mapped = sdsr.mapDellStatus(status.status) || row.status;
    await db.prepare(`
      UPDATE dell_dispatches SET
        status = ?, dps_number = COALESCE(?, dps_number), work_order = COALESCE(?, work_order),
        dell_status_raw = ?, dell_last_error = NULL,
        last_status_at = CURRENT_TIMESTAMP, synced = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([mapped, status.dpsNumber, status.dispatchCode, status.status, row.id]);
    await afterSyncableWrite(db, 'dell_dispatches', row.id);
    const saved = await db.prepare('SELECT * FROM dell_dispatches WHERE id = ?').get([row.id]);
    res.json({ success: true, dispatch: saved, dell: status });
  } catch (error) {
    console.error('Refresh status error:', error);
    res.status(500).json({ error: error.message || 'Refresh failed' });
  }
});

/** POST /api/dell-dispatches/:id/resubmit */
router.post('/api/dell-dispatches/:id/resubmit', requireAuth, async (req, res) => {
  try {
    const row = await db.prepare('SELECT * FROM dell_dispatches WHERE id = ? AND COALESCE(deleted,0)=0').get([req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const code = row.dps_number || row.work_order;
    if (!code) return res.status(400).json({ error: 'No DPS / work order to resubmit' });

    const result = await sdsr.resubmitDispatch(code);
    if (!result.ok) {
      return res.status(502).json({ error: result.error });
    }
    const mapped = sdsr.mapDellStatus(result.status) || 'submitted';
    await db.prepare(`
      UPDATE dell_dispatches SET status = ?, dell_status_raw = ?, dell_last_error = NULL,
        last_status_at = CURRENT_TIMESTAMP, synced = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([mapped, result.status, row.id]);
    await afterSyncableWrite(db, 'dell_dispatches', row.id);
    const saved = await db.prepare('SELECT * FROM dell_dispatches WHERE id = ?').get([row.id]);
    res.json({ success: true, dispatch: saved });
  } catch (error) {
    console.error('Resubmit error:', error);
    res.status(500).json({ error: error.message || 'Resubmit failed' });
  }
});

/** PATCH /api/dell-dispatches/:id — local status (received/installed) */
router.patch('/api/dell-dispatches/:id', requireAuth, async (req, res) => {
  try {
    const row = await db.prepare('SELECT * FROM dell_dispatches WHERE id = ? AND COALESCE(deleted,0)=0').get([req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const status = req.body?.status;
    if (!status || !['received', 'installed', 'draft', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await db.prepare(`
      UPDATE dell_dispatches SET status = ?, synced = 0, updated_at = CURRENT_TIMESTAMP, last_status_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([status, row.id]);
    await afterSyncableWrite(db, 'dell_dispatches', row.id);
    const saved = await db.prepare('SELECT * FROM dell_dispatches WHERE id = ?').get([row.id]);
    res.json({ success: true, dispatch: saved });
  } catch (error) {
    console.error('Patch dell dispatch error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/** DELETE /api/dell-dispatches/:id — soft delete */
router.delete('/api/dell-dispatches/:id', requireAuth, async (req, res) => {
  try {
    const ok = await softDeleteSyncRow(db, 'dell_dispatches', req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete dell dispatch error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
