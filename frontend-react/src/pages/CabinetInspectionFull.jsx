import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function CabinetInspectionFull() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cabinet, setCabinet] = useState(null);
  const [session, setSession] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const autoSaveTimeoutRef = useRef(null);
  
  // Available nodes for assignment
  const [availableControllers, setAvailableControllers] = useState([]);
  const [availableWorkstations, setAvailableWorkstations] = useState([]);
  const [availableSwitches, setAvailableSwitches] = useState([]);
  const [locations, setLocations] = useState([]);
  const [customSwitchModels, setCustomSwitchModels] = useState([]);

  // Collapsed sections state - initialize with all sections
  const [collapsed, setCollapsed] = useState({
    info: false,
    power_supplies: false,
    controllers: false,
    workstations: false,
    distribution: false,
    network: false,
    rack_equipment: false,
    inspection: false,
    comments: false
  });
  
  // Controller selection modal
  const [showControllerModal, setShowControllerModal] = useState(false);
  const [currentControllerIndex, setCurrentControllerIndex] = useState(null);
  const [selectedControllerId, setSelectedControllerId] = useState(null);
  const [controllerSearchTerm, setControllerSearchTerm] = useState('');
  const [controllerFilter, setControllerFilter] = useState('all');
  
  // Workstation selection modal
  const [showWorkstationModal, setShowWorkstationModal] = useState(false);
  const [currentWorkstationIndex, setCurrentWorkstationIndex] = useState(null);
  const [selectedWorkstationId, setSelectedWorkstationId] = useState(null);
  const [workstationSearchTerm, setWorkstationSearchTerm] = useState('');
  
  // Switch selection modal
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [currentSwitchIndex, setCurrentSwitchIndex] = useState(null);
  const [selectedSwitchId, setSelectedSwitchId] = useState(null);
  const [switchSearchTerm, setSwitchSearchTerm] = useState('');
  
  // Premade network equipment models (will be merged with custom models)
  const defaultNetworkEquipmentModels = [
    { type: 'Switch', models: ['Cisco 2960', 'Cisco 3750', 'Cisco 3850', 'HP 2530', 'HP 2920', 'Aruba 2530', 'Aruba 2930F'] },
    { type: 'Router', models: ['Cisco ISR 4000', 'Cisco ASR 1000', 'Juniper MX'] },
    { type: 'Firewall', models: ['Cisco ASA 5500', 'Palo Alto PA-220', 'Fortinet FortiGate'] },
    { type: 'Wireless Controller', models: ['Cisco WLC 3504', 'Cisco WLC 5520', 'Aruba 7005'] },
    { type: 'Other', models: [] }
  ];
  
  // Merge custom models with defaults
  const networkEquipmentModels = defaultNetworkEquipmentModels.map(typeGroup => {
    if (typeGroup.type === 'Switch') {
      return {
        ...typeGroup,
        models: [...new Set([...typeGroup.models, ...customSwitchModels])]
      };
    }
    return typeGroup;
  });

  // Form state - all cabinet data
  const [formData, setFormData] = useState({
    cabinet_name: '',
    cabinet_date: '',
    location_id: '',
    cabinet_type: 'cabinet',
    
    // Controllers
    controllers: [],
    
    // Workstations (for racks)
    workstations: [],
    
    // Power Supplies
    power_supplies: [],
    
    // Distribution Blocks & Diodes
    distribution_blocks: [],
    diodes: [],
    
    // Network Equipment
    network_equipment: [],
    
    // Inspection Items
    inspection: {
      cabinet_fans: '',
      controller_leds: '',
      io_status: '',
      network_status: '',
      temperatures: '',
      is_clean: '',
      clean_filter_installed: '',
      ground_inspection: '',
    },
    
    // Rack-specific checkboxes
    rack_has_ups: false,
    rack_has_hmi: false,
    rack_has_kvm: false,
    rack_has_monitor: false,
    
    // Comments
    comments: '',
    
    // Photos
    photos: [],
  });

  useEffect(() => {
    loadCabinetData();
    loadCustomModels();
  }, [id]);
  
  const loadCustomModels = async () => {
    try {
      const response = await fetch('/api/custom-models/Switch');
      if (response.ok) {
        const models = await response.json();
        setCustomSwitchModels(models);
      }
    } catch (error) {
      console.error('Error loading custom models:', error);
    }
  };

  const loadCabinetData = async () => {
    try {
      console.log('🔍 Loading cabinet data for ID:', id);
      const cabinetData = await api.getCabinet(id);
      console.log('📦 Cabinet data received:', cabinetData);
      
      if (!cabinetData) {
        showMessage('Cabinet not found', 'error');
        setLoading(false);
        return;
      }

      // The backend already parses JSON, so check if data needs parsing
      const ensureArray = (data, defaultValue = []) => {
        // If it's already an array, return it
        if (Array.isArray(data)) {
          console.log('✅ Already array:', data);
          return data;
        }
        // If it's a string, try to parse it
        if (typeof data === 'string') {
          if (!data || data === '[]' || data === '{}' || data === '') return defaultValue;
          try {
            const parsed = JSON.parse(data);
            console.log('✅ Parsed from string:', parsed);
            return Array.isArray(parsed) ? parsed : defaultValue;
          } catch (error) {
            console.warn('⚠️ Parse error, returning default');
            return defaultValue;
          }
        }
        // If it's an object, return it (for inspection data)
        if (typeof data === 'object' && data !== null) {
          return data;
        }
        return defaultValue;
      };

      const parsedData = {
        ...cabinetData,
        power_supplies: ensureArray(cabinetData.power_supplies, []),
        distribution_blocks: ensureArray(cabinetData.distribution_blocks, []),
        diodes: ensureArray(cabinetData.diodes, []),
        network_equipment: ensureArray(cabinetData.network_equipment, []),
        controllers: ensureArray(cabinetData.controllers, []),
        workstations: ensureArray(cabinetData.workstations, []),
        inspection: (typeof cabinetData.inspection_data === 'string' ? JSON.parse(cabinetData.inspection_data) : cabinetData.inspection_data) || {},
        photos: ensureArray(cabinetData.photos, []),
        comments: cabinetData.comments || '',
      };

      console.log('📊 Parsed cabinet data:');
      console.log('  Cabinet Type:', parsedData.cabinet_type);
      console.log('  Cabinet Name:', parsedData.cabinet_name);
      console.log('  Controllers:', parsedData.controllers);
      console.log('  Workstations:', parsedData.workstations);
      console.log('  Power supplies:', parsedData.power_supplies);
      console.log('  Diodes:', parsedData.diodes);

      setCabinet(parsedData);
      setFormData(parsedData);

      // Load session and customer data
      if (cabinetData.pm_session_id) {
        const sessionData = await api.getSession(cabinetData.pm_session_id);
        setSession(sessionData);
        setLocations(sessionData.locations || []);
        
        if (sessionData.customer_id) {
          const customerData = await api.getCustomer(sessionData.customer_id);
          setCustomer(customerData);
          
          // Load available nodes for this customer
          try {
            console.log('Loading nodes for customer:', sessionData.customer_id);
            const response = await fetch(`/api/customers/${sessionData.customer_id}/nodes`);
            console.log('Nodes API response status:', response.status);
            
            if (response.ok) {
              const nodesData = await response.json();
              console.log('Nodes loaded:', nodesData.length);
              console.log('Sample node types:', nodesData.slice(0, 5).map(n => n.node_type));
              
              // Filter controllers (Controller, CIOC, CSLS types)
              // EXCLUDE "-partner" controllers - only show primary controllers
              const controllers = (nodesData || []).filter((n) =>
                ['Controller', 'CIOC', 'CSLS', 'SZ Controller', 'Charms Smart Logic Solver', 'DeltaV EIOC', 'SIS'].includes(n.node_type) &&
                !n.node_name.endsWith('-partner')
              );
              
              // Check for redundancy (if a partner exists)
              const controllersWithRedundancy = controllers.map((c) => {
                const partnerName = `${c.node_name}-partner`;
                const hasPartner = nodesData.some((n) => n.node_name === partnerName);
                return {
                  ...c,
                  is_redundant: hasPartner || c.is_redundant,
                  partner_name: hasPartner ? partnerName : null,
                };
              });
              
              console.log('Filtered controllers:', controllersWithRedundancy.length);
              
              setAvailableControllers(controllersWithRedundancy);
              
              // Filter workstations
              const workstations = (nodesData || []).filter((n) =>
                ['Local Operator', 'Professional Plus', 'Application Station', 'Local ProfessionalPlus', 'Local Application'].includes(n.node_type)
              );
              console.log('Filtered workstations:', workstations.length);
              
              setAvailableWorkstations(workstations);
              
              // Filter smart switches
              const switches = (nodesData || []).filter((n) =>
                n.node_type === 'Smart Network Devices'
              );
              console.log('Filtered switches:', switches.length);
              
              setAvailableSwitches(switches);
            } else {
              console.error('Failed to load nodes:', response.status);
            }
          } catch (error) {
            console.error('Error loading nodes:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading cabinet:', error);
      showMessage('Error loading cabinet data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const toggleSection = (section) => {
    setCollapsed({ ...collapsed, [section]: !collapsed[section] });
  };

  const updateFormData = async (field, value, shouldAutoSave = false) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    
    // Auto-save for rack equipment checkboxes
    if (shouldAutoSave && isRack) {
      await autoSaveCabinet(newFormData);
    }
  };

  const updateInspection = (field, value) => {
    setFormData({
      ...formData,
      inspection: { ...formData.inspection, [field]: value },
    });
  };

  // Voltage validation specs
  const voltageSpecs = {
    line_neutral: { min: 100, max: 130, unit: 'V' },
    line_ground: { min: 100, max: 130, unit: 'V' },
    neutral_ground: { min: 0, max: 1000, unit: 'mV' },
    '24VDC': { min: 21.6, max: 26.4, unit: 'V' },
    '12VDC': { min: 10.8, max: 13.2, unit: 'V' },
  };

  const validateVoltage = (value, type, voltageType = null) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return null;

    let spec = voltageSpecs[type];
    if (type === 'dc_reading' && voltageType) {
      spec = voltageSpecs[voltageType];
    }

    if (!spec) return null;

    if (numValue < spec.min || numValue > spec.max) {
      return { valid: false, message: `Out of spec (${spec.min}-${spec.max} ${spec.unit})` };
    }
    return { valid: true, message: `In spec (${spec.min}-${spec.max} ${spec.unit})` };
  };

  // Add item functions
  const addPowerSupply = () => {
    setFormData({
      ...formData,
      power_supplies: [
        ...formData.power_supplies,
        {
          id: Date.now(),
          voltage_type: '24VDC',
          // AC measurements
          line_neutral: '',
          line_ground: '',
          neutral_ground: '',
          // DC measurement
          dc_reading: '',
          // Status
          status: '',
          comments: '',
        },
      ],
    });
  };

  const removePowerSupply = (index) => {
    const updated = formData.power_supplies.filter((_, i) => i !== index);
    setFormData({ ...formData, power_supplies: updated });
  };

  const addDistributionBlock = () => {
    setFormData({
      ...formData,
      distribution_blocks: [
        ...formData.distribution_blocks,
        { id: Date.now(), type: '', condition: '', comments: '' },
      ],
    });
  };

  const removeDistributionBlock = (index) => {
    const updated = formData.distribution_blocks.filter((_, i) => i !== index);
    setFormData({ ...formData, distribution_blocks: updated });
  };

  const addDiode = async () => {
    const newDiode = {
      id: Date.now(),
      diode_name: `Diode ${formData.diodes.length + 1}`,
      voltage_type: '24VDC',
      dc_reading: '',
    };
    const updated = [...formData.diodes, newDiode];
    setFormData({ ...formData, diodes: updated });
    
    // Auto-save
    await autoSaveCabinet({ ...formData, diodes: updated });
  };

  const removeDiode = async (index) => {
    const updated = formData.diodes.filter((_, i) => i !== index);
    setFormData({ ...formData, diodes: updated });
    
    // Auto-save
    await autoSaveCabinet({ ...formData, diodes: updated });
  };

  const autoSaveCabinet = async (dataToSave = null) => {
    if (session?.status === 'completed') return;
    
    const data = dataToSave || formData;
    
    console.log('💾 Auto-saving cabinet...');
    try {
      const result = await api.updateCabinet(id, data);
      console.log('✅ Auto-save result:', result);
      
      // Don't reload on auto-save to avoid disrupting user
      // Just update local state
      if (result.success) {
        console.log('✅ Auto-saved successfully');
      }
    } catch (error) {
      console.error('❌ Auto-save error:', error);
    }
  };

  const addNetworkEquipment = () => {
    setFormData({
      ...formData,
      network_equipment: [
        ...formData.network_equipment,
        {
          id: Date.now(),
          node_id: '', // For switch assignment
          node_name: '',
          equipment_type: '',
          model_number: '',
          port_count: '',
          serial: '',
          condition: '',
          comments: '',
        },
      ],
    });
  };

  // Workstation modal functions
  const openWorkstationModal = (index) => {
    setCurrentWorkstationIndex(index);
    setSelectedWorkstationId(null);
    setWorkstationSearchTerm('');
    setShowWorkstationModal(true);
  };

  const selectWorkstationFromModal = async () => {
    if (selectedWorkstationId === null || currentWorkstationIndex === null) return;

    const selectedWS = availableWorkstations.find((w) => w.id === selectedWorkstationId);
    if (!selectedWS) return;

    const updated = [...formData.workstations];
    updated[currentWorkstationIndex] = {
      ...updated[currentWorkstationIndex],
      node_id: selectedWS.id,
      node_name: selectedWS.node_name,
      model: selectedWS.model,
      serial: selectedWS.serial,
      node_type: selectedWS.node_type,
    };
    
    const newFormData = { ...formData, workstations: updated };
    setFormData(newFormData);
    setShowWorkstationModal(false);
    setCurrentWorkstationIndex(null);
    setSelectedWorkstationId(null);
    
    // Auto-save after assignment
    await autoSaveCabinet(newFormData);
  };

  const addWorkstation = () => {
    setFormData({
      ...formData,
      workstations: [
        ...formData.workstations,
        {
          id: Date.now(),
          node_id: '',
          node_name: '',
          model: '',
          serial: '',
          node_type: '',
          notes: '',
        },
      ],
    });
  };

  const removeWorkstation = async (index) => {
    const ws = formData.workstations[index];
    if (ws.node_id) {
      try {
        await api.request(`/api/nodes/${ws.node_id}/unassign`, { method: 'POST' });
      } catch (error) {
        console.error('Error unassigning workstation:', error);
      }
    }
    const updated = formData.workstations.filter((_, i) => i !== index);
    setFormData({ ...formData, workstations: updated });
    await loadCabinetData();
  };

  const removeNetworkEquipment = (index) => {
    const updated = formData.network_equipment.filter((_, i) => i !== index);
    setFormData({ ...formData, network_equipment: updated });
  };

  const addController = () => {
    setFormData({
      ...formData,
      controllers: [
        ...formData.controllers,
        {
          id: Date.now(),
          node_id: '',
          node_name: '',
          controller_type: '',
          model: '',
          serial: '',
          firmware: '',
          status: '',
          notes: '',
          is_redundant: false,
        },
      ],
    });
  };

  const removeController = async (index) => {
    const controller = formData.controllers[index];
    // Unassign the node if it was assigned
    if (controller.node_id) {
      try {
        await api.request(`/api/nodes/${controller.node_id}/unassign`, { method: 'POST' });
      } catch (error) {
        console.error('Error unassigning controller:', error);
      }
    }
    const updated = formData.controllers.filter((_, i) => i !== index);
    setFormData({ ...formData, controllers: updated });
    await loadCabinetData(); // Reload to refresh available controllers
  };

  const openControllerModal = (index) => {
    setCurrentControllerIndex(index);
    setSelectedControllerId(null);
    setControllerSearchTerm('');
    setControllerFilter('all');
    setShowControllerModal(true);
  };

  const selectControllerFromModal = () => {
    if (selectedControllerId === null || currentControllerIndex === null) return;

    const selectedController = availableControllers.find((c) => c.id === selectedControllerId);
    if (!selectedController) return;

    const updated = [...formData.controllers];
    updated[currentControllerIndex] = {
      ...updated[currentControllerIndex],
      node_id: selectedController.id,
      node_name: selectedController.node_name,
      controller_type: selectedController.node_type,
      model: selectedController.model,
      serial: selectedController.serial,
      firmware: selectedController.firmware,
    };
    setFormData({ ...formData, controllers: updated });
    setShowControllerModal(false);
    setCurrentControllerIndex(null);
    setSelectedControllerId(null);
  };

  const openSwitchModal = (index) => {
    setCurrentSwitchIndex(index);
    setSelectedSwitchId(null);
    setSwitchSearchTerm('');
    setShowSwitchModal(true);
  };

  const selectSwitchFromModal = async () => {
    if (selectedSwitchId === null || currentSwitchIndex === null) return;

    const selectedSwitch = availableSwitches.find((s) => s.id === selectedSwitchId);
    if (!selectedSwitch) return;

    const updated = [...formData.network_equipment];
    updated[currentSwitchIndex] = {
      ...updated[currentSwitchIndex],
      node_id: selectedSwitch.id,
      node_name: selectedSwitch.node_name,
      equipment_type: 'Switch',
      model_number: selectedSwitch.model || '',
      serial: selectedSwitch.serial || '',
      port_count: '', // Leave blank for user to fill
      condition: 'good', // Default to good
    };
    
    const newFormData = { ...formData, network_equipment: updated };
    setFormData(newFormData);
    setShowSwitchModal(false);
    setCurrentSwitchIndex(null);
    setSelectedSwitchId(null);
    
    // Auto-save after assignment
    await autoSaveCabinet(newFormData);
  };

  const filteredSwitchesForModal = availableSwitches.filter((s) => {
    return (
      s.node_name?.toLowerCase().includes(switchSearchTerm.toLowerCase()) ||
      s.model?.toLowerCase().includes(switchSearchTerm.toLowerCase()) ||
      s.serial?.toLowerCase().includes(switchSearchTerm.toLowerCase())
    );
  });

  const filteredControllersForModal = availableControllers.filter((c) => {
    const matchesSearch =
      c.node_name?.toLowerCase().includes(controllerSearchTerm.toLowerCase()) ||
      c.model?.toLowerCase().includes(controllerSearchTerm.toLowerCase()) ||
      c.serial?.toLowerCase().includes(controllerSearchTerm.toLowerCase());
    
    const matchesFilter =
      controllerFilter === 'all' ||
      (controllerFilter === 'available' && !c.assigned_cabinet_id) ||
      (controllerFilter === 'used' && c.assigned_cabinet_id);
    
    return matchesSearch && matchesFilter;
  });

  const handleSave = async () => {
    if (session?.status === 'completed') {
      showMessage('Cannot save changes - PM session is completed', 'error');
      return;
    }

    setSaving(true);
    console.log('💾 Saving cabinet data...');
    console.log('📊 Data to save:', formData);
    
    try {
      const dataToSave = {
        ...formData,
        // Ensure JSON fields are ready
        controllers: formData.controllers,
        workstations: formData.workstations,
        power_supplies: formData.power_supplies,
        diodes: formData.diodes,
        distribution_blocks: formData.distribution_blocks,
        network_equipment: formData.network_equipment,
        inspection: formData.inspection,
      };

      console.log('📤 Sending update request...');
      const result = await api.updateCabinet(id, dataToSave);
      console.log('📥 Update result:', result);

      if (result.success) {
        console.log('✅ Cabinet saved successfully');
        
        // Handle controller assignments if any
        if (formData.controllers && formData.controllers.length > 0) {
          console.log('🎛️ Assigning controllers:', formData.controllers.length);
          for (const controller of formData.controllers) {
            if (controller.node_id) {
              console.log('  Assigning controller:', controller.node_name, 'to cabinet:', id);
              try {
                await api.request(`/api/nodes/${controller.node_id}/assign`, {
                  method: 'POST',
                  body: JSON.stringify({ cabinet_id: id }),
                });
                console.log('  ✅ Controller assigned');
              } catch (error) {
                console.error('  ❌ Error assigning controller:', error);
              }
            }
          }
        }

        // Handle workstation assignments if any (for racks)
        if (formData.workstations && formData.workstations.length > 0) {
          console.log('🖥️ Assigning workstations:', formData.workstations.length);
          for (const workstation of formData.workstations) {
            if (workstation.node_id) {
              console.log('  Assigning workstation:', workstation.node_name, 'to cabinet:', id);
              try {
                await api.request(`/api/nodes/${workstation.node_id}/assign`, {
                  method: 'POST',
                  body: JSON.stringify({ cabinet_id: id }),
                });
                console.log('  ✅ Workstation assigned');
              } catch (error) {
                console.error('  ❌ Error assigning workstation:', error);
              }
            }
          }
        }

        soundSystem.playSuccess();
        showMessage('Cabinet/Rack inspection saved successfully', 'success');
        
        console.log('🔄 Reloading cabinet data...');
        await loadCabinetData(); // Reload to get updated data
        console.log('✅ Reload complete');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error saving cabinet', 'error');
        console.error('❌ Save failed:', result.error);
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error saving cabinet', 'error');
      console.error('❌ Save error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    try {
      showMessage('🔄 Generating PDF... Please wait', 'info');
      
      // First save current data
      await handleSave();
      
      // Then generate PDF
      const response = await fetch(`/api/cabinets/${id}/pdf`, {
        method: 'POST',
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `cabinet-pm-${formData.cabinet_name.replace(/[^a-zA-Z0-9]/g, '-')}-${
          new Date().toISOString().split('T')[0]
        }.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        soundSystem.playSuccess();
        showMessage('✅ PDF generated and downloaded successfully!', 'success');
      } else {
        soundSystem.playError();
        showMessage('Error generating PDF', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error generating PDF: ' + error.message, 'error');
    }
  };

  // Helper function to check if voltage is in spec
  const checkVoltageInSpec = (value, min, max) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || !value) return null; // No value entered
    return numValue >= min && numValue <= max;
  };

  // Auto-calculate pass/fail status for power supplies
  const autoCalculateStatus = (ps) => {
    const voltageType = ps.voltage_type || '12VDC';
    
    // Define voltage specs
    const specs = {
      '12VDC': { ac_min: 100, ac_max: 130, dc_min: 10.8, dc_max: 13.2, neutral_min: 0, neutral_max: 1000 },
      '24VDC': { ac_min: 100, ac_max: 130, dc_min: 21.6, dc_max: 26.4, neutral_min: 0, neutral_max: 1000 },
      '48VDC': { ac_min: 100, ac_max: 130, dc_min: 43.2, dc_max: 52.8, neutral_min: 0, neutral_max: 1000 },
      '120VAC': { ac_min: 100, ac_max: 130, neutral_min: 0, neutral_max: 1000 },
    };

    const spec = specs[voltageType] || specs['12VDC'];
    
    // Check each measurement
    const checks = [
      checkVoltageInSpec(ps.line_neutral, spec.ac_min, spec.ac_max),
      checkVoltageInSpec(ps.line_ground, spec.ac_min, spec.ac_max),
      checkVoltageInSpec(ps.neutral_ground, spec.neutral_min, spec.neutral_max),
    ];

    // Add DC check if applicable
    if (spec.dc_min && spec.dc_max) {
      checks.push(checkVoltageInSpec(ps.dc_reading, spec.dc_min, spec.dc_max));
    }

    // If any measurement exists and is out of spec, it's a FAIL
    const hasFailure = checks.some(check => check === false);
    // If all measurements are in spec (and at least one exists), it's a PASS
    const allPass = checks.filter(check => check !== null).length > 0 && checks.every(check => check === null || check === true);

    if (hasFailure) return 'fail';
    if (allPass) return 'pass';
    return ''; // No measurements yet
  };

  // Handler to update power supply voltage and auto-calculate status
  const handlePowerSupplyVoltageChange = async (index, field, value) => {
    const updated = [...formData.power_supplies];
    updated[index][field] = value;
    
    // Auto-calculate status based on all voltage readings
    const autoStatus = autoCalculateStatus(updated[index]);
    if (autoStatus) {
      updated[index].status = autoStatus;
    }
    
    const newFormData = { ...formData, power_supplies: updated };
    setFormData(newFormData);
    
    // Auto-save after a short delay
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveCabinet(newFormData);
    }, 500);
  };

  // Auto-calculate status for all power supplies when data loads
  useEffect(() => {
    if (formData.power_supplies && formData.power_supplies.length > 0) {
      let needsUpdate = false;
      const updated = formData.power_supplies.map(ps => {
        const autoStatus = autoCalculateStatus(ps);
        if (autoStatus && ps.status !== autoStatus) {
          needsUpdate = true;
          return { ...ps, status: autoStatus };
        }
        return ps;
      });
      
      if (needsUpdate) {
        console.log('🔄 Auto-updating power supply statuses');
        setFormData({ ...formData, power_supplies: updated });
      }
    }
  }, [cabinet]); // Run when cabinet data changes

  // Calculate section status
  const getSectionStatus = (section) => {
    switch (section) {
      case 'power_supplies': {
        const count = formData.power_supplies.length;
        if (count === 0) return { text: 'Empty', class: 'empty', errors: 0 };
        const failCount = formData.power_supplies.filter(ps => ps.status === 'fail').length;
        return {
          text: `${count} Supplies`,
          class: failCount > 0 ? 'error' : 'complete',
          errors: failCount
        };
      }
      case 'controllers': {
        const count = formData.controllers.length;
        if (count === 0) return { text: 'Empty', class: 'empty', errors: 0 };
        const failCount = formData.controllers.filter(c => c.status === 'fail').length;
        return {
          text: `${count} Controllers`,
          class: failCount > 0 ? 'error' : 'complete',
          errors: failCount
        };
      }
      case 'workstations': {
        const count = formData.workstations.length;
        return count > 0
          ? { text: `${count} Workstations`, class: 'complete', errors: 0 }
          : { text: 'Empty', class: 'empty', errors: 0 };
      }
      case 'distribution': {
        const total = formData.distribution_blocks.length + formData.diodes.length;
        return total > 0
          ? { text: `${total} Items`, class: 'complete', errors: 0 }
          : { text: 'Empty', class: 'empty', errors: 0 };
      }
      case 'network': {
        const count = formData.network_equipment.length;
        return count > 0
          ? { text: `${count} Equipment`, class: 'complete', errors: 0 }
          : { text: 'Empty', class: 'empty', errors: 0 };
      }
      case 'inspection': {
        const inspectionValues = Object.values(formData.inspection).filter((v) => v);
        const total_inspection = 8;
        if (inspectionValues.length === total_inspection) {
          return { text: 'Complete', class: 'complete', errors: 0 };
        } else if (inspectionValues.length > 0) {
          return { text: `${inspectionValues.length}/${total_inspection} Items`, class: 'partial', errors: 0 };
        }
        return { text: 'Empty', class: 'empty', errors: 0 };
      }
      case 'comments':
        return formData.comments?.trim()
          ? { text: 'Has Comments', class: 'complete', errors: 0 }
          : { text: 'Empty', class: 'empty', errors: 0 };
      default:
        return { text: 'Empty', class: 'empty', errors: 0 };
    }
  };

  const SectionHeader = ({ title, section, onAdd, addLabel, icon = '' }) => {
    const status = getSectionStatus(section);
    return (
      <div className="card-header flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-100">
            {icon} {title}
          </h2>
          <span
            className={`text-xs px-3 py-1 rounded-full font-medium ${
              status.class === 'error'
                ? 'bg-red-900 text-red-200 border border-red-700'
                : status.class === 'complete'
                ? 'bg-green-900 text-green-200 border border-green-700'
                : status.class === 'partial'
                ? 'bg-yellow-900 text-yellow-200 border border-yellow-700'
                : 'bg-gray-700 text-gray-400 border border-gray-600'
            }`}
          >
            {status.text}
          </span>
          {collapsed[section] && status.errors > 0 && (
            <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
              ⚠️ {status.errors} {status.errors === 1 ? 'Error' : 'Errors'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="btn btn-secondary btn-sm text-xs"
            >
              {addLabel || '➕ Add'}
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleSection(section)}
            className="text-2xl text-gray-400 hover:text-gray-200 w-8"
          >
            {collapsed[section] ? '➕' : '➖'}
          </button>
        </div>
      </div>
    );
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

  if (!cabinet) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-400">Cabinet not found</p>
          <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
            Go Back
          </button>
        </div>
      </Layout>
    );
  }

  const isCabinet = formData.cabinet_type === 'cabinet';
  const isRack = formData.cabinet_type === 'rack';
  
  // Debug logging
  console.log('🔍 Cabinet Type Debug:', {
    cabinet_type: formData.cabinet_type,
    isCabinet,
    isRack,
    cabinet_name: formData.cabinet_name
  });

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-gray-400">
        {customer && (
          <>
            <Link to="/customers" className="hover:text-gray-200">
              Customers
            </Link>
            <span className="mx-2">›</span>
            <Link to={`/customer/${customer.id}`} className="hover:text-gray-200">
              {customer.name}
            </Link>
            <span className="mx-2">›</span>
          </>
        )}
        {session && (
          <>
            <Link to={`/session/${session.id}`} className="hover:text-gray-200">
              {session.session_name}
            </Link>
            <span className="mx-2">›</span>
          </>
        )}
        <span className="text-gray-200">{formData.cabinet_name || 'Cabinet'}</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-8 animate-fadeIn">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">
            {isRack ? '🖥️' : '🗄️'} {formData.cabinet_name || (isRack ? 'Rack Inspection' : 'Cabinet Inspection')}
          </h1>
          {formData.cabinet_date && (
            <p className="text-gray-400">{new Date(formData.cabinet_date).toLocaleDateString()}</p>
          )}
          {session?.status === 'completed' && (
            <span className="badge badge-green mt-2">✅ Session Completed (Read-Only)</span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              const allExpanded = Object.keys(collapsed).reduce((acc, key) => {
                acc[key] = false;
                return acc;
              }, {});
              setCollapsed(allExpanded);
              showMessage('All sections expanded', 'info');
            }}
            className="btn btn-secondary text-sm"
          >
            📖 Expand All
          </button>
          <button
            onClick={() => {
              const allCollapsed = Object.keys(collapsed).reduce((acc, key) => {
                acc[key] = true;
                return acc;
              }, {});
              setCollapsed(allCollapsed);
              showMessage('All sections collapsed', 'info');
            }}
            className="btn btn-secondary text-sm"
          >
            📕 Collapse All
          </button>
          <button
            onClick={handleGeneratePDF}
            className="btn btn-warning"
          >
            📄 PDF
          </button>
          <button
            onClick={handleSave}
            disabled={saving || session?.status === 'completed'}
            className="btn btn-success"
          >
            {saving ? '💾 Saving...' : '💾 Save'}
          </button>
          <button onClick={() => session && navigate(`/session/${session.id}`)} className="btn btn-secondary">
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

      <form id="cabinet-form" className="space-y-6">
        {/* Cabinet Information */}
        <div className="card">
          <SectionHeader title="Cabinet Information" section="info" icon="ℹ️" />
          {!collapsed.info && (
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="form-label">Cabinet Name *</label>
                  <input
                    type="text"
                    value={formData.cabinet_name}
                    onChange={(e) => updateFormData('cabinet_name', e.target.value)}
                    className="form-input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    value={formData.cabinet_date}
                    onChange={(e) => updateFormData('cabinet_date', e.target.value)}
                    className="form-input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <select
                    value={formData.location_id}
                    onChange={(e) => updateFormData('location_id', e.target.value)}
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
                <div>
                  <label className="form-label">Type</label>
                  <select
                    value={formData.cabinet_type}
                    onChange={(e) => updateFormData('cabinet_type', e.target.value)}
                    className="form-select"
                  >
                    <option value="cabinet">Cabinet</option>
                    <option value="rack">Rack</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controllers Section (Cabinets only) */}
        {isCabinet && (
          <div className="card">
            <SectionHeader
              title="Controllers"
              section="controllers"
              onAdd={addController}
              addLabel="➕ Add Controller"
              icon="🎛️"
            />
            {!collapsed.controllers && (
              <div className="card-body">
                {formData.controllers.length === 0 ? (
                  <p className="text-gray-400 text-sm">No controllers added yet.</p>
                ) : (
                  <div className="space-y-4">
                    {formData.controllers.map((controller, index) => (
                      <div key={controller.id || index} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="text-gray-200 font-medium">Controller {index + 1}</h4>
                          <button
                            type="button"
                            onClick={() => removeController(index)}
                            className="text-red-400 hover:text-red-300"
                          >
                            🗑️
                          </button>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="form-label">Controller</label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openControllerModal(index)}
                                className={`flex-1 btn ${
                                  controller.node_id ? 'btn-success' : 'btn-secondary'
                                } text-left justify-start`}
                              >
                                {controller.node_id
                                  ? `[${controller.controller_type || 'Controller'}] ${controller.node_name}`
                                  : 'Select Controller'}
                              </button>
                              {controller.node_id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...formData.controllers];
                                    updated[index].node_id = '';
                                    updated[index].node_name = '';
                                    updated[index].model = '';
                                    updated[index].serial = '';
                                    updated[index].firmware = '';
                                    setFormData({ ...formData, controllers: updated });
                                  }}
                                  className="btn btn-secondary"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {/* Controller Details (shown when assigned) */}
                          {controller.node_id && (
                            <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-3">
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Model:</span>
                                  <span className="text-blue-300 font-medium">{controller.model || 'Unknown'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Serial:</span>
                                  <span className="text-blue-300 font-medium">{controller.serial || 'No Serial'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400">Firmware:</span>
                                  <span className="text-blue-300 font-medium">{controller.firmware || 'Unknown'}</span>
                                </div>
                                {controller.is_redundant && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Redundancy:</span>
                                    <span className="badge badge-green text-xs">✅ Redundant</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="form-label">Status</label>
                              <select
                                value={controller.status || ''}
                                onChange={(e) => {
                                  const updated = [...formData.controllers];
                                  updated[index].status = e.target.value;
                                  setFormData({ ...formData, controllers: updated });
                                }}
                                className="form-select"
                              >
                                <option value="">Select...</option>
                                <option value="pass">✅ PASS</option>
                                <option value="fail">❌ FAIL</option>
                                <option value="na">➖ N/A</option>
                              </select>
                            </div>
                            <div>
                              <label className="form-label">Notes</label>
                              <textarea
                                value={controller.notes || ''}
                                onChange={(e) => {
                                  const updated = [...formData.controllers];
                                  updated[index].notes = e.target.value;
                                  setFormData({ ...formData, controllers: updated });
                                }}
                                rows="2"
                                className="form-textarea"
                                placeholder="Additional notes about this controller"
                              ></textarea>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {availableControllers.length === 0 && (
                  <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4 mt-4">
                    <p className="text-blue-200 text-sm">
                      💡 No available controller nodes found. Add nodes in the customer profile to assign them here.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Power Supplies (Cabinets only) */}
        {isCabinet && (
          <div className="card">
            <SectionHeader
              title="Power Supplies"
              section="power_supplies"
              onAdd={addPowerSupply}
              addLabel="➕ Add Power Supply"
              icon="⚡"
            />
          {!collapsed.power_supplies && (
            <div className="card-body">
              {formData.power_supplies.length === 0 ? (
                <p className="text-gray-400 text-sm">No power supplies added yet.</p>
              ) : (
                <div className="space-y-4">
                  {formData.power_supplies.map((ps, index) => (
                    <div key={ps.id || index} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="text-gray-200 font-medium">Power Supply {index + 1}</h4>
                        <button
                          type="button"
                          onClick={() => removePowerSupply(index)}
                          className="text-red-400 hover:text-red-300"
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="space-y-4">
                        {/* Voltage Type */}
                        <div>
                          <label className="form-label">Voltage Type</label>
                          <select
                            value={ps.voltage_type}
                            onChange={(e) => {
                              const updated = [...formData.power_supplies];
                              updated[index].voltage_type = e.target.value;
                              setFormData({ ...formData, power_supplies: updated });
                            }}
                            className="form-select"
                          >
                            <option value="24VDC">24VDC</option>
                            <option value="12VDC">12VDC</option>
                          </select>
                        </div>

                        {/* AC Voltage Measurements */}
                        <div className="bg-gray-800/50 rounded p-3 border border-gray-600">
                          <h5 className="text-gray-300 text-sm font-medium mb-3">AC Voltage Measurements</h5>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="form-label text-xs">Line to Neutral (V)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={ps.line_neutral || ''}
                                onChange={(e) => handlePowerSupplyVoltageChange(index, 'line_neutral', e.target.value)}
                                className={`form-input ${
                                  ps.line_neutral && validateVoltage(ps.line_neutral, 'line_neutral')
                                    ? validateVoltage(ps.line_neutral, 'line_neutral').valid
                                      ? 'border-green-500'
                                      : 'border-red-500'
                                    : ''
                                }`}
                                placeholder="100-130V"
                              />
                              {ps.line_neutral && validateVoltage(ps.line_neutral, 'line_neutral') && (
                                <div className={`text-xs mt-1 ${
                                  validateVoltage(ps.line_neutral, 'line_neutral').valid
                                    ? 'text-green-400'
                                    : 'text-red-400'
                                }`}>
                                  {validateVoltage(ps.line_neutral, 'line_neutral').message}
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="form-label text-xs">Line to Ground (V)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={ps.line_ground || ''}
                                onChange={(e) => handlePowerSupplyVoltageChange(index, 'line_ground', e.target.value)}
                                className={`form-input ${
                                  ps.line_ground && validateVoltage(ps.line_ground, 'line_ground')
                                    ? validateVoltage(ps.line_ground, 'line_ground').valid
                                      ? 'border-green-500'
                                      : 'border-red-500'
                                    : ''
                                }`}
                                placeholder="100-130V"
                              />
                              {ps.line_ground && validateVoltage(ps.line_ground, 'line_ground') && (
                                <div className={`text-xs mt-1 ${
                                  validateVoltage(ps.line_ground, 'line_ground').valid
                                    ? 'text-green-400'
                                    : 'text-red-400'
                                }`}>
                                  {validateVoltage(ps.line_ground, 'line_ground').message}
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="form-label text-xs">Neutral to Ground (mV)</label>
                              <input
                                type="number"
                                step="1"
                                value={ps.neutral_ground || ''}
                                onChange={(e) => handlePowerSupplyVoltageChange(index, 'neutral_ground', e.target.value)}
                                className={`form-input ${
                                  ps.neutral_ground && validateVoltage(ps.neutral_ground, 'neutral_ground')
                                    ? validateVoltage(ps.neutral_ground, 'neutral_ground').valid
                                      ? 'border-green-500'
                                      : 'border-red-500'
                                    : ''
                                }`}
                                placeholder="0-1000mV"
                              />
                              {ps.neutral_ground && validateVoltage(ps.neutral_ground, 'neutral_ground') && (
                                <div className={`text-xs mt-1 ${
                                  validateVoltage(ps.neutral_ground, 'neutral_ground').valid
                                    ? 'text-green-400'
                                    : 'text-red-400'
                                }`}>
                                  {validateVoltage(ps.neutral_ground, 'neutral_ground').message}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* DC Voltage Measurement */}
                        <div>
                          <label className="form-label">DC Reading (V)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={ps.dc_reading || ''}
                            onChange={(e) => handlePowerSupplyVoltageChange(index, 'dc_reading', e.target.value)}
                            className={`form-input ${
                              ps.dc_reading && validateVoltage(ps.dc_reading, 'dc_reading', ps.voltage_type)
                                ? validateVoltage(ps.dc_reading, 'dc_reading', ps.voltage_type).valid
                                  ? 'border-green-500'
                                  : 'border-red-500'
                                : ''
                            }`}
                            placeholder={
                              ps.voltage_type === '24VDC'
                                ? '21.6-26.4V'
                                : ps.voltage_type === '12VDC'
                                ? '10.8-13.2V'
                                : '0.00'
                            }
                          />
                          {ps.dc_reading && validateVoltage(ps.dc_reading, 'dc_reading', ps.voltage_type) && (
                            <div className={`text-xs mt-1 ${
                              validateVoltage(ps.dc_reading, 'dc_reading', ps.voltage_type).valid
                                ? 'text-green-400'
                                : 'text-red-400'
                            }`}>
                              {validateVoltage(ps.dc_reading, 'dc_reading', ps.voltage_type).message}
                            </div>
                          )}
                        </div>

                        {/* Status & Comments */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="form-label">Status</label>
                            <select
                              value={ps.status || ''}
                              onChange={(e) => {
                                const updated = [...formData.power_supplies];
                                updated[index].status = e.target.value;
                                setFormData({ ...formData, power_supplies: updated });
                              }}
                              className="form-select"
                            >
                              <option value="">Select...</option>
                              <option value="pass">✅ PASS</option>
                              <option value="fail">❌ FAIL</option>
                              <option value="na">➖ N/A</option>
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Comments</label>
                            <input
                              type="text"
                              value={ps.comments || ''}
                              onChange={(e) => {
                                const updated = [...formData.power_supplies];
                                updated[index].comments = e.target.value;
                                setFormData({ ...formData, power_supplies: updated });
                              }}
                              className="form-input"
                              placeholder="Additional notes..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        )}

        {/* Workstations Section (Racks only) */}
        {isRack && (
          <div className="card">
            <SectionHeader
              title="Workstations"
              section="workstations"
              onAdd={addWorkstation}
              addLabel="➕ Add Workstation"
              icon="🖥️"
            />
            {!collapsed.workstations && (
              <div className="card-body">
                {formData.workstations.length === 0 ? (
                  <p className="text-gray-400 text-sm">No workstations assigned yet.</p>
                ) : (
                  <div className="space-y-4">
                    {formData.workstations.map((ws, index) => (
                      <div key={ws.id || index} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="text-gray-200 font-medium">Workstation {index + 1}</h4>
                          <button
                            type="button"
                            onClick={() => removeWorkstation(index)}
                            className="text-red-400 hover:text-red-300"
                          >
                            🗑️
                          </button>
                        </div>
                        <div>
                          <label className="form-label">Assign Workstation</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openWorkstationModal(index)}
                              className={`flex-1 btn ${
                                ws.node_id ? 'btn-success' : 'btn-secondary'
                              } text-left justify-start`}
                            >
                              {ws.node_id
                                ? `${ws.node_name}`
                                : 'Select Workstation'}
                            </button>
                            {ws.node_id && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...formData.workstations];
                                  updated[index] = { id: ws.id, node_id: '', node_name: '', model: '', serial: '', notes: '' };
                                  setFormData({ ...formData, workstations: updated });
                                }}
                                className="btn btn-secondary"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                        {ws.node_id && ws.model && (
                          <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-3 mt-3">
                            <div className="space-y-1 text-sm">
                              <div>
                                <span className="text-gray-400">Model:</span>{' '}
                                <span className="text-blue-300">{ws.model}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Serial:</span>{' '}
                                <span className="text-blue-300">{ws.serial || 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="mt-3">
                          <label className="form-label">Notes</label>
                          <textarea
                            value={ws.notes || ''}
                            onChange={(e) => {
                              const updated = [...formData.workstations];
                              updated[index].notes = e.target.value;
                              setFormData({ ...formData, workstations: updated });
                            }}
                            onBlur={() => autoSaveCabinet()}
                            rows="2"
                            className="form-textarea"
                            placeholder="Additional notes..."
                          ></textarea>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {availableWorkstations.length === 0 && (
                  <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4 mt-4">
                    <p className="text-blue-200 text-sm">
                      💡 No available workstation nodes. Import nodes from customer profile.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Distribution Blocks & Diodes (Cabinets only) */}
        {isCabinet && (
          <div className="card">
            <div className="card-header flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-gray-100">🔌 Distribution Blocks / Diodes</h2>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                  getSectionStatus('distribution').class === 'complete'
                    ? 'bg-green-900 text-green-200 border border-green-700'
                    : 'bg-gray-700 text-gray-400 border border-gray-600'
                }`}>
                  {getSectionStatus('distribution').text}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addDistributionBlock}
                  className="btn btn-secondary btn-sm text-xs"
                >
                  ➕ Block
                </button>
                <button
                  type="button"
                  onClick={addDiode}
                  className="btn btn-secondary btn-sm text-xs"
                >
                  ➕ Diode
                </button>
                <button
                  type="button"
                  onClick={() => toggleSection('distribution')}
                  className="text-2xl text-gray-400 hover:text-gray-200 w-8"
                >
                  {collapsed.distribution ? '➕' : '➖'}
                </button>
              </div>
            </div>
            {!collapsed.distribution && (
              <div className="card-body space-y-6">
                {/* Distribution Blocks */}
                {formData.distribution_blocks.length > 0 && (
                  <div>
                    <h4 className="text-gray-300 font-medium mb-3">Distribution Blocks</h4>
                    <div className="space-y-3">
                      {formData.distribution_blocks.map((block, index) => (
                        <div key={block.id || index} className="bg-gray-700/50 rounded-lg p-3 border border-gray-600 flex gap-3">
                          <input
                            type="text"
                            value={block.type}
                            onChange={(e) => {
                              const updated = [...formData.distribution_blocks];
                              updated[index].type = e.target.value;
                              setFormData({ ...formData, distribution_blocks: updated });
                            }}
                            className="form-input flex-1"
                            placeholder="Block type/description"
                          />
                          <button
                            type="button"
                            onClick={() => removeDistributionBlock(index)}
                            className="text-red-400 hover:text-red-300"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Diodes */}
                {formData.diodes.length > 0 && (
                  <div>
                    <h4 className="text-gray-300 font-medium mb-3">Diodes</h4>
                    <div className="space-y-3">
                      {formData.diodes.map((diode, index) => (
                        <div key={diode.id || index} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                          <div className="flex justify-between items-start mb-3">
                            <h5 className="text-gray-200 font-medium">{diode.diode_name || `Diode ${index + 1}`}</h5>
                            <button
                              type="button"
                              onClick={() => removeDiode(index)}
                              className="text-red-400 hover:text-red-300"
                            >
                              🗑️
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="form-label text-xs">Voltage Type</label>
                              <select
                                value={diode.voltage_type || '24VDC'}
                                onChange={(e) => {
                                  const updated = [...formData.diodes];
                                  updated[index].voltage_type = e.target.value;
                                  setFormData({ ...formData, diodes: updated });
                                  autoSaveCabinet({ ...formData, diodes: updated });
                                }}
                                className="form-select"
                              >
                                <option value="24VDC">24VDC</option>
                                <option value="12VDC">12VDC</option>
                              </select>
                            </div>
                            <div>
                              <label className="form-label text-xs">DC Reading (V)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={diode.dc_reading || ''}
                                onChange={(e) => {
                                  const updated = [...formData.diodes];
                                  updated[index].dc_reading = e.target.value;
                                  setFormData({ ...formData, diodes: updated });
                                }}
                                onBlur={() => autoSaveCabinet()}
                                className={`form-input ${
                                  diode.dc_reading && validateVoltage(diode.dc_reading, 'dc_reading', diode.voltage_type)
                                    ? validateVoltage(diode.dc_reading, 'dc_reading', diode.voltage_type).valid
                                      ? 'border-green-500'
                                      : 'border-red-500'
                                    : ''
                                }`}
                                placeholder={
                                  diode.voltage_type === '24VDC' ? '21.6-26.4V' : '10.8-13.2V'
                                }
                              />
                              {diode.dc_reading && validateVoltage(diode.dc_reading, 'dc_reading', diode.voltage_type) && (
                                <div className={`text-xs mt-1 ${
                                  validateVoltage(diode.dc_reading, 'dc_reading', diode.voltage_type).valid
                                    ? 'text-green-400'
                                    : 'text-red-400'
                                }`}>
                                  {validateVoltage(diode.dc_reading, 'dc_reading', diode.voltage_type).message}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {formData.distribution_blocks.length === 0 && formData.diodes.length === 0 && (
                  <p className="text-gray-400 text-sm">No distribution blocks or diodes added yet.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Network Equipment */}
        <div className="card">
          <SectionHeader
            title="Network Equipment"
            section="network"
            onAdd={addNetworkEquipment}
            addLabel="➕ Add Equipment"
            icon="🌐"
          />
          {!collapsed.network && (
            <div className="card-body">
              {formData.network_equipment.length === 0 ? (
                <p className="text-gray-400 text-sm">No network equipment added yet.</p>
              ) : (
                <div className="space-y-4">
                  {formData.network_equipment.map((equipment, index) => (
                    <div key={equipment.id || index} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="text-gray-200 font-medium">Equipment {index + 1}</h4>
                        <button
                          type="button"
                          onClick={() => removeNetworkEquipment(index)}
                          className="text-red-400 hover:text-red-300"
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Assign Switch from Nodes */}
                        {availableSwitches.length > 0 && (
                          <div className="md:col-span-2">
                            <label className="form-label">Assign Smart Switch from Nodes</label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openSwitchModal(index)}
                                disabled={session?.status === 'completed'}
                                className="btn btn-secondary flex-1 text-left"
                              >
                                {equipment.node_id
                                  ? `[Switch] ${equipment.node_name}`
                                  : 'Select Switch from Nodes'}
                              </button>
                              {equipment.node_id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...formData.network_equipment];
                                    updated[index].node_id = '';
                                    updated[index].node_name = '';
                                    setFormData({ ...formData, network_equipment: updated });
                                  }}
                                  disabled={session?.status === 'completed'}
                                  className="btn btn-danger"
                                  title="Unassign switch"
                                >
                                  ✖
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <div>
                          <label className="form-label">Equipment Type</label>
                          <select
                            value={equipment.equipment_type}
                            onChange={(e) => {
                              const updated = [...formData.network_equipment];
                              updated[index].equipment_type = e.target.value;
                              // Clear model if type changes
                              if (e.target.value !== updated[index].equipment_type) {
                                updated[index].model_number = '';
                              }
                              setFormData({ ...formData, network_equipment: updated });
                            }}
                            className="form-select"
                          >
                            <option value="">Select...</option>
                            <option value="Switch">Switch</option>
                            <option value="Router">Router</option>
                            <option value="Firewall">Firewall</option>
                            <option value="Wireless Controller">Wireless Controller</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Model Number</label>
                          {equipment.equipment_type && networkEquipmentModels.find(m => m.type === equipment.equipment_type)?.models.length > 0 ? (
                            <div className="space-y-2">
                              <select
                                value={equipment.model_number}
                                onChange={(e) => {
                                  const updated = [...formData.network_equipment];
                                  updated[index].model_number = e.target.value;
                                  setFormData({ ...formData, network_equipment: updated });
                                }}
                                className="form-select"
                              >
                                <option value="">Select or enter custom...</option>
                                {networkEquipmentModels.find(m => m.type === equipment.equipment_type)?.models.map(model => (
                                  <option key={model} value={model}>{model}</option>
                                ))}
                                <option value="__custom__">Custom Model</option>
                              </select>
                              {equipment.model_number === '__custom__' && (
                                <input
                                  type="text"
                                  placeholder="Enter custom model"
                                  onChange={(e) => {
                                    const updated = [...formData.network_equipment];
                                    updated[index].model_number = e.target.value;
                                    setFormData({ ...formData, network_equipment: updated });
                                  }}
                                  onBlur={async (e) => {
                                    const customModel = e.target.value;
                                    if (customModel && equipment.equipment_type === 'Switch') {
                                      // Save custom model to database
                                      try {
                                        await api.request('/api/custom-models', {
                                          method: 'POST',
                                          body: JSON.stringify({
                                            equipment_type: 'Switch',
                                            model_name: customModel
                                          })
                                        });
                                        // Reload custom models
                                        await loadCustomModels();
                                      } catch (error) {
                                        console.error('Error saving custom model:', error);
                                      }
                                    }
                                  }}
                                  className="form-input"
                                />
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={equipment.model_number || ''}
                              onChange={(e) => {
                                const updated = [...formData.network_equipment];
                                updated[index].model_number = e.target.value;
                                setFormData({ ...formData, network_equipment: updated });
                              }}
                              className="form-input"
                              placeholder="e.g., Cisco 2960"
                            />
                          )}
                        </div>
                        <div>
                          <label className="form-label">Port Count</label>
                          <input
                            type="number"
                            value={equipment.port_count}
                            onChange={(e) => {
                              const updated = [...formData.network_equipment];
                              updated[index].port_count = e.target.value;
                              setFormData({ ...formData, network_equipment: updated });
                            }}
                            className="form-input"
                            placeholder="e.g., 24"
                          />
                        </div>
                        <div>
                          <label className="form-label">Condition</label>
                          <select
                            value={equipment.condition}
                            onChange={(e) => {
                              const updated = [...formData.network_equipment];
                              updated[index].condition = e.target.value;
                              setFormData({ ...formData, network_equipment: updated });
                            }}
                            className="form-select"
                          >
                            <option value="">Select...</option>
                            <option value="good">✅ Good</option>
                            <option value="fair">⚠️ Fair</option>
                            <option value="poor">❌ Poor</option>
                            <option value="replace">🔴 Replace</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="form-label">Comments</label>
                          <input
                            type="text"
                            value={equipment.comments}
                            onChange={(e) => {
                              const updated = [...formData.network_equipment];
                              updated[index].comments = e.target.value;
                              setFormData({ ...formData, network_equipment: updated });
                            }}
                            className="form-input"
                            placeholder="Additional notes..."
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rack Equipment Checklist (Racks only) */}
        {isRack && (
          <div className="card">
            <SectionHeader title="Equipment Checklist" section="rack_equipment" icon="✅" />
            {!collapsed.rack_equipment && (
              <div className="card-body">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="rack_has_ups"
                      checked={formData.rack_has_ups || false}
                      onChange={(e) => updateFormData('rack_has_ups', e.target.checked, true)}
                      className="form-checkbox h-5 w-5 text-blue-600 rounded"
                    />
                    <label htmlFor="rack_has_ups" className="text-gray-200 cursor-pointer">
                      UPS (Uninterruptible Power Supply)
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="rack_has_hmi"
                      checked={formData.rack_has_hmi || false}
                      onChange={(e) => updateFormData('rack_has_hmi', e.target.checked, true)}
                      className="form-checkbox h-5 w-5 text-blue-600 rounded"
                    />
                    <label htmlFor="rack_has_hmi" className="text-gray-200 cursor-pointer">
                      HMI (Human Machine Interface)
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="rack_has_kvm"
                      checked={formData.rack_has_kvm || false}
                      onChange={(e) => updateFormData('rack_has_kvm', e.target.checked, true)}
                      className="form-checkbox h-5 w-5 text-blue-600 rounded"
                    />
                    <label htmlFor="rack_has_kvm" className="text-gray-200 cursor-pointer">
                      KVM Switch
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="rack_has_monitor"
                      checked={formData.rack_has_monitor || false}
                      onChange={(e) => updateFormData('rack_has_monitor', e.target.checked, true)}
                      className="form-checkbox h-5 w-5 text-blue-600 rounded"
                    />
                    <label htmlFor="rack_has_monitor" className="text-gray-200 cursor-pointer">
                      Monitor/Display
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Inspection Checklist (Cabinets only) */}
        {isCabinet && (
          <div className="card">
            <SectionHeader title="Inspection Checklist" section="inspection" icon="✅" />
          {!collapsed.inspection && (
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { key: 'cabinet_fans', label: 'All cabinet fans are running (if installed)' },
                  { key: 'controller_leds', label: 'Inspect Controller Status LEDs' },
                  { key: 'io_status', label: 'Inspect I/O Status LEDs' },
                  { key: 'network_status', label: 'Inspect Network Equipment Status' },
                  { key: 'temperatures', label: 'Environmental Temperatures Nominal' },
                  { key: 'is_clean', label: 'Cleaned Enclosure' },
                  { key: 'clean_filter_installed', label: 'Clean filter installed in cabinet' },
                  { key: 'ground_inspection', label: 'Ground Inspection' },
                ].map((item) => (
                  <div key={item.key}>
                    <label className="form-label">{item.label}</label>
                    <select
                      value={formData.inspection[item.key] || ''}
                      onChange={(e) => updateInspection(item.key, e.target.value)}
                      className="form-select"
                    >
                      <option value="">Select...</option>
                      <option value="pass">✅ PASS</option>
                      <option value="fail">❌ FAIL</option>
                      <option value="na">➖ N/A</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}

        {/* Comments */}
        <div className="card">
          <SectionHeader title="Comments & Notes" section="comments" icon="💬" />
          {!collapsed.comments && (
            <div className="card-body">
              <textarea
                value={formData.comments}
                onChange={(e) => updateFormData('comments', e.target.value)}
                rows="6"
                className="form-textarea"
                placeholder="Enter any additional notes, observations, or issues found during inspection..."
              ></textarea>
            </div>
          )}
        </div>
      </form>

      {/* Floating Save Button */}
      <div className="fixed bottom-8 right-8 flex gap-3 z-40">
        <button
          onClick={handleGeneratePDF}
          className="btn btn-warning shadow-2xl"
        >
          📄 Generate PDF
        </button>
        <button
          onClick={handleSave}
          disabled={saving || session?.status === 'completed'}
          className="btn btn-success shadow-2xl"
        >
          {saving ? '💾 Saving...' : '💾 Save All'}
        </button>
      </div>

      {/* Controller Selection Modal */}
      {showControllerModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full mx-4 border border-gray-700 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-100">Select Controller</h3>
              <button
                onClick={() => {
                  setShowControllerModal(false);
                  setCurrentControllerIndex(null);
                  setSelectedControllerId(null);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="px-6 py-4 border-b border-gray-700 flex-shrink-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="🔍 Search controllers..."
                  value={controllerSearchTerm}
                  onChange={(e) => setControllerSearchTerm(e.target.value)}
                  className="form-input"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setControllerFilter('all')}
                    className={`btn btn-sm ${controllerFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setControllerFilter('available')}
                    className={`btn btn-sm ${controllerFilter === 'available' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Available
                  </button>
                  <button
                    type="button"
                    onClick={() => setControllerFilter('used')}
                    className={`btn btn-sm ${controllerFilter === 'used' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Used
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="space-y-2">
                {filteredControllersForModal.length === 0 ? (
                  <div className="text-center text-gray-400 py-12">
                    <div className="text-4xl mb-4">🖥️</div>
                    <p>No controllers found. Import nodes from customer profile first.</p>
                  </div>
                ) : (
                  filteredControllersForModal.map((controller) => (
                    <div
                      key={controller.id}
                      onClick={() => setSelectedControllerId(controller.id)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedControllerId === controller.id
                          ? 'bg-blue-900/50 border-blue-500'
                          : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                      } ${controller.assigned_cabinet_id ? 'opacity-60' : ''}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-gray-100">
                            [{controller.node_type}] {controller.node_name}
                            {controller.is_redundant && (
                              <span className="ml-2 badge badge-green text-xs">🔄 Redundant</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400 mt-1">
                            Model: {controller.model || 'Unknown'} | Serial: {controller.serial || 'No Serial'}
                          </div>
                          <div className="text-sm text-gray-400">
                            Firmware: {controller.firmware || 'Unknown'}
                          </div>
                          {controller.partner_name && (
                            <div className="text-sm text-cyan-400 mt-1">
                              Partner: {controller.partner_name}
                            </div>
                          )}
                          {controller.assigned_cabinet_name && (
                            <div className="text-sm text-yellow-400 mt-1">
                              Currently in: {controller.assigned_cabinet_name}
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          {controller.assigned_cabinet_id ? (
                            <span className="badge badge-yellow text-xs">Used</span>
                          ) : (
                            <span className="badge badge-green text-xs">Available</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowControllerModal(false);
                  setCurrentControllerIndex(null);
                  setSelectedControllerId(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={selectControllerFromModal}
                disabled={selectedControllerId === null}
                className="btn btn-primary"
              >
                Select Controller
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch Selection Modal */}
      {showSwitchModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full mx-4 border border-gray-700 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-100">Select Smart Switch</h3>
              <button
                onClick={() => {
                  setShowSwitchModal(false);
                  setCurrentSwitchIndex(null);
                  setSelectedSwitchId(null);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-4 border-b border-gray-700 flex-shrink-0">
              <input
                type="text"
                placeholder="Search switches by name, model, or serial..."
                value={switchSearchTerm}
                onChange={(e) => setSwitchSearchTerm(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {filteredSwitchesForModal.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    {switchSearchTerm
                      ? 'No switches match your search'
                      : 'No available switches found'}
                  </div>
                ) : (
                  filteredSwitchesForModal.map((switchNode) => (
                    <div
                      key={switchNode.id}
                      onClick={() => setSelectedSwitchId(switchNode.id)}
                      className={`cursor-pointer p-4 rounded-lg border transition-all ${
                        selectedSwitchId === switchNode.id
                          ? 'bg-blue-900/50 border-blue-500'
                          : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                      } ${switchNode.assigned_cabinet_id ? 'opacity-60' : ''}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-gray-100">
                            [{switchNode.node_type}] {switchNode.node_name}
                          </div>
                          <div className="text-sm text-gray-400 mt-1">
                            Model: {switchNode.model || 'Unknown'} | Serial: {switchNode.serial || 'No Serial'}
                          </div>
                          {switchNode.assigned_cabinet_name && (
                            <div className="text-sm text-yellow-400 mt-1">
                              Currently in: {switchNode.assigned_cabinet_name}
                            </div>
                          )}
                        </div>
                        {selectedSwitchId === switchNode.id && (
                          <span className="text-green-400 text-xl ml-3">✓</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowSwitchModal(false);
                  setCurrentSwitchIndex(null);
                  setSelectedSwitchId(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={selectSwitchFromModal}
                disabled={selectedSwitchId === null}
                className="btn btn-primary"
              >
                Select Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workstation Selection Modal */}
      {showWorkstationModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full mx-4 border border-gray-700 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-100">Select Workstation</h3>
              <button
                onClick={() => {
                  setShowWorkstationModal(false);
                  setCurrentWorkstationIndex(null);
                  setSelectedWorkstationId(null);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-4 border-b border-gray-700 flex-shrink-0">
              <input
                type="text"
                placeholder="🔍 Search workstations by name, model, or serial..."
                value={workstationSearchTerm}
                onChange={(e) => setWorkstationSearchTerm(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {availableWorkstations.filter((ws) => {
                  return (
                    ws.node_name?.toLowerCase().includes(workstationSearchTerm.toLowerCase()) ||
                    ws.model?.toLowerCase().includes(workstationSearchTerm.toLowerCase()) ||
                    ws.serial?.toLowerCase().includes(workstationSearchTerm.toLowerCase())
                  );
                }).length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    {workstationSearchTerm
                      ? 'No workstations match your search'
                      : 'No available workstations found'}
                  </div>
                ) : (
                  availableWorkstations.filter((ws) => {
                    return (
                      ws.node_name?.toLowerCase().includes(workstationSearchTerm.toLowerCase()) ||
                      ws.model?.toLowerCase().includes(workstationSearchTerm.toLowerCase()) ||
                      ws.serial?.toLowerCase().includes(workstationSearchTerm.toLowerCase())
                    );
                  }).map((ws) => (
                    <div
                      key={ws.id}
                      onClick={() => setSelectedWorkstationId(ws.id)}
                      className={`cursor-pointer p-4 rounded-lg border transition-all ${
                        selectedWorkstationId === ws.id
                          ? 'bg-blue-900/50 border-blue-500'
                          : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                      } ${ws.assigned_cabinet_id ? 'opacity-60' : ''}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-gray-100">
                            [{ws.node_type}] {ws.node_name}
                          </div>
                          <div className="text-sm text-gray-400 mt-1">
                            Model: {ws.model || 'Unknown'} | Serial: {ws.serial || 'No Serial'}
                          </div>
                          {ws.assigned_cabinet_name && (
                            <div className="text-sm text-yellow-400 mt-1">
                              Currently in: {ws.assigned_cabinet_name}
                            </div>
                          )}
                        </div>
                        {selectedWorkstationId === ws.id && (
                          <span className="text-green-400 text-xl ml-3">✓</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowWorkstationModal(false);
                  setCurrentWorkstationIndex(null);
                  setSelectedWorkstationId(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={selectWorkstationFromModal}
                disabled={selectedWorkstationId === null}
                className="btn btn-primary"
              >
                Select Workstation
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
