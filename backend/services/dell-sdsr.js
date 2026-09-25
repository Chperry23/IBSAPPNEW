/**
 * Dell Self-Dispatch REST client (TechDirect SDSR REST API v1.2).
 * Auth: OAuth Bearer + TDUser header (TechDirect User ID — sandbox or prod).
 * See DELL HELP/Self-Dispatch_REST_API_Version_1.2/
 */
const { loadDellEnv } = require('../utils/dell-env');

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function isSandboxEnv(env = loadDellEnv()) {
  const rest = String(env.DELL_DISPATCH_REST_BASE || '');
  const api = String(env.DELL_DISPATCH_API_URL || '');
  const token = String(env.DELL_DISPATCH_TOKEN_URL || '');
  return (
    /sandbox/i.test(rest) ||
    /sandbox/i.test(api) ||
    /apigtwb2cnp/i.test(token) ||
    /apigtwb2cnp/i.test(api)
  );
}

/** REST base without trailing slash */
function restBase(env = loadDellEnv()) {
  if (env.DELL_DISPATCH_REST_BASE) {
    return String(env.DELL_DISPATCH_REST_BASE).replace(/\/$/, '');
  }
  if (isSandboxEnv(env)) {
    return 'https://apigtwb2cnp.us.dell.com/td/sandbox/dispatch/services/selfdispatch';
  }
  return 'https://apigtwb2c.us.dell.com/td/PROD/dispatch/services/selfdispatch';
}

/**
 * TDUser header:
 * - Sandbox: TechDirect User ID (Manage API Keys → Sandbox details)
 * - Production: TechDirect account email (REST spec header examples)
 */
function tdUser(env = loadDellEnv()) {
  if (isSandboxEnv(env)) {
    const id = String(env.DELL_DISPATCH_USER_ID || '').trim();
    if (!id) throw new Error('DELL.env missing DELL_DISPATCH_USER_ID (required as sandbox REST TDUser)');
    return id;
  }
  const email = String(env.DELL_DISPATCH_TECH_EMAIL || env.DELL_DISPATCH_TDUSER_EMAIL || '').trim();
  if (!email) {
    throw new Error('DELL.env missing DELL_DISPATCH_TECH_EMAIL (required as production REST TDUser)');
  }
  return email;
}

function countryIso(value) {
  const v = String(value || 'US').trim();
  if (/^united states$/i.test(v) || /^usa$/i.test(v)) return 'US';
  if (v.length === 2) return v.toUpperCase();
  return 'US';
}

async function getDispatchToken(force = false) {
  const now = Date.now();
  if (!force && cachedToken && now < cachedTokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const env = loadDellEnv();
  const tokenUrl = env.DELL_DISPATCH_TOKEN_URL;
  const clientId = env.DELL_DISPATCH_CLIENT_ID;
  const clientSecret = env.DELL_DISPATCH_CLIENT_SECRET;
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('DELL.env missing dispatch OAuth credentials');
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Dispatch token failed (${res.status}): ${JSON.stringify(json)}`);
  }

  const expiresIn = Number(json.expires_in) || 3600;
  cachedToken = json.access_token;
  cachedTokenExpiresAt = now + expiresIn * 1000;
  return cachedToken;
}

async function restFetch(pathAndQuery, { method = 'GET', body = null } = {}) {
  const env = loadDellEnv();
  const token = await getDispatchToken();
  const url = `${restBase(env)}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      TDUser: tdUser(env),
      Accept: 'application/json',
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = null;
    }
  }
  return { ok: res.ok, status: res.status, text, json, url };
}

/**
 * company-info — replaces SOAP CheckLogin as the "ready" probe.
 */
