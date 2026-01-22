/**
 * PM.Diagnostics Module - Diagnostics Management
 * 
 * Handles all diagnostics-related functionality including:
 * - Diagnostics data management
 * - Card management (add/remove)
 * - Channel selection (single/multi mode)
 * - Error type selection
 * - Error table (sort, filter, export)
 * - Controllers rendering
 * - Error summary
 * - Local storage sync
 * - Cleanup duplicates
 * 
 * Dependencies: PM.UI
 * Load Order: 6th (after pm-namespace.js, pm-ui.js, pm-notes.js, pm-cabinets.js, pm-nodes.js)
 * 
 * Global Variables Used:
 * - currentSessionId
 * - sessionData
 * - isSessionCompleted
 * - diagnosticsData
 * - controllersData
 * - currentErrorChannel
 * - selectedChannels
 * - selectedCards
 * - cardSelectionMode
 * - errorDescriptions
 * - currentSort
 * - filteredErrors
 * - currentNodes
 * - currentSelectionMode
 */

(function() {
    'use strict';

    // Module-level variables
    let cardSelectionMode = 'single';
    let selectedCards = new Set();
    let currentControllerForCards = '';
    let currentSelectionMode = 'single';
    let selectedChannels = [];
    let currentSort = { field: null, direction: 'asc' };
    let filteredErrors = [];

    // Default descriptions for error types
    const errorDescriptions = {
        'bad': 'Component or signal is faulty and not functioning properly',
        'not_communicating': 'Device is not responding to communication attempts or network connectivity issues',
        'open_loop': 'Broken or interrupted signal path, indicating a disconnected or damaged connection',
        'loop_current_saturated': 'Current loop is at maximum capacity or experiencing overcurrent conditions',
        'device_error': 'Internal device malfunction or hardware failure detected',
        'short_circuit': 'Electrical short circuit causing abnormal current flow between conductors',
        'no_card': 'Expected hardware card is missing or not properly installed in the slot'
    };

    // Compatibility functions (no longer needed but kept)
    PM.Diagnostics.populateCardDropdown = function() {
        // This function is no longer needed but keeping for compatibility
    }

    PM.Diagnostics.populateChannelDropdown = function() {
        // This function is no longer needed but keeping for compatibility
    }

    PM.Diagnostics.loadDiagnostics = async function() {
        if (!currentSessionId) {
            return;
        }

        try {
            // First try to load from local storage
            const storageKey = `diagnostics_${currentSessionId}`;
            const savedDiagnostics = localStorage.getItem(storageKey);
            
            // Try to load from server first (to get IDs), then merge with local storage
            let serverDiagnostics = [];
            try {
                const response = await fetch(`/api/sessions/${currentSessionId}/diagnostics`);
                if (response.ok) {
                    serverDiagnostics = await response.json();
                    console.log('📡 Loaded from server:', serverDiagnostics.length, 'errors');
                }
            } catch (serverError) {
                console.log('Server not available, using local storage only');
            }
            
            // Also load from local storage
            let localDiagnostics = [];
            if (savedDiagnostics) {
                try {
                    localDiagnostics = JSON.parse(savedDiagnostics);
                    console.log('💾 Loaded from local storage:', localDiagnostics.length, 'errors');
                } catch (e) {
                    console.warn('Failed to parse saved diagnostics');
                }
            }
            
            // Merge server and local data (server data has IDs, local might have newer data)
            const mergedMap = new Map();
            
            // Add server data first (has IDs)
            serverDiagnostics.forEach(diag => {
                const key = `${diag.controller_name}-${diag.card_number}-${diag.channel_number}`;
                mergedMap.set(key, diag);
            });
            
            // Add/update with local data (might be newer)
            localDiagnostics.forEach(diag => {
                const key = `${diag.controller_name}-${diag.card_number}-${diag.channel_number}`;
                const existing = mergedMap.get(key);
                if (!existing || !diag.id) {
                    // Use local data if server doesn't have it, or if local data doesn't have ID (newer)
                    mergedMap.set(key, { ...existing, ...diag });
                }
            });
            
            diagnosticsData = Array.from(mergedMap.values());
            console.log('🔄 Final merged diagnostics:', diagnosticsData.length, 'errors');
            
            // Auto-populate controllers from nodes data (like nodes maintenance does)
            await autoPopulateControllersFromNodes();
            
            // Build controllers data from diagnostics and render
            PM.Diagnostics.buildControllersFromDiagnostics();
            PM.Diagnostics.renderControllers();
            PM.Diagnostics.renderErrorsSummary();
        } catch (error) {
            console.error('Error loading diagnostics:', error);
            // Initialize with empty data on error
            diagnosticsData = [];
            await autoPopulateControllersFromNodes();
            PM.Diagnostics.buildControllersFromDiagnostics();
            PM.Diagnostics.renderControllers();
            PM.Diagnostics.renderErrorsSummary();
        }
    }

    async function autoPopulateControllersFromNodes() {
        // Load nodes if not already loaded
        if (!currentNodes || currentNodes.length === 0) {
            try {
                const nodesUrl = `/api/customers/${sessionData.customer_id}/nodes?sessionId=${currentSessionId}`;
                const nodesResponse = await fetch(nodesUrl);
                if (nodesResponse.ok) {
                    currentNodes = await nodesResponse.json();
                }
            } catch (error) {
                console.error('Error loading nodes for diagnostics:', error);
                return;
            }
        }

        // Extract controllers from nodes using same logic as nodes maintenance
        const filteredNodes = currentNodes.filter(node => !node.node_name?.includes('-partner'));
        
        // Function to check if node is a controller (same as nodes maintenance)
        const isController = (node) => {
            const nodeName = (node.node_name || '').toLowerCase();
            const nodeType = (node.node_type || '').toLowerCase();
            const model = (node.model || '').toLowerCase();
            
            return node.node_type === 'Controller' || 
                   node.node_type === 'DeltaV EIOC' ||
                   node.node_type === 'CIOC' ||
                   node.node_type === 'SIS' ||
                   ['CP2-EIOC', 'CP3-EIOC', 'CP4-EIOC', 'UTIL-EIOC'].includes(node.node_name) ||
                   (nodeType.includes('controller') || nodeType.includes('cioc') || 
                    nodeType.includes('sis') || nodeType.includes('eioc') ||
                    model.includes('se4101') || model.includes('ve4021')) &&
                   !nodeType.includes('application') && !nodeType.includes('professional') && 
                   !nodeType.includes('not available') && !nodeType.includes('workstation');
        };

        const controllerNodes = filteredNodes.filter(isController);
        
        // Auto-add controllers that don't exist yet
        controllerNodes.forEach(controllerNode => {
            const controllerName = controllerNode.node_name;
            const exists = controllersData.some(c => c.name.toLowerCase() === controllerName.toLowerCase());
            
            if (!exists) {
                controllersData.push({
                    name: controllerName,
                    cards: {}
                });
            }
        });
    }

    PM.Diagnostics.buildControllersFromDiagnostics = function() {
        // Add cards and errors from diagnostics to existing controllers
        diagnosticsData.forEach(diagnostic => {
            const controllerName = diagnostic.controller_name;
            const cardNumber = diagnostic.card_number;
            
            // Find or create controller
            let controller = controllersData.find(c => c.name === controllerName);
            if (!controller) {
                controller = {
                    name: controllerName,
                    cards: {}
                };
                controllersData.push(controller);
            }
            
            // Add card if it doesn't exist
            if (!controller.cards[cardNumber]) {
                controller.cards[cardNumber] = [];
            }
            
            // Add diagnostic to card
            controller.cards[cardNumber].push(diagnostic);
        });
    }

    PM.Diagnostics.renderControllers = function() {
        const noControllers = document.getElementById('no-controllers');
        const controllersGrid = document.getElementById('controllers-grid');

        if (controllersData.length === 0) {
            if (noControllers) {
                noControllers.style.display = 'block';
            }
            controllersGrid.innerHTML = '<div id="no-controllers" class="no-data"><h3>No Controllers Found</h3><p>Controllers will automatically appear here from your imported CSV data. Import nodes from the customer profile to see controllers.</p></div>';
            return;
        }

        if (noControllers) {
            noControllers.style.display = 'none';
        }
        
        let html = '';
        controllersData.forEach(controller => {
            const totalCards = Object.keys(controller.cards).length;
            // Count actual diagnostics errors for this controller
            const controllerErrors = diagnosticsData.filter(d => d.controller_name === controller.name);
            const totalErrors = controllerErrors.length;
            
            html += `
                <div class="controller-card">
                    <div class="controller-header">
                        <div class="controller-info">
                            <div class="controller-name">🎛️ ${controller.name}</div>
                            <div class="controller-stats">
                                <span class="card-count">${totalCards} Card${totalCards !== 1 ? 's' : ''}</span>
                                ${totalErrors > 0 ? 
                                    `<span class="error-count">${totalErrors} Error${totalErrors !== 1 ? 's' : ''}</span>` : 
                                    '<span class="status-clean">All Clean</span>'
                                }
                            </div>
                        </div>
                        <button class="remove-controller-btn" onclick="PM.Diagnostics.removeController('${controller.name}')" title="Remove all data for this controller">
                            🗑️ Clear Data
                        </button>
                    </div>
                    <div class="cards-container">
            `;
            
            // Render existing cards
            const cardNumbers = Object.keys(controller.cards).sort((a, b) => parseInt(a) - parseInt(b));
            if (cardNumbers.length > 0) {
                cardNumbers.forEach(cardNumber => {
                    html += PM.Diagnostics.renderCard(controller.name, parseInt(cardNumber), controller.cards[cardNumber]);
                });
            }
            
            // Add card button
            html += `
                <div class="add-card-section">
                    <button class="add-card-btn" onclick="PM.Diagnostics.addCard('${controller.name}')">
                        <div class="add-card-icon">➕</div>
                        <div class="add-card-text">Add Card</div>
                        <div class="add-card-subtitle">Cards 1-60</div>
                    </button>
                </div>
            `;
            
            html += `
                    </div>
                </div>
            `;
        });

        controllersGrid.innerHTML = html;
    }

    PM.Diagnostics.renderCard = function(controllerName, cardNumber, errors = []) {
        // Get actual errors for this specific card from diagnosticsData
        const cardErrors = diagnosticsData.filter(d => 
            d.controller_name === controllerName && d.card_number === cardNumber
        );
        
        // Create error map for quick lookup
        const errorMap = {};
        cardErrors.forEach(error => {
            const channel = error.channel_number || 0;
            errorMap[channel] = error;
        });
        
        const errorCount = cardErrors.length;
        const cardStatusClass = errorCount > 0 ? 'card-has-errors' : 'card-clean';
        
        let html = `
            <div class="card-section ${cardStatusClass}">
                <div class="card-header">
                    <div class="card-info">
                        <div class="card-title">📋 Card ${cardNumber}</div>
                        <div class="card-status">
                            ${errorCount > 0 ? 
                                `<span class="error-badge">${errorCount} Error${errorCount > 1 ? 's' : ''}</span>` : 
                                '<span class="clean-badge">✅ Clean</span>'
                            }
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="card-action-btn" onclick="PM.Diagnostics.viewCardDetails('${controllerName}', ${cardNumber})" title="View card details">
                            👁️
                        </button>
                        <button class="remove-card-btn" onclick="PM.Diagnostics.removeCard('${controllerName}', ${cardNumber})" title="Remove this card">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="channels-container">
                    <div class="channels-header">
                        <span>Channels (Click to set errors)</span>
                    </div>
                    <div class="channels-grid">
        `;
        
        // Render channels 1-32 in a more organized grid
        for (let i = 1; i <= 32; i++) {
            const hasError = errorMap[i];
            const errorClass = hasError ? 'has-error' : '';
            const errorType = hasError ? hasError.error_type.replace(/_/g, ' ') : '';
            
            html += `
                <div class="channel-button ${errorClass}" 
                     onclick="PM.Diagnostics.setChannelError('${controllerName}', ${cardNumber})"
                     title="${hasError ? `Channel ${i}: ${errorType} (Click to edit)` : `Click to select channels for ${controllerName} Card ${cardNumber}`}">
                    <div class="channel-number">${i}</div>
                    ${hasError ? '<div class="error-indicator">⚠️</div>' : ''}
                </div>
            `;
        }
        
        html += `
                    </div>
                </div>
            </div>
        `;
        
        return html;
    }

    PM.Diagnostics.renderErrorsSummary = function() {
        // Just render the table now - no more text summary
        PM.Diagnostics.renderErrorTable();
    }

    PM.Diagnostics.removeController = async function(controllerName) {
        if (isSessionCompleted) {
            PM.UI.showMessage('Cannot modify diagnostics - session is completed', 'error');
            return;
        }
        
        if (!confirm(`🗑️ Clear all data for controller "${controllerName}"?\n\nThis will remove all cards and errors.\n\nNote: The controller will reappear when you reload since it comes from your CSV data.`)) {
            return;
        }
        
        // Find diagnostics to delete from database
        const diagnosticsToDelete = diagnosticsData.filter(d => d.controller_name === controllerName);
        
        // Remove controller from local data (it will reappear on reload since it's from nodes)
        controllersData = controllersData.filter(c => c.name !== controllerName);
        
        // Remove all diagnostics for this controller (client-side)
        diagnosticsData = diagnosticsData.filter(d => d.controller_name !== controllerName);
        
        // Also delete from database
        for (const diagnostic of diagnosticsToDelete) {
            if (diagnostic.id) {
                try {
                    await fetch(`/api/sessions/${currentSessionId}/diagnostics/${diagnostic.id}`, {
                        method: 'DELETE'
                    });
                    console.log('✅ Deleted diagnostic from database:', diagnostic.id);
                } catch (dbError) {
                    console.warn('Failed to delete from database:', dbError);
                }
            }
        }
        
        // Rebuild and re-render
        PM.Diagnostics.buildControllersFromDiagnostics();
        PM.Diagnostics.renderControllers();
        PM.Diagnostics.renderErrorsSummary();
        PM.Diagnostics.saveDiagnosticsToStorage(); // Save to local storage
        PM.UI.showMessage(`✅ All data cleared for ${controllerName}`, 'success');
    }

    PM.Diagnostics.setCardSelectionMode = function(mode) {
        cardSelectionMode = mode;
        
        // Update UI
        document.getElementById('single-select-btn').classList.toggle('active', mode === 'single');
        document.getElementById('multi-select-btn').classList.toggle('active', mode === 'multi');
        
        // Update instruction text
        const instruction = document.getElementById('card-selection-instruction');
        if (mode === 'single') {
            instruction.textContent = 'Select a card number (1-60):';
            document.getElementById('multi-select-controls').style.display = 'none';
        } else {
            instruction.textContent = 'Select multiple card numbers (1-60):';
            document.getElementById('multi-select-controls').style.display = 'block';
        }
        
        // Clear any existing selections
        PM.Diagnostics.clearCardSelection();
    }

    PM.Diagnostics.addCard = function(controllerName) {
        if (isSessionCompleted) {
            PM.UI.showMessage('Cannot modify diagnostics - session is completed', 'error');
            return;
        }
        
        currentControllerForCards = controllerName;
        selectedCards.clear();
        
        // Set the controller name in the modal
        document.getElementById('card-controller-name').textContent = controllerName;
        
        // Reset to single select mode
        PM.Diagnostics.setCardSelectionMode('single');
        
        // Find controller to see which cards are already taken
        const controller = controllersData.find(c => c.name === controllerName);
        const takenCards = controller ? Object.keys(controller.cards).map(Number) : [];
        
        // Populate the card numbers grid
        const cardNumbersGrid = document.getElementById('card-numbers-grid');
        cardNumbersGrid.innerHTML = '';
        
        for (let i = 1; i <= 100; i++) {
            const button = document.createElement('div');
            button.className = takenCards.includes(i) ? 'card-number-btn taken' : 'card-number-btn';
            button.textContent = i;
            button.dataset.cardNumber = i;
            
            if (!takenCards.includes(i)) {
                button.onclick = () => PM.Diagnostics.handleCardSelection(i);
            }
            
            cardNumbersGrid.appendChild(button);
        }
        
        // Show the modal
        PM.UI.openModal('card-selection-modal');
    }

    PM.Diagnostics.handleCardSelection = function(cardNumber) {
        if (cardSelectionMode === 'single') {
            PM.Diagnostics.selectCardNumber(currentControllerForCards, cardNumber);
        } else {
            PM.Diagnostics.toggleCardSelection(cardNumber);
        }
    }

    PM.Diagnostics.toggleCardSelection = function(cardNumber) {
        const button = document.querySelector(`[data-card-number="${cardNumber}"]`);
        
        if (selectedCards.has(cardNumber)) {
            selectedCards.delete(cardNumber);
            button.classList.remove('selected');
        } else {
            selectedCards.add(cardNumber);
            button.classList.add('selected');
        }
        
        PM.Diagnostics.updateSelectedCardsDisplay();
    }

    PM.Diagnostics.updateSelectedCardsDisplay = function() {
        const count = selectedCards.size;
        const countElement = document.getElementById('selected-cards-count');
        const addButton = document.getElementById('add-selected-cards-btn');
        
        countElement.textContent = `${count} card${count !== 1 ? 's' : ''} selected`;
        addButton.disabled = count === 0;
        
        if (count > 0) {
            const cardNumbers = Array.from(selectedCards).sort((a, b) => a - b);
            countElement.textContent += ` (${cardNumbers.join(', ')})`;
        }
    }

    PM.Diagnostics.clearCardSelection = function() {
        selectedCards.clear();
        document.querySelectorAll('.card-number-btn.selected').forEach(btn => {
            btn.classList.remove('selected');
        });
        PM.Diagnostics.updateSelectedCardsDisplay();
    }

    PM.Diagnostics.addSelectedCards = function() {
        if (selectedCards.size === 0) return;
        
        const controller = controllersData.find(c => c.name === currentControllerForCards);
        if (!controller) return;
        
        let addedCount = 0;
        const cardNumbers = Array.from(selectedCards).sort((a, b) => a - b);
        
        cardNumbers.forEach(cardNumber => {
            if (!controller.cards[cardNumber]) {
                controller.cards[cardNumber] = [];
                addedCount++;
            }
        });
        
        if (addedCount > 0) {
            PM.Diagnostics.renderControllers();
            PM.UI.showMessage(`✅ Added ${addedCount} card${addedCount !== 1 ? 's' : ''} to ${currentControllerForCards}`, 'success');
        } else {
            PM.UI.showMessage('❌ No new cards were added (all selected cards already exist)', 'error');
        }
        
        PM.UI.closeModal('card-selection-modal');
    }
    
    PM.Diagnostics.selectCardNumber = function(controllerName, cardNumber) {
        // Find controller and add card
        const controller = controllersData.find(c => c.name === controllerName);
        if (controller) {
            if (controller.cards[cardNumber]) {
                PM.UI.showMessage(`❌ Card ${cardNumber} already exists for ${controllerName}`, 'error');
                return;
            }
            controller.cards[cardNumber] = [];
            PM.Diagnostics.renderControllers();
            PM.UI.showMessage(`✅ Card ${cardNumber} added to ${controllerName}`, 'success');
            
            // Close the modal
            PM.UI.closeModal('card-selection-modal');
        }
    }

    PM.Diagnostics.removeCard = async function(controllerName, cardNumber) {
        if (isSessionCompleted) {
            PM.UI.showMessage('Cannot modify diagnostics - session is completed', 'error');
            return;
        }
        
        if (!confirm(`🗑️ Remove Card ${cardNumber} from ${controllerName}?\n\nThis will delete all errors for this card.`)) {
            return;
        }
        
        // Remove card from controller
        const controller = controllersData.find(c => c.name === controllerName);
        if (controller && controller.cards[cardNumber]) {
            delete controller.cards[cardNumber];
        }
        
        // Find diagnostics to delete from database
        const diagnosticsToDelete = diagnosticsData.filter(d => 
            d.controller_name === controllerName && d.card_number === cardNumber
        );
        
        // Remove all diagnostics for this card (client-side)
        diagnosticsData = diagnosticsData.filter(d => 
            !(d.controller_name === controllerName && d.card_number === cardNumber)
        );
        
        // Also delete from database
        for (const diagnostic of diagnosticsToDelete) {
            if (diagnostic.id) {
                try {
                    await fetch(`/api/sessions/${currentSessionId}/diagnostics/${diagnostic.id}`, {
                        method: 'DELETE'
                    });
                    console.log('✅ Deleted diagnostic from database:', diagnostic.id);
                } catch (dbError) {
                    console.warn('Failed to delete from database:', dbError);
                }
            }
        }
        
        // Rebuild and re-render
        PM.Diagnostics.buildControllersFromDiagnostics();
        PM.Diagnostics.renderControllers();
        PM.Diagnostics.renderErrorsSummary();
        PM.Diagnostics.saveDiagnosticsToStorage(); // Save to local storage
        PM.UI.showMessage(`✅ Card ${cardNumber} removed from ${controllerName}`, 'success');
    }

    PM.Diagnostics.setChannelError = function(controllerName, cardNumber, channelNumber) {
        if (isSessionCompleted) {
            PM.UI.showMessage('Cannot modify diagnostics - session is completed', 'error');
            return;
        }
        
        // Set the modal title
        document.getElementById('channel-controller-name').textContent = controllerName;
        document.getElementById('channel-card-number').textContent = cardNumber;
        
        // Store current context
        currentErrorChannel = { controllerName, cardNumber, channelNumber: null };
        
        // Reset to single select mode
        PM.Diagnostics.setSelectionMode('single');
        
        // Populate the channels grid
        PM.Diagnostics.populateChannelsSelectionGrid(controllerName, cardNumber);
        
        // If channelNumber is provided, go directly to error setting
        if (channelNumber) {
            PM.Diagnostics.openErrorModalForChannel(controllerName, cardNumber, channelNumber);
        } else {
            // Open channel selection modal
            PM.UI.openModal('channel-selection-modal');
        }
    }
    
    PM.Diagnostics.openErrorModalForChannel = function(controllerName, cardNumber, channelNumber) {
        currentErrorChannel = { controllerName, cardNumber, channelNumber };
        
        // Check if error already exists
        const existingError = diagnosticsData.find(d => 
            d.controller_name === controllerName && 
            d.card_number === cardNumber && 
            d.channel_number === channelNumber);
        
        if (existingError) {
            // Pre-fill form with existing data
            document.getElementById('error-modal-title').textContent = 'Edit Channel Error';
            
            // Reset form first
            PM.Diagnostics.resetErrorForm();
            
            // Select the error type
            PM.Diagnostics.selectErrorType(existingError.error_type);
            
            // Fill other fields - preserve existing description if it exists
            const existingDescription = existingError.error_description || '';
            const defaultDescription = errorDescriptions[existingError.error_type] || '';
            
            // If there's an existing description, use it; otherwise use default
            document.getElementById('error-description').value = existingDescription || defaultDescription;
            document.getElementById('clear-error-btn').style.display = 'inline-block';
        } else {
            // New error
            document.getElementById('error-modal-title').textContent = 'Set Channel Error';
            PM.Diagnostics.resetErrorForm();
            document.getElementById('clear-error-btn').style.display = 'none';
        }
        
        PM.UI.openModal('error-modal');
    }

    PM.Diagnostics.saveChannelError = async function(e) {
        e.preventDefault();
        
        if (!currentErrorChannel) return;
        
        const formData = new FormData(e.target);
        const baseErrorData = {
            controller_name: currentErrorChannel.controllerName,
            card_number: currentErrorChannel.cardNumber,
            error_type: formData.get('error_type'),
            error_description: formData.get('error_description') || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            id: Date.now() // Temporary ID for client-side storage
        };
        
        try {
            // Check if this is batch mode (multiple channels)
            if (currentErrorChannel.channelNumbers && currentErrorChannel.channelNumbers.length > 0) {
                // Batch mode - save to multiple channels locally
                let successCount = 0;
                for (const channelNumber of currentErrorChannel.channelNumbers) {
                    const errorData = { ...baseErrorData, channel_number: channelNumber, id: Date.now() + channelNumber };
                    
                    // Remove ALL existing errors for this channel (to prevent duplicates)
                    const existingErrors = diagnosticsData.filter(d => 
                        d.controller_name === errorData.controller_name && 
                        d.card_number === errorData.card_number && 
                        d.channel_number === errorData.channel_number
                    );
                    
                    // Delete existing errors from database first
                    for (const existingError of existingErrors) {
                        if (existingError.id) {
                            try {
                                await fetch(`/api/sessions/${currentSessionId}/diagnostics/${existingError.id}`, {
                                    method: 'DELETE'
                                });
                            } catch (dbError) {
                                console.warn('Failed to delete existing diagnostic:', dbError);
                            }
                        }
                    }
                    
                    // Remove from local data
                    diagnosticsData = diagnosticsData.filter(d => !(
                        d.controller_name === errorData.controller_name && 
                        d.card_number === errorData.card_number && 
                        d.channel_number === errorData.channel_number
                    ));
                    
                    // Add new error
                    diagnosticsData.push(errorData);
                    
                    // Also save to database
                    try {
                        await fetch(`/api/sessions/${currentSessionId}/diagnostics`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(errorData)
                        });
                    } catch (dbError) {
                        console.warn('Failed to save to database, but saved locally:', dbError);
                    }
                    
                    successCount++;
                }
                
                PM.UI.closeModal('error-modal');
                // Return to channel selection modal to continue adding errors
                PM.Diagnostics.populateChannelsSelectionGrid(currentErrorChannel.controllerName, currentErrorChannel.cardNumber);
                PM.Diagnostics.buildControllersFromDiagnostics();
                PM.Diagnostics.renderControllers();
                PM.Diagnostics.renderErrorsSummary();
                PM.Diagnostics.saveDiagnosticsToStorage(); // Save to local storage
                PM.UI.showMessage(`✅ Error set on ${successCount} of ${currentErrorChannel.channelNumbers.length} channels`, 'success');
            } else {
                // Single channel mode
                const errorData = { ...baseErrorData, channel_number: currentErrorChannel.channelNumber };
                
                // Remove ALL existing errors for this channel (to prevent duplicates)
                const existingErrors = diagnosticsData.filter(d => 
                    d.controller_name === errorData.controller_name && 
                    d.card_number === errorData.card_number && 
                    d.channel_number === errorData.channel_number
                );
                
                console.log(`🔍 Removing ${existingErrors.length} existing error(s) for channel ${errorData.channel_number}`);
                
                // Delete existing errors from database first
                for (const existingError of existingErrors) {
                    if (existingError.id) {
                        try {
                            await fetch(`/api/sessions/${currentSessionId}/diagnostics/${existingError.id}`, {
                                method: 'DELETE'
                            });
                            console.log('✅ Deleted existing diagnostic from database:', existingError.id);
                        } catch (dbError) {
                            console.warn('Failed to delete existing diagnostic:', dbError);
                        }
                    }
                }
                
                // Remove from local data
                diagnosticsData = diagnosticsData.filter(d => !(
                    d.controller_name === errorData.controller_name && 
                    d.card_number === errorData.card_number && 
                    d.channel_number === errorData.channel_number
                ));
                
                // Add new error
                diagnosticsData.push(errorData);
                
                // Also save to database
                try {
                    await fetch(`/api/sessions/${currentSessionId}/diagnostics`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(errorData)
                    });
                    console.log('✅ Saved diagnostic to database:', errorData);
                } catch (dbError) {
                    console.warn('Failed to save to database, but saved locally:', dbError);
                }
                
                PM.UI.closeModal('error-modal');
                // Return to channel selection modal to continue adding errors
                PM.Diagnostics.populateChannelsSelectionGrid(currentErrorChannel.controllerName, currentErrorChannel.cardNumber);
                PM.Diagnostics.buildControllersFromDiagnostics();
                PM.Diagnostics.renderControllers();
                PM.Diagnostics.renderErrorsSummary();
                PM.Diagnostics.saveDiagnosticsToStorage(); // Save to local storage
                PM.UI.showMessage('✅ Error saved successfully', 'success');
            }
        } catch (error) {
            console.error('Error saving diagnostic:', error);
            PM.UI.showMessage('Error saving diagnostic', 'error');
        }
    }

    PM.Diagnostics.clearError = async function() {
        if (!currentErrorChannel) return;
        
        // Find ALL errors for this channel (there might be duplicates)
        const errorsToDelete = diagnosticsData.filter(d => 
            d.controller_name === currentErrorChannel.controllerName && 
            d.card_number === currentErrorChannel.cardNumber && 
            d.channel_number === currentErrorChannel.channelNumber
        );
        
        console.log(`🔍 Found ${errorsToDelete.length} error(s) to delete for channel ${currentErrorChannel.channelNumber}`);
        
        // Remove ALL errors from diagnosticsData for this channel
        diagnosticsData = diagnosticsData.filter(d => !(
            d.controller_name === currentErrorChannel.controllerName && 
            d.card_number === currentErrorChannel.cardNumber && 
            d.channel_number === currentErrorChannel.channelNumber
        ));
        
        // Delete ALL errors from database
        for (const errorToDelete of errorsToDelete) {
            if (errorToDelete.id) {
                try {
                    await fetch(`/api/sessions/${currentSessionId}/diagnostics/${errorToDelete.id}`, {
                        method: 'DELETE'
                    });
                    console.log('✅ Deleted diagnostic from database:', errorToDelete.id);
                } catch (dbError) {
                    console.warn('Failed to delete from database:', dbError);
                }
            }
        }
        
        PM.UI.closeModal('error-modal');
        // Return to channel selection modal to continue managing errors
        PM.Diagnostics.populateChannelsSelectionGrid(currentErrorChannel.controllerName, currentErrorChannel.cardNumber);
        PM.Diagnostics.buildControllersFromDiagnostics();
        PM.Diagnostics.renderControllers();
        PM.Diagnostics.renderErrorsSummary();
        PM.Diagnostics.saveDiagnosticsToStorage(); // Save to local storage
        PM.UI.showMessage('✅ Error cleared successfully', 'success');
    }

    PM.Diagnostics.deleteDiagnosticById = async function(diagnosticId) {
        try {
            await fetch(`/api/sessions/${currentSessionId}/diagnostics/${diagnosticId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('Error deleting diagnostic:', error);
        }
    }

    PM.Diagnostics.saveDiagnostics = async function() {
        PM.UI.showMessage('Diagnostics are auto-saved when you make changes', 'info');
    }
    
    // Channel Selection and Multi-Select Functions
    PM.Diagnostics.setSelectionMode = function(mode) {
        currentSelectionMode = mode;
        
        const singleBtn = document.getElementById('single-select-btn');
        const multiBtn = document.getElementById('multi-select-btn');
        const multiActions = document.getElementById('multi-select-actions');
        const instructions = document.getElementById('channel-selection-instructions');
        
        if (mode === 'single') {
            singleBtn.classList.add('active');
            multiBtn.classList.remove('active');
            multiActions.style.display = 'none';
            instructions.textContent = 'Click a channel to set error:';
            PM.Diagnostics.clearAllSelections();
        } else {
            singleBtn.classList.remove('active');
            multiBtn.classList.add('active');
            multiActions.style.display = 'flex';
            instructions.textContent = 'Click multiple channels to select, then set error for all:';
            PM.Diagnostics.clearAllSelections();
        }
    }
    
    PM.Diagnostics.populateChannelsSelectionGrid = function(controllerName, cardNumber) {
        const grid = document.getElementById('channels-selection-grid');
        grid.innerHTML = '';
        
        // Get existing errors for this card
        const cardErrors = diagnosticsData.filter(d => 
            d.controller_name === controllerName && 
            d.card_number === cardNumber
        );
        
        // Create error map
        const errorMap = {};
        cardErrors.forEach(error => {
            errorMap[error.channel_number] = error;
        });
        
        // Create channel buttons
        for (let i = 1; i <= 32; i++) {
            const button = document.createElement('div');
            button.className = 'channel-selection-btn';
            button.textContent = i;
            button.dataset.channel = i;
            
            if (errorMap[i]) {
                button.classList.add('has-error');
                button.title = `Channel ${i}: ${errorMap[i].error_type.replace(/_/g, ' ')}`;
            } else {
                button.title = `Channel ${i}: Click to select`;
            }
            
            button.onclick = () => PM.Diagnostics.handleChannelSelection(controllerName, cardNumber, i);
            grid.appendChild(button);
        }
    }
    
    PM.Diagnostics.handleChannelSelection = function(controllerName, cardNumber, channelNumber) {
        if (currentSelectionMode === 'single') {
            // Single select - open error modal but keep channel modal context
            PM.Diagnostics.openErrorModalForChannel(controllerName, cardNumber, channelNumber);
        } else {
            // Multi select - toggle selection
            PM.Diagnostics.toggleChannelSelection(channelNumber);
        }
    }
    
    PM.Diagnostics.toggleChannelSelection = function(channelNumber) {
        const button = document.querySelector(`[data-channel="${channelNumber}"]`);
        const index = selectedChannels.indexOf(channelNumber);
        
        if (index > -1) {
            // Deselect
            selectedChannels.splice(index, 1);
            button.classList.remove('selected');
        } else {
            // Select
            selectedChannels.push(channelNumber);
            button.classList.add('selected');
        }
        
        PM.Diagnostics.updateSelectionCounter();
    }
    
    PM.Diagnostics.updateSelectionCounter = function() {
        const instructions = document.getElementById('channel-selection-instructions');
        if (selectedChannels.length > 0) {
            instructions.innerHTML = `
                <div class="selection-counter">${selectedChannels.length} channel${selectedChannels.length > 1 ? 's' : ''} selected</div>
                <div>Click more to add or use buttons below to set errors:</div>
            `;
        } else {
            instructions.textContent = 'Click multiple channels to select, then set error for all:';
        }
    }
    
    PM.Diagnostics.clearAllSelections = function() {
        selectedChannels = [];
        const buttons = document.querySelectorAll('.channel-selection-btn.selected');
        buttons.forEach(btn => btn.classList.remove('selected'));
        PM.Diagnostics.updateSelectionCounter();
    }
    
    PM.Diagnostics.setErrorForSelected = function() {
        if (selectedChannels.length === 0) {
            PM.UI.showMessage('Please select at least one channel', 'error');
            return;
        }
        
        // Close channel selection modal and open error modal for batch setting
        PM.UI.closeModal('channel-selection-modal');
        
        // Set up batch error setting
        currentErrorChannel.channelNumbers = selectedChannels.slice(); // Copy array
        currentErrorChannel.channelNumber = null; // Indicate batch mode
        
        document.getElementById('error-modal-title').textContent = `Set Error for ${selectedChannels.length} Channel${selectedChannels.length > 1 ? 's' : ''}`;
        PM.Diagnostics.resetErrorForm();
        document.getElementById('clear-error-btn').style.display = 'none';
        
        PM.UI.openModal('error-modal');
    }
    
    // Error Type Selection Functions
    PM.Diagnostics.selectErrorType = function(errorType) {
        // Remove previous selection
        const allButtons = document.querySelectorAll('.error-type-btn');
        allButtons.forEach(btn => btn.classList.remove('selected'));
        
        // Select current button
        const selectedButton = document.querySelector(`[data-error="${errorType}"]`);
        if (selectedButton) {
            selectedButton.classList.add('selected');
        }
        
        // Set hidden input value
        document.getElementById('error-type').value = errorType;
        
        // Enable save button
        document.getElementById('save-error-btn').disabled = false;
        
        // Handle description field based on error type
        const descriptionGroup = document.getElementById('error-description-group');
        const descriptionField = document.getElementById('error-description');
        
        if (errorType === 'other') {
            // For "other", show empty field and require input
            descriptionGroup.style.display = 'block';
            descriptionField.required = true;
            descriptionField.value = '';
            descriptionField.placeholder = 'Please provide a detailed description of the error...';
            document.getElementById('save-error-btn').disabled = !descriptionField.value.trim();
        } else {
            // For standard error types, show field with default description
            descriptionGroup.style.display = 'block';
            descriptionField.required = false;
            descriptionField.value = errorDescriptions[errorType] || '';
            descriptionField.placeholder = 'Default description provided. You can modify or add additional details...';
            document.getElementById('save-error-btn').disabled = false;
        }
    }
    
    // Reset error form
    PM.Diagnostics.resetErrorForm = function() {
        // Clear all selections
        const allButtons = document.querySelectorAll('.error-type-btn');
        allButtons.forEach(btn => btn.classList.remove('selected'));
        
        // Reset form fields
        document.getElementById('error-type').value = '';
        document.getElementById('error-description').value = '';
        document.getElementById('error-description-group').style.display = 'none';
        document.getElementById('save-error-btn').disabled = true;
    }
    
    // Error Table Functions
    PM.Diagnostics.renderErrorTable = function() {
        const tableSection = document.getElementById('error-table-section');
        const tableBody = document.getElementById('error-table-body');
        const noErrorsMsg = document.getElementById('no-errors-message');
        const errorTable = document.getElementById('error-table');
        
        if (diagnosticsData.length === 0) {
            tableSection.style.display = 'none';
            return;
        }
        
        tableSection.style.display = 'block';
        
        // Apply current sorting and filtering
        PM.Diagnostics.applyErrorTableFilters();
        
        if (filteredErrors.length === 0) {
            errorTable.style.display = 'none';
            noErrorsMsg.style.display = 'block';
            return;
        }
        
        errorTable.style.display = 'table';
        noErrorsMsg.style.display = 'none';
        
        let html = '';
        filteredErrors.forEach(error => {
            const errorTypeClass = `error-type-${error.error_type}`;
            const errorTypeDisplay = error.error_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const description = error.error_description || '';
            const createdAt = error.created_at ? new Date(error.created_at).toLocaleString() : 'N/A';
            
            html += `
                <tr>
                    <td class="controller-cell">${error.controller_name}</td>
                    <td class="card-cell">Card ${error.card_number}</td>
                    <td class="channel-cell">Channel ${error.channel_number}</td>
                    <td class="error-type-cell ${errorTypeClass}">${errorTypeDisplay}</td>
                    <td class="timestamp-cell">${createdAt}</td>
                    <td class="description-cell">${description}</td>
                    <td class="actions-cell">
                        <button class="btn btn-sm btn-info" onclick="PM.Diagnostics.viewChannelDetails('${error.controller_name}', ${error.card_number}, ${error.channel_number})" title="View Details">👁️</button>
                        <button class="btn btn-sm btn-primary" onclick="PM.Diagnostics.editChannelError('${error.controller_name}', ${error.card_number}, ${error.channel_number})" title="Edit Error">✏️</button>
                    </td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = html;
    }
    
    PM.Diagnostics.applyErrorTableFilters = function() {
        let errors = [...diagnosticsData];
        
        // Apply search filter
        const searchInput = document.getElementById('error-table-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        if (searchTerm) {
            errors = errors.filter(error => 
                error.controller_name.toLowerCase().includes(searchTerm) ||
                error.card_number.toString().includes(searchTerm) ||
                error.channel_number.toString().includes(searchTerm) ||
                error.error_type.toLowerCase().includes(searchTerm) ||
                (error.error_description && error.error_description.toLowerCase().includes(searchTerm))
            );
        }
        
        // Apply sorting
        if (currentSort.field) {
            errors.sort((a, b) => {
                let aVal = a[currentSort.field];
                let bVal = b[currentSort.field];
                
                // Handle different data types
                if (currentSort.field === 'card_number' || currentSort.field === 'channel_number') {
                    aVal = parseInt(aVal) || 0;
                    bVal = parseInt(bVal) || 0;
                } else if (currentSort.field === 'created_at') {
                    aVal = new Date(aVal || 0);
                    bVal = new Date(bVal || 0);
                } else {
                    aVal = (aVal || '').toString().toLowerCase();
                    bVal = (bVal || '').toString().toLowerCase();
                }
                
                if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            // Default sort by controller, card, then channel
            errors.sort((a, b) => {
                if (a.controller_name !== b.controller_name) {
                    return a.controller_name.localeCompare(b.controller_name);
                }
                if (a.card_number !== b.card_number) {
                    return a.card_number - b.card_number;
                }
                return (a.channel_number || 0) - (b.channel_number || 0);
            });
        }
        
        filteredErrors = errors;
    }
    
    PM.Diagnostics.sortErrorTable = function(field) {
        if (currentSort.field === field) {
            // Toggle direction if same field
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // New field, start with ascending
            currentSort.field = field;
            currentSort.direction = 'asc';
        }
        
        // Update sort indicators
        document.querySelectorAll('.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });
        
        const currentTh = document.querySelector(`[onclick="PM.Diagnostics.sortErrorTable('${field}')"]`);
        if (currentTh) {
            currentTh.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
        
        PM.Diagnostics.renderErrorTable();
    }
    
    PM.Diagnostics.filterErrorTable = function() {
        PM.Diagnostics.renderErrorTable();
    }
    
    PM.Diagnostics.clearErrorTableSearch = function() {
        document.getElementById('error-table-search').value = '';
        PM.Diagnostics.renderErrorTable();
    }
    
    PM.Diagnostics.editChannelError = function(controllerName, cardNumber, channelNumber) {
        // Open the channel selection modal and then the error modal
        PM.Diagnostics.setChannelError(controllerName, cardNumber, channelNumber);
    }
    
    PM.Diagnostics.cleanupDuplicates = async function() {
        if (!currentSessionId) {
            PM.UI.showMessage('No session loaded', 'error');
            return;
        }
        
        if (!confirm('🧹 Clean up duplicate errors?\n\nThis will remove duplicate errors for the same channel, keeping only the most recent one.\n\nThis action cannot be undone.')) {
            return;
        }
        
        try {
            PM.UI.showMessage('🧹 Cleaning up duplicates...', 'info');
            
            const response = await fetch(`/api/sessions/${currentSessionId}/diagnostics/cleanup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                
                // Reload diagnostics from server to get clean data
                await PM.Diagnostics.loadDiagnostics();
                
                // Rebuild and re-render
                PM.Diagnostics.buildControllersFromDiagnostics();
                PM.Diagnostics.renderControllers();
                PM.Diagnostics.renderErrorsSummary();
                
                if (result.recordsCleaned > 0) {
                    PM.UI.showMessage(`✅ Cleanup complete! Removed ${result.recordsCleaned} duplicate errors from ${result.duplicatesFound} channels.`, 'success');
                } else {
                    PM.UI.showMessage('✅ No duplicates found - data is clean!', 'success');
                }
            } else {
                const error = await response.json();
                PM.UI.showMessage(`Error cleaning up: ${error.message || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Cleanup error:', error);
            PM.UI.showMessage('Error during cleanup operation', 'error');
        }
    }
    
    PM.Diagnostics.viewCardDetails = function(controllerName, cardNumber) {
        // Get card errors
        const cardErrors = diagnosticsData.filter(d => 
            d.controller_name === controllerName && d.card_number === cardNumber
        );
        
        // Set modal title and basic info
        document.getElementById('card-details-title').textContent = `${controllerName} - Card ${cardNumber}`;
        document.getElementById('card-details-controller').textContent = controllerName;
        document.getElementById('card-details-number').textContent = cardNumber;
        document.getElementById('card-details-error-count').textContent = cardErrors.length;
        
        // Populate channels overview (1-32)
        const channelsGrid = document.getElementById('card-details-channels');
        let channelsHtml = '';
        for (let i = 1; i <= 32; i++) {
            const hasError = cardErrors.find(e => e.channel_number === i);
            const statusClass = hasError ? 'error' : 'clean';
            const title = hasError ? `Channel ${i}: ${hasError.error_type.replace(/_/g, ' ')}` : `Channel ${i}: Clean`;
            
            channelsHtml += `
                <div class="channel-overview-item ${statusClass}" 
                     onclick="PM.Diagnostics.viewChannelDetails('${controllerName}', ${cardNumber}, ${i})"
                     title="${title}">
                    ${i}
                </div>
            `;
        }
        channelsGrid.innerHTML = channelsHtml;
        
        // Populate errors table
        const errorsContainer = document.getElementById('card-details-errors');
        if (cardErrors.length > 0) {
            let errorsHtml = `
                <table>
                    <thead>
                        <tr>
                            <th>Channel</th>
                            <th>Error Type</th>
                            <th>Description</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            cardErrors.sort((a, b) => a.channel_number - b.channel_number).forEach(error => {
                const errorTypeDisplay = error.error_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const createdAt = error.created_at ? new Date(error.created_at).toLocaleString() : 'N/A';
                const description = error.error_description || '';
                
                errorsHtml += `
                    <tr>
                        <td>Channel ${error.channel_number}</td>
                        <td class="error-type-cell error-type-${error.error_type}">${errorTypeDisplay}</td>
                        <td>${description}</td>
                        <td>${createdAt}</td>
                        <td>
                            <button class="btn btn-sm btn-info" onclick="PM.Diagnostics.viewChannelDetails('${controllerName}', ${cardNumber}, ${error.channel_number})" title="View Details">👁️</button>
                            <button class="btn btn-sm btn-primary" onclick="PM.Diagnostics.editChannelError('${controllerName}', ${cardNumber}, ${error.channel_number})" title="Edit">✏️</button>
                        </td>
                    </tr>
                `;
            });
            
            errorsHtml += '</tbody></table>';
            errorsContainer.innerHTML = errorsHtml;
        } else {
            errorsContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No errors found for this card.</p>';
        }
        
        // Store current card context for editing
        window.currentCardContext = { controllerName, cardNumber };
        
        PM.UI.openModal('card-details-modal');
    }
    
    PM.Diagnostics.viewChannelDetails = function(controllerName, cardNumber, channelNumber) {
        // Find error for this channel
        const channelError = diagnosticsData.find(d => 
            d.controller_name === controllerName && 
            d.card_number === cardNumber && 
            d.channel_number === channelNumber
        );
        
        // Set modal title and basic info
        document.getElementById('channel-details-title').textContent = `${controllerName} - Card ${cardNumber} - Channel ${channelNumber}`;
        document.getElementById('channel-details-controller').textContent = controllerName;
        document.getElementById('channel-details-card').textContent = `Card ${cardNumber}`;
        document.getElementById('channel-details-channel').textContent = `Channel ${channelNumber}`;
        
        const errorSection = document.getElementById('channel-error-section');
        const editBtn = document.getElementById('edit-channel-btn');
        const addBtn = document.getElementById('add-error-btn');
        
        if (channelError) {
            // Channel has an error
            document.getElementById('channel-details-status').textContent = 'Error';
            document.getElementById('channel-details-status').className = 'status-error';
            
            // Show error information
            errorSection.style.display = 'block';
            const errorTypeDisplay = channelError.error_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            document.getElementById('channel-details-error-type').textContent = errorTypeDisplay;
            document.getElementById('channel-details-error-description').textContent = channelError.error_description || 'No description';
            document.getElementById('channel-details-created').textContent = channelError.created_at ? new Date(channelError.created_at).toLocaleString() : 'N/A';
            document.getElementById('channel-details-updated').textContent = channelError.updated_at ? new Date(channelError.updated_at).toLocaleString() : 'N/A';
            
            // Show edit button, hide add button
            editBtn.style.display = 'inline-block';
            addBtn.style.display = 'none';
        } else {
            // Channel is clean
            document.getElementById('channel-details-status').textContent = 'Clean';
            document.getElementById('channel-details-status').className = 'status-clean';
            
            // Hide error section
            errorSection.style.display = 'none';
            
            // Show add button, hide edit button
            editBtn.style.display = 'none';
            addBtn.style.display = 'inline-block';
        }
        
        // Store current channel context
        window.currentChannelContext = { controllerName, cardNumber, channelNumber };
        
        PM.UI.openModal('channel-details-modal');
    }
    
    PM.Diagnostics.editCard = function() {
        if (window.currentCardContext) {
            PM.UI.closeModal('card-details-modal');
            PM.Diagnostics.setChannelError(window.currentCardContext.controllerName, window.currentCardContext.cardNumber);
        }
    }
    
    PM.Diagnostics.editChannelFromDetails = function() {
        if (window.currentChannelContext) {
            PM.UI.closeModal('channel-details-modal');
            PM.Diagnostics.setChannelError(
                window.currentChannelContext.controllerName, 
                window.currentChannelContext.cardNumber, 
                window.currentChannelContext.channelNumber
            );
        }
    }
    
    PM.Diagnostics.addChannelError = function() {
        if (window.currentChannelContext) {
            PM.UI.closeModal('channel-details-modal');
            PM.Diagnostics.setChannelError(
                window.currentChannelContext.controllerName, 
                window.currentChannelContext.cardNumber, 
                window.currentChannelContext.channelNumber
            );
        }
    }
    
    PM.Diagnostics.exportErrorTable = function() {
        if (diagnosticsData.length === 0) {
            PM.UI.showMessage('No errors to export', 'info');
            return;
        }
        
        // Create CSV content
        const headers = ['Controller', 'Card', 'Channel', 'Error Type', 'Description'];
        let csvContent = headers.join(',') + '\n';
        
        const sortedErrors = [...diagnosticsData].sort((a, b) => {
            if (a.controller_name !== b.controller_name) {
                return a.controller_name.localeCompare(b.controller_name);
            }
            if (a.card_number !== b.card_number) {
                return a.card_number - b.card_number;
            }
            return (a.channel_number || 0) - (b.channel_number || 0);
        });
        
        sortedErrors.forEach(error => {
            const errorTypeDisplay = error.error_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const description = (error.error_description || '').replace(/"/g, '""'); // Escape quotes
            const row = [
                error.controller_name,
                `Card ${error.card_number}`,
                `Channel ${error.channel_number}`,
                errorTypeDisplay,
                `"${description}"`
            ];
            csvContent += row.join(',') + '\n';
        });
        
        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diagnostic-errors-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        PM.UI.showMessage('✅ Error table exported successfully', 'success');
    }
    
    // Local Storage Functions
    PM.Diagnostics.saveDiagnosticsToStorage = function() {
        if (!currentSessionId) return;
        
        try {
            const storageKey = `diagnostics_${currentSessionId}`;
            localStorage.setItem(storageKey, JSON.stringify(diagnosticsData));
            console.log('💾 Saved diagnostics to local storage:', diagnosticsData.length, 'errors');
        } catch (error) {
            console.warn('Failed to save diagnostics to local storage:', error);
        }
    }
    
    PM.Diagnostics.clearDiagnosticsFromStorage = function() {
        if (!currentSessionId) return;
        
        try {
            const storageKey = `diagnostics_${currentSessionId}`;
            localStorage.removeItem(storageKey);
            console.log('🗑️ Cleared diagnostics from local storage');
        } catch (error) {
            console.warn('Failed to clear diagnostics from local storage:', error);
        }
    }

    console.log('✅ PM.Diagnostics module loaded (47 functions)');

})();

