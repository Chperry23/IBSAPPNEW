/** @typedef {{ at: string, source: string, local_status?: string, dell_status?: string, dell_status_detail?: string, work_order?: string, note?: string }} HistoryEntry */

const db = require('../config/database');

function parseHistory(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function serializeDellRaw(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function propertyValue(row, name) {
  if (!row?.properties || !Array.isArray(row.properties)) return null;
  const hit = row.properties.find((p) => p?.name === name);
  return hit?.value ?? null;
}

function parseDellUpdateTime(value) {
  const s = String(value || '').trim();
  if (!/^\d{14}$/.test(s)) return null;
  const y = s.slice(0, 4);
  const mo = s.slice(4, 6);
  const d = s.slice(6, 8);
  const h = s.slice(8, 10);
  const mi = s.slice(10, 12);
  const sec = s.slice(12, 14);
  const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function sameEntry(a, b) {
  if (!a || !b) return false;
  if (a.dell_update_time && b.dell_update_time && a.dell_update_time === b.dell_update_time) {
    return (
      a.local_status === b.local_status &&
      a.dell_status === b.dell_status &&
      a.dell_status_detail === b.dell_status_detail &&
      a.work_order === b.work_order &&
      a.waybill === b.waybill &&
      a.scheduled_technician === b.scheduled_technician &&
      a.note === b.note
    );
  }
  return (
    a.local_status === b.local_status &&
    a.dell_status === b.dell_status &&
    a.dell_status_detail === b.dell_status_detail &&
    a.work_order === b.work_order &&
    a.note === b.note
  );
}

/** Append a status history event (skips exact duplicate of the latest entry). */
async function appendDispatchHistory(dispatchId, entry) {
  const row = await db.prepare('SELECT status_history FROM dell_dispatches WHERE id = ?').get([dispatchId]);
  if (!row) return;
  const history = parseHistory(row.status_history);
  const next = {
    at: parseDellUpdateTime(entry.dell_update_time) || new Date().toISOString(),
    ...entry,
  };
  if (history.length && sameEntry(history[history.length - 1], next)) return;
  history.push(next);
  await db
    .prepare(
      `UPDATE dell_dispatches SET status_history = ?, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
    .run([JSON.stringify(history), dispatchId]);
}

function historyFromInquiry(row, mappedStatus, source = 'dell_refresh') {
  const statusDetail = propertyValue(row, 'StatusDescription') || row?.StatusDescription || null;
  const dellUpdateTime = propertyValue(row, 'UpdateTimeLocal') || null;
  const technician = propertyValue(row, 'ScheduledEmployeeFullName') || null;
  const waybill = row?.waybill || null;
  const noteParts = [];
  if (technician) noteParts.push(`Technician: ${technician}`);
  if (waybill) noteParts.push(`Parts tracking: ${waybill}`);
  if (row?.order_denied_reason) noteParts.push(row.order_denied_reason);
  return {
    source,
    local_status: mappedStatus,
    dell_status: row?.status || null,
    dell_status_detail: statusDetail,
    work_order: row?.code || row?.work_order || null,
    dell_update_time: dellUpdateTime,
    scheduled_technician: technician,
    waybill,
    note: noteParts.length ? noteParts.join(' · ') : null,
  };
}

/** Build a user-facing summary of what Dell inquiry actually returns (not the dell.com portal timeline). */
function inquiryServiceSummary(row) {
  const technician = propertyValue(row, 'ScheduledEmployeeFullName');
  const updateRaw = propertyValue(row, 'UpdateTimeLocal');
  const updateAt = parseDellUpdateTime(updateRaw);
  const waybill = row?.waybill || null;
  const bits = [];
  if (technician) bits.push(`Technician ${technician}`);
  if (waybill) bits.push(`tracking ${waybill}`);
  if (updateAt) bits.push(`last Dell update ${new Date(updateAt).toLocaleString()}`);
  return bits.length ? bits.join(' · ') : null;
}

module.exports = {
  parseHistory,
  serializeDellRaw,
  appendDispatchHistory,
  historyFromInquiry,
  inquiryServiceSummary,
  parseDellUpdateTime,
  propertyValue,
};