async function checkLogin() {
  try {
    const result = await restFetch('/company-info');
    if (!result.ok) {
      const msg =
        result.json?.message ||
        result.json?.error ||
        result.text?.slice(0, 300) ||
        `HTTP ${result.status}`;
      return {
        ok: false,
        ready: false,
        status: result.status,
        error: msg,
        mode: 'rest',
        sandbox: isSandboxEnv(),
      };
    }

    const relationships = Array.isArray(result.json?.relationships)
      ? result.json.relationships.map((r) => ({
          branchName: r.branch_description || r.branch_id,
          customerName: r.customer_name || r.customer_id,
          track: r.track || 'Tier 1',
          branchId: r.branch_id,
          customerId: r.customer_id,
        }))
      : [];

    return {
      ok: true,
      ready: true,
      mode: 'rest',
      sandbox: isSandboxEnv(),
      companyId: result.json?.company_id || null,
      fullName: null,
      role: 'REST TDUser',
      relationships,
      certificates: [],
      tdUser: tdUser(),
    };
  } catch (e) {
    return { ok: false, ready: false, error: e.message, mode: 'rest' };
  }
}

async function getPartsByServiceTag(serviceTag) {
  const tag = String(serviceTag || '').trim().toUpperCase();
  if (!tag) return { ok: false, error: 'Service tag required', parts: [] };

  try {
    const result = await restFetch(`/parts?service_tag=${encodeURIComponent(tag)}`);

    // Sandbox often returns 204 for real production tags; production 204 is unusual for in-warranty assets
    if (result.status === 204) {
      return {
        ok: true,
        parts: [],
        model: null,
        modelDescription: null,
        empty: true,
        sandbox: isSandboxEnv(),
        hint: isSandboxEnv()
          ? 'Sandbox returned no parts for this service tag (normal for real tags). Try a sandbox test tag such as CARV005, or enter the part number manually.'
          : 'Production returned no replaceable parts for this service tag. Confirm the tag is in warranty and DELL_DISPATCH_USER_ID / Group / Customer match TechDirect production View details — empty results here are not normal sandbox behavior.',
      };
    }

    if (!result.ok) {
      return {
        ok: false,
        error: result.json?.message || result.text?.slice(0, 300) || `HTTP ${result.status}`,
        parts: [],
        authFailed: result.status === 401,
      };
    }

    const parts = Array.isArray(result.json?.parts)
      ? result.json.parts.map((p) => ({
          partTypeCode: p.part_type_code || '',
          partNumber: p.part_number || '',
          partDescription: p.part_description || '',
          serializable: Boolean(p.serializable),
        }))
      : [];

    return {
      ok: true,
      model: result.json?.model_code || null,
      modelDescription: result.json?.model_description || null,
      lineOfBusiness: result.json?.line_of_business || null,
      parts,
      sandbox: isSandboxEnv(),
    };
  } catch (e) {
    return { ok: false, error: e.message, parts: [] };
  }
}

/**
 * Create dispatch via REST POST /dispatches
 */
