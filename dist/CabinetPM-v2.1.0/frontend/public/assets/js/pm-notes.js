/**
 * PM.Notes Module - PM Notes Management
 * 
 * Handles all PM notes functionality including:
 * - Loading PM notes from server
 * - Populating form with saved data
 * - Collecting form data
 * - Saving notes to server
 * - Updating metadata display
 * 
 * Dependencies: PM.UI
 * Load Order: 3rd (after pm-namespace.js, pm-ui.js)
 * 
 * Global Variables Used:
 * - currentSessionId
 * - pmNotesData
 */

(function() {
    'use strict';

    /**
     * Load PM Notes from server for current session
     */
    PM.Notes.loadPMNotes = async function() {
        if (!currentSessionId) return;
        
        try {
            const response = await fetch(`/api/sessions/${currentSessionId}/pm-notes`);
            if (response.ok) {
                pmNotesData = await response.json();
                PM.Notes.populatePMNotesForm(pmNotesData);
                PM.Notes.updatePMNotesMetadata();
            } else if (response.status === 404) {
                // No notes exist yet, that's fine
                pmNotesData = null;
                PM.Notes.populatePMNotesForm(null);
                PM.Notes.updatePMNotesMetadata();
            } else {
                console.error('Failed to load PM notes:', response.statusText);
            }
        } catch (error) {
            console.error('Error loading PM notes:', error);
        }
    };

    /**
     * Populate PM Notes form with data
     * @param {Object|null} data - The notes data to populate
     */
    PM.Notes.populatePMNotesForm = function(data) {
        // Clear all checkboxes first
        document.querySelectorAll('.pm-task-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Clear all text areas
        document.getElementById('additional-work-notes').value = '';
        document.getElementById('troubleshooting-notes').value = '';
        document.getElementById('recommendations-notes').value = '';
        
        if (data) {
            // Set checkboxes based on common_tasks array
            if (data.common_tasks && Array.isArray(data.common_tasks)) {
                data.common_tasks.forEach(taskId => {
                    const checkbox = document.getElementById(taskId);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });
            }
            
            // Set text areas
            if (data.additional_work_notes) {
                document.getElementById('additional-work-notes').value = data.additional_work_notes;
            }
            if (data.troubleshooting_notes) {
                document.getElementById('troubleshooting-notes').value = data.troubleshooting_notes;
            }
            if (data.recommendations_notes) {
                document.getElementById('recommendations-notes').value = data.recommendations_notes;
            }
        }
    };

    /**
     * Collect PM Notes data from form
     * @returns {Object} The collected notes data
     */
    PM.Notes.collectPMNotesData = function() {
        const commonTasks = [];
        document.querySelectorAll('.pm-task-checkbox:checked').forEach(checkbox => {
            commonTasks.push(checkbox.id);
        });
        
        return {
            common_tasks: commonTasks,
            additional_work_notes: document.getElementById('additional-work-notes').value.trim(),
            troubleshooting_notes: document.getElementById('troubleshooting-notes').value.trim(),
            recommendations_notes: document.getElementById('recommendations-notes').value.trim()
        };
    };

    /**
     * Save PM Notes to server
     */
    PM.Notes.savePMNotes = async function() {
        if (!currentSessionId) {
            PM.UI.showMessage('No session selected', 'error');
            return;
        }
        
        const notesData = PM.Notes.collectPMNotesData();
        
        try {
            const response = await fetch(`/api/sessions/${currentSessionId}/pm-notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(notesData)
            });
            
            if (response.ok) {
                pmNotesData = await response.json();
                PM.Notes.updatePMNotesMetadata();
                PM.UI.showMessage('PM Notes saved successfully', 'success');
                PM.UI.playSuccessSound();
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error saving PM notes:', error);
            PM.UI.showMessage(`Failed to save PM notes: ${error.message}`, 'error');
            PM.UI.playErrorSound();
        }
    };

    /**
     * Update PM Notes metadata display (task count, character count, last updated)
     */
    PM.Notes.updatePMNotesMetadata = function() {
        // Count selected tasks
        const tasksSelected = document.querySelectorAll('.pm-task-checkbox:checked').length;
        
        // Calculate total character count
        const additionalWorkChars = document.getElementById('additional-work-notes').value.length;
        const troubleshootingChars = document.getElementById('troubleshooting-notes').value.length;
        const recommendationsChars = document.getElementById('recommendations-notes').value.length;
        const totalChars = additionalWorkChars + troubleshootingChars + recommendationsChars;
        
        document.getElementById('pm-notes-tasks-count').textContent = tasksSelected;
        document.getElementById('pm-notes-character-count').textContent = totalChars;
        
        if (pmNotesData && pmNotesData.updated_at) {
            const lastUpdated = new Date(pmNotesData.updated_at).toLocaleString();
            document.getElementById('pm-notes-last-updated').textContent = lastUpdated;
        } else {
            document.getElementById('pm-notes-last-updated').textContent = 'Never';
        }
    };

    console.log('✅ PM.Notes module loaded (5 functions)');

})();

