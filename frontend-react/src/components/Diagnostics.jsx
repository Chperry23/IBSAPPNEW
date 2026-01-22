import { useState, useEffect } from 'react';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function Diagnostics({ sessionId, isCompleted }) {
  const [diagnostics, setDiagnostics] = useState([]);
  const [controllers, setControllers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddError, setShowAddError] = useState(false);
  const [message, setMessage] = useState(null);
  const [newError, setNewError] = useState({
    controller_name: '',
    card_number: '',
    channel_number: '',
    error_type: '',
    description: '',
    notes: '',
  });

  const errorTypes = [
    { value: 'bad', label: 'Bad', color: 'red' },
    { value: 'not_communicating', label: 'Not Communicating', color: 'orange' },
    { value: 'open_loop', label: 'Open Loop', color: 'yellow' },
    { value: 'loop_current_saturated', label: 'Loop Current Saturated', color: 'purple' },
    { value: 'device_error', label: 'Device Error', color: 'red' },
    { value: 'short_circuit', label: 'Short Circuit', color: 'red' },
    { value: 'no_card', label: 'No Card', color: 'gray' },
  ];

  useEffect(() => {
    loadDiagnostics();
  }, [sessionId]);

  const loadDiagnostics = async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/diagnostics`);
      if (response.ok) {
        const data = await response.json();
        setDiagnostics(data || []);
        
        // Extract unique controllers
        const uniqueControllers = [...new Set((data || []).map((d) => d.controller_name))].filter(Boolean);
        setControllers(uniqueControllers);
      } else {
        setDiagnostics([]);
      }
    } catch (error) {
      console.log('No diagnostics found or error loading:', error);
      setDiagnostics([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddError = async (e) => {
    e.preventDefault();
    if (isCompleted) return;

    try {
      const result = await api.request(`/api/sessions/${sessionId}/diagnostics`, {
        method: 'POST',
        body: JSON.stringify(newError),
      });

      if (result.success) {
        soundSystem.playSuccess();
        setShowAddError(false);
        setNewError({
          controller_name: '',
          card_number: '',
          channel_number: '',
          error_type: '',
          description: '',
          notes: '',
        });
        loadDiagnostics();
        setMessage({ text: 'Error added successfully', type: 'success' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        soundSystem.playError();
        setMessage({ text: result.error || 'Error adding diagnostic', type: 'error' });
      }
    } catch (error) {
      soundSystem.playError();
      setMessage({ text: 'Error adding diagnostic', type: 'error' });
    }
  };

  const handleDeleteError = async (errorId) => {
    if (!confirm('Delete this error entry?')) return;

    try {
      const result = await api.request(`/api/sessions/${sessionId}/diagnostics/${errorId}`, {
        method: 'DELETE',
      });

      if (result.success) {
        soundSystem.playSuccess();
        loadDiagnostics();
        setMessage({ text: 'Error deleted successfully', type: 'success' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        soundSystem.playError();
        setMessage({ text: 'Error deleting diagnostic', type: 'error' });
      }
    } catch (error) {
      soundSystem.playError();
      setMessage({ text: 'Error deleting diagnostic', type: 'error' });
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

      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-100">🔧 I/O Diagnostics & Errors</h3>
          <p className="text-sm text-gray-400 mt-1">Track controller errors, bad channels, and communication issues</p>
        </div>
        {!isCompleted && (
          <button
            onClick={() => setShowAddError(true)}
            className="btn btn-primary"
          >
            ➕ Add Error
          </button>
        )}
      </div>

      {/* Error Statistics */}
      {diagnostics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
            <div className="text-2xl font-bold text-red-400">{diagnostics.length}</div>
            <div className="text-sm text-gray-400">Total Errors</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
            <div className="text-2xl font-bold text-blue-400">{controllers.length}</div>
            <div className="text-sm text-gray-400">Controllers</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
            <div className="text-2xl font-bold text-yellow-400">
              {diagnostics.filter((d) => d.error_type === 'bad').length}
            </div>
            <div className="text-sm text-gray-400">Bad Signals</div>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
            <div className="text-2xl font-bold text-orange-400">
              {diagnostics.filter((d) => d.error_type === 'not_communicating').length}
            </div>
            <div className="text-sm text-gray-400">Not Communicating</div>
          </div>
        </div>
      )}

      {/* Errors Table */}
      <div className="card">
        <div className="card-header">
          <h4 className="text-lg font-semibold text-gray-100">Error Log</h4>
        </div>
        {diagnostics.length === 0 ? (
          <div className="card-body text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-gray-400">No I/O errors or diagnostics reported</p>
            {!isCompleted && (
              <button
                onClick={() => setShowAddError(true)}
                className="btn btn-primary mt-4"
              >
                ➕ Add First Error
              </button>
            )}
          </div>
        ) : (
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
                    <td className="font-medium text-gray-200">{error.controller_name}</td>
                    <td>{error.card_number}</td>
                    <td>{error.channel_number}</td>
                    <td>
                      <span
                        className={`badge ${
                          error.error_type === 'bad' || error.error_type === 'device_error'
                            ? 'badge-red'
                            : error.error_type === 'not_communicating'
                            ? 'badge-yellow'
                            : 'badge-gray'
                        }`}
                      >
                        {error.error_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="text-sm">{error.description || 'N/A'}</td>
                    {!isCompleted && (
                      <td>
                        <button
                          onClick={() => handleDeleteError(error.id)}
                          className="text-red-400 hover:text-red-300 font-medium"
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
        )}
      </div>

      {/* Add Error Modal */}
      {showAddError && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">➕ Add I/O Error</h3>
              <button
                onClick={() => setShowAddError(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAddError}>
              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Controller Name *</label>
                    <input
                      type="text"
                      value={newError.controller_name}
                      onChange={(e) => setNewError({ ...newError, controller_name: e.target.value })}
                      required
                      placeholder="e.g., CTRL_A"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Card Number *</label>
                    <input
                      type="text"
                      value={newError.card_number}
                      onChange={(e) => setNewError({ ...newError, card_number: e.target.value })}
                      required
                      placeholder="e.g., 1"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Channel Number *</label>
                    <input
                      type="text"
                      value={newError.channel_number}
                      onChange={(e) => setNewError({ ...newError, channel_number: e.target.value })}
                      required
                      placeholder="e.g., 5"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Error Type *</label>
                    <select
                      value={newError.error_type}
                      onChange={(e) => setNewError({ ...newError, error_type: e.target.value })}
                      required
                      className="form-select"
                    >
                      <option value="">Select type...</option>
                      {errorTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <input
                    type="text"
                    value={newError.description}
                    onChange={(e) => setNewError({ ...newError, description: e.target.value })}
                    placeholder="Brief description of the error..."
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Notes</label>
                  <textarea
                    value={newError.notes}
                    onChange={(e) => setNewError({ ...newError, notes: e.target.value })}
                    rows="3"
                    placeholder="Additional notes about this error..."
                    className="form-textarea"
                  ></textarea>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddError(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Error
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
