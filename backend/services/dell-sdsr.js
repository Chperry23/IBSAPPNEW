/**
 * Dell Self-Dispatch REST client (TechDirect SDSR REST API v1.2).
 * Auth: OAuth Bearer + TDUser header (sandbox User ID from TechDirect).
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

/** TDUser header — sandbox requires TechDirect sandbox User ID, not email. */
function tdUser(env = loadDellEnv()) {
  const id = String(env.DELL_DISPATCH_USER_ID || '').trim();
  if (!id) throw new Error('DELL.env missing DELL_DISPATCH_USER_ID (required as REST TDUser)');
  return id;
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

    // Sandbox often returns 204 for real production tags
    if (result.status === 204) {
      return {
        ok: true,
        parts: [],
        model: null,
        modelDescription: null,
        empty: true,
        sandbox: isSandboxEnv(),
        hint: isSandboxEnv()
          ? 'Sandbox returned no parts for this service tag (normal for real tags until Dell promotes the API key to production). Try a sandbox test tag such as CARV005, or enter the part number manually.'
          : 'No replaceable parts returned for this service tag.',
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
    problem_description: String(payload.problemDescription || payload.troubleshootingNote || '').slice(0, 1000),
    troubleshooting_note: String(payload.troubleshootingNote || '').slice(0, 1000),
    on_site_note: payload.onSiteNote || '',
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
    return {
      ok: true,
      workOrder: json.code || json.work_order || null,
      dpsNumber: json.dps_number || json.dell_dispatch_number || null,
      dispatchCode: json.code || null,
      result: json.status || json.message || null,
      id: json.id || null,
      raw: JSON.stringify(json).slice(0, 2000),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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
    return {
      ok: true,
      result: row?.status || row?.StatusDescription || null,
      status: row?.status || row?.StatusDescription || null,
      dpsNumber: row?.dps_number || row?.dell_dispatch_number || null,
      dispatchCode: row?.code || code,
      orderDeniedReason: row?.order_denied_reason || null,
      raw: row,
    };
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

function mapDellStatus(rawStatus) {
  const s = String(rawStatus || '').toLowerCase();
  if (!s) return null;
  if (s.includes('denied') || s.includes('deny')) return 'denied';
  if (s.includes('ship')) return 'shipped';
  if (s.includes('issued') || s.includes('dsp') || s.includes('ord') || s.includes('que')) return 'issued';
  if (s.includes('submit') || s.includes('review') || s.includes('hold') || s.includes('pending')) return 'submitted';
  if (s.includes('claim') || s.includes('defective')) return 'received';
  return 'submitted';
}

module.exports = {
  checkLogin,
  getPartsByServiceTag,
  createDispatch,
  getDispatchStatus,
  resubmitDispatch,
  mapDellStatus,
  getDispatchToken,
  restBase,
  isSandboxEnv,
  tdUser,
};
