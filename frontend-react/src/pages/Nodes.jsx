import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function Nodes() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewNodeModal, setShowNewNodeModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    loadNodesData();
  }, [customerId]);

  const loadNodesData = async () => {
    try {
      const [customerData, nodesData] = await Promise.all([
        api.getCustomer(customerId),
        api.getNodes(customerId),
      ]);
      setCustomer(customerData);
      setNodes(nodesData);
    } catch (error) {
      console.error('Error loading nodes:', error);
      showMessage('Error loading nodes data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateNode = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      const result = await api.createNode(customerId, data);
      if (result.success) {
        soundSystem.playSuccess();
        setShowNewNodeModal(false);
        loadNodesData();
        showMessage('Node created successfully', 'success');
        e.target.reset();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error creating node', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error creating node', 'error');
    }
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    
    // Get file or text input
    const fileInput = e.target.csv_file.files[0];
    const textInput = e.target.csv_data.value;
    
    let csvText = '';
    
    if (fileInput) {
      // Read file
      const reader = new FileReader();
      reader.onload = async (event) => {
        csvText = event.target.result;
        await processCSVImport(csvText);
      };
      reader.readAsText(fileInput);
      return;
    } else if (textInput) {
      csvText = textInput;
      await processCSVImport(csvText);
    } else {
      showMessage('Please select a file or paste CSV data', 'error');
    }
  };

  const processCSVImport = async (csvText) => {
    try {
      const lines = csvText.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        showMessage('CSV must have header and at least one row', 'error');
        return;
      }

      // Parse header
      const headers = lines[0].split(',').map(h => h.trim());
      
      // Parse nodes (allow rows with fewer columns so numeric-first node names aren't skipped)
      const nodes = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const rawName = values[0] != null ? String(values[0]).trim().replace(/^"|"$/g, '') : '';
        if (!rawName) continue;
        
        const node = {
          node_name: rawName,
          node_type: (values[1] != null ? String(values[1]).trim() : '') || '',
          model: (values[2] != null ? String(values[2]).trim() : '') || '',
          description: (values[3] != null ? String(values[3]).trim() : '') || '',
          serial: (values[4] != null ? String(values[4]).trim() : '') || '',
          firmware: (values[5] != null ? String(values[5]).trim() : '') || '',
          version: (values[6] != null ? String(values[6]).trim() : '') || '',
          status: (values[7] != null ? String(values[7]).trim() : '') || '',
          is_redundant: (values[8] != null ? String(values[8]).trim().toLowerCase() : '') === 'yes',
          os_name: (values[9] != null ? String(values[9]).trim() : '') || '',
          os_service_pack: (values[10] != null ? String(values[10]).trim() : '') || '',
          bios_version: (values[11] != null ? String(values[11]).trim() : '') || '',
          oem_type_description: (values[12] != null ? String(values[12]).trim() : '') || '',
        };
        nodes.push(node);
      }

      if (nodes.length === 0) {
        showMessage('No valid nodes found in CSV', 'error');
        return;
      }

      showMessage(`Importing ${nodes.length} nodes...`, 'info');
      
      const result = await api.bulkImportNodes(customerId, nodes);
      
      if (result.success) {
        soundSystem.playSuccess();
        setShowBulkImportModal(false);
        loadNodesData();
        showMessage(`Successfully imported ${result.imported || nodes.length} nodes`, 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error importing nodes', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error importing nodes: ' + error.message, 'error');
    }
  };

  const handleUpdateNode = async (e) => {
    e.preventDefault();
    if (!editingNode) return;
    const formData = new FormData(e.target);
    const data = {
      node_type: formData.get('node_type') || null,
      model: formData.get('model') || null,
      description: formData.get('description') || null,
      serial: formData.get('serial') || null,
      firmware: formData.get('firmware') || null,
      version: formData.get('version') || null,
      status: formData.get('status') || null,
      redundant: formData.get('redundant') ? 'Yes' : null,
      os_name: formData.get('os_name') || null,
      os_service_pack: formData.get('os_service_pack') || null,
      bios_version: formData.get('bios_version') || null,
      oem_type_description: formData.get('oem_type_description') || null,
    };
    try {
      const result = await api.updateNode(editingNode.id, data);
      if (result.success) {
        soundSystem.playSuccess();
        setEditingNode(null);
        loadNodesData();
        showMessage('Node updated', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error updating node', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error updating node: ' + error.message, 'error');
    }
  };

  const handleDeleteNode = async (nodeId) => {
    if (!confirm('Delete this node?')) return;

    try {
      const result = await api.deleteNode(nodeId);
      if (result.success) {
        soundSystem.playSuccess();
        loadNodesData();
        showMessage('Node deleted successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error deleting node', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error deleting node', 'error');
    }
  };

  const filteredNodes = nodes.filter((node) => {
    const matchesSearch =
      node.node_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !filterType || node.node_type === filterType;
    return matchesSearch && matchesType;
  });

  const nodeTypes = ['Controller', 'CIOC', 'CSLS', 'SZ Controller', 'Charms Smart Logic Solver', 'DeltaV EIOC', 'Wireless', 'Local Operator', 'Local ProfessionalPlus', 'Power Supply', 'Operator', 'Application', 'Other'];

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
          <h1 className="text-4xl font-bold gradient-text mb-2">🖥️ Node Management</h1>
          {customer && <p className="text-gray-400 text-lg">{customer.name}</p>}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowBulkImportModal(true)}
            className="btn btn-success"
          >
            📤 Import from CSV
          </button>
          <button
            onClick={() => setShowNewNodeModal(true)}
            className="btn btn-primary"
          >
            ➕ Add Node
          </button>
          {nodes.length > 0 && (
            <button
              onClick={async () => {
                if (!confirm(`Delete ALL ${nodes.length} nodes for this customer? This cannot be undone.`)) return;
                try {
                  const result = await api.deleteAllNodes(customerId);
                  if (result.success) {
                    soundSystem.playSuccess();
                    loadNodesData();
                    showMessage(`Deleted ${result.deleted || nodes.length} nodes`, 'success');
                  } else {
                    soundSystem.playError();
                    showMessage('Error deleting nodes', 'error');
                  }
                } catch (error) {
                  soundSystem.playError();
                  showMessage('Error deleting nodes', 'error');
                }
              }}
              className="btn btn-danger"
            >
              🗑️ Delete All
            </button>
          )}
          {customer && (
            <button
              onClick={() => navigate(`/customer/${customer.id}`)}
              className="btn btn-secondary"
            >
              ← Back
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-blue-400">{nodes.length}</div>
              <div className="text-sm text-gray-400">Total Nodes</div>
            </div>
            <div className="text-4xl">🖥️</div>
          </div>
        </div>
        {nodeTypes.slice(0, 3).map((type) => (
          <div key={type} className="stats-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-purple-400">
                  {nodes.filter((n) => n.node_type === type).length}
                </div>
                <div className="text-sm text-gray-400">{type}s</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="🔍 Search nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="form-select"
            >
              <option value="">All Types</option>
              {nodeTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Nodes Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-xl font-semibold text-gray-100">Nodes List</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table-dark">
            <thead>
              <tr>
                <th>Node Name</th>
                <th>Type</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-gray-400">
                    No nodes found. Add your first node or import from CSV.
                  </td>
                </tr>
              ) : (
                filteredNodes.map((node) => (
                  <tr key={node.id}>
                    <td className="font-medium text-gray-200">{node.node_name}</td>
                    <td>
                      <span className={`badge badge-blue ${!node.node_type?.trim() ? 'opacity-75' : ''}`}>
                        {node.node_type?.trim() || 'Not available'}
                      </span>
                    </td>
                    <td className="text-sm">{node.description?.trim() || 'Not available'}</td>
                    <td>
                      <span className={`badge ${(node.is_redundant ?? node.redundant) ? 'badge-red' : 'badge-green'}`}>
                        {(node.is_redundant ?? node.redundant) ? 'Redundant' : 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setEditingNode(node)}
                          className="text-amber-400 hover:text-amber-300 font-medium"
                          title="Categorize / edit type and description"
                        >
                          Edit
                        </button>
                        {node.assigned_cabinet_id ? (
                          <button
                            onClick={async () => {
                              if (!confirm('Unassign this node from its cabinet?')) return;
                              try {
                                const result = await api.request(`/api/nodes/${node.id}/unassign`, {
                                  method: 'POST',
                                });
                                if (result.success) {
                                  soundSystem.playSuccess();
                                  loadNodesData();
                                  showMessage('Node unassigned', 'success');
                                } else {
                                  soundSystem.playError();
                                  showMessage('Error unassigning node', 'error');
                                }
                              } catch (error) {
                                soundSystem.playError();
                                showMessage('Error unassigning node', 'error');
                              }
                            }}
                            className="text-yellow-400 hover:text-yellow-300 font-medium"
                          >
                            Unassign
                          </button>
                        ) : (
                          <button
                            onClick={() => showMessage('Assign node from cabinet inspection page', 'info')}
                            className="text-green-400 hover:text-green-300 font-medium"
                          >
                            Available
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteNode(node.id)}
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

      {/* New Node Modal */}
      {showNewNodeModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">➕ New Node</h3>
              <button
                onClick={() => setShowNewNodeModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateNode}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Node Name *</label>
                  <input
                    type="text"
                    name="node_name"
                    required
                    placeholder="e.g., PLC-001"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Node Type *</label>
                  <select name="node_type" required className="form-select">
                    <option value="">Select type...</option>
                    {nodeTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <textarea
                    name="description"
                    rows="3"
                    placeholder="Optional description..."
                    className="form-textarea"
                  ></textarea>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="is_redundant"
                    id="is_redundant"
                    className="w-4 h-4"
                  />
                  <label htmlFor="is_redundant" className="text-gray-300">
                    Mark as Redundant
                  </label>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewNodeModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Categorize Node Modal */}
      {editingNode && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-semibold text-gray-100">✏️ Categorize node: {editingNode.node_name}</h3>
              <button
                onClick={() => setEditingNode(null)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleUpdateNode} className="flex flex-col min-h-0">
              <div className="px-6 py-4 space-y-4 overflow-y-auto">
                <div>
                  <label className="form-label">Node Type</label>
                  <select name="node_type" className="form-select" defaultValue={editingNode.node_type ?? ''}>
                    <option value="">Not available</option>
                    {nodeTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <textarea
                    name="description"
                    rows="2"
                    placeholder="e.g. DeltaV SZ Controller, Windows Server..."
                    className="form-textarea"
                    defaultValue={editingNode.description ?? ''}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Model</label>
                    <input type="text" name="model" className="form-input" defaultValue={editingNode.model ?? ''} placeholder="e.g. VE3007" />
                  </div>
                  <div>
                    <label className="form-label">Serial</label>
                    <input type="text" name="serial" className="form-input" defaultValue={editingNode.serial ?? ''} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Firmware</label>
                    <input type="text" name="firmware" className="form-input" defaultValue={editingNode.firmware ?? ''} />
                  </div>
                  <div>
                    <label className="form-label">Version</label>
                    <input type="text" name="version" className="form-input" defaultValue={editingNode.version ?? ''} />
                  </div>
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <input type="text" name="status" className="form-input" defaultValue={editingNode.status ?? ''} placeholder="e.g. Current" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">OS Name</label>
                    <input type="text" name="os_name" className="form-input" defaultValue={editingNode.os_name ?? ''} placeholder="e.g. Windows 10 Enterprise" />
                  </div>
                  <div>
                    <label className="form-label">OS Service Pack</label>
                    <input type="text" name="os_service_pack" className="form-input" defaultValue={editingNode.os_service_pack ?? ''} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">BIOS Version</label>
                    <input type="text" name="bios_version" className="form-input" defaultValue={editingNode.bios_version ?? ''} />
                  </div>
                  <div>
                    <label className="form-label">OEM Type</label>
                    <input type="text" name="oem_type_description" className="form-input" defaultValue={editingNode.oem_type_description ?? ''} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="redundant"
                    id="edit_redundant"
                    className="w-4 h-4"
                    defaultChecked={!!(editingNode.redundant || editingNode.is_redundant)}
                  />
                  <label htmlFor="edit_redundant" className="text-gray-300">Redundant</label>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setEditingNode(null)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-3xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📤 Bulk Import Nodes from CSV</h3>
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
                  <label className="form-label">Upload CSV File</label>
                  <input
                    type="file"
                    name="csv_file"
                    accept=".csv,.txt"
                    className="form-input"
                  />
                  <p className="text-sm text-gray-400 mt-2">
                    💡 Select your DeltaV Physical Network CSV export
                  </p>
                </div>
                
                <div className="text-center text-gray-500">OR</div>
                
                <div>
                  <label className="form-label">Paste CSV Data</label>
                  <textarea
                    name="csv_data"
                    rows="10"
                    placeholder="Node Name,Type,Model,Description,Serial,Firmware,Version,Status,Redundant,OS Name&#10;CTRL_A,Controller,VE3007,DeltaV MX Controller,K245060181,Rev 7.19,15.0,Current,Yes,NA&#10;..."
                    className="form-textarea font-mono text-sm"
                  ></textarea>
                  <p className="text-sm text-gray-400 mt-2">
                    💡 Or paste CSV data directly (DeltaV format)
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
                  📤 Import Nodes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
