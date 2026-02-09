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
  const [showSystemRegModal, setShowSystemRegModal] = useState(false);
  const [systemRegSummary, setSystemRegSummary] = useState(null);

  useEffect(() => {
    loadCustomerData();
    loadSystemRegSummary();
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

  const loadSystemRegSummary = async () => {
    try {
      console.log('🔍 Loading system registry summary for customer:', id);
      const response = await api.request(`/api/customers/${id}/system-registry/summary`);
      console.log('✅ System registry summary loaded:', response);
      setSystemRegSummary(response);
    } catch (error) {
      console.error('❌ Error loading system registry summary:', error);
    }
  };

  const handleSystemRegImport = async (e) => {
    e.preventDefault();
    
    const fileInput = e.target.xml_file.files[0];
    const textInput = e.target.xml_data.value;
    
    let xmlText = '';
    
    if (fileInput) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        xmlText = event.target.result;
        await processXMLImport(xmlText);
      };
      reader.readAsText(fileInput);
      return;
    } else if (textInput) {
      xmlText = textInput;
      await processXMLImport(xmlText);
    } else {
      showMessage('Please select a file or paste XML data', 'error');
    }
  };

  const processXMLImport = async (xmlData) => {
    try {
      console.log('📤 Starting XML import...');
      console.log('📤 XML data length:', xmlData.length, 'characters');
      showMessage('Importing system registry data...', 'info');
      
      const result = await api.request(`/api/customers/${id}/system-registry/import`, {
        method: 'POST',
        body: JSON.stringify({ xmlData }),
      });
      
      console.log('📥 Import result:', result);
      
      if (result.success) {
        console.log('✅ Import successful, stats:', result.stats);
        
        const stats = result.stats;
        const totalImported = Object.values(stats).reduce((a, b) => a + b, 0);
        
        if (totalImported === 0) {
          soundSystem.playError();
          showMessage('Import completed but no data was found. Please check your XML format matches the expected structure. See the sample file for reference.', 'error');
          console.warn('⚠️ XML structure may not match expected format');
          console.warn('⚠️ Expected elements: Workstation, Controller, SmartSwitch, IODevice, CharmsIOCard, Charm, AMSSystem');
          // Don't close the modal so user can see the message and try again
          return;
        }
        
        soundSystem.playSuccess();
        const summary = [
          stats.workstations && `${stats.workstations} workstations`,
          stats.controllers && `${stats.controllers} controllers`,
          stats.smartSwitches && `${stats.smartSwitches} smart switches`,
          stats.ioDevices && `${stats.ioDevices} I/O devices`,
          stats.charmsIOCards && `${stats.charmsIOCards} Charms I/O cards`,
          stats.charms && `${stats.charms} Charms`,
          stats.amsSystems && `${stats.amsSystems} AMS system`
        ].filter(Boolean).join(', ');
        
        const mergeInfo = (result.updatedCount > 0) 
          ? ` (${result.newCount || 0} new, ${result.updatedCount} updated - assignments preserved)`
          : '';
        
        showMessage(`Successfully imported: ${summary}${mergeInfo}. Ready for PM sessions!`, 'success');
        
        // Reload summary to show new data
        console.log('🔄 Reloading system registry summary...');
        await loadSystemRegSummary();
        
        // Keep modal open for a moment to show the success message
        setTimeout(() => {
          setShowSystemRegModal(false);
        }, 2000);
      } else {
        soundSystem.playError();
        console.error('❌ Import failed:', result.error);
        console.error('❌ Details:', result.details);
        console.error('❌ Help:', result.help);
        
        let errorMsg = result.error || 'Error importing system registry';
        if (result.lineNumber) {
          errorMsg += ` (Line ${result.lineNumber})`;
        }
        if (result.help) {
          errorMsg += '\n\n' + result.help;
        }
        
        showMessage(errorMsg, 'error');
      }
    } catch (error) {
      soundSystem.playError();
      console.error('❌ Import exception:', error);
      showMessage('Error importing system registry: ' + error.message, 'error');
    }
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
            {customer.company_name && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Company Name</div>
                <div className="text-gray-200">{customer.company_name}</div>
              </div>
            )}
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
            {(customer.street_address || customer.city || customer.state || customer.zip || customer.country) ? (
              <div>
                <div className="text-xs text-gray-500 uppercase">Address</div>
                <div className="text-gray-200 text-sm">
                  {customer.street_address && <div>{customer.street_address}</div>}
                  {(customer.city || customer.state || customer.zip) && (
                    <div>
                      {[customer.city, customer.state].filter(Boolean).join(', ')}
                      {customer.zip ? ` ${customer.zip}` : ''}
                    </div>
                  )}
                  {customer.country && <div>{customer.country}</div>}
                </div>
              </div>
            ) : customer.address ? (
              <div>
                <div className="text-xs text-gray-500 uppercase">Address</div>
                <div className="text-gray-200">{customer.address}</div>
              </div>
            ) : null}
            {customer.dongle_id && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Dongle ID</div>
                <div className="text-gray-200 font-mono text-sm">{customer.dongle_id}</div>
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
                <div className="text-xs text-gray-500 uppercase mb-2">System Credentials</div>
                {customer.system_username && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-400">Username</div>
                    <div className="text-gray-200 font-mono text-sm">{customer.system_username}</div>
                  </div>
                )}
                {customer.system_password && (
                  <div>
                    <div className="text-xs text-gray-400">Password</div>
                    <div className="text-gray-200 font-mono text-sm">{'*'.repeat(8)}</div>
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
            {systemRegSummary && (systemRegSummary.workstations > 0 || systemRegSummary.controllers > 0 || systemRegSummary.smartSwitches > 0) && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-400">System Registry Data</div>
                  <button
                    onClick={() => navigate(`/system-registry/${customer.id}`)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View Details →
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {systemRegSummary.workstations > 0 && (
                    <div className="text-center bg-purple-900/30 rounded p-2 cursor-pointer hover:bg-purple-900/50"
                         onClick={() => navigate(`/system-registry/${customer.id}`)}>
                      <div className="font-bold text-purple-300">{systemRegSummary.workstations}</div>
                      <div className="text-gray-400">Workstations</div>
                    </div>
                  )}
                  {systemRegSummary.controllers > 0 && (
                    <div className="text-center bg-blue-900/30 rounded p-2 cursor-pointer hover:bg-blue-900/50"
                         onClick={() => navigate(`/system-registry/${customer.id}`)}>
                      <div className="font-bold text-blue-300">{systemRegSummary.controllers}</div>
                      <div className="text-gray-400">Controllers</div>
                    </div>
                  )}
                  {systemRegSummary.smartSwitches > 0 && (
                    <div className="text-center bg-green-900/30 rounded p-2 cursor-pointer hover:bg-green-900/50"
                         onClick={() => navigate(`/system-registry/${customer.id}`)}>
                      <div className="font-bold text-green-300">{systemRegSummary.smartSwitches}</div>
                      <div className="text-gray-400">Switches</div>
                    </div>
                  )}
                </div>
              </div>
            )}
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
              onClick={() => setShowSystemRegModal(true)}
              className="btn btn-info w-full text-white"
            >
              📋 Import Nodes
            </button>
            {systemRegSummary && (systemRegSummary.workstations > 0 || systemRegSummary.controllers > 0) && (
              <button
                onClick={() => navigate(`/system-registry/${customer.id}`)}
                className="btn btn-success w-full"
              >
                👁️ View Nodes
              </button>
            )}
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
              <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
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
                  <label className="form-label">Address (general)</label>
                  <textarea
                    name="address"
                    rows="2"
                    defaultValue={customer.address}
                    className="form-textarea"
                  ></textarea>
                </div>

                {/* System Registry Address Fields */}
                <div className="pt-4 border-t border-gray-600">
                  <h4 className="text-gray-300 font-medium mb-3">System Registry Info</h4>
                  <p className="text-xs text-gray-500 mb-3">These fields are auto-populated from System Registry XML imports, but can be edited manually.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="form-label">Company Name</label>
                      <input type="text" name="company_name" defaultValue={customer.company_name} className="form-input" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Street Address</label>
                        <input type="text" name="street_address" defaultValue={customer.street_address} className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">City</label>
                        <input type="text" name="city" defaultValue={customer.city} className="form-input" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="form-label">State</label>
                        <input type="text" name="state" defaultValue={customer.state} className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">Zip</label>
                        <input type="text" name="zip" defaultValue={customer.zip} className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">Country</label>
                        <input type="text" name="country" defaultValue={customer.country} className="form-input" />
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Dongle ID</label>
                      <input type="text" name="dongle_id" defaultValue={customer.dongle_id} className="form-input font-mono" />
                    </div>
                  </div>
                </div>

                {/* System Credentials Section */}
                <div className="pt-4 border-t border-gray-600">
                  <h4 className="text-gray-300 font-medium mb-3">System Login Credentials</h4>
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

      {/* System Registry Import Modal */}
      {showSystemRegModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-3xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📋 Import Nodes (System Registry XML)</h3>
              <button
                onClick={() => setShowSystemRegModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSystemRegImport}>
              <div className="px-6 py-4 space-y-4">
                {systemRegSummary && (
                  <div className={`border rounded-lg p-4 ${
                    (systemRegSummary.workstations > 0 || systemRegSummary.controllers > 0 || systemRegSummary.smartSwitches > 0)
                      ? 'bg-blue-900/30 border-blue-500'
                      : 'bg-gray-700/30 border-gray-600'
                  }`}>
                    <h4 className={`font-semibold mb-2 ${
                      (systemRegSummary.workstations > 0 || systemRegSummary.controllers > 0 || systemRegSummary.smartSwitches > 0)
                        ? 'text-blue-300'
                        : 'text-gray-400'
                    }`}>
                      {(systemRegSummary.workstations > 0 || systemRegSummary.controllers > 0 || systemRegSummary.smartSwitches > 0)
                        ? '📊 Current System Registry Data'
                        : '📋 No System Registry Data Yet'}
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                      <div>Workstations: <strong>{systemRegSummary.workstations || 0}</strong></div>
                      <div>Controllers: <strong>{systemRegSummary.controllers || 0}</strong></div>
                      <div>Smart Switches: <strong>{systemRegSummary.smartSwitches || 0}</strong></div>
                      <div>I/O Devices: <strong>{systemRegSummary.ioDevices || 0}</strong></div>
                      <div>Charms I/O Cards: <strong>{systemRegSummary.charmsIOCards || 0}</strong></div>
                      <div>Charms: <strong>{systemRegSummary.charms || 0}</strong></div>
                    </div>
                    {(systemRegSummary.workstations > 0 || systemRegSummary.controllers > 0) && (
                      <div className="mt-3 pt-3 border-t border-blue-700">
                        <p className="text-xs text-blue-200">
                          💡 Importing will update existing records with the same names
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <label className="form-label">Upload XML File</label>
                  <input
                    type="file"
                    name="xml_file"
                    accept=".xml"
                    className="form-input"
                  />
                  <p className="text-sm text-gray-400 mt-2">
                    💡 Select your DeltaV System Registry XML export
                  </p>
                </div>
                
                <div className="text-center text-gray-500">OR</div>
                
                <div>
                  <label className="form-label">Paste XML Data</label>
                  <textarea
                    name="xml_data"
                    rows="10"
                    placeholder="<?xml version=&quot;1.0&quot;?>&#10;<Export>&#10;  <Workstation>...</Workstation>&#10;  <Controller>...</Controller>&#10;</Export>"
                    className="form-textarea font-mono text-sm"
                  ></textarea>
                  <p className="text-sm text-gray-400 mt-2">
                    💡 Or paste XML data directly
                  </p>
                </div>

                <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-3">
                  <p className="text-yellow-300 text-sm mb-2">
                    <strong>Important:</strong> XML must use these exact element names (case-sensitive):
                  </p>
                  <div className="text-xs text-yellow-200 space-y-1 ml-4">
                    <div>• <code className="bg-black/30 px-1 rounded">&lt;Workstation&gt;</code> - Workstation records</div>
                    <div>• <code className="bg-black/30 px-1 rounded">&lt;Controller&gt;</code> - Controller records</div>
                    <div>• <code className="bg-black/30 px-1 rounded">&lt;SmartSwitch&gt;</code> - Smart Switch records</div>
                    <div>• <code className="bg-black/30 px-1 rounded">&lt;IODevice&gt;</code> - I/O Device records</div>
                    <div>• <code className="bg-black/30 px-1 rounded">&lt;CharmsIOCard&gt;</code> - Charms I/O Card records</div>
                    <div>• <code className="bg-black/30 px-1 rounded">&lt;Charm&gt;</code> - Charm records</div>
                    <div>• <code className="bg-black/30 px-1 rounded">&lt;AMSSystem&gt;</code> - AMS System record</div>
                  </div>
                  <p className="text-yellow-200 text-xs mt-2">
                    📄 See <code className="bg-black/30 px-1 rounded">sample-system-registry.xml</code> in the project root for the correct format.
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSystemRegModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  📋 Import Nodes (XML)
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
