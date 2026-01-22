import { useState, useEffect } from 'react';
import soundSystem from '../utils/sounds';

export default function NodeMaintenance({ sessionId, customerId, isCompleted }) {
  const [nodes, setNodes] = useState([]);
  const [maintenanceData, setMaintenanceData] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState(null);

  useEffect(() => {
    loadData();
  }, [sessionId, customerId]);

  const loadData = async () => {
    try {
      // Load nodes
      const nodesResponse = await fetch(`/api/customers/${customerId}/nodes?sessionId=${sessionId}`);
      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json();
        console.log('Nodes data received:', nodesData);
        // Ensure it's an array
        const nodesArray = Array.isArray(nodesData) ? nodesData : [];
        // Filter out partner controllers
        const filtered = nodesArray.filter((n) => !n.node_name?.endsWith('-partner'));
        setNodes(filtered);
      }

      // Load maintenance data
      const maintenanceResponse = await fetch(`/api/sessions/${sessionId}/node-maintenance`);
      if (maintenanceResponse.ok) {
        const data = await maintenanceResponse.json();
        console.log('Maintenance data received:', data);
        
        // Check if it's already an object (expected format) or needs conversion
        if (typeof data === 'object' && !Array.isArray(data)) {
          // Already in {nodeId: {data}} format
          setMaintenanceData(data);
        } else if (Array.isArray(data)) {
          // Convert array to object format
          const mapped = {};
          data.forEach((item) => {
            mapped[item.node_id] = item;
          });
          setMaintenanceData(mapped);
        } else {
          console.warn('Unexpected maintenance data format:', data);
          setMaintenanceData({});
        }
      }
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
        await performSave(allMaintenanceData, nodeId, field, value);
      }, 1000); // Wait 1 second after user stops typing
      
      setSaveTimeout(timeout);
      return;
    }

    // For checkboxes, save immediately
    await performSave(allMaintenanceData, nodeId, field, value);
  };

  const performSave = async (dataToSave, nodeId, field, value) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/node-maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dataToSave),
      });

      if (response.ok) {
        console.log('✅ Auto-saved node:', nodeId, field, value);
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
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-bold text-gray-100">🖥️ Equipment Maintenance Checklist</h3>
          <p className="text-sm text-gray-400 mt-1">
            {saving && '💾 Auto-saving...'}
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
            <div className="card">
              <div className="card-header flex justify-between">
                <h4 className="text-lg font-semibold text-gray-100">🎛️ Controllers</h4>
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
              <div className="overflow-x-auto relative">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700 sticky top-0 z-10 shadow-lg">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Controller</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Type</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Serial</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Performance</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">DV HF</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Redundancy</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Cold Restart</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Errors</th>
                      <th className="px-3 py-2 text-center text-xs text-green-400 bg-gray-700">✓ Done</th>
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
                              onChange={(e) => autoSave(controller.id, 'hf_updated', e.target.checked)}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.redundancy_checked || false}
                              onChange={(e) => autoSave(controller.id, 'redundancy_checked', e.target.checked)}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.cold_restart_checked || false}
                              onChange={(e) => autoSave(controller.id, 'cold_restart_checked', e.target.checked)}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.no_errors_checked === false}
                              onChange={(e) => {
                                // Invert: Checking "Errors" box means HAS errors, so no_errors_checked = false
                                autoSave(controller.id, 'no_errors_checked', !e.target.checked);
                              }}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.completed || false}
                              onChange={(e) => {
                                autoSave(controller.id, 'completed', e.target.checked);
                                if (e.target.checked) soundSystem.playSuccess();
                              }}
                              disabled={isCompleted}
                              className="w-5 h-5"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Computers Table */}
          {filteredComputers.length > 0 && (
            <div className="card">
              <div className="card-header flex justify-between">
                <h4 className="text-lg font-semibold text-gray-100">💻 Computers & Workstations</h4>
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
              <div className="overflow-x-auto relative">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700 sticky top-0 z-10 shadow-lg">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Computer</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Type</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Model</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">DV HF</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">OS Update</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">McAfee</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">HDD Replaced</th>
                      <th className="px-3 py-2 text-center text-xs text-green-400 bg-gray-700">✓ Done</th>
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
                              onChange={(e) => autoSave(computer.id, 'dv_checked', e.target.checked)}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.os_checked || false}
                              onChange={(e) => autoSave(computer.id, 'os_checked', e.target.checked)}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.macafee_checked || false}
                              onChange={(e) => autoSave(computer.id, 'macafee_checked', e.target.checked)}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.hdd_replaced || false}
                              onChange={(e) => autoSave(computer.id, 'hdd_replaced', e.target.checked)}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.completed || false}
                              onChange={(e) => {
                                autoSave(computer.id, 'completed', e.target.checked);
                                if (e.target.checked) soundSystem.playSuccess();
                              }}
                              disabled={isCompleted}
                              className="w-5 h-5"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Switches Table */}
          {filteredSwitches.length > 0 && (
            <div className="card">
              <div className="card-header flex justify-between">
                <h4 className="text-lg font-semibold text-gray-100">🔌 Network Switches</h4>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (isCompleted) return;
                      for (const switchNode of filteredSwitches) {
                        await autoSave(switchNode.id, 'firmware_updated_checked', true);
                      }
                      soundSystem.playSuccess();
                      showMessage('All switches firmware checked!', 'success');
                    }}
                    disabled={isCompleted}
                    className="btn btn-secondary btn-sm text-xs"
                  >
                    All Firmware
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
              <div className="overflow-x-auto relative">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700 sticky top-0 z-10 shadow-lg">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Switch</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-300 bg-gray-700">Serial</th>
                      <th className="px-3 py-2 text-center text-xs text-gray-300 bg-gray-700">Firmware Updated</th>
                      <th className="px-3 py-2 text-center text-xs text-green-400 bg-gray-700">✓ Done</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredSwitches.map((switchNode) => {
                      const maint = maintenanceData[switchNode.id] || {};
                      const isDone = maint.completed;
                      
                      return (
                        <tr key={switchNode.id} className={isDone ? 'bg-green-900/20' : 'bg-gray-800 hover:bg-gray-700/50'}>
                          <td className="px-3 py-2 text-gray-200 font-medium">{switchNode.node_name}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{switchNode.serial || 'N/A'}</td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.firmware_updated_checked || false}
                              onChange={(e) => autoSave(switchNode.id, 'firmware_updated_checked', e.target.checked)}
                              disabled={isCompleted}
                              className="w-4 h-4"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={maint.completed || false}
                              onChange={(e) => {
                                autoSave(switchNode.id, 'completed', e.target.checked);
                                if (e.target.checked) soundSystem.playSuccess();
                              }}
                              disabled={isCompleted}
                              className="w-5 h-5"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
