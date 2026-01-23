import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showEditSessionModal, setShowEditSessionModal] = useState(false);
  const [editingSession, setEditingSession] = useState(null);

  useEffect(() => {
    loadCustomerData();
  }, [id]);

  const loadCustomerData = async () => {
    try {
      const [customerData, allSessions] = await Promise.all([
        api.getCustomer(id),
        api.getSessions(),
      ]);
      setCustomer(customerData);
      setSessions(allSessions.filter(s => s.customer_id.toString() === id));
    } catch (error) {
      console.error('Error loading customer:', error);
      showMessage('Error loading customer data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      const result = await api.updateCustomer(id, data);
      if (result.success) {
        setShowEditModal(false);
        loadCustomerData();
        showMessage('Customer updated successfully', 'success');
      } else {
        showMessage(result.error || 'Error updating customer', 'error');
      }
    } catch (error) {
      showMessage('Error updating customer', 'error');
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      ...Object.fromEntries(formData),
      customer_id: id,
    };

    console.log('Creating session with data:', data);

    try {
      const result = await api.createSession(data);
      console.log('Session creation result:', result);
      if (result.success) {
        soundSystem.playSuccess();
        setShowNewSessionModal(false);
        loadCustomerData();
        showMessage(`${data.session_type?.toUpperCase() || 'Session'} created successfully`, 'success');
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

  const activeSessions = sessions.filter(s => s.status !== 'completed');
  const completedSessions = sessions.filter(s => s.status === 'completed');

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner h-12 w-12"></div>
        </div>
      </Layout>
    );
  }

  if (!customer) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-400">Customer not found</p>
          <Link to="/customers" className="btn btn-primary mt-4">
            Back to Customers
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-gray-400">
        <Link to="/customers" className="hover:text-gray-200">Customers</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-200">{customer.name}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-8 animate-fadeIn">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">{customer.name}</h1>
          {customer.location && (
            <p className="text-gray-400 text-lg">📍 {customer.location}</p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowEditModal(true)}
            className="btn btn-secondary"
          >
            ⚙️ Edit Customer
          </button>
          <button
            onClick={() => navigate('/customers')}
            className="btn btn-secondary"
          >
            ← Back
          </button>
        </div>
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

      {/* Customer Info & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Customer Info Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-100">ℹ️ Customer Information</h3>
          </div>
          <div className="card-body space-y-3">
            {customer.contact_person && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Contact Person</div>
                <div className="text-gray-200">{customer.contact_person}</div>
              </div>
            )}
            {customer.email && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Email</div>
                <div className="text-gray-200">{customer.email}</div>
              </div>
            )}
            {customer.phone && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Phone</div>
                <div className="text-gray-200">{customer.phone}</div>
              </div>
            )}
            {customer.address && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Address</div>
                <div className="text-gray-200">{customer.address}</div>
              </div>
            )}
            {customer.contact_info && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Additional Info</div>
                <div className="text-gray-200 text-sm">{customer.contact_info}</div>
              </div>
            )}
            {(customer.system_username || customer.system_password) && (
              <div className="pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-500 uppercase mb-2">🔐 System Credentials</div>
                {customer.system_username && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-400">Username</div>
                    <div className="text-gray-200 font-mono text-sm">{customer.system_username}</div>
                  </div>
                )}
                {customer.system_password && (
                  <div>
                    <div className="text-xs text-gray-400">Password</div>
                    <div className="text-gray-200 font-mono text-sm">{'•'.repeat(8)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-100">📊 Statistics</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center bg-gray-700/50 rounded-lg p-4">
                <div className="text-3xl font-bold text-blue-400">{sessions.length}</div>
                <div className="text-xs text-gray-400">Total Sessions</div>
              </div>
              <div className="text-center bg-gray-700/50 rounded-lg p-4">
                <div className="text-3xl font-bold text-green-400">{activeSessions.length}</div>
                <div className="text-xs text-gray-400">Active Sessions</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-100">⚡ Quick Actions</h3>
          </div>
          <div className="card-body space-y-2">
            <button
              onClick={() => setShowNewSessionModal(true)}
              className="btn btn-primary w-full"
            >
              ➕ New PM Session
            </button>
            <button
              onClick={() => navigate(`/nodes/${customer.id}`)}
              className="btn btn-success w-full"
            >
              📤 Import Nodes
            </button>
            <button
              onClick={() => navigate(`/nodes/${customer.id}`)}
              className="btn btn-secondary w-full"
            >
              👁️ View Nodes
            </button>
            <button
              onClick={() => {
                // Set the modal to I&I type
                setShowNewSessionModal(true);
              }}
              className="btn btn-warning w-full text-lg font-bold border-2 border-yellow-400"
            >
              🔧 New I&I Session
            </button>
          </div>
        </div>
      </div>

      {/* Sessions Tabs */}
      <div className="card">
        <div className="card-header">
          <div className="flex gap-4 border-b border-gray-700">
            <button
              onClick={() => setActiveTab('active')}
              className={`pb-2 px-4 font-medium transition-colors ${
                activeTab === 'active'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Active Sessions ({activeSessions.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`pb-2 px-4 font-medium transition-colors ${
                activeTab === 'completed'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Completed Sessions ({completedSessions.length})
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-dark">
            <thead>
              <tr>
                <th>Session Name</th>
                <th>Type</th>
                <th>Created</th>
                {activeTab === 'completed' && <th>Completed</th>}
                <th>Cabinets</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(activeTab === 'active' ? activeSessions : completedSessions).length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'completed' ? 6 : 5} className="text-center py-12 text-gray-400">
                    No {activeTab} sessions found.
                  </td>
                </tr>
              ) : (
                (activeTab === 'active' ? activeSessions : completedSessions).map((session) => (
                  <tr key={session.id}>
                    <td className="font-medium text-gray-200">{session.session_name}</td>
                    <td>
                      <span className="badge badge-blue">
                        {(session.session_type || 'PM').toUpperCase()}
                      </span>
                    </td>
                    <td>{new Date(session.created_at).toLocaleDateString()}</td>
                    {activeTab === 'completed' && (
                      <td>{session.completed_at ? new Date(session.completed_at).toLocaleDateString() : 'N/A'}</td>
                    )}
                    <td>{session.cabinet_count || 0} cabinets</td>
                    <td>
                      <div className="flex gap-2 flex-wrap">
                        <Link
                          to={`/session/${session.id}`}
                          className="text-blue-400 hover:text-blue-300 font-medium"
                        >
                          Open
                        </Link>
                        <button
                          onClick={() => {
                            setEditingSession(session);
                            setShowEditSessionModal(true);
                          }}
                          className="text-gray-400 hover:text-gray-300 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Duplicate "${session.session_name}"?`)) return;
                            try {
                              const newSessionData = {
                                customer_id: session.customer_id,
                                session_name: `${session.session_name} (Copy)`,
                                session_type: session.session_type || 'pm',
                              };
                              const result = await api.createSession(newSessionData);
                              if (result.success) {
                                soundSystem.playSuccess();
                                loadCustomerData();
                                showMessage('Session duplicated successfully', 'success');
                              } else {
                                soundSystem.playError();
                                showMessage('Error duplicating session', 'error');
                              }
                            } catch (error) {
                              soundSystem.playError();
                              showMessage('Error duplicating session', 'error');
                            }
                          }}
                          className="text-yellow-400 hover:text-yellow-300 font-bold text-lg"
                          title="Duplicate Session"
                        >
                          📋
                        </button>
                        {activeTab === 'active' && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Mark "${session.session_name}" as completed?`)) return;
                              try {
                                const result = await api.completeSession(session.id);
                                if (result.success) {
                                  soundSystem.playSuccess();
                                  loadCustomerData();
                                  showMessage('Session completed', 'success');
                                } else {
                                  soundSystem.playError();
                                  showMessage('Error completing session', 'error');
                                }
                              } catch (error) {
                                soundSystem.playError();
                                showMessage('Error completing session', 'error');
                              }
                            }}
                            className="text-green-400 hover:text-green-300 font-medium"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Customer Modal */}
      {showEditModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Edit Customer</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleUpdateCustomer}>
              <div className="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
                <div>
                  <label className="form-label">Customer Name *</label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={customer.name}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    name="location"
                    defaultValue={customer.location}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Contact Info</label>
                  <textarea
                    name="contact_info"
                    rows="3"
                    defaultValue={customer.contact_info}
                    className="form-textarea"
                  ></textarea>
                </div>
                <div>
                  <label className="form-label">Contact Person</label>
                  <input
                    type="text"
                    name="contact_person"
                    defaultValue={customer.contact_person}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={customer.email}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={customer.phone}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Address</label>
                  <textarea
                    name="address"
                    rows="2"
                    defaultValue={customer.address}
                    className="form-textarea"
                  ></textarea>
                </div>

                {/* System Credentials Section */}
                <div className="pt-4 border-t border-gray-600">
                  <h4 className="text-gray-300 font-medium mb-3">🔐 System Login Credentials</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="form-label">System Username</label>
                      <input
                        type="text"
                        name="system_username"
                        defaultValue={customer.system_username}
                        className="form-input"
                        placeholder="e.g., admin, operator"
                      />
                      <p className="text-xs text-gray-400 mt-1">Username for accessing customer's DeltaV system</p>
                    </div>
                    <div>
                      <label className="form-label">System Password</label>
                      <input
                        type="password"
                        name="system_password"
                        defaultValue={customer.system_password}
                        className="form-input"
                        placeholder="Enter system password"
                      />
                      <p className="text-xs text-gray-400 mt-1">Password for accessing customer's DeltaV system</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Session Modal */}
      {showNewSessionModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Create New Session</h3>
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateSession}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Session Type *</label>
                  <select
                    name="session_type"
                    required
                    defaultValue="pm"
                    className="form-select"
                  >
                    <option value="pm">PM - Preventive Maintenance</option>
                    <option value="ii">I&I - Installation & Integration</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Session Date *</label>
                  <input
                    type="date"
                    name="session_date"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Session Name *</label>
                  <input
                    type="text"
                    name="session_name"
                    required
                    placeholder="e.g., PM-1/22/2026 or I&I-Building A"
                    className="form-input"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewSessionModal(false)}
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

      {/* Edit Session Modal */}
      {showEditSessionModal && editingSession && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Edit Session</h3>
              <button
                onClick={() => {
                  setShowEditSessionModal(false);
                  setEditingSession(null);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);

                try {
                  const result = await api.updateSession(editingSession.id, data);
                  if (result.success) {
                    soundSystem.playSuccess();
                    setShowEditSessionModal(false);
                    setEditingSession(null);
                    loadCustomerData();
                    showMessage('Session updated successfully', 'success');
                  } else {
                    soundSystem.playError();
                    showMessage(result.error || 'Error updating session', 'error');
                  }
                } catch (error) {
                  soundSystem.playError();
                  showMessage('Error updating session', 'error');
                }
              }}
            >
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Session Name *</label>
                  <input
                    type="text"
                    name="session_name"
                    required
                    defaultValue={editingSession.session_name}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select
                    name="status"
                    defaultValue={editingSession.status || 'active'}
                    className="form-select"
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-between">
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete "${editingSession.session_name}" and all associated data?`)) return;
                    try {
                      const result = await api.deleteSession(editingSession.id);
                      if (result.success) {
                        soundSystem.playSuccess();
                        setShowEditSessionModal(false);
                        setEditingSession(null);
                        loadCustomerData();
                        showMessage('Session deleted successfully', 'success');
                      } else {
                        soundSystem.playError();
                        showMessage('Error deleting session', 'error');
                      }
                    } catch (error) {
                      soundSystem.playError();
                      showMessage('Error deleting session', 'error');
                    }
                  }}
                  className="btn btn-danger"
                >
                  Delete
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditSessionModal(false);
                      setEditingSession(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