async function createDispatch(payload) {
  const env = loadDellEnv();
  const sandbox = isSandboxEnv(env);

  // Sandbox testing notes: branch/customer = Group/Customer name; tech_email = User ID
  const branch = payload.branchName || env.DELL_DISPATCH_GROUP_NAME || '';
  const customer = payload.dellCustomerName || env.DELL_DISPATCH_CUSTOMER_NAME || '';
  const track = payload.track || 'Tier 1';
  const techEmail = sandbox
    ? env.DELL_DISPATCH_USER_ID || payload.techEmail
    : payload.techEmail || env.DELL_DISPATCH_TECH_EMAIL || '';

  const parts = Array.isArray(payload.parts)
    ? payload.parts.slice(0, 4).map((p) => ({
        part_number: p.partNumber || p.part_number,
        ppid: p.ppid || p.part_ppid || '',
        quantity: Number(p.quantity || p.part_qty) || 1,
      }))
    : [];

  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments.slice(0, 8).map((a) => ({
        description: a.description || a.filename,
        file_name: a.filename || a.file_name,
        mime_type: a.mimeType || a.mime_type || 'application/octet-stream',
        data: a.base64 || a.data || '',
      }))
    : [];

  const body = {
    service_tag: String(payload.serviceTag || '').trim().toUpperCase(),
    customer,
    branch,
    track,
    tech_email: techEmail,
    primary_contact_name: payload.primaryContactName || '',
    primary_contact_phone: payload.primaryContactPhone || '',
    primary_contact_email: payload.primaryContactEmail || '',
    primary_contact_phone_ext: null,
    alternative_contact_name: payload.alternateContactName || null,
    alternative_contact_phone: payload.alternateContactPhone || null,
    alternative_contact_email: payload.alternateContactEmail || null,
    alternative_contact_phone_ext: null,
    ship_to_address: {
      address_book_name: null,
      country_iso_code: countryIso(payload.countryIsoCode),
      city: payload.city || '',
      state: payload.state || '',
      zip_postal_code: payload.zip || '',
      address_line_1: payload.addressLine1 || '',
      address_line_2: payload.addressLine2 || '',
      address_line_3: payload.addressLine3 || '',
      address_line_4: null,
      time_zone: payload.timezone || 'US/Eastern',
    },
    request_complete_care: Boolean(payload.requestCompleteCare),
    request_return_to_depot: Boolean(payload.requestReturnToDepot),
    request_on_site_technician: Boolean(payload.requestOnsiteTechnician),
    reference_po_number: payload.referencePo || '',
    parts,
    attachments,
    epsa_validation_code: null,
    epsa_code: null,
    // Spec max lengths: problem_description 255, troubleshooting_note 1000
    problem_description: String(
      payload.problemDescription || payload.troubleshootingNote || ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 255),
    troubleshooting_note: String(payload.troubleshootingNote || '')
      .trim()
      .slice(0, 1000),
    on_site_note: String(payload.onSiteNote || '').slice(0, 255),
    federal_specialized_services: false,
    customer_arranged_date: null,
  };

  try {
    const result = await restFetch('/dispatches', { method: 'POST', body });
    if (!result.ok) {
      return {
        ok: false,
        error: result.json?.message || result.text?.slice(0, 500) || `HTTP ${result.status}`,
        raw: (result.text || '').slice(0, 2000),
      };
    }

    const json = result.json || {};
    const notes = Array.isArray(json.notes)
      ? json.notes.map((n) => n?.note || n?.message || String(n)).filter(Boolean)
      : [];
    const workOrder = json.code || json.work_order || json.workOrder || null;
    const dpsNumber =
      json.dps_number || json.dell_dispatch_number || json.dpsNumber || null;
    // Dell sometimes returns HTTP 200 with null code + notes explaining the reject
    if (!workOrder && !dpsNumber && !json.id) {
      const noteMsg = notes.join('; ') || null;
      return {
        ok: false,
        error:
          noteMsg ||
          json.message ||
          `Dell create returned HTTP ${result.status} without a work order/DPS. Raw: ${(result.text || '').slice(0, 400)}`,
        raw: result.text || null,
      };
    }
    return {
      ok: true,
      workOrder,
      dpsNumber: dpsNumber || workOrder,
      dispatchCode: workOrder,
      result: json.status || json.message || null,
      id: json.id || null,
      notes,
      raw: json,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function inquiryResultFromRow(row, fallbackCode) {
  const statusDetail = propertyValue(row, 'StatusDescription') || row?.StatusDescription || null;
  const dellStatus = row?.status || statusDetail || null;
  return {
    ok: true,
    result: dellStatus,
    status: dellStatus,
    statusDetail,
    dpsNumber: row?.dps_number || row?.dell_dispatch_number || null,
    dispatchCode: row?.code || fallbackCode || null,
    orderDeniedReason: row?.order_denied_reason || null,
    mappedStatus: mapDellStatusFromRow(row),
    raw: row,
  };
}

async function inquiryEx(options = {}) {
  const since =
    options.created_from_date ||
    new Date(Date.now() - (options.days || 90) * 86400000).toISOString().slice(0, 10);
  try {
    const result = await restFetch('/inquiry_ex', {
      method: 'POST',
      body: {
        offset: String(options.offset ?? '0'),
        page_size: String(options.page_size ?? '100'),
        created_from_date: since,
        scope: options.scope || 'All',
        additional_fields: options.additional_fields || [
          'CreateTimestamp',
          'Customer.FullName',
          'Description',
          'Group.Description',
          'ScheduledEmployeeFullName',
          'StatusDescription',
          'Unit.Serial',
          'UpdateTimeLocal',
        ],
        ...(options.in_statuses ? { in_statuses: options.in_statuses } : {}),
      },
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.json?.message || result.text?.slice(0, 300) || `HTTP ${result.status}`,
      };
    }
    const rows = Array.isArray(result.json)
      ? result.json
      : result.json?.data || result.json?.results || result.json?.items || [];
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function pickBestInquiryRow(rows) {
  if (!rows?.length) return null;
  const scored = rows.map((row) => {
    let score = 0;
    const mapped = mapDellStatusFromRow(row);
    if (mapped !== 'denied') score += 100;
    if (row?.dps_number || row?.dell_dispatch_number) score += 50;
    if (row?.code) score += 10;
    const upd = String(propertyValue(row, 'UpdateTimeLocal') || '');
    return { row, score, upd };
  });
  scored.sort((a, b) => b.score - a.score || b.upd.localeCompare(a.upd));
  return scored[0]?.row || null;
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function extractRelatedWorkOrder(text) {
  const m = String(text || '').match(/WO#\s*(SR[\w\d]+)/i);
  return m ? m[1].toUpperCase() : null;
}

function extractDpsNumber(text) {
  const m = String(text || '').match(/DPS#\s*([\d|]+)/i);
  if (!m) return null;
  return m[1].split('|')[0].trim() || null;
}

/** Dell sometimes returns multiple DPS values pipe-separated (e.g. 468877067|468900984). */
function dpsNumbersFromRow(row) {
  const raw = row?.dps_number || row?.dell_dispatch_number || '';
  return String(raw)
    .split('|')
    .map((s) => normalizeDigits(s))
    .filter(Boolean);
}

function rowMatchesDps(row, dps) {
  if (!dps) return true;
  return dpsNumbersFromRow(row).includes(normalizeDigits(dps));
}

function rowMatchesTag(row, tag) {
  if (!tag) return true;
  const serial = String(propertyValue(row, 'Unit.Serial') || row?.service_tag || '').toUpperCase();
  return serial === String(tag).toUpperCase();
}

/** Walk work-order hints; follow denied messages to related WOs (e.g. duplicate → real WO). */
async function inquiryCandidates(hintCodes, maxCodes = 24) {
  const seen = new Set();
  const queue = [
    ...new Set(
      (hintCodes || []).map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
    ),
  ];
  const results = [];

  while (queue.length && seen.size < maxCodes) {
    const code = queue.shift();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const res = await getDispatchStatus(code);
    if (!res.ok || !res.raw) continue;
    results.push(res);
    const related = extractRelatedWorkOrder(res.raw.order_denied_reason || res.orderDeniedReason);
    if (related && !seen.has(related)) queue.push(related);
  }

  return results;
}

/**
 * Find a Dell dispatch by work order, DPS number, and/or service tag.
 * Production inquiry_ex often returns empty — we rely on per-WO inquiry + hint chaining.
 */
async function findDispatchByCriteria({ code, dpsNumber, serviceTag, hintCodes = [], days = 90 } = {}) {
  const wo = String(code || '').trim().toUpperCase();
  const tag = String(serviceTag || '').trim().toUpperCase();
  const dps = normalizeDigits(dpsNumber);

  const hints = [
    ...new Set(
      [wo, ...(hintCodes || []).map((c) => String(c || '').trim().toUpperCase())].filter(Boolean)
    ),
  ];

  const candidates = await inquiryCandidates(hints);
  let matches = candidates.filter((r) => r.raw && rowMatchesTag(r.raw, tag));
  if (dps) matches = matches.filter((r) => rowMatchesDps(r.raw, dps));
  if (!matches.length && dps) {
    matches = candidates.filter((r) => r.raw && rowMatchesDps(r.raw, dps));
  }
  if (!matches.length && tag) {
    matches = candidates.filter((r) => r.raw && rowMatchesTag(r.raw, tag));
  }
  if (!matches.length) matches = candidates;

  let pick = pickBestInquiryRow(matches.map((m) => m.raw));
  if (pick) return inquiryResultFromRow(pick, wo || pick?.code);

  // inquiry_ex fallback (sandbox / when bulk search is populated)
  const ex = await inquiryEx({ days, page_size: '100' });
  if (ex.ok && ex.rows?.length) {
    let rows = ex.rows;
    if (tag) rows = rows.filter((row) => rowMatchesTag(row, tag));
    if (dps) rows = rows.filter((row) => rowMatchesDps(row, dps));
    if (wo) {
      const byWo = rows.filter((row) => String(row?.code || '').toUpperCase() === wo);
      if (byWo.length) rows = byWo;
    }
    pick = pickBestInquiryRow(rows);
    if (pick) return inquiryResultFromRow(pick, wo || pick?.code);
  }

  const related = candidates
    .map((c) => extractRelatedWorkOrder(c.raw?.order_denied_reason))
    .filter(Boolean);
  const relatedHint = related.find((r) => !hints.includes(r));

  return {
    ok: false,
    error: dps
      ? `No Dell dispatch found for DPS ${dpsNumber}${tag ? ` / tag ${tag}` : ''}.${relatedHint ? ` Try work order ${relatedHint}.` : ''}`
      : tag
        ? `No Dell dispatch found for service tag ${tag}.`
        : wo
          ? `Work order ${wo} not found on Dell.`
          : 'Provide a work order, DPS number, or service tag.',
    suggestedWorkOrder: relatedHint || null,
  };
}

async function getDispatchStatus(code) {
  try {
    const result = await restFetch('/inquiry', {
      method: 'POST',
      body: {
        offset: '0',
        page_size: '10',
        code: String(code || ''),
        additional_fields: [
          'CreateTimestamp',
          'Customer.FullName',
          'Description',
          'Group.Description',
          'ScheduledEmployeeFullName',
          'StatusDescription',
          'Unit.Serial',
          'UpdateTimeLocal',
        ],
      },
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.json?.message || result.text?.slice(0, 300) || `HTTP ${result.status}`,
      };
    }
    const row = Array.isArray(result.json) ? result.json[0] : result.json;
    return inquiryResultFromRow(row, code);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** REST has no separate Resubmit — return clear error. */
async function resubmitDispatch(code) {
  return {
    ok: false,
    error: `REST Self-Dispatch has no Resubmit API. Create a new dispatch if work order ${code} was denied.`,
  };
}

function propertyValue(row, name) {
  if (!row?.properties || !Array.isArray(row.properties)) return null;
  const hit = row.properties.find((p) => p?.name === name);
  return hit?.value ?? null;
}

function mapDellStatus(rawStatus) {
  const s = String(rawStatus || '').toLowerCase();
  if (!s) return null;
  if (
    s.includes('denied') ||
    s.includes('deny') ||
    s.includes('cancel') ||
    s.includes('unable to process') ||
    s.includes('duplicate request') ||
    s.includes('not processed')
  ) {
    return 'denied';
  }
  if (s.includes('deliver') || s.includes('complete') || s.includes('closed') || s.includes('accept')) {
    return 'received';
  }
  if (s.includes('ship') || s.includes('transit') || s.includes('out for')) return 'shipped';
  if (s.includes('issued') || s.includes('dsp') || s.includes('ord') || s.includes('parts review') || s.includes('que')) {
    return 'issued';
  }
  if (s.includes('submit') || s.includes('review') || s.includes('hold') || s.includes('pending') || s.includes('open')) {
    return 'submitted';
  }
  if (s.includes('claim') || s.includes('defective') || s.includes('received')) return 'received';
  return 'submitted';
}

/** Map inquiry row (status + properties + denied reason) to local tracker status. */
function mapDellStatusFromRow(row) {
  if (!row || typeof row !== 'object') return mapDellStatus(row);
  const bits = [
    row.status,
    row.StatusDescription,
    propertyValue(row, 'StatusDescription'),
    row.order_denied_reason,
  ].filter(Boolean);
  for (const bit of bits) {
    const mapped = mapDellStatus(bit);
    if (mapped === 'denied') return 'denied';
  }
  return mapDellStatus(row.status || propertyValue(row, 'StatusDescription'));
}

module.exports = {
  checkLogin,
  getPartsByServiceTag,
  createDispatch,
  getDispatchStatus,
  inquiryEx,
  findDispatchByCriteria,
  inquiryCandidates,
  extractRelatedWorkOrder,
  extractDpsNumber,
  rowMatchesTag,
  rowMatchesDps,
  dpsNumbersFromRow,
  resubmitDispatch,
  mapDellStatus,
  mapDellStatusFromRow,
  propertyValue,
  inquiryResultFromRow,
  getDispatchToken,
  restBase,
  isSandboxEnv,
  tdUser,
};
