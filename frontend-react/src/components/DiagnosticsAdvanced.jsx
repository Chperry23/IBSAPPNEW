import { useState, useEffect } from 'react';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function DiagnosticsAdvanced({ sessionId, isCompleted, customerId }) {
  const [controllers, setControllers] = useState([]);
  const [diagnostics, setDiagnostics] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  
  // Smart error modal states
  const [showAddErrorModal, setShowAddErrorModal] = useState(false);
  const [currentNode, setCurrentNode] = useState(null); // the controller/cioc node object
  const [ioDeviceData, setIoDeviceData] = useState(null); // data from the io-devices API
  const [ioLoading, setIoLoading] = useState(false);
  
  // Flow step: 'pick-device' | 'pick-card' | 'pick-card-device' | 'manual-entry' | 'pick-error'
  const [flowStep, setFlowStep] = useState('pick-device');
  const [selectedDevices, setSelectedDevices] = useState([]); // selected io devices for error
  const [selectedCard, setSelectedCard] = useState(null); // selected card group
  const [deviceSearch, setDeviceSearch] = useState('');
  
  // Manual entry states
  const [manualCardType, setManualCardType] = useState('');
  const [manualCardNumber, setManualCardNumber] = useState('');
  const [manualPort, setManualPort] = useState('');
  const [manualChannel, setManualChannel] = useState('');
  const [manualPdt, setManualPdt] = useState('');
  const [manualLdt, setManualLdt] = useState('');
  
  // Error selection
  const [selectedErrorType, setSelectedErrorType] = useState('');
  const [errorDescription, setErrorDescription] = useState('');
  
  const errorTypes = [
    { value: 'bad', label: 'Bad', icon: '❌', description: 'Component or signal is faulty' },
    { value: 'not_communicating', label: 'Not Communicating', icon: '📡', description: 'Device not responding' },
    { value: 'open_loop', label: 'Open Loop', icon: '🔓', description: 'Broken signal path' },
    { value: 'loop_current_saturated', label: 'Loop Current Saturated', icon: '⚡', description: 'Overcurrent condition' },
    { value: 'device_error', label: 'Device Error', icon: '⚙️', description: 'Hardware failure' },
    { value: 'short_circuit', label: 'Short Circuit', icon: '⚡', description: 'Electrical short' },
    { value: 'no_card', label: 'No Card', icon: '🚫', description: 'Card missing' },
  ];

  const cardTypes = [
    { value: 'devicenet', label: 'DeviceNet', portLabel: 'Port Number' },
    { value: 'hart', label: 'AI / AO / DI / DO (HART)', portLabel: 'Channel Number' },
    { value: 'fieldbus', label: 'Fieldbus', portLabel: 'Port Number' },
    { value: 'serial', label: 'Serial', portLabel: 'Port Number' },
    { value: 'eioc', label: 'EIOC', portLabel: 'PDT' },
  ];

  const normalizeMaintenance = (data) => {
    if (!data) return {};
    if (Array.isArray(data)) {
      const mapped = {};
      data.forEach((item) => { mapped[item.node_id] = item; });
      return mapped;
    }
    if (typeof data === 'object') return data;
    return {};
  };

  useEffect(() => {
    loadData();
  }, [sessionId, customerId]);

  const loadData = async () => {
    try {
      const diagResponse = await fetch(`/api/sessions/${sessionId}/diagnostics`);
      let diagData = [];
      if (diagResponse.ok) {
        diagData = await diagResponse.json() || [];
        setDiagnostics(diagData);
      }

      const maintenanceResponse = await fetch(`/api/sessions/${sessionId}/node-maintenance`);
      let controllersMarkedWithErrors = [];
      
      if (maintenanceResponse.ok) {
        const raw = await maintenanceResponse.json();
        const maintenanceData = normalizeMaintenance(raw);
        controllersMarkedWithErrors = Object.entries(maintenanceData)
          .filter(([, data]) => data?.no_errors_checked === false)
          .map(([nodeId]) => Number(nodeId));
      }

      const controllersWithIOErrors = [...new Set(diagData.map(d => d.controller_name))];
      
      const nodesResponse = await fetch(`/api/customers/${customerId}/nodes${isCompleted ? `?sessionId=${sessionId}` : ''}`);
      
      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json();
        const controllerNodes = nodesData.filter(
          (n) => {
            const isController = ['Controller', 'CIOC', 'CSLS'].includes(n.node_type);
            const notPartner = !n.node_name.endsWith('-partner');
            const hasIOError = controllersWithIOErrors.includes(n.node_name);
            const markedWithError = controllersMarkedWithErrors.includes(n.id);
            return isController && notPartner && (hasIOError || markedWithError);
          }
        );
        setNodes(controllerNodes);
        buildControllersStructure(controllerNodes, diagData);
      } else {
        buildControllersStructure([], diagData);
      }
    } catch (error) {
      console.error('Error loading diagnostics:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildControllersStructure = (nodesList, diagList) => {
    const controllerMap = {};
    diagList.forEach((diag) => {
      if (!controllerMap[diag.controller_name]) {
        controllerMap[diag.controller_name] = { name: diag.controller_name, cards: {} };
      }
      const cardKey = diag.card_number || 0;
      if (!controllerMap[diag.controller_name].cards[cardKey]) {
        controllerMap[diag.controller_name].cards[cardKey] = [];
      }
      controllerMap[diag.controller_name].cards[cardKey].push(diag);
    });
    setControllers(Object.values(controllerMap));
  };

  const showMsg = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // ─── Open the smart Add Error modal ───
  const openAddErrorModal = async (node) => {
    setCurrentNode(node);
    setSelectedDevices([]);
    setSelectedCard(null);
    setDeviceSearch('');
    setSelectedErrorType('');
    setErrorDescription('');
    setManualCardType('');
    setManualCardNumber('');
    setManualPort('');
    setManualChannel('');
    setManualPdt('');
    setManualLdt('');
    setShowAddErrorModal(true);
    setIoLoading(true);
    
    try {
      const data = await api.request(
        `/api/sessions/${sessionId}/diagnostics/io-devices/${encodeURIComponent(node.node_name)}?customerId=${customerId}`
      );
      setIoDeviceData(data);
      
      if (data.isCioc) {
        // CIOC: go straight to device list
        setFlowStep('pick-device');
      } else if (data.totalDevices > 0) {
        // Regular controller with sys_reg data: show card picker
        setFlowStep('pick-card');
      } else {
        // No data: manual entry
        setFlowStep('manual-entry');
      }
    } catch (err) {
      console.error('Error loading IO devices:', err);
      setIoDeviceData(null);
      setFlowStep('manual-entry');
    } finally {
      setIoLoading(false);
    }
  };

  const closeModal = () => {
    setShowAddErrorModal(false);
    setCurrentNode(null);
    setIoDeviceData(null);
    setSelectedDevices([]);
    setSelectedCard(null);
    setFlowStep('pick-device');
  };

  // ─── Toggle device selection ───
  const toggleDevice = (device) => {
    const key = `${device.card}-${device.device_name}-${device.channel}`;
    const exists = selectedDevices.find(d => `${d.card}-${d.device_name}-${d.channel}` === key);
    if (exists) {
      setSelectedDevices(selectedDevices.filter(d => `${d.card}-${d.device_name}-${d.channel}` !== key));
    } else {
      setSelectedDevices([...selectedDevices, device]);
    }
  };

  // ─── Save errors (smart mode - from device selection) ───
  const saveSmartErrors = async () => {
    if (!selectedErrorType) {
      showMsg('Please select an error type', 'error');
      return;
    }
    
    try {
      for (const device of selectedDevices) {
        await api.request(`/api/sessions/${sessionId}/diagnostics`, {
          method: 'POST',
          body: JSON.stringify({
            controller_name: currentNode.node_name,
            card_number: device.card ? parseInt(device.card.replace(/\D/g, '')) || 0 : 0,
            channel_number: device.channel && device.channel !== 'N/A' ? parseInt(device.channel.replace(/\D/g, '')) || null : null,
            error_type: selectedErrorType,
            error_description: errorDescription || errorTypes.find(t => t.value === selectedErrorType)?.description || '',
            bus_type: device.bus_type || null,
            device_name: device.device_name || null,
            device_type: device.device_type || null,
          }),
        });
      }
      
      soundSystem.playSuccess();
      showMsg(`Added ${selectedDevices.length} error(s) successfully`, 'success');
      closeModal();
      loadData();
    } catch (error) {
      soundSystem.playError();
      showMsg('Error saving diagnostics', 'error');
    }
  };

  // ─── Save errors (manual mode) ───
  const saveManualErrors = async () => {
    if (!selectedErrorType) {
      showMsg('Please select an error type', 'error');
      return;
    }
    
    const cardNum = parseInt(manualCardNumber) || 0;
    let channelNum = null;
    let portNum = manualPort || null;
    let busType = manualCardType || null;
    let ldt = manualLdt || null;
    
    if (manualCardType === 'hart') {
      channelNum = parseInt(manualChannel) || null;
      portNum = null;
    } else if (manualCardType === 'eioc') {
      portNum = manualPdt || null;
    } else {
      channelNum = null;
    }
    
    try {
      await api.request(`/api/sessions/${sessionId}/diagnostics`, {
        method: 'POST',
        body: JSON.stringify({
          controller_name: currentNode.node_name,
          card_number: cardNum,
          channel_number: channelNum,
          error_type: selectedErrorType,
          error_description: errorDescription || errorTypes.find(t => t.value === selectedErrorType)?.description || '',
          bus_type: busType,
          card_type: manualCardType || null,
          port_number: portNum,
          ldt: ldt,
        }),
      });
      
      soundSystem.playSuccess();
      showMsg('Error added successfully', 'success');
      closeModal();
      loadData();
    } catch (error) {
      soundSystem.playError();
      showMsg('Error saving diagnostic', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner h-12 w-12"></div>
      </div>
    );
  }

  // Filter devices for search
  const getFilteredDevices = (devices) => {
    if (!deviceSearch) return devices || [];
    const term = deviceSearch.toLowerCase();
    return (devices || []).filter(d =>
      (d.device_name || '').toLowerCase().includes(term) ||
      (d.bus_type || '').toLowerCase().includes(term) ||
      (d.device_type || '').toLowerCase().includes(term) ||
      (d.card || '').toLowerCase().includes(term) ||
      (d.channel || '').toLowerCase().includes(term)
    );
  };

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-lg ${
            message.type === 'success' ? 'bg-green-900/50 text-green-200 border border-green-500'
              : message.type === 'error' ? 'bg-red-900/50 text-red-200 border border-red-500'
              : 'bg-blue-900/50 text-blue-200 border border-blue-500'
          }`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="py-3">
        <h3 className="text-2xl font-bold text-gray-100 mb-2">I/O Error Diagnostics</h3>
        <p className="text-gray-400">Add and track I/O errors per controller using System Registry data</p>
      </div>

      {/* Controllers */}
      {nodes.length === 0 && diagnostics.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-gray-400 mb-4">
              {isCompleted ? 'No diagnostics were recorded for this session.' : 'No I/O errors found'}
            </p>
            <p className="text-gray-500 text-sm">
              {isCompleted ? 'This completed PM session has no I/O error data on file.' : 'Controllers marked with errors in the maintenance checklist will appear here.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {nodes.map((node) => {
            const nodeErrors = diagnostics.filter(d => d.controller_name === node.node_name);
            
            return (
              <div key={node.id} className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-100">
                      {node.node_name}
                      <span className="ml-2 text-xs badge badge-blue">{node.node_type}</span>
                      {node.is_redundant && <span className="ml-1 badge badge-green text-xs">Redundant</span>}
                    </h4>
                    <div className="text-sm text-gray-400 mt-1">
                      {node.model && <span className="mr-3">{node.model}</span>}
                      {nodeErrors.length} Error{nodeErrors.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {!isCompleted && (
                    <button
                      onClick={() => openAddErrorModal(node)}
                      className="btn btn-primary btn-sm"
                    >
                      + Add Error
                    </button>
                  )}
                </div>
                
                {/* Existing errors for this controller */}
                {nodeErrors.length > 0 && (
                  <div className="overflow-auto" style={{ maxHeight: '40vh' }}>
                    <table className="relative w-full text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-3 py-2">Device (DST)</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-3 py-2">Bus Type</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-3 py-2">Card</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-3 py-2">Channel</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-3 py-2">Error</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-3 py-2">Description</th>
                          {!isCompleted && <th className="sticky top-0 bg-gray-700 text-center text-xs text-gray-300 px-3 py-2">Del</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {nodeErrors.map((error) => (
                          <tr key={error.id} className="bg-gray-800 hover:bg-gray-700/50">
                            <td className="px-3 py-2 text-gray-200 font-medium">{error.device_name || '-'}</td>
                            <td className="px-3 py-2 text-gray-400 text-xs">{error.bus_type || '-'}</td>
                            <td className="px-3 py-2 text-gray-300">{error.card_number || '-'}</td>
                            <td className="px-3 py-2 text-gray-300">{error.channel_number ?? '-'}</td>
                            <td className="px-3 py-2">
                              <span className="badge badge-red text-xs">
                                {error.error_type.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-400 text-xs">{error.error_description || '-'}</td>
                            {!isCompleted && (
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={async () => {
                                    if (!confirm('Delete this error?')) return;
                                    try {
                                      await api.request(`/api/sessions/${sessionId}/diagnostics/${error.id}`, { method: 'DELETE' });
                                      soundSystem.playSuccess();
                                      loadData();
                                    } catch (err) {
                                      soundSystem.playError();
                                      showMsg('Error deleting', 'error');
                                    }
                                  }}
                                  className="text-red-400 hover:text-red-300 text-xs"
                                >
                                  X
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full Error Log */}
      {diagnostics.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
          <div className="px-4 py-3 border-b border-gray-700">
            <h4 className="text-lg font-semibold text-gray-100">Complete Error Log ({diagnostics.length})</h4>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
            <table className="relative w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-4 py-2">Controller</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-4 py-2">Device (DST)</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-4 py-2">Bus Type</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-4 py-2">Card</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-4 py-2">Channel</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-4 py-2">Error Type</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-4 py-2">Description</th>
                  {!isCompleted && <th className="sticky top-0 bg-gray-700 text-center text-xs text-gray-300 px-4 py-2">Del</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {diagnostics.map((error) => (
                  <tr key={error.id} className="bg-gray-800 hover:bg-gray-700/50">
                    <td className="font-medium text-gray-200 px-4 py-2">{error.controller_name}</td>
                    <td className="text-gray-200 px-4 py-2">{error.device_name || '-'}</td>
                    <td className="text-gray-400 text-xs px-4 py-2">{error.bus_type || '-'}</td>
                    <td className="text-gray-300 px-4 py-2">{error.card_number || '-'}</td>
                    <td className="text-gray-300 px-4 py-2">{error.channel_number ?? '-'}</td>
                    <td className="px-4 py-2">
                      <span className="badge badge-red text-xs">
                        {error.error_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="text-sm text-gray-400 px-4 py-2">{error.error_description || '-'}</td>
                    {!isCompleted && (
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={async () => {
                            if (!confirm('Delete this error?')) return;
                            try {
                              await api.request(`/api/sessions/${sessionId}/diagnostics/${error.id}`, { method: 'DELETE' });
                              soundSystem.playSuccess();
                              loadData();
                            } catch (err) {
                              soundSystem.playError();
                              showMsg('Error deleting', 'error');
                            }
                          }}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SMART ADD ERROR MODAL                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showAddErrorModal && currentNode && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl mx-4 border border-gray-700 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">
                  Add I/O Error - {currentNode.node_name}
                </h3>
                <div className="text-sm text-gray-400">
                  {currentNode.node_type}{currentNode.model ? ` | ${currentNode.model}` : ''}
                  {ioDeviceData && ` | ${ioDeviceData.totalDevices} devices from System Registry`}
                </div>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-200 text-2xl">×</button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {ioLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="spinner h-8 w-8"></div>
                  <span className="ml-3 text-gray-400">Loading I/O device data...</span>
                </div>
              ) : flowStep === 'pick-error' ? (
                /* ─── ERROR TYPE SELECTION ─── */
                <div>
                  <h4 className="text-gray-200 font-medium mb-1">Select Error Type</h4>
                  <p className="text-gray-500 text-sm mb-4">
                    {selectedDevices.length > 0
                      ? `Applying to ${selectedDevices.length} device(s): ${selectedDevices.map(d => d.device_name || d.card).join(', ')}`
                      : manualCardNumber
                      ? `Card ${manualCardNumber} (${manualCardType})`
                      : 'Manual entry'}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {errorTypes.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => { setSelectedErrorType(type.value); setErrorDescription(type.description); }}
                        className={`p-4 rounded-lg border transition-all text-left ${
                          selectedErrorType === type.value
                            ? 'bg-blue-600 border-blue-400'
                            : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-2xl mb-1">{type.icon}</div>
                        <div className="text-sm font-medium text-gray-200">{type.label}</div>
                        <div className="text-xs text-gray-400 mt-1">{type.description}</div>
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="form-label">Description (optional)</label>
                    <textarea
                      value={errorDescription}
                      onChange={(e) => setErrorDescription(e.target.value)}
                      rows="2"
                      className="form-textarea"
                      placeholder="Additional details..."
                    ></textarea>
                  </div>
                </div>

              ) : flowStep === 'pick-device' && ioDeviceData?.isCioc ? (
                /* ─── CIOC: FLAT DEVICE LIST ─── */
                <div>
                  <h4 className="text-gray-200 font-medium mb-3">Select Device(s) with Error</h4>
                  <input
                    type="text"
                    placeholder="Search by DST, bus type, device type..."
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                    className="form-input mb-3"
                  />
                  <div className="overflow-auto border border-gray-600 rounded-lg" style={{ maxHeight: '45vh' }}>
                    <table className="relative w-full text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300 w-8"></th>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300">Device (DST)</th>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300">Bus Type</th>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300">Device Type</th>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300">Card</th>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300">Channel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {getFilteredDevices(ioDeviceData?.devices).map((dev, idx) => {
                          const key = `${dev.card}-${dev.device_name}-${dev.channel}`;
                          const isSelected = selectedDevices.some(d => `${d.card}-${d.device_name}-${d.channel}` === key);
                          return (
                            <tr
                              key={idx}
                              onClick={() => toggleDevice(dev)}
                              className={`cursor-pointer transition-all ${isSelected ? 'bg-blue-900/40' : 'bg-gray-800 hover:bg-gray-700/50'}`}
                            >
                              <td className="px-3 py-2">
                                <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4" />
                              </td>
                              <td className="px-3 py-2 text-gray-200 font-medium">{dev.device_name || 'N/A'}</td>
                              <td className="px-3 py-2 text-xs">
                                <span className="bg-gray-600 text-gray-200 px-2 py-0.5 rounded">{dev.bus_type || 'N/A'}</span>
                              </td>
                              <td className="px-3 py-2 text-gray-400 text-xs">{dev.device_type || 'N/A'}</td>
                              <td className="px-3 py-2 text-gray-300">{dev.card || 'N/A'}</td>
                              <td className="px-3 py-2 text-gray-300">{dev.channel || 'N/A'}</td>
                            </tr>
                          );
                        })}
                        {getFilteredDevices(ioDeviceData?.devices).length === 0 && (
                          <tr><td colSpan="6" className="text-center text-gray-500 py-8">No devices found</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    {selectedDevices.length} device(s) selected
                  </div>
                </div>

              ) : flowStep === 'pick-card' ? (
                /* ─── CONTROLLER: CARD PICKER (grouped from sys_reg) ─── */
                <div>
                  <h4 className="text-gray-200 font-medium mb-3">Select a Card</h4>
                  <p className="text-gray-500 text-sm mb-4">Cards loaded from System Registry for {currentNode.node_name}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                    {(ioDeviceData?.cards || []).map((cardGroup) => (
                      <button
                        key={cardGroup.card}
                        onClick={() => {
                          setSelectedCard(cardGroup);
                          setFlowStep('pick-card-device');
                        }}
                        className="p-4 rounded-lg border bg-gray-700/30 border-gray-600 hover:border-blue-500 transition-all text-left"
                      >
                        <div className="text-lg font-bold text-gray-200">{cardGroup.card}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {cardGroup.busTypes.join(', ')}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {cardGroup.deviceCount} device{cardGroup.deviceCount !== 1 ? 's' : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setFlowStep('manual-entry')}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Card not listed? Enter manually
                  </button>
                </div>

              ) : flowStep === 'pick-card-device' && selectedCard ? (
                /* ─── CONTROLLER: DEVICES ON SELECTED CARD ─── */
                <div>
                  <button onClick={() => { setFlowStep('pick-card'); setSelectedCard(null); setSelectedDevices([]); }}
                    className="text-sm text-blue-400 hover:text-blue-300 mb-3 block">
                    Back to cards
                  </button>
                  <h4 className="text-gray-200 font-medium mb-3">
                    Devices on {selectedCard.card}
                    <span className="ml-2 text-sm text-gray-400">({selectedCard.busTypes.join(', ')})</span>
                  </h4>
                  <input
                    type="text"
                    placeholder="Search devices..."
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                    className="form-input mb-3"
                  />
                  <div className="overflow-auto border border-gray-600 rounded-lg" style={{ maxHeight: '40vh' }}>
                    <table className="relative w-full text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300 w-8"></th>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300">Device (DST)</th>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300">Bus Type</th>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300">Device Type</th>
                          <th className="sticky top-0 bg-gray-700 px-3 py-2 text-left text-xs text-gray-300">Channel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {getFilteredDevices(selectedCard.devices).map((dev, idx) => {
                          const key = `${dev.card}-${dev.device_name}-${dev.channel}`;
                          const isSelected = selectedDevices.some(d => `${d.card}-${d.device_name}-${d.channel}` === key);
                          return (
                            <tr
                              key={idx}
                              onClick={() => toggleDevice(dev)}
                              className={`cursor-pointer transition-all ${isSelected ? 'bg-blue-900/40' : 'bg-gray-800 hover:bg-gray-700/50'}`}
                            >
                              <td className="px-3 py-2">
                                <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4" />
                              </td>
                              <td className="px-3 py-2 text-gray-200 font-medium">{dev.device_name || 'N/A'}</td>
                              <td className="px-3 py-2 text-xs">
                                <span className="bg-gray-600 text-gray-200 px-2 py-0.5 rounded">{dev.bus_type || 'N/A'}</span>
                              </td>
                              <td className="px-3 py-2 text-gray-400 text-xs">{dev.device_type || 'N/A'}</td>
                              <td className="px-3 py-2 text-gray-300">{dev.channel || 'N/A'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    {selectedDevices.length} device(s) selected
                  </div>
                </div>

              ) : flowStep === 'manual-entry' ? (
                /* ─── MANUAL ENTRY ─── */
                <div>
                  {ioDeviceData?.totalDevices > 0 && (
                    <button onClick={() => setFlowStep('pick-card')}
                      className="text-sm text-blue-400 hover:text-blue-300 mb-3 block">
                      Back to card picker
                    </button>
                  )}
                  <h4 className="text-gray-200 font-medium mb-3">Manual Error Entry</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="form-label">Card Type</label>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {cardTypes.map(ct => (
                          <button
                            key={ct.value}
                            onClick={() => setManualCardType(ct.value)}
                            className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                              manualCardType === ct.value
                                ? 'bg-blue-600 border-blue-400 text-white'
                                : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {ct.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label">Card Number</label>
                        <input
                          type="number"
                          value={manualCardNumber}
                          onChange={(e) => setManualCardNumber(e.target.value)}
                          className="form-input"
                          placeholder="e.g., 1"
                        />
                      </div>
                      
                      {manualCardType === 'hart' && (
                        <div>
                          <label className="form-label">Channel Number</label>
                          <input
                            type="number"
                            value={manualChannel}
                            onChange={(e) => setManualChannel(e.target.value)}
                            className="form-input"
                            placeholder="e.g., 1"
                          />
                        </div>
                      )}
                      
                      {(manualCardType === 'devicenet' || manualCardType === 'fieldbus' || manualCardType === 'serial') && (
                        <div>
                          <label className="form-label">Port Number</label>
                          <input
                            type="text"
                            value={manualPort}
                            onChange={(e) => setManualPort(e.target.value)}
                            className="form-input"
                            placeholder="e.g., 1"
                          />
                        </div>
                      )}
                      
                      {manualCardType === 'eioc' && (
                        <>
                          <div>
                            <label className="form-label">PDT</label>
                            <input
                              type="text"
                              value={manualPdt}
                              onChange={(e) => setManualPdt(e.target.value)}
                              className="form-input"
                              placeholder="PDT identifier"
                            />
                          </div>
                        </>
                      )}
                    </div>
                    
                    {manualCardType === 'eioc' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="form-label">LDT</label>
                          <input
                            type="text"
                            value={manualLdt}
                            onChange={(e) => setManualLdt(e.target.value)}
                            className="form-input"
                            placeholder="LDT identifier"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-700 flex justify-between items-center flex-shrink-0">
              <div>
                {flowStep === 'pick-error' && (
                  <button
                    onClick={() => {
                      if (selectedDevices.length > 0) {
                        setFlowStep(ioDeviceData?.isCioc ? 'pick-device' : 'pick-card-device');
                      } else {
                        setFlowStep('manual-entry');
                      }
                    }}
                    className="btn btn-secondary"
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={closeModal} className="btn btn-secondary">Cancel</button>
                
                {flowStep === 'pick-error' ? (
                  <button
                    onClick={selectedDevices.length > 0 ? saveSmartErrors : saveManualErrors}
                    disabled={!selectedErrorType}
                    className="btn btn-primary"
                  >
                    Save Error{selectedDevices.length > 1 ? 's' : ''}
                  </button>
                ) : (flowStep === 'pick-device' || flowStep === 'pick-card-device') ? (
                  <button
                    onClick={() => setFlowStep('pick-error')}
                    disabled={selectedDevices.length === 0}
                    className="btn btn-primary"
                  >
                    Next: Select Error ({selectedDevices.length})
                  </button>
                ) : flowStep === 'manual-entry' ? (
                  <button
                    onClick={() => setFlowStep('pick-error')}
                    disabled={!manualCardType || !manualCardNumber}
                    className="btn btn-primary"
                  >
                    Next: Select Error
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
