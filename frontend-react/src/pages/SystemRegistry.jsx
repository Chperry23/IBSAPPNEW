import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ManualRegistryAddForm from '../components/ManualRegistryAddForm';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function SystemRegistry() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('workstations');
  const [fhxSubKind, setFhxSubKind] = useState('modules');
  const [summary, setSummary] = useState(null);
  const [fhxRows, setFhxRows] = useState([]);
  const [fhxLoading, setFhxLoading] = useState(false);
  const initialTabPicked = useRef(false);
  
  // Data states
  const [workstations, setWorkstations] = useState([]);
  const [controllers, setControllers] = useState([]);
  const [switches, setSwitches] = useState([]);
  const [ioDevices, setIoDevices] = useState([]);
  const [charmsIOCards, setCharmsIOCards] = useState([]);
  const [charms, setCharms] = useState([]);
  const [amsSystem, setAmsSystem] = useState(null);
  const [currentCIOCIndex, setCurrentCIOCIndex] = useState(0);
  const [addFormCategory, setAddFormCategory] = useState(null);

  useEffect(() => {
    loadData();
  }, [customerId]);

  useEffect(() => {
    if (activeTab !== 'fhxfmodules') return;
    let cancelled = false;
    (async () => {
      setFhxLoading(true);
      try {
        const data = await api.request(
          `/api/customers/${customerId}/system-registry/fhx-modules/${fhxSubKind}`
        );
        if (!cancelled) setFhxRows(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        if (!cancelled) setFhxRows([]);
      } finally {
        if (!cancelled) setFhxLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, customerId, fhxSubKind]);

  useEffect(() => {
    initialTabPicked.current = false;
  }, [customerId]);

  useEffect(() => {
    if (!summary || initialTabPicked.current) return;
    const topo =
      (summary.workstations || 0) +
      (summary.controllers || 0) +
      (summary.smartSwitches || 0);
    const fhxTot = summary.fhxModuleTotal || 0;
    initialTabPicked.current = true;
    if (topo === 0 && fhxTot > 0) {
      setActiveTab('fhxfmodules');
      return;
    }
    if (
      topo === 0 &&
      fhxTot === 0 &&
      ((summary.ioDevices || 0) > 0 || (summary.charms || 0) > 0)
    ) {
      setActiveTab('iodevices');
      if ((summary.ioDevices || 0) > 0) {
        loadIODevices();
      } else if ((summary.charms || 0) > 0) {
        loadCharms();
      }
    }
  }, [summary]);

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
    if (tab === 'fhxfmodules') {
      setFhxSubKind('modules');
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

  const handleSyncToNodes = async () => {
    console.log('🔄 [UI] Manual sync triggered for customer:', customerId);
    
    if (!confirm('Sync System Registry data to Nodes? This will create/update nodes for this customer.')) return;
    
    try {
      setLoading(true);
      console.log('📤 Calling sync API endpoint...');
      
      const result = await api.request(`/api/customers/${customerId}/system-registry/sync-to-nodes`, {
        method: 'POST'
      });
      
      console.log('📥 Sync API response:', result);
      
      if (result.success) {
        soundSystem.playSuccess();
        console.log(`✅ Sync successful: ${result.stats.total} nodes (${result.stats.created} created, ${result.stats.updated} updated)`);
        showMessage(`✅ Synced ${result.stats.total} nodes (${result.stats.created} created, ${result.stats.updated} updated)`, 'success');
      } else {
        soundSystem.playError();
        console.error('❌ Sync failed:', result.error);
        showMessage('Failed to sync to nodes: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('❌ Sync exception:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      soundSystem.playError();
      showMessage('Error syncing to nodes: ' + error.message, 'error');
    } finally {
      setLoading(false);
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

  const refreshSummary = async () => {
    const summaryData = await api.request(`/api/customers/${customerId}/system-registry/summary`);
    setSummary(summaryData);
  };

  const reloadActiveTab = async () => {
    if (activeTab === 'workstations') await loadWorkstations();
    else if (activeTab === 'controllers') await loadControllers();
    else if (activeTab === 'switches') await loadSwitches();
    else if (activeTab === 'charmsiocards') await loadCharmsIOCards();
    else if (activeTab === 'iodevices') await loadIODevices();
    else if (activeTab === 'charms') await loadCharms();
    else if (activeTab === 'amssystem') await loadAMSSystem();
  };

  const onManualNodeAdded = async () => {
    soundSystem.playSuccess();
    showMessage('Node added — it will appear in PM sessions after sync', 'success');
    setAddFormCategory(null);
    await refreshSummary();
    await reloadActiveTab();
  };

  const handleDeleteRegistryNode = async (category, rowId, displayName) => {
    if (!confirm(`Remove "${displayName}" from this customer?`)) return;
    try {
      await api.request(`/api/customers/${customerId}/system-registry/nodes/${category}/${rowId}`, {
        method: 'DELETE',
      });
      soundSystem.playSuccess();
      showMessage('Removed', 'success');
      await refreshSummary();
      await reloadActiveTab();
    } catch (err) {
      soundSystem.playError();
      showMessage(err.message || 'Failed to remove', 'error');
    }
  };

  const manualAddCategories = new Set(['workstations', 'controllers', 'switches', 'charmsiocards']);
  const addCategoryKey = {
    workstations: 'workstation',
    controllers: 'controller',
    switches: 'switch',
    charmsiocards: 'cioc',
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

  const fh = summary?.fhxModules;
  const fhxTotal =
    summary?.fhxModuleTotal ??
    (fh ? fh.modules + fh.pid + fh.ai + fh.ao + fh.di + fh.do : 0);

  const topoFromRegistrationXml =
    summary &&
    (summary.workstations > 0 ||
      summary.controllers > 0 ||
      summary.smartSwitches > 0 ||
      summary.charmsIOCards > 0 ||
      summary.amsSystems > 0);

  const hasSysRegistry =
    summary &&
    (summary.workstations > 0 ||
      summary.controllers > 0 ||
      summary.smartSwitches > 0 ||
      summary.ioDevices > 0 ||
      summary.charmsIOCards > 0 ||
      summary.charms > 0 ||
      summary.amsSystems > 0);

  const hasFhxExtracts = fhxTotal > 0;

  const hasData = !!(summary && (hasSysRegistry || hasFhxExtracts));
  const hasTopologyTabs = true;

  const fhxSubKinds = [
    { key: 'modules', label: 'MODULE inventory', count: fh?.modules ?? 0 },
    { key: 'pid', label: 'PID', count: fh?.pid ?? 0 },
    { key: 'ai', label: 'AI', count: fh?.ai ?? 0 },
    { key: 'ao', label: 'AO', count: fh?.ao ?? 0 },
    { key: 'di', label: 'DI', count: fh?.di ?? 0 },
    { key: 'do', label: 'DO', count: fh?.do ?? 0 },
  ];

  function renderDynamicFhxTable(rows) {
    const omit = new Set(['id', 'customer_id', 'imported_at']);
    if (!rows || rows.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 px-6">No rows in this extract for this customer.</div>
      );
    }
    const keys = Object.keys(rows[0]).filter((k) => !omit.has(k));
    return (
      <div className="max-h-[60vh] overflow-auto border-t border-gray-700">
        <table className="table-dark table-fixed w-full">
          <thead className="sticky top-0 z-10 bg-gray-800 shadow">
            <tr>
              {keys.map((k) => (
                <th key={k} className="whitespace-nowrap px-3 py-2 text-xs capitalize">
                  {k.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {keys.map((k) => (
                  <td key={k} className="align-top px-3 py-1.5 text-xs text-gray-300 break-all">
                    {row[k] == null || row[k] === '' ? '—' : String(row[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

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
        <span className="text-gray-200">Nodes</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-8 animate-fadeIn">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">📋 Nodes</h1>
          {customer && (
            <p className="text-gray-400 text-lg">
              <span className="text-gray-200">{customer.name}</span>{' '}
              <span className="text-gray-500">
                {topoFromRegistrationXml
                  ? 'Registration topology from XML. '
                  : 'Add workstations (including virtual), controllers, switches, and CIOCs manually when SMS/XML is incomplete. '}
                {hasFhxExtracts
                  ? 'FHX workbook: AI/AO/DI/DO/PID/MODULES under “FHX control modules”.'
                  : ''}
              </span>
            </p>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          {manualAddCategories.has(activeTab) && (
            <button
              type="button"
              onClick={() =>
                setAddFormCategory(
                  addFormCategory === addCategoryKey[activeTab] ? null : addCategoryKey[activeTab]
                )
              }
              className="btn btn-primary"
            >
              {addFormCategory === addCategoryKey[activeTab] ? 'Cancel' : '➕ Add manually'}
            </button>
          )}
          {topoFromRegistrationXml && (
            <button
              onClick={handleRebuildCharmsTable}
              className="btn btn-warning"
              title="Fix duplicate charm name issues"
            >
              🔧 Fix Charms Table
            </button>
          )}
          {hasData && (
            <button
              onClick={handleDeleteAll}
              className="btn btn-danger"
            >
              🗑️ Delete All Data
            </button>
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
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-4">
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
          {hasFhxExtracts && fh && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8 border-t border-gray-700/80 pt-6">
              <div className="stats-card border-violet-500/20">
                <div className="text-3xl font-bold text-violet-300">{fh.modules}</div>
                <div className="text-sm text-gray-400">MODULE inventory</div>
              </div>
              <div className="stats-card border-violet-500/20">
                <div className="text-3xl font-bold text-violet-300">{fh.pid}</div>
                <div className="text-sm text-gray-400">PID</div>
              </div>
              <div className="stats-card border-violet-500/20">
                <div className="text-3xl font-bold text-violet-300">{fh.ai}</div>
                <div className="text-sm text-gray-400">AI</div>
              </div>
              <div className="stats-card border-violet-500/20">
                <div className="text-3xl font-bold text-violet-300">{fh.ao}</div>
                <div className="text-sm text-gray-400">AO</div>
              </div>
              <div className="stats-card border-violet-500/20">
                <div className="text-3xl font-bold text-violet-300">{fh.di}</div>
                <div className="text-sm text-gray-400">DI</div>
              </div>
              <div className="stats-card border-violet-500/20">
                <div className="text-3xl font-bold text-violet-300">{fh.do}</div>
                <div className="text-sm text-gray-400">DO</div>
              </div>
            </div>
          )}
        </>
      )}

      {!hasData && (
        <div className="card mb-6 border-amber-500/30 bg-amber-950/20">
          <div className="card-body py-4 text-sm text-amber-100/90">
            <strong className="text-amber-200">No System Registry XML yet?</strong> Add workstations, controllers, and other nodes manually below
            (useful for virtual stations SMS omits). You can still{' '}
            <button type="button" className="text-blue-300 underline" onClick={() => navigate(`/customer/${customerId}`)}>
              import XML
            </button>{' '}
            from the customer page when available.
          </div>
        </div>
      )}

      {hasTopologyTabs && (
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
                Workstations ({summary?.workstations ?? workstations.length})
              </button>
              <button
                onClick={() => handleTabChange('controllers')}
                className={`pb-2 px-4 font-medium transition-colors ${
                  activeTab === 'controllers'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Controllers ({summary?.controllers ?? controllers.length})
              </button>
              <button
                onClick={() => handleTabChange('switches')}
                className={`pb-2 px-4 font-medium transition-colors ${
                  activeTab === 'switches'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Smart Switches ({summary?.smartSwitches ?? switches.length})
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
                Charms I/O Cards ({summary?.charmsIOCards ?? charmsIOCards.length})
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
              {hasFhxExtracts && (
                <button
                  onClick={() => handleTabChange('fhxfmodules')}
                  className={`pb-2 px-4 font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'fhxfmodules'
                      ? 'text-violet-300 border-b-2 border-violet-400'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  FHX ctrl modules ({fhxTotal})
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {addFormCategory && addCategoryKey[activeTab] === addFormCategory && (
              <div className="p-4 border-b border-gray-700">
                <ManualRegistryAddForm
                  category={addFormCategory}
                  customerId={customerId}
                  onAdded={onManualNodeAdded}
                  onCancel={() => setAddFormCategory(null)}
                />
              </div>
            )}
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
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workstations.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-12 text-gray-400">
                        No workstations yet — use Add manually for virtual or missing stations
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
                        <td>
                          <button
                            type="button"
                            className="text-red-400 hover:text-red-300 text-xs"
                            onClick={() => handleDeleteRegistryNode('workstation', ws.id, ws.name)}
                          >
                            Remove
                          </button>
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
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {controllers.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-12 text-gray-400">
                        No controllers yet — use Add manually
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
                        <td>
                          <button
                            type="button"
                            className="text-red-400 hover:text-red-300 text-xs"
                            onClick={() => handleDeleteRegistryNode('controller', ctrl.id, ctrl.name)}
                          >
                            Remove
                          </button>
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
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {switches.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-12 text-gray-400">
                        No smart switches yet — use Add manually
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
                        <td>
                          <button
                            type="button"
                            className="text-red-400 hover:text-red-300 text-xs"
                            onClick={() => handleDeleteRegistryNode('switch', sw.id, sw.name)}
                          >
                            Remove
                          </button>
                        </td>
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
                    <th>FHX description</th>
                    <th>FHX enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {ioDevices.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-12 text-gray-400">
                        No I/O devices found
                      </td>
                    </tr>
                  ) : (
                    ioDevices.map((dev, idx) => (
                      <tr key={dev.id ?? idx}>
                        <td>{dev.bus_type || '—'}</td>
                        <td><span className="badge badge-blue text-xs">{dev.device_type || '—'}</span></td>
                        <td className="font-medium text-gray-200">{dev.node || '—'}</td>
                        <td>{dev.card || '—'}</td>
                        <td className="font-mono text-sm">{dev.device_name || '—'}</td>
                        <td>{dev.channel || '—'}</td>
                        <td className="text-xs text-gray-400 max-w-xs">{dev.fhx_description || '—'}</td>
                        <td className="text-xs">{dev.fhx_enabled || '—'}</td>
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
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {charmsIOCards.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-12 text-gray-400">
                        No Charms I/O cards yet — use Add manually
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
                        <td>
                          <button
                            type="button"
                            className="text-red-400 hover:text-red-300 text-xs"
                            onClick={() => handleDeleteRegistryNode('cioc', card.id, card.name)}
                          >
                            Remove
                          </button>
                        </td>
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
                      const showFhxCharmColumns = charms.some(
                        (c) =>
                          (c.fhx_charm_definition != null && String(c.fhx_charm_definition).trim() !== '') ||
                          (c.fhx_dst != null && String(c.fhx_dst).trim() !== '') ||
                          (c.fhx_io_subsystem != null && String(c.fhx_io_subsystem).trim() !== '')
                      );
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
                                  {showFhxCharmColumns ? (
                                    <tr>
                                      <th>DST</th>
                                      <th>Card slot</th>
                                      <th>Channel</th>
                                      <th>Charm definition</th>
                                      <th>Charm description</th>
                                      <th>I/O subsystem</th>
                                      <th>Controller</th>
                                      <th>Redundant</th>
                                      <th>Channel definition</th>
                                      <th>Channel description</th>
                                      <th>Enabled</th>
                                    </tr>
                                  ) : (
                                    <tr>
                                      <th>Name</th>
                                      <th>Model</th>
                                      <th>Software Rev</th>
                                      <th>Hardware Rev</th>
                                      <th>Serial Number</th>
                                    </tr>
                                  )}
                                </thead>
                                <tbody>
                                  {ciocCharms.map((charm) =>
                                    showFhxCharmColumns ? (
                                      <tr key={charm.id}>
                                        <td className="font-mono text-xs text-gray-200">
                                          {charm.fhx_dst || charm.name || '—'}
                                        </td>
                                        <td className="text-xs">{charm.fhx_slot || '—'}</td>
                                        <td className="text-xs">{charm.fhx_channel || '—'}</td>
                                        <td className="text-xs">{charm.fhx_charm_definition || charm.model || '—'}</td>
                                        <td className="text-xs text-gray-400 max-w-[12rem]">
                                          {charm.fhx_charm_description || '—'}
                                        </td>
                                        <td className="text-xs">{charm.fhx_io_subsystem || '—'}</td>
                                        <td className="text-xs">{charm.fhx_controller_assignment || '—'}</td>
                                        <td className="text-xs">{charm.fhx_redundant || '—'}</td>
                                        <td className="text-xs">{charm.fhx_channel_definition || '—'}</td>
                                        <td className="text-xs text-gray-400 max-w-[12rem]">
                                          {charm.fhx_channel_description || '—'}
                                        </td>
                                        <td className="text-xs">{charm.fhx_enabled || '—'}</td>
                                      </tr>
                                    ) : (
                                      <tr key={charm.id}>
                                        <td className="font-medium text-gray-200">{charm.name}</td>
                                        <td>{charm.model || 'N/A'}</td>
                                        <td>{charm.software_revision || 'N/A'}</td>
                                        <td>{charm.hardware_revision || 'N/A'}</td>
                                        <td className="font-mono text-xs">{charm.serial_number || 'N/A'}</td>
                                      </tr>
                                    )
                                  )}
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

            {/* FHX workbook-derived control modules */}
            {activeTab === 'fhxfmodules' && hasFhxExtracts && (
              <div className="space-y-0">
                <div className="flex flex-wrap gap-2 px-4 py-3 bg-gray-800/80 border-b border-gray-700">
                  {fhxSubKinds.map((x) => (
                    <button
                      key={x.key}
                      type="button"
                      onClick={() => setFhxSubKind(x.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        fhxSubKind === x.key
                          ? 'bg-violet-900/50 border-violet-500 text-violet-100'
                          : 'bg-gray-700/60 border-transparent text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {x.label}{' '}
                      <span className="opacity-75">({x.count})</span>
                    </button>
                  ))}
                </div>
                {fhxLoading ? (
                  <div className="flex justify-center py-16">
                    <div className="spinner h-10 w-10" />
                  </div>
                ) : (
                  renderDynamicFhxTable(fhxRows)
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
