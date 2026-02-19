import { useState, useEffect, useRef } from 'react';
import soundSystem from '../utils/sounds';

export default function NodeMaintenance({ sessionId, customerId, isCompleted }) {
  const [nodes, setNodes] = useState([]);
  const [maintenanceData, setMaintenanceData] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState(null);
  const [showCustomController, setShowCustomController] = useState(false);
  const [showCustomComputer, setShowCustomComputer] = useState(false);
  const [showCustomSwitch, setShowCustomSwitch] = useState(false);
  const [customNode, setCustomNode] = useState({ node_name: '', node_type: '', model: '', serial: '' });

  useEffect(() => {
    loadData();
  }, [sessionId, customerId]);

  const loadData = async () => {
    try {
      // Load maintenance data first (we need it to show rows for old PMs with no snapshot)
      const maintenanceResponse = await fetch(`/api/sessions/${sessionId}/node-maintenance`);
      if (maintenanceResponse.ok) {
        const data = await maintenanceResponse.json();
        if (typeof data === 'object' && !Array.isArray(data)) {
          setMaintenanceData(data);
        } else if (Array.isArray(data)) {
          const mapped = {};
          data.forEach((item) => {
            mapped[item.node_id] = item;
          });
          setMaintenanceData(mapped);
        } else {
          setMaintenanceData({});
        }
      }

      // Load nodes (for completed sessions this returns snapshot; if empty, fall back to current nodes so we can show maintenance data)
      let nodesArray = [];
      const nodesResponse = await fetch(`/api/customers/${customerId}/nodes?sessionId=${sessionId}`);
      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json();
        nodesArray = Array.isArray(nodesData) ? nodesData : [];
      }
      // For completed sessions with empty snapshot (e.g. old PMs), use current customer nodes so line-by-line maintenance still shows
      if (isCompleted && nodesArray.length === 0) {
        const fallbackResponse = await fetch(`/api/customers/${customerId}/nodes`);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          nodesArray = Array.isArray(fallbackData) ? fallbackData : [];
        }
      }
      const filtered = nodesArray.filter((n) => !n.node_name?.endsWith('-partner'));
      setNodes(filtered);
    } catch (error) {
      console.error('Error loading:', error);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const autoSave = async (nodeId, field, value, debounce = false) => {
    if (isCompleted) return;

    // Update local state immediately
    const updatedNodeData = { ...maintenanceData[nodeId], [field]: value };
    const allMaintenanceData = {
      ...maintenanceData,
      [nodeId]: updatedNodeData,
    };
    setMaintenanceData(allMaintenanceData);

    // If debounce (for text inputs), wait before saving
    if (debounce) {
      if (saveTimeout) clearTimeout(saveTimeout);
      
      const timeout = setTimeout(async () => {
        await performSave(allMaintenanceData);
      }, 1000); // Wait 1 second after user stops typing
      
      setSaveTimeout(timeout);
      return;
    }

    // For checkboxes, save immediately
    await performSave(allMaintenanceData);
  };

  const saveTimeoutRef = useRef(null);
  const performSave = async (dataToSave) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      saveTimeoutRef.current = null;
      setSaving(true);
      try {
        const response = await fetch(`/api/sessions/${sessionId}/node-maintenance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(dataToSave),
        });
        if (response.ok) {
          // saved
        } else if (response.status === 401) {
          showMessage('Session expired. Please refresh and login again.', 'error');
        } else {
          const errorText = await response.text();
          console.error('Save failed:', response.status, errorText);
        }
      } catch (error) {
        console.error('Auto-save error:', error);
      } finally {
        setSaving(false);
      }
    }, 400);
  };

  // Bulk action functions
  const bulkCheckControllers = async (field) => {
    if (isCompleted) return;
    
    // Create completely new object to force re-render
    const updatedData = {};
    // Copy all existing data
    Object.keys(maintenanceData).forEach(key => {
      updatedData[key] = { ...maintenanceData[key] };
    });
    
    // Update all filtered controllers
    for (const controller of filteredControllers) {
      if (!updatedData[controller.id]) {
        updatedData[controller.id] = {};
      }
      updatedData[controller.id][field] = true;
    }
    
    // Force state update
    setMaintenanceData(updatedData);
    
    // Save ALL maintenance data to backend (backend expects complete data)
    console.log('💾 Saving bulk action:', field, 'for', filteredControllers.length, 'controllers');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/node-maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updatedData), // Send ALL maintenance data
      });
      
      if (response.ok) {
        console.log('✅ Bulk save successful!');
      } else {
        const errorText = await response.text();
        console.error('Bulk save failed:', response.status, errorText);
        showMessage('Save failed. Check console for details.', 'error');
      }
    } catch (err) {
      console.error('Bulk save error:', err);
      showMessage('Save failed. Check console for details.', 'error');
    }
    
    soundSystem.playSuccess();
    showMessage(`All controllers ${field.replace(/_/g, ' ')} checked!`, 'success');
  };

  const bulkCheckComputers = async (field) => {
    if (isCompleted) return;
    
    // Create completely new object to force re-render
    const updatedData = {};
    // Copy all existing data
    Object.keys(maintenanceData).forEach(key => {
      updatedData[key] = { ...maintenanceData[key] };
    });
    
    // Update all filtered computers
    for (const computer of filteredComputers) {
      if (!updatedData[computer.id]) {
        updatedData[computer.id] = {};
      }
      updatedData[computer.id][field] = true;
    }
    
    // Force state update
    setMaintenanceData(updatedData);
    
    // Save ALL maintenance data to backend (backend expects complete data)
    console.log('💾 Saving bulk action:', field, 'for', filteredComputers.length, 'computers');
    try {
      const response = await fetch(`/api/sessions/${sessionId}/node-maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updatedData), // Send ALL maintenance data
      });
      
      if (response.ok) {
        console.log('✅ Bulk save successful!');
      } else {
        const errorText = await response.text();
        console.error('Bulk save failed:', response.status, errorText);
        showMessage('Save failed. Check console for details.', 'error');
      }
    } catch (err) {
      console.error('Bulk save error:', err);
      showMessage('Save failed. Check console for details.', 'error');
    }
    
    soundSystem.playSuccess();
    showMessage(`All computers ${field.replace(/_/g, ' ')} checked!`, 'success');
  };

  const getControllerType = (node) => {
    const model = (node.model || '').toLowerCase();
    if (model.includes('mq') || model.includes('pk') || model.includes('sq') || model.includes('sz') || model.includes('sx'))
      return { displayType: node.model, perfType: 'perf_index', min: 1, max: 5 };
    if (model.includes('md') || model.includes('mx') || model.includes('ve'))
      return { displayType: node.model, perfType: 'free_time', min: 1, max: 100 };
    return { displayType: node.node_type, perfType: 'free_time', min: 1, max: 100 };
  };

  const addCustomNode = async (nodeType) => {
    if (!customNode.node_name.trim()) {
      showMessage('Please enter a node name', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${sessionId}/custom-node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...customNode,
          node_type: nodeType,
          customer_id: customerId
        }),
      });

      if (response.ok) {
        const newNode = await response.json();
        
        // Add the node to the list
        setNodes([...nodes, newNode]);
        
        // Reload maintenance data to get the new entry with is_custom_node flag
        const maintenanceResponse = await fetch(`/api/sessions/${sessionId}/node-maintenance`, {
          credentials: 'include'
        });
        if (maintenanceResponse.ok) {
          const data = await maintenanceResponse.json();
          setMaintenanceData(data);
        }
        
        setCustomNode({ node_name: '', node_type: '', model: '', serial: '' });
        setShowCustomController(false);
        setShowCustomComputer(false);
        setShowCustomSwitch(false);
        soundSystem.playSuccess();
        showMessage('Custom node added successfully!', 'success');
      } else {
        const errorData = await response.json();
        showMessage(errorData.error || 'Failed to add custom node', 'error');
      }
    } catch (error) {
      console.error('Error adding custom node:', error);
      showMessage('Error adding custom node', 'error');
    }
  };

  const deleteCustomNode = async (nodeId) => {
    if (!confirm('Are you sure you want to remove this custom node?')) {
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${sessionId}/custom-node/${nodeId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        // Remove from nodes list
        setNodes(nodes.filter(n => n.id !== nodeId));
        
        // Remove from maintenance data
        const updatedMaintenance = { ...maintenanceData };
        delete updatedMaintenance[nodeId];
        setMaintenanceData(updatedMaintenance);
        
        soundSystem.playSuccess();
        showMessage('Custom node removed successfully!', 'success');
      } else {
        const errorData = await response.json();
        showMessage(errorData.error || 'Failed to delete custom node', 'error');
      }
    } catch (error) {
      console.error('Error deleting custom node:', error);
      showMessage('Error deleting custom node', 'error');
    }
  };

  // Separate equipment types
  const controllers = nodes.filter((n) =>
    ['Controller', 'CIOC', 'CSLS', 'DeltaV EIOC', 'SIS'].includes(n.node_type)
  );
  
  const computers = nodes.filter((n) =>
    ['Local Operator', 'Local ProfessionalPlus', 'Local Application', 'Professional Plus', 'Application Station'].includes(n.node_type)
  );
  
  const switches = nodes.filter((n) => n.node_type === 'Smart Network Devices');

  const filteredControllers = controllers.filter((c) =>
    c.node_name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredComputers = computers.filter((c) =>
    c.node_name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredSwitches = switches.filter((s) =>
    s.node_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner h-12 w-12"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center py-3">
        <div>
          <h3 className="text-2xl font-bold text-gray-100">Equipment Maintenance Checklist</h3>
          <p className="text-sm text-gray-400 mt-1">
            {saving && 'Auto-saving...'}
          </p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-lg ${
            message.type === 'success' ? 'bg-green-900/50 text-green-200 border border-green-500' :
            message.type === 'error' ? 'bg-red-900/50 text-red-200 border border-red-500' :
            'bg-blue-900/50 text-blue-200 border border-blue-500'
          }`}>
          {message.text}
        </div>
      )}

      {/* Search */}
      <div className="card">
        <div className="card-body py-3">
          <input
            type="text"
            placeholder="🔍 Search equipment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <div className="text-6xl mb-4">🖥️</div>
            <p className="text-gray-400">No equipment found. Import nodes from customer profile.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Controllers Table */}
          {filteredControllers.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
              <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700">
                <h4 className="text-lg font-semibold text-gray-100">Controllers ({filteredControllers.length})</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => bulkCheckControllers('hf_updated')}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All HF
                  </button>
                  <button
                    onClick={() => bulkCheckControllers('redundancy_checked')}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All Redundancy
                  </button>
                  <button
                    onClick={() => bulkCheckControllers('cold_restart_checked')}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All Restart
                  </button>
                  <button
                    onClick={() => bulkCheckControllers('no_errors_checked')}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All Errors
                  </button>
                  <button
                    onClick={() => bulkCheckControllers('completed')}
                    disabled={isCompleted}
                    className="btn btn-success btn-sm text-xs"
                  >
                    All Done
                  </button>
                </div>
              </div>
              <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
                <table className="relative w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Controller</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Type</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Serial</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Performance</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">DV HF</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Redundancy</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Cold Restart</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Errors</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Notes/Reason</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-green-400 bg-gray-700">Done</th>
                      {!isCompleted && <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredControllers.map((controller) => {
                      const maint = maintenanceData[controller.id] || {};
                      const typeInfo = getControllerType(controller);
                      const isDone = maint.completed;
                      
                      return (
                        <tr key={controller.id} className={isDone ? 'bg-green-900/20' : 'bg-gray-800 hover:bg-gray-700/50'}>
                          <td className="px-3 py-2 text-gray-200 font-medium">{controller.node_name}</td>
                          <td className="px-3 py-2 text-gray-300 text-xs">
                            <span className="badge badge-blue text-xs">{typeInfo.displayType}</span>
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{controller.serial || 'N/A'}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <div className="text-xs text-center text-gray-400">
                                {typeInfo.perfType === 'perf_index' ? 'Perf Index' : 'Free Time'}
                              </div>
                              <input
                                type="number"
                                min={typeInfo.min}
                                max={typeInfo.max}
                                value={maint.performance_value || ''}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  // Update state immediately
                                  const updated = { ...maintenanceData };
                                  if (!updated[controller.id]) updated[controller.id] = {};
                                  updated[controller.id].performance_value = val;
                                  setMaintenanceData(updated);
                                }}
                                onBlur={(e) => autoSave(controller.id, 'performance_value', parseInt(e.target.value))}
                                disabled={isCompleted}
                                className="w-16 px-2 py-1 text-center bg-gray-700 border border-gray-600 rounded text-gray-200 text-sm"
                                placeholder={`${typeInfo.min}-${typeInfo.max}`}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.hf_updated || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[controller.id]) updated[controller.id] = {};
                                updated[controller.id].hf_updated = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(controller.id, 'hf_updated', e.target.checked);
                              }}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.redundancy_checked || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[controller.id]) updated[controller.id] = {};
                                updated[controller.id].redundancy_checked = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(controller.id, 'redundancy_checked', e.target.checked);
                              }}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.cold_restart_checked || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[controller.id]) updated[controller.id] = {};
                                updated[controller.id].cold_restart_checked = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(controller.id, 'cold_restart_checked', e.target.checked);
                              }}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            {(() => {
                              const noErrors = maint.no_errors_checked ?? true; // default: no errors
                              const hasErrors = !noErrors;

                              return (
                                <input
                                  type="checkbox"
                                  checked={hasErrors}
                                  onChange={(e) => {
                                    const newNoErrors = !e.target.checked; // checked Errors => noErrors=false
                                    console.log('🔧 [NodeMaintenance] Errors checkbox changed for controller:', controller.id, controller.node_name);
                                    console.log('🔧 [NodeMaintenance] Checkbox checked:', e.target.checked, '=> no_errors_checked:', newNoErrors);
                                    
                                    // Update local state immediately
                                    const updated = { ...maintenanceData };
                                    if (!updated[controller.id]) updated[controller.id] = {};
                                    updated[controller.id].no_errors_checked = newNoErrors;
                                    setMaintenanceData(updated);
                                    
                                    console.log('🔧 [NodeMaintenance] Updated local state for node:', controller.id);
                                    
                                    // Then save
                                    autoSave(controller.id, 'no_errors_checked', newNoErrors);
                                  }}
                                  disabled={isCompleted}
                                  className="w-4 h-4"
                                />
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Add notes/reason..."
                              value={maint.notes || ''}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[controller.id]) updated[controller.id] = {};
                                updated[controller.id].notes = e.target.value;
                                setMaintenanceData(updated);
                              }}
                              onBlur={(e) => autoSave(controller.id, 'notes', e.target.value, true)}
                              disabled={isCompleted}
                              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-xs"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.completed || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[controller.id]) updated[controller.id] = {};
                                updated[controller.id].completed = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(controller.id, 'completed', e.target.checked);
                                if (e.target.checked) soundSystem.playSuccess();
                              }}
                              disabled={isCompleted}
                              className="w-5 h-5"
                            />
                          </td>
                          {!isCompleted && (
                            <td className="px-3 py-2 text-center">
                              {maint.is_custom_node && (
                                <button
                                  onClick={() => deleteCustomNode(controller.id)}
                                  className="text-red-400 hover:text-red-300 text-xs"
                                  title="Delete custom node"
                                >
                                  🗑️
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!isCompleted && (
                <div className="card-footer">
                  {!showCustomController ? (
                    <button
                      onClick={() => setShowCustomController(true)}
                      className="btn btn-secondary btn-sm"
                    >
                      + Add Custom Controller
                    </button>
                  ) : (
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <h5 className="text-sm font-semibold text-gray-200 mb-3">Add Custom Controller</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Controller Name *"
                          value={customNode.node_name}
                          onChange={(e) => setCustomNode({...customNode, node_name: e.target.value})}
                          className="form-input text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Model"
                          value={customNode.model}
                          onChange={(e) => setCustomNode({...customNode, model: e.target.value})}
                          className="form-input text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Serial Number"
                          value={customNode.serial}
                          onChange={(e) => setCustomNode({...customNode, serial: e.target.value})}
                          className="form-input text-sm"
                        />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => addCustomNode('Controller')}
                          className="btn btn-success btn-sm"
                        >
                          Add Controller
                        </button>
                        <button
                          onClick={() => {
                            setShowCustomController(false);
                            setCustomNode({ node_name: '', node_type: '', model: '', serial: '' });
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Computers Table */}
          {filteredComputers.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
              <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700">
                <h4 className="text-lg font-semibold text-gray-100">Computers & Workstations ({filteredComputers.length})</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => bulkCheckComputers('dv_checked')}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All DV HF
                  </button>
                  <button
                    onClick={() => bulkCheckComputers('os_checked')}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All OS
                  </button>
                  <button
                    onClick={() => bulkCheckComputers('macafee_checked')}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All McAfee
                  </button>
                  <button
                    onClick={() => bulkCheckComputers('hdd_replaced')}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All HDD
                  </button>
                  <button
                    onClick={() => bulkCheckComputers('completed')}
                    disabled={isCompleted}
                    className="btn btn-success btn-sm text-xs"
                  >
                    All Done
                  </button>
                </div>
              </div>
              <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
                <table className="relative w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Computer</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Type</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Model</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">DV HF</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">OS Update</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">McAfee</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">HDD Replaced</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Notes/Reason</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-green-400 bg-gray-700">Done</th>
                      {!isCompleted && <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredComputers.map((computer) => {
                      const maint = maintenanceData[computer.id] || {};
                      const isDone = maint.completed;
                      
                      return (
                        <tr key={computer.id} className={isDone ? 'bg-green-900/20' : 'bg-gray-800 hover:bg-gray-700/50'}>
                          <td className="px-3 py-2 text-gray-200 font-medium">{computer.node_name}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{computer.node_type}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{computer.model || 'N/A'}</td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.dv_checked || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[computer.id]) updated[computer.id] = {};
                                updated[computer.id].dv_checked = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(computer.id, 'dv_checked', e.target.checked);
                              }}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.os_checked || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[computer.id]) updated[computer.id] = {};
                                updated[computer.id].os_checked = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(computer.id, 'os_checked', e.target.checked);
                              }}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.macafee_checked || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[computer.id]) updated[computer.id] = {};
                                updated[computer.id].macafee_checked = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(computer.id, 'macafee_checked', e.target.checked);
                              }}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.hdd_replaced || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[computer.id]) updated[computer.id] = {};
                                updated[computer.id].hdd_replaced = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(computer.id, 'hdd_replaced', e.target.checked);
                              }}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Add notes/reason..."
                              value={maint.notes || ''}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[computer.id]) updated[computer.id] = {};
                                updated[computer.id].notes = e.target.value;
                                setMaintenanceData(updated);
                              }}
                              onBlur={(e) => autoSave(computer.id, 'notes', e.target.value, true)}
                              disabled={isCompleted}
                              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-xs"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.completed || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[computer.id]) updated[computer.id] = {};
                                updated[computer.id].completed = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(computer.id, 'completed', e.target.checked);
                                if (e.target.checked) soundSystem.playSuccess();
                              }}
                              disabled={isCompleted}
                              className="w-5 h-5"
                            />
                          </td>
                          {!isCompleted && (
                            <td className="px-3 py-2 text-center">
                              {maint.is_custom_node && (
                                <button
                                  onClick={() => deleteCustomNode(computer.id)}
                                  className="text-red-400 hover:text-red-300 text-xs"
                                  title="Delete custom node"
                                >
                                  🗑️
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!isCompleted && (
                <div className="card-footer">
                  {!showCustomComputer ? (
                    <button
                      onClick={() => setShowCustomComputer(true)}
                      className="btn btn-secondary btn-sm"
                    >
                      + Add Custom Workstation
                    </button>
                  ) : (
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <h5 className="text-sm font-semibold text-gray-200 mb-3">Add Custom Workstation</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Workstation Name *"
                          value={customNode.node_name}
                          onChange={(e) => setCustomNode({...customNode, node_name: e.target.value})}
                          className="form-input text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Model"
                          value={customNode.model}
                          onChange={(e) => setCustomNode({...customNode, model: e.target.value})}
                          className="form-input text-sm"
                        />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => addCustomNode('Local Operator')}
                          className="btn btn-success btn-sm"
                        >
                          Add Workstation
                        </button>
                        <button
                          onClick={() => {
                            setShowCustomComputer(false);
                            setCustomNode({ node_name: '', node_type: '', model: '', serial: '' });
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Switches Table */}
          {filteredSwitches.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
              <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700">
                <h4 className="text-lg font-semibold text-gray-100">Network Switches ({filteredSwitches.length})</h4>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (isCompleted) return;
                      for (const switchNode of filteredSwitches) {
                        await autoSave(switchNode.id, 'firmware_updated_checked', true);
                      }
                      soundSystem.playSuccess();
                      showMessage('All switches version checked!', 'success');
                    }}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All Version
                  </button>
                  <button
                    onClick={async () => {
                      if (isCompleted) return;
                      for (const switchNode of filteredSwitches) {
                        await autoSave(switchNode.id, 'completed', true);
                      }
                      soundSystem.playSuccess();
                      showMessage('All switches marked done!', 'success');
                    }}
                    disabled={isCompleted}
                    className="btn btn-success btn-sm text-xs"
                  >
                    All Done
                  </button>
                </div>
              </div>
              <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
                <table className="relative w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Name</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Model</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Software Rev</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Hardware Rev</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Serial Number</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Version Updated</th>
                      <th className="sticky top-0 px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Notes/Reason</th>
                      <th className="sticky top-0 px-3 py-2 text-center text-xs text-green-400 bg-gray-700">Done</th>
                      {!isCompleted && <th className="sticky top-0 px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredSwitches.map((switchNode) => {
                      const maint = maintenanceData[switchNode.id] || {};
                      const isDone = maint.completed;
                      
                      return (
                        <tr key={switchNode.id} className={isDone ? 'bg-green-900/20' : 'bg-gray-800 hover:bg-gray-700/50'}>
                          <td className="px-3 py-2 text-gray-200 font-medium">{switchNode.node_name}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{switchNode.model || 'N/A'}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{switchNode.firmware || 'N/A'}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{switchNode.version || 'N/A'}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{switchNode.serial || 'N/A'}</td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.firmware_updated_checked || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[switchNode.id]) updated[switchNode.id] = {};
                                updated[switchNode.id].firmware_updated_checked = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(switchNode.id, 'firmware_updated_checked', e.target.checked);
                              }}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Add notes/reason..."
                              value={maint.notes || ''}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[switchNode.id]) updated[switchNode.id] = {};
                                updated[switchNode.id].notes = e.target.value;
                                setMaintenanceData(updated);
                              }}
                              onBlur={(e) => autoSave(switchNode.id, 'notes', e.target.value, true)}
                              disabled={isCompleted}
                              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-200 text-xs"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.completed || false}
                              onChange={(e) => {
                                const updated = { ...maintenanceData };
                                if (!updated[switchNode.id]) updated[switchNode.id] = {};
                                updated[switchNode.id].completed = e.target.checked;
                                setMaintenanceData(updated);
                                autoSave(switchNode.id, 'completed', e.target.checked);
                                if (e.target.checked) soundSystem.playSuccess();
                              }}
                              disabled={isCompleted}
                              className="w-5 h-5"
                            />
                          </td>
                          {!isCompleted && (
                            <td className="px-3 py-2 text-center">
                              {maint.is_custom_node && (
                                <button
                                  onClick={() => deleteCustomNode(switchNode.id)}
                                  className="text-red-400 hover:text-red-300 text-xs"
                                  title="Delete custom node"
                                >
                                  🗑️
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!isCompleted && (
                <div className="card-footer">
                  {!showCustomSwitch ? (
                    <button
                      onClick={() => setShowCustomSwitch(true)}
                      className="btn btn-secondary btn-sm"
                    >
                      + Add Custom Switch
                    </button>
                  ) : (
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <h5 className="text-sm font-semibold text-gray-200 mb-3">Add Custom Network Switch</h5>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Switch Name *"
                          value={customNode.node_name}
                          onChange={(e) => setCustomNode({...customNode, node_name: e.target.value})}
                          className="form-input text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Serial Number"
                          value={customNode.serial}
                          onChange={(e) => setCustomNode({...customNode, serial: e.target.value})}
                          className="form-input text-sm"
                        />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => addCustomNode('Smart Network Devices')}
                          className="btn btn-success btn-sm"
                        >
                          Add Switch
                        </button>
                        <button
                          onClick={() => {
                            setShowCustomSwitch(false);
                            setCustomNode({ node_name: '', node_type: '', model: '', serial: '' });
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
