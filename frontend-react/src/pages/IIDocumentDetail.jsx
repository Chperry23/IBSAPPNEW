import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

// Define all checklist sections
const CHECKLIST_SECTIONS = [
  {
    name: 'Good Engineering Practices',
    icon: '⚡',
    items: [
      'Ensure all power supplied to the enclosures is de-energized (the circuit breaker(s) open)',
      'In the DeltaV enclosures, open all circuit breakers and fuse holders and check for no power',
      'Are there any environmental concerns about the installation? (Water leaks, Moisture, Dust, Dirt, Temperature, etc.?)'
    ]
  },
  {
    name: 'Power and Grounding Connections',
    icon: '🔌',
    items: [
      'Are the connections performed per design, properly terminated, and labeled. Is the wire of proper size for distance?',
      'Check the impedance and current flow for the enclosure grounding system (AC/CG Chassis Ground). A High Integrity Ground should measure 1 ohm or less to ground. 5Ω Max',
      'Is the Dedicated Instrumentation Ground (DIG) or Local DCG connected to the lowest available dedicated connection to true earth?',
      'Is the DIG connection to the true earth dedicated and not shared with any other ground?',
      'Is the DIG ground cable insulated? Is it physically separated from high voltage or variable speed drive cables?',
      'Are isolated receptacles used to power the Servers and PCs?'
    ]
  },
  {
    name: 'Enclosures',
    icon: '🗄️',
    items: [
      'Is the enclosure free of any signs of environmental, shipping, or installation damage? Visually look over the DeltaV cabinet for loose wires, carrier separation, loose modules, and any damage that may have occurred during shipment and installation and correct any discrepancies found before proceeding',
      'Are all cable entries in and out of the cabinets and enclosures sealed, if required?',
      'Back planes plugged in tightly • All power supplies controllers, I/O modules screwed in securely (Do not over torque) • Input power wiring termination tight and labeled • Network cables locked in place',
      'Are all enclosures properly positioned and mounted with groups of enclosures properly bolted together?',
      'Are all Power and Ground connections solid and tightened? Is there good conduction in all connections (that is, no corrosion or hanging wire strands)?',
      'Do the enclosure AC ground bus bar, the Instrument (DC) ground bus bar, and, if applicable, the Intrinsic Safety Ground have separately wired connections to the DIG using insulated wire of the proper size? Are all connections tight.',
      'Calculate the DeltaV carrier power implementation. Verify that it does not exceed the recommendations.',
      'Are network cables routed and installed according to the guidelines. Are the network cable shields terminated properly? Are the proper connector (shielded or unshielded) used and does the network installation follow the design?',
      'Are colored boots used to distinguish primary and secondary DeltaV LAN cables?',
      'Are all communication cables properly labeled at both ends?'
    ]
  },
  {
    name: 'AC Power System',
    icon: '⚡',
    items: [
      'Verify that all AC powered devices in the enclosure are switched off or disconnected',
      'With AC power system disconnected, measure impedance of system from all line and neutral connections to ground (Impedance must be high)',
      'If the impedance is in conformance, have a person approved by the customer switch on the AC power system. Record the person\'s name.',
      'Check that primary AC voltage is within specifications (85 to 264 VAC / 47 to 63 Hz measured between line and neutral)',
      'Check that primary AC ground to neutral voltage is within specification (0.00 V +/-1.00 VAC)',
      'Check that secondary AC voltage is within specifications (85 to 264 VAC / 47 to 63 Hz Measured between Line and Neutral)',
      'Check that secondary AC ground to neutral voltage is within specification (0.00 V +/-1.00 VAC)',
      'If conforming, it is appropriate to switch ON or reconnect all AC powered devices. One at a time switch on each of the cabinet sub-breakers or fuse holders and check the equipment that they feed power up correctly.',
      'Verify that all AC powered fans, cooling devices, lights, and so on are running and operational.',
      'Verify if LED\'s of all AC powered devices indicate normal'
    ]
  },
  {
    name: 'DC Power System',
    icon: '🔋',
    items: [
      'Verify that all AC-powered devices in the enclosure are switched off or disconnected',
      'With the DC power system disconnected, measure impedance of system from all line and neutral connections to ground (Impedance MUST be High)',
      'Apply DC voltage to the distribution system',
      'Check that primary 24 VDC is within specifications. (21.6 VDC to 26.4 VDC)',
      'Check that secondary 24 VDC is within specifications. (21.6 VDC to 26.4 VDC)',
      'Check that primary 12 VDC is within specifications. (11.4 VDC to 12.6 VDC)',
      'Check that secondary 12 VDC is within specifications. (11.4 VDC to 12.6 VDC)',
      'Verify that all DC powered fans, cooling devices, lights, and so on are running and operational.',
      'Verify that LEDs of all DC powered devices indicate normal',
      'Check at the destination end of each of the system power supply feeds i.e. the connectors on the System Power supplies, carrier F.B. Connectors , etc. for the proper voltage levels.'
    ]
  },
  {
    name: 'DeltaV Controllers',
    icon: '🎛️',
    items: [
      'System power supply LEDs normal (Power-ON, Error-OFF)',
      'Active controller\'s LEDs normal (Power - ON, Error - OFF if downloaded / Flash if un-configured, Active - ON, Standby - OFF, CN1 - Flash if communicating on the primary control network, CN2 - Flash if communicating on the secondary control network)',
      'Standby controller\'s LEDs normal (Power - ON, Error - OFF if downloaded / Flash if un-configured, Active - OFF, Standby - ON, CN1 - Flash if communicating on the primary control network, CN2 - Flash if communicating on the secondary control network)',
      'Controller accessible through standard diagnostics (accessible, primary & secondary communication without increasing errors)',
      'All I/O cards accessible through standard diagnostics (accessible, no mismatches, no missing cards)',
      'Are network cables routed and installed according to the guidelines in the document Site Preparation and Design for DeltaV Digital Automation Systems?',
      'Are servers, stations, routers, and so on, cleaned up (software) and reinstalled according to station specific installation?',
      'Using Diagnostics, are both Primary and Secondary communications good?',
      'Placeholder created w/ cold restart enabled, can controller be commissioned?',
      'Did the controller(s) Auto-Sense their I/O cards properly when commissioned?',
      'Software Upgrade(flash) newly integrated controllers, RIO/CIOC, and I/O to same system revision installed if able.',
      'Can the controller(s) be downloaded?',
      'Are all controllers and I/O cards error free after being downloaded?',
      'Using Diagnostics, are both Primary and Secondary communications with each of the relevant Server and PC nodes good?',
      'Have the system diagnostics been performed and do the diagnostics readings result in expected values?',
      'Are servers, stations, routers, and so on, cleaned up (software) and reinstalled according to station specific installation, placeholders created with alarm and events assigned?',
      'Downloaded setup data to controllers, CIOC/RIO, and PP if needed, to update enumeration sets and node tables.'
    ]
  }
];

