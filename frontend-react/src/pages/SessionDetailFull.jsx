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
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationDescription, setNewLocationDescription] = useState('');
  const [showAssignLocationModal, setShowAssignLocationModal] = useState(false);
  const [assigningCabinetId, setAssigningCabinetId] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [showCompleteSessionModal, setShowCompleteSessionModal] = useState(false);
  const [completeSaveToHistory, setCompleteSaveToHistory] = useState(true);

  useEffect(() => {
    loadSessionData();
  }, [id]);

  const loadSessionData = async () => {
    try {
      // The session endpoint already returns cabinets!
      const sessionData = await api.getSession(id);
      
      // If this is an I&I session, redirect to I&I view
      if (sessionData.session_type === 'ii') {
        navigate(`/ii-session/${id}`);
        return;
      }
      
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
    const entries = Object.fromEntries(formData);
    const data = {
      ...entries,
      pm_session_id: id,
      cabinet_type: 'cabinet',
      location_id: entries.location_id || undefined,
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
    const entries = Object.fromEntries(formData);
    const data = {
      ...entries,
      pm_session_id: id,
      cabinet_type: 'rack',
      location_id: entries.location_id || undefined,
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
        showMessage('PDF downloaded successfully!', 'success');
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
    try {
      showMessage('Generating full session report (cabinets + diagnostics + notes)...', 'info');
      const result = await api.generateSessionPDF(id);
      if (result.success) {
        soundSystem.playSuccess();
        showMessage('Full session PDF downloaded!', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Failed to generate PDF', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error generating PDF', 'error');
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocationName.trim()) {
      showMessage('Location name is required', 'error');
      return;
    }

    try {
      const result = await api.request(`/api/sessions/${id}/locations`, {
        method: 'POST',
        body: JSON.stringify({ 
          location_name: newLocationName.trim(),
          description: newLocationDescription.trim()
        }),
      });

      if (result.success) {
        soundSystem.playSuccess();
        setShowNewLocationModal(false);
        setNewLocationName('');
        setNewLocationDescription('');
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

  const handleAssignCabinetToLocation = async () => {
    if (!assigningCabinetId) return;

    try {
      const result = await api.request(`/api/cabinets/${assigningCabinetId}/assign-location`, {
        method: 'POST',
        body: JSON.stringify({ location_id: selectedLocationId || null }),
      });

      if (result.success) {
        soundSystem.playSuccess();
        setShowAssignLocationModal(false);
        setAssigningCabinetId(null);
        setSelectedLocationId('');
        loadSessionData();
        showMessage('Cabinet assigned to location successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error assigning location', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error assigning location', 'error');
    }
  };

  const openAssignLocationModal = (cabinetId, currentLocationId) => {
    setAssigningCabinetId(cabinetId);
    setSelectedLocationId(currentLocationId || '');
    setShowAssignLocationModal(true);
  };

  const handleDeleteLocation = async (locationId, locationName) => {
    if (!confirm(`Delete location "${locationName}"? Cabinets in this location will become unassigned.`)) return;

    try {
      const result = await api.request(`/api/locations/${locationId}`, {
        method: 'DELETE',
      });

      if (result.success) {
        soundSystem.playSuccess();
        loadSessionData();
        showMessage('Location deleted successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error deleting location', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error deleting location', 'error');
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

  const handleCompleteSession = () => {
    setShowCompleteSessionModal(true);
  };

  const confirmCompleteSession = async () => {
    try {
      const result = await api.completeSession(id, { saveHistory: completeSaveToHistory });
      setShowCompleteSessionModal(false);
      if (result.success) {
        soundSystem.playSuccess();
        loadSessionData();
        showMessage(result.savedToHistory ? 'Session completed and saved to customer history' : 'Session marked as completed', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error completing session', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error completing session', 'error');
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

      {/* View-only banner for completed sessions */}
      {session.status === 'completed' && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-green-900/30 text-green-200 border border-green-600">
          ✅ This session is completed. You can view cabinets, diagnostics, and PM notes but cannot make changes.
        </div>
      )}

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
              <button onClick={handleExportAllPDFs} className="btn btn-warning" title="Download full session report (cabinets, diagnostics, node maintenance, PM notes)">
                📄 PM REPORT PDF
              </button>
              {session.status !== 'completed' && (
                <>
                  <button onClick={() => setShowBulkImportModal(true)} className="btn btn-success">
                    📤 Bulk Import
                  </button>
                  <button onClick={() => setShowNewCabinetModal(true)} className="btn btn-primary">
                    📦 Add Cabinet
                  </button>
                  <button onClick={() => setShowAddRackModal(true)} className="btn btn-primary">
                    🗄️ Add Rack
                  </button>
                  <button onClick={() => setShowNewLocationModal(true)} className="btn btn-secondary">
                    📍 Add Location
                  </button>
                </>
              )}
            </>
          )}
          {session.status !== 'completed' && (
            <button onClick={handleCompleteSession} className="btn btn-success" title="Lock session and create node snapshot">
              ✅ Complete session
            </button>
          )}
          {showCompleteSessionModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 max-w-md w-full p-6">
                <h3 className="text-lg font-semibold text-gray-100 mb-2">Complete PM Session</h3>
                <p className="text-gray-300 text-sm mb-4">
                  Mark &quot;{session.session_name}&quot; as completed? This will lock the session and create a snapshot of nodes.
                </p>
                <div className="mb-4 p-3 rounded-lg bg-gray-700/50 border border-gray-600">
                  <p className="text-xs text-gray-400 mb-3">
                    <strong className="text-gray-300">Optional:</strong> Save this session&apos;s metrics (error count, risk score, cabinet count, etc.) to this customer&apos;s history so you can view trends over time on the customer profile. You can choose to skip this.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={completeSaveToHistory}
                      onChange={(e) => setCompleteSaveToHistory(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-500"
                    />
                    <span className="text-sm text-gray-200">Save to customer history (for trend over time)</span>
                  </label>
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowCompleteSessionModal(false)} className="btn btn-secondary">Cancel</button>
                  <button onClick={confirmCompleteSession} className="btn btn-success">Complete session</button>
                </div>
              </div>
            </div>
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
        <div className="stats-card" title="Controllers/CIOCs assigned to cabinets in this session">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-purple-400">
                {session.controllerAssignmentStats
                  ? `${session.controllerAssignmentStats.assigned} / ${session.controllerAssignmentStats.total}`
                  : '—'}
              </div>
              <div className="text-sm text-gray-400">Controllers assigned</div>
            </div>
            <div className="text-4xl">🎛️</div>
          </div>
        </div>
      </div>

      {/* Pending vs Completed cabinets explainer (only when session has cabinets and is not completed) */}
      {session.status !== 'completed' && cabinets.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-gray-700/40 text-gray-300 text-sm border border-gray-600">
          <strong className="text-gray-200">Cabinets:</strong> <strong>Pending</strong> = cabinet not yet marked done (open Inspect, fill the form, then click <strong>Mark cabinet complete</strong>). <strong>Completed</strong> = cabinet marked complete for this PM. When all cabinets are done, click <strong>Complete session</strong> below to lock the session.
        </div>
      )}

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

          {/* Cabinets grouped by Location */}
          {cabinets.length === 0 ? (
            <div className="card">
              <div className="card-body text-center py-12">
                <div className="text-6xl mb-4">🗄️</div>
                <p className="text-gray-400 mb-4">
                  {session.status === 'completed' ? 'No cabinets were recorded for this session.' : 'No cabinets yet. Add your first cabinet to get started.'}
                </p>
                {session.status !== 'completed' && (
                  <div className="flex gap-3 justify-center">
                    <button onClick={() => setShowNewCabinetModal(true)} className="btn btn-primary">
                      Add Cabinet
                    </button>
                    <button onClick={() => setShowBulkImportModal(true)} className="btn btn-success">
                      Bulk Import
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Render each location container, then unassigned at the end */}
              {[...locations, { id: null, location_name: 'Unassigned' }].map((loc) => {
                const locationCabinets = cabinets.filter(c => 
                  loc.id ? c.location_id === loc.id : (!c.location_id)
                );
                
                // Skip empty location groups (except Unassigned always shows)
                if (locationCabinets.length === 0 && loc.id) return null;
                
                return (
                  <div key={loc.id || 'unassigned'} className="rounded-lg border border-gray-600 bg-gray-800/30">
                    {/* Location Container Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-700/50 rounded-t-lg border-b border-gray-600">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{loc.id ? '📍' : '📦'}</span>
                        <h3 className="text-gray-100 font-semibold">{loc.location_name}</h3>
                        <span className="text-xs text-gray-400 bg-gray-600/50 px-2 py-0.5 rounded-full">
                          {locationCabinets.length} {locationCabinets.length === 1 ? 'cabinet' : 'cabinets'}
                        </span>
                      </div>
                      {loc.id && session.status !== 'completed' && (
                        <button
                          onClick={() => handleDeleteLocation(loc.id, loc.location_name)}
                          className="text-red-400 hover:text-red-300 text-sm px-2 py-1 rounded hover:bg-red-900/20"
                          title="Delete location"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    
                    {/* Cabinets in this location */}
                    {locationCabinets.length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-500 text-sm">
                        No cabinets assigned to this location yet. Use the 📍 button on a cabinet to assign it here.
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {locationCabinets.map((cabinet) => (
                            <div
                              key={cabinet.id}
                              className="bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-all shadow-lg"
                            >
                              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                                <h4 className="font-semibold text-gray-100">
                                  {cabinet.cabinet_name || 'Unnamed Cabinet'}
                                </h4>
                                <div className="flex items-center gap-2">
                                  {cabinet.cabinet_type === 'rack' && (
                                    <span className="badge badge-blue text-xs">Rack</span>
                                  )}
                                  <span className={`badge text-xs ${cabinet.status === 'completed' ? 'badge-green' : 'badge-gray'}`}>
                                    {(cabinet.status || 'PENDING').toUpperCase()}
                                  </span>
                                </div>
                              </div>
                              <div className="px-4 py-3">
                                <div className="space-y-2 mb-3">
                                  <div className="flex items-center text-sm text-gray-400">
                                    <span className="mr-2">📅</span>
                                    {cabinet.cabinet_date ? new Date(cabinet.cabinet_date).toLocaleDateString() : 'No date'}
                                  </div>
                                  
                                  <div className="pt-2 border-t border-gray-700">
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {cabinet.cabinet_type === 'rack' ? (
                                        <>
                                          <div className="text-gray-400">🖥️ {(cabinet.workstations || []).length} Workstations</div>
                                          <div className="text-gray-400">🔌 {(cabinet.power_supplies || []).length} Power</div>
                                          <div className="text-gray-400">🌐 {(cabinet.network_equipment || []).length} Network</div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="text-gray-400">🎛️ {(cabinet.controllers || []).length} Controllers</div>
                                          <div className="text-gray-400">🔌 {(cabinet.power_supplies || []).length} Power</div>
                                          <div className="text-gray-400">📡 {(cabinet.distribution_blocks || []).length} Dist Blocks</div>
                                          <div className="text-gray-400">🌐 {(cabinet.network_equipment || []).length} Network</div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                  <Link
                                    to={`/cabinet/${cabinet.id}`}
                                    className="flex-1 btn btn-primary text-sm py-2 min-w-0"
                                  >
                                    Inspect
                                  </Link>
                                  {session.status !== 'completed' && cabinet.status !== 'completed' && (
                                    <button
                                      onClick={async () => {
                                        try {
                                          await api.markCabinetComplete(cabinet.id);
                                          soundSystem.playSuccess();
                                          showMessage('Cabinet marked complete', 'success');
                                          loadSessionData();
                                        } catch (err) {
                                          soundSystem.playError();
                                          showMessage(err?.error || err?.message || 'Failed to mark cabinet complete', 'error');
                                        }
                                      }}
                                      className="btn btn-success text-sm py-2"
                                      title="Mark this cabinet as completed"
                                    >
                                      ✓ Complete
                                    </button>
                                  )}
                                  {session.status !== 'completed' && (
                                    <button
                                      onClick={() => openAssignLocationModal(cabinet.id, cabinet.location_id)}
                                      className="btn btn-secondary text-sm py-2"
                                      title="Assign to Location"
                                    >
                                      📍
                                    </button>
                                  )}
                                  {session.status !== 'completed' && (
                                    <button
                                      onClick={() => handleDeleteCabinet(cabinet.id)}
                                      className="btn btn-danger text-sm py-2"
                                      title="Delete Cabinet"
                                    >
                                      🗑️
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
                  <select name="location_id" className="form-select">
                    <option value="">Unassigned</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.location_name}
                      </option>
                    ))}
                  </select>
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

      {/* Add Location Modal */}
      {showNewLocationModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📍 Add Location</h3>
              <button
                onClick={() => { setShowNewLocationModal(false); setNewLocationName(''); setNewLocationDescription(''); }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAddLocation}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Location Name *</label>
                  <input
                    type="text"
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    required
                    placeholder="e.g., Building A - Floor 2"
                    className="form-input"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="form-label">Description (Optional)</label>
                  <input
                    type="text"
                    value={newLocationDescription}
                    onChange={(e) => setNewLocationDescription(e.target.value)}
                    placeholder="Brief description of the location"
                    className="form-input"
                  />
                </div>
                {locations.length > 0 && (
                  <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                    <p className="text-xs text-gray-400 mb-2">Existing locations:</p>
                    <div className="flex flex-wrap gap-1">
                      {locations.map((loc) => (
                        <span key={loc.id} className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">
                          {loc.location_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowNewLocationModal(false); setNewLocationName(''); setNewLocationDescription(''); }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  📍 Add Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Cabinet to Location Modal */}
      {showAssignLocationModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📍 Assign to Location</h3>
              <button
                onClick={() => { setShowAssignLocationModal(false); setAssigningCabinetId(null); setSelectedLocationId(''); }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="form-label">Cabinet</label>
                <p className="text-gray-200 font-medium">
                  {cabinets.find(c => c.id === assigningCabinetId)?.cabinet_name || 'Unknown'}
                </p>
              </div>
              <div>
                <label className="form-label">Select Location</label>
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  className="form-select"
                >
                  <option value="">Unassigned</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.location_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowAssignLocationModal(false); setAssigningCabinetId(null); setSelectedLocationId(''); }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignCabinetToLocation}
                className="btn btn-primary"
              >
                📍 Assign Location
              </button>
            </div>
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
