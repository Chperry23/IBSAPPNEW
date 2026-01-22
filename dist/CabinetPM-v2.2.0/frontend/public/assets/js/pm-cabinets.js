/**
 * PM.Cabinets Module - Cabinet Management
 * 
 * Handles all cabinet-related functionality including:
 * - Cabinet CRUD operations
 * - Location management
 * - Drag & drop functionality
 * - Cabinet assignment modal
 * - Search and filtering
 * - Carousel navigation
 * - Cabinet summary generation
 * 
 * Dependencies: PM.UI, PM.Session (for reload)
 * Load Order: 4th (after pm-namespace.js, pm-ui.js, pm-notes.js)
 * 
 * Global Variables Used:
 * - currentSessionId
 * - sessionData
 * - isSessionCompleted
 */

(function() {
    'use strict';

    // Create module logger
    const logger = PM.createLogger('Cabinets');

    // Load Cabinets - Main function to display all cabinets grouped by location
    PM.Cabinets.loadCabinets = function() {
        logger.debug('loadCabinets called');
        logger.debug('sessionData', sessionData);
        
        const cabinetsGrid = document.getElementById('cabinets-grid');
        const noCabinets = document.getElementById('no-cabinets');
        
        console.log('DEBUG: cabinetsGrid element:', cabinetsGrid);
        console.log('DEBUG: noCabinets element:', noCabinets);
        
        if (!cabinetsGrid) {
            console.error('DEBUG: cabinets-grid element not found!');
            return;
        }
        
        cabinetsGrid.innerHTML = '';
        
        // Always create location containers for all locations (even empty ones)
        const cabinetsByLocation = {};
        const unassignedCabinets = [];
        
        // Initialize all locations from sessionData.locations
        if (sessionData.locations && sessionData.locations.length > 0) {
            sessionData.locations.forEach(location => {
                cabinetsByLocation[location.id] = {
                    name: location.location_name,
                    cabinets: []
                };
            });
        }
        
        // Group cabinets by location
        if (sessionData.cabinets && sessionData.cabinets.length > 0) {
            sessionData.cabinets.forEach(cabinet => {
                if (cabinet.location_id && cabinet.location_name) {
                    if (!cabinetsByLocation[cabinet.location_id]) {
                        cabinetsByLocation[cabinet.location_id] = {
                            name: cabinet.location_name,
                            cabinets: []
                        };
                    }
                    cabinetsByLocation[cabinet.location_id].cabinets.push(cabinet);
                } else {
                    unassignedCabinets.push(cabinet);
                }
            });
        }
        
        // Add unassigned cabinets container FIRST (only if not empty)
        if (unassignedCabinets.length > 0) {
            const unassignedContainer = PM.Cabinets.createLocationContainer(null, 'Unassigned Cabinets', unassignedCabinets);
            cabinetsGrid.appendChild(unassignedContainer);
        }
        
        // Create location containers (including empty ones) - sorted by name
        const sortedLocationIds = Object.keys(cabinetsByLocation).sort((a, b) => {
            const nameA = cabinetsByLocation[a].name.toLowerCase();
            const nameB = cabinetsByLocation[b].name.toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        sortedLocationIds.forEach(locationId => {
            const locationData = cabinetsByLocation[locationId];
            const locationContainer = PM.Cabinets.createLocationContainer(locationId, locationData.name, locationData.cabinets);
            cabinetsGrid.appendChild(locationContainer);
        });
        
        // Update location dropdown in add cabinet modal
        PM.Cabinets.updateLocationDropdown();
        
        // Show/hide no cabinets message
        const totalCabinets = (sessionData.cabinets && sessionData.cabinets.length) || 0;
        const hasLocations = (sessionData.locations && sessionData.locations.length > 0) || totalCabinets > 0;
        
        if (totalCabinets === 0 && !hasLocations) {
            noCabinets.classList.remove('hidden');
        } else {
            noCabinets.classList.add('hidden');
        }
    }

    // Create Location Container - Renders a location section with its cabinets
    PM.Cabinets.createLocationContainer = function(locationId, locationName, cabinets) {
        const container = document.createElement('div');
        container.className = 'location-container mb-6';
        
        const header = document.createElement('div');
        header.className = 'location-header bg-blue-50 border border-blue-200 rounded-t-lg p-4 cursor-pointer flex justify-between items-center drop-zone';
        // Collapse functionality is now handled by the inner div to avoid conflicts with drag/drop
        header.dataset.locationId = locationId || '';
        
        // Drag and drop removed - now only available through Cabinet Assignment modal
        
        // Check stored collapse state, default collapsed (except for unassigned)
        const locationKey = locationId || 'unassigned';
        const isCollapsed = PM.Cabinets.locationCollapseStates.hasOwnProperty(locationKey) 
            ? PM.Cabinets.locationCollapseStates[locationKey] 
            : locationId !== null; // Unassigned starts expanded, others collapsed
        
        header.innerHTML = `
            <div class="flex items-center gap-3" onclick="event.stopPropagation(); PM.Cabinets.toggleLocationCollapse('${locationId}')">
                <span class="collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
                <h3 class="text-lg font-semibold text-blue-900">${locationName}</h3>
                <span class="badge badge-info">${cabinets.length} cabinet${cabinets.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="flex gap-2">
                ${locationId ? `<button onclick="event.stopPropagation(); PM.Cabinets.deleteLocation('${locationId}')" class="btn btn-danger btn-sm">🗑️ Delete Location</button>` : ''}
            </div>
        `;
        
        const content = document.createElement('div');
        content.className = 'location-content border-l border-r border-b border-blue-200 rounded-b-lg p-4 drop-zone';
        content.id = `location-content-${locationId || 'unassigned'}`;
        content.dataset.locationId = locationId || '';
        content.style.display = isCollapsed ? 'none' : 'block';
        
        // Drag and drop removed - now only available through Cabinet Assignment modal
        
        // Create carousel instead of grid for better space usage
        const carousel = document.createElement('div');
        carousel.className = 'cabinet-carousel';
        carousel.innerHTML = `
            <div class="carousel-navigation carousel-nav-left" onclick="PM.Cabinets.scrollCarousel('${locationId || 'unassigned'}', 'left')">‹</div>
            <div class="carousel-navigation carousel-nav-right" onclick="PM.Cabinets.scrollCarousel('${locationId || 'unassigned'}', 'right')">›</div>
            <div class="cabinet-carousel-container" id="carousel-${locationId || 'unassigned'}"></div>
        `;
        
        const carouselContainer = carousel.querySelector('.cabinet-carousel-container');
        
        // Add empty state message for locations
        if (cabinets.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-location-message text-center py-8 text-gray-500';
            emptyMessage.innerHTML = `
                <div class="text-4xl mb-2">📦</div>
                <p>No cabinets in this location</p>
                <p class="text-sm">Drag cabinets here to assign them</p>
            `;
            content.appendChild(emptyMessage);
        } else {
            cabinets.forEach(cabinet => {
                const cabinetCard = document.createElement('div');
                cabinetCard.className = 'cabinet-carousel-card';
                cabinetCard.dataset.cabinetId = cabinet.id;
                cabinetCard.dataset.currentLocationId = locationId || '';
                cabinetCard.onclick = () => PM.Cabinets.openCabinet(cabinet.id);
                
                // Drag functionality removed - use Cabinet Assignment modal instead
                
                // Generate cabinet summary info
                const cabinetSummary = PM.Cabinets.generateCabinetSummary(cabinet);
                
                cabinetCard.innerHTML = `
                    <div class="cabinet-card-content">
                        <div class="cabinet-card-header">
                            <h4 class="cabinet-name">${cabinet.cabinet_name}</h4>
                            <button onclick="event.stopPropagation(); PM.Cabinets.deleteCabinet('${cabinet.id}')" class="action-btn delete-btn" title="Delete cabinet">🗑️</button>
                        </div>
                        <div class="cabinet-card-body">
                            <div class="cabinet-info">
                                ${cabinetSummary.hasFlags ? `<div class="cabinet-alerts">${cabinetSummary.flags.join(' ')}</div>` : ''}
                                <div class="cabinet-stats">
                                    <div class="stat-item">
                                        <span class="stat-icon">🎛️</span>
                                        <span class="stat-text">${cabinetSummary.controllers} Controllers</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-icon">⚡</span>
                                        <span class="stat-text">${cabinetSummary.powerSupplies} Power Supplies</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-icon">🔌</span>
                                        <span class="stat-text">${cabinetSummary.networkEquipment} Network</span>
                                    </div>
                                </div>
                                <div class="cabinet-inspection">
                                    <div class="inspection-status ${cabinetSummary.inspectionStatus}">
                                        <span class="inspection-icon">${cabinetSummary.inspectionIcon}</span>
                                        <span class="inspection-text">${cabinetSummary.inspectionText}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                carouselContainer.appendChild(cabinetCard);
            });
        }
        
        if (cabinets.length > 0) {
            content.appendChild(carousel);
        }
        
        container.appendChild(header);
        container.appendChild(content);
        
        return container;
    }

    // Store collapse states
    PM.Cabinets.locationCollapseStates = {};

    // Toggle Location Collapse/Expand
    PM.Cabinets.toggleLocationCollapse = function(locationId) {
        const contentId = `location-content-${locationId || 'unassigned'}`;
        const content = document.getElementById(contentId);
        const icon = content.previousElementSibling.querySelector('.collapse-icon');
        
        const isCurrentlyCollapsed = content.style.display === 'none';
        
        if (isCurrentlyCollapsed) {
            content.style.display = 'block';
            icon.textContent = '▼';
            PM.Cabinets.locationCollapseStates[locationId || 'unassigned'] = false;
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
            PM.Cabinets.locationCollapseStates[locationId || 'unassigned'] = true;
        }
    }

    // Update Location Dropdown in Add Cabinet Modal
    PM.Cabinets.updateLocationDropdown = function() {
        const dropdown = document.getElementById('cabinet-location-assignment');
        dropdown.innerHTML = '<option value="">No Location</option>';
        
        if (sessionData.locations) {
            sessionData.locations.forEach(location => {
                const option = document.createElement('option');
                option.value = location.id;
                option.textContent = location.location_name;
                dropdown.appendChild(option);
            });
        }
    }

    // Add Cabinet - Create new cabinet
    PM.Cabinets.addCabinet = async function(e) {
        e.preventDefault();
        logger.info('Add cabinet form submitted');
        
        if (isSessionCompleted) {
            logger.warn('Cannot add cabinet - session is completed');
            PM.UI.showMessage('Cannot add cabinet - PM session is completed', 'error');
            return;
        }
        
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        data.pm_session_id = currentSessionId;
        
        // Handle location assignment
        if (data.location_id === '') {
            delete data.location_id;
        }
        
        logger.debug('Cabinet data to submit', data);
        logger.debug('Current session ID', currentSessionId);

        try {
            logger.api('POST', '/api/cabinets', data);
            
            const response = await fetch('/api/cabinets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            logger.debug('Response status', response.status);
            
            // Check if response is OK
            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`HTTP ${response.status}: ${response.statusText}`, errorText);
                PM.UI.playErrorSound();
                PM.UI.showMessage(`Server error: ${response.statusText}`, 'error');
                return;
            }

            const result = await response.json();
            logger.debug('Add cabinet response', result);

            if (result.success) {
                logger.success('Cabinet added successfully', { id: result.cabinet.id });
                PM.UI.closeModal('cabinet-modal');
                
                // Reload session to get updated cabinets
                logger.info('Reloading session data');
                await PM.Session.load();
                
                PM.UI.playSuccessSound();
                PM.UI.showMessage('Cabinet added successfully', 'success');
                e.target.reset();
            } else {
                logger.error('Failed to add cabinet', result.error);
                PM.UI.playErrorSound();
                PM.UI.showMessage(result.error || 'Error adding cabinet', 'error');
            }
        } catch (error) {
            logger.error('Network error adding cabinet', error);
            PM.UI.showMessage('Network error. Please try again.', 'error');
            PM.UI.playErrorSound();
        }
    }

    // Open Cabinet - Navigate to cabinet detail page
    PM.Cabinets.openCabinet = function(cabinetId) {
        window.location.href = `/pages/cabinet.html?session=${currentSessionId}&cabinet=${cabinetId}`;
    }

    // Delete Cabinet
    PM.Cabinets.deleteCabinet = async function(cabinetId) {
        if (isSessionCompleted) {
            PM.UI.showMessage('Cannot delete cabinet - PM session is completed', 'error');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this cabinet? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/cabinets/${cabinetId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                PM.UI.playSuccessSound();
                PM.UI.showMessage('Cabinet deleted successfully', 'success');
                // Reload session to get updated cabinets
                PM.Session.load();
            } else {
                PM.UI.showMessage(result.error || 'Error deleting cabinet', 'error');
            }
        } catch (error) {
            console.error('Error deleting cabinet:', error);
            PM.UI.showMessage('Network error. Please try again.', 'error');
        }
    }

    // Add Location
    PM.Cabinets.addLocation = async function(e) {
        e.preventDefault();
        
        if (isSessionCompleted) {
            PM.UI.showMessage('Cannot add location - PM session is completed', 'error');
            return;
        }
        
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        
        try {
            const response = await fetch(`/api/sessions/${currentSessionId}/locations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                PM.UI.closeModal('location-modal');
                PM.Session.load(); // Reload to get updated locations
                PM.UI.showMessage('Location added successfully', 'success');
                e.target.reset();
            } else {
                PM.UI.showMessage(result.error || 'Error adding location', 'error');
            }
        } catch (error) {
            console.error('Error adding location:', error);
            PM.UI.showMessage('Network error. Please try again.', 'error');
        }
    }

    // Delete Location
    PM.Cabinets.deleteLocation = async function(locationId) {
        if (isSessionCompleted) {
            PM.UI.showMessage('Cannot delete location - PM session is completed', 'error');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this location? Cabinets will be moved to unassigned.')) {
            return;
        }

        try {
            const response = await fetch(`/api/locations/${locationId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                PM.UI.showMessage('Location deleted successfully', 'success');
                PM.Session.load(); // Reload to get updated data
            } else {
                PM.UI.showMessage(result.error || 'Error deleting location', 'error');
            }
        } catch (error) {
            console.error('Error deleting location:', error);
            PM.UI.showMessage('Network error. Please try again.', 'error');
        }
    }

    // Filter Cabinets - Search functionality
    PM.Cabinets.filterCabinets = function() {
        const searchTerm = document.getElementById('search-cabinets').value.toLowerCase();
        const locationContainers = document.querySelectorAll('.location-container');
        let totalVisibleCabinets = 0;
        
        locationContainers.forEach(container => {
            const cabinetCards = container.querySelectorAll('.draggable-cabinet');
            let visibleCabinetsInLocation = 0;
            
            cabinetCards.forEach(card => {
                const cabinetName = card.querySelector('h4').textContent.toLowerCase();
                const cardContent = card.textContent.toLowerCase();
                
                if (cabinetName.includes(searchTerm) || cardContent.includes(searchTerm)) {
                    card.style.display = 'block';
                    visibleCabinetsInLocation++;
                    totalVisibleCabinets++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Show/hide location container based on visible cabinets
            if (visibleCabinetsInLocation > 0 || !searchTerm) {
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
            
            // Update location cabinet count
            const badge = container.querySelector('.badge-info');
            if (badge && searchTerm) {
                badge.textContent = `${visibleCabinetsInLocation} cabinet${visibleCabinetsInLocation !== 1 ? 's' : ''}`;
            }
        });
        
        // Show/hide no results message
        const noCabinets = document.getElementById('no-cabinets');
        const cabinetsGrid = document.getElementById('cabinets-grid');
        
        if (totalVisibleCabinets === 0 && searchTerm) {
            noCabinets.classList.remove('hidden');
            noCabinets.innerHTML = `<div class="text-center py-8">
                <div class="text-4xl mb-2">🔍</div>
                <p class="text-gray-600">No cabinets found matching "${searchTerm}"</p>
                <p class="text-sm text-gray-500">Try adjusting your search terms</p>
            </div>`;
        } else if (totalVisibleCabinets === 0) {
            noCabinets.classList.remove('hidden');
            noCabinets.innerHTML = 'No cabinets found. Add your first cabinet to get started.';
        } else {
            noCabinets.classList.add('hidden');
        }
    }

    // Clear Cabinet Search
    PM.Cabinets.clearCabinetSearch = function() {
        document.getElementById('search-cabinets').value = '';
        document.getElementById('sort-cabinets').value = 'location';
        
        // Reset all cabinet and location visibility
        const locationContainers = document.querySelectorAll('.location-container');
        locationContainers.forEach(container => {
            container.style.display = 'block';
            const cabinetCards = container.querySelectorAll('.draggable-cabinet');
            cabinetCards.forEach(card => {
                card.style.display = 'block';
            });
            
            // Reset location cabinet count
            const badge = container.querySelector('.badge-info');
            if (badge) {
                const totalCabinets = cabinetCards.length;
                badge.textContent = `${totalCabinets} cabinet${totalCabinets !== 1 ? 's' : ''}`;
            }
        });
        
        PM.Cabinets.filterCabinets();
        PM.Cabinets.sortCabinets();
    }

    // Sort Cabinets
    PM.Cabinets.sortCabinets = function() {
        const sortBy = document.getElementById('sort-cabinets').value;
        const cabinetsGrid = document.getElementById('cabinets-grid');
        const cabinetCards = Array.from(cabinetsGrid.querySelectorAll('.card'));
        
        cabinetCards.sort((a, b) => {
            let aValue, bValue;
            
            switch (sortBy) {
                case 'location':
                    aValue = a.querySelector('h3').textContent.toLowerCase();
                    bValue = b.querySelector('h3').textContent.toLowerCase();
                    break;
                case 'date':
                    aValue = a.querySelector('.card-body').textContent.match(/Date: (.+)/)?.[1] || '';
                    bValue = b.querySelector('.card-body').textContent.match(/Date: (.+)/)?.[1] || '';
                    break;
                case 'created':
                    aValue = a.querySelector('.card-body').textContent.match(/Created: (.+)/)?.[1] || '';
                    bValue = b.querySelector('.card-body').textContent.match(/Created: (.+)/)?.[1] || '';
                    break;
                case 'status':
                    aValue = a.querySelector('.badge').textContent.toLowerCase();
                    bValue = b.querySelector('.badge').textContent.toLowerCase();
                    break;
                default:
                    return 0;
            }
            
            return aValue.localeCompare(bValue);
        });
        
        // Re-append sorted cards
        cabinetCards.forEach(card => cabinetsGrid.appendChild(card));
    }

    // Drag and Drop Handlers
    PM.Cabinets.handleDragStart = function(e) {
        e.dataTransfer.setData('application/json', JSON.stringify({
            cabinetId: e.target.dataset.cabinetId,
            currentLocationId: e.target.dataset.currentLocationId
        }));
        e.target.classList.add('dragging');
    }

    PM.Cabinets.handleDragEnd = function(e) {
        e.target.classList.remove('dragging');
    }

    PM.Cabinets.handleDragOver = function(e) {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
        e.target.classList.add('drag-over');
    }

    PM.Cabinets.handleDragEnter = function(e) {
        e.target.classList.add('drag-over');
    }

    PM.Cabinets.handleDragLeave = function(e) {
        e.target.classList.remove('drag-over');
    }

    // Generate Cabinet Summary - Creates summary info for cabinet cards
    PM.Cabinets.generateCabinetSummary = function(cabinet) {
        console.log('DEBUG: Generating summary for cabinet:', cabinet);
        
        const summary = {
            controllers: 0,
            powerSupplies: 0,
            networkEquipment: 0,
            flags: [],
            hasFlags: false,
            inspectionStatus: 'pending',
            inspectionIcon: '⏳',
            inspectionText: 'Not inspected'
        };

        // Count components - data is already parsed from server
        if (cabinet.controllers && Array.isArray(cabinet.controllers)) {
            summary.controllers = cabinet.controllers.length;
        }

        if (cabinet.power_supplies && Array.isArray(cabinet.power_supplies)) {
            summary.powerSupplies = cabinet.power_supplies.length;
        }

        if (cabinet.network_equipment && Array.isArray(cabinet.network_equipment)) {
            summary.networkEquipment = cabinet.network_equipment.length;
        }

        // Check component statuses for failures
        let componentIssues = [];
        
        // Check power supplies
        if (cabinet.power_supplies && Array.isArray(cabinet.power_supplies)) {
            cabinet.power_supplies.forEach(ps => {
                if (ps.status && ps.status.toLowerCase() === 'fail') {
                    componentIssues.push('⚡');
                }
            });
        }
        
        // Check distribution blocks  
        if (cabinet.distribution_blocks && Array.isArray(cabinet.distribution_blocks)) {
            cabinet.distribution_blocks.forEach(db => {
                if (db.status && db.status.toLowerCase() === 'fail') {
                    componentIssues.push('🔌');
                }
            });
        }
        
        // Check diodes
        if (cabinet.diodes && Array.isArray(cabinet.diodes)) {
            cabinet.diodes.forEach(diode => {
                if (diode.status && diode.status.toLowerCase() === 'fail') {
                    componentIssues.push('🔆');
                }
            });
        }
        
        // Check network equipment
        if (cabinet.network_equipment && Array.isArray(cabinet.network_equipment)) {
            cabinet.network_equipment.forEach(net => {
                if (net.status && net.status.toLowerCase() === 'fail') {
                    componentIssues.push('🌐');
                }
            });
        }

        // Check inspection data for issues - use 'inspection' field (already parsed)
        const inspection = cabinet.inspection || {};
        let hasInspectionIssues = false;
        let allInspected = false;
        let inspectedCount = 0;
        const totalItems = 8; // Number of inspection items

        // Check each inspection item
        const inspectionItems = {
            'cabinet_fans': '🌀',
            'controller_leds': '💡',
            'io_status': '🔌',
            'network_status': '🌐',
            'temperatures': '🌡️',
            'is_clean': '🧹',
            'clean_filter_installed': '🔧',
            'ground_inspection': '⚡'
        };

        for (const [key, icon] of Object.entries(inspectionItems)) {
            if (inspection[key]) {
                inspectedCount++;
                if (inspection[key] === 'fail') {
                    hasInspectionIssues = true;
                    summary.flags.push(`${icon}`);
                }
            }
        }
        
        // Add component failure flags
        componentIssues.forEach(flag => {
            if (!summary.flags.includes(flag)) {
                summary.flags.push(flag);
            }
        });
        
        const hasIssues = hasInspectionIssues || componentIssues.length > 0;

        allInspected = inspectedCount === totalItems;

        // Set status based on both component failures and inspection results
        if (hasIssues) {
            summary.inspectionStatus = 'fail';
            summary.inspectionIcon = '❌';
            if (componentIssues.length > 0 && hasInspectionIssues) {
                summary.inspectionText = `${summary.flags.length} issue${summary.flags.length > 1 ? 's' : ''} found`;
            } else if (componentIssues.length > 0) {
                summary.inspectionText = `${componentIssues.length} component failure${componentIssues.length > 1 ? 's' : ''}`;
            } else {
                summary.inspectionText = `${summary.flags.length} inspection issue${summary.flags.length > 1 ? 's' : ''}`;
            }
        } else if (allInspected) {
            summary.inspectionStatus = 'pass';
            summary.inspectionIcon = '✅';
            summary.inspectionText = 'All systems OK';
        } else if (inspectedCount > 0) {
            summary.inspectionStatus = 'warning';
            summary.inspectionIcon = '⚠️';
            summary.inspectionText = `${inspectedCount}/${totalItems} inspected`;
        }

        summary.hasFlags = summary.flags.length > 0;
        
        console.log('DEBUG: Generated summary:', summary);
        return summary;
    }

    // Carousel Scroll Function
    PM.Cabinets.scrollCarousel = function(locationId, direction) {
        const carousel = document.getElementById(`carousel-${locationId}`);
        if (!carousel) return;
        
        const scrollAmount = 300; // pixels to scroll
        const currentScroll = carousel.scrollLeft;
        
        if (direction === 'left') {
            carousel.scrollTo({
                left: currentScroll - scrollAmount,
                behavior: 'smooth'
            });
        } else {
            carousel.scrollTo({
                left: currentScroll + scrollAmount,
                behavior: 'smooth'
            });
        }
    }

    // Cabinet Assignment Modal Functions
    PM.Cabinets.openAssignmentModal = function() {
        PM.Cabinets.loadCabinetAssignmentData();
        document.getElementById('cabinet-assignment-modal').style.display = 'block';
    }

    PM.Cabinets.closeAssignmentModal = function() {
        document.getElementById('cabinet-assignment-modal').style.display = 'none';
    }

    PM.Cabinets.loadCabinetAssignmentData = function() {
        const unassignedList = document.getElementById('unassigned-cabinets-list');
        const locationsList = document.getElementById('locations-list');
        
        // Clear existing content
        unassignedList.innerHTML = '';
        locationsList.innerHTML = '';
        
        // Load unassigned cabinets only
        const unassignedCabinets = sessionData.cabinets ? sessionData.cabinets.filter(cabinet => 
            !cabinet.location_id || cabinet.location_id === ''
        ) : [];
        
        if (unassignedCabinets.length === 0) {
            unassignedList.innerHTML = '<div class="text-center text-gray-500 py-8">All cabinets are assigned</div>';
        } else {
            unassignedCabinets.forEach(cabinet => {
                const cabinetItem = document.createElement('div');
                cabinetItem.className = 'assignment-item';
                cabinetItem.draggable = true;
                cabinetItem.dataset.cabinetId = cabinet.id;
                
                // Add drag event listeners
                cabinetItem.addEventListener('dragstart', PM.Cabinets.handleAssignmentDragStart);
                cabinetItem.addEventListener('dragend', PM.Cabinets.handleAssignmentDragEnd);
                
                cabinetItem.innerHTML = `
                    <div class="assignment-item-name">${cabinet.cabinet_name}</div>
                    <div class="assignment-item-details">
                        Date: ${cabinet.cabinet_date ? new Date(cabinet.cabinet_date).toLocaleDateString() : 'No date'}
                    </div>
                `;
                
                unassignedList.appendChild(cabinetItem);
            });
        }
        
        // Load all locations as drop zones
        if (sessionData.locations) {
            sessionData.locations.forEach(location => {
                const locationZone = document.createElement('div');
                locationZone.className = 'location-drop-zone';
                locationZone.dataset.locationId = location.id;
                
                // Add drop event listeners
                locationZone.addEventListener('dragover', PM.Cabinets.handleLocationDragOver);
                locationZone.addEventListener('dragenter', PM.Cabinets.handleLocationDragEnter);
                locationZone.addEventListener('dragleave', PM.Cabinets.handleLocationDragLeave);
                
                // Find cabinets assigned to this location
                const assignedCabinets = sessionData.cabinets ? sessionData.cabinets.filter(cabinet => 
                    cabinet.location_id === location.id
                ) : [];
                
                locationZone.innerHTML = `
                    <h5>${location.location_name}</h5>
                    <div class="location-cabinets">
                        ${assignedCabinets.map(cabinet => 
                            `<span class="location-cabinet-tag">${cabinet.cabinet_name}</span>`
                        ).join('')}
                        ${assignedCabinets.length === 0 ? '<span class="text-gray-500 text-sm">No cabinets assigned</span>' : ''}
                    </div>
                `;
                
                locationsList.appendChild(locationZone);
            });
        }
    }

    // Assignment Modal Drag and Drop Handlers
    PM.Cabinets.handleAssignmentDragStart = function(e) {
        e.dataTransfer.setData('application/json', JSON.stringify({
            cabinetId: e.target.dataset.cabinetId
        }));
        e.target.classList.add('dragging');
    }

    PM.Cabinets.handleAssignmentDragEnd = function(e) {
        e.target.classList.remove('dragging');
    }

    // Location drop zone handlers
    PM.Cabinets.handleLocationDragOver = function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    PM.Cabinets.handleLocationDragEnter = function(e) {
        const dropZone = e.target.closest('.location-drop-zone');
        if (dropZone) {
            dropZone.classList.add('drag-over');
        }
    }

    PM.Cabinets.handleLocationDragLeave = function(e) {
        const dropZone = e.target.closest('.location-drop-zone');
        if (dropZone && !dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drag-over');
        }
    }

    console.log('✅ PM.Cabinets module loaded (28 functions)');

})();

