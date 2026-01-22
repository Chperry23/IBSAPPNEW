import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

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

  useEffect(() => {
    loadData();
    // Check if we should open new session modal
    if (searchParams.get('action') === 'new') {
      setShowNewModal(true);
    }
  }, [searchParams]);

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
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      const result = await api.createSession(data);
      if (result.success) {
        soundSystem.playSuccess();
        setShowNewModal(false);
        loadData();
        showMessage('PM Session created successfully', 'success');
        e.target.reset();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error creating session', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error creating session', 'error');
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
    const formData = new FormData(e.target);
    const newName = formData.get('session_name');

    try {
      const result = await api.duplicateSession(selectedSession.id, newName);
      if (result.success) {
        soundSystem.playSuccess();
        setShowDuplicateModal(false);
        setSelectedSession(null);
        loadData();
        showMessage('Session duplicated successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error duplicating session', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error duplicating session', 'error');
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
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex justify-between items-center mb-8 animate-fadeIn">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">📋 PM Sessions</h1>
          <p className="text-gray-400">Manage preventative maintenance sessions</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="btn btn-primary"
        >
          ➕ New PM Session
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-900/50 text-green-200 border border-green-500'
              : message.type === 'error'
              ? 'bg-red-900/50 text-red-200 border border-red-500'
              : 'bg-blue-900/50 text-blue-200 border border-blue-500'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="form-input"
            >
              <option value="">All Customers</option>
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
                    </td>
                    <td>{session.customer_name}</td>
                    <td>
                      <span
                        className={`badge ${
                          session.status === 'completed' ? 'badge-green' : 'badge-blue'
                        }`}
                      >
                        {(session.status || 'ACTIVE').toUpperCase()}
                      </span>
                    </td>
                    <td>{session.cabinet_count || 0} cabinets</td>
                    <td>{new Date(session.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-3">
                        <Link
                          to={`/session/${session.id}`}
                          className="text-blue-400 hover:text-blue-300 font-medium"
                        >
                          Open
                        </Link>
                        <button
                          onClick={() => {
                            setSelectedSession(session);
                            setShowEditModal(true);
                          }}
                          className="text-blue-400 hover:text-blue-300 font-medium"
                        >
                          Edit
                        </button>
                        {session.status === 'active' && (
                          <button
                            onClick={() => handleCompleteSession(session.id)}
                            className="text-green-400 hover:text-green-300 font-medium"
                          >
                            Complete
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedSession(session);
                            setShowDuplicateModal(true);
                          }}
                          className="text-gray-400 hover:text-gray-300 font-medium"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session.id)}
                          className="text-red-400 hover:text-red-300 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Session Modal */}
      {showNewModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">New PM Session</h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateSession}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Customer *</label>
                  <select name="customer_id" required className="form-input">
                    <option value="">Select a customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Session Date *</label>
                  <input
                    type="date"
                    name="session_date"
                    required
                    className="form-input"
                    defaultValue={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <label className="form-label">Session Name (Auto-generated)</label>
                  <input
                    type="text"
                    name="session_name"
                    value={generateSessionName()}
                    readOnly
                    className="form-input bg-gray-100"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Duplicate Session Modal */}
      {showDuplicateModal && selectedSession && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Duplicate Session</h3>
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setSelectedSession(null);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleDuplicateSession}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">New Session Name</label>
                  <input
                    type="text"
                    name="session_name"
                    required
                    defaultValue={generateSessionName()}
                    className="form-input"
                  />
                </div>
                <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-300 mb-2">
                    What will be duplicated:
                  </h4>
                  <ul className="text-sm text-blue-200 space-y-1">
                    <li>• Session structure and cabinet locations</li>
                    <li>• Number and types of components</li>
                    <li>• All form fields will be reset to default</li>
                  </ul>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
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
                  Create Duplicate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Session Modal */}
      {showEditModal && selectedSession && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Edit PM Session</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedSession(null);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleEditSession}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Session Name *</label>
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
                  <select
                    name="status"
                    defaultValue={selectedSession.status || 'active'}
                    className="form-select"
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
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
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
