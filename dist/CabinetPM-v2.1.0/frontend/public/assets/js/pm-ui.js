/**
 * PM.UI Module - User Interface Interactions
 * 
 * Handles all UI interactions including:
 * - Modal management (open/close)
 * - Message notifications (show/hide)
 * - Sound effects (success/error)
 * 
 * Dependencies: None (pure UI)
 * Load Order: 2nd (after pm-namespace.js)
 */

(function() {
    'use strict';

    /**
     * Open a modal by ID
     * @param {string} modalId - The ID of the modal to open
     */
    PM.UI.openModal = function(modalId) {
        console.log('DEBUG: Opening modal:', modalId);
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
            console.log('DEBUG: Modal opened successfully');
        } else {
            console.error('DEBUG: Modal not found:', modalId);
        }
    };

    /**
     * Close a modal by ID
     * @param {string} modalId - The ID of the modal to close
     */
    PM.UI.closeModal = function(modalId) {
        console.log('DEBUG: Closing modal:', modalId);
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            console.log('DEBUG: Modal closed successfully');
        } else {
            console.error('DEBUG: Modal not found:', modalId);
        }
    };

    /**
     * Play success sound effect
     */
    PM.UI.playSuccessSound = function() {
        if (typeof window.playSuccessSound === 'function') {
            window.playSuccessSound();
        }
    };

    /**
     * Play error sound effect
     */
    PM.UI.playErrorSound = function() {
        if (typeof window.playErrorSound === 'function') {
            window.playErrorSound();
        }
    };

    /**
     * Show a message notification
     * @param {string} text - The message text to display
     * @param {string} type - The message type ('info', 'success', 'error', 'warning')
     * @param {number} duration - How long to show the message in milliseconds (default: 5000)
     */
    PM.UI.showMessage = function(text, type = 'info', duration = 5000) {
        const message = document.getElementById('message');
        
        // Clear any existing timeout
        if (message.timeout) {
            clearTimeout(message.timeout);
        }
        
        // Add loading spinner for info messages (like PDF generation)
        const spinner = type === 'info' && text.includes('Generating') ? 
            '<div class="loading-spinner"></div>' : '';
        
        // Set message content with close button
        message.innerHTML = `
            ${spinner}${text}
            <button class="message-close" onclick="PM.UI.hideMessage()">&times;</button>
        `;
        message.className = `message ${type}`;
        
        // Don't auto-hide loading messages
        if (type !== 'info' || !text.includes('Generating')) {
            message.timeout = setTimeout(() => {
                PM.UI.hideMessage();
            }, duration);
        }
    };

    /**
     * Hide the message notification
     */
    PM.UI.hideMessage = function() {
        const message = document.getElementById('message');
        message.textContent = '';
        message.className = 'message';
        if (message.timeout) {
            clearTimeout(message.timeout);
        }
    };

    console.log('✅ PM.UI module loaded (6 functions)');

})();

