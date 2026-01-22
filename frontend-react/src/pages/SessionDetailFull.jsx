import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';
import PMNotes from '../components/PMNotes';
import NodeMaintenance from '../components/NodeMaintenance';
import DiagnosticsAdvanced from '../components/DiagnosticsAdvanced';

export default function SessionDetailFull() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [cabinets, setCabinets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cabinets');
  const [showNewCabinetModal, setShowNewCabinetModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showNewLocationModal, setShowNewLocationModal] = useState(false);
  const [showAddRackModal, setShowAddRackModal] = useState(false);
  const [isRackType, setIsRackType] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('location');
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    loadSessionData();
  }, [id]);

  const loadSessionData = async () => {
    try {
      // The session endpoint already returns cabinets!
      const sessionData = await api.getSession(id);
      setSession(sessionData);
      setCabinets(sessionData.cabinets || []);
      setLocations(sessionData.locations || []);
      
      if (sessionData.customer_id) {
        const customerData = await api.getCustomer(sessionData.customer_id);
        setCustomer(customerData);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      showMessage('Error loading session data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateCabinet = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      ...Object.fromEntries(formData),
      pm_session_id: id,
      cabinet_type: 'cabinet', // Explicitly set type
    };

    try {
      const result = await api.createCabinet(data);
      if (result.success) {
        soundSystem.playSuccess();
        setShowNewCabinetModal(false);
        loadSessionData();
        showMessage('Cabinet created successfully', 'success');
        e.target.reset();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error creating cabinet', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error creating cabinet', 'error');
    }
  };

  const handleCreateRack = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      ...Object.fromEntries(formData),
      pm_session_id: id,
      cabinet_type: 'rack', // Set as rack type
    };

    try {
      const result = await api.createCabinet(data);
      if (result.success) {
        soundSystem.playSuccess();
        setShowAddRackModal(false);
        loadSessionData();
        showMessage('Rack created successfully', 'success');
        e.target.reset();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error creating rack', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error creating rack', 'error');
    }
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    const cabinetList = e.target.cabinet_list.value;
    const cabinetNames = cabinetList
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (cabinetNames.length === 0) {
      showMessage('Please enter at least one cabinet location', 'error');
      return;
    }

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const cabinetName of cabinetNames) {
        try {
          const result = await api.createCabinet({
            pm_session_id: id,
            cabinet_name: cabinetName,
            cabinet_date: new Date().toISOString().split('T')[0],
          });
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }

      setShowBulkImportModal(false);
      loadSessionData();

      if (errorCount === 0) {
        soundSystem.playSuccess();
        showMessage(`Successfully imported ${successCount} cabinets`, 'success');
      } else {
        soundSystem.playError();
        showMessage(`Imported ${successCount} cabinets, ${errorCount} failed`, 'info');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error importing cabinets', 'error');
    }
  };

  const handleGeneratePDF = async () => {
    try {
      showMessage('Generating PDF report...', 'info');
      const result = await api.generateSessionPDF(id);
      if (result.success) {
        soundSystem.playSuccess();
        showMessage('PDF generated successfully!', 'success');
        if (result.pdfUrl) {
          window.open(result.pdfUrl, '_blank');
        }
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error generating PDF', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error generating PDF', 'error');
    }
  };

  const handleExportAllPDFs = async () => {
    if (cabinets.length === 0) {
      showMessage('No cabinets to export', 'info');
      return;
    }

    try {
      showMessage(`Generating ${cabinets.length} PDF reports...`, 'info');
      let successCount = 0;
      
      for (const cabinet of cabinets) {
        try {
          const result = await api.generateCabinetPDF(cabinet.id);
          if (result.success) successCount++;
        } catch (error) {
          console.error('Error generating PDF for cabinet:', cabinet.cabinet_name);
        }
      }

      soundSystem.playSuccess();
      showMessage(`Successfully generated ${successCount} PDFs!`, 'success');
    } catch (error) {
      soundSystem.playError();
      showMessage('Error exporting PDFs', 'error');
    }
  };

  const handleAddLocation = async () => {
    const locationName = prompt('Enter location name:');
    if (!locationName) return;

    try {
      const result = await api.request(`/api/sessions/${id}/locations`, {
        method: 'POST',
        body: JSON.stringify({ location_name: locationName }),
      });

      if (result.success) {
        soundSystem.playSuccess();
        loadSessionData();
        showMessage('Location added successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error adding location', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error adding location', 'error');
    }
  };

  const handleDeleteCabinet = async (cabinetId) => {
    if (!confirm('Delete this cabinet? All associated data will be lost.')) {
      return;
    }

    try {
      const result = await api.deleteCabinet(cabinetId);
      if (result.success) {
        loadSessionData();
        showMessage('Cabinet deleted successfully', 'success');
      } else {
        showMessage(result.error || 'Error deleting cabinet', 'error');
      }
    } catch (error) {
      showMessage('Error deleting cabinet', 'error');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner h-12 w-12"></div>
        </div>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-400">Session not found</p>
          <Link to="/sessions" className="btn btn-primary mt-4">
            Back to Sessions
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-gray-400">
        {customer && (
          <>
            <Link to="/customers" className="hover:text-gray-200">Customers</Link>
            <span className="mx-2">›</span>
            <Link to={`/customer/${customer.id}`} className="hover:text-gray-200">{customer.name}</Link>
            <span className="mx-2">›</span>
          </>
        )}
        <Link to="/sessions" className="hover:text-gray-200">PM Sessions</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-200">{session.session_name}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-8 animate-fadeIn">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">{session.session_name}</h1>
          {customer && <p className="text-gray-400 text-lg">{customer.name}</p>}
          <span className={`badge ${session.status === 'completed' ? 'badge-green' : 'badge-blue'} mt-2`}>
            {(session.status || 'ACTIVE').toUpperCase()}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeTab === 'cabinets' && (
            <>
              <button onClick={handleGeneratePDF} className="btn btn-warning">
                📄 Export PDF
              </button>
              <button onClick={handleExportAllPDFs} className="btn btn-warning" title="Export all cabinets as PDFs">
                📄 Export All
              </button>
              <button onClick={() => setShowBulkImportModal(true)} className="btn btn-success">
                📤 Bulk Import
              </button>
              <button onClick={() => setShowNewCabinetModal(true)} className="btn btn-primary">
                📦 Add Cabinet
              </button>
              <button onClick={() => setShowAddRackModal(true)} className="btn btn-primary">
                🗄️ Add Rack
              </button>
              <button onClick={handleAddLocation} className="btn btn-secondary">
                📍 Add Location
              </button>
            </>
          )}
          {customer && (
            <button onClick={() => navigate(`/customer/${customer.id}`)} className="btn btn-secondary">
              ← Back to Customer Profile
            </button>
          )}
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

      {/* Session Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-blue-400">{cabinets.length}</div>
              <div className="text-sm text-gray-400">Total Cabinets</div>
            </div>
            <div className="text-4xl">🗄️</div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-green-400">
                {cabinets.filter((c) => c.status === 'completed').length}
              </div>
              <div className="text-sm text-gray-400">Completed</div>
            </div>
            <div className="text-4xl">✅</div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-yellow-400">
                {cabinets.filter((c) => c.status !== 'completed').length}
              </div>
              <div className="text-sm text-gray-400">Pending</div>
            </div>
            <div className="text-4xl">⏳</div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-purple-400">0</div>
              <div className="text-sm text-gray-400">Nodes</div>
            </div>
            <div className="text-4xl">🖥️</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card mb-6">
        <div className="card-header">
          <div className="flex gap-2 border-b border-gray-700 -mb-4">
            <button
              onClick={() => setActiveTab('cabinets')}
              className={`pb-4 px-4 font-medium transition-all ${
                activeTab === 'cabinets'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              🏗️ Cabinets ({cabinets.length})
            </button>
            <button
              onClick={() => setActiveTab('nodes')}
              className={`pb-4 px-4 font-medium transition-all ${
                activeTab === 'nodes'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              🖥️ Diagnostics
            </button>
            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`pb-4 px-4 font-medium transition-all ${
                activeTab === 'diagnostics'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              🔧 I/O Errors
            </button>
            <button
              onClick={() => setActiveTab('pm-notes')}
              className={`pb-4 px-4 font-medium transition-all ${
                activeTab === 'pm-notes'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              📝 PM Notes
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'cabinets' && (
        <>
          {/* Search and Filter */}
          <div className="card mb-6">
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="🔍 Search cabinets by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input"
                />
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="form-select">
                  <option value="location">Sort by Location</option>
                  <option value="date">Sort by Date</option>
                  <option value="status">Sort by Status</option>
                  <option value="created">Sort by Created</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cabinets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cabinets.length === 0 ? (
            <div className="col-span-full card">
              <div className="card-body text-center py-12">
                <div className="text-6xl mb-4">🗄️</div>
                <p className="text-gray-400 mb-4">No cabinets yet. Add your first cabinet to get started.</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setShowNewCabinetModal(true)}
                    className="btn btn-primary"
                  >
                    ➕ Add Cabinet
                  </button>
                  <button
                    onClick={() => setShowBulkImportModal(true)}
                    className="btn btn-success"
                  >
                    📤 Bulk Import
                  </button>
                </div>
              </div>
            </div>
          ) : (
            cabinets.map((cabinet) => (
              <div
                key={cabinet.id}
                className="card hover:border-blue-500/50 transition-all group"
              >
                <div className="card-header">
                  <h3 className="font-semibold text-gray-100">{cabinet.cabinet_name}</h3>
                </div>
                <div className="card-body">
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center text-sm text-gray-400">
                      <span className="mr-2">📅</span>
                      {new Date(cabinet.cabinet_date).toLocaleDateString()}
                    </div>
                    {cabinet.location && (
                      <div className="flex items-center text-sm text-gray-400">
                        <span className="mr-2">📍</span>
                        {cabinet.location}
                      </div>
                    )}
                    <div>
                      <span
                        className={`badge ${
                          cabinet.status === 'completed' ? 'badge-green' : 'badge-gray'
                        }`}
                      >
                        {(cabinet.status || 'PENDING').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Link
                      to={`/cabinet/${cabinet.id}`}
                      className="flex-1 btn btn-primary text-sm py-2"
                    >
                      🔍 Inspect
                    </Link>
                    <button
                      onClick={() => handleDeleteCabinet(cabinet.id)}
                      className="btn btn-danger text-sm py-2"
                      title="Delete Cabinet"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
          </div>
        </>
      )}

      {activeTab === 'nodes' && session?.customer_id && (
        <NodeMaintenance 
          sessionId={id} 
          customerId={session.customer_id} 
          isCompleted={session?.status === 'completed'} 
        />
      )}

      {activeTab === 'diagnostics' && session?.customer_id && (
        <DiagnosticsAdvanced 
          sessionId={id} 
          customerId={session.customer_id} 
          isCompleted={session?.status === 'completed'} 
        />
      )}

      {activeTab === 'pm-notes' && (
        <PMNotes sessionId={id} isCompleted={session?.status === 'completed'} />
      )}

      {/* New Cabinet Modal */}
      {showNewCabinetModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">➕ New Cabinet</h3>
              <button
                onClick={() => setShowNewCabinetModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateCabinet}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Cabinet Name *</label>
                  <input
                    type="text"
                    name="cabinet_name"
                    required
                    placeholder="e.g., Building A - Control Room 1"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Cabinet Date *</label>
                  <input
                    type="date"
                    name="cabinet_date"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Location (Optional)</label>
                  <input
                    type="text"
                    name="location"
                    placeholder="Specific location within facility"
                    className="form-input"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewCabinetModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Cabinet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📤 Bulk Import Cabinets</h3>
              <button
                onClick={() => setShowBulkImportModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleBulkImport}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Cabinet Locations (one per line)</label>
                  <textarea
                    name="cabinet_list"
                    rows="12"
                    placeholder="Building A - Control Room 1&#10;Building A - Control Room 2&#10;Building B - Main Panel&#10;Building C - Distribution Center&#10;..."
                    className="form-textarea font-mono text-sm"
                  ></textarea>
                  <p className="text-sm text-gray-400 mt-2">
                    💡 Enter each cabinet location on a separate line. Empty lines will be ignored.
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowBulkImportModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  📤 Import Cabinets
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Rack Modal */}
      {showAddRackModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">🗄️ New Rack</h3>
              <button
                onClick={() => setShowAddRackModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateRack}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Rack Name *</label>
                  <input
                    type="text"
                    name="cabinet_name"
                    required
                    placeholder="e.g., Server Rack 1"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Rack Date *</label>
                  <input
                    type="date"
                    name="cabinet_date"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Location (Optional)</label>
                  <select name="location_id" className="form-select">
                    <option value="">Unassigned</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.location_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-3 text-sm text-blue-200">
                  <p>💡 Racks can only assign workstations and network switches (not controllers)</p>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddRackModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Rack
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