export default function IIDocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [session, setSession] = useState(null);
  const [equipment, setEquipment] = useState(null);
  const [checklistItems, setChecklistItems] = useState([]);
  const [equipmentUsed, setEquipmentUsed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);

  useEffect(() => {
    loadDocumentData();
  }, [id]);

  const loadDocumentData = async () => {
    try {
      const docData = await api.request(`/api/ii-documents/${id}`);
      setDocument(docData);

      const sessionData = await api.getSession(docData.session_id);
      setSession(sessionData);

      // Load equipment checklist
      const equipmentData = await api.request(`/api/ii-documents/${id}/ii-equipment`);
      setEquipment(equipmentData || {});

      // Load checklist items
      const items = await api.request(`/api/ii-documents/${id}/ii-checklist`);
      setChecklistItems(items || []);

      // Load equipment used
      const usedEquipment = await api.request(`/api/ii-documents/${id}/ii-equipment-used`);
      setEquipmentUsed(usedEquipment || []);
    } catch (error) {
      console.error('Error loading I&I document:', error);
      showMessage('Error loading I&I document data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const toggleSection = (sectionName) => {
    setCollapsed(prev => ({ ...prev, [sectionName]: !prev[sectionName] }));
  };

  const handleEquipmentChange = async (field, value) => {
    const updatedEquipment = { ...equipment, [field]: value };
    setEquipment(updatedEquipment);

    try {
      await api.request(`/api/ii-documents/${id}/ii-equipment`, {
        method: 'POST',
        body: JSON.stringify(updatedEquipment)
      });
      // Success - no sound for auto-save
    } catch (error) {
      console.error('Error saving equipment:', error);
      showMessage('Error saving equipment', 'error');
      soundSystem.playError();
    }
  };

  const handleChecklistChange = async (sectionName, itemName, field, value) => {
    const existingItem = checklistItems.find(
      item => item.section_name === sectionName && item.item_name === itemName
    );

    const updatedItem = {
      ...existingItem,
      section_name: sectionName,
      item_name: itemName,
      [field]: value
    };

    try {
      await api.request(`/api/ii-documents/${id}/ii-checklist`, {
        method: 'POST',
        body: JSON.stringify(updatedItem)
      });

      // Update local state
      setChecklistItems(prev => {
        const index = prev.findIndex(
          item => item.section_name === sectionName && item.item_name === itemName
        );
        if (index >= 0) {
          const newItems = [...prev];
          newItems[index] = { ...newItems[index], ...updatedItem };
          return newItems;
        }
        return [...prev, updatedItem];
      });

      // Success - no sound for auto-save
    } catch (error) {
      console.error('Error saving checklist item:', error);
      showMessage('Error saving checklist item', 'error');
      soundSystem.playError();
    }
  };

  const getChecklistItem = (sectionName, itemName) => {
    return checklistItems.find(
      item => item.section_name === sectionName && item.item_name === itemName
    ) || {};
  };

  const handleAddEquipmentUsed = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      await api.request(`/api/ii-documents/${id}/ii-equipment-used`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      soundSystem.playSuccess();
      setShowEquipmentModal(false);
      loadDocumentData();
      e.target.reset();
    } catch (error) {
      soundSystem.playError();
      showMessage('Error adding equipment', 'error');
    }
  };

  const handleExportPDF = async () => {
    try {
      showMessage('Generating I&I PDF for this cabinet...', 'info');
      
      const response = await fetch(`/api/ii-documents/${id}/export-pdf`, {
        method: 'POST',
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `II-${document.document_name}-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        soundSystem.playSuccess();
        showMessage('✅ PDF generated successfully!', 'success');
      } else {
        soundSystem.playError();
        showMessage('Error generating PDF', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error generating PDF: ' + error.message, 'error');
    }
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

  if (!document) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-400">Document not found</p>
          <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
            Go Back
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-2">
              🔧 {document.document_name}
            </h1>
            <p className="text-gray-400">
              {session?.session_name} - I&I Checklist
            </p>
            {document.deltav_system_id && (
              <p className="text-sm text-gray-500 mt-1">
                DeltaV System ID: {document.deltav_system_id}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExportPDF}
              className="btn btn-warning"
            >
              📄 Export PDF
            </button>
            <button
              onClick={() => navigate(`/ii-session/${document.session_id}`)}
              className="btn btn-secondary"
            >
              ← Back to Session
            </button>
          </div>
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

      {/* Equipment Necessary Section */}
      <div className="card mb-6">
        <div
          className="card-header cursor-pointer flex justify-between items-center"
          onClick={() => toggleSection('equipment')}
        >
          <h2 className="text-xl font-semibold text-gray-100">
            🔧 Equipment Necessary
          </h2>
          <span className="text-2xl transition-transform" style={{ transform: collapsed.equipment ? 'rotate(0deg)' : 'rotate(90deg)' }}>
            ▶
          </span>
        </div>
        {!collapsed.equipment && (
          <div className="card-body">
            <p className="text-sm text-gray-400 mb-4">
              The following equipment is needed to perform the checks in this I&I:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={equipment?.clamp_on_rms_ammeter || false}
                    onChange={(e) => handleEquipmentChange('clamp_on_rms_ammeter', e.target.checked)}
                    className="form-checkbox"
                  />
                  <span className="text-gray-300">Clamp-on RMS Ammeter</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={equipment?.digit_dvm || false}
                    onChange={(e) => handleEquipmentChange('digit_dvm', e.target.checked)}
                    className="form-checkbox"
                  />
                  <span className="text-gray-300">4½ Digit DVM</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={equipment?.fluke_1630_earth_ground || false}
                    onChange={(e) => handleEquipmentChange('fluke_1630_earth_ground', e.target.checked)}
                    className="form-checkbox"
                  />
                  <span className="text-gray-300">Fluke 1630 Earth Ground Clamp</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={equipment?.fluke_mt8200_micromapper || false}
                    onChange={(e) => handleEquipmentChange('fluke_mt8200_micromapper', e.target.checked)}
                    className="form-checkbox"
                  />
                  <span className="text-gray-300">Fluke MT-8200-49A MicroMapper</span>
                </label>
              </div>
            </div>
            <div className="mt-4">
              <label className="form-label">Additional Notes</label>
              <textarea
                value={equipment?.notes || ''}
                onChange={(e) => handleEquipmentChange('notes', e.target.value)}
                className="form-input"
                rows="2"
                placeholder="Any additional equipment or notes..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Checklist Sections */}
      {CHECKLIST_SECTIONS.map((section) => (
        <div key={section.name} className="card mb-6">
          <div
            className="card-header cursor-pointer flex justify-between items-center"
            onClick={() => toggleSection(section.name)}
          >
            <h2 className="text-xl font-semibold text-gray-100">
              {section.icon} {section.name}
            </h2>
            <span className="text-2xl transition-transform" style={{ transform: collapsed[section.name] ? 'rotate(0deg)' : 'rotate(90deg)' }}>
              ▶
            </span>
          </div>
          {!collapsed[section.name] && (
            <div className="card-body space-y-4">
              {section.items.map((itemName, idx) => {
                const item = getChecklistItem(section.name, itemName);
                return (
                  <div key={idx} className="border border-gray-600 rounded-lg p-4 bg-gray-700/30">
                    <div className="font-medium text-gray-200 mb-3">{itemName}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="form-label text-xs">Answer</label>
                        <div className="flex gap-2">
                          {['Yes', 'No', 'N/A'].map((answer) => (
                            <button
                              key={answer}
                              onClick={() => handleChecklistChange(section.name, itemName, 'answer', answer)}
                              className={`px-4 py-2 rounded border transition-colors ${
                                item.answer === answer
                                  ? answer === 'Yes'
                                    ? 'bg-green-600 border-green-500 text-white'
                                    : answer === 'No'
                                    ? 'bg-red-600 border-red-500 text-white'
                                    : 'bg-gray-600 border-gray-500 text-white'
                                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              {answer}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="form-label text-xs">Recorded Value</label>
                        <input
                          type="text"
                          value={item.recorded_value || ''}
                          onChange={(e) => handleChecklistChange(section.name, itemName, 'recorded_value', e.target.value)}
                          className="form-input"
                          placeholder="e.g., 24.2 VDC"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="form-label text-xs">Comments</label>
                        <textarea
                          value={item.comments || ''}
                          onChange={(e) => handleChecklistChange(section.name, itemName, 'comments', e.target.value)}
                          className="form-input"
                          rows="2"
                          placeholder="Additional notes or observations..."
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Equipment Used Section */}
      <div className="card">
        <div className="card-header flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-100">
            🛠️ List of Equipment Used
          </h2>
          <button
            onClick={() => setShowEquipmentModal(true)}
            className="btn btn-primary btn-sm"
          >
            ➕ Add Equipment
          </button>
        </div>
        <div className="card-body">
          {equipmentUsed.length === 0 ? (
            <p className="text-gray-400 text-center py-4">
              No equipment added yet. Click "Add Equipment" to add measurement devices.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left p-2 text-gray-300">Manufacturer</th>
                    <th className="text-left p-2 text-gray-300">Type</th>
                    <th className="text-left p-2 text-gray-300">Serial #</th>
                    <th className="text-left p-2 text-gray-300">Recalibration Date</th>
                    <th className="text-left p-2 text-gray-300">Used In Section</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentUsed.map((eq, idx) => (
                    <tr key={idx} className="border-b border-gray-700/50">
                      <td className="p-2 text-gray-300">{eq.manufacturer}</td>
                      <td className="p-2 text-gray-300">{eq.type}</td>
                      <td className="p-2 text-gray-300">{eq.serial_number}</td>
                      <td className="p-2 text-gray-300">{eq.recalibration_date}</td>
                      <td className="p-2 text-gray-300">{eq.used_in_section}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Equipment Modal */}
      {showEquipmentModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">
                Add Equipment Used
              </h3>
              <button
                onClick={() => setShowEquipmentModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAddEquipmentUsed}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Manufacturer *</label>
                  <input
                    type="text"
                    name="manufacturer"
                    required
                    className="form-input"
                    placeholder="e.g., Fluke"
                  />
                </div>
                <div>
                  <label className="form-label">Type/Model *</label>
                  <input
                    type="text"
                    name="type"
                    required
                    className="form-input"
                    placeholder="e.g., 1630 Earth Ground Clamp"
                  />
                </div>
                <div>
                  <label className="form-label">Serial Number *</label>
                  <input
                    type="text"
                    name="serial_number"
                    required
                    className="form-input"
                    placeholder="e.g., 12345678"
                  />
                </div>
                <div>
                  <label className="form-label">Recalibration Date</label>
                  <input
                    type="date"
                    name="recalibration_date"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Used In Section</label>
                  <select name="used_in_section" className="form-input">
                    <option value="">Select section...</option>
                    {CHECKLIST_SECTIONS.map(section => (
                      <option key={section.name} value={section.name}>
                        {section.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEquipmentModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Equipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
