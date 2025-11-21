/**
 * PM.Session Module - Session Management
 * 
 * Handles all session-related functionality including:
 * - Session loading and initialization
 * - Tab switching with lazy loading
 * - View-only mode for completed sessions
 * - Customer navigation
 * - Event listeners setup
 * - PDF export with node filtering
 * - Session status checking
 * 
 * Dependencies: PM.UI, PM.Cabinets, PM.Nodes, PM.Diagnostics, PM.Notes
 * Load Order: 7th (LAST - depends on all other modules)
 * 
 * Global Variables Used:
 * - currentSessionId
 * - sessionData
 * - isSessionCompleted
 * - nodeFilterMode
 * - selectedNodes
 * - diagnosticsData
 */

(function() {
    'use strict';

    PM.Session.setupCustomerNavigation = function(customerId, customerName) {
        // Setup customer profile link in nav bar
        const customerProfileLink = document.getElementById('nav-customer-profile');
        if (customerProfileLink) {
            customerProfileLink.style.display = 'inline-block';
            customerProfileLink.textContent = `${decodeURIComponent(customerName)} Profile`;
            customerProfileLink.href = `/pages/customer-detail.html?customer=${customerId}`;
        }
        
        // Update header back button
        const backToCustomerBtn = document.getElementById('back-to-customer');
        if (backToCustomerBtn) {
            backToCustomerBtn.style.display = 'inline-block';
            backToCustomerBtn.textContent = `← Back to Customer Profile`;
            backToCustomerBtn.onclick = () => {
                window.location.href = `/pages/customer-detail.html?customer=${customerId}`;
            };
        }
    }

    PM.Session.setupEventListeners = function() {
        // Navigation
        document.getElementById('logout-btn').addEventListener('click', PM.Session.logout);
        
        // Add cabinet
        document.getElementById('add-cabinet-btn').addEventListener('click', () => {
            console.log('DEBUG: Opening add cabinet modal');
            // Set today's date as default
            document.getElementById('cabinet-date').value = new Date().toISOString().split('T')[0];
            PM.UI.openModal('cabinet-modal');
        });

        // Tab switching
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');
                PM.Session.switchTab(tabName);
            });
        });

        // Nodes tab functionality
        document.getElementById('save-nodes-btn').addEventListener('click', PM.Nodes.saveNodesProgress);
        document.getElementById('clear-all-nodes-btn').addEventListener('click', PM.Nodes.clearAllNodes);
        
        // Node tracker functionality
        document.getElementById('save-tracker-btn').addEventListener('click', PM.Nodes.saveNodeTracker);
        document.getElementById('clear-tracker-btn').addEventListener('click', PM.Nodes.clearNodeTracker);
        
        // Diagnostics functionality
        document.getElementById('save-diagnostics-btn').addEventListener('click', PM.Diagnostics.saveDiagnostics);
        document.getElementById('error-form').addEventListener('submit', PM.Diagnostics.saveChannelError);
        
        // Cabinet form submission
        document.getElementById('cabinet-form').addEventListener('submit', PM.Cabinets.addCabinet);
        
        // Location form submission
        document.getElementById('location-form').addEventListener('submit', PM.Cabinets.addLocation);
        
        // PM Notes functionality
        const savePMNotesBtn = document.getElementById('save-pm-notes-btn');
        if (savePMNotesBtn) {
            savePMNotesBtn.addEventListener('click', PM.Notes.savePMNotes);
        }
        
        // Cabinet search and filter
        document.getElementById('search-cabinets').addEventListener('input', PM.Cabinets.filterCabinets);
        document.getElementById('clear-cabinet-search').addEventListener('click', PM.Cabinets.clearCabinetSearch);
        document.getElementById('sort-cabinets').addEventListener('change', PM.Cabinets.sortCabinets);
        
        // Location management
        document.getElementById('add-location-btn').addEventListener('click', () => PM.UI.openModal('location-modal'));
        
        // Node filter
        document.getElementById('node-filter-btn').addEventListener('click', PM.Nodes.showNodeFilterModal);
        
        // Export all PDFs
        document.getElementById('export-all-pdfs-btn').addEventListener('click', PM.Session.exportAllPDFs);
        
        // Modal close buttons
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                PM.UI.closeModal(modal.id);
            });
        });
        
        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                PM.UI.closeModal(e.target.id);
            }
        });
        
        // Controller bulk actions
        document.getElementById('select-all-controllers-dv').addEventListener('click', () => PM.Nodes.toggleControllerCheckboxes('hf_updated'));
        document.getElementById('select-all-controllers-redundancy').addEventListener('click', () => PM.Nodes.toggleControllerCheckboxes('redundancy'));
        document.getElementById('select-all-controllers-restart').addEventListener('click', () => PM.Nodes.toggleControllerCheckboxes('cold_restart'));
        document.getElementById('select-all-controllers-errors').addEventListener('click', () => PM.Nodes.toggleControllerCheckboxes('no_errors'));
        
        // Computer bulk actions
        document.getElementById('select-all-computers-dv').addEventListener('click', () => PM.Nodes.toggleComputerCheckboxes('dv'));
        document.getElementById('select-all-computers-os').addEventListener('click', () => PM.Nodes.toggleComputerCheckboxes('os'));
        document.getElementById('select-all-computers-mcafee').addEventListener('click', () => PM.Nodes.toggleComputerCheckboxes('macafee'));
        document.getElementById('select-all-computers-hdd').addEventListener('click', () => PM.Nodes.toggleComputerCheckboxes('hdd_replaced'));
        
        // Switches bulk actions
        document.getElementById('select-all-switches-firmware').addEventListener('click', () => PM.Nodes.toggleSwitchesCheckboxes('firmware_updated'));
        
        // Equipment filtering
        document.getElementById('node-search').addEventListener('input', PM.Nodes.filterNodes);
    }

    PM.Session.load = async function() {
        try {
            console.log('DEBUG: Loading session with ID:', currentSessionId);
            
            // Check session status first
            await PM.Session.checkSessionStatus();
            
            const response = await fetch(`/api/sessions/${currentSessionId}`);
            console.log('DEBUG: Response status:', response.status);
            
            if (!response.ok) {
                throw new Error('Session not found');
            }
            
            sessionData = await response.json();
            console.log('DEBUG: Session data loaded:', sessionData);
            console.log('DEBUG: Cabinet data:', sessionData.cabinets);
            console.log('DEBUG: Location data:', sessionData.locations);
            
            // Redirect I&I sessions to the I&I overview page
            if (sessionData.session_type === 'ii') {
                console.log('DEBUG: Redirecting to I&I session overview');
                window.location.href = `/pages/ii-session-overview.html?id=${currentSessionId}`;
                return;
            }
            
            // Update page title and info
            document.getElementById('session-title').textContent = sessionData.session_name;
            document.getElementById('session-info').textContent = 
                `Customer: ${sessionData.customer_name} | Location: ${sessionData.location || 'Not specified'}`;
            
            // Setup customer navigation using session data
            if (sessionData.customer_id && sessionData.customer_name) {
                PM.Session.setupCustomerNavigation(sessionData.customer_id, sessionData.customer_name);
            }
            
            // Load cabinets
            PM.Cabinets.loadCabinets();
            
        } catch (error) {
            console.error('DEBUG: Error loading session:', error);
            PM.UI.showMessage('Error loading session: ' + error.message, 'error');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 2000);
        }
    }

    PM.Session.checkSessionStatus = async function() {
        try {
            const response = await fetch(`/api/sessions/${currentSessionId}/status`);
            if (response.ok) {
                const statusData = await response.json();
                isSessionCompleted = statusData.isCompleted;
                
                if (isSessionCompleted) {
                    PM.Session.enableViewOnlyMode();
                }
            }
        } catch (error) {
            console.error('Error checking session status:', error);
        }
    }

    PM.Session.enableViewOnlyMode = function() {
        // Add visual indicator
        const header = document.querySelector('.page-header');
        if (header) {
            const indicator = document.createElement('div');
            indicator.className = 'view-only-banner';
            indicator.innerHTML = `
                <div class="alert alert-info">
                    <strong>📋 View Only Mode</strong> - This PM session has been completed and cannot be modified.
                </div>
            `;
            header.appendChild(indicator);
        }
        
        // Disable all interactive elements
        PM.Session.disableInteractiveElements();
    }

    PM.Session.disableInteractiveElements = function() {
        // Disable all buttons except navigation, export, and nodes tab
        const buttonsToDisable = document.querySelectorAll('button:not([data-keep-enabled])');
        buttonsToDisable.forEach(btn => {
            if (!btn.textContent.includes('Back') && 
                !btn.textContent.includes('Dashboard') && 
                !btn.textContent.includes('Export') &&
                !btn.textContent.includes('PDF') &&
                !btn.textContent.includes('Nodes Maintenance') &&
                !btn.getAttribute('data-tab')) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
        });
        
        // Disable form inputs in cabinets tab only, not in nodes maintenance
        const cabinetInputs = document.querySelectorAll('#cabinets-tab input, #cabinets-tab select, #cabinets-tab textarea');
        cabinetInputs.forEach(input => {
            input.disabled = true;
            input.style.opacity = '0.5';
        });
        
        // Disable nodes maintenance editing buttons but keep inputs visible (read-only)
        const nodesSaveBtn = document.getElementById('save-nodes-btn');
        const nodesClearBtn = document.getElementById('clear-all-nodes-btn');
        if (nodesSaveBtn) {
            nodesSaveBtn.disabled = true;
            nodesSaveBtn.style.opacity = '0.5';
            nodesSaveBtn.style.cursor = 'not-allowed';
        }
        if (nodesClearBtn) {
            nodesClearBtn.disabled = true;
            nodesClearBtn.style.opacity = '0.5';
            nodesClearBtn.style.cursor = 'not-allowed';
        }
        
        // Make nodes maintenance inputs read-only instead of disabled
        const nodesInputs = document.querySelectorAll('#nodes-tab input, #nodes-tab select');
        nodesInputs.forEach(input => {
            input.readOnly = true;
            input.style.backgroundColor = '#f9f9f9';
            input.style.cursor = 'default';
            // Remove event listeners to prevent changes
            input.onclick = null;
            input.onchange = null;
        });
        
        // Disable add cabinet button specifically
        const addCabinetBtn = document.getElementById('add-cabinet-btn');
        if (addCabinetBtn) {
            addCabinetBtn.disabled = true;
            addCabinetBtn.style.display = 'none';
        }
    }

    PM.Session.logout = async function() {
        try {
            const response = await fetch('/logout', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                window.location.href = '/';
            }
        } catch (error) {
            window.location.href = '/';
        }
    }

    PM.Session.switchTab = function(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Load data for the active tab
        if (tabName === 'nodes') {
            PM.Nodes.loadNodes();
        } else if (tabName === 'node-tracker') {
            PM.Nodes.loadNodeTracker();
        } else if (tabName === 'diagnostics') {
            PM.Diagnostics.loadDiagnostics();
        }
    }

    PM.Session.exportAllPDFs = async function() {
        if (!sessionData) {
            PM.UI.showMessage('Session data not loaded', 'error');
            return;
        }
        
        try {
            PM.UI.showMessage('Generating PDF report...', 'info');
            
            // Prepare filter data
            const filterData = {
                nodeFilterMode: nodeFilterMode,
                selectedNodeIds: Array.from(selectedNodes)
            };
            
            const response = await fetch(`/api/sessions/${currentSessionId}/export-pdfs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(filterData)
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `${sessionData.session_name.replace(/[^a-zA-Z0-9]/g, '-')}-Complete-PM-Report.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                PM.UI.showMessage('PDF report generated successfully', 'success');
            } else {
                PM.UI.showMessage('Error generating PDF report', 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            PM.UI.showMessage('Error generating PDF report', 'error');
        }
    }

    console.log('✅ PM.Session module loaded (9 functions)');

})();

