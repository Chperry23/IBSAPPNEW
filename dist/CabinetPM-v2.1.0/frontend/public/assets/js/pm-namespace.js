/**
 * PM Namespace Initialization
 * 
 * This file initializes the global PM (Preventive Maintenance) namespace
 * and all sub-namespaces used throughout the application.
 * 
 * Load Order: FIRST (before all other PM modules)
 */

// Initialize PM namespace
window.PM = window.PM || {};

// Initialize sub-namespaces
PM.UI = PM.UI || {};           // UI interactions (modals, messages, sounds)
PM.Session = PM.Session || {}; // Session management and navigation
PM.Cabinets = PM.Cabinets || {}; // Cabinet CRUD and drag & drop
PM.Nodes = PM.Nodes || {};     // Node maintenance and tracking
PM.Diagnostics = PM.Diagnostics || {}; // Diagnostics and error management
PM.Notes = PM.Notes || {};     // PM notes functionality

console.log('✅ PM Namespace initialized');

