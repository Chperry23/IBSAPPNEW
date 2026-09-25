import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import DellDispatchWizard from './DellDispatchWizard';
import DellSubmitOverlay from './DellSubmitOverlay';
import { parseDellSubmitResponse, parseDellRefreshResponse } from '../utils/dellSubmitMessages';
import { parseDellStatusSummary, getDispatchHeadline } from '../utils/parseDellStatusRaw';

const STATUS_CLASS = {
  draft: 'bg-gray-600/40 text-gray-300 border-gray-500/30',
  queued: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  submitted: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  issued: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  shipped: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  denied: 'bg-red-500/20 text-red-300 border-red-500/30',
  received: 'bg-green-500/20 text-green-300 border-green-500/30',
  installed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

/**
 * Customer-profile Dell Parts panel: needs queue + open tracker + wizard.
 */
export default function DellPartsPanel({
  customerId,
  initialNodeId,
  hddHistory,
  hddLoading,
  showMessage,
}) {
  const [needed, setNeeded] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [wizardNodeId, setWizardNodeId] = useState(initialNodeId ?? null);
  const [showWizard, setShowWizard] = useState(initialNodeId != null);
  /** @type {{ type: 'submit'|'refresh'|'local', id: number } | null} */
  const [busyAction, setBusyAction] = useState(null);
  const actionLock = useRef(false);
  const submitInFlight = busyAction?.type === 'submit';
  const [preview, setPreview] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [n, d] = await Promise.all([
        fetch(`/api/customers/${customerId}/dell-parts/needed`, { credentials: 'include' }).then((r) => r.json()),
        fetch(`/api/customers/${customerId}/dell-dispatches`, { credentials: 'include' }).then((r) => r.json()),
      ]);
      setNeeded(Array.isArray(n) ? n : []);
      setDispatches(Array.isArray(d) ? d : []);
    } catch (e) {
      console.error(e);
      showMessage?.('Failed to load Dell parts data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [customerId]);

  useEffect(() => {
    if (initialNodeId != null) {
      setWizardNodeId(initialNodeId);
      setShowWizard(true);
    }
  }, [initialNodeId]);

  const needsRequest = needed.filter((n) => n.needs_request);
  const cannotDispatch = needed.filter((n) => !n.dell_capable);

  const toggle = (nodeId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const startSelected = () => {
    const ids = [...selected];
    if (!ids.length) {
      showMessage?.('Select at least one flagged drive', 'error');
      return;
    }
    setWizardNodeId(ids[0]);
    setShowWizard(true);
  };

  const onWizardSaved = async () => {
    const remaining = [...selected].filter((id) => id !== wizardNodeId);
    setSelected(new Set(remaining));
    await load();
    if (remaining.length) {
      const go = window.confirm(`${remaining.length} more selected. Open next?`);
      if (go) {
        setWizardNodeId(remaining[0]);
        setShowWizard(true);
        return;
      }
    }
    setShowWizard(false);
    setWizardNodeId(null);
  };

  const notify = (payload) => {
    if (typeof payload === 'object' && payload.message) {
      showMessage?.(payload.message, payload.type, payload.title);
      return;
    }
    showMessage?.(payload);
  };

  const refreshStatus = async (id) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyAction({ type: 'refresh', id });
    try {
      const http = await fetch(`/api/dell-dispatches/${id}/refresh-status`, {
        method: 'POST',
        credentials: 'include',
      });
      const res = await http.json();
      notify(parseDellRefreshResponse(http, res));
      await load();
    } catch (e) {
      notify({
        type: 'error',
        title: 'Update from Dell failed',
        message: `Network error — ${e.message}. Try again in a moment.`,
      });
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  };

  const retrySubmit = async (id) => {
    if (actionLock.current || submitInFlight) return;
    actionLock.current = true;
    setBusyAction({ type: 'submit', id });
    try {
      const http = await fetch(`/api/dell-dispatches/${id}/submit`, {
        method: 'POST',
        credentials: 'include',
      });
      const res = await http.json();
      notify(parseDellSubmitResponse(http, res));
      await load();
    } catch (e) {
      notify({
        type: 'error',
        title: 'Could not submit to Dell',
        message: `Network error — ${e.message}. Check your connection and try again.`,
      });
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  };

  const deleteDispatch = async (id) => {
    if (!window.confirm('Delete this dispatch request from this tablet?')) return;
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyAction({ type: 'local', id });
    try {
      const http = await fetch(`/api/dell-dispatches/${id}`, { method: 'DELETE', credentials: 'include' });
      const res = await http.json();
      if (!http.ok) {
        notify({ type: 'error', title: 'Delete failed', message: res.error || 'Could not delete.' });
        return;
      }
      notify({ type: 'success', title: 'Deleted', message: res.message || 'Dispatch removed.' });
      await load();
    } catch (e) {
      notify({ type: 'error', title: 'Delete failed', message: e.message });
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  };

  const markLocal = async (id, status) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyAction({ type: 'local', id });
    try {
      await fetch(`/api/dell-dispatches/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      notify({ type: 'error', title: 'Update failed', message: e.message });
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {submitInFlight && (
        <DellSubmitOverlay
          title="Sending to Dell…"
          detail="Contacting Dell SDSR. This usually takes a few seconds."
        />
      )}
      {busyAction?.type === 'refresh' && (
        <DellSubmitOverlay
          title="Updating from Dell…"
          detail="Fetching the latest dispatch status from Dell."
        />
      )}

      {/* Needs request */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-orange-300">Needs request</h3>
            <p className="text-xs text-gray-500">HDD flagged in PM with no open Dell dispatch yet</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => {
                setWizardNodeId(null);
                setShowWizard(true);
              }}
            >
              New request…
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={!selected.size}
              onClick={startSelected}
            >
              Request selected ({selected.size})
            </button>
          </div>
        </div>

        {needsRequest.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No Dell workstations waiting for a parts request.</p>
        ) : (
          <div className="table-scroll-5-tall">
            <table className="table-dark">
              <thead>
                <tr>
                  <th className="w-10" />
                  <th>Node</th>
                  <th>Service tag</th>
                  <th>Session</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {needsRequest.map((row) => (
                  <tr key={row.node_id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(row.node_id)}
                        onChange={() => toggle(row.node_id)}
                      />
                    </td>
                    <td className="font-medium text-gray-200">
                      {row.node_name}
                      <div className="text-xs text-gray-500">{row.model || row.node_type}</div>
                    </td>
                    <td className="font-mono text-cyan-400">{row.service_tag}</td>
                    <td>
                      <Link to={`/session/${row.session_id}`} className="text-blue-400 hover:underline text-sm">
                        {row.session_name}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {row.session_date ? new Date(row.session_date).toLocaleDateString() : ''}
                      </div>
                    </td>
                    <td className="text-sm text-gray-400 max-w-xs truncate">{row.notes || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="px-2 py-1 rounded text-xs bg-orange-600 hover:bg-orange-500 text-white"
                        onClick={() => {
                          setWizardNodeId(row.node_id);
                          setShowWizard(true);
                        }}
                      >
                        Request
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cannotDispatch.length > 0 && (
          <div className="mt-3 text-xs text-gray-500">
            {cannotDispatch.length} flagged node(s) without a Dell service tag (controllers / CIOCs / missing tag) — cannot dispatch via TechDirect.
          </div>
        )}
      </section>

      {/* Open / recent */}
      <section>
        <h3 className="text-lg font-semibold text-gray-100 mb-1">Open / recent dispatches</h3>
        <p className="text-xs text-gray-500 mb-3">
          Local tracker — use <strong>Update from Dell</strong> to pull work-order status (shipped / delivered / etc.)
        </p>
        {dispatches.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No dispatches for this customer yet.</p>
        ) : (
          <div className="table-scroll-5-tall">
            <table className="table-dark">
              <thead>
                <tr>
                  <th>Updated</th>
                  <th>Node / tag</th>
                  <th>Part</th>
                  <th>Evidence</th>
                  <th>DPS / WO</th>
                  <th>Status</th>
                  <th>Ship-to</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map((d) => (
                  <tr key={d.id}>
                    <td className="text-sm text-gray-400 whitespace-nowrap">
                      {d.updated_at ? new Date(d.updated_at).toLocaleString() : '—'}
                    </td>
                    <td>
                      <div className="font-medium text-gray-200">{d.node_name || '—'}</div>
                      <div className="font-mono text-xs text-cyan-400">{d.service_tag}</div>
                    </td>
                    <td className="text-sm">
                      {d.part_number || '—'}
                      {d.part_description && (
                        <div className="text-xs text-gray-500 truncate max-w-[10rem]">{d.part_description}</div>
                      )}
                    </td>
                    <td>
                      {(d.attachments || []).length === 0 ? (
                        <span className="text-xs text-gray-500">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {d.attachments.map((a) =>
                            a.is_image ? (
                              <button
                                key={a.id}
                                type="button"
                                className="w-9 h-9 rounded border border-gray-600 overflow-hidden hover:border-blue-400"
                                title={a.filename}
                                onClick={() =>
                                  setPreview({
                                    url: a.url,
                                    filename: a.filename,
                                    isImage: true,
                                  })
                                }
                              >
                                <img src={a.url} alt="" className="w-full h-full object-cover" />
                              </button>
                            ) : (
                              <button
                                key={a.id}
                                type="button"
                                className="text-[10px] text-blue-400 hover:underline"
                                onClick={() =>
                                  setPreview({
                                    url: a.url,
                                    filename: a.filename,
                                    isImage: false,
                                  })
                                }
                              >
                                {a.filename}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </td>
                    <td className="font-mono text-xs">
                      {d.dps_number || d.work_order || (
                        <span className="text-yellow-500">none</span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const h = getDispatchHeadline(d);
                        const summary = parseDellStatusSummary(d.dell_status_raw);
                        return (
                          <>
                            <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_CLASS[h.badge] || STATUS_CLASS[d.status] || STATUS_CLASS.draft}`}>
                              {h.badge}
                            </span>
                            {summary && (
                              <div className="text-[10px] text-gray-400 mt-1 max-w-[12rem] truncate" title={summary}>
                                {summary}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="text-xs text-gray-400">
                      {[d.ship_city, d.ship_state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {!d.dps_number && !d.work_order && (
                          <button
                            type="button"
                            disabled={submitInFlight || Boolean(busyAction)}
                            className="px-2 py-0.5 rounded text-[10px] bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            onClick={() => retrySubmit(d.id)}
                          >
                            {busyAction?.type === 'submit' && busyAction.id === d.id
                              ? 'Sending…'
                              : 'Submit to Dell'}
                          </button>
                        )}
                        {(d.dps_number || d.work_order) && (
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            className="px-2 py-0.5 rounded text-[10px] bg-cyan-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            onClick={() => refreshStatus(d.id)}
                          >
                            {busyAction?.type === 'refresh' && busyAction.id === d.id
                              ? 'Updating…'
                              : 'Update from Dell'}
                          </button>
                        )}
                        {['submitted', 'issued', 'shipped'].includes(d.status) && (
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            className="px-2 py-0.5 rounded text-[10px] bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            onClick={() => markLocal(d.id, 'received')}
                          >
                            Received
                          </button>
                        )}
                        {d.status === 'received' && (
                          <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            className="px-2 py-0.5 rounded text-[10px] bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            onClick={() => markLocal(d.id, 'installed')}
                          >
                            Installed
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          className="px-2 py-0.5 rounded text-[10px] bg-red-900/80 text-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={() => deleteDispatch(d.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div
            className="bg-gray-900 rounded-xl border border-gray-700 max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3 gap-3">
              <div className="text-sm text-gray-200 truncate">{preview.filename}</div>
              <button type="button" className="text-gray-400 hover:text-white text-xl" onClick={() => setPreview(null)}>
                &times;
              </button>
            </div>
            {preview.isImage ? (
              <img src={preview.url} alt={preview.filename} className="max-w-full max-h-[75vh] mx-auto rounded" />
            ) : (
              <iframe title={preview.filename} src={preview.url} className="w-full h-[70vh] bg-white rounded" />
            )}
          </div>
        </div>
      )}

      {/* Legacy PM HDD history */}
      <section>
        <h3 className="text-lg font-semibold text-gray-100 mb-1">PM drive history</h3>
        <p className="text-xs text-gray-500 mb-3">All sessions where HDD replaced was checked</p>
        {hddLoading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-400" />
          </div>
        ) : hddHistory.length === 0 ? (
          <p className="text-sm text-gray-500">No HDD replacements recorded yet.</p>
        ) : (
          <div className="table-scroll-5-tall">
            <table className="table-dark">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Session</th>
                  <th>Node</th>
                  <th>Type</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {hddHistory.map((row, i) => (
                  <tr key={i}>
                    <td className="text-gray-300 whitespace-nowrap">
                      {new Date(row.session_date).toLocaleDateString()}
                    </td>
                    <td>
                      <Link to={`/session/${row.session_id}`} className="text-blue-400 hover:underline">
                        {row.session_name}
                      </Link>
                    </td>
                    <td className="font-medium text-gray-200">{row.node_name}</td>
                    <td>
                      <span className="badge badge-blue text-xs">{row.node_type}</span>
                    </td>
                    <td className="text-gray-400 text-sm">{row.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showWizard && (
        <DellDispatchWizard
          customerId={customerId}
          nodeId={wizardNodeId}
          onClose={() => {
            setShowWizard(false);
            setWizardNodeId(null);
          }}
          onSaved={onWizardSaved}
          showMessage={showMessage}
        />
      )}
    </div>
  );
}
