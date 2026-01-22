/**
 * PM.Nodes Module - Node Management
 * 
 * Handles all node-related functionality including:
 * - Equipment table rendering (controllers, switches, computers)
 * - Node maintenance tracking
 * - Node tracker functionality
 * - Auto-save functionality
 * - Node filtering modal
 * - Bulk selection operations
 * - Progress tracking
 * 
 * Dependencies: PM.UI
 * Load Order: 5th (after pm-namespace.js, pm-ui.js, pm-notes.js, pm-cabinets.js)
 * 
 * Global Variables Used:
 * - currentSessionId
 * - sessionData
 * - isSessionCompleted
 * - nodeTrackerData
 * - selectedNodes
 * - nodeFilterMode
 * - currentNodes
 * - nodeMaintenanceData
 */

(function() {
    'use strict';

    PM.Nodes.loadNodes = async function() {
        if (!sessionData || !sessionData.customer_id) {
            console.log('DEBUG: loadNodes - missing sessionData or customer_id');
            return;
        }

        try {
            // Load customer nodes (include sessionId for completed sessions to get snapshots)
            const nodesUrl = `/api/customers/${sessionData.customer_id}/nodes?sessionId=${currentSessionId}`;
            console.log('DEBUG: loadNodes - fetching from:', nodesUrl);
            const nodesResponse = await fetch(nodesUrl);
            console.log('DEBUG: loadNodes - response status:', nodesResponse.status);
            
            if (!nodesResponse.ok) {
                throw new Error(`Failed to load nodes: ${nodesResponse.status}`);
            }
            
            const nodes = await nodesResponse.json();
            console.log('DEBUG: loadNodes - received nodes:', nodes.length, 'nodes');
            currentNodes = nodes;

            // Load existing maintenance data for this session
            const maintenanceResponse = await fetch(`/api/sessions/${currentSessionId}/node-maintenance`);
            if (maintenanceResponse.ok) {
                nodeMaintenanceData = await maintenanceResponse.json();
            } else {
                nodeMaintenanceData = {};
            }

            PM.Nodes.renderEquipmentTables();
        } catch (error) {
            console.error('Error loading nodes:', error);
            PM.UI.showMessage('Error loading nodes', 'error');
        }
    }

    PM.Nodes.renderEquipmentTables = function() {
        const noNodes = document.getElementById('no-nodes');
        
        if (!currentNodes || currentNodes.length === 0) {
            document.getElementById('controllers-table-body').innerHTML = '';
            document.getElementById('switches-table-body').innerHTML = '';
            document.getElementById('computers-table-body').innerHTML = '';
            noNodes.classList.remove('hidden');
            return;
        }

        noNodes.classList.add('hidden');
        
        const filteredNodes = PM.Nodes.getFilteredNodes();
        
        // Function to check if node is a controller
        // Uses ONLY the node_type from import - no pattern matching
        const isController = (node) => {
            const nodeType = node.node_type || '';
            
            // Only classify as controller if node_type explicitly says so
            // Do NOT use name patterns - trust the import classification
            return nodeType === 'Controller' || 
                   nodeType === 'DeltaV EIOC' ||
                   nodeType === 'CIOC' ||
                   nodeType === 'Charms Smart Logic Solver' ||
                   nodeType === 'SZ Controller' ||
                   nodeType === 'SIS';
        };
        
        // Separate controllers, switches, and computers (partners already excluded in getFilteredNodes)
        const controllers = filteredNodes.filter(node => isController(node));
        
        const switches = filteredNodes.filter(node => 
            node.node_type === 'Smart Network Devices' ||
            node.description === 'Smart Network Devices' ||
            node.node_name.includes('_DC_OP_') ||
            node.node_name.includes('_DC_SR_') ||
            node.node_name.includes('_CAB_')
        );
        
        // Function to check if node is a switch
        const isSwitch = (node) => {
            return node.node_type === 'Smart Network Devices' ||
                   node.description === 'Smart Network Devices' ||
                   node.node_name.includes('_DC_OP_') ||
                   node.node_name.includes('_DC_SR_') ||
                   node.node_name.includes('_CAB_');
        };
        
        const computers = filteredNodes.filter(node => 
            !isController(node) &&
            !isSwitch(node) &&
            !['CIOC', 'Charms Smart Logic Solver', 'SZ Controller', 'Power Supply', 'Wireless Gateway'].includes(node.node_type)
        );
        
        PM.Nodes.renderControllersTable(controllers);
        PM.Nodes.renderSwitchesTable(switches);
        PM.Nodes.renderComputersTable(computers);
    }

    PM.Nodes.renderControllersTable = function(controllers) {
        const tbody = document.getElementById('controllers-table-body');
        tbody.innerHTML = '';
        
        controllers.forEach(controller => {
            const maintenance = nodeMaintenanceData[controller.id] || {};
            const controllerType = PM.Nodes.getControllerType(controller);
            
            // Performance tracking UI with automatic detection
            const defaultType = PM.Nodes.getDefaultPerformanceType(controller);
            let performanceType = maintenance.performance_type || defaultType || 'free_time';
            const performanceValue = maintenance.performance_value || '';
            
            // Auto-set or update the performance type if we can detect it
            if (defaultType) {
                if (!nodeMaintenanceData[controller.id]) {
                    nodeMaintenanceData[controller.id] = {};
                }
                // Update performance type if detection has changed (e.g., MQ controllers)
                if (maintenance.performance_type !== defaultType) {
                    nodeMaintenanceData[controller.id].performance_type = defaultType;
                    performanceType = defaultType;
                }
            }
            
            const performanceUI = defaultType ? `
                <div class="flex flex-col gap-2">
                    <div class="text-xs font-medium text-gray-600 text-center">
                        ${performanceType === 'perf_index' ? 'Performance Index' : 'Free Time'}
                    </div>
                    <input type="number" 
                           class="performance-value-input" 
                           data-node-id="${controller.id}" 
                           data-type="performance_value"
                           value="${performanceValue}"
                           placeholder="${performanceType === 'perf_index' ? '1-5' : '1-100'}" 
                           min="${performanceType === 'perf_index' ? '1' : '1'}" 
                           max="${performanceType === 'perf_index' ? '5' : '100'}"
                           inputmode="numeric">
                    <input type="hidden" 
                           data-node-id="${controller.id}" 
                           data-type="performance_type"
                           value="${performanceType}">
                </div>
            ` : `
                <div class="flex flex-col gap-2">
                    <select class="performance-type-select" 
                            data-node-id="${controller.id}" 
                            data-type="performance_type">
                        <option value="">Select Type</option>
                        <option value="free_time" ${performanceType === 'free_time' ? 'selected' : ''}>Free Time</option>
                        <option value="perf_index" ${performanceType === 'perf_index' ? 'selected' : ''}>Perf Index</option>
                    </select>
                    <input type="number" 
                           class="performance-value-input" 
                           data-node-id="${controller.id}" 
                           data-type="performance_value"
                           value="${performanceValue}"
                           placeholder="${performanceType === 'perf_index' ? '1-5' : '1-100'}" 
                           min="${performanceType === 'perf_index' ? '1' : '1'}" 
                           max="${performanceType === 'perf_index' ? '5' : '100'}"
                           inputmode="numeric">
                </div>
            `;
            
            const row = document.createElement('tr');
            row.dataset.nodeId = controller.id;
            row.className = maintenance.completed ? 'node-completed' : '';
            row.innerHTML = `
                <td class="px-3 py-2 text-sm font-medium text-gray-900">${controller.node_name}</td>
                <td class="px-3 py-2 text-sm text-gray-600">
                    <span class="badge badge-${controllerType.toLowerCase()}">${controllerType}</span>
                </td>
                <td class="px-3 py-2 text-sm text-gray-600">${controller.serial || ''}</td>
                <td class="px-3 py-2 text-center performance-column">
                    ${performanceUI}
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox" 
                           data-node-id="${controller.id}" 
                           data-type="hf_updated"
                           ${maintenance.hf_updated ? 'checked' : ''}>
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox" 
                           data-node-id="${controller.id}" 
                           data-type="redundancy"
                           ${maintenance.redundancy_checked ? 'checked' : ''}>
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox" 
                           data-node-id="${controller.id}" 
                           data-type="cold_restart"
                           ${maintenance.cold_restart_checked ? 'checked' : ''}>
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox" 
                           data-node-id="${controller.id}" 
                           data-type="no_errors"
                           ${maintenance.no_errors_checked ? 'checked' : ''}>
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox completed-checkbox" 
                           data-node-id="${controller.id}" 
                           data-type="completed"
                           ${maintenance.completed ? 'checked' : ''}>
                </td>
            `;
            
            tbody.appendChild(row);
        });

        // Add event listeners
        tbody.querySelectorAll('.node-checkbox, .performance-type-select, .performance-value-input, input[type="hidden"]').forEach(input => {
            input.addEventListener('change', PM.Nodes.handleInputChange);
            // For hidden inputs, trigger change immediately to save the auto-detected type
            if (input.type === 'hidden' && input.dataset.type === 'performance_type') {
                PM.Nodes.handleInputChange({ target: input });
            }
        });
    }

    PM.Nodes.renderComputersTable = function(computers) {
        const tbody = document.getElementById('computers-table-body');
        tbody.innerHTML = '';
        
        computers.forEach(computer => {
            const maintenance = nodeMaintenanceData[computer.id] || {};
            
            const row = document.createElement('tr');
            row.dataset.nodeId = computer.id;
            row.className = maintenance.completed ? 'node-completed' : '';
            row.innerHTML = `
                <td class="px-3 py-2 text-sm font-medium text-gray-900">${computer.node_name}</td>
                <td class="px-3 py-2 text-sm text-gray-600">${computer.node_type || ''}</td>
                <td class="px-3 py-2 text-sm text-gray-600">${computer.model || ''}</td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox" 
                           data-node-id="${computer.id}" 
                           data-type="dv"
                           ${maintenance.dv_checked ? 'checked' : ''}>
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox" 
                           data-node-id="${computer.id}" 
                           data-type="os"
                           ${maintenance.os_checked ? 'checked' : ''}>
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox" 
                           data-node-id="${computer.id}" 
                           data-type="macafee"
                           ${maintenance.macafee_checked ? 'checked' : ''}>
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox" 
                           data-node-id="${computer.id}" 
                           data-type="hdd_replaced"
                           ${maintenance.hdd_replaced ? 'checked' : ''}>
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox completed-checkbox" 
                           data-node-id="${computer.id}" 
                           data-type="completed"
                           ${maintenance.completed ? 'checked' : ''}>
                </td>
            `;
            
            tbody.appendChild(row);
        });

        // Add event listeners
        tbody.querySelectorAll('.node-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', PM.Nodes.handleInputChange);
        });
    }

    PM.Nodes.renderSwitchesTable = function(switches) {
        const tbody = document.getElementById('switches-table-body');
        tbody.innerHTML = '';
        
        switches.forEach(switchNode => {
            const maintenance = nodeMaintenanceData[switchNode.id] || {};
            
            const row = document.createElement('tr');
            row.dataset.nodeId = switchNode.id;
            row.className = maintenance.completed ? 'node-completed' : '';
            row.innerHTML = `
                <td class="px-3 py-2 text-sm font-medium text-gray-900">${switchNode.node_name}</td>
                <td class="px-3 py-2 text-sm text-gray-600">${switchNode.node_type || switchNode.description || ''}</td>
                <td class="px-3 py-2 text-sm text-gray-600">${switchNode.firmware || 'N/A'}</td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox" 
                           data-node-id="${switchNode.id}" 
                           data-type="firmware_updated"
                           ${maintenance.firmware_updated_checked ? 'checked' : ''}>
                </td>
                <td class="px-3 py-2 text-center">
                    <input type="checkbox" 
                           class="node-checkbox completed-checkbox" 
                           data-node-id="${switchNode.id}" 
                           data-type="completed"
                           ${maintenance.completed ? 'checked' : ''}>
                </td>
            `;
            
            tbody.appendChild(row);
        });

        // Add event listeners
        tbody.querySelectorAll('.node-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', PM.Nodes.handleInputChange);
        });
    }

    // Helper function to get controller type - use model field primarily
    PM.Nodes.getControllerType = function(node) {
        // Return the actual model/type from the model field if available
        if (node.model && node.model.trim()) {
            return node.model.trim();
        }
        
        // Fallback to detection based on node name and type
        const nodeName = (node.node_name || '').toLowerCase();
        const nodeType = (node.node_type || '').toLowerCase();
        const description = (node.description || '').toLowerCase();
        
        // CIOC detection
        if (nodeName.includes('cioc') || nodeType.includes('cioc') || description.includes('cioc')) {
            return 'CIOC';
        }
        
        // SIS detection - expanded patterns
        if (nodeName.includes('sis') || nodeType.includes('sis') || description.includes('sis') ||
            nodeName.includes('safety') || description.includes('safety') ||
            nodeName.includes('csls') || nodeName.includes('-sz') || nodeName.includes('sz01') ||
            nodeName.includes('sz02') || nodeName.includes('sz03')) {
            return 'SIS';
        }
        
        // Standard DeltaV Controller
        if (nodeName.includes('ctrl') || nodeName.includes('control') || 
            nodeType === 'controller' || nodeName.includes('ldcs')) {
            return 'Controller';
        }
        
        return node.node_type || 'Controller'; // Use node_type or default
    }

    PM.Nodes.getDefaultPerformanceType = function(node) {
        // Use node_type field (contains short codes like SE3007, KL2001X1-BA1) for performance detection
        const nodeType = (node.node_type || '').toLowerCase();
        const nodeName = (node.node_name || '').toLowerCase();
        const model = (node.model || '').toLowerCase();
        
        // Performance Index controllers: S-Series codes (SE*, SZ*, SX*, SQ*), CSLS, SIS, PK, EIOC
        // Check node_type field first (contains the short codes from CSV Type column)
        if (nodeType.startsWith('se') || nodeType.startsWith('sz') || 
            nodeType.startsWith('sx') || nodeType.startsWith('sq') ||
            nodeType.includes('csls') || nodeType.includes('pk') ||
            nodeType.includes('eioc') || nodeType.includes('sis') ||
            nodeType.startsWith('mq') ||
            nodeType.includes('kl') && nodeType.includes('ba1')) { // CHARM Logic Solver codes
            return 'perf_index';
        }
        
        // Free Time controllers: M-Series codes (VE*, MD*, MX*), SD Plus, CIOC
        if (nodeType.startsWith('ve') || nodeType.startsWith('md') || 
            nodeType.startsWith('mx') ||
            nodeType.includes('sd plus') || nodeType.includes('cioc')) {
            return 'free_time';
        }
        
        // Fallback to model field patterns (for full descriptions)
        if (model.includes('sx controller') || model.includes('sz controller') || 
            model.includes('sq controller') || model.includes('csls') ||
            model.includes('logic solver') || model.includes('sis') ||
            model.includes('mq controller') || model.includes('mq') ||
            model.includes('pk') || model.includes('pk controller')) {
            return 'perf_index';
        }
        
        if (model.includes('md controller') || model.includes('mx controller') || 
            model.includes('md plus') || 
            model.includes('sd plus') || model.includes('cioc')) {
            return 'free_time';
        }
        
        // Fallback to node name patterns
        if (nodeName.includes('sz') || nodeName.includes('sx') || nodeName.includes('sq') || 
            nodeName.includes('csls') || nodeName.includes('pk') || nodeName.includes('sis')) {
            return 'perf_index';
        }
        
        if (nodeName.includes('md') || nodeName.includes('mx') || nodeName.includes('mq') || 
            nodeName.includes('md plus') || nodeName.includes('sd plus') || 
            nodeName.includes('cioc')) {
            return 'free_time';
        }
        
        // If we can't determine, return null to show selector
        return null;
    }

    PM.Nodes.getFilteredNodes = function() {
        const searchFilter = document.getElementById('node-search').value.toLowerCase();
        
        return currentNodes.filter(node => {
            // Exclude all partner controllers completely
            if (node.node_name.includes('-partner') || 
                node.node_name.includes('partner') || 
                node.node_name.toLowerCase().includes('partner')) {
                return false;
            }
            
            const matchesSearch = !searchFilter || 
                node.node_name.toLowerCase().includes(searchFilter) ||
                (node.model && node.model.toLowerCase().includes(searchFilter)) ||
                (node.node_type && node.node_type.toLowerCase().includes(searchFilter));
            
            return matchesSearch;
        });
    }

    PM.Nodes.filterNodes = function() {
        PM.Nodes.renderEquipmentTables();
    }

    PM.Nodes.handleInputChange = function(e) {
        // Prevent changes if session is completed
        if (isSessionCompleted) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            return false;
        }
        
        const nodeId = e.target.getAttribute('data-node-id');
        const type = e.target.getAttribute('data-type');
        
        if (!nodeMaintenanceData[nodeId]) {
            nodeMaintenanceData[nodeId] = {};
        }
        
        if (type === 'performance_type') {
            nodeMaintenanceData[nodeId][type] = e.target.value;
            // Update the corresponding input placeholder and limits
            const valueInput = e.target.parentElement.querySelector('.performance-value-input');
            if (valueInput) {
                if (e.target.value === 'perf_index') {
                    valueInput.placeholder = '1-5';
                    valueInput.min = '1';
                    valueInput.max = '5';
                } else {
                    valueInput.placeholder = '1-100';
                    valueInput.min = '1';
                    valueInput.max = '100';
                }
            }
        } else if (type === 'performance_value') {
            nodeMaintenanceData[nodeId][type] = parseInt(e.target.value) || null;
        } else if (type === 'free_time') {
            nodeMaintenanceData[nodeId][type] = e.target.value;
        } else if (type === 'completed') {
            // Handle completed checkbox - toggle row highlighting
            nodeMaintenanceData[nodeId][type] = e.target.checked;
            const row = e.target.closest('tr');
            if (row) {
                if (e.target.checked) {
                    row.classList.add('node-completed');
                } else {
                    row.classList.remove('node-completed');
                }
            }
        } else if (type === 'hdd_replaced' || type === 'hf_updated' || type === 'firmware_updated_checked') {
            nodeMaintenanceData[nodeId][type] = e.target.checked;
        } else {
            nodeMaintenanceData[nodeId][`${type}_checked`] = e.target.checked;
        }
        
        // Auto-save after a short delay
        clearTimeout(window.autoSaveTimeout);
        window.autoSaveTimeout = setTimeout(() => {
            PM.Nodes.autoSaveNodesProgress();
        }, 1000); // Save 1 second after last change
    }

    PM.Nodes.autoSaveNodesProgress = async function() {
        try {
            const response = await fetch(`/api/sessions/${currentSessionId}/node-maintenance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(nodeMaintenanceData)
            });

            const result = await response.json();

            if (result.success) {
                // Show a subtle success indicator
                const saveBtn = document.getElementById('save-nodes-btn');
                if (saveBtn) {
                    const originalText = saveBtn.textContent;
                    saveBtn.textContent = '✓ Saved';
                    saveBtn.classList.add('btn-success');
                    
                    setTimeout(() => {
                        saveBtn.textContent = originalText;
                        saveBtn.classList.remove('btn-success');
                    }, 2000);
                }
            } else {
                console.error('Auto-save failed:', result.error);
            }
        } catch (error) {
            console.error('Auto-save network error:', error);
        }
    }

    PM.Nodes.toggleControllerCheckboxes = function(type) {
        const tbody = document.getElementById('controllers-table-body');
        const checkboxes = tbody.querySelectorAll(`[data-type="${type}"]`);
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
            PM.Nodes.handleInputChange({ target: checkbox });
        });
    }

    PM.Nodes.toggleComputerCheckboxes = function(type) {
        const tbody = document.getElementById('computers-table-body');
        const checkboxes = tbody.querySelectorAll(`[data-type="${type}"]`);
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
            PM.Nodes.handleInputChange({ target: checkbox });
        });
    }

    PM.Nodes.toggleSwitchesCheckboxes = function(type) {
        const tbody = document.getElementById('switches-table-body');
        const checkboxes = tbody.querySelectorAll(`[data-type="${type}"]`);
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
            PM.Nodes.handleInputChange({ target: checkbox });
        });
    }

    PM.Nodes.saveNodesProgress = async function() {
        if (isSessionCompleted) {
            PM.UI.showMessage('Cannot save changes - PM session is completed', 'error');
            return;
        }
        
        try {
            const response = await fetch(`/api/sessions/${currentSessionId}/node-maintenance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(nodeMaintenanceData)
            });

            const result = await response.json();

            if (result.success) {
                PM.UI.playSuccessSound();
                PM.UI.showMessage('Node maintenance progress saved successfully', 'success');
            } else {
                PM.UI.playErrorSound();
                PM.UI.showMessage(result.error || 'Error saving progress', 'error');
            }
        } catch (error) {
            PM.UI.showMessage('Network error. Please try again.', 'error');
        }
    }

    PM.Nodes.clearAllNodes = function() {
        if (confirm('Are you sure you want to clear all maintenance data?')) {
            nodeMaintenanceData = {};
            PM.Nodes.renderEquipmentTables();
            PM.UI.showMessage('All maintenance data cleared', 'info');
        }
    }

    // Node filtering functionality
    PM.Nodes.showNodeFilterModal = async function() {
        const modal = document.getElementById('node-filter-modal');
        if (modal) {
            modal.style.display = 'block';
            // Clear search when opening modal
            const searchInput = document.getElementById('node-filter-search');
            if (searchInput) {
                searchInput.value = '';
            }
            
            // Ensure nodes are loaded before populating filter
            if (!currentNodes || currentNodes.length === 0) {
                await PM.Nodes.loadNodes();
            }
            
            PM.Nodes.populateNodeFilterList();
        }
    }

    PM.Nodes.hideNodeFilterModal = function() {
        const modal = document.getElementById('node-filter-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    PM.Nodes.populateNodeFilterList = function() {
        const container = document.getElementById('node-filter-list');
        console.log('Populating node filter list. currentNodes:', currentNodes);
        
        if (!currentNodes || currentNodes.length === 0) {
            container.innerHTML = '<p class="text-gray-500">No nodes found for this customer</p>';
            console.log('No currentNodes available');
            return;
        }
        
        console.log(`Found ${currentNodes.length} nodes to filter`);

        // Group nodes by type
        const controllers = currentNodes.filter(node => {
            const nodeType = (node.node_type || '').toLowerCase();
            const model = (node.model || '').toLowerCase();
            const nodeName = (node.node_name || '').toLowerCase();
            return (nodeType.includes('controller') || nodeType.includes('cioc') || 
                    nodeType.includes('sis') || nodeType.includes('eioc') ||
                    model.includes('se4101') || model.includes('ve4021')) &&
                   !nodeType.includes('application') && !nodeType.includes('professional') && 
                   !nodeType.includes('not available') && !nodeType.includes('workstation') &&
                   !nodeName.includes('-partner');
        });

        const workstations = currentNodes.filter(node => {
            const nodeType = (node.node_type || '').toLowerCase();
            return nodeType.includes('workstation') || nodeType.includes('computer') || 
                   nodeType.includes('operator') || nodeType.includes('hmi') ||
                   nodeType.includes('application') || nodeType.includes('professional') ||
                   nodeType.includes('not available');
        });

        const switches = currentNodes.filter(node => {
            const nodeType = (node.node_type || '').toLowerCase();
            return nodeType.includes('switch') || nodeType.includes('network');
        });

        console.log(`Controllers: ${controllers.length}, Workstations: ${workstations.length}, Switches: ${switches.length}`);
        
        let html = '';
        
        if (controllers.length > 0) {
            html += '<div class="node-section mb-4" data-section="controllers">';
            html += '<h4 class="section-header font-medium text-gray-900 mb-2">Controllers</h4>';
            controllers.forEach(node => {
                const isSelected = selectedNodes.has(node.id);
                html += `
                    <label class="node-item flex items-center mb-1" data-node-text="${node.node_name.toLowerCase()} ${(node.node_type || '').toLowerCase()}">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} 
                               onchange="PM.Nodes.toggleNodeSelection(${node.id})" class="mr-2">
                        <span class="text-sm">${node.node_name} (${node.node_type})</span>
                    </label>`;
            });
            html += '</div>';
        }

        if (workstations.length > 0) {
            html += '<div class="node-section mb-4" data-section="workstations">';
            html += '<h4 class="section-header font-medium text-gray-900 mb-2">Workstations</h4>';
            workstations.forEach(node => {
                const isSelected = selectedNodes.has(node.id);
                html += `
                    <label class="node-item flex items-center mb-1" data-node-text="${node.node_name.toLowerCase()} ${(node.node_type || '').toLowerCase()}">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} 
                               onchange="PM.Nodes.toggleNodeSelection(${node.id})" class="mr-2">
                        <span class="text-sm">${node.node_name} (${node.node_type})</span>
                    </label>`;
            });
            html += '</div>';
        }

        if (switches.length > 0) {
            html += '<div class="node-section mb-4" data-section="switches">';
            html += '<h4 class="section-header font-medium text-gray-900 mb-2">Network Switches</h4>';
            switches.forEach(node => {
                const isSelected = selectedNodes.has(node.id);
                html += `
                    <label class="node-item flex items-center mb-1" data-node-text="${node.node_name.toLowerCase()} ${(node.node_type || '').toLowerCase()}">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} 
                               onchange="PM.Nodes.toggleNodeSelection(${node.id})" class="mr-2">
                        <span class="text-sm">${node.node_name} (${node.node_type})</span>
                    </label>`;
            });
            html += '</div>';
        }

        // If no nodes were categorized, show all nodes
        if (html === '') {
            html += '<div class="node-section mb-4" data-section="all">';
            html += '<h4 class="section-header font-medium text-gray-900 mb-2">All Nodes</h4>';
            currentNodes.forEach(node => {
                const isSelected = selectedNodes.has(node.id);
                html += `
                    <label class="node-item flex items-center mb-1" data-node-text="${node.node_name.toLowerCase()} ${(node.node_type || '').toLowerCase()}">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} 
                               onchange="PM.Nodes.toggleNodeSelection(${node.id})" class="mr-2">
                        <span class="text-sm">${node.node_name} (${node.node_type || 'Unknown'})</span>
                    </label>`;
            });
            html += '</div>';
            console.log('No nodes fit categories, showing all nodes');
        }

        container.innerHTML = html;
        console.log('Node filter HTML generated:', html.length > 0 ? 'Success' : 'Failed');
    }

    PM.Nodes.toggleNodeSelection = function(nodeId) {
        if (selectedNodes.has(nodeId)) {
            selectedNodes.delete(nodeId);
        } else {
            selectedNodes.add(nodeId);
        }
        PM.Nodes.updateNodeFilterSummary();
    }

    PM.Nodes.updateNodeFilterSummary = function() {
        const summary = document.getElementById('node-filter-summary');
        const modeInput = document.querySelector('input[name="filter-mode"]:checked');
        const mode = modeInput ? modeInput.value : 'include';
        nodeFilterMode = mode;
        
        if (selectedNodes.size === 0) {
            summary.textContent = 'All nodes will be included';
        } else {
            const action = mode === 'include' ? 'included' : 'excluded';
            summary.textContent = `${selectedNodes.size} nodes will be ${action}`;
        }
    }

    PM.Nodes.selectAllNodes = function() {
        if (currentNodes) {
            currentNodes.forEach(node => selectedNodes.add(node.id));
            PM.Nodes.populateNodeFilterList();
            PM.Nodes.updateNodeFilterSummary();
        }
    }

    PM.Nodes.selectNoNodes = function() {
        selectedNodes.clear();
        PM.Nodes.populateNodeFilterList();
        PM.Nodes.updateNodeFilterSummary();
    }

    PM.Nodes.selectAllVisible = function() {
        // Select all currently visible nodes (not hidden by search)
        const visibleItems = document.querySelectorAll('#node-filter-list .node-item');
        visibleItems.forEach(item => {
            if (item.style.display !== 'none') {
                const checkbox = item.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    const onchangeAttr = checkbox.getAttribute('onchange');
                    const match = onchangeAttr ? onchangeAttr.match(/\d+/) : null;
                    if (match) {
                        const nodeId = parseInt(match[0]);
                        selectedNodes.add(nodeId);
                        checkbox.checked = true;
                    }
                }
            }
        });
        PM.Nodes.updateNodeFilterSummary();
    }

    PM.Nodes.filterNodeList = function() {
        console.log('filterNodeList called');
        const searchInput = document.getElementById('node-filter-search');
        console.log('Search input element:', searchInput);
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        console.log('Search term:', searchTerm);
        console.log('Raw input value:', searchInput ? searchInput.value : 'NO INPUT FOUND');
        
        const nodeItems = document.querySelectorAll('#node-filter-list .node-item');
        const sections = document.querySelectorAll('#node-filter-list .node-section');
        console.log('Found node items:', nodeItems.length);
        let visibleCount = 0;
        
        // Filter individual node items
        nodeItems.forEach((item, index) => {
            const nodeText = item.getAttribute('data-node-text') || '';
            // Only log first few items to avoid spam, and only when searching
            if (searchTerm && index < 5) {
                console.log(`Item ${index}: "${nodeText}" - matches: ${nodeText.includes(searchTerm)}`);
            }
            if (nodeText.includes(searchTerm)) {
                item.style.display = 'flex';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });
        
        console.log('Visible count:', visibleCount);
        
        // Show/hide section headers based on whether they have visible items
        sections.forEach(section => {
            const visibleItemsInSection = section.querySelectorAll('.node-item').length;
            let actualVisibleItems = 0;
            section.querySelectorAll('.node-item').forEach(item => {
                if (item.style.display !== 'none') {
                    actualVisibleItems++;
                }
            });
            
            const header = section.querySelector('.section-header');
            
            if (searchTerm === '' || actualVisibleItems > 0) {
                section.style.display = 'block';
                if (header) header.style.display = 'block';
            } else {
                section.style.display = 'none';
            }
        });
        
        // Update search results counter
        if (searchTerm) {
            searchInput.placeholder = `${visibleCount} nodes found`;
        } else {
            searchInput.placeholder = 'Search nodes...';
        }
    }

    PM.Nodes.applyNodeFilter = function() {
        PM.Nodes.updateNodeFilterSummary();
        PM.Nodes.hideNodeFilterModal();
        const summaryEl = document.getElementById('node-filter-summary');
        PM.UI.showMessage(`Node filter applied: ${summaryEl ? summaryEl.textContent : ''}`, 'info');
    }

    console.log('✅ PM.Nodes module loaded (32 functions)');

})();

