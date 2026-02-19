import { useState, useEffect } from 'react';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function PMNotes({ sessionId, isCompleted }) {
  const [notes, setNotes] = useState({
    common_tasks: [],
    additional_work_notes: '',
    troubleshooting_notes: '',
    recommendations_notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Single PM checklist: Backups + cleaning (stored in common_tasks)
  const checklistTasks = [
    { id: 'backup_database', label: 'Database' },
    { id: 'backup_sound', label: 'Sound' },
    { id: 'backup_powerup', label: 'Power-up' },
    { id: 'backup_charts', label: 'Charts' },
    { id: 'backup_event_chronicle', label: 'Event Chronicle' },
    { id: 'backup_srs', label: 'SRS' },
    { id: 'backup_graphics', label: 'Graphics' },
    { id: 'backup_maintenance_tool', label: 'Maintenance tool' },
    { id: 'backup_ddc', label: 'DDC' },
    { id: 'backup_uploaded_sys_reg', label: 'Uploaded Sys Reg' },
    { id: 'all_machines_blown_out', label: 'All machines blown out' },
    { id: 'keyboards_cleaned', label: 'Keyboards cleaned' },
    { id: 'monitors_cleaned', label: 'Monitors cleaned' },
  ];

  useEffect(() => {
    loadNotes();
  }, [sessionId]);

  const loadNotes = async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/pm-notes`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.id) {
          setNotes({
            common_tasks: Array.isArray(data.common_tasks) 
              ? data.common_tasks 
              : JSON.parse(data.common_tasks || '[]'),
            additional_work_notes: data.additional_work_notes || '',
            troubleshooting_notes: data.troubleshooting_notes || '',
            recommendations_notes: data.recommendations_notes || '',
          });
        }
      }
    } catch (error) {
      console.log('No notes found or error loading:', error);
    }
  };

  const handleSave = async () => {
    if (isCompleted) {
      setMessage({ text: 'Cannot save - session is completed', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const result = await api.request(`/api/sessions/${sessionId}/pm-notes`, {
        method: 'POST',
        body: JSON.stringify(notes),
      });

      if (result.success) {
        soundSystem.playSuccess();
        setMessage({ text: 'PM Notes saved successfully', type: 'success' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        soundSystem.playError();
        setMessage({ text: result.error || 'Error saving notes', type: 'error' });
      }
    } catch (error) {
      soundSystem.playError();
      setMessage({ text: 'Error saving notes', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (taskId) => {
    if (isCompleted) return;
    
    const updated = notes.common_tasks.includes(taskId)
      ? notes.common_tasks.filter((t) => t !== taskId)
      : [...notes.common_tasks, taskId];
    setNotes({ ...notes, common_tasks: updated });
    
    // Auto-save
    await autoSaveNotes({ ...notes, common_tasks: updated });
  };

  const autoSaveNotes = async (notesToSave) => {
    try {
      await api.request(`/api/sessions/${sessionId}/pm-notes`, {
        method: 'POST',
        body: JSON.stringify(notesToSave),
      });
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  };

  const hasAnyNotes = notes.additional_work_notes?.trim() || notes.troubleshooting_notes?.trim() || notes.recommendations_notes?.trim() || (Array.isArray(notes.common_tasks) && notes.common_tasks.length > 0);

  return (
    <div className="space-y-6">
      {isCompleted && !hasAnyNotes && (
        <div className="px-4 py-3 rounded-lg bg-gray-700/50 text-gray-400 border border-gray-600">
          No PM notes were recorded for this session.
        </div>
      )}
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

      {/* PM Checklist: Backups + cleaning */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-100">✅ PM Checklist</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {checklistTasks.map((task) => (
              <label
                key={task.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  notes.common_tasks.includes(task.id)
                    ? 'bg-blue-900/30 border-blue-500'
                    : 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                } ${isCompleted ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={notes.common_tasks.includes(task.id)}
                  onChange={() => toggleTask(task.id)}
                  disabled={isCompleted}
                  className="w-5 h-5 rounded"
                />
                <span className="text-sm text-gray-300">{task.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Additional Work Performed */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-100">🔧 Additional Work Performed</h3>
        </div>
        <div className="card-body">
          <textarea
            value={notes.additional_work_notes}
            onChange={(e) => setNotes({ ...notes, additional_work_notes: e.target.value })}
            onBlur={() => autoSaveNotes(notes)}
            rows="6"
            disabled={isCompleted}
            className="form-textarea"
            placeholder="Describe any additional work performed during this PM session..."
          ></textarea>
        </div>
      </div>

      {/* Troubleshooting & Issues */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-100">⚠️ Troubleshooting & Issues Found</h3>
        </div>
        <div className="card-body">
          <textarea
            value={notes.troubleshooting_notes}
            onChange={(e) => setNotes({ ...notes, troubleshooting_notes: e.target.value })}
            onBlur={() => autoSaveNotes(notes)}
            rows="6"
            disabled={isCompleted}
            className="form-textarea"
            placeholder="Document any issues found and troubleshooting steps taken..."
          ></textarea>
        </div>
      </div>

      {/* Recommendations */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-100">💡 Recommendations for Future Work</h3>
        </div>
        <div className="card-body">
          <textarea
            value={notes.recommendations_notes}
            onChange={(e) => setNotes({ ...notes, recommendations_notes: e.target.value })}
            onBlur={() => autoSaveNotes(notes)}
            rows="6"
            disabled={isCompleted}
            className="form-textarea"
            placeholder="Recommendations for future maintenance or improvements..."
          ></textarea>
        </div>
      </div>

      {/* Save Button */}
      {!isCompleted && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-success"
          >
            {saving ? '💾 Saving...' : '💾 Save PM Notes'}
          </button>
        </div>
      )}
    </div>
  );
}
