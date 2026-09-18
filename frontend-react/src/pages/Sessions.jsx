import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, X, Check, Copy, Pencil, Trash2, ExternalLink, MoreHorizontal, MapPin, StickyNote, GitBranch } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';
import { formatSessionNameWithLabel, defaultDuplicateSessionName } from '../utils/sessionName';
import SessionNodeScopePicker from '../components/SessionNodeScopePicker';

function SessionMetaTags({ session }) {
  const locationCount = Number(session.location_count) || 0;
  const notesCount = Number(session.site_notes_count) || 0;
  const partialNodes = session.node_scope === 'selected';
  const isIi = session.session_type === 'ii';

  if (!locationCount && !notesCount && !partialNodes && !isIi) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {isIi && <span className="badge badge-gray">I&amp;I</span>}
      {partialNodes && (
        <span className="badge badge-blue inline-flex items-center gap-1" title="Only selected nodes are in scope">
          <GitBranch className="h-3 w-3" aria-hidden />
          Partial nodes
        </span>
      )}
      {locationCount > 0 && (
        <span className="badge badge-gray inline-flex items-center gap-1" title={`${locationCount} location(s)`}>
          <MapPin className="h-3 w-3" aria-hidden />
          {locationCount} location{locationCount !== 1 ? 's' : ''}
        </span>
      )}
      {notesCount > 0 && (
        <Link
          to={`/customer/${session.customer_id}?tab=notes`}
          className="badge badge-yellow inline-flex items-center gap-1 hover:brightness-110"
          title="Customer has site notes — review before PM"
          onClick={(e) => e.stopPropagation()}
        >
          <StickyNote className="h-3 w-3" aria-hidden />
          Site notes
        </Link>
      )}
    </div>
  );
}

