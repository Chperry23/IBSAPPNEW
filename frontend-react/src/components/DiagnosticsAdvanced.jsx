import { useState, useEffect } from 'react';
import api from '../services/api';
import soundSystem from '../utils/sounds';

/** Placeholder row: card registered for step-2 error entry (hidden from PDF / error log totals) */
const IO_CARD_SLOT = 'io_card_slot';
const isIoCardSlot = (d) => d?.error_type === IO_CARD_SLOT;

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
  const [selectedDevices, setSelectedDevices] = useState([]); // selected io devices for error (used at submit)
  const [selectedCard, setSelectedCard] = useState(null); // selected card group
  const [deviceSearch, setDeviceSearch] = useState('');
  const [ciocActiveBaseplate, setCiocActiveBaseplate] = useState(1); // active baseplate for CIOC charm picker
  const [ciocPool, setCiocPool] = useState([]); // staged charms (pool) for CIOC two-stage selection
  const [ciocCheckedKeys, setCiocCheckedKeys] = useState([]); // checked subset within pool (submitted on Next)
  
  // Manual entry states (grid: card 1-100 single, channels 1-60 multi, port 1-5)
  const [manualCardType, setManualCardType] = useState('');
  /** Manual tab step 1: multiple cards 1–100 per type */
  const [manualSelectedCardNumbers, setManualSelectedCardNumbers] = useState([]);
  const [manualChannels, setManualChannels] = useState([]); // multi-select 1-60
  const [showCardDetailModal, setShowCardDetailModal] = useState(false);
  /** { card_type, card_number, controller_name } for step-2 error entry */
  const [cardDetailContext, setCardDetailContext] = useState(null);
  const [manualPort, setManualPort] = useState(null); // 1-5 when applicable
  const [manualPdt, setManualPdt] = useState('');
  const [manualLdt, setManualLdt] = useState('');
  const [manualDst, setManualDst] = useState(''); // DST (Device) when not from registry
  const [cardDetailErrors, setCardDetailErrors] = useState({}); // { fieldKey: 'message' }
  
  // Error selection
  const [selectedErrorType, setSelectedErrorType] = useState('');
  const [errorDescription, setErrorDescription] = useState('');
  const [overrideDst, setOverrideDst] = useState(''); // DST to use when device doesn't have one (pick-error step)
  
  // Custom I/O error types (fetched from DB, shared across sessions)
  const [customErrorTypes, setCustomErrorTypes] = useState([]);
  const [showCustomErrorForm, setShowCustomErrorForm] = useState(false);
  const [newCustomLabel, setNewCustomLabel] = useState('');
  const [newCustomDescription, setNewCustomDescription] = useState('');
  const [newCustomIcon, setNewCustomIcon] = useState('⚠️');

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
    { value: 'device_errors_on_link', label: 'Device Errors on Link', icon: '🔗', description: 'One or more devices reporting errors on Fieldbus link', onlyCardTypes: ['fieldbus', 'profibus', 'asi_bus'] },
    { value: 'function_block_problems', label: 'Function Block Problems on Link', icon: '📦', description: '1 or more function block problems on Fieldbus link', onlyCardTypes: ['fieldbus', 'profibus', 'asi_bus'] },
    { value: 'device_not_in_range', label: 'Device Not in Range on Link', icon: '📡', description: 'Device not in range on Fieldbus link', onlyCardTypes: ['fieldbus', 'profibus', 'asi_bus'] },
  ];

  const cardTypes = [
    { value: 'devicenet', label: 'DeviceNet', portLabel: 'Port Number' },
    { value: 'hart', label: 'AI / AO / DI / DO (HART)', portLabel: 'Channel Number' },
    { value: 'fieldbus', label: 'Fieldbus', portLabel: 'Port Number' },
    { value: 'profibus', label: 'Profibus', portLabel: 'Port Number' },
    { value: 'asi_bus', label: 'ASi-bus', portLabel: 'Port Number' },
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

  useEffect(() => {
    fetch('/api/custom-error-types', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCustomErrorTypes(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadData = async () => {
    try {
      const diagResponse = await fetch(`/api/sessions/${sessionId}/diagnostics`);
      let diagData = [];
      if (diagResponse.ok) {
        diagData = await diagResponse.json() || [];
        setDiagnostics(diagData);
      }

      const maintenanceResponse = await fetch(`/api/sessions/${sessionId}/node-maintenance`);
      let maintenanceData = {};
      if (maintenanceResponse.ok) {
        maintenanceData = normalizeMaintenance(await maintenanceResponse.json());
      }

      /**
       * has_io_errors === false → user unchecked Errors (no I/O issues) → hide from I/O Errors when empty.
       * has_io_errors === true (default) → show on I/O Errors. If diagnostic rows exist, still show.
       */
      const hasDiagForName = (name) => diagData.some((d) => d.controller_name === name);
      const showControllerOnIoPage = (nodeId, nodeName) => {
        const markedNoIoErrors = maintenanceData[nodeId]?.has_io_errors === false;
        if (markedNoIoErrors && !hasDiagForName(nodeName)) return false;
        return true;
      };

      const controllerNamesFromDiag = [...new Set(diagData.map((d) => d.controller_name).filter(Boolean))];

      const nodesResponse = await fetch(`/api/customers/${customerId}/nodes${isCompleted ? `?sessionId=${sessionId}` : ''}`);

      let nodesData = [];
      if (nodesResponse.ok) {
        nodesData = await nodesResponse.json();
        if (!Array.isArray(nodesData)) nodesData = [];
      }

      let controllerNodes = nodesData.filter((n) => {
        const isController = ['Controller', 'CIOC', 'CSLS'].includes(n.node_type);
        const notPartner = !n.node_name.endsWith('-partner');
        return isController && notPartner && showControllerOnIoPage(n.id, n.node_name);
      });

      const existingNames = new Set(controllerNodes.map((n) => n.node_name));
      const maintForControllerName = (name) => {
        const n = nodesData.find(
          (x) => x.node_name === name && ['Controller', 'CIOC', 'CSLS'].includes(x.node_type) && !x.node_name?.endsWith('-partner')
        );
        return n ? maintenanceData[n.id] : null;
      };
      const syntheticNodes = controllerNamesFromDiag
        .filter((name) => !existingNames.has(name))
        .filter((name) => {
          const markedNoIoErrors = maintForControllerName(name)?.has_io_errors === false;
          if (markedNoIoErrors && !hasDiagForName(name)) return false;
          return true;
        })
        .map((name) => ({
          id: `diag-${name}`,
          node_name: name,
          node_type: name.toUpperCase().includes('CIOC') ? 'CIOC' : 'Controller',
          model: null,
          serial: null,
        }));
      const allNodes = [...controllerNodes, ...syntheticNodes];
      setNodes(allNodes);
      buildControllersStructure(allNodes, diagData);
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
    setManualSelectedCardNumbers([]);
    setManualChannels([]);
    setManualPort(null);
    setManualPdt('');
    setManualLdt('');
    setShowAddErrorModal(true);
    setIoLoading(true);
    const hasDeviceData = (d) => d?.isCioc || (d?.totalDevices > 0);
    
    try {
      const data = await api.request(
        `/api/sessions/${sessionId}/diagnostics/io-devices/${encodeURIComponent(node.node_name)}?customerId=${customerId}`
      );
      setIoDeviceData(data);
      setAddErrorTab(hasDeviceData(data) ? 'detected' : 'manual');
      if (data.isCioc) {
        setFlowStep('pick-device');
      } else if (hasDeviceData(data)) {
        setFlowStep('pick-card');
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
    setManualCardType('');
    setManualSelectedCardNumbers([]);
    setCiocPool([]);
    setCiocCheckedKeys([]);
  };

  // Reset manual form but stay in modal (for "add another")
  const resetManualForm = () => {
    setManualCardType('');
    setManualSelectedCardNumbers([]);
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
    setCiocPool([]);
    setCiocCheckedKeys([]);
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
        // For CIOC charms _slotNum is the sequential slot (1-96); for regular devices parse card
        const cardNum = device._slotNum != null
          ? device._slotNum
          : (device.card != null ? (parseInt(String(device.card).replace(/\D/g, ''), 10) || 0) : 0);
        const cardDisplay = device._charmName
          ?? (device.card != null && typeof device.card === 'string' ? device.card : null);
        const chanStr = device.channel != null && String(device.channel) !== 'N/A' ? String(device.channel) : null;
        await api.request(`/api/sessions/${sessionId}/diagnostics`, {
          method: 'POST',
          body: JSON.stringify({
            controller_name: currentNode.node_name,
            card_number: cardNum,
            card_display: cardDisplay,
            channel_number: chanStr ? (parseInt(chanStr.replace(/\D/g, ''), 10) || null) : null,
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

  const cardTypeLabel = (v) => cardTypes.find((c) => c.value === v)?.label || v || 'Card';

  // ─── Step 1 (manual): register multiple cards per type as io_card_slot rows ───
  const saveRegisterCardSlots = async () => {
    if (!currentNode) return;
    if (!manualCardType) {
      showMsg('Select a card type', 'error');
      return;
    }
    if (manualSelectedCardNumbers.length === 0) {
      showMsg('Select at least one card number', 'error');
      return;
    }
    const existing = new Set(
      diagnostics
        .filter((d) => d.controller_name === currentNode.node_name && isIoCardSlot(d))
        .map((d) => `${d.card_type}|${d.card_number}`)
    );
    let added = 0;
    try {
      for (const cardNum of [...manualSelectedCardNumbers].sort((a, b) => a - b)) {
        const key = `${manualCardType}|${cardNum}`;
        if (existing.has(key)) continue;
        await api.request(`/api/sessions/${sessionId}/diagnostics`, {
          method: 'POST',
          body: JSON.stringify({
            controller_name: currentNode.node_name,
            card_number: cardNum,
            channel_number: null,
            error_type: IO_CARD_SLOT,
            error_description: 'Card software — add I/O errors below',
            bus_type: null,
            device_name: null,
            device_type: null,
            card_type: manualCardType,
            port_number: null,
            ldt: null,
          }),
        });
        existing.add(key);
        added++;
      }
      soundSystem.playSuccess();
      if (added === 0) {
        showMsg('Those cards are already registered. Pick another type or card numbers.', 'info');
      } else {
        showMsg(`Registered ${added} card(s). Close this dialog and click a card to add ports, channels, and error types.`, 'success');
      }
      await loadData();
      setManualSelectedCardNumbers([]);
    } catch (e) {
      soundSystem.playError();
      showMsg('Could not register cards', 'error');
    }
  };

  const openCardDetailModal = (slot) => {
    setCardDetailContext({
      card_type: slot.card_type,
      card_number: slot.card_number,
      controller_name: slot.controller_name,
      slotId: slot.id,
    });
    setManualChannels([]);
    setManualPort(null);
    setManualPdt('');
    setManualLdt('');
    setManualDst('');
    setSelectedErrorType('');
    setErrorDescription('');
    setCardDetailErrors({});
    setShowCardDetailModal(true);
  };

  const closeCardDetailModal = () => {
    setShowCardDetailModal(false);
    setCardDetailContext(null);
    setManualChannels([]);
    setManualPort(null);
    setManualPdt('');
    setManualLdt('');
    setManualDst('');
    setSelectedErrorType('');
    setErrorDescription('');
    setCardDetailErrors({});
  };

  const removeCardSlot = async (slot, e) => {
    e?.stopPropagation?.();
    if (!confirm(`Remove "${cardTypeLabel(slot.card_type)} · Card ${slot.card_number}" from this controller?`)) return;
    try {
      await api.request(`/api/sessions/${sessionId}/diagnostics/${slot.id}`, { method: 'DELETE' });
      soundSystem.playSuccess();
      await loadData();
    } catch (err) {
      soundSystem.playError();
      showMsg('Could not remove card', 'error');
    }
  };

  // ─── Step 2: real I/O errors for one registered card (same payloads as before) ───
  const saveCardDetailErrors = async () => {
    if (!cardDetailContext) return;

    // Build validation errors for all required fields
    const errs = {};
    const ct = cardDetailContext.card_type;
    if (!selectedErrorType) errs.error_type = 'Select an error type';
    if (ct === 'hart' && manualChannels.length === 0) errs.channels = 'Select at least one channel';
    if (ct === 'eioc' && !manualPdt.trim()) errs.pdt = 'PDT is required';
    if (ct === 'eioc' && !manualLdt.trim()) errs.ldt = 'LDT is required';
    if ((ct === 'devicenet' || ct === 'fieldbus' || ct === 'profibus' || ct === 'asi_bus' || ct === 'serial') && manualPort == null) errs.port = 'Select a port';

    if (Object.keys(errs).length > 0) {
      setCardDetailErrors(errs);
      showMsg('Please fill in the highlighted required fields', 'error');
      return;
    }
    setCardDetailErrors({});
    const cardNum = Number(cardDetailContext.card_number) || 0;
    const ctrl = cardDetailContext.controller_name;
    const busType = ct || null;
    const ldt = manualLdt || null;
    const desc = errorDescription || errorTypes.find((t) => t.value === selectedErrorType)?.description || '';

    const payloads = [];
    if (ct === 'hart') {
      if (manualChannels.length === 0) {
        showMsg('Select at least one channel', 'error');
        return;
      }
      const deviceName = manualDst?.trim() || null;
      manualChannels.forEach((ch) => {
        payloads.push({
          controller_name: ctrl,
          card_number: cardNum,
          channel_number: ch,
          error_type: selectedErrorType,
          error_description: desc,
          bus_type: busType,
          card_type: ct,
          port_number: null,
          ldt,
          device_name: deviceName,
        });
      });
    } else if (ct === 'eioc') {
      payloads.push({
        controller_name: ctrl,
        card_number: cardNum,
        channel_number: manualChannels[0] ?? null,
        error_type: selectedErrorType,
        error_description: desc,
        bus_type: busType,
        card_type: ct,
        port_number: manualPdt || null,
        ldt,
        device_name: manualDst?.trim() || null,
      });
    } else {
      const portStr = manualPort != null ? String(manualPort) : null;
      const deviceName = manualDst?.trim() || null;
      if (manualChannels.length > 0) {
        manualChannels.forEach((ch) => {
          payloads.push({
            controller_name: ctrl,
            card_number: cardNum,
            channel_number: ch,
            error_type: selectedErrorType,
            error_description: desc,
            bus_type: busType,
            card_type: ct,
            port_number: portStr,
            ldt,
            device_name: deviceName,
          });
        });
      } else {
        payloads.push({
          controller_name: ctrl,
          card_number: cardNum,
          channel_number: null,
          error_type: selectedErrorType,
          error_description: desc,
          bus_type: busType,
          card_type: ct,
          port_number: portStr,
          ldt,
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
      showMsg(`Added ${payloads.length} error(s). Add more on this card or close.`, 'success');
      await loadData();
      setSelectedErrorType('');
      setErrorDescription('');
      setManualChannels([]);
      setManualPort(null);
      setManualDst('');
    } catch (error) {
      soundSystem.playError();
      showMsg('Error saving diagnostic', 'error');
    }
  };

  const cardDetailSaveDisabled = () => {
    if (!cardDetailContext || !selectedErrorType) return true;
    const ct = cardDetailContext.card_type;
    if (ct === 'hart') return manualChannels.length === 0;
    if (ct === 'eioc') return !manualPdt;
    if (ct === 'devicenet' || ct === 'fieldbus' || ct === 'profibus' || ct === 'asi_bus' || ct === 'serial') return manualPort == null;
    return false;
  };

  // Filter error types visible for a given card type (includes custom types from DB)
  const visibleErrorTypes = (cardType) => {
    const builtIn = errorTypes.filter((t) => !t.onlyCardTypes || t.onlyCardTypes.includes(cardType));
    const custom = customErrorTypes.map((c) => ({
      value: `custom_${c.id}`,
      label: c.label,
      icon: c.icon || '⚠️',
      description: c.description || '',
      isCustom: true,
      customId: c.id,
    }));
    return [...builtIn, ...custom];
  };

  // Returns a human-readable label for an error_type value, resolving custom types by name
  const formatErrorTypeLabel = (errorType) => {
    if (!errorType) return '-';
    const allTypes = visibleErrorTypes(null);
    const found = allTypes.find(t => t.value === errorType);
    if (found) return `${found.icon ? found.icon + ' ' : ''}${found.label}`;
    return String(errorType).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const saveCustomErrorType = async () => {
    if (!newCustomLabel.trim()) return;
    try {
      const r = await fetch('/api/custom-error-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label: newCustomLabel.trim(), description: newCustomDescription.trim(), icon: newCustomIcon }),
      });
      if (r.ok) {
        const created = await r.json();
        setCustomErrorTypes((prev) => [...prev, created]);
        setNewCustomLabel('');
        setNewCustomDescription('');
        setNewCustomIcon('⚠️');
        setShowCustomErrorForm(false);
      }
    } catch (_) { /* ignore */ }
  };

  const deleteCustomErrorType = async (id) => {
    try {
      await fetch(`/api/custom-error-types/${id}`, { method: 'DELETE', credentials: 'include' });
      setCustomErrorTypes((prev) => prev.filter((c) => c.id !== id));
    } catch (_) { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner h-12 w-12"></div>
      </div>
    );
  }

  const realDiagnostics = diagnostics.filter((d) => !isIoCardSlot(d));

  // Filter devices for search
  const getFilteredDevices = (devices) => {
    if (!deviceSearch) return devices || [];
    const term = deviceSearch.toLowerCase();
    return (devices || []).filter(d =>
      (d.device_name || '').toLowerCase().includes(term) ||
      (d.bus_type || '').toLowerCase().includes(term) ||
      (d.device_type || '').toLowerCase().includes(term) ||
      String(d.card ?? '').toLowerCase().includes(term) ||
      String(d.channel ?? '').toLowerCase().includes(term)
    );
  };

  // CIOC: build a complete 96-slot grid (8 Carrier/Baseplates × 12 charms).
  // Sysreg cards are sorted numerically and assigned sequential slots 1-96.
  // Slots not in sysreg are shown as selectable placeholders.
  const CIOC_CHARMS_PER_BASEPLATE = 12;
  const CIOC_TOTAL_SLOTS = 96; // 8 baseplates × 12

  const ciocDeviceList = (() => {
    if (!ioDeviceData?.isCioc) return [];

    // Build a lookup map from sysreg card name → card object so we can enrich
    // fixed slots by name without distorting the baseplate layout.
    const sysregByName = {};
    (ioDeviceData.cards || []).forEach(c => {
      if (c.card != null) sysregByName[String(c.card).trim().toUpperCase()] = c;
    });

    // Build a fixed grid: 8 baseplates × 12 charms = 96 slots.
    // Each charm is named CHMbp-cc (e.g. CHM3-03). The structure is authoritative;
    // sysreg data enriches it by name match only — never shifts slots.
    const list = [];
    for (let bp = 1; bp <= 8; bp++) {
      for (let charm = 1; charm <= CIOC_CHARMS_PER_BASEPLATE; charm++) {
        const slot = (bp - 1) * CIOC_CHARMS_PER_BASEPLATE + charm; // 1-96
        const charmName = `CHM${bp}-${String(charm).padStart(2, '0')}`;
        const card = sysregByName[charmName.toUpperCase()] ?? null;
        if (card) {
          const primary = card.devices?.[0] ?? {};
          list.push({
            card: card.card,
            _slotNum: slot,
            _charmName: charmName,
            device_name: primary.device_name ?? null,
            channel: primary.channel ?? null,
            bus_type: primary.bus_type ?? (card.busTypes?.[0] ?? null),
            device_type: primary.device_type ?? null,
            _deviceCount: card.deviceCount ?? 0,
          });
        } else {
          list.push({
            card: slot,
            _slotNum: slot,
            _charmName: charmName,
            device_name: null,
            channel: null,
            bus_type: null,
            device_type: null,
            _placeholder: true,
          });
        }
      }
    }
    return list;
  })();

  // Chunk into baseplates of 12
  const ciocChunks = [];
  for (let i = 0; i < ciocDeviceList.length; i += CIOC_CHARMS_PER_BASEPLATE) {
    ciocChunks.push(ciocDeviceList.slice(i, i + CIOC_CHARMS_PER_BASEPLATE));
  }

  // Use _slotNum as the unique key for CIOC rows; fall back to card+device+channel for regular rows
  const deviceKey = (dev) =>
    dev._slotNum != null
      ? `cioc-slot-${dev._slotNum}`
      : `${dev.card ?? ''}-${dev.device_name ?? 'N/A'}-${dev.channel ?? 'N/A'}`;

  // Build error-key set for the current node so rows with existing errors are highlighted
  const diagnosticErrorKeys = currentNode
    ? new Set(
        diagnostics
          .filter((d) => d.controller_name === currentNode.node_name)
          .map((d) =>
            ioDeviceData?.isCioc
              ? `cioc-slot-${d.card_number ?? ''}`
              : `${(d.card_display || (d.card_number ?? '')).toString().trim()}-${(d.device_name ?? 'N/A').toString()}-${(d.channel_number != null ? d.channel_number : 'N/A').toString()}`
          )
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
        <p className="text-gray-400">
          Only controllers with <strong className="text-gray-300">Errors</strong> checked on the Diagnostics checklist appear here
          (meaning that controller has I/O issues to record). Uncheck Errors when a controller has no I/O problems.
        </p>
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
              {isCompleted
                ? 'This completed PM session has no I/O error data on file.'
                : 'Check Errors on a controller in Diagnostics (meaning it has I/O issues) to list it here, then use + Add Error. Errors unchecked + no logged data = hidden from this page.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {nodes.map((node) => {
            const cardSlots = diagnostics.filter((d) => d.controller_name === node.node_name && isIoCardSlot(d));
            const nodeErrors = diagnostics.filter((d) => d.controller_name === node.node_name && !isIoCardSlot(d));
            const errorCountOnSlot = (slot) =>
              nodeErrors.filter(
                (e) =>
                  String(e.card_type || '') === String(slot.card_type || '') &&
                  Number(e.card_number) === Number(slot.card_number)
              ).length;
            const cardTypeSortIndex = (t) => {
              const i = cardTypes.findIndex((c) => c.value === t);
              return i >= 0 ? i : 99;
            };
            const slotsByType = {};
            cardSlots.forEach((slot) => {
              const k = slot.card_type || '_other';
              if (!slotsByType[k]) slotsByType[k] = [];
              slotsByType[k].push(slot);
            });
            Object.values(slotsByType).forEach((arr) =>
              arr.sort((a, b) => (Number(a.card_number) || 0) - (Number(b.card_number) || 0))
            );
            const typeKeysOrdered = Object.keys(slotsByType).sort(
              (a, b) => cardTypeSortIndex(a) - cardTypeSortIndex(b) || String(a).localeCompare(String(b))
            );
            const slotsNeedingErrors = cardSlots.filter((s) => errorCountOnSlot(s) === 0).length;
            const manyErrors = nodeErrors.length > 5;

            return (
              <div key={node.id} className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggleSection(`node-${node.id}`)}
                      className="text-gray-300 hover:text-white p-1 rounded"
                      title={isCollapsed(`node-${node.id}`, manyErrors) ? 'Expand' : 'Collapse'}
                    >
                      <span className="text-lg leading-none">
                        {isCollapsed(`node-${node.id}`, manyErrors) ? '▶' : '▼'}
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
                        {nodeErrors.length} I/O error{nodeErrors.length !== 1 ? 's' : ''}
                        {cardSlots.length > 0 && (
                          <span className="ml-2 text-blue-400">
                            · {typeKeysOrdered.length} type{typeKeysOrdered.length !== 1 ? 's' : ''},{' '}
                            {cardSlots.length} card{cardSlots.length !== 1 ? 's' : ''}
                            {slotsNeedingErrors > 0 && (
                              <span className="text-amber-400/90">
                                {' '}
                                · {slotsNeedingErrors} card{slotsNeedingErrors !== 1 ? 's' : ''} still need
                                I/O errors
                              </span>
                            )}
                          </span>
                        )}
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

                {cardSlots.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/40 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        Card software — add I/O on each card
                      </span>
                      <span className="text-xs text-gray-500">
                        <span className="text-amber-400/90">Amber</span> = no errors logged yet ·{' '}
                        <span className="text-emerald-400/90">Green</span> = has entries
                      </span>
                    </div>
                    <div className="space-y-3">
                      {typeKeysOrdered.map((typeKey) => {
                        const slots = slotsByType[typeKey];
                        return (
                          <div
                            key={typeKey}
                            className="rounded-lg border border-gray-600/70 bg-gray-800/60 overflow-hidden"
                          >
                            <div className="px-3 py-2 bg-gray-700/35 border-b border-gray-600/50 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-gray-100">{cardTypeLabel(typeKey)}</span>
                              <span className="text-xs text-gray-500">
                                Cards{' '}
                                {slots.map((s) => s.card_number).join(', ')}
                              </span>
                            </div>
                            <div className="px-3 py-2 flex flex-wrap gap-2">
                              {slots.map((slot) => {
                                const errN = errorCountOnSlot(slot);
                                const needs = errN === 0;
                                return (
                                  <span
                                    key={slot.id}
                                    className={`inline-flex items-stretch rounded-lg overflow-hidden border ${
                                      needs
                                        ? 'border-amber-500/55 ring-1 ring-amber-500/25 bg-amber-950/20'
                                        : 'border-emerald-600/40 bg-emerald-950/15'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      disabled={isCompleted}
                                      onClick={() => openCardDetailModal(slot)}
                                      className="px-3 py-2 text-left hover:bg-white/5 disabled:opacity-50 min-w-[5.5rem]"
                                    >
                                      <div className="text-lg font-bold leading-tight text-white tabular-nums">
                                        Card {slot.card_number}
                                      </div>
                                      <div
                                        className={`text-[11px] font-medium mt-0.5 ${
                                          needs ? 'text-amber-400' : 'text-emerald-400'
                                        }`}
                                      >
                                        {needs ? '→ Add I/O errors' : `${errN} I/O error${errN !== 1 ? 's' : ''}`}
                                      </div>
                                    </button>
                                    {!isCompleted && (
                                      <button
                                        type="button"
                                        title="Remove this card"
                                        onClick={(e) => removeCardSlot(slot, e)}
                                        className="px-2 text-gray-500 hover:text-red-400 hover:bg-gray-900/80 text-sm border-l border-gray-600/80"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Existing errors for this controller - collapsible */}
                {nodeErrors.length > 0 && isCollapsed(`node-${node.id}`, manyErrors) && (
                  <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-700">
                    {nodeErrors.length} error{nodeErrors.length !== 1 ? 's' : ''} — click ▶ to expand
                  </div>
                )}
                {nodeErrors.length === 0 && cardSlots.length > 0 && (
                  <div className="px-4 py-3 text-sm text-gray-500 border-b border-gray-700">
                    Click a <span className="text-blue-300 font-medium">card</span> above to add channels, ports, and error types.
                  </div>
                )}
                {nodeErrors.length > 0 && !isCollapsed(`node-${node.id}`, manyErrors) && (
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
                                {!isCompleted && isEditing('error_type') ? (
                                  <select
                                    autoFocus
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => saveDiagnosticField(error, 'error_type', editValue)}
                                    className="w-full px-1 py-0.5 bg-gray-700 border border-blue-500 rounded text-gray-100 text-xs"
                                  >
                                    {visibleErrorTypes(null).map(t => (
                                      <option key={t.value} value={t.value}>{t.icon ? `${t.icon} ` : ''}{t.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span
                                    className={`badge badge-red text-xs ${!isCompleted ? 'cursor-pointer hover:opacity-75' : ''}`}
                                    onClick={() => { if (!isCompleted) { setEditingCell({ id: error.id, field: 'error_type' }); setEditValue(error.error_type); } }}
                                    title={!isCompleted ? 'Click to change error type' : ''}
                                  >
                                    {formatErrorTypeLabel(error.error_type)}
                                  </span>
                                )}
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

      {/* Full Error Log - collapsible (excludes card-registration placeholders) */}
      {realDiagnostics.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleSection('fullLog')}
              className="text-gray-300 hover:text-white p-1 rounded"
              title={isCollapsed('fullLog', realDiagnostics.length > 10) ? 'Expand' : 'Collapse'}
            >
              <span className="text-lg leading-none">
                {isCollapsed('fullLog', realDiagnostics.length > 10) ? '▶' : '▼'}
              </span>
            </button>
            <h4 className="text-lg font-semibold text-gray-100">Complete Error Log ({realDiagnostics.length})</h4>
          </div>
          {isCollapsed('fullLog', realDiagnostics.length > 10) && (
            <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-700">
              {realDiagnostics.length} error{realDiagnostics.length !== 1 ? 's' : ''} — click ▶ to expand
            </div>
          )}
          {!isCollapsed('fullLog', realDiagnostics.length > 10) && (
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
                {realDiagnostics.map((error) => {
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
                      {!isCompleted && isEditing('error_type') ? (
                        <select
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => saveDiagnosticField(error, 'error_type', editValue)}
                          className="w-full px-1 py-0.5 bg-gray-700 border border-blue-500 rounded text-gray-100 text-xs"
                        >
                          {visibleErrorTypes(null).map(t => (
                            <option key={t.value} value={t.value}>{t.icon ? `${t.icon} ` : ''}{t.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`badge badge-red text-xs ${!isCompleted ? 'cursor-pointer hover:opacity-75' : ''}`}
                          onClick={() => { if (!isCompleted) { setEditingCell({ id: error.id, field: 'error_type' }); setEditValue(error.error_type); } }}
                          title={!isCompleted ? 'Click to change error type' : ''}
                        >
                          {formatErrorTypeLabel(error.error_type)}
                        </span>
                      )}
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

            {/* Tabs: Detected Cards | Manual Entry — hidden for CIOCs (always show full charm grid) */}
            {!ioDeviceData?.isCioc && (
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
            )}

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {ioLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="spinner h-8 w-8"></div>
                  <span className="ml-3 text-gray-400">Loading I/O device data...</span>
                </div>
              ) : addErrorTab === 'manual' ? (
                <div className="space-y-4">
                  <h4 className="text-gray-200 font-medium">Step 1 — Register cards with issues</h4>
                  <p className="text-gray-500 text-sm">
                    Choose the card type, select <strong className="text-gray-300">multiple</strong> card numbers, then <strong className="text-gray-300">Add cards</strong>.
                    Repeat for another type (e.g. Fieldbus) if needed. Then close this dialog and click each <strong className="text-blue-300">card</strong> under the controller to add ports, channels, and error types.
                  </p>
                  <div>
                    <label className="form-label">Card type</label>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {cardTypes.map((ct) => (
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
                    <label className="form-label">Card numbers (1–100, select any combination)</label>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto border border-gray-600 rounded-lg p-2 bg-gray-900/30">
                      {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => {
                        const selected = manualSelectedCardNumbers.includes(n);
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              setManualSelectedCardNumbers(
                                selected
                                  ? manualSelectedCardNumbers.filter((c) => c !== n)
                                  : [...manualSelectedCardNumbers, n].sort((a, b) => a - b)
                              )
                            }
                            className={`w-9 h-9 rounded border text-sm font-medium transition-all ${
                              selected
                                ? 'bg-blue-600 border-blue-400 text-white'
                                : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    {manualSelectedCardNumbers.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Selected: {manualSelectedCardNumbers.slice().sort((a, b) => a - b).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ) : flowStep === 'pick-error' ? (
                /* ─── ERROR TYPE SELECTION ─── */
                <div>
                  <h4 className="text-gray-200 font-medium mb-1">Select Error Type</h4>
                  <p className="text-gray-500 text-sm mb-4">
                    {selectedDevices.length > 0
                      ? `Applying to ${selectedDevices.length} device(s): ${selectedDevices.map(d => d.device_name || d.card).join(', ')}`
                      : 'Select devices above'}
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
                    {visibleErrorTypes(manualCardType).map((type) => (
                      <div key={type.value} className="relative group">
                        <button
                          onClick={() => { setSelectedErrorType(type.value); setErrorDescription(type.description); }}
                          className={`w-full p-4 rounded-lg border transition-all text-left ${
                            selectedErrorType === type.value
                              ? 'bg-blue-600 border-blue-400'
                              : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          <div className="text-2xl mb-1">{type.icon}</div>
                          <div className="text-sm font-medium text-gray-200">{type.label}</div>
                          <div className="text-xs text-gray-400 mt-1">{type.description}</div>
                        </button>
                        {type.isCustom && (
                          <button
                            onClick={() => deleteCustomErrorType(type.customId)}
                            className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-red-700 text-white text-xs"
                            title="Delete custom type"
                          >×</button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setShowCustomErrorForm((p) => !p)}
                      className="p-4 rounded-lg border border-dashed border-gray-500 hover:border-blue-400 text-left text-gray-400 hover:text-blue-300 transition-all"
                    >
                      <div className="text-2xl mb-1">＋</div>
                      <div className="text-sm font-medium">Custom Error</div>
                      <div className="text-xs mt-1">Save reusable type</div>
                    </button>
                  </div>
                  {showCustomErrorForm && (
                    <div className="mb-4 p-3 rounded-lg bg-gray-900/50 border border-gray-600 space-y-2">
                      <p className="text-xs text-gray-400 font-medium">New custom error type (saved for everyone)</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCustomIcon}
                          onChange={(e) => setNewCustomIcon(e.target.value)}
                          className="form-input w-16 text-center"
                          placeholder="⚠️"
                        />
                        <input
                          type="text"
                          value={newCustomLabel}
                          onChange={(e) => setNewCustomLabel(e.target.value)}
                          className="form-input flex-1"
                          placeholder="Label (e.g. Over-range)"
                        />
                      </div>
                      <input
                        type="text"
                        value={newCustomDescription}
                        onChange={(e) => setNewCustomDescription(e.target.value)}
                        className="form-input w-full"
                        placeholder="Description (optional)"
                      />
                      <div className="flex gap-2">
                        <button onClick={saveCustomErrorType} className="btn btn-primary btn-sm text-xs">Save</button>
                        <button onClick={() => setShowCustomErrorForm(false)} className="btn btn-secondary btn-sm text-xs">Cancel</button>
                      </div>
                    </div>
                  )}
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
                /* ─── CIOC: two-stage charm picker ───
                   Stage 1 — baseplate + charm buttons build the pool (ciocPool)
                   Stage 2 — selection area checkboxes pick which pool items get the error (ciocCheckedKeys)
                ─── */
                (() => {
                  const checkedSet = new Set(ciocCheckedKeys);

                  // Toggle a charm in/out of the pool; auto-check when added
                  const togglePool = (dev) => {
                    const k = deviceKey(dev);
                    const inPool = ciocPool.some(d => deviceKey(d) === k);
                    if (inPool) {
                      setCiocPool(ciocPool.filter(d => deviceKey(d) !== k));
                      setCiocCheckedKeys(ciocCheckedKeys.filter(key => key !== k));
                    } else {
                      setCiocPool([...ciocPool, dev]);
                      setCiocCheckedKeys([...ciocCheckedKeys, k]); // auto-check
                    }
                  };

                  // Toggle checked state within pool
                  const toggleChecked = (k) => {
                    setCiocCheckedKeys(
                      checkedSet.has(k)
                        ? ciocCheckedKeys.filter(key => key !== k)
                        : [...ciocCheckedKeys, k]
                    );
                  };

                  // Select all / deselect all in pool
                  const allChecked = ciocPool.length > 0 && ciocPool.every(d => checkedSet.has(deviceKey(d)));
                  const toggleAllChecked = () => {
                    if (allChecked) {
                      setCiocCheckedKeys([]);
                    } else {
                      setCiocCheckedKeys(ciocPool.map(d => deviceKey(d)));
                    }
                  };

                  // Charms for the active baseplate
                  const bpCharms = ciocDeviceList.filter(d => {
                    const m = String(d._charmName ?? '').match(/^CHM(\d+)-/i);
                    return m && parseInt(m[1], 10) === ciocActiveBaseplate;
                  });

                  return (
                    <div className="space-y-4">
                      <h4 className="text-gray-200 font-medium">Select charm(s) with error</h4>

                      {/* ── Stage 1: Baseplate + charm pickers ── */}
                      <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-3 space-y-3">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Step 1 — Pick charms to stage</div>

                        {/* Baseplate row */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1.5">Baseplates 1–8</div>
                          <div className="flex gap-2 flex-wrap">
                            {[1,2,3,4,5,6,7,8].map(bp => {
                              const isActive = ciocActiveBaseplate === bp;
                              const poolCount = ciocPool.filter(d => {
                                const m = String(d._charmName ?? '').match(/^CHM(\d+)-/i);
                                return m && parseInt(m[1], 10) === bp;
                              }).length;
                              return (
                                <button key={bp} type="button" onClick={() => setCiocActiveBaseplate(bp)}
                                  className={`relative w-10 h-10 rounded-lg border-2 font-bold text-sm transition-all ${
                                    isActive ? 'border-blue-500 bg-blue-600 text-white shadow-lg' : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-400 hover:bg-gray-600'
                                  }`}>
                                  {bp}
                                  {poolCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none font-bold">{poolCount}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Charm row */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1.5">Charms — Baseplate {ciocActiveBaseplate}</div>
                          <div className="flex gap-2 flex-wrap">
                            {bpCharms.map(dev => {
                              const m = String(dev._charmName ?? '').match(/-(\d+)$/);
                              const charmNum = m ? parseInt(m[1], 10) : '?';
                              const k = deviceKey(dev);
                              const inPool = ciocPool.some(d => deviceKey(d) === k);
                              const hasError = charmHasError(dev);
                              return (
                                <button key={k} type="button" onClick={() => togglePool(dev)}
                                  title={`${dev._charmName}${dev.device_name ? ` · ${dev.device_name}` : ''}${dev._placeholder ? ' (no sysreg data)' : ''}`}
                                  className={`relative w-10 h-10 rounded-lg border-2 font-bold text-sm transition-all ${
                                    inPool   ? 'border-orange-400 bg-orange-500 text-white shadow-md'
                                    : hasError  ? 'border-red-600 bg-red-900/60 text-red-300 hover:bg-red-800/60'
                                    : dev._placeholder ? 'border-gray-600 bg-gray-800 text-gray-500 hover:border-gray-500 hover:bg-gray-700'
                                    : 'border-gray-500 bg-gray-700 text-gray-200 hover:border-blue-400 hover:bg-gray-600'
                                  }`}>
                                  {charmNum}
                                  {hasError && !inPool && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-gray-900" />}
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex gap-4 text-xs text-gray-600">
                            <span><span className="inline-block w-3 h-3 rounded border-2 border-orange-400 bg-orange-500 mr-1 align-middle"></span>Staged</span>
                            <span><span className="inline-block w-3 h-3 rounded border-2 border-red-600 bg-red-900/60 mr-1 align-middle"></span>Has existing error</span>
                            <span><span className="inline-block w-3 h-3 rounded border-2 border-gray-600 bg-gray-800 mr-1 align-middle"></span>No sysreg data</span>
                          </div>
                        </div>
                      </div>

                      {/* ── Stage 2: Selection area with checkboxes ── */}
                      <div className="border border-gray-600 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            Step 2 — Select which to add error to ({ciocCheckedKeys.length} of {ciocPool.length})
                          </div>
                          {ciocPool.length > 0 && (
                            <button type="button" onClick={toggleAllChecked}
                              className="text-xs text-blue-400 hover:text-blue-300">
                              {allChecked ? 'Deselect all' : 'Select all'}
                            </button>
                          )}
                        </div>
                        {ciocPool.length === 0 ? (
                          <p className="text-gray-600 text-sm italic">Stage charms above — they will appear here</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {ciocPool.map(dev => {
                              const k = deviceKey(dev);
                              const isChecked = checkedSet.has(k);
                              return (
                                <label key={k} title={`${dev._charmName}${dev.device_name ? ` · ${dev.device_name}` : ''}`}
                                  className={`inline-flex items-center gap-1.5 border text-xs font-medium px-2 py-1.5 rounded-md cursor-pointer transition-all select-none ${
                                    isChecked
                                      ? 'bg-blue-900/50 border-blue-500 text-blue-200'
                                      : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'
                                  }`}>
                                  <input type="checkbox" checked={isChecked} onChange={() => toggleChecked(k)} className="w-3.5 h-3.5 accent-blue-500" />
                                  <span>{dev._charmName}</span>
                                  {dev.device_name && <span className="opacity-60">· {dev.device_name}</span>}
                                  <button type="button" onClick={(e) => { e.preventDefault(); togglePool(dev); }}
                                    className="ml-0.5 text-gray-500 hover:text-red-400 leading-none font-bold" title="Remove from pool">×</button>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()

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
                    onClick={saveRegisterCardSlots}
                    disabled={!manualCardType || manualSelectedCardNumbers.length === 0}
                    className="btn btn-primary"
                  >
                    Add cards
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
                    onClick={() => {
                      if (ioDeviceData?.isCioc) {
                        // For CIOC: sync selectedDevices from checked pool items
                        const checkedSet = new Set(ciocCheckedKeys);
                        setSelectedDevices(ciocPool.filter(d => checkedSet.has(deviceKey(d))));
                      }
                      setFlowStep('pick-error');
                    }}
                    disabled={ioDeviceData?.isCioc ? ciocCheckedKeys.length === 0 : selectedDevices.length === 0}
                    className="btn btn-primary"
                  >
                    Next: Select Error ({ioDeviceData?.isCioc ? ciocCheckedKeys.length : selectedDevices.length})
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCardDetailModal && cardDetailContext && (
        <div className="modal-backdrop" style={{ zIndex: 60 }}>
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl mx-4 border border-gray-700 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">
                  Add I/O error — {cardTypeLabel(cardDetailContext.card_type)} · Card {cardDetailContext.card_number}
                </h3>
                <p className="text-sm text-gray-400">{cardDetailContext.controller_name}</p>
              </div>
              <button type="button" onClick={closeCardDetailModal} className="text-gray-400 hover:text-gray-200 text-2xl leading-none">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {cardDetailContext.card_type === 'hart' && (
                <div>
                  <label className={`form-label ${cardDetailErrors.channels ? 'text-red-400' : ''}`}>
                    Channels (1–60, select multiple) <span className="text-red-400">*</span>
                  </label>
                  <div className={`flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-lg p-1 ${cardDetailErrors.channels ? 'ring-2 ring-red-500' : ''}`}>
                    {Array.from({ length: 60 }, (_, i) => i + 1).map((n) => {
                      const selected = manualChannels.includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setManualChannels(selected ? manualChannels.filter((c) => c !== n) : [...manualChannels, n].sort((a, b) => a - b));
                            setCardDetailErrors((prev) => { const e = { ...prev }; delete e.channels; return e; });
                          }}
                          className={`w-9 h-9 rounded border text-sm font-medium transition-all ${
                            selected
                              ? 'bg-blue-600 border-blue-400 text-white'
                              : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  {cardDetailErrors.channels && <p className="text-red-400 text-xs mt-1">{cardDetailErrors.channels}</p>}
                </div>
              )}
              {(cardDetailContext.card_type === 'devicenet' ||
                cardDetailContext.card_type === 'fieldbus' ||
                cardDetailContext.card_type === 'profibus' ||
                cardDetailContext.card_type === 'asi_bus' ||
                cardDetailContext.card_type === 'serial') && (
                <>
                  <div>
                    <label className={`form-label ${cardDetailErrors.port ? 'text-red-400' : ''}`}>
                      Port (1–5) <span className="text-red-400">*</span>
                    </label>
                    <div className={`flex gap-2 rounded-lg p-1 ${cardDetailErrors.port ? 'ring-2 ring-red-500' : ''}`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setManualPort(manualPort === n ? null : n);
                            setCardDetailErrors((prev) => { const e = { ...prev }; delete e.port; return e; });
                          }}
                          className={`w-10 h-10 rounded border text-sm font-medium transition-all ${
                            manualPort === n
                              ? 'bg-blue-600 border-blue-400 text-white'
                              : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {cardDetailErrors.port && <p className="text-red-400 text-xs mt-1">{cardDetailErrors.port}</p>}
                  </div>
                  <div>
                    <label className="form-label">Channels (optional, 1–60)</label>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {Array.from({ length: 60 }, (_, i) => i + 1).map((n) => {
                        const selected = manualChannels.includes(n);
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              setManualChannels(
                                selected ? manualChannels.filter((c) => c !== n) : [...manualChannels, n].sort((a, b) => a - b)
                              )
                            }
                            className={`w-9 h-9 rounded border text-sm font-medium transition-all ${
                              selected
                                ? 'bg-blue-600 border-blue-400 text-white'
                                : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
              {cardDetailContext.card_type === 'eioc' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`form-label ${cardDetailErrors.pdt ? 'text-red-400' : ''}`}>
                      PDT <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={manualPdt}
                      onChange={(e) => {
                        setManualPdt(e.target.value);
                        if (e.target.value.trim()) setCardDetailErrors((prev) => { const e2 = { ...prev }; delete e2.pdt; return e2; });
                      }}
                      className={`form-input ${cardDetailErrors.pdt ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                      placeholder="PDT identifier"
                    />
                    {cardDetailErrors.pdt && <p className="text-red-400 text-xs mt-1">{cardDetailErrors.pdt}</p>}
                  </div>
                  <div>
                    <label className={`form-label ${cardDetailErrors.ldt ? 'text-red-400' : ''}`}>
                      LDT <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={manualLdt}
                      onChange={(e) => {
                        setManualLdt(e.target.value);
                        if (e.target.value.trim()) setCardDetailErrors((prev) => { const e2 = { ...prev }; delete e2.ldt; return e2; });
                      }}
                      className={`form-input ${cardDetailErrors.ldt ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                      placeholder="LDT identifier"
                    />
                    {cardDetailErrors.ldt && <p className="text-red-400 text-xs mt-1">{cardDetailErrors.ldt}</p>}
                  </div>
                </div>
              )}
              {selectedErrorType === 'no_card' && cardDetailContext.card_type !== 'hart' && (
                <div>
                  <label className="form-label">Channels (optional — indicate which channel slot is missing a card)</label>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border border-gray-600 rounded-lg p-2 bg-gray-900/30">
                    {Array.from({ length: 60 }, (_, i) => i + 1).map((n) => {
                      const selected = manualChannels.includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            setManualChannels(
                              selected ? manualChannels.filter((c) => c !== n) : [...manualChannels, n].sort((a, b) => a - b)
                            )
                          }
                          className={`w-9 h-9 rounded border text-sm font-medium transition-all ${
                            selected
                              ? 'bg-blue-600 border-blue-400 text-white'
                              : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
                <label className={`form-label ${cardDetailErrors.error_type ? 'text-red-400' : ''}`}>
                  Error type <span className="text-red-400">*</span>
                </label>
                {cardDetailErrors.error_type && <p className="text-red-400 text-xs mb-2">{cardDetailErrors.error_type}</p>}
                <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 rounded-lg p-1 ${cardDetailErrors.error_type ? 'ring-2 ring-red-500' : ''}`}>
                  {visibleErrorTypes(cardDetailContext?.card_type).map((type) => (
                    <div key={type.value} className="relative group">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedErrorType(type.value);
                          setErrorDescription(type.description);
                          setCardDetailErrors((prev) => { const e = { ...prev }; delete e.error_type; return e; });
                        }}
                        className={`w-full p-3 rounded-lg border transition-all text-left ${
                          selectedErrorType === type.value
                            ? 'bg-blue-600 border-blue-400'
                            : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <span className="text-lg">{type.icon}</span>
                        <span className="ml-2 text-sm font-medium text-gray-200">{type.label}</span>
                      </button>
                      {type.isCustom && (
                        <button
                          type="button"
                          onClick={() => deleteCustomErrorType(type.customId)}
                          className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-red-700 text-white text-xs"
                          title="Delete custom type"
                        >×</button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCustomErrorForm((p) => !p)}
                    className="p-3 rounded-lg border border-dashed border-gray-500 hover:border-blue-400 text-gray-400 hover:text-blue-300 transition-all text-left"
                  >
                    <span className="text-lg">＋</span>
                    <span className="ml-2 text-sm font-medium">Custom</span>
                  </button>
                </div>
                {showCustomErrorForm && (
                  <div className="mt-2 p-3 rounded-lg bg-gray-900/50 border border-gray-600 space-y-2">
                    <p className="text-xs text-gray-400 font-medium">New custom error type (shared with all users)</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCustomIcon}
                        onChange={(e) => setNewCustomIcon(e.target.value)}
                        className="form-input w-16 text-center"
                        placeholder="⚠️"
                      />
                      <input
                        type="text"
                        value={newCustomLabel}
                        onChange={(e) => setNewCustomLabel(e.target.value)}
                        className="form-input flex-1"
                        placeholder="Label"
                      />
                    </div>
                    <input
                      type="text"
                      value={newCustomDescription}
                      onChange={(e) => setNewCustomDescription(e.target.value)}
                      className="form-input w-full"
                      placeholder="Description (optional)"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={saveCustomErrorType} className="btn btn-primary btn-sm text-xs">Save</button>
                      <button type="button" onClick={() => setShowCustomErrorForm(false)} className="btn btn-secondary btn-sm text-xs">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="form-label">Description (optional)</label>
                <textarea
                  value={errorDescription}
                  onChange={(e) => setErrorDescription(e.target.value)}
                  rows={2}
                  className="form-textarea"
                  placeholder="Additional details..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3 flex-shrink-0">
              <button type="button" onClick={closeCardDetailModal} className="btn btn-secondary">
                Close
              </button>
              {!isCompleted && (
                <button
                  type="button"
                  onClick={saveCardDetailErrors}
                  className="btn btn-primary"
                >
                  Save error(s)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
