import { useState, useEffect } from 'react';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function DiagnosticsAdvanced({ sessionId, isCompleted, customerId }) {
  const [controllers, setControllers] = useState([]);
  const [diagnostics, setDiagnostics] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  
  // Modal states
  const [showCardModal, setShowCardModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [currentController, setCurrentController] = useState(null);
  const [currentCard, setCurrentCard] = useState(null);
  const [selectedChannels, setSelectedChannels] = useState([]);
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

  // Helper to normalize maintenance data (array or object)
  const normalizeMaintenance = (data) => {
    console.log('🔍 [DiagnosticsAdvanced] Raw maintenance data type:', Array.isArray(data) ? 'array' : typeof data);
    console.log('🔍 [DiagnosticsAdvanced] Raw maintenance data:', data);
    
    if (!data) return {};
    if (Array.isArray(data)) {
      const mapped = {};
      data.forEach((item) => {
        mapped[item.node_id] = item;
      });
      console.log('✅ [DiagnosticsAdvanced] Normalized array to object:', mapped);
      return mapped;
    }
    if (typeof data === 'object') {
      console.log('✅ [DiagnosticsAdvanced] Already object format');
      return data;
    }
    return {};
  };

  useEffect(() => {
    loadData();
  }, [sessionId, customerId]);

  const loadData = async () => {
    try {
      console.log('📊 [DiagnosticsAdvanced] Loading data for session:', sessionId);
      
      // Load diagnostics first
      const diagResponse = await fetch(`/api/sessions/${sessionId}/diagnostics`);
      let diagData = [];
      if (diagResponse.ok) {
        diagData = await diagResponse.json() || [];
        console.log('📊 [DiagnosticsAdvanced] Loaded', diagData.length, 'diagnostic entries');
        setDiagnostics(diagData);
      }

      // Load node maintenance to check which controllers are marked with errors
      console.log('🔍 [DiagnosticsAdvanced] Fetching node maintenance data...');
      const maintenanceResponse = await fetch(`/api/sessions/${sessionId}/node-maintenance`);
      let controllersMarkedWithErrors = [];
      
      if (maintenanceResponse.ok) {
        const raw = await maintenanceResponse.json();
        const maintenanceData = normalizeMaintenance(raw);
        
        // Filter for controllers where no_errors_checked === false (meaning HAS errors)
        const entries = Object.entries(maintenanceData);
        console.log('🔍 [DiagnosticsAdvanced] Total maintenance entries:', entries.length);
        
        controllersMarkedWithErrors = entries
          .filter(([nodeId, data]) => {
            const hasErrors = data?.no_errors_checked === false;
            if (hasErrors) {
              console.log('⚠️ [DiagnosticsAdvanced] Node', nodeId, 'marked with errors:', data);
            }
            return hasErrors;
          })
          .map(([nodeId]) => Number(nodeId));
        
        console.log('⚠️ [DiagnosticsAdvanced] Controllers marked with errors (IDs):', controllersMarkedWithErrors);
      } else {
        console.warn('⚠️ [DiagnosticsAdvanced] Failed to load maintenance data');
      }

      // Get unique controller names from existing diagnostics
      const controllersWithIOErrors = [...new Set(diagData.map(d => d.controller_name))];
      console.log('🔧 [DiagnosticsAdvanced] Controllers with I/O errors from diagnostics table:', controllersWithIOErrors);
      
      // Load nodes (pass sessionId for completed sessions to get snapshot data)
      console.log('🔍 [DiagnosticsAdvanced] Fetching nodes for customer:', customerId);
      const nodesResponse = await fetch(`/api/customers/${customerId}/nodes${isCompleted ? `?sessionId=${sessionId}` : ''}`);
      
      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json();
        console.log('📊 [DiagnosticsAdvanced] Loaded', nodesData.length, 'total nodes');
        
        // Show controllers that either:
        // 1. Have I/O errors in diagnostics table, OR
        // 2. Are marked with errors in node maintenance (no_errors_checked = false)
        const controllerNodes = nodesData.filter(
          (n) => {
            const isController = ['Controller', 'CIOC', 'CSLS'].includes(n.node_type);
            const notPartner = !n.node_name.endsWith('-partner');
            const hasIOError = controllersWithIOErrors.includes(n.node_name);
            const markedWithError = controllersMarkedWithErrors.includes(n.id);
            
            const shouldInclude = isController && notPartner && (hasIOError || markedWithError);
            
            if (shouldInclude) {
              console.log('✅ [DiagnosticsAdvanced] Including controller:', n.node_name, 'ID:', n.id, 'hasIOError:', hasIOError, 'markedWithError:', markedWithError);
            }
            
            return shouldInclude;
          }
        );
        
        console.log('✅ [DiagnosticsAdvanced] Final controller list:', controllerNodes.length, 'controllers');
        setNodes(controllerNodes);
        buildControllersStructure(controllerNodes, diagData);
      } else {
        console.warn('⚠️ [DiagnosticsAdvanced] Failed to load nodes');
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

    // Build from diagnostics
    diagList.forEach((diag) => {
      if (!controllerMap[diag.controller_name]) {
        controllerMap[diag.controller_name] = { name: diag.controller_name, cards: {} };
      }
      if (!controllerMap[diag.controller_name].cards[diag.card_number]) {
        controllerMap[diag.controller_name].cards[diag.card_number] = [];
      }
      controllerMap[diag.controller_name].cards[diag.card_number].push(diag);
    });

    setControllers(Object.values(controllerMap));
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const addCard = (controllerName) => {
    setCurrentController(controllerName);
    setShowCardModal(true);
  };

  const selectCard = (cardNumber) => {
    setCurrentCard({ controller: currentController, cardNumber });
    setShowCardModal(false);
    setShowChannelModal(true);
  };

  const selectChannel = (channelNumber) => {
    // Toggle channel selection
    if (selectedChannels.includes(channelNumber)) {
      setSelectedChannels(selectedChannels.filter((c) => c !== channelNumber));
    } else {
      setSelectedChannels([...selectedChannels, channelNumber]);
    }
  };

  const proceedToErrorType = () => {
    if (selectedChannels.length === 0) {
      showMessage('Please select at least one channel', 'error');
      return;
    }
    setShowChannelModal(false);
    setShowErrorModal(true);
  };

  const saveErrors = async () => {
    if (!selectedErrorType) {
      showMessage('Please select an error type', 'error');
      return;
    }

    try {
      const errors = selectedChannels.map((channel) => ({
        controller_name: currentCard.controller,
        card_number: currentCard.cardNumber,
        channel_number: channel,
        error_type: selectedErrorType,
        description: errorDescription || errorTypes.find((t) => t.value === selectedErrorType)?.description || '',
      }));

      for (const error of errors) {
        await api.request(`/api/sessions/${sessionId}/diagnostics`, {
          method: 'POST',
          body: JSON.stringify(error),
        });
      }

      soundSystem.playSuccess();
      showMessage(`Added ${errors.length} error(s) successfully`, 'success');
      setShowErrorModal(false);
      setSelectedChannels([]);
      setSelectedErrorType('');
      setErrorDescription('');
      setCurrentCard(null);
      setCurrentController(null);
      loadData();
    } catch (error) {
      soundSystem.playError();
      showMessage('Error saving diagnostics', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner h-12 w-12"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg ${
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

      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold text-gray-100 mb-2">🎛️ Controller Diagnostics</h3>
        <p className="text-gray-400">Click channels to add I/O errors for each controller/card</p>
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
              {isCompleted ? 'This completed PM session has no I/O error data on file.' : 'Controllers with errors will appear here. All systems operating normally!'}
            </p>
          </div>
        </div>
      ) : nodes.length === 0 && diagnostics.length > 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="text-gray-400 mb-4">Errors exist but controller nodes not found</p>
            <p className="text-gray-500 text-sm">
              {isCompleted ? 'Diagnostic errors were recorded but node list was not saved for this session.' : 'Import nodes from customer profile to manage these errors'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {nodes.map((node) => {
            const controllerData = controllers.find((c) => c.name === node.node_name);
            const cardNumbers = controllerData ? Object.keys(controllerData.cards).map(Number).sort((a, b) => a - b) : [];
            const totalErrors = diagnostics.filter((d) => d.controller_name === node.node_name).length;

            return (
              <div key={node.id} className="card">
                <div className="card-header flex justify-between items-center">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-100">
                      🎛️ {node.node_name}
                      {node.is_redundant && <span className="ml-2 badge badge-green text-xs">Redundant</span>}
                    </h4>
                    <div className="text-sm text-gray-400 mt-1">
                      {cardNumbers.length} Card{cardNumbers.length !== 1 ? 's' : ''} | {totalErrors} Error{totalErrors !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => addCard(node.node_name)}
                    className="btn btn-primary btn-sm"
                    disabled={isCompleted}
                  >
                    ➕ Add Card
                  </button>
                </div>
                
                {cardNumbers.length > 0 && (
                  <div className="card-body">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {cardNumbers.map((cardNum) => {
                        const cardErrors = controllerData.cards[cardNum] || [];
                        return (
                          <div
                            key={cardNum}
                            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                              cardErrors.length > 0
                                ? 'bg-red-900/30 border-red-500 hover:bg-red-900/40'
                                : 'bg-gray-700/30 border-gray-600 hover:bg-gray-700/50'
                            }`}
                            onClick={() => {
                              setCurrentCard({ controller: node.node_name, cardNumber: cardNum });
                              setShowChannelModal(true);
                            }}
                          >
                            <div className="text-center">
                              <div className="text-xl font-bold text-gray-200">Card {cardNum}</div>
                              {cardErrors.length > 0 ? (
                                <div className="text-xs text-red-300 mt-1">{cardErrors.length} error(s)</div>
                              ) : (
                                <div className="text-xs text-green-400 mt-1">✅ Clean</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error Table */}
      {diagnostics.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h4 className="text-lg font-semibold text-gray-100">📊 Error Log</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="table-dark">
              <thead>
                <tr>
                  <th>Controller</th>
                  <th>Card</th>
                  <th>Channel</th>
                  <th>Error Type</th>
                  <th>Description</th>
                  {!isCompleted && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {diagnostics.map((error) => (
                  <tr key={error.id}>
                    <td className="font-medium">{error.controller_name}</td>
                    <td>{error.card_number}</td>
                    <td>{error.channel_number}</td>
                    <td>
                      <span className="badge badge-red text-xs">
                        {error.error_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="text-sm">{error.description}</td>
                    {!isCompleted && (
                      <td>
                        <button
                          onClick={async () => {
                            if (!confirm('Delete this error?')) return;
                            try {
                              await api.request(`/api/sessions/${sessionId}/diagnostics/${error.id}`, {
                                method: 'DELETE',
                              });
                              soundSystem.playSuccess();
                              loadData();
                            } catch (err) {
                              soundSystem.playError();
                              showMessage('Error deleting', 'error');
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

      {/* Card Selection Modal */}
      {showCardModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">
                Add Cards to {currentController}
              </h3>
              <button
                onClick={() => setShowCardModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-gray-400 text-sm mb-4">Select a card number (1-60):</p>
              <div className="grid grid-cols-10 gap-2 max-h-96 overflow-y-auto">
                {Array.from({ length: 60 }, (_, i) => i + 1).map((cardNum) => {
                  const controllerData = controllers.find((c) => c.name === currentController);
                  const hasCard = controllerData && controllerData.cards[cardNum];
                  return (
                    <button
                      key={cardNum}
                      onClick={() => selectCard(cardNum)}
                      className={`p-3 rounded-lg border text-center font-bold transition-all ${
                        hasCard
                          ? 'bg-blue-900/50 border-blue-500 text-blue-300'
                          : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {cardNum}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
              <button onClick={() => setShowCardModal(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Channel Selection Modal */}
      {showChannelModal && currentCard && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-3xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">
                {currentCard.controller} - Card {currentCard.cardNumber}
              </h3>
              <button
                onClick={() => {
                  setShowChannelModal(false);
                  setSelectedChannels([]);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-gray-400 text-sm mb-4">
                Click channels to select (selected: {selectedChannels.length})
              </p>
              <div className="grid grid-cols-8 gap-2">
                {Array.from({ length: 32 }, (_, i) => i + 1).map((channelNum) => {
                  const isSelected = selectedChannels.includes(channelNum);
                  const hasError = diagnostics.some(
                    (d) =>
                      d.controller_name === currentCard.controller &&
                      d.card_number === currentCard.cardNumber &&
                      d.channel_number === channelNum
                  );
                  return (
                    <button
                      key={channelNum}
                      onClick={() => selectChannel(channelNum)}
                      className={`p-3 rounded-lg border text-center font-bold transition-all ${
                        isSelected
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : hasError
                          ? 'bg-red-900/50 border-red-500 text-red-300'
                          : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {channelNum}
                      {hasError && <div className="text-xs">⚠️</div>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowChannelModal(false);
                  setSelectedChannels([]);
                }}
                className="btn btn-secondary"
              >
                Close Card
              </button>
              <button
                onClick={proceedToErrorType}
                disabled={selectedChannels.length === 0}
                className="btn btn-primary"
              >
                Add Error to {selectedChannels.length} Channel(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Type Selection Modal */}
      {showErrorModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Select Error Type</h3>
              <button
                onClick={() => {
                  setShowErrorModal(false);
                  setShowChannelModal(true);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {errorTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => {
                      setSelectedErrorType(type.value);
                      setErrorDescription(type.description);
                    }}
                    className={`p-4 rounded-lg border transition-all ${
                      selectedErrorType === type.value
                        ? 'bg-blue-600 border-blue-400'
                        : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <div className="text-3xl mb-2">{type.icon}</div>
                    <div className="text-sm font-medium text-gray-200">{type.label}</div>
                  </button>
                ))}
              </div>
              
              <div>
                <label className="form-label">Description (optional)</label>
                <textarea
                  value={errorDescription}
                  onChange={(e) => setErrorDescription(e.target.value)}
                  rows="3"
                  className="form-textarea"
                  placeholder="Add additional details..."
                ></textarea>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowErrorModal(false);
                  setShowChannelModal(true);
                }}
                className="btn btn-secondary"
              >
                Back
              </button>
              <button
                onClick={saveErrors}
                disabled={!selectedErrorType}
                className="btn btn-primary"
              >
                Add Error(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
