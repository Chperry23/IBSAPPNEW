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
  
  // Modal tab: 'detected' | 'manual'
  const [addErrorTab, setAddErrorTab] = useState('detected');
  // Flow step (Detected tab): 'pick-device' | 'pick-card' | 'pick-card-device' | 'pick-error'
  const [flowStep, setFlowStep] = useState('pick-device');
  const [selectedDevices, setSelectedDevices] = useState([]); // selected io devices for error
  const [selectedCard, setSelectedCard] = useState(null); // selected card group
  const [deviceSearch, setDeviceSearch] = useState('');
  
  // Manual entry states (grid: card 1-100 single, channels 1-60 multi, port 1-5)
  const [manualCardType, setManualCardType] = useState('');
  const [manualCardNumber, setManualCardNumber] = useState(null); // single card 1-100
  const [manualChannels, setManualChannels] = useState([]); // multi-select 1-60
  const [manualPort, setManualPort] = useState(null); // 1-5 when applicable
  const [manualPdt, setManualPdt] = useState('');
  const [manualLdt, setManualLdt] = useState('');
  const [manualDst, setManualDst] = useState(''); // DST (Device) when not from registry
  
  // Error selection
  const [selectedErrorType, setSelectedErrorType] = useState('');
  const [errorDescription, setErrorDescription] = useState('');
  const [overrideDst, setOverrideDst] = useState(''); // DST to use when device doesn't have one (pick-error step)
  
  // Collapsible sections for error tables (key: node.id or 'fullLog', value: true = collapsed)
  const [collapsedSections, setCollapsedSections] = useState({});
  const toggleSection = (key) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const isCollapsed = (key, defaultCollapsed) => (collapsedSections[key] !== undefined ? collapsedSections[key] : defaultCollapsed);
  
  // Inline edit: { id, field } or null
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const saveDiagnosticField = async (error, field, value) => {
    setEditingCell(null);
    const payload = {
      controller_name: error.controller_name,
      card_number: error.card_number ?? 0,
      card_display: error.card_display || null,
      channel_number: error.channel_number,
      error_type: error.error_type,
      error_description: error.error_description || null,
      notes: error.notes || null,
      bus_type: error.bus_type || null,
      device_name: error.device_name || null,
      device_type: error.device_type || null,
      card_type: error.card_type || null,
      port_number: error.port_number || null,
      ldt: error.ldt || null,
      [field]: value,
    };
    if (field === 'channel_number') payload.channel_number = value === '' || value == null ? null : (parseInt(value, 10) || null);
    if (field === 'card_number') payload.card_number = value === '' ? 0 : (parseInt(value, 10) || 0);
    try {
      await api.request(`/api/sessions/${sessionId}/diagnostics/${error.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      soundSystem.playSuccess();
      loadData();
    } catch (err) {
      soundSystem.playError();
      showMsg('Failed to update', 'error');
    }
  };
  
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
    setManualCardNumber(null);
    setManualChannels([]);
    setManualPort(null);
    setManualPdt('');
    setManualLdt('');
    setShowAddErrorModal(true);
    setIoLoading(true);
    const hasDeviceData = (d) => d?.isCioc && (d?.cards?.length > 0 || d?.totalDevices > 0) || (d?.totalDevices > 0);
    
    try {
      const data = await api.request(
        `/api/sessions/${sessionId}/diagnostics/io-devices/${encodeURIComponent(node.node_name)}?customerId=${customerId}`
      );
      setIoDeviceData(data);
      setAddErrorTab(hasDeviceData(data) ? 'detected' : 'manual');
      if (hasDeviceData(data)) {
        if (data.isCioc) setFlowStep('pick-device');
        else setFlowStep('pick-card');
      }
    } catch (err) {
      console.error('Error loading IO devices:', err);
      setIoDeviceData(null);
      setAddErrorTab('manual');
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
    setAddErrorTab('detected');
    setFlowStep('pick-device');
  };

  // Reset manual form but stay in modal (for "add another")
  const resetManualForm = () => {
    setManualCardType('');
    setManualCardNumber(null);
    setManualChannels([]);
    setManualPort(null);
    setManualPdt('');
    setManualLdt('');
    setManualDst('');
    setSelectedErrorType('');
    setErrorDescription('');
  };

  // Reset detected flow but stay in modal
  const resetDetectedFlow = () => {
    setSelectedDevices([]);
    setSelectedCard(null);
    setSelectedErrorType('');
    setErrorDescription('');
    setFlowStep(ioDeviceData?.isCioc ? 'pick-device' : 'pick-card');
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
        const deviceName = (device.device_name && device.device_name !== 'N/A') ? device.device_name : (overrideDst?.trim() || null);
        await api.request(`/api/sessions/${sessionId}/diagnostics`, {
          method: 'POST',
          body: JSON.stringify({
            controller_name: currentNode.node_name,
            card_number: device.card ? parseInt(device.card.replace(/\D/g, '')) || 0 : 0,
            card_display: device.card && typeof device.card === 'string' ? device.card : null,
            channel_number: device.channel && device.channel !== 'N/A' ? parseInt(device.channel.replace(/\D/g, '')) || null : null,
            error_type: selectedErrorType,
            error_description: errorDescription || errorTypes.find(t => t.value === selectedErrorType)?.description || '',
            bus_type: device.bus_type || null,
            device_name: deviceName,
            device_type: device.device_type || null,
          }),
        });
      }
      
      soundSystem.playSuccess();
      showMsg(`Added ${selectedDevices.length} error(s) successfully. Add another?`, 'success');
      await loadData();
      resetDetectedFlow();
    } catch (error) {
      soundSystem.playError();
      showMsg('Error saving diagnostics', 'error');
    }
  };

  // ─── Save errors (manual mode): one card, multiple channels, port 1-5; bulk assign ───
  const saveManualErrors = async () => {
    if (!selectedErrorType) {
      showMsg('Please select an error type', 'error');
      return;
    }
    const cardNum = manualCardNumber != null ? Number(manualCardNumber) : 0;
    const busType = manualCardType || null;
    const ldt = manualLdt || null;
    const desc = errorDescription || errorTypes.find(t => t.value === selectedErrorType)?.description || '';

    const payloads = [];
    if (manualCardType === 'hart') {
      if (manualChannels.length === 0) {
        showMsg('Select at least one channel', 'error');
        return;
      }
      const deviceName = manualDst?.trim() || null;
      manualChannels.forEach((ch) => {
        payloads.push({
          controller_name: currentNode.node_name,
          card_number: cardNum,
          channel_number: ch,
          error_type: selectedErrorType,
          error_description: desc,
          bus_type: busType,
          card_type: manualCardType,
          port_number: null,
          ldt: ldt,
          device_name: deviceName,
        });
      });
    } else if (manualCardType === 'eioc') {
      payloads.push({
        controller_name: currentNode.node_name,
        card_number: cardNum,
        channel_number: manualChannels[0] ?? null,
        error_type: selectedErrorType,
        error_description: desc,
        bus_type: busType,
        card_type: manualCardType,
        port_number: manualPdt || null,
        ldt: ldt,
        device_name: manualDst?.trim() || null,
      });
    } else {
      // devicenet, fieldbus, serial: port 1-5; optional multiple channels
      const portStr = manualPort != null ? String(manualPort) : null;
      const deviceName = manualDst?.trim() || null;
      if (manualChannels.length > 0) {
        manualChannels.forEach((ch) => {
          payloads.push({
            controller_name: currentNode.node_name,
            card_number: cardNum,
            channel_number: ch,
            error_type: selectedErrorType,
            error_description: desc,
            bus_type: busType,
            card_type: manualCardType,
            port_number: portStr,
            ldt: ldt,
            device_name: deviceName,
          });
        });
      } else {
        payloads.push({
          controller_name: currentNode.node_name,
          card_number: cardNum,
          channel_number: null,
          error_type: selectedErrorType,
          error_description: desc,
          bus_type: busType,
          card_type: manualCardType,
          port_number: portStr,
          ldt: ldt,
          device_name: deviceName,
        });
      }
    }

    try {
      for (const payload of payloads) {
        await api.request(`/api/sessions/${sessionId}/diagnostics`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      soundSystem.playSuccess();
      showMsg(`Added ${payloads.length} error(s) successfully. Add another?`, 'success');
      await loadData();
      resetManualForm();
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

  // CIOC: one list row per charm/card; cards with no DST in data show as N/A, still selectable
  const ciocDeviceList = (ioDeviceData?.isCioc && ioDeviceData?.cards?.length)
    ? ioDeviceData.cards.flatMap((c) =>
        c.devices?.length
          ? c.devices
          : [{ card: c.card, device_name: 'N/A', channel: 'N/A', bus_type: 'HART', device_type: null }]
      )
    : [];

  // Chunk into baseplates of 12 (up to 8 baseplates)
  const CIOC_CHARMS_PER_BASEPLATE = 12;
  const ciocChunks = [];
  for (let i = 0; i < ciocDeviceList.length; i += CIOC_CHARMS_PER_BASEPLATE) {
    ciocChunks.push(ciocDeviceList.slice(i, i + CIOC_CHARMS_PER_BASEPLATE));
  }

  // Keys for device rows (match diagnostic keys for highlighting)
  const deviceKey = (dev) => `${dev.card ?? ''}-${dev.device_name ?? 'N/A'}-${dev.channel ?? 'N/A'}`;
  const diagnosticErrorKeys = currentNode
    ? new Set(
        diagnostics
          .filter((d) => d.controller_name === currentNode.node_name)
          .map((d) => `${(d.card_display || (d.card_number ?? '')).toString().trim()}-${(d.device_name ?? 'N/A').toString()}-${(d.channel_number != null ? d.channel_number : 'N/A').toString()}`)
      )
    : new Set();
  const charmHasError = (dev) => diagnosticErrorKeys.has(deviceKey(dev));

  const selectAllInChunk = (chunk) => {
    const keys = new Set(chunk.map(deviceKey));
    const allSelected = chunk.every((dev) => selectedDevices.some((d) => deviceKey(d) === deviceKey(dev)));
    if (allSelected) {
      setSelectedDevices(selectedDevices.filter((d) => !keys.has(deviceKey(d))));
    } else {
      const existingKeys = new Set(selectedDevices.map(deviceKey));
      const toAdd = chunk.filter((dev) => !existingKeys.has(deviceKey(dev)));
      setSelectedDevices([...selectedDevices, ...toAdd]);
    }
  };

  const filteredCiocList = getFilteredDevices(ciocDeviceList);
  const filteredChunks = [];
  for (let i = 0; i < filteredCiocList.length; i += CIOC_CHARMS_PER_BASEPLATE) {
    filteredChunks.push(filteredCiocList.slice(i, i + CIOC_CHARMS_PER_BASEPLATE));
  }

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
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggleSection(`node-${node.id}`)}
                      className="text-gray-300 hover:text-white p-1 rounded"
                      title={isCollapsed(`node-${node.id}`, nodeErrors.length > 5) ? 'Expand' : 'Collapse'}
                    >
                      <span className="text-lg leading-none">
                        {isCollapsed(`node-${node.id}`, nodeErrors.length > 5) ? '▶' : '▼'}
                      </span>
                    </button>
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
                
                {/* Existing errors for this controller - collapsible */}
                {nodeErrors.length > 0 && isCollapsed(`node-${node.id}`, nodeErrors.length > 5) && (
                  <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-700">
                    {nodeErrors.length} error{nodeErrors.length !== 1 ? 's' : ''} — click ▶ to expand
                  </div>
                )}
                {nodeErrors.length > 0 && !isCollapsed(`node-${node.id}`, nodeErrors.length > 5) && (
                  <div className="overflow-auto" style={{ maxHeight: '40vh' }}>
                    <table className="relative w-full text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Device (DST)</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Bus Type</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Card</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Port/PDT</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Channel</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">LDT</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Error</th>
                          <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Description</th>
                          {!isCompleted && <th className="sticky top-0 bg-gray-700 text-center text-xs text-gray-300 px-2 py-2 w-8">Del</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {nodeErrors.map((error) => {
                          const isEditing = (f) => !isCompleted && editingCell?.id === error.id && editingCell?.field === f;
                          const cell = (field, value, label) => {
                            const val = value ?? '-';
                            if (isEditing(field)) {
                              return (
                                <input
                                  autoFocus
                                  className="w-full px-1 py-0.5 bg-gray-700 border border-blue-500 rounded text-gray-100 text-xs"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => saveDiagnosticField(error, field, field === 'channel_number' || field === 'card_number' ? (editValue === '' ? null : parseInt(editValue, 10)) : editValue)}
                                  onKeyDown={(e) => e.key === 'Enter' && (e.target.blur(), e.preventDefault())}
                                />
                              );
                            }
                            return (
                              <span
                                className={`block min-w-[3rem] ${!isCompleted ? 'cursor-pointer hover:bg-gray-600 rounded px-1' : ''}`}
                                onClick={() => { if (!isCompleted) { setEditingCell({ id: error.id, field }); setEditValue(value ?? ''); } }}
                                title={!isCompleted ? 'Click to edit' : ''}
                              >
                                {val}
                              </span>
                            );
                          };
                          return (
                            <tr key={error.id} className="bg-gray-800 hover:bg-gray-700/50">
                              <td className="px-2 py-1.5 text-gray-200 font-medium">{cell('device_name', error.device_name)}</td>
                              <td className="px-2 py-1.5 text-gray-400 text-xs">{cell('bus_type', error.bus_type)}</td>
                              <td className="px-2 py-1.5 text-gray-300">{cell('card_display', error.card_display || error.card_number)}</td>
                              <td className="px-2 py-1.5 text-gray-300">{cell('port_number', error.port_number)}</td>
                              <td className="px-2 py-1.5 text-gray-300">{cell('channel_number', error.channel_number)}</td>
                              <td className="px-2 py-1.5 text-gray-300">{cell('ldt', error.ldt)}</td>
                              <td className="px-2 py-1.5">
                                <span className="badge badge-red text-xs">{error.error_type.replace(/_/g, ' ').toUpperCase()}</span>
                              </td>
                              <td className="px-2 py-1.5 text-gray-400 text-xs">{cell('error_description', error.error_description)}</td>
                              {!isCompleted && (
                                <td className="px-2 py-1.5 text-center">
                                  <button
                                    type="button"
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
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full Error Log - collapsible */}
      {diagnostics.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleSection('fullLog')}
              className="text-gray-300 hover:text-white p-1 rounded"
              title={isCollapsed('fullLog', diagnostics.length > 10) ? 'Expand' : 'Collapse'}
            >
              <span className="text-lg leading-none">
                {isCollapsed('fullLog', diagnostics.length > 10) ? '▶' : '▼'}
              </span>
            </button>
            <h4 className="text-lg font-semibold text-gray-100">Complete Error Log ({diagnostics.length})</h4>
          </div>
          {isCollapsed('fullLog', diagnostics.length > 10) && (
            <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-700">
              {diagnostics.length} error{diagnostics.length !== 1 ? 's' : ''} — click ▶ to expand
            </div>
          )}
          {!isCollapsed('fullLog', diagnostics.length > 10) && (
          <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
            <table className="relative w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Controller</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Device (DST)</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Bus Type</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Card</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Port/PDT</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Channel</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">LDT</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Error Type</th>
                  <th className="sticky top-0 bg-gray-700 text-left text-xs text-gray-300 px-2 py-2">Description</th>
                  {!isCompleted && <th className="sticky top-0 bg-gray-700 text-center text-xs text-gray-300 px-2 py-2 w-8">Del</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {diagnostics.map((error) => {
                  const isEditing = (f) => !isCompleted && editingCell?.id === error.id && editingCell?.field === f;
                  const fullLogCell = (field, value) => {
                    const val = value ?? '-';
                    if (isEditing(field)) {
                      return (
                        <input
                          autoFocus
                          className="w-full px-1 py-0.5 bg-gray-700 border border-blue-500 rounded text-gray-100 text-xs"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveDiagnosticField(error, field, field === 'channel_number' || field === 'card_number' ? (editValue === '' ? null : parseInt(editValue, 10)) : editValue)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target.blur(), e.preventDefault())}
                        />
                      );
                    }
                    return (
                      <span
                        className={`block min-w-[3rem] ${!isCompleted ? 'cursor-pointer hover:bg-gray-600 rounded px-1' : ''}`}
                        onClick={() => { if (!isCompleted) { setEditingCell({ id: error.id, field }); setEditValue(value ?? ''); } }}
                        title={!isCompleted ? 'Click to edit' : ''}
                      >
                        {val}
                      </span>
                    );
                  };
                  return (
                  <tr key={error.id} className="bg-gray-800 hover:bg-gray-700/50">
                    <td className="font-medium text-gray-200 px-2 py-1.5">{error.controller_name}</td>
                    <td className="text-gray-200 px-2 py-1.5">{fullLogCell('device_name', error.device_name)}</td>
                    <td className="text-gray-400 text-xs px-2 py-1.5">{fullLogCell('bus_type', error.bus_type)}</td>
                    <td className="text-gray-300 px-2 py-1.5">{fullLogCell('card_display', error.card_display || error.card_number)}</td>
                    <td className="text-gray-300 px-2 py-1.5">{fullLogCell('port_number', error.port_number)}</td>
                    <td className="text-gray-300 px-2 py-1.5">{fullLogCell('channel_number', error.channel_number)}</td>
                    <td className="text-gray-300 px-2 py-1.5">{fullLogCell('ldt', error.ldt)}</td>
                    <td className="px-2 py-1.5">
                      <span className="badge badge-red text-xs">
                        {error.error_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="text-sm text-gray-400 px-2 py-1.5">{fullLogCell('error_description', error.error_description)}</td>
                    {!isCompleted && (
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
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
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
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
                  {ioDeviceData && addErrorTab === 'detected' && ` | ${ioDeviceData.totalDevices} devices from System Registry`}
                </div>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-200 text-2xl">×</button>
            </div>

            {/* Tabs: Detected Cards | Manual Entry */}
            <div className="flex border-b border-gray-700 flex-shrink-0">
              <button
                type="button"
                onClick={() => setAddErrorTab('detected')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  addErrorTab === 'detected'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                Detected Cards
              </button>
              <button
                type="button"
                onClick={() => setAddErrorTab('manual')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  addErrorTab === 'manual'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                Manual Entry
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {ioLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="spinner h-8 w-8"></div>
                  <span className="ml-3 text-gray-400">Loading I/O device data...</span>
                </div>
              ) : addErrorTab === 'manual' ? (
                /* ─── MANUAL ENTRY TAB: card 1-100 single, channels 1-60 multi, port 1-5 ─── */
                <div className="space-y-4">
                  <h4 className="text-gray-200 font-medium">Manual Error Entry</h4>
                  <div>
                    <label className="form-label">Card Type</label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {cardTypes.map(ct => (
                        <button
                          key={ct.value}
                          type="button"
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
                  <div>
                    <label className="form-label">Card Number (1–100, select one)</label>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setManualCardNumber(manualCardNumber === n ? null : n)}
                          className={`w-9 h-9 rounded border text-sm font-medium transition-all ${
                            manualCardNumber === n
                              ? 'bg-blue-600 border-blue-400 text-white'
                              : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  {manualCardType === 'hart' && (
                    <div>
                      <label className="form-label">Channels (1–60, select multiple)</label>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {Array.from({ length: 60 }, (_, i) => i + 1).map((n) => {
                          const selected = manualChannels.includes(n);
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setManualChannels(selected ? manualChannels.filter((c) => c !== n) : [...manualChannels, n].sort((a, b) => a - b))}
                              className={`w-9 h-9 rounded border text-sm font-medium transition-all ${
                                selected ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                      {manualChannels.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Selected: {manualChannels.sort((a, b) => a - b).join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                  {(manualCardType === 'devicenet' || manualCardType === 'fieldbus' || manualCardType === 'serial') && (
                    <>
                      <div>
                        <label className="form-label">Port (1–5, select one)</label>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setManualPort(manualPort === n ? null : n)}
                              className={`w-10 h-10 rounded border text-sm font-medium transition-all ${
                                manualPort === n ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="form-label">Channels (optional, 1–60, select multiple)</label>
                        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                          {Array.from({ length: 60 }, (_, i) => i + 1).map((n) => {
                            const selected = manualChannels.includes(n);
                            return (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setManualChannels(selected ? manualChannels.filter((c) => c !== n) : [...manualChannels, n].sort((a, b) => a - b))}
                                className={`w-9 h-9 rounded border text-sm font-medium transition-all ${
                                  selected ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                                }`}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                        {manualChannels.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">Selected: {manualChannels.sort((a, b) => a - b).join(', ')}</p>
                        )}
                      </div>
                    </>
                  )}
                  {manualCardType === 'eioc' && (
                    <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <div>
                      <label className="form-label">DST (Device) – optional</label>
                      <input
                        type="text"
                        value={manualDst}
                        onChange={(e) => setManualDst(e.target.value)}
                        className="form-input"
                        placeholder="Device/DST if not from registry"
                      />
                    </div>
                    <div>
                    <label className="form-label">Error Type</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {errorTypes.map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => { setSelectedErrorType(type.value); setErrorDescription(type.description); }}
                          className={`p-3 rounded-lg border transition-all text-left ${
                            selectedErrorType === type.value ? 'bg-blue-600 border-blue-400' : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          <span className="text-lg">{type.icon}</span>
                          <span className="ml-2 text-sm font-medium text-gray-200">{type.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  </div>
                  <div>
                    <label className="form-label">Description (optional)</label>
                    <textarea
                      value={errorDescription}
                      onChange={(e) => setErrorDescription(e.target.value)}
                      rows="2"
                      className="form-textarea"
                      placeholder="Additional details..."
                    />
                  </div>
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
                  {selectedDevices.length > 0 && (
                    <div className="mb-4">
                      <label className="form-label">DST (Device) – use if device doesn&apos;t have one</label>
                      <input
                        type="text"
                        value={overrideDst}
                        onChange={(e) => setOverrideDst(e.target.value)}
                        className="form-input max-w-xs"
                        placeholder="e.g. DST name when not from registry"
                      />
                    </div>
                  )}
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
                /* ─── CIOC: charms grouped by baseplate (12 per baseplate), Select all per baseplate; rows with existing error in red ─── */
                <div>
                  <h4 className="text-gray-200 font-medium mb-3">Select charm/card(s) with error</h4>
                  <p className="text-gray-500 text-sm mb-3">Grouped by baseplate (12 charms each). Rows in red already have an error logged.</p>
                  <input
                    type="text"
                    placeholder="Search by card, DST, bus type..."
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                    className="form-input mb-3"
                  />
                  <div className="overflow-auto space-y-4" style={{ maxHeight: '45vh' }}>
                    {filteredChunks.map((chunk, chunkIndex) => {
                      const baseplateNum = chunkIndex + 1;
                      const start = chunkIndex * CIOC_CHARMS_PER_BASEPLATE + 1;
                      const end = start + chunk.length - 1;
                      const allSelected = chunk.length > 0 && chunk.every((dev) => selectedDevices.some((d) => deviceKey(d) === deviceKey(dev)));
                      return (
                        <div key={chunkIndex} className="border border-gray-600 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-700/50 border-b border-gray-600">
                            <span className="text-xs font-medium text-gray-300">Baseplate {baseplateNum} — Charms {start}–{end}</span>
                            <button
                              type="button"
                              onClick={() => selectAllInChunk(chunk)}
                              className="text-xs px-2 py-1 rounded bg-gray-600 hover:bg-blue-600 text-gray-200"
                            >
                              {allSelected ? 'Deselect all' : `Select all ${chunk.length}`}
                            </button>
                          </div>
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr>
                                <th className="bg-gray-700 px-3 py-1.5 text-left text-xs text-gray-300 w-8"></th>
                                <th className="bg-gray-700 px-3 py-1.5 text-left text-xs text-gray-300">Card</th>
                                <th className="bg-gray-700 px-3 py-1.5 text-left text-xs text-gray-300">Device (DST)</th>
                                <th className="bg-gray-700 px-3 py-1.5 text-left text-xs text-gray-300">Bus Type</th>
                                <th className="bg-gray-700 px-3 py-1.5 text-left text-xs text-gray-300">Device Type</th>
                                <th className="bg-gray-700 px-3 py-1.5 text-left text-xs text-gray-300">Channel</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                              {chunk.map((dev, idx) => {
                                const key = deviceKey(dev);
                                const isSelected = selectedDevices.some((d) => deviceKey(d) === key);
                                const hasError = charmHasError(dev);
                                return (
                                  <tr
                                    key={key + idx}
                                    onClick={() => toggleDevice(dev)}
                                    className={`cursor-pointer transition-all ${
                                      hasError ? 'bg-red-900/40 hover:bg-red-900/50' : isSelected ? 'bg-blue-900/40' : 'bg-gray-800 hover:bg-gray-700/50'
                                    }`}
                                  >
                                    <td className="px-3 py-1.5">
                                      <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4" />
                                    </td>
                                    <td className="px-3 py-1.5 text-gray-200 font-medium">{dev.card || 'N/A'}</td>
                                    <td className="px-3 py-1.5 text-gray-300">{dev.device_name || 'N/A'}</td>
                                    <td className="px-3 py-1.5 text-xs">
                                      <span className="bg-gray-600 text-gray-200 px-2 py-0.5 rounded">{dev.bus_type || 'N/A'}</span>
                                    </td>
                                    <td className="px-3 py-1.5 text-gray-400 text-xs">{dev.device_type || 'N/A'}</td>
                                    <td className="px-3 py-1.5 text-gray-300">{dev.channel || 'N/A'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                    {filteredChunks.length === 0 && (
                      <div className="text-center text-gray-500 py-8 border border-gray-600 rounded-lg">No charms/cards found</div>
                    )}
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    {selectedDevices.length} selected
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
                </div>

              ) : flowStep === 'pick-card-device' && selectedCard ? (
                /* ─── CONTROLLER / CIOC: DEVICES ON SELECTED CARD (or "card only" if no devices) ─── */
                <div>
                  <button onClick={() => { setFlowStep('pick-card'); setSelectedCard(null); setSelectedDevices([]); }}
                    className="text-sm text-blue-400 hover:text-blue-300 mb-3 block">
                    Back to cards
                  </button>
                  <h4 className="text-gray-200 font-medium mb-3">
                    Devices on {selectedCard.card}
                    <span className="ml-2 text-sm text-gray-400">{(selectedCard.busTypes?.length > 0 && selectedCard.busTypes.join(', ')) || '—'}</span>
                  </h4>
                  {(selectedCard.devices?.length > 0) ? (
                    <>
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
                    </>
                  ) : (
                    <div className="rounded-lg border border-gray-600 bg-gray-700/30 p-4">
                      <p className="text-gray-400 text-sm mb-3">No devices linked to this card in System Registry. You can still add an error for the card.</p>
                      <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-600 hover:border-blue-500 cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={selectedDevices.some(d => d.card === selectedCard.card && d.device_name == null)}
                          onChange={() => {
                            const exists = selectedDevices.some(d => d.card === selectedCard.card && d.device_name == null);
                            if (exists) {
                              setSelectedDevices(selectedDevices.filter(d => !(d.card === selectedCard.card && d.device_name == null)));
                            } else {
                              setSelectedDevices([...selectedDevices, { card: selectedCard.card, device_name: null, channel: 'N/A', bus_type: 'HART' }]);
                            }
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-gray-200 font-medium">This card only ({selectedCard.card}) — no device</span>
                      </label>
                    </div>
                  )}
                  <div className="text-sm text-gray-400 mt-2">
                    {selectedDevices.length} device(s) selected
                  </div>
                </div>

              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-700 flex justify-between items-center flex-shrink-0">
              <div>
                {addErrorTab === 'detected' && flowStep === 'pick-error' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedDevices.length > 0) {
                        setFlowStep(ioDeviceData?.isCioc ? 'pick-device' : 'pick-card-device');
                      }
                    }}
                    className="btn btn-secondary"
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>

                {addErrorTab === 'manual' ? (
                  <button
                    type="button"
                    onClick={saveManualErrors}
                    disabled={
                      !selectedErrorType ||
                      !manualCardType ||
                      manualCardNumber == null ||
                      (manualCardType === 'hart' && manualChannels.length === 0) ||
                      ((manualCardType === 'devicenet' || manualCardType === 'fieldbus' || manualCardType === 'serial') && manualPort == null) ||
                      (manualCardType === 'eioc' && !manualPdt)
                    }
                    className="btn btn-primary"
                  >
                    Save Error{(
                      (manualCardType === 'hart' && manualChannels.length > 1) ||
                      ((manualCardType === 'devicenet' || manualCardType === 'fieldbus' || manualCardType === 'serial') && manualChannels.length > 1)
                    ) ? 's' : ''}
                  </button>
                ) : flowStep === 'pick-error' ? (
                  <button
                    type="button"
                    onClick={saveSmartErrors}
                    disabled={!selectedErrorType}
                    className="btn btn-primary"
                  >
                    Save Error{selectedDevices.length > 1 ? 's' : ''}
                  </button>
                ) : (flowStep === 'pick-device' || flowStep === 'pick-card-device') ? (
                  <button
                    type="button"
                    onClick={() => setFlowStep('pick-error')}
                    disabled={selectedDevices.length === 0}
                    className="btn btn-primary"
                  >
                    Next: Select Error ({selectedDevices.length})
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
