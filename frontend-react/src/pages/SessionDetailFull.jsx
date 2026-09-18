import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  Upload,
  Plus,
  Box,
  MapPin,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Columns2,
} from 'lucide-react';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';
import PMNotes from '../components/PMNotes';
import NodeMaintenance from '../components/NodeMaintenance';
import DiagnosticsAdvanced from '../components/DiagnosticsAdvanced';
import SessionLaborTimer from '../components/SessionLaborTimer';

export default function SessionDetailFull() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [cabinets, setCabinets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cabinets');
  const [showNewCabinetModal, setShowNewCabinetModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showNewLocationModal, setShowNewLocationModal] = useState(false);
  const [showAddRackModal, setShowAddRackModal] = useState(false);
  const [isRackType, setIsRackType] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('location');
  const [locations, setLocations] = useState([]);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationDescription, setNewLocationDescription] = useState('');
  const [showAssignLocationModal, setShowAssignLocationModal] = useState(false);
  const [assigningCabinetId, setAssigningCabinetId] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignCabinetIds, setBulkAssignCabinetIds] = useState([]);
  const [bulkAssignLocationId, setBulkAssignLocationId] = useState('');
  const [bulkAssignCabinetFilter, setBulkAssignCabinetFilter] = useState('');
  const [bulkAssignBusy, setBulkAssignBusy] = useState(false);
  const [showManageLocationsModal, setShowManageLocationsModal] = useState(false);
  const [showCompleteSessionModal, setShowCompleteSessionModal] = useState(false);
  const [completeSaveToHistory, setCompleteSaveToHistory] = useState(true);
  const [completionWarnings, setCompletionWarnings] = useState([]);
  const [showDuplicateCabinetModal, setShowDuplicateCabinetModal] = useState(false);
  const [duplicatingCabinetId, setDuplicatingCabinetId] = useState(null);
  const [duplicateCabinetName, setDuplicateCabinetName] = useState('');
  const [duplicatePreserveEquipmentLabels, setDuplicatePreserveEquipmentLabels] = useState(false);
  const [duplicateCabinetCopyCount, setDuplicateCabinetCopyCount] = useState(1);

  useEffect(() => {
    loadSessionData();
  }, [id]);

  const loadSessionData = async () => {
    try {
      // The session endpoint already returns cabinets!
      const sessionData = await api.getSession(id);
      
      // If this is an I&I session, redirect to I&I view
      if (sessionData.session_type === 'ii') {
        navigate(`/ii-session/${id}`);
        return;
      }
      
      setSession(sessionData);
      setCabinets(sessionData.cabinets || []);
      setLocations(sessionData.locations || []);
      
      if (sessionData.customer_id) {
        const customerData = await api.getCustomer(sessionData.customer_id);
        setCustomer(customerData);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      showMessage('Error loading session data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateCabinet = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const entries = Object.fromEntries(formData);
    const data = {
      ...entries,
      pm_session_id: id,
      cabinet_type: 'cabinet',
      location_id: entries.location_id || undefined,
    };

    try {
      const result = await api.createCabinet(data);
      if (result.success) {
        soundSystem.playSuccess();
        setShowNewCabinetModal(false);
        await loadSessionData();
        // Move the newest cabinet (highest id) to the front
        setCabinets(prev => {
          const sorted = [...prev];
          sorted.sort((a, b) => (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));
          return sorted;
        });
        showMessage('Cabinet created successfully', 'success');
        e.target.reset();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error creating cabinet', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error creating cabinet', 'error');
    }
  };

  const handleCreateRack = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const entries = Object.fromEntries(formData);
    const data = {
      ...entries,
      pm_session_id: id,
      cabinet_type: 'rack',
      location_id: entries.location_id || undefined,
    };

    try {
      const result = await api.createCabinet(data);
      if (result.success) {
        soundSystem.playSuccess();
        setShowAddRackModal(false);
        await loadSessionData();
        setCabinets(prev => {
          const sorted = [...prev];
          sorted.sort((a, b) => (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));
          return sorted;
        });
        showMessage('Rack created successfully', 'success');
        e.target.reset();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error creating rack', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error creating rack', 'error');
    }
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    const cabinetList = e.target.cabinet_list.value;
    const cabinetNames = cabinetList
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (cabinetNames.length === 0) {
      showMessage('Please enter at least one cabinet location', 'error');
      return;
    }

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const cabinetName of cabinetNames) {
        try {
          const result = await api.createCabinet({
            pm_session_id: id,
            cabinet_name: cabinetName,
          });
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }

      setShowBulkImportModal(false);
      loadSessionData();

      if (errorCount === 0) {
        soundSystem.playSuccess();
        showMessage(`Successfully imported ${successCount} cabinets`, 'success');
      } else {
        soundSystem.playError();
        showMessage(`Imported ${successCount} cabinets, ${errorCount} failed`, 'info');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error importing cabinets', 'error');
    }
  };

  const handleGeneratePDF = async () => {
    try {
      showMessage('Generating PDF report...', 'info');
      const result = await api.generateSessionPDF(id);
      if (result.success) {
        soundSystem.playSuccess();
        showMessage('PDF downloaded successfully!', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error generating PDF', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error generating PDF', 'error');
    }
  };

  const handleExportAllPDFs = async () => {
    try {
      showMessage('Generating full session report (cabinets + diagnostics + notes)...', 'info');
      const result = await api.generateSessionPDF(id);
      if (result.success) {
        soundSystem.playSuccess();
        showMessage('Full session PDF downloaded!', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Failed to generate PDF', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error generating PDF', 'error');
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocationName.trim()) {
      showMessage('Location name is required', 'error');
      return;
    }

    try {
      const result = await api.request(`/api/sessions/${id}/locations`, {
        method: 'POST',
        body: JSON.stringify({ 
          location_name: newLocationName.trim(),
          description: newLocationDescription.trim()
        }),
      });

      if (result.success) {
        soundSystem.playSuccess();
        setShowNewLocationModal(false);
        setNewLocationName('');
        setNewLocationDescription('');
        loadSessionData();
        showMessage('Location added successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error adding location', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error adding location', 'error');
    }
  };

  const handleAssignCabinetToLocation = async () => {
    if (!assigningCabinetId) return;

    try {
      const result = await api.request(`/api/cabinets/${assigningCabinetId}/assign-location`, {
        method: 'POST',
        body: JSON.stringify({ location_id: selectedLocationId || null }),
      });

      if (result.success) {
        soundSystem.playSuccess();
        setShowAssignLocationModal(false);
        setAssigningCabinetId(null);
        setSelectedLocationId('');
        loadSessionData();
        showMessage('Cabinet assigned to location successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error assigning location', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error assigning location', 'error');
    }
  };

  const openBulkAssignModal = () => {
    setBulkAssignCabinetIds([]);
    setBulkAssignLocationId(locations[0]?.id || '');
    setBulkAssignCabinetFilter('');
    setShowBulkAssignModal(true);
  };

  const toggleBulkCabinet = (cabinetId) => {
    setBulkAssignCabinetIds((prev) =>
      prev.includes(cabinetId) ? prev.filter((id) => id !== cabinetId) : [...prev, cabinetId]
    );
  };

  const handleBulkAssignCabinets = async () => {
    if (!bulkAssignCabinetIds.length) {
      showMessage('Select at least one cabinet on the left', 'error');
      return;
    }
    setBulkAssignBusy(true);
    try {
      const locationId = bulkAssignLocationId || null;
      const results = await Promise.all(
        bulkAssignCabinetIds.map((cabinetId) =>
          api.request(`/api/cabinets/${cabinetId}/assign-location`, {
            method: 'POST',
            body: JSON.stringify({ location_id: locationId }),
          })
        )
      );
      const failed = results.filter((r) => !r?.success);
      if (failed.length) {
        soundSystem.playError();
        showMessage(`Assigned some cabinets; ${failed.length} failed`, 'error');
      } else {
        soundSystem.playSuccess();
        showMessage(
          `Moved ${bulkAssignCabinetIds.length} cabinet${bulkAssignCabinetIds.length !== 1 ? 's' : ''} to ${
            locationId
              ? locations.find((l) => l.id === locationId)?.location_name || 'location'
              : 'Unassigned'
          }`,
          'success'
        );
      }
      setShowBulkAssignModal(false);
      setBulkAssignCabinetIds([]);
      loadSessionData();
    } catch (error) {
      soundSystem.playError();
      showMessage('Error assigning cabinets', 'error');
    } finally {
      setBulkAssignBusy(false);
    }
  };

  const openAssignLocationModal = (cabinetId, currentLocationId) => {
    setAssigningCabinetId(cabinetId);
    setSelectedLocationId(currentLocationId || '');
    setShowAssignLocationModal(true);
  };

  const handleDeleteLocation = async (locationId, locationName) => {
    if (!confirm(`Delete location "${locationName}"? Cabinets in this location will become unassigned.`)) return;

    try {
      const result = await api.request(`/api/locations/${locationId}`, {
        method: 'DELETE',
      });

      if (result.success) {
        soundSystem.playSuccess();
        loadSessionData();
        showMessage('Location deleted successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error deleting location', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error deleting location', 'error');
    }
  };

  const handleDeleteCabinet = async (cabinetId) => {
    if (!confirm('Delete this cabinet? All associated data will be lost.')) {
      return;
    }

    try {
      const result = await api.deleteCabinet(cabinetId);
      if (result.success) {
        loadSessionData();
        showMessage('Cabinet deleted successfully', 'success');
      } else {
        showMessage(result.error || 'Error deleting cabinet', 'error');
      }
    } catch (error) {
      showMessage('Error deleting cabinet', 'error');
    }
  };

  const openDuplicateCabinetModal = (cabinet) => {
    setDuplicatingCabinetId(cabinet.id);
    setDuplicateCabinetName(`${cabinet.cabinet_name} (Copy)`);
    setDuplicatePreserveEquipmentLabels(false);
    setDuplicateCabinetCopyCount(1);
    setShowDuplicateCabinetModal(true);
  };

  const closeDuplicateCabinetModal = () => {
    setShowDuplicateCabinetModal(false);
    setDuplicatingCabinetId(null);
    setDuplicateCabinetName('');
    setDuplicatePreserveEquipmentLabels(false);
    setDuplicateCabinetCopyCount(1);
  };

  const handleDuplicateCabinet = async () => {
    if (!duplicatingCabinetId) return;
    const rawCount = parseInt(String(duplicateCabinetCopyCount), 10);
    let copyCount = Number.isFinite(rawCount) ? rawCount : 1;
    if (copyCount < 1) copyCount = 1;
    if (copyCount > 20) copyCount = 20;
    try {
      const result = await api.request(`/api/cabinets/${duplicatingCabinetId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({
          new_name: duplicateCabinetName.trim(),
          preserve_equipment_labels: duplicatePreserveEquipmentLabels,
          copy_count: copyCount,
        }),
      });
      if (result.success) {
        closeDuplicateCabinetModal();
        loadSessionData();
        const created = Array.isArray(result.cabinets) ? result.cabinets.length : 1;
        showMessage(
          created > 1
            ? `${created} cabinets duplicated successfully`
            : 'Cabinet duplicated successfully',
          'success'
        );
      } else {
        showMessage(result.error || 'Error duplicating cabinet', 'error');
      }
    } catch (error) {
      showMessage('Error duplicating cabinet', 'error');
    }
  };

  const duplicateCabinetNeedsName = duplicateCabinetCopyCount === 1;

  const handleCompleteSession = async () => {
    setCompletionWarnings([]);
    setShowCompleteSessionModal(true);
  };

  useEffect(() => {
    if (!showCompleteSessionModal || !id) return;
    let cancelled = false;
    const check = async () => {
      const warnings = [];
      try {
        const [pmRes, _] = await Promise.all([
          fetch(`/api/sessions/${id}/pm-notes`, { credentials: 'include' }),
          Promise.resolve()
        ]);
        if (pmRes.ok) {
          const pm = await pmRes.json();
          const tasks = Array.isArray(pm?.common_tasks) ? pm.common_tasks : (typeof pm?.common_tasks === 'string' ? (() => { try { return JSON.parse(pm.common_tasks); } catch (_) { return []; } })() : []);
          const hasNotes = (pm?.additional_work_notes?.trim()) || (pm?.troubleshooting_notes?.trim()) || (pm?.recommendations_notes?.trim()) || (Array.isArray(tasks) && tasks.length > 0);
          if (!hasNotes) warnings.push('PM Notes');
        } else warnings.push('PM Notes');
      } catch (_) {
        warnings.push('PM Notes');
      }
      const pendingCabinets = cabinets.filter(c => c.status !== 'completed').length;
      if (cabinets.length > 0 && pendingCabinets > 0) {
        warnings.push(`Cabinets (${pendingCabinets} not marked complete)`);
      }
      if (!cancelled) setCompletionWarnings(warnings);
    };
    check();
    return () => { cancelled = true; };
  }, [showCompleteSessionModal, id, cabinets]);

  const confirmCompleteSession = async () => {
    try {
      const result = await api.completeSession(id, { saveHistory: completeSaveToHistory });
      setShowCompleteSessionModal(false);
      if (result.success) {
        soundSystem.playSuccess();
        loadSessionData();
        showMessage(result.savedToHistory ? 'Session completed and saved to customer history' : 'Session marked as completed', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error completing session', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error completing session', 'error');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner h-12 w-12"></div>
        </div>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-400">Session not found</p>
          <Link to="/sessions" className="btn btn-primary mt-4">
            Back to Sessions
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="breadcrumb">
        {customer && (
          <>
            <Link to="/customers">Customers</Link>
            <span className="mx-2">›</span>
            <Link to={`/customer/${customer.id}`}>{customer.name}</Link>
            <span className="mx-2">›</span>
          </>
        )}
        <Link to="/sessions">PM Sessions</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-200">{session.session_name}</span>
      </div>

      {session.status === 'completed' && (
        <div className="alert alert-success mb-6">
          This session is completed. You can view cabinets, equipment, I/O errors, and PM notes but cannot make changes.
        </div>
      )}

      <div className="page-header !flex-col !items-stretch gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="page-header-text min-w-0">
            <h1 className="page-title break-words">{session.session_name}</h1>
            {customer && (
              <p className="page-subtitle">
                <Link to={`/customer/${customer.id}`} className="hover:text-blue-300">
                  {customer.name}
                </Link>
              </p>
            )}
            <span className={`badge mt-2 ${session.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>
              {(session.status || 'ACTIVE').toUpperCase()}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:shrink-0">
            <button
              type="button"
              onClick={() => navigate('/sessions')}
              className="btn btn-secondary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Sessions
            </button>
            {customer && (
              <button
                type="button"
                onClick={() => navigate(`/customer/${customer.id}`)}
                className="btn btn-secondary"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Customer
              </button>
            )}
            <button
              type="button"
              onClick={handleExportAllPDFs}
              className="btn btn-secondary"
              title="Download full session report"
            >
              <FileText className="h-4 w-4" aria-hidden />
              Report PDF
            </button>
            {session.status !== 'completed' && (
              <button
                type="button"
                onClick={handleCompleteSession}
                className="btn btn-success"
                title="Lock session and create node snapshot"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Complete session
              </button>
            )}
          </div>
        </div>

        {activeTab === 'cabinets' && session.status !== 'completed' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2.5">
            <span className="mr-1 hidden text-xs font-semibold uppercase tracking-wide text-gray-500 sm:inline">
              Cabinets
            </span>
            <button type="button" onClick={() => setShowNewCabinetModal(true)} className="btn btn-primary btn-sm">
              <Plus className="h-4 w-4" aria-hidden />
              Add cabinet
            </button>
            <button type="button" onClick={() => setShowAddRackModal(true)} className="btn btn-primary btn-sm">
              <Box className="h-4 w-4" aria-hidden />
              Add rack
            </button>
            <span className="mx-1 hidden h-5 w-px bg-[var(--border-strong)] sm:block" aria-hidden />
            <button type="button" onClick={() => setShowBulkImportModal(true)} className="btn btn-secondary btn-sm">
              <Upload className="h-4 w-4" aria-hidden />
              Bulk import
            </button>
            <button
              type="button"
              onClick={openBulkAssignModal}
              className="btn btn-secondary btn-sm"
              title="Select cabinets and push them to a location"
            >
              <Columns2 className="h-4 w-4" aria-hidden />
              Assign to location
            </button>
            <button type="button" onClick={() => setShowNewLocationModal(true)} className="btn btn-secondary btn-sm">
              <MapPin className="h-4 w-4" aria-hidden />
              Add location
            </button>
            <button
              type="button"
              onClick={() => setShowManageLocationsModal(true)}
              className="btn btn-secondary btn-sm"
              title="Delete or review locations"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Manage locations
            </button>
            {cabinets.some((c) => c.status !== 'completed') && (
              <>
                <span className="mx-1 hidden h-5 w-px bg-[var(--border-strong)] sm:block" aria-hidden />
                <button
                  type="button"
                  onClick={async () => {
                    const pending = cabinets.filter((c) => c.status !== 'completed').length;
                    if (!confirm(`Mark all ${pending} pending cabinet${pending !== 1 ? 's' : ''} as complete?`)) return;
                    try {
                      const result = await api.bulkCompleteCabinets(id);
                      if (result.success) {
                        soundSystem.playSuccess();
                        loadSessionData();
                        showMessage(
                          `${result.count} cabinet${result.count !== 1 ? 's' : ''} marked complete`,
                          'success'
                        );
                      } else {
                        soundSystem.playError();
                        showMessage(result.error || 'Error completing cabinets', 'error');
                      }
                    } catch {
                      soundSystem.playError();
                      showMessage('Error completing cabinets', 'error');
                    }
                  }}
                  className="btn btn-secondary btn-sm"
                  title="Mark all pending cabinets as complete at once"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Mark all complete
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === 'cabinets' && session.status === 'completed' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2.5">
            <span className="text-xs text-gray-500">Session locked — cabinets are view-only.</span>
          </div>
        )}

        <SessionLaborTimer
          session={session}
          disabled={session.status === 'completed'}
          showMessage={showMessage}
          onUpdated={(updated) => {
            if (!updated) return;
            setSession((prev) => ({ ...prev, ...updated }));
          }}
        />
      </div>

      {showCompleteSessionModal && (
        <div className="modal-backdrop">
          <div className="modal-panel max-w-md w-full p-6">
            <h3 className="mb-2 text-lg font-semibold text-gray-100">Complete PM session</h3>
            <p className="mb-4 text-sm text-gray-300">
              Mark &quot;{session.session_name}&quot; as completed? This will lock the session and create a snapshot of nodes.
            </p>
            {completionWarnings.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-600 bg-amber-900/30 p-3 text-sm text-amber-200">
                <p className="mb-1 font-medium">You didn&apos;t fill out: {completionWarnings.join(', ')}.</p>
                <p className="text-xs text-amber-200/90">Are you sure you want to continue?</p>
              </div>
            )}
            <div className="mb-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
              <p className="mb-3 text-xs text-gray-400">
                <strong className="text-gray-300">Optional:</strong> Save this session&apos;s metrics to customer history for trends.
              </p>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={completeSaveToHistory}
                  onChange={(e) => setCompleteSaveToHistory(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-500"
                />
                <span className="text-sm text-gray-200">Save to customer history</span>
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCompleteSessionModal(false);
                  setCompletionWarnings([]);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="button" onClick={confirmCompleteSession} className="btn btn-success">
                {completionWarnings.length > 0 ? 'Continue anyway' : 'Complete session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`alert ${
            message.type === 'success' ? 'alert-success' : message.type === 'error' ? 'alert-error' : 'alert-info'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="stats-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl font-bold text-white">{cabinets.length}</div>
              <div className="mt-1 text-sm text-gray-400">Total cabinets</div>
            </div>
            <div className="rounded-lg bg-blue-600/15 p-2 text-blue-400">
              <Box className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl font-bold text-white">
                {cabinets.filter((c) => c.status === 'completed').length}
              </div>
              <div className="mt-1 text-sm text-gray-400">Completed</div>
            </div>
            <div className="rounded-lg bg-blue-600/15 p-2 text-blue-400">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl font-bold text-white">
                {cabinets.filter((c) => c.status !== 'completed').length}
              </div>
              <div className="mt-1 text-sm text-gray-400">Pending</div>
            </div>
            <div className="rounded-lg bg-blue-600/15 p-2 text-blue-400">
              <Clock className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </div>
        <div className="stats-card" title="Controllers/CIOCs assigned to cabinets in this session">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl font-bold text-white">
                {session.controllerAssignmentStats
                  ? `${session.controllerAssignmentStats.assigned} / ${session.controllerAssignmentStats.total}`
                  : '—'}
              </div>
              <div className="mt-1 text-sm text-gray-400">Controllers assigned</div>
            </div>
            <div className="rounded-lg bg-blue-600/15 p-2 text-blue-400">
              <Cpu className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </div>
      </div>

      {session.status !== 'completed' && cabinets.length > 0 && (
        <div className="mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-4 py-3 text-sm text-gray-300">
          <strong className="text-gray-200">Cabinets:</strong> <strong>Pending</strong> = not yet marked done.
          <strong> Completed</strong> = marked complete for this PM. When all are done, click <strong>Complete session</strong>.
        </div>
      )}

      <div className="card mb-6">
        <div className="card-header !pb-0">
          <div className="tabs border-0">
            <button
              type="button"
              onClick={() => setActiveTab('cabinets')}
              className={`tab ${activeTab === 'cabinets' ? 'tab-active' : ''}`}
            >
              Cabinets ({cabinets.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('nodes')}
              className={`tab ${activeTab === 'nodes' ? 'tab-active' : ''}`}
            >
              Equipment
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('diagnostics')}
              className={`tab ${activeTab === 'diagnostics' ? 'tab-active' : ''}`}
            >
              I/O errors
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pm-notes')}
              className={`tab ${activeTab === 'pm-notes' ? 'tab-active' : ''}`}
            >
              PM notes
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'cabinets' && (
        <>
          {/* Search and Filter */}
          <div className="card mb-6">
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search cabinets by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="form-input pr-8"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-lg leading-none"
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="form-select">
                  <option value="location">Group by Location</option>
                  <option value="date">Sort by Date</option>
                  <option value="status">Sort by Status</option>
                  <option value="created">Sort by Created</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cabinets grouped by Location */}
          {cabinets.length === 0 ? (
            <div className="card">
              <div className="card-body text-center py-12">
                <div className="text-6xl mb-4">🗄️</div>
                <p className="text-gray-400 mb-4">
                  {session.status === 'completed' ? 'No cabinets were recorded for this session.' : 'No cabinets yet. Add your first cabinet to get started.'}
                </p>
                {session.status !== 'completed' && (
                  <div className="flex gap-3 justify-center">
                    <button onClick={() => setShowNewCabinetModal(true)} className="btn btn-primary">
                      Add Cabinet
                    </button>
                    <button onClick={() => setShowBulkImportModal(true)} className="btn btn-success">
                      Bulk Import
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* No-results message when search text matches nothing */}
              {searchTerm.trim() && !cabinets.some(c =>
                (c.cabinet_name || '').toLowerCase().includes(searchTerm.trim().toLowerCase())
              ) && (
                <div className="card">
                  <div className="card-body text-center py-10">
                    <div className="text-4xl mb-3">🔍</div>
                    <p className="text-gray-400">No cabinets match &quot;{searchTerm}&quot;</p>
                    <button onClick={() => setSearchTerm('')} className="btn btn-secondary mt-4 text-sm">
                      Clear search
                    </button>
                  </div>
                </div>
              )}
              {/* Render each location container, then unassigned at the end */}
              {[...locations, { id: null, location_name: 'Unassigned' }].map((loc) => {
                const searchFilter = searchTerm.trim().toLowerCase();
                const locationCabinets = cabinets.filter(c => {
                  const inLocation = loc.id ? c.location_id === loc.id : !c.location_id;
                  if (!inLocation) return false;
                  if (!searchFilter) return true;
                  return (c.cabinet_name || '').toLowerCase().includes(searchFilter);
                });
                
                // Hide groups with no matches while searching; keep empty named locations visible otherwise
                if (locationCabinets.length === 0 && searchFilter) return null;
                if (locationCabinets.length === 0 && !loc.id) return null;
                
                return (
                  <div key={loc.id || 'unassigned'} className="rounded-lg border border-gray-600 bg-gray-800/30">
                    {/* Location Container Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-700/50 rounded-t-lg border-b border-gray-600">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{loc.id ? '📍' : '📦'}</span>
                        <h3 className="text-gray-100 font-semibold">{loc.location_name}</h3>
                        <span className="text-xs text-gray-400 bg-gray-600/50 px-2 py-0.5 rounded-full">
                          {locationCabinets.length} {locationCabinets.length === 1 ? 'cabinet' : 'cabinets'}
                        </span>
                      </div>
                      {loc.id && session.status !== 'completed' && (
                        <button
                          onClick={() => handleDeleteLocation(loc.id, loc.location_name)}
                          className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-sm px-2 py-1 rounded hover:bg-red-900/20"
                          title="Delete location"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Delete location
                        </button>
                      )}
                    </div>
                    
                    {/* Cabinets in this location */}
                    {locationCabinets.length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-500 text-sm">
                        No cabinets in this location yet. Use <strong className="text-gray-400">Assign cabinets</strong> or the map-pin on a cabinet card.
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {locationCabinets.map((cabinet) => (
                            <div
                              key={cabinet.id}
                              className="bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-all shadow-lg"
                            >
                              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                                <h4 className="font-semibold text-gray-100">
                                  {cabinet.cabinet_name || 'Unnamed Cabinet'}
                                </h4>
                                <div className="flex items-center gap-2">
                                  {cabinet.cabinet_type === 'rack' && (
                                    <span className="badge badge-blue text-xs">Rack</span>
                                  )}
                                  <span className={`badge text-xs ${cabinet.status === 'completed' ? 'badge-green' : 'badge-gray'}`}>
                                    {(cabinet.status || 'PENDING').toUpperCase()}
                                  </span>
                                </div>
                              </div>
                              <div className="px-4 py-3">
                                <div className="space-y-2 mb-3">
                                  <div className="pt-2 border-t border-gray-700">
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {cabinet.cabinet_type === 'rack' ? (
                                        <>
                                          <div className="text-gray-400">🖥️ {(cabinet.workstations || []).length} Workstations</div>
                                          <div className="text-gray-400">🔌 {(cabinet.power_supplies || []).length} Power</div>
                                          <div className="text-gray-400">🌐 {(cabinet.network_equipment || []).length} Network</div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="text-gray-400">🎛️ {(cabinet.controllers || []).length} Controllers</div>
                                          <div className="text-gray-400">🔌 {(cabinet.power_supplies || []).length} Power</div>
                                          <div className="text-gray-400">📡 {(cabinet.distribution_blocks || []).length} Dist Blocks</div>
                                          <div className="text-gray-400">🌐 {(cabinet.network_equipment || []).length} Network</div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  {/* Primary action row */}
                                  <div className="flex gap-2">
                                    <Link
                                      to={`/cabinet/${cabinet.id}`}
                                      className="flex-1 btn btn-primary text-sm py-2 min-w-0 text-center"
                                    >
                                      Inspect
                                    </Link>
                                    {session.status !== 'completed' && cabinet.status !== 'completed' && (
                                      <button
                                        onClick={async () => {
                                          try {
                                            await api.markCabinetComplete(cabinet.id);
                                            soundSystem.playSuccess();
                                            showMessage('Cabinet marked complete', 'success');
                                            loadSessionData();
                                          } catch (err) {
                                            soundSystem.playError();
                                            showMessage(err?.error || err?.message || 'Failed to mark cabinet complete', 'error');
                                          }
                                        }}
                                        className="flex-1 btn btn-success text-sm py-2"
                                        title="Mark this cabinet as completed"
                                      >
                                        ✓ Complete
                                      </button>
                                    )}
                                  </div>
                                  {/* Secondary icon-button row */}
                                  {session.status !== 'completed' && (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => openAssignLocationModal(cabinet.id, cabinet.location_id)}
                                        className="flex-1 btn btn-secondary text-sm py-1"
                                        title="Assign to Location"
                                      >
                                        📍
                                      </button>
                                      <button
                                        onClick={() => openDuplicateCabinetModal(cabinet)}
                                        className="flex-1 btn btn-secondary text-sm py-1"
                                        title="Duplicate Cabinet"
                                      >
                                        ⧉
                                      </button>
                                      <button
                                        onClick={() => handleDeleteCabinet(cabinet.id)}
                                        className="flex-1 btn btn-danger text-sm py-1"
                                        title="Delete Cabinet"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'nodes' && session?.customer_id && (
        <NodeMaintenance 
          sessionId={id} 
          customerId={session.customer_id} 
          isCompleted={session?.status === 'completed'} 
        />
      )}

      {activeTab === 'diagnostics' && session?.customer_id && (
        <DiagnosticsAdvanced 
          sessionId={id} 
          customerId={session.customer_id} 
          isCompleted={session?.status === 'completed'} 
        />
      )}

      {activeTab === 'pm-notes' && (
        <PMNotes sessionId={id} isCompleted={session?.status === 'completed'} />
      )}

      {/* New Cabinet Modal */}
      {showNewCabinetModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">➕ New Cabinet</h3>
              <button
                onClick={() => setShowNewCabinetModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateCabinet}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Cabinet Name *</label>
                  <input
                    type="text"
                    name="cabinet_name"
                    required
                    placeholder="e.g., Building A - Control Room 1"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Location (Optional)</label>
                  <select name="location_id" className="form-select">
                    <option value="">Unassigned</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.location_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewCabinetModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Cabinet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImportModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📤 Bulk Import Cabinets</h3>
              <button
                onClick={() => setShowBulkImportModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleBulkImport}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Cabinet Locations (one per line)</label>
                  <textarea
                    name="cabinet_list"
                    rows="12"
                    placeholder="Building A - Control Room 1&#10;Building A - Control Room 2&#10;Building B - Main Panel&#10;Building C - Distribution Center&#10;..."
                    className="form-textarea font-mono text-sm"
                  ></textarea>
                  <p className="text-sm text-gray-400 mt-2">
                    💡 Enter each cabinet location on a separate line. Empty lines will be ignored.
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowBulkImportModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  📤 Import Cabinets
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {showNewLocationModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📍 Add Location</h3>
              <button
                onClick={() => { setShowNewLocationModal(false); setNewLocationName(''); setNewLocationDescription(''); }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAddLocation}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Location Name *</label>
                  <input
                    type="text"
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    required
                    placeholder="e.g., Building A - Floor 2"
                    className="form-input"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="form-label">Description (Optional)</label>
                  <input
                    type="text"
                    value={newLocationDescription}
                    onChange={(e) => setNewLocationDescription(e.target.value)}
                    placeholder="Brief description of the location"
                    className="form-input"
                  />
                </div>
                {locations.length > 0 && (
                  <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                    <p className="text-xs text-gray-400 mb-2">Existing locations:</p>
                    <div className="space-y-2">
                      {locations.map((loc) => (
                        <div
                          key={loc.id}
                          className="flex items-center justify-between gap-2 rounded border border-gray-600 bg-gray-800/60 px-2 py-1.5"
                        >
                          <span className="text-sm text-gray-200">{loc.location_name}</span>
                          <button
                            type="button"
                            className="text-xs text-red-400 hover:text-red-300"
                            onClick={() => handleDeleteLocation(loc.id, loc.location_name)}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowNewLocationModal(false); setNewLocationName(''); setNewLocationDescription(''); }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  📍 Add Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage / delete locations */}
      {showManageLocationsModal && (
        <div className="modal-backdrop">
          <div className="modal-panel max-w-md w-full mx-4">
            <div className="modal-panel-header">
              <h3 className="text-lg font-semibold text-gray-100">Locations</h3>
              <button
                type="button"
                onClick={() => setShowManageLocationsModal(false)}
                className="btn-icon"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-panel-body space-y-3">
              <p className="text-sm text-gray-400">
                Deleting a location leaves its cabinets unassigned.
              </p>
              {locations.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">No locations yet. Use Add location first.</p>
              ) : (
                <ul className="space-y-2">
                  {locations.map((loc) => {
                    const count = cabinets.filter((c) => c.location_id === loc.id).length;
                    return (
                      <li
                        key={loc.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
                      >
                        <div>
                          <div className="font-medium text-gray-100">{loc.location_name}</div>
                          <div className="text-xs text-gray-500">
                            {count} cabinet{count !== 1 ? 's' : ''}
                            {loc.description ? ` · ${loc.description}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteLocation(loc.id, loc.location_name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Delete
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="modal-panel-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowManageLocationsModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowManageLocationsModal(false);
                  setShowNewLocationModal(true);
                }}
              >
                Add location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk assign cabinets → location (two-pane) */}
      {showBulkAssignModal && (
        <div className="modal-backdrop">
          <div className="modal-panel max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="modal-panel-header">
              <h3 className="text-lg font-semibold text-gray-100">Assign cabinets to location</h3>
              <button
                type="button"
                onClick={() => setShowBulkAssignModal(false)}
                className="btn-icon"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-panel-body flex-1 overflow-hidden">
              <p className="mb-3 text-sm text-gray-400">
                Select cabinets on the left, pick a location on the right, then push them over.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
                {/* Left: cabinets */}
                <div className="flex min-h-[20rem] flex-col rounded-lg border border-[var(--border-strong)] bg-[var(--surface)]">
                  <div className="border-b border-[var(--border)] px-3 py-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Cabinets ({bulkAssignCabinetIds.length} selected)
                      </h4>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-blue-400 hover:text-blue-300"
                          onClick={() => {
                            const q = bulkAssignCabinetFilter.trim().toLowerCase();
                            const ids = cabinets
                              .filter((c) => !q || (c.cabinet_name || '').toLowerCase().includes(q))
                              .map((c) => c.id);
                            setBulkAssignCabinetIds(ids);
                          }}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40"
                          disabled={!bulkAssignCabinetIds.length}
                          onClick={() => setBulkAssignCabinetIds([])}
                        >
                          Unselect
                        </button>
                      </div>
                    </div>
                    <input
                      type="search"
                      className="form-input"
                      placeholder="Filter cabinets…"
                      value={bulkAssignCabinetFilter}
                      onChange={(e) => setBulkAssignCabinetFilter(e.target.value)}
                    />
                  </div>
                  <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {cabinets
                      .filter((c) => {
                        const q = bulkAssignCabinetFilter.trim().toLowerCase();
                        if (!q) return true;
                        return (c.cabinet_name || '').toLowerCase().includes(q);
                      })
                      .map((c) => {
                        const locName =
                          locations.find((l) => l.id === c.location_id)?.location_name || 'Unassigned';
                        const checked = bulkAssignCabinetIds.includes(c.id);
                        return (
                          <li key={c.id}>
                            <label
                              className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--surface-hover)] ${
                                checked ? 'bg-blue-950/40' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={checked}
                                onChange={() => toggleBulkCabinet(c.id)}
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-gray-100">
                                  {c.cabinet_name}
                                </span>
                                <span className="block truncate text-xs text-gray-500">{locName}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                  </ul>
                </div>

                {/* Middle: push */}
                <div className="flex flex-col items-center justify-center gap-2 py-2 md:py-0">
                  <ArrowRight className="hidden h-6 w-6 text-gray-500 md:block" aria-hidden />
                  <button
                    type="button"
                    className="btn btn-primary whitespace-nowrap"
                    disabled={bulkAssignBusy || !bulkAssignCabinetIds.length}
                    onClick={handleBulkAssignCabinets}
                  >
                    {bulkAssignBusy
                      ? 'Assigning…'
                      : `Push ${bulkAssignCabinetIds.length || ''} →`}
                  </button>
                </div>

                {/* Right: locations */}
                <div className="flex min-h-[20rem] flex-col rounded-lg border border-[var(--border-strong)] bg-[var(--surface)]">
                  <div className="border-b border-[var(--border)] px-3 py-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Destination location
                    </h4>
                  </div>
                  <ul className="flex-1 overflow-y-auto p-2 space-y-1">
                    <li>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-[var(--surface-hover)] ${
                          bulkAssignLocationId === '' ? 'bg-blue-950/40 ring-1 ring-blue-500/40' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="bulk-assign-loc"
                          checked={bulkAssignLocationId === ''}
                          onChange={() => setBulkAssignLocationId('')}
                        />
                        <span className="text-gray-200">Unassigned</span>
                      </label>
                    </li>
                    {locations.map((loc) => {
                      const count = cabinets.filter((c) => c.location_id === loc.id).length;
                      return (
                        <li key={loc.id}>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-[var(--surface-hover)] ${
                              bulkAssignLocationId === loc.id
                                ? 'bg-blue-950/40 ring-1 ring-blue-500/40'
                                : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name="bulk-assign-loc"
                              checked={bulkAssignLocationId === loc.id}
                              onChange={() => setBulkAssignLocationId(loc.id)}
                            />
                            <span className="min-w-0">
                              <span className="block font-medium text-gray-100">{loc.location_name}</span>
                              <span className="block text-xs text-gray-500">
                                {count} cabinet{count !== 1 ? 's' : ''} now
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                    {locations.length === 0 && (
                      <li className="px-2 py-4 text-center text-xs text-gray-500">
                        No locations yet — add one first, or push to Unassigned.
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
            <div className="modal-panel-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowBulkAssignModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={bulkAssignBusy || !bulkAssignCabinetIds.length}
                onClick={handleBulkAssignCabinets}
              >
                {bulkAssignBusy ? 'Assigning…' : 'Assign selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Cabinet to Location Modal */}
      {showAssignLocationModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📍 Assign to Location</h3>
              <button
                onClick={() => { setShowAssignLocationModal(false); setAssigningCabinetId(null); setSelectedLocationId(''); }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="form-label">Cabinet</label>
                <p className="text-gray-200 font-medium">
                  {cabinets.find(c => c.id === assigningCabinetId)?.cabinet_name || 'Unknown'}
                </p>
              </div>
              <div>
                <label className="form-label">Select Location</label>
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  className="form-select"
                >
                  <option value="">Unassigned</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.location_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowAssignLocationModal(false); setAssigningCabinetId(null); setSelectedLocationId(''); }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignCabinetToLocation}
                className="btn btn-primary"
              >
                📍 Assign Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Cabinet Modal */}
      {showDuplicateCabinetModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">⧉ Duplicate Cabinet</h3>
              <button
                onClick={closeDuplicateCabinetModal}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-gray-400 text-sm">
                Copies power supply counts, distribution/I/O-equipment counts, and rack flags. Switches/network JSON is cleared; controllers are not duplicated. Inspection starts fresh.
              </p>
              <p className="text-gray-400 text-sm">
                By default labels on distribution blocks, diodes, media converters, and carrier/baseplates are reset — use “Keep custom names” to copy those labels (DC readings still cleared).
              </p>
              <div>
                <label className="form-label">Base name ({duplicateCabinetCopyCount > 1 ? 'stem for numbered copies — may be blank' : 'new cabinet'})</label>
                <input
                  type="text"
                  value={duplicateCabinetName}
                  onChange={(e) => setDuplicateCabinetName(e.target.value)}
                  className="form-input"
                  placeholder={duplicateCabinetCopyCount > 1 ? 'Optional — uses original cabinet name' : 'Enter name for the new cabinet'}
                  autoFocus={duplicateCabinetCopyCount <= 1}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleDuplicateCabinet(); }}
                />
              </div>
              <div>
                <label className="form-label">Number of copies (1–20)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={duplicateCabinetCopyCount}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setDuplicateCabinetCopyCount(Number.isFinite(v) ? Math.min(20, Math.max(1, v)) : 1);
                  }}
                  className="form-input max-w-[120px]"
                />
              </div>
              <label className="flex items-start gap-3 cursor-pointer text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={duplicatePreserveEquipmentLabels}
                  onChange={(e) => setDuplicatePreserveEquipmentLabels(e.target.checked)}
                  className="mt-1 rounded border-gray-600"
                />
                <span>Keep custom names for distribution blocks, diodes, media converters, and carrier/baseplates</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDuplicateCabinetModal}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicateCabinet}
                className="btn btn-primary"
                disabled={duplicateCabinetNeedsName && !duplicateCabinetName.trim()}
              >
                ⧉ Duplicate{duplicateCabinetCopyCount > 1 ? ` (${duplicateCabinetCopyCount})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Rack Modal */}
      {showAddRackModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">🗄️ New Rack</h3>
              <button
                onClick={() => setShowAddRackModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateRack}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Rack Name *</label>
                  <input
                    type="text"
                    name="cabinet_name"
                    required
                    placeholder="e.g., Server Rack 1"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Location (Optional)</label>
                  <select name="location_id" className="form-select">
                    <option value="">Unassigned</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.location_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-3 text-sm text-blue-200">
                  <p>💡 Racks can only assign workstations and network switches (not controllers)</p>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddRackModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Rack
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