function SessionRowActions({
  session,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onEdit,
  onDuplicate,
  onComplete,
  onDelete,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onCloseMenu();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseMenu();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, onCloseMenu]);

  const isActive = (session.status || 'active') === 'active';

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap" ref={menuRef}>
      <Link to={`/session/${session.id}`} className="btn btn-primary btn-sm">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        Open
      </Link>
      <div className="relative">
        <button
          type="button"
          className="btn btn-secondary btn-sm !px-2"
          aria-label="More actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] py-1 shadow-xl shadow-black/40"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-[var(--surface-hover)]"
              onClick={() => {
                onCloseMenu();
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              Edit
            </button>
            {isActive && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-300 hover:bg-[var(--surface-hover)]"
                onClick={() => {
                  onCloseMenu();
                  onComplete();
                }}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Complete
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-[var(--surface-hover)]"
              onClick={() => {
                onCloseMenu();
                onDuplicate();
              }}
            >
              <Copy className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              Duplicate
            </button>
            <div className="my-1 border-t border-[var(--border-subtle)]" />
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-950/40"
              onClick={() => {
                onCloseMenu();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sessions() {
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [message, setMessage] = useState(null);
  const [actionsMenuId, setActionsMenuId] = useState(null);
  const [newSessionSiteLabel, setNewSessionSiteLabel] = useState('');
  const [newSessionDate, setNewSessionDate] = useState(() =>
    new Date().toISOString().split('T')[0]
  );
  const [newSessionType, setNewSessionType] = useState('pm');
  const [newSessionCustomerId, setNewSessionCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [newNodeScope, setNewNodeScope] = useState('all');
  const [newNodeIds, setNewNodeIds] = useState([]);
  const [dupNodeScope, setDupNodeScope] = useState('all');
  const [dupNodeIds, setDupNodeIds] = useState([]);
  const [dupSessionName, setDupSessionName] = useState('');
  const [createSiteNotesCount, setCreateSiteNotesCount] = useState(0);
  const [createSiteNotesLoading, setCreateSiteNotesLoading] = useState(false);

  useEffect(() => {
    loadData();
    if (searchParams.get('action') === 'new') {
      setNewSessionSiteLabel('');
      setNewSessionDate(new Date().toISOString().split('T')[0]);
      setNewSessionType('pm');
      setNewSessionCustomerId('');
      setCustomerSearch('');
      setShowCustomerDropdown(false);
      setNewNodeScope('all');
      setNewNodeIds([]);
      setCreateSiteNotesCount(0);
      setShowNewModal(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!showNewModal || !newSessionCustomerId) {
      setCreateSiteNotesCount(0);
      setCreateSiteNotesLoading(false);
      return;
    }
    let cancelled = false;
    setCreateSiteNotesLoading(true);
    (async () => {
      try {
        const notes = await api.getCustomerNotes(newSessionCustomerId);
        if (!cancelled) setCreateSiteNotesCount(Array.isArray(notes) ? notes.length : 0);
      } catch {
        if (!cancelled) setCreateSiteNotesCount(0);
      } finally {
        if (!cancelled) setCreateSiteNotesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showNewModal, newSessionCustomerId]);

  const loadData = async () => {
    try {
      const [sessionsData, customersData] = await Promise.all([
        api.getSessions(),
        api.getCustomers(),
      ]);
      setSessions(sessionsData);
      setCustomers(customersData);
    } catch (error) {
      console.error('Error loading data:', error);
      showMessage('Error loading data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!newSessionCustomerId) {
      showMessage('Please select a customer', 'error');
      return;
    }
    if (newNodeScope === 'selected' && newNodeIds.length === 0) {
      showMessage('Select at least one node, or choose include all nodes', 'error');
      return;
    }
    const data = {
      customer_id: newSessionCustomerId,
      session_type: newSessionType,
      session_name: formatSessionNameWithLabel(
        newSessionSiteLabel,
        newSessionType,
        newSessionDate
      ),
      node_scope: newNodeScope,
      node_ids: newNodeScope === 'selected' ? newNodeIds : undefined,
    };

    try {
      const result = await api.createSession(data);
      if (result.success) {
        soundSystem.playSuccess();
        setShowNewModal(false);
        setNewSessionSiteLabel('');
        setNewSessionDate(new Date().toISOString().split('T')[0]);
        setNewSessionType('pm');
        setNewSessionCustomerId('');
        setCustomerSearch('');
        setNewNodeScope('all');
        setNewNodeIds([]);
        loadData();
        showMessage('PM Session created successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error creating session', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage(error?.message || 'Error creating session', 'error');
    }
  };

  const handleDeleteSession = async (sessionId) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!confirm(`Delete "${session.session_name}"? This will delete all associated data.`)) {
      return;
    }

    try {
      const result = await api.deleteSession(sessionId);
      if (result.success) {
        loadData();
        showMessage('Session deleted successfully', 'success');
      } else {
        showMessage(result.error || 'Error deleting session', 'error');
      }
    } catch (error) {
      showMessage('Error deleting session', 'error');
    }
  };

  const handleCompleteSession = async (sessionId) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!confirm(`Mark "${session.session_name}" as completed?`)) {
      return;
    }

    try {
      const result = await api.completeSession(sessionId);
      if (result.success) {
        loadData();
        showMessage('Session marked as completed', 'success');
      } else {
        showMessage(result.error || 'Error completing session', 'error');
      }
    } catch (error) {
      showMessage('Error completing session', 'error');
    }
  };

  const handleDuplicateSession = async (e) => {
    e.preventDefault();
    if (dupNodeScope === 'selected' && dupNodeIds.length === 0) {
      showMessage('Select at least one node, or include all from this session', 'error');
      return;
    }

    try {
      const result = await api.duplicateSession(selectedSession.id, {
        session_name: dupSessionName,
        node_scope: dupNodeScope,
        node_ids: dupNodeScope === 'selected' ? dupNodeIds : undefined,
      });
      if (result.success) {
        soundSystem.playSuccess();
        setShowDuplicateModal(false);
        setSelectedSession(null);
        setDupNodeScope('all');
        setDupNodeIds([]);
        loadData();
        showMessage('Session duplicated successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error duplicating session', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage(error?.message || 'Error duplicating session', 'error');
    }
  };

  const handleEditSession = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      const result = await api.updateSession(selectedSession.id, data);
      if (result.success) {
        soundSystem.playSuccess();
        setShowEditModal(false);
        setSelectedSession(null);
        loadData();
        showMessage('Session updated successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error updating session', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error updating session', 'error');
    }
  };

  const generateSessionName = () => {
    const date = new Date();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `PM-${month}/${day}/${year}`;
  };

  const generateDuplicateSessionName = (originalName) => {
    const date = new Date();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    
    // Remove any existing date pattern from the end of the name
    const nameWithoutDate = originalName.replace(/[-_]?\d{1,2}\/\d{1,2}\/\d{2,4}$/g, '');
    
    return `${nameWithoutDate.trim()}-${month}/${day}/${year}`;
  };

  const filteredSessions = sessions.filter((session) => {
    const matchesSearch =
      session.session_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.customer_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || (session.status || 'active') === statusFilter;
    const matchesCustomer =
      !customerFilter || session.customer_id.toString() === customerFilter;
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  if (loading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="spinner h-12 w-12" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">PM Sessions</h1>
          <p className="page-subtitle">Preventive maintenance and field visit sessions</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            onClick={() => {
              setNewSessionSiteLabel('');
              setNewSessionDate(new Date().toISOString().split('T')[0]);
              setNewSessionType('pm');
              setShowNewModal(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New PM session
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`alert ${
            message.type === 'success' ? 'alert-success' : message.type === 'error' ? 'alert-error' : 'alert-info'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card mb-6">
        <div className="card-body">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search sessions…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-select"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="form-select"
            >
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-xl font-semibold text-gray-100">Sessions List</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table-dark">
            <thead>
              <tr>
                <th>Session Name</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Cabinets</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-400">
                    No PM sessions found. Create your first session to get started.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <div className="font-medium text-gray-200">{session.session_name}</div>
                      <SessionMetaTags session={session} />
                    </td>
                    <td>
                      <Link
                        to={`/customer/${session.customer_id}`}
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        {session.customer_name}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          session.status === 'completed' ? 'badge-green' : 'badge-blue'
                        }`}
                      >
                        {(session.status || 'ACTIVE').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const total     = session.cabinet_count || 0;
                        const done      = session.completed_cabinet_count || 0;
                        const completed = session.status === 'completed';
                        if (total === 0) {
                          return (
                            <div className="min-w-[90px]">
                              <div className="flex justify-between text-xs text-gray-400 mb-1">
                                <span>0 / 0</span>
                                <span className={completed ? 'text-green-400' : 'text-gray-500'}>{completed ? '100%' : '—'}</span>
                              </div>
                              <div className="w-full bg-[var(--surface-inset)] rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${completed ? 'bg-emerald-500 w-full' : 'w-0'}`} />
                              </div>
                            </div>
                          );
                        }
                        const pct     = Math.round((done / total) * 100);
                        const allDone = done === total;
                        return (
                          <div className="min-w-[90px]">
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                              <span>{done} / {total}</span>
                              <span className={allDone ? 'text-green-400' : ''}>{pct}%</span>
                            </div>
                            <div className="w-full bg-[var(--surface-inset)] rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${allDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td>{new Date(session.created_at).toLocaleDateString()}</td>
                    <td>
                      <SessionRowActions
                        session={session}
                        menuOpen={actionsMenuId === session.id}
                        onToggleMenu={() =>
                          setActionsMenuId((id) => (id === session.id ? null : session.id))
                        }
                        onCloseMenu={() => setActionsMenuId(null)}
                        onEdit={() => {
                          setSelectedSession(session);
                          setShowEditModal(true);
                        }}
                        onDuplicate={() => {
                          setSelectedSession(session);
                          setDupSessionName(defaultDuplicateSessionName(session.session_name));
                          setDupNodeScope('all');
                          setDupNodeIds([]);
                          setShowDuplicateModal(true);
                        }}
                        onComplete={() => handleCompleteSession(session.id)}
                        onDelete={() => handleDeleteSession(session.id)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNewModal && (
        <div className="modal-backdrop">
          <div className="modal-panel max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="modal-panel-header">
              <h3 className="text-lg font-semibold text-gray-100">New PM session</h3>
              <button
                type="button"
                onClick={() => {
                  setShowNewModal(false);
                  setNewSessionCustomerId('');
                  setCustomerSearch('');
                  setShowCustomerDropdown(false);
                  setNewNodeScope('all');
                  setNewNodeIds([]);
                }}
                className="btn-icon"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSession}>
              <div className="modal-panel-body space-y-4">
                <div className="relative">
                  <label className="form-label">Customer *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search customers…"
                    value={customerSearch}
                    autoComplete="off"
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setNewSessionCustomerId('');
                      setNewNodeScope('all');
                      setNewNodeIds([]);
                      setShowCustomerDropdown(true);
                    }}
                  />
                  {newSessionCustomerId && (
                    <div className="mt-1 text-xs text-emerald-400">
                      Selected: {customers.find((c) => String(c.id) === String(newSessionCustomerId))?.name}
                    </div>
                  )}
                  {newSessionCustomerId && !createSiteNotesLoading && createSiteNotesCount > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-600/50 bg-amber-950/40 px-3 py-2.5 text-sm text-amber-100">
                      <p className="font-medium text-amber-200">Please check site notes before beginning PM</p>
                      <p className="mt-1 text-xs text-amber-100/80">
                        This customer has {createSiteNotesCount} site note
                        {createSiteNotesCount !== 1 ? 's' : ''} (access, hazards, contacts, etc.).
                      </p>
                      <Link
                        to={`/customer/${newSessionCustomerId}?tab=notes`}
                        className="mt-2 inline-flex text-xs font-medium text-amber-300 underline hover:text-amber-200"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open site notes
                      </Link>
                    </div>
                  )}
                  {showCustomerDropdown && (
                    <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] shadow-xl">
                      {customers
                        .filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full px-4 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-blue-600 hover:text-white"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNewSessionCustomerId(String(c.id));
                              setCustomerSearch(c.name);
                              setNewNodeScope('all');
                              setNewNodeIds([]);
                              setShowCustomerDropdown(false);
                            }}
                          >
                            {c.name}
                          </button>
                        ))}
                      {customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase())).length ===
                        0 && <div className="px-4 py-3 text-sm text-gray-400">No customers found</div>}
                    </div>
                  )}
                </div>
                <div>
                  <label className="form-label">Session Type *</label>
                  <select
                    className="form-select"
                    value={newSessionType}
                    onChange={(e) => setNewSessionType(e.target.value)}
                  >
                    <option value="pm">PM - Preventive Maintenance</option>
                    <option value="ii">I&amp;I - Installation &amp; Integration</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Site / session label</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Sherwood — Area 1"
                    value={newSessionSiteLabel}
                    onChange={(e) => setNewSessionSiteLabel(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    For split sites, put the area in the label (e.g. Area 1) so you can tell sessions apart by name.
                  </p>
                </div>
                <div>
                  <label className="form-label">Session Date *</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={newSessionDate}
                    onChange={(e) => setNewSessionDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Full session name (preview)</label>
                  <input
                    type="text"
                    readOnly
                    value={formatSessionNameWithLabel(
                      newSessionSiteLabel,
                      newSessionType,
                      newSessionDate
                    )}
                    className="form-input cursor-default bg-[var(--surface-hover)] text-gray-200"
                  />
                </div>
                <SessionNodeScopePicker
                  customerId={newSessionCustomerId || null}
                  mode={newNodeScope}
                  onModeChange={setNewNodeScope}
                  selectedIds={newNodeIds}
                  onSelectedIdsChange={setNewNodeIds}
                />
              </div>
              <div className="modal-panel-footer">
                <button type="button" onClick={() => setShowNewModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDuplicateModal && selectedSession && (
        <div className="modal-backdrop">
          <div className="modal-panel max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="modal-panel-header">
              <h3 className="text-lg font-semibold text-gray-100">Duplicate session</h3>
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setSelectedSession(null);
                  setDupNodeScope('all');
                  setDupNodeIds([]);
                }}
                className="btn-icon"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleDuplicateSession}>
              <div className="modal-panel-body space-y-4">
                <div>
                  <label className="form-label">New session name</label>
                  <input
                    type="text"
                    required
                    value={dupSessionName}
                    onChange={(e) => setDupSessionName(e.target.value)}
                    className="form-input"
                  />
                </div>
                <SessionNodeScopePicker
                  customerId={selectedSession.customer_id}
                  sessionId={selectedSession.id}
                  mode={dupNodeScope}
                  onModeChange={setDupNodeScope}
                  selectedIds={dupNodeIds}
                  onSelectedIdsChange={setDupNodeIds}
                  allLabel="Include all nodes from this session"
                  selectedLabel="Include only specific ones from this session"
                  hint="“All” keeps the same node set as the source (including a prior custom scope). Checklist answers still clear."
                />
                <div className="rounded-lg border border-blue-500/40 bg-blue-950/30 p-4">
                  <h4 className="mb-2 text-sm font-medium text-blue-300">What will be duplicated</h4>
                  <ul className="space-y-1 text-sm text-blue-200">
                    <li>Session structure and cabinet locations</li>
                    <li>Number and types of components</li>
                    <li>Form fields reset to default</li>
                    <li>Node checklist answers cleared</li>
                  </ul>
                </div>
              </div>
              <div className="modal-panel-footer">
                <button
                  type="button"
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setSelectedSession(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  Create duplicate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && selectedSession && (
        <div className="modal-backdrop">
          <div className="modal-panel max-w-md w-full mx-4">
            <div className="modal-panel-header">
              <h3 className="text-lg font-semibold text-gray-100">Edit PM session</h3>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedSession(null);
                }}
                className="btn-icon"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleEditSession}>
              <div className="modal-panel-body space-y-4">
                <div>
                  <label className="form-label">Session name *</label>
                  <input
                    type="text"
                    name="session_name"
                    required
                    defaultValue={selectedSession.session_name}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select name="status" defaultValue={selectedSession.status || 'active'} className="form-select">
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="modal-panel-footer">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedSession(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
