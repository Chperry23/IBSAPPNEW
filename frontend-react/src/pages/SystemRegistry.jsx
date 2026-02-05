import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function SystemRegistry() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('workstations');
  const [summary, setSummary] = useState(null);
  
  // Data states
  const [workstations, setWorkstations] = useState([]);
  const [controllers, setControllers] = useState([]);
  const [switches, setSwitches] = useState([]);
  const [ioDevices, setIoDevices] = useState([]);
  const [charmsIOCards, setCharmsIOCards] = useState([]);
  const [charms, setCharms] = useState([]);
  const [amsSystem, setAmsSystem] = useState(null);
  const [currentCIOCIndex, setCurrentCIOCIndex] = useState(0);

  useEffect(() => {
    loadData();
  }, [customerId]);

  // Keyboard navigation for CIOC pagination
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (activeTab !== 'charms') return;
      
      // Group charms to get total count
      const grouped = {};
      charms.forEach(charm => {
        const ciocName = charm.charms_io_card_name || 'Standalone';
        if (!grouped[ciocName]) grouped[ciocName] = [];
      });
      const totalCIOCs = Object.keys(grouped).length;
      
      // Arrow key navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentCIOCIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentCIOCIndex(prev => Math.min(totalCIOCs - 1, prev + 1));
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [activeTab, charms, currentCIOCIndex]);

  const loadData = async () => {
    try {
      console.log('📊 Loading system registry data for customer:', customerId);
      
      const [customerData, summaryData] = await Promise.all([
        api.getCustomer(customerId),
        api.request(`/api/customers/${customerId}/system-registry/summary`)
      ]);
      
      console.log('📊 Customer:', customerData);
      console.log('📊 Summary:', summaryData);
      
      setCustomer(customerData);
      setSummary(summaryData);
      
      // Load initial tab data
      await loadWorkstations();
    } catch (error) {
      console.error('Error loading data:', error);
      showMessage('Error loading system registry data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadWorkstations = async () => {
    try {
      console.log('📊 Loading workstations...');
      const data = await api.request(`/api/customers/${customerId}/system-registry/workstations`);
      console.log('📊 Workstations loaded:', data.length);
      setWorkstations(data);
    } catch (error) {
      console.error('Error loading workstations:', error);
    }
  };

  const loadControllers = async () => {
    try {
      console.log('📊 Loading controllers...');
      const data = await api.request(`/api/customers/${customerId}/system-registry/controllers`);
      console.log('📊 Controllers loaded:', data.length);
      setControllers(data);
    } catch (error) {
      console.error('Error loading controllers:', error);
    }
  };

  const loadSwitches = async () => {
    try {
      console.log('📊 Loading switches...');
      const data = await api.request(`/api/customers/${customerId}/system-registry/switches`);
      console.log('📊 Switches loaded:', data.length);
      setSwitches(data);
    } catch (error) {
      console.error('Error loading switches:', error);
    }
  };

  const loadIODevices = async () => {
    try {
      console.log('📊 Loading I/O devices...');
      const data = await api.request(`/api/customers/${customerId}/system-registry/iodevices`);
      console.log('📊 I/O devices loaded:', data.length);
      setIoDevices(data);
    } catch (error) {
      console.error('Error loading I/O devices:', error);
    }
  };

  const loadCharmsIOCards = async () => {
    try {
      console.log('📊 Loading Charms I/O cards...');
      const data = await api.request(`/api/customers/${customerId}/system-registry/charms-io-cards`);
      console.log('📊 Charms I/O cards loaded:', data.length);
      setCharmsIOCards(data);
    } catch (error) {
      console.error('Error loading Charms I/O cards:', error);
    }
  };

  const loadCharms = async () => {
    try {
      console.log('📊 Loading Charms...');
      const data = await api.request(`/api/customers/${customerId}/system-registry/charms`);
      console.log('📊 Charms loaded:', data.length);
      setCharms(data);
    } catch (error) {
      console.error('Error loading Charms:', error);
    }
  };

  const loadAMSSystem = async () => {
    try {
      console.log('📊 Loading AMS system...');
      const data = await api.request(`/api/customers/${customerId}/system-registry/ams-system`);
      console.log('📊 AMS system loaded:', data);
      setAmsSystem(data);
    } catch (error) {
      console.error('Error loading AMS system:', error);
    }
  };

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    
    // Reset CIOC pagination when switching to Charms tab
    if (tab === 'charms') {
      setCurrentCIOCIndex(0);
    }
    
    if (tab === 'workstations' && workstations.length === 0) {
      await loadWorkstations();
    } else if (tab === 'controllers' && controllers.length === 0) {
      await loadControllers();
    } else if (tab === 'switches' && switches.length === 0) {
      await loadSwitches();
    } else if (tab === 'iodevices' && ioDevices.length === 0) {
      await loadIODevices();
    } else if (tab === 'charmsiocards' && charmsIOCards.length === 0) {
      await loadCharmsIOCards();
    } else if (tab === 'charms' && charms.length === 0) {
      await loadCharms();
    } else if (tab === 'amssystem' && !amsSystem) {
      await loadAMSSystem();
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL system registry data for this customer? This cannot be undone.')) return;
    
    try {
      const result = await api.request(`/api/customers/${customerId}/system-registry`, {
        method: 'DELETE'
      });
      
      if (result.success) {
        soundSystem.playSuccess();
        showMessage('System registry data deleted', 'success');
        loadData();
      } else {
        soundSystem.playError();
        showMessage('Error deleting data', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error deleting data', 'error');
    }
  };

  const handleRebuildCharmsTable = async () => {
    if (!confirm('Rebuild the Charms table to fix duplicate name issues? This will delete all existing charm data. You will need to re-import your XML after this.')) return;
    
    try {
      showMessage('Rebuilding Charms table...', 'info');
      const result = await api.request('/api/system-registry/rebuild-charms-table', {
        method: 'POST'
      });
      
      if (result.success) {
        soundSystem.playSuccess();
        showMessage('Charms table rebuilt. Please re-import your system registry XML.', 'success');
        loadData();
      } else {
        soundSystem.playError();
        showMessage('Error rebuilding table', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error rebuilding table', 'error');
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
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

  const hasData = summary && (
    summary.workstations > 0 || 
    summary.controllers > 0 || 
    summary.smartSwitches > 0 ||
    summary.ioDevices > 0 ||
    summary.charmsIOCards > 0 ||
    summary.charms > 0
  );

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-gray-400">
        <Link to="/customers" className="hover:text-gray-200">Customers</Link>
        {customer && (
          <>
            <span className="mx-2">›</span>
            <Link to={`/customer/${customer.id}`} className="hover:text-gray-200">{customer.name}</Link>
          </>
        )}
        <span className="mx-2">›</span>
        <span className="text-gray-200">System Registry</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-8 animate-fadeIn">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">📋 System Registry</h1>
          {customer && <p className="text-gray-400 text-lg">{customer.name}</p>}
        </div>
        <div className="flex gap-3">
          {hasData && (
            <>
              <button
                onClick={handleRebuildCharmsTable}
                className="btn btn-warning"
                title="Fix duplicate charm name issues"
              >
                🔧 Fix Charms Table
              </button>
              <button
                onClick={handleDeleteAll}
                className="btn btn-danger"
              >
                🗑️ Delete All Data
              </button>
            </>
          )}
          <button
            onClick={() => navigate(`/customer/${customerId}`)}
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

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          <div className="stats-card">
            <div className="text-3xl font-bold text-purple-400">{summary.workstations}</div>
            <div className="text-sm text-gray-400">Workstations</div>
          </div>
          <div className="stats-card">
            <div className="text-3xl font-bold text-blue-400">{summary.controllers}</div>
            <div className="text-sm text-gray-400">Controllers</div>
          </div>
          <div className="stats-card">
            <div className="text-3xl font-bold text-green-400">{summary.smartSwitches}</div>
            <div className="text-sm text-gray-400">Smart Switches</div>
          </div>
          <div className="stats-card">
            <div className="text-3xl font-bold text-yellow-400">{summary.ioDevices}</div>
            <div className="text-sm text-gray-400">I/O Devices</div>
          </div>
          <div className="stats-card">
            <div className="text-3xl font-bold text-pink-400">{summary.charmsIOCards}</div>
            <div className="text-sm text-gray-400">Charms I/O Cards</div>
          </div>
          <div className="stats-card">
            <div className="text-3xl font-bold text-indigo-400">{summary.charms}</div>
            <div className="text-sm text-gray-400">Charms</div>
          </div>
          <div className="stats-card">
            <div className="text-3xl font-bold text-cyan-400">{summary.amsSystems}</div>
            <div className="text-sm text-gray-400">AMS Systems</div>
          </div>
        </div>
      )}

      {!hasData ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-gray-400 mb-4">No system registry data imported yet</p>
            <p className="text-gray-500 text-sm mb-6">Import system registry XML data from the customer profile page</p>
            <button
              onClick={() => navigate(`/customer/${customerId}`)}
              className="btn btn-primary"
            >
              Go to Customer Profile
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <div className="flex gap-4 border-b border-gray-700">
              <button
                onClick={() => handleTabChange('workstations')}
                className={`pb-2 px-4 font-medium transition-colors ${
                  activeTab === 'workstations'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Workstations ({summary.workstations})
              </button>
              <button
                onClick={() => handleTabChange('controllers')}
                className={`pb-2 px-4 font-medium transition-colors ${
                  activeTab === 'controllers'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Controllers ({summary.controllers})
              </button>
              <button
                onClick={() => handleTabChange('switches')}
                className={`pb-2 px-4 font-medium transition-colors ${
                  activeTab === 'switches'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Smart Switches ({summary.smartSwitches})
              </button>
              <button
                onClick={() => handleTabChange('iodevices')}
                className={`pb-2 px-4 font-medium transition-colors ${
                  activeTab === 'iodevices'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                I/O Devices ({summary.ioDevices})
              </button>
              <button
                onClick={() => handleTabChange('charmsiocards')}
                className={`pb-2 px-4 font-medium transition-colors ${
                  activeTab === 'charmsiocards'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Charms I/O Cards ({summary.charmsIOCards})
              </button>
              <button
                onClick={() => handleTabChange('charms')}
                className={`pb-2 px-4 font-medium transition-colors ${
                  activeTab === 'charms'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Charms ({summary.charms})
              </button>
              <button
                onClick={() => handleTabChange('amssystem')}
                className={`pb-2 px-4 font-medium transition-colors ${
                  activeTab === 'amssystem'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                AMS System ({summary.amsSystems})
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {/* Workstations Table */}
            {activeTab === 'workstations' && (
              <table className="table-dark">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Model</th>
                    <th>Type</th>
                    <th>OS Name</th>
                    <th>Software Rev</th>
                    <th>Memory</th>
                    <th>Redundant</th>
                  </tr>
                </thead>
                <tbody>
                  {workstations.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-gray-400">
                        No workstations found
                      </td>
                    </tr>
                  ) : (
                    workstations.map((ws) => (
                      <tr key={ws.id}>
                        <td className="font-medium text-gray-200">{ws.name}</td>
                        <td>{ws.model || 'N/A'}</td>
                        <td>{ws.type || 'N/A'}</td>
                        <td>{ws.os_name || 'N/A'}</td>
                        <td>{ws.software_revision || 'N/A'}</td>
                        <td>{ws.memory || 'N/A'}</td>
                        <td>
                          <span className={`badge ${ws.redundant === 'Yes' ? 'badge-red' : 'badge-green'}`}>
                            {ws.redundant || 'No'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Controllers Table */}
            {activeTab === 'controllers' && (
              <table className="table-dark">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Model</th>
                    <th>Software Rev</th>
                    <th>Hardware Rev</th>
                    <th>Serial Number</th>
                    <th>Free Memory</th>
                    <th>Redundant</th>
                  </tr>
                </thead>
                <tbody>
                  {controllers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-gray-400">
                        No controllers found
                      </td>
                    </tr>
                  ) : (
                    controllers.map((ctrl) => (
                      <tr key={ctrl.id}>
                        <td className="font-medium text-gray-200">{ctrl.name}</td>
                        <td>{ctrl.model || 'N/A'}</td>
                        <td>{ctrl.software_revision || 'N/A'}</td>
                        <td>{ctrl.hardware_revision || 'N/A'}</td>
                        <td className="font-mono text-xs">{ctrl.serial_number || 'N/A'}</td>
                        <td>
                          {ctrl.controller_free_memory 
                            ? `${(parseInt(ctrl.controller_free_memory) / 1024 / 1024).toFixed(0)} MB`
                            : 'N/A'}
                        </td>
                        <td>
                          <span className={`badge ${ctrl.redundant === 'Yes' ? 'badge-green' : 'badge-gray'}`}>
                            {ctrl.redundant || 'No'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Smart Switches Table */}
            {activeTab === 'switches' && (
              <table className="table-dark">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Model</th>
                    <th>Software Rev</th>
                    <th>Hardware Rev</th>
                    <th>Serial Number</th>
                  </tr>
                </thead>
                <tbody>
                  {switches.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-12 text-gray-400">
                        No smart switches found
                      </td>
                    </tr>
                  ) : (
                    switches.map((sw) => (
                      <tr key={sw.id}>
                        <td className="font-medium text-gray-200">{sw.name}</td>
                        <td>{sw.model || 'N/A'}</td>
                        <td>{sw.software_revision || 'N/A'}</td>
                        <td>{sw.hardware_revision || 'N/A'}</td>
                        <td className="font-mono text-xs">{sw.serial_number || 'N/A'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* I/O Devices Table */}
            {activeTab === 'iodevices' && (
              <table className="table-dark">
                <thead>
                  <tr>
                    <th>Bus Type</th>
                    <th>Device Type</th>
                    <th>Node</th>
                    <th>Card</th>
                    <th>Device Name (DST)</th>
                    <th>Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {ioDevices.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-12 text-gray-400">
                        No I/O devices found
                      </td>
                    </tr>
                  ) : (
                    ioDevices.map((dev, idx) => (
                      <tr key={idx}>
                        <td>{dev.bus_type || 'N/A'}</td>
                        <td><span className="badge badge-blue text-xs">{dev.device_type || 'N/A'}</span></td>
                        <td className="font-medium text-gray-200">{dev.node || 'N/A'}</td>
                        <td>{dev.card || 'N/A'}</td>
                        <td className="font-mono text-sm">{dev.device_name || 'N/A'}</td>
                        <td>{dev.channel || 'N/A'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Charms I/O Cards Table */}
            {activeTab === 'charmsiocards' && (
              <table className="table-dark">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Model</th>
                    <th>Software Rev</th>
                    <th>Hardware Rev</th>
                    <th>Serial Number</th>
                    <th>Redundant</th>
                    <th>Partner Model</th>
                  </tr>
                </thead>
                <tbody>
                  {charmsIOCards.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-gray-400">
                        No Charms I/O cards found
                      </td>
                    </tr>
                  ) : (
                    charmsIOCards.map((card) => (
                      <tr key={card.id}>
                        <td className="font-medium text-gray-200">{card.name}</td>
                        <td>{card.model || 'N/A'}</td>
                        <td>{card.software_revision || 'N/A'}</td>
                        <td>{card.hardware_revision || 'N/A'}</td>
                        <td className="font-mono text-xs">{card.serial_number || 'N/A'}</td>
                        <td>
                          <span className={`badge ${card.redundant === 'Yes' || card.redundant === 'True' ? 'badge-green' : 'badge-gray'} text-xs`}>
                            {card.redundant || 'No'}
                          </span>
                        </td>
                        <td>{card.partner_model || 'N/A'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Charms Table - Paginated by CIOC */}
            {activeTab === 'charms' && (
              <div className="p-6">
                {charms.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    No Charms found
                  </div>
                ) : (
                  <>
                    {/* Group charms by their parent CIOC */}
                    {(() => {
                      // Group charms by charms_io_card_name
                      const grouped = {};
                      charms.forEach(charm => {
                        const ciocName = charm.charms_io_card_name || 'Standalone';
                        if (!grouped[ciocName]) {
                          grouped[ciocName] = [];
                        }
                        grouped[ciocName].push(charm);
                      });
                      
                      const ciocEntries = Object.entries(grouped);
                      const totalCIOCs = ciocEntries.length;
                      
                      // Get current CIOC
                      const [ciocName, ciocCharms] = ciocEntries[currentCIOCIndex] || ['', []];
                      
                      return (
                        <div className="space-y-4">
                          {/* Navigation Controls */}
                          <div className="flex justify-between items-center bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                            <button
                              onClick={() => setCurrentCIOCIndex(Math.max(0, currentCIOCIndex - 1))}
                              disabled={currentCIOCIndex === 0}
                              className={`btn btn-secondary flex items-center gap-2 ${currentCIOCIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title="Previous CIOC (or press Left Arrow)"
                            >
                              ← Previous
                            </button>
                            
                            <div className="text-center">
                              <div className="text-gray-400 text-sm">CIOC {currentCIOCIndex + 1} of {totalCIOCs}</div>
                              <div className="text-gray-200 font-semibold text-lg">{ciocName}</div>
                              <div className="text-gray-400 text-xs mt-1">{ciocCharms.length} Charms</div>
                              <div className="text-gray-500 text-xs mt-2">💡 Use ← → arrow keys to navigate</div>
                            </div>
                            
                            <button
                              onClick={() => setCurrentCIOCIndex(Math.min(totalCIOCs - 1, currentCIOCIndex + 1))}
                              disabled={currentCIOCIndex >= totalCIOCs - 1}
                              className={`btn btn-secondary flex items-center gap-2 ${currentCIOCIndex >= totalCIOCs - 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title="Next CIOC (or press Right Arrow)"
                            >
                              Next →
                            </button>
                          </div>
                          
                          {/* Current CIOC Card */}
                          <div className="card">
                            <div className="card-header">
                              <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-gray-100">
                                  📟 {ciocName}
                                </h3>
                                <span className="badge badge-blue">
                                  {ciocCharms.length} Charm{ciocCharms.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="table-dark">
                                <thead>
                                  <tr>
                                    <th>Name</th>
                                    <th>Model</th>
                                    <th>Software Rev</th>
                                    <th>Hardware Rev</th>
                                    <th>Serial Number</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ciocCharms.map((charm) => (
                                    <tr key={charm.id}>
                                      <td className="font-medium text-gray-200">{charm.name}</td>
                                      <td>{charm.model || 'N/A'}</td>
                                      <td>{charm.software_revision || 'N/A'}</td>
                                      <td>{charm.hardware_revision || 'N/A'}</td>
                                      <td className="font-mono text-xs">{charm.serial_number || 'N/A'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          
                          {/* Bottom Navigation */}
                          <div className="flex justify-center items-center gap-4 bg-gray-700/30 rounded-lg p-3 border border-gray-600">
                            <button
                              onClick={() => setCurrentCIOCIndex(Math.max(0, currentCIOCIndex - 1))}
                              disabled={currentCIOCIndex === 0}
                              className={`text-gray-300 hover:text-white transition-colors ${currentCIOCIndex === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                            >
                              ← Prev
                            </button>
                            
                            <div className="flex gap-2">
                              {ciocEntries.map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setCurrentCIOCIndex(idx)}
                                  className={`w-2 h-2 rounded-full transition-all ${
                                    idx === currentCIOCIndex 
                                      ? 'bg-blue-400 w-8' 
                                      : 'bg-gray-600 hover:bg-gray-500'
                                  }`}
                                  title={`CIOC ${idx + 1}`}
                                />
                              ))}
                            </div>
                            
                            <button
                              onClick={() => setCurrentCIOCIndex(Math.min(totalCIOCs - 1, currentCIOCIndex + 1))}
                              disabled={currentCIOCIndex >= totalCIOCs - 1}
                              className={`text-gray-300 hover:text-white transition-colors ${currentCIOCIndex >= totalCIOCs - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                            >
                              Next →
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}

            {/* AMS System Table */}
            {activeTab === 'amssystem' && (
              <div className="p-6">
                {!amsSystem ? (
                  <div className="text-center py-12 text-gray-400">
                    No AMS system information found
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto">
                    <div className="card">
                      <div className="card-header">
                        <h3 className="text-lg font-semibold text-gray-100">AMS System Information</h3>
                      </div>
                      <div className="card-body">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-gray-400">Software Revision</div>
                            <div className="text-xl font-semibold text-blue-400 mt-1">
                              {amsSystem.software_revision || 'N/A'}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-400">Last Updated</div>
                            <div className="text-sm text-gray-300 mt-1">
                              {amsSystem.updated_at ? new Date(amsSystem.updated_at).toLocaleString() : 'N/A'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
