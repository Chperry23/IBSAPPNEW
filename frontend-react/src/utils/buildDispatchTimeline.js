import { parseDellStatusRaw } from './parseDellStatusRaw';

function parseHistory(raw) {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const SOURCE_LABEL = {
  created: 'Created',
  dell_submit: 'Submitted to Dell',
  dell_refresh: 'Updated from Dell',
  dell_link: 'Linked to Dell',
  dell_import: 'Imported from Dell',
  local: 'Local update',
};

function formatTimelineNote(e) {
  const parts = [];
  if (e.note) parts.push(e.note);
  if (e.scheduled_technician && !String(e.note || '').includes(e.scheduled_technician)) {
    parts.push(`Technician: ${e.scheduled_technician}`);
  }
  if (e.waybill && !String(e.note || '').includes(e.waybill)) {
    parts.push(`Parts tracking: ${e.waybill}`);
  }
  return parts.length ? parts.join('\n') : null;
}

/**
 * Build timeline entries for the dispatch detail modal (newest first).
 * Synthesizes from timestamps when status_history is empty (legacy rows).
 */
export function buildDispatchTimeline(dispatch) {
  const stored = parseHistory(dispatch?.status_history);
  if (stored.length) {
    return [...stored].reverse().map((e) => ({
      at: e.at,
      source: SOURCE_LABEL[e.source] || e.source || 'Update',
      title: e.dell_status || e.local_status || 'Status change',
      detail:
        e.dell_status_detail && e.dell_status_detail !== e.dell_status ? e.dell_status_detail : null,
      note: formatTimelineNote(e),
      workOrder: e.work_order || null,
    }));
  }

  const synthetic = [];
  const dell = parseDellStatusRaw(dispatch?.dell_status_raw, { local: dispatch, dellOnly: true });

  if (dispatch?.created_at) {
    synthetic.push({
      at: dispatch.created_at,
      source: 'Created',
      title: 'Request saved on tablet',
      detail: null,
      note: dispatch.part_number ? `Part ${dispatch.part_number} for tag ${dispatch.service_tag}` : null,
      workOrder: null,
    });
  }
  if (dispatch?.submitted_at) {
    synthetic.push({
      at: dispatch.submitted_at,
      source: 'Submitted to Dell',
      title: dispatch.work_order || dispatch.dps_number ? 'Sent to Dell TechDirect' : 'Submit attempted',
      detail: null,
      note: dispatch.work_order || dispatch.dps_number || null,
      workOrder: dispatch.work_order || dispatch.dps_number || null,
    });
  }
  if (dispatch?.dell_status_raw && dispatch?.last_status_at) {
    synthetic.push({
      at: dispatch.last_status_at,
      source: 'Updated from Dell',
      title: dell.summary || dispatch.status,
      detail: dell.statusDetail,
      note: dell.deniedReason,
      workOrder: dispatch.work_order || dispatch.dps_number || null,
    });
  }
  if (dispatch?.updated_at && dispatch.status && ['received', 'installed'].includes(dispatch.status)) {
    synthetic.push({
      at: dispatch.updated_at,
      source: 'Local update',
      title: `Marked “${dispatch.status}”`,
      detail: null,
      note: 'Updated on this tablet',
      workOrder: dispatch.work_order || dispatch.dps_number || null,
    });
  }

  return synthetic.sort((a, b) => new Date(b.at) - new Date(a.at));
}
