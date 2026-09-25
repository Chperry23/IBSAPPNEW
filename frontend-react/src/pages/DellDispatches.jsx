import { useState, useEffect, useMemo, useRef } from 'react';
import Layout from '../components/Layout';
import DellDispatchWizard from '../components/DellDispatchWizard';
import DellSubmitOverlay from '../components/DellSubmitOverlay';
import DellDispatchDetailModal from '../components/DellDispatchDetailModal';
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

export default function DellDispatches() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [connection, setConnection] = useState(null);
  const [message, setMessage] = useState(null);
  /** @type {{ type: 'submit'|'refresh', id: number } | null} */
  const [busyAction, setBusyAction] = useState(null);
  const actionLock = useRef(false);

  const [showPicker, setShowPicker] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customersLoading, setCustomersLoading] = useState(false);
  const [wizardCustomerId, setWizardCustomerId] = useState(null);
  const [wizardNodeId, setWizardNodeId] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const showMsg = (payload) => {
    const normalized =
      typeof payload === 'string'
        ? { text: payload, type: 'info', title: 'Notice' }
        : {
            text: payload.message || payload.text || '',
            type: payload.type || 'info',
            title: payload.title || (payload.type === 'success' ? 'Done' : payload.type === 'error' ? 'Error' : 'Notice'),
          };
    setMessage(normalized);
    setTimeout(() => setMessage(null), 8000);
  };

  const submitInFlight = busyAction?.type === 'submit';

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) => {
      const haystack = [
        d.customer_id,
        d.customer_alias,
        d.customer_name,
        d.node_name,
        d.service_tag,
        d.part_number,
        d.part_description,
        d.work_order,
        d.dps_number,
        d.status,
        d.ship_address_line1,
        d.ship_city,
        d.ship_state,
        d.ship_zip,
        parseDellStatusSummary(d.dell_status_raw),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  const load = async () => {
    setLoading(true);
    try {
      const [list, conn] = await Promise.all([
        fetch(`/api/dell-dispatches?status=${filter}`, { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/dell-dispatches/connection', { credentials: 'include' }).then((r) => r.json()),
      ]);
      const nextRows = Array.isArray(list) ? list : [];
      setRows(nextRows);
      setDetail((prev) => (prev ? syncDetail(nextRows, prev.id) : null));
      setConnection(conn);
    } catch (e) {
      console.error(e);
      showMsg({ type: 'error', title: 'Load failed', message: 'Could not load dispatches. Try Refresh.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const openNewDispatch = async () => {
    setShowPicker(true);
    setCustomerSearch('');
    if (customers.length) return;
    setCustomersLoading(true);
    try {
      const list = await fetch('/api/customers', { credentials: 'include' }).then((r) => r.json());
      setCustomers(Array.isArray(list) ? list : []);
    } catch (e) {
      showMsg({ type: 'error', title: 'Load failed', message: e.message || 'Failed to load customers.' });
      setShowPicker(false);
    } finally {
      setCustomersLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 40);
    return customers
      .filter((c) => {
        const name = String(c.name || '').toLowerCase();
        const alias = String(c.alias || '').toLowerCase();
        const company = String(c.company_name || '').toLowerCase();
        const dongle = String(c.dongle_id || '').toLowerCase();
        return (
          name.includes(q) ||
          alias.includes(q) ||
          company.includes(q) ||
          dongle.includes(q)
        );
      })
      .slice(0, 40);
  }, [customers, customerSearch]);

  const startWizard = (customerId, nodeId = null) => {
    setWizardCustomerId(customerId);
    setWizardNodeId(nodeId);
    setShowPicker(false);
    setShowWizard(true);
  };

  const [preview, setPreview] = useState(null); // { url, filename, mime }
  const [detail, setDetail] = useState(null);

  const syncDetail = (list, currentId) => {
    if (!currentId) return null;
    return list.find((r) => r.id === currentId) || null;
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
      showMsg(parseDellSubmitResponse(http, res));
      await load();
    } catch (e) {
      showMsg({
        type: 'error',
        title: 'Could not submit to Dell',
        message: `Network error — ${e.message}. Check your connection and try again.`,
      });
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  };

  const updateFromDell = async (id) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyAction({ type: 'refresh', id });
    try {
      const http = await fetch(`/api/dell-dispatches/${id}/refresh-status`, {
        method: 'POST',
        credentials: 'include',
      });
      const res = await http.json();
      showMsg(parseDellRefreshResponse(http, res));
      await load();
    } catch (e) {
      showMsg({
        type: 'error',
        title: 'Update from Dell failed',
        message: `Network error — ${e.message}. Try again in a moment.`,
      });
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
      showMsg({
        type: 'success',
        title: 'Status updated',
        message: `Marked as “${status}” on this tablet.`,
      });
    } catch (e) {
      showMsg({ type: 'error', title: 'Update failed', message: e.message });
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  };

  const deleteDispatch = async (id) => {
    if (
      !window.confirm(
        'Delete this dispatch request from this tablet? It will be removed from the list (soft delete).'
      )
    ) {
      return;
    }
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyAction({ type: 'local', id });
    try {
      const http = await fetch(`/api/dell-dispatches/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const res = await http.json();
      if (!http.ok) {
        showMsg({ type: 'error', title: 'Delete failed', message: res.error || res.message || 'Could not delete.' });
        return;
      }
      setDetail(null);
      showMsg({ type: 'success', title: 'Deleted', message: res.message || 'Dispatch request removed.' });
      await load();
    } catch (e) {
      showMsg({ type: 'error', title: 'Delete failed', message: e.message });
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  };

  const openPreview = (att) => {
    if (!att?.url) return;
    setPreview({
      url: att.url,
      filename: att.filename || 'attachment',
      mime: att.mime_type || '',
      isImage: att.is_image || /^image\//i.test(att.mime_type || ''),
    });
  };

  const connectionLabel = () => {
    if (!connection) return null;
    if (connection.ready) {
      const rel = connection.relationships?.[0];
      const relBits = rel
        ? ` — ${rel.branchName || rel.branch_description || ''} / ${rel.customerName || rel.customer_name || ''}`
        : connection.fullName
          ? ` — ${connection.fullName}`
          : '';
      return `Dell SDSR ready${relBits}${connection.sandbox ? ' (sandbox)' : ' (production)'}`;
    }
    return `Dell SDSR not ready: ${connection.error || connection.hint || 'CheckLogin failed'} — requests still save locally as queued`;
  };

  return (
    <Layout>
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

      {message && (
        <div
          className={`fixed top-4 right-4 z-[60] p-4 rounded-lg shadow-xl max-w-md border ${
            message.type === 'success'
              ? 'bg-green-900/95 border-green-600/50'
              : message.type === 'error'
                ? 'bg-red-900/95 border-red-600/50'
                : 'bg-blue-900/95 border-blue-600/50'
          } text-white`}
          role="status"
        >
          <div className="font-semibold mb-1">{message.title}</div>
          <div className="text-sm leading-snug opacity-95">{message.text}</div>
        </div>
      )}

      <div className="mb-6 animate-fadeIn flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text mb-2">Dell Parts Dispatches</h1>
          <p className="text-gray-400 text-sm">Open HDD / parts requests across all customers</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={openNewDispatch}>
            New dispatch
          </button>
        </div>
      </div>

      {connection && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            connection.ready
              ? 'bg-green-900/20 border-green-700/40 text-green-300'
              : 'bg-yellow-900/20 border-yellow-700/40 text-yellow-300'
          }`}
        >
          {connectionLabel()}
          {connection.hint && connection.ready && (
            <div className="text-xs text-green-400/80 mt-1">{connection.hint}</div>
          )}
        </div>
      )}

      <div className="card mb-4 p-3 space-y-3">
        <input
          className="form-input w-full max-w-md"
          placeholder="Search customer ID, alias, tag, part, work order, address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
        {['all', 'open', 'queued', 'submitted', 'shipped', 'denied', 'received'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filter === f ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {f}
          </button>
        ))}
        <button type="button" className="ml-auto btn btn-secondary text-sm" onClick={load}>
          Refresh
        </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="spinner h-10 w-10" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-16 text-gray-400 space-y-3">
            <div>{rows.length === 0 ? 'No dispatches match this filter.' : 'No dispatches match your search.'}</div>
            <button type="button" className="btn btn-primary" onClick={openNewDispatch}>
              New dispatch
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-dark">
              <thead>
                <tr>
                  <th>Customer ID / alias</th>
                  <th>Node / tag</th>
                  <th>Part</th>
                  <th>Evidence</th>
                  <th>DPS / WO</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((d) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer hover:bg-gray-700/25 transition-colors"
                    onClick={() => setDetail(d)}
                  >
                    <td>
                      <div className="text-left">
                        <div className="font-mono text-xs text-gray-400">
                          #{d.customer_id}
                        </div>
                        <div className="text-blue-400 font-medium">
                          {d.customer_alias || d.customer_name || '—'}
                        </div>
                        {d.customer_alias && d.customer_name && d.customer_alias !== d.customer_name && (
                          <div className="text-[10px] text-gray-500 truncate max-w-[10rem]">{d.customer_name}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="text-gray-200">{d.node_name || '—'}</div>
                      <div className="font-mono text-xs text-cyan-400">{d.service_tag}</div>
                      {(d.ship_city || d.ship_state) && (
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {[d.ship_address_line1, d.ship_city, d.ship_state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="text-sm">
                      {d.part_number || '—'}
                      {d.part_description && (
                        <div className="text-xs text-gray-500 truncate max-w-[10rem]">{d.part_description}</div>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {(d.attachments || []).length === 0 ? (
                        <span className="text-xs text-gray-500">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {d.attachments.map((a) =>
                            a.is_image ? (
                              <button
                                key={a.id}
                                type="button"
                                className="block w-10 h-10 rounded border border-gray-600 overflow-hidden bg-gray-900 hover:border-blue-400"
                                title={a.filename}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPreview(a);
                                }}
                              >
                                <img
                                  src={a.url}
                                  alt={a.filename}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ) : (
                              <button
                                key={a.id}
                                type="button"
                                className="text-[10px] text-blue-400 hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPreview(a);
                                }}
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
                        <span className="text-yellow-500">none (not on Dell)</span>
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
                              <div className="text-[10px] text-gray-400 mt-1 max-w-[14rem] truncate" title={summary}>
                                {summary}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="text-xs text-gray-400 whitespace-nowrap">
                      {d.updated_at ? new Date(d.updated_at).toLocaleString() : '—'}
                    </td>
                    <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-2">
                        {(!d.dps_number && !d.work_order) && (
                          <button
                            type="button"
                            className="text-xs text-orange-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                            disabled={submitInFlight || busyAction?.id === d.id}
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
                            className="text-xs text-cyan-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                            disabled={Boolean(busyAction)}
                            onClick={() => updateFromDell(d.id)}
                          >
                            {busyAction?.type === 'refresh' && busyAction.id === d.id
                              ? 'Updating…'
                              : 'Update from Dell'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <DellDispatchDetailModal
          dispatch={detail}
          onClose={() => setDetail(null)}
          onPreview={openPreview}
          onSubmit={retrySubmit}
          onRefresh={updateFromDell}
          onMarkLocal={markLocal}
          onDelete={deleteDispatch}
          busyAction={busyAction}
          submitInFlight={submitInFlight}
        />
      )}

      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div
            className="bg-gray-900 rounded-xl border border-gray-700 max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3 gap-3">
              <div className="text-sm text-gray-200 truncate">{preview.filename}</div>
              <div className="flex gap-2 shrink-0">
                <a
                  href={`${preview.url}?download=1`}
                  className="text-xs text-blue-400 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
                <button type="button" className="text-gray-400 hover:text-white text-xl leading-none" onClick={() => setPreview(null)}>
                  &times;
                </button>
              </div>
            </div>
            {preview.isImage ? (
              <img src={preview.url} alt={preview.filename} className="max-w-full max-h-[75vh] mx-auto rounded" />
            ) : (
              <iframe title={preview.filename} src={preview.url} className="w-full h-[70vh] bg-white rounded" />
            )}
          </div>
        </div>
      )}

      {showPicker && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-100">New Dell dispatch</h2>
                <p className="text-xs text-gray-400 mt-0.5">Pick a customer (name, alias, company, or SI ID), then enter the service tag and part</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="text-gray-400 hover:text-white text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 border-b border-gray-700">
              <input
                className="form-input w-full"
                placeholder="Search name, alias, company, SI ID…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {customersLoading ? (
                <div className="flex justify-center py-10">
                  <div className="spinner h-8 w-8" />
                </div>
              ) : filteredCustomers.length === 0 ? (
                <p className="text-center text-gray-400 py-10 text-sm">No customers found</p>
              ) : (
                <ul className="space-y-1">
                  {filteredCustomers.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-700/80 text-gray-100"
                        onClick={() => startWizard(c.id)}
                      >
                        <div className="font-medium">{c.alias || c.name}</div>
                        <div className="text-xs text-gray-400">
                          {[c.alias && c.name !== c.alias ? c.name : null, c.city, c.state, c.dongle_id]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {showWizard && wizardCustomerId != null && (
        <DellDispatchWizard
          customerId={wizardCustomerId}
          nodeId={wizardNodeId}
          onClose={() => {
            setShowWizard(false);
            setWizardCustomerId(null);
            setWizardNodeId(null);
          }}
          onSaved={async () => {
            setShowWizard(false);
            setWizardCustomerId(null);
            setWizardNodeId(null);
            await load();
          }}
          showMessage={showMsg}
        />
      )}
    </Layout>
  );
}
