import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Upload, Pencil, Trash2, MapPin, X, LayoutGrid, List } from 'lucide-react';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';
import { useSettings } from '../contexts/SettingsContext';

export default function Customers() {
  const { customersView, setCustomersView } = useSettings();
  const [customers, setCustomers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('activity');
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const [customersData, sessionsData] = await Promise.all([
        api.getCustomers(),
        api.getSessions(),
      ]);
      setCustomers(customersData);
      setSessions(sessionsData);
    } catch (error) {
      console.error('Error loading customers:', error);
      showMessage('Error loading customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Calculate session counts and most recent session for each customer
  const getCustomerStats = (customerId) => {
    const customerSessions = sessions.filter(s => s.customer_id === customerId);
    const sorted = [...customerSessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const last = sorted[0] || null;
    return {
      totalSessions: customerSessions.length,
      activeSessions: customerSessions.filter(s => s.status !== 'completed').length,
      lastSession: last,
      lastSessionDate: last ? new Date(last.created_at) : null,
    };
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      const result = editingCustomer
        ? await api.updateCustomer(editingCustomer.id, data)
        : await api.createCustomer(data);

      if (result.success) {
        soundSystem.playSuccess();
        setShowModal(false);
        setEditingCustomer(null);
        loadCustomers();
        showMessage(
          editingCustomer ? 'Customer updated successfully' : 'Customer created successfully',
          'success'
        );
        e.target.reset();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error saving customer', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error saving customer', 'error');
    }
  };

  const handleDelete = async (customerId) => {
    const customer = customers.find((c) => c.id === customerId);
    const stats = getCustomerStats(customerId);
    
    const warningMessage = stats.totalSessions > 0
      ? `⚠️ WARNING: This will permanently delete "${customer.name}" and ALL ${stats.totalSessions} associated PM sessions and cabinet data.\n\nThis action cannot be undone. Are you absolutely sure?`
      : `Delete customer "${customer.name}"?`;
    
    if (!confirm(warningMessage)) {
      return;
    }

    try {
      const result = await api.deleteCustomer(customerId);
      if (result.success) {
        soundSystem.playSuccess();
        loadCustomers();
        showMessage('Customer deleted successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error deleting customer', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error deleting customer', 'error');
    }
  };
  
  const navigate = useNavigate();

  // Filter and sort customers
  const filteredCustomers = customers
    .filter((customer) => {
      const search = searchTerm.toLowerCase();
      return (
        customer.name.toLowerCase().includes(search) ||
        (customer.alias && customer.alias.toLowerCase().includes(search)) ||
        (customer.location && customer.location.toLowerCase().includes(search)) ||
        (customer.contact_info && customer.contact_info.toLowerCase().includes(search)) ||
        (customer.contact_person && customer.contact_person.toLowerCase().includes(search)) ||
        (customer.email && customer.email.toLowerCase().includes(search)) ||
        (customer.phone && customer.phone.toLowerCase().includes(search)) ||
        (customer.dongle_id && customer.dongle_id.toLowerCase().includes(search)) ||
        (customer.company_name && customer.company_name.toLowerCase().includes(search)) ||
        (customer.city && customer.city.toLowerCase().includes(search)) ||
        (customer.state && customer.state.toLowerCase().includes(search))
      );
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'location') return (a.location || '').localeCompare(b.location || '');
      if (sortBy === 'sessions') return getCustomerStats(b.id).totalSessions - getCustomerStats(a.id).totalSessions;
      if (sortBy === 'created') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'activity') {
        const sa = getCustomerStats(a.id);
        const sb = getCustomerStats(b.id);
        const aHas = sa.totalSessions > 0;
        const bHas = sb.totalSessions > 0;
        // Customers with sessions first; within each group sort by most recent session date
        if (aHas !== bHas) return aHas ? -1 : 1;
        if (aHas && bHas) return (sb.lastSessionDate || 0) - (sa.lastSessionDate || 0);
        return a.name.localeCompare(b.name);
      }
      return 0;
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
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Customer database and PM session access</p>
        </div>
        <div className="page-actions">
          <div className="inline-flex rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset)] p-0.5">
            <button
              type="button"
              onClick={() => setCustomersView('cards')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all min-h-9 ${
                customersView === 'cards'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Card view"
              aria-pressed={customersView === 'cards'}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setCustomersView('list')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all min-h-9 ${
                customersView === 'list'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              title="List view"
              aria-pressed={customersView === 'list'}
            >
              <List className="h-4 w-4" aria-hidden />
              List
            </button>
          </div>
          <button type="button" onClick={() => setShowBulkImportModal(true)} className="btn btn-secondary">
            <Upload className="h-4 w-4" aria-hidden />
            Bulk import
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingCustomer(null);
              setShowModal(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add customer
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <div className="toolbar">
            <div className="toolbar-filters flex-1">
              <input
                type="text"
                placeholder="Search by name, alias, location, contact…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input max-w-xl"
              />
              <button type="button" onClick={() => setSearchTerm('')} className="btn btn-secondary btn-sm">
                Clear
              </button>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="form-select max-w-xs">
                <option value="activity">Sort by PM activity</option>
                <option value="name">Sort by name</option>
                <option value="location">Sort by location</option>
                <option value="sessions">Sort by session count</option>
                <option value="created">Sort by created date</option>
              </select>
            </div>
          </div>
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

      {/* Customers Grid / List */}
      {filteredCustomers.length === 0 ? (
        <div className="card">
          <div className="card-body py-12 text-center text-gray-400">
            {searchTerm ? 'No customers match your search.' : 'No customers yet. Add your first customer to get started.'}
          </div>
        </div>
      ) : customersView === 'list' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-dark">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Location</th>
                  <th>Contact</th>
                  <th>Sessions</th>
                  <th>Last PM</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => {
                  const stats = getCustomerStats(customer.id);
                  const keyName = customer.dongle_id || null;
                  const friendlyName = customer.name;
                  return (
                    <tr
                      key={customer.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/customer/${customer.id}`)}
                    >
                      <td>
                        <div className="font-medium text-gray-100">{keyName || friendlyName}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {keyName && <span className="badge badge-blue">{friendlyName}</span>}
                          {customer.alias && <span className="badge badge-gray">{customer.alias}</span>}
                        </div>
                      </td>
                      <td className="max-w-[14rem] truncate text-gray-400">
                        {customer.location || '—'}
                      </td>
                      <td className="text-gray-400">
                        {customer.contact_person || customer.email || '—'}
                      </td>
                      <td>
                        <span className={`badge ${stats.totalSessions > 0 ? 'badge-green' : 'badge-gray'}`}>
                          {stats.totalSessions} total · {stats.activeSessions} active
                        </span>
                      </td>
                      <td className="text-gray-400 whitespace-nowrap">
                        {stats.lastSession
                          ? new Date(stats.lastSession.created_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <Link to={`/customer/${customer.id}`} className="btn btn-primary btn-sm">
                            Open
                          </Link>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            title="Edit"
                            onClick={() => {
                              setEditingCustomer(customer);
                              setShowModal(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            title="Delete"
                            onClick={() => handleDelete(customer.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.map((customer) => {
            const stats = getCustomerStats(customer.id);
            const hasSessions = stats.totalSessions > 0;
            // When dongle_id is the key, name is the friendly/display name
            const keyName      = customer.dongle_id || null;
            const friendlyName = customer.name;
            return (
              <div
                key={customer.id}
                className={`card hover:border-blue-500/50 transition-all cursor-pointer ${
                  !hasSessions ? 'opacity-75' : ''
                }`}
                onClick={() => navigate(`/customer/${customer.id}`)}
              >
                <div className="card-header">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-100 leading-tight">
                      {keyName || friendlyName}
                    </h3>
                    {/* PM activity indicator */}
                    {hasSessions ? (
                      <span className="badge badge-green shrink-0 whitespace-nowrap">
                        {stats.totalSessions} PM{stats.totalSessions !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="badge badge-gray shrink-0 whitespace-nowrap">No PMs</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {keyName && <span className="badge badge-blue">{friendlyName}</span>}
                    {customer.alias && <span className="badge badge-blue">{customer.alias}</span>}
                  </div>
                </div>
                <div className="card-body">
                  <div className="mb-4 space-y-1.5 text-sm">
                    {customer.location && (
                      <p className="flex items-start gap-1.5 text-gray-400">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                        {customer.location}
                      </p>
                    )}
                    {customer.company_name && (
                      <p className="text-gray-400">
                        <span className="text-gray-500">Company:</span> {customer.company_name}
                      </p>
                    )}
                    {customer.contact_person && (
                      <p className="text-gray-400">
                        <span className="text-gray-500">Contact:</span> {customer.contact_person}
                      </p>
                    )}
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3">
                    <div className="rounded-lg bg-[var(--surface-inset)] p-2.5 text-center">
                      <div className="text-2xl font-bold text-white">{stats.totalSessions}</div>
                      <div className="text-xs text-gray-500">Sessions</div>
                    </div>
                    <div className="rounded-lg bg-[var(--surface-inset)] p-2.5 text-center">
                      <div className="text-2xl font-bold text-white">{stats.activeSessions}</div>
                      <div className="text-xs text-gray-500">Active</div>
                    </div>
                  </div>

                  {stats.lastSession ? (
                    <div className="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)]/60 px-3 py-2 text-xs text-gray-400">
                      <span className="text-gray-500">Last PM: </span>
                      <span className="font-medium text-gray-300">{stats.lastSession.session_name}</span>
                      <span className="ml-1 text-gray-500">
                        · {new Date(stats.lastSession.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ) : (
                    <div className="mb-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-center text-xs text-gray-500">
                      No PM sessions yet
                    </div>
                  )}

                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Link to={`/customer/${customer.id}`} className="btn btn-primary btn-sm flex-1">
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCustomer(customer);
                        setShowModal(true);
                      }}
                      className="btn btn-secondary btn-sm"
                      title="Edit customer"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(customer.id);
                      }}
                      className="btn btn-danger btn-sm"
                      title="Delete customer"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      )}

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-panel max-w-md w-full mx-4">
            <div className="modal-panel-header">
              <h3 className="text-lg font-semibold text-gray-100">
                {editingCustomer ? 'Edit customer' : 'New customer'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditingCustomer(null);
                }}
                className="btn-icon"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-panel-body space-y-4">
                <div>
                  <label className="form-label">Customer Name *</label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={editingCustomer?.name}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Alias</label>
                  <input
                    type="text"
                    name="alias"
                    defaultValue={editingCustomer?.alias}
                    className="form-input"
                    placeholder="Short name for search and cards"
                  />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    name="location"
                    defaultValue={editingCustomer?.location}
                    placeholder="e.g., Manufacturing Plant - Chicago"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Contact Info</label>
                  <textarea
                    name="contact_info"
                    rows="3"
                    defaultValue={editingCustomer?.contact_info}
                    placeholder="General contact information..."
                    className="form-textarea"
                  ></textarea>
                </div>
                <div>
                  <label className="form-label">Contact Person</label>
                  <input
                    type="text"
                    name="contact_person"
                    defaultValue={editingCustomer?.contact_person}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editingCustomer?.email}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={editingCustomer?.phone}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Address</label>
                  <textarea
                    name="address"
                    rows="2"
                    defaultValue={editingCustomer?.address}
                    placeholder="Full address..."
                    className="form-textarea"
                  ></textarea>
                </div>
              </div>
              <div className="modal-panel-footer">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCustomer(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingCustomer ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkImportModal && (
        <div className="modal-backdrop">
          <div className="modal-panel max-w-2xl w-full mx-4">
            <div className="modal-panel-header">
              <h3 className="text-lg font-semibold text-gray-100">Bulk import customers</h3>
              <button
                type="button"
                onClick={() => setShowBulkImportModal(false)}
                className="btn-icon"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const csvData = e.target.csv_data.value;

                const lines = csvData.split('\n').filter((l) => l.trim());
                if (lines.length < 2) {
                  showMessage('CSV must have header and at least one row', 'error');
                  return;
                }

                const customers = lines
                  .slice(1)
                  .map((line) => {
                    const [name, location, contact_info] = line.split(',').map((v) => v.trim());
                    return { name, location: location || '', contact_info: contact_info || '' };
                  })
                  .filter((c) => c.name);

                try {
                  soundSystem.playSuccess();
                  showMessage(`Importing ${customers.length} customers...`, 'info');

                  let successCount = 0;
                  for (const customer of customers) {
                    const result = await api.createCustomer(customer);
                    if (result.success) successCount++;
                  }

                  setShowBulkImportModal(false);
                  loadCustomers();
                  soundSystem.playSuccess();
                  showMessage(`Successfully imported ${successCount} customers`, 'success');
                } catch (error) {
                  soundSystem.playError();
                  showMessage('Error importing customers', 'error');
                }
              }}
            >
              <div className="modal-panel-body space-y-4">
                <div>
                  <label className="form-label">CSV data</label>
                  <textarea
                    name="csv_data"
                    rows="12"
                    placeholder="Name,Location,Contact Info&#10;Company A,Building 1,John Doe - 555-1234&#10;Company B,Building 2,Jane Smith - 555-5678&#10;..."
                    className="form-textarea font-mono text-sm"
                  ></textarea>
                  <p className="mt-2 text-sm text-gray-400">
                    Format: Name,Location,Contact Info (one per line, header required)
                  </p>
                </div>
              </div>
              <div className="modal-panel-footer">
                <button type="button" onClick={() => setShowBulkImportModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Upload className="h-4 w-4" aria-hidden />
                  Import customers
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
