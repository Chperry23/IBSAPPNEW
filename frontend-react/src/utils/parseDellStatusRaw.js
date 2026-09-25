const PROPERTY_LABELS = {
  CreateTimestamp: 'Created (Dell)',
  'Customer.FullName': 'Dell customer',
  Description: 'Problem description',
  'Group.Description': 'Branch / group',
  ScheduledEmployeeFullName: 'Scheduled technician',
  StatusDescription: 'Status detail',
  'Unit.Serial': 'Service tag',
  UpdateTimeLocal: 'Last updated (Dell)',
};

/** Dell-only fields — omit data already shown in the local request section */
const DELL_ONLY_TOP = {
  order_denied_reason: 'Denied reason',
  doa: 'Dead on arrival (DOA)',
  epsa_error_code: 'EPSA error code',
  epsa_validation_code: 'EPSA validation code',
  waybill: 'Waybill / tracking',
};

function parseDellTimestamp(value) {
  const s = String(value || '').trim();
  if (!/^\d{14}$/.test(s)) return s || null;
  const y = s.slice(0, 4);
  const mo = s.slice(4, 6);
  const d = s.slice(6, 8);
  const h = s.slice(8, 10);
  const mi = s.slice(10, 12);
  const sec = s.slice(12, 14);
  const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}`);
  return Number.isNaN(dt.getTime()) ? s : dt.toLocaleString();
}

function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return false;
  return String(value).trim() === '';
}

function normText(v) {
  return String(v || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatValue(key, value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'CreateTimestamp' || key === 'UpdateTimeLocal') return parseDellTimestamp(value);
  return value;
}

function propsToMap(properties) {
  const map = new Map();
  if (!Array.isArray(properties)) return map;
  for (const p of properties) {
    if (p?.name != null && !isEmpty(p.value)) map.set(p.name, p.value);
  }
  return map;
}

function pushField(fields, label, value, opts = {}) {
  if (isEmpty(value) && typeof value !== 'boolean') return;
  const { key, ...rest } = opts;
  fields.push({
    label,
    value: formatValue(key || label, value),
    ...rest,
  });
}

function textsSimilar(a, b) {
  const x = normText(a);
  const y = normText(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y.slice(0, 80)) || y.startsWith(x.slice(0, 80));
}

/** Extract related work order from denied reason text */
export function extractRelatedWorkOrder(text) {
  const m = String(text || '').match(/WO#\s*(SR\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Extract DPS number referenced in Dell denied / status notes */
export function extractDpsNumber(text) {
  const m = String(text || '').match(/DPS#\s*(\d+)/i);
  return m ? m[1] : null;
}

/**
 * Parse stored dell_status_raw JSON into labeled display fields.
 * @param {string|object} raw
 * @param {{ local?: object, dellOnly?: boolean }} [opts]
 */
export function parseDellStatusRaw(raw, opts = {}) {
  const local = opts.local || null;
  const dellOnly = opts.dellOnly !== false;

  if (raw == null || raw === '') {
    return { summary: null, statusDetail: null, deniedReason: null, relatedWorkOrder: null, fields: [], parts: [], parseError: null };
  }

  let obj;
  try {
    obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {
      summary: null,
      statusDetail: null,
      deniedReason: null,
      relatedWorkOrder: null,
      fields: [],
      parts: [],
      parseError: typeof raw === 'string' ? raw.slice(0, 500) : String(raw),
    };
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      summary: null,
      statusDetail: null,
      deniedReason: null,
      relatedWorkOrder: null,
      fields: [],
      parts: [],
      parseError: String(raw).slice(0, 500),
    };
  }

  const fields = [];
  const propMap = propsToMap(obj.properties);
  const statusDetail = propMap.get('StatusDescription') || null;
  const deniedReason = obj.order_denied_reason || null;
  const relatedWorkOrder = extractRelatedWorkOrder(deniedReason);

  const localWo = local?.work_order || local?.dps_number || null;
  const localTag = local?.service_tag || null;
  const localNote = local?.troubleshooting_note || null;

  if (!dellOnly) {
    for (const [key, label] of Object.entries({ code: 'Work order code', status: 'Dell status', ...PROPERTY_LABELS, ...DELL_ONLY_TOP })) {
      if (key in obj) {
        pushField(fields, label, obj[key], { key, multiline: key === 'problem_description' || key === 'troubleshooting_notes' });
      }
    }
  } else {
    pushField(fields, 'Dell status', obj.status, { key: 'status' });
    pushField(fields, 'Status detail', statusDetail, { key: 'StatusDescription' });
    if (localWo !== obj.code) {
      pushField(fields, 'Work order code', obj.code, { key: 'code', mono: true });
    }
    for (const [key, label] of Object.entries(DELL_ONLY_TOP)) {
      if (key in obj) {
        pushField(fields, label, obj[key], {
          key,
          multiline: key === 'order_denied_reason',
          mono: key === 'waybill',
        });
      }
    }
    pushField(fields, 'Scheduled technician', propMap.get('ScheduledEmployeeFullName'), { key: 'ScheduledEmployeeFullName' });
    pushField(fields, 'Last updated (Dell)', propMap.get('UpdateTimeLocal'), { key: 'UpdateTimeLocal' });
    pushField(fields, 'Created (Dell)', propMap.get('CreateTimestamp'), { key: 'CreateTimestamp' });

    const desc = propMap.get('Description');
    const prob = obj.problem_description;
    const notes = obj.troubleshooting_notes;
    if (prob && !textsSimilar(prob, localNote) && !textsSimilar(prob, desc)) {
      pushField(fields, 'Problem description (Dell)', prob, { multiline: true });
    }
    if (notes && !textsSimilar(notes, localNote)) {
      pushField(fields, 'Troubleshooting notes (Dell)', notes, { multiline: true });
    }
  }

  const parts = Array.isArray(obj.parts)
    ? obj.parts
        .map((p) => ({
          part_number: p.part_number || p.override_part_number || null,
          part_description: p.part_description || null,
          part_type: p.part_type || null,
          quantity: p.quantity ?? 1,
          ppid: p.ppid || null,
          part_cru_fru: p.part_cru_fru || null,
        }))
        .filter((p) => {
          if (!local?.part_number) return true;
          return p.part_number !== local.part_number;
        })
    : [];

  const summary = obj.status || statusDetail || obj.code || null;

  return {
    summary: summary ? String(summary) : null,
    statusDetail,
    deniedReason,
    relatedWorkOrder,
    fields,
    parts,
    parseError: null,
  };
}

/** One-line label for table rows */
export function parseDellStatusSummary(raw) {
  const { summary, statusDetail, deniedReason, fields, parseError } = parseDellStatusRaw(raw, { dellOnly: true });
  if (parseError) return parseError.slice(0, 80);
  if (deniedReason) return `${summary || 'Denied'} — ${deniedReason.slice(0, 60)}`;
  if (summary && statusDetail && summary !== statusDetail) return `${summary} · ${statusDetail}`;
  if (!summary && !fields.length) return null;

  const codeField = fields.find((f) => f.label === 'Work order code');
  const code = codeField?.value;
  if (summary && code && summary !== code) return `${summary} · ${code}`;
  return summary || (code ? String(code) : null);
}

export function getDellServiceInfo(raw) {
  const dell = parseDellStatusRaw(raw, { dellOnly: true });
  const technician = dell.fields.find((f) => f.label === 'Scheduled technician')?.value || null;
  const lastUpdate = dell.fields.find((f) => f.label === 'Last updated (Dell)')?.value || null;
  const waybill = dell.fields.find((f) => f.label === 'Waybill / tracking')?.value || null;
  return { technician, lastUpdate, waybill };
}

export function getDispatchHeadline(dispatch) {
  const dell = parseDellStatusRaw(dispatch?.dell_status_raw, { local: dispatch, dellOnly: true });
  const service = getDellServiceInfo(dispatch?.dell_status_raw);
  const wo = dispatch?.work_order || dispatch?.dps_number;
  if (dell.deniedReason) {
    return {
      badge: 'denied',
      title: dell.summary || 'Denied',
      subtitle: dell.statusDetail || dell.deniedReason,
      relatedWorkOrder: dell.relatedWorkOrder,
    };
  }
  const subtitleParts = [wo, dell.statusDetail, service.technician ? `Tech ${service.technician}` : null]
    .filter(Boolean);
  return {
    badge: dispatch?.status || 'draft',
    title: dell.summary || dispatch?.status || 'Unknown',
    subtitle: subtitleParts.join(' · ') || null,
    relatedWorkOrder: null,
  };
}
