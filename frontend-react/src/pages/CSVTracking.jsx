import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';

export default function CSVTracking() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importingCustomerId, setImportingCustomerId] = useState(null);
  const [importingCustomerName, setImportingCustomerName] = useState('');
  const [importProgress, setImportProgress] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'imported', 'none'
  const [search, setSearch] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadImports();
  }, []);

  const loadImports = async () => {
    try {
      const data = await api.request('/api/system-registry/imports');
      setImports(data || []);
    } catch (error) {
      console.error('Error loading system registry imports:', error);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 6000);
  };

  const openImportModal = (customerId, customerName) => {
    setImportingCustomerId(customerId);
    setImportingCustomerName(customerName);
    setShowImportModal(true);
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importingCustomerId) return;

    const fileInput = e.target.xml_file?.files[0];
    const textInput = e.target.xml_data?.value;

    let xmlText = '';

    if (fileInput) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        xmlText = event.target.result;
        await processImport(xmlText);
      };
      reader.readAsText(fileInput);
      return;
    } else if (textInput) {
      xmlText = textInput;
      await processImport(xmlText);
    } else {
      showMsg('Please select a file or paste XML data', 'error');
    }
  };

  const processImport = async (xmlData) => {
    setImportProgress(true);
    try {
      const result = await api.request(`/api/customers/${importingCustomerId}/system-registry/import`, {
        method: 'POST',
        body: JSON.stringify({ xmlData }),
      });

      if (result.success) {
        const stats = result.stats;
        const totalImported = Object.values(stats).reduce((a, b) => a + b, 0);
        
        if (totalImported === 0) {
          showMsg('Import completed but no data was found. Check your XML format.', 'error');
          setImportProgress(false);
          return;
        }

        const newCount = result.newCount || 0;
        const updatedCount = result.updatedCount || 0;
        
        const parts = [
          stats.workstations && `${stats.workstations} workstations`,
          stats.controllers && `${stats.controllers} controllers`,
          stats.smartSwitches && `${stats.smartSwitches} switches`,
          stats.charmsIOCards && `${stats.charmsIOCards} CIOCs`,
          stats.ioDevices && `${stats.ioDevices} I/O devices`,
          stats.charms && `${stats.charms} charms`,
          stats.amsSystems && `${stats.amsSystems} AMS`,
        ].filter(Boolean).join(', ');

        const mergeInfo = updatedCount > 0 
          ? ` (${newCount} new, ${updatedCount} updated)` 
          : '';

        showMsg(`${importingCustomerName}: Imported ${parts}${mergeInfo}`, 'success');
        setShowImportModal(false);
        
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        // Reload data
        await loadImports();
      } else {
        showMsg(result.error || 'Import failed', 'error');
      }
    } catch (error) {
      showMsg('Error importing: ' + error.message, 'error');
    } finally {
      setImportProgress(false);
    }
  };

  const filteredImports = imports.filter(imp => {
    if (filter === 'imported' && !imp.has_import) return false;
    if (filter === 'none' && imp.has_import) return false;
    if (search) {
      const s = search.toLowerCase();
      return imp.customer_name.toLowerCase().includes(s) || 
             (imp.customer_location || '').toLowerCase().includes(s);
    }
    return true;
  });

  const totalCustomers = imports.length;
  const customersWithImports = imports.filter(i => i.has_import).length;
  const customersWithout = totalCustomers - customersWithImports;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner h-12 w-12"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Message Toast */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl max-w-md animate-fadeIn ${
          message.type === 'success' ? 'bg-green-600/90 text-white' : 
          message.type === 'error' ? 'bg-red-600/90 text-white' : 
          'bg-blue-600/90 text-white'
        }`}>
          {message.text}
        </div>
      )}

      <div className="mb-8 animate-fadeIn">
        <h1 className="text-4xl font-bold gradient-text mb-2">System Registry</h1>
        <p className="text-gray-400">View and manage system registry imports for all customers</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-sm text-gray-400 mb-1">Total Customers</div>
          <div className="text-2xl font-bold text-gray-100">{totalCustomers}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-400 mb-1">With System Registry</div>
          <div className="text-2xl font-bold text-green-400">{customersWithImports}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-400 mb-1">No Import Yet</div>
          <div className="text-2xl font-bold text-yellow-400">{customersWithout}</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="card mb-6">
        <div className="p-4 flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <button 
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All ({totalCustomers})
            </button>
            <button 
              onClick={() => setFilter('imported')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'imported' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Imported ({customersWithImports})
            </button>
            <button 
              onClick={() => setFilter('none')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'none' ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              No Import ({customersWithout})
            </button>
          </div>
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-dark flex-1 min-w-[200px]"
          />
        </div>
      </div>

      {/* Imports Table */}
      <div className="card">
        <div className="card-header flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-100">System Registry Imports</h2>
          <span className="text-sm text-gray-400">{filteredImports.length} customers</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table-dark">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th className="text-center">WS</th>
                <th className="text-center">CTRL</th>
                <th className="text-center">SW</th>
                <th className="text-center">CIOC</th>
                <th className="text-center">I/O</th>
                <th className="text-center">Total</th>
                <th>Last Import</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredImports.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-12 text-gray-400">
                    {search ? 'No customers match your search.' : 'No customers found.'}
                  </td>
                </tr>
              ) : (
                filteredImports.map((record) => (
                  <tr key={record.customer_id}>
                    <td>
                      <Link
                        to={`/customer/${record.customer_id}`}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        {record.customer_name}
                      </Link>
                      {record.customer_location && (
                        <div className="text-xs text-gray-500 mt-0.5">{record.customer_location}</div>
                      )}
                    </td>
                    <td>
                      {record.has_import ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                          Imported
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-600/40 text-gray-400 border border-gray-600/30">
                          None
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className={record.workstations > 0 ? 'text-cyan-400 font-medium' : 'text-gray-600'}>{record.workstations}</span>
                    </td>
                    <td className="text-center">
                      <span className={record.controllers > 0 ? 'text-cyan-400 font-medium' : 'text-gray-600'}>{record.controllers}</span>
                    </td>
                    <td className="text-center">
                      <span className={record.smart_switches > 0 ? 'text-cyan-400 font-medium' : 'text-gray-600'}>{record.smart_switches}</span>
                    </td>
                    <td className="text-center">
                      <span className={record.charms_io_cards > 0 ? 'text-cyan-400 font-medium' : 'text-gray-600'}>{record.charms_io_cards}</span>
                    </td>
                    <td className="text-center">
                      <span className={record.io_devices > 0 ? 'text-cyan-400 font-medium' : 'text-gray-600'}>{record.io_devices}</span>
                    </td>
                    <td className="text-center">
                      <span className={record.total_all > 0 ? 'text-white font-bold' : 'text-gray-600'}>{record.total_all}</span>
                    </td>
                    <td className="text-sm text-gray-400 whitespace-nowrap">
                      {record.last_import 
                        ? new Date(record.last_import).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-gray-600">--</span>
                      }
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openImportModal(record.customer_id, record.customer_name)}
                          className="px-3 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all"
                          title={record.has_import ? 'Update system registry (adds new, updates existing)' : 'Import system registry'}
                        >
                          {record.has_import ? 'Update' : 'Import'}
                        </button>
                        {record.has_import && (
                          <Link
                            to={`/system-registry/${record.customer_id}`}
                            className="px-3 py-1 rounded text-xs font-medium bg-gray-600 hover:bg-gray-500 text-white transition-all"
                          >
                            View
                          </Link>
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

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-100">
                    {imports.find(i => i.customer_id === importingCustomerId)?.has_import 
                      ? 'Update System Registry' 
                      : 'Import System Registry'}
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">{importingCustomerName}</p>
                </div>
                <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
              </div>
            </div>
            
            <form onSubmit={handleImport} className="p-6">
              {imports.find(i => i.customer_id === importingCustomerId)?.has_import && (
                <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                  <p className="text-sm text-blue-300">
                    This customer already has imported data. Re-importing will <strong>add any new nodes</strong> and <strong>update existing ones</strong> without affecting cabinet assignments.
                  </p>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Upload XML File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  name="xml_file"
                  accept=".xml,.txt"
                  className="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-500 file:cursor-pointer"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Or Paste XML Data
                </label>
                <textarea
                  name="xml_data"
                  rows="8"
                  className="input-dark w-full font-mono text-xs"
                  placeholder="Paste XML content here..."
                ></textarea>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importProgress}
                  className="btn btn-primary"
                >
                  {importProgress ? (
                    <span className="flex items-center gap-2">
                      <span className="spinner h-4 w-4"></span>
                      Importing...
                    </span>
                  ) : (
                    imports.find(i => i.customer_id === importingCustomerId)?.has_import 
                      ? 'Update Import' 
                      : 'Import'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
