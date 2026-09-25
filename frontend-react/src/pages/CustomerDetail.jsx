import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Pencil,
  TrendingUp,
  Upload,
  Package,
  Database,
  Wrench,
  MapPin,
  RefreshCw,
  ChevronDown,
  X,
  Copy,
  Check,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';
import { formatSessionNameWithLabel } from '../utils/sessionName';
import DellPartsPanel from '../components/DellPartsPanel';
import SessionNodeScopePicker from '../components/SessionNodeScopePicker';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customer, setCustomer] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState(() =>
    searchParams.get('tab') === 'parts' || searchParams.get('tab') === 'hdd' ? 'parts' : 'active'
  );
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionType, setNewSessionType] = useState('pm');
  const [newSessionDate, setNewSessionDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newSessionSiteLabel, setNewSessionSiteLabel] = useState('');
  const [newNodeScope, setNewNodeScope] = useState('all');
  const [newNodeIds, setNewNodeIds] = useState([]);
  const [dupNodeScope, setDupNodeScope] = useState('all');
  const [dupNodeIds, setDupNodeIds] = useState([]);
  const [showEditSessionModal, setShowEditSessionModal] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [showSystemRegModal, setShowSystemRegModal] = useState(false);
  const [showImportBundleModal, setShowImportBundleModal] = useState(false);
  const [bundleImporting, setBundleImporting] = useState(false);
  const bundleZipInputRef = useRef(null);
  const [systemRegSummary, setSystemRegSummary] = useState(null);
  const [hddHistory, setHddHistory] = useState([]);
  const [hddLoading, setHddLoading] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicatingSession, setDuplicatingSession] = useState(null);
  const [duplicateProgress, setDuplicateProgress] = useState(false);
  const [showTrendPanel, setShowTrendPanel] = useState(false);
  const [metricHistory, setMetricHistory] = useState([]);
  const [metricHistoryLoading, setMetricHistoryLoading] = useState(false);
  const [expandedMetricRow, setExpandedMetricRow] = useState(null);
  const [showSystemPassword, setShowSystemPassword] = useState(false);
  const [copiedSiId, setCopiedSiId] = useState(false);
  const [systemRegStats, setSystemRegStats] = useState(null);
  const [spSyncing, setSpSyncing] = useState(false);
  const [spLastSync, setSpLastSync] = useState(null);
  const [wsWarranty, setWsWarranty] = useState(null);
  const [wsWarrantyLoading, setWsWarrantyLoading] = useState(false);
  const [wsWarrantyError, setWsWarrantyError] = useState(null);
  const partsNodeId = searchParams.get('node') ? Number(searchParams.get('node')) : null;

  const loadHddHistory = async () => {
    if (hddHistory.length > 0 && !hddLoading) return;
    setHddLoading(true);
    try {
      const data = await fetch(`/api/customers/${id}/hdd-replacements`, { credentials: 'include' }).then((r) => r.json());
      setHddHistory(Array.isArray(data) ? data : []);
    } catch {
      setHddHistory([]);
    } finally {
      setHddLoading(false);
    }
  };

  const openPartsTab = () => {
    setActiveTab('parts');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'parts');
      return next;
    });
    loadHddHistory();
  };

  const loadWorkstationWarranties = async (refresh = false) => {
    if (!id) return;
    setWsWarrantyLoading(true);
    setWsWarrantyError(null);
    try {
      const url = refresh
        ? `/api/customers/${id}/dell-warranty/workstations/refresh`
        : `/api/customers/${id}/dell-warranty/workstations`;
      const data = await fetch(url, {
        method: refresh ? 'POST' : 'GET',
        credentials: 'include',
      }).then((r) => r.json());
      if (data.error) {
        setWsWarrantyError(data.error);
        if (!refresh) setWsWarranty(null);
      } else {
        setWsWarranty(data);
        if (data.warranty_error) setWsWarrantyError(data.warranty_error);
        if (refresh && data.message) {
          showMessage(data.message, 'success');
        }
      }
    } catch (e) {
      setWsWarrantyError(e.message || 'Failed to load warranties');
      if (!refresh) setWsWarranty(null);
    } finally {
      setWsWarrantyLoading(false);
    }
  };

  useEffect(() => {
    loadCustomerData();
    loadSystemRegSummary();
    loadSystemRegStats();
    loadNotes();
    loadWorkstationWarranties();
  }, [id]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'parts' || tab === 'hdd') {
      setActiveTab('parts');
      loadHddHistory();
    } else if (tab === 'notes') {
      setActiveTab('notes');
      loadNotes();
    }
  }, [searchParams, id]);

  const loadCustomerData = async () => {
    try {
      const [customerData, allSessions] = await Promise.all([
        api.getCustomer(id),
        api.getSessions(),
      ]);
      setCustomer(customerData);
      setSessions(allSessions.filter(s => s.customer_id.toString() === id));
    } catch (error) {
      console.error('Error loading customer:', error);
      showMessage('Error loading customer data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info', title) => {
    if (typeof text === 'object' && text !== null) {
      setMessage({
        text: text.message || text.text || '',
        type: text.type || 'info',
        title: text.title,
      });
    } else {
      setMessage({ text, type, title });
    }
    setTimeout(() => setMessage(null), 8000);
  };

  const loadMetricHistory = async () => {
    if (!id) return;
    setMetricHistoryLoading(true);
    try {
      const data = await api.getCustomerMetricHistory(id);
      setMetricHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading metric history:', err);
      setMetricHistory([]);
    } finally {
      setMetricHistoryLoading(false);
    }
  };

  const openTrendPanel = () => {
    setShowTrendPanel((open) => {
      const next = !open;
      if (next) loadMetricHistory();
      return next;
    });
  };

  const trendChartData = useMemo(() => {
    if (!Array.isArray(metricHistory) || metricHistory.length === 0) return [];
    return [...metricHistory]
      .filter((r) => r.recorded_at)
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
      .map((r) => ({
        id: r.id,
        label: new Date(r.recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }),
        score: r.risk_score != null ? Number(r.risk_score) : null,
        errors: r.error_count != null ? Number(r.error_count) : null,
        session: r.session_name || '',
      }));
  }, [metricHistory]);

  const loadNotes = async () => {
    if (!id) return;
    setNotesLoading(true);
    try {
      const data = await api.getCustomerNotes(id);
      setNotes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading notes:', err);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const created = await api.addCustomerNote(id, newNote.trim());
      setNotes(prev => [created, ...prev]);
      setNewNote('');
      showMessage('Note added', 'success');
    } catch (err) {
      showMessage('Error saving note', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveEditNote = async (noteId) => {
    if (!editNoteText.trim()) return;
    try {
      const updated = await api.updateCustomerNote(id, noteId, editNoteText.trim());
      setNotes(prev => prev.map(n => n.id === noteId ? updated : n));
      setEditingNote(null);
      setEditNoteText('');
      showMessage('Note updated', 'success');
    } catch (err) {
      showMessage('Error updating note', 'error');
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!confirm('Delete this note?')) return;
    try {
      await api.deleteCustomerNote(id, noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      showMessage('Note deleted', 'success');
    } catch (err) {
      showMessage('Error deleting note', 'error');
    }
  };

  const loadSystemRegSummary = async () => {
    try {
      console.log('🔍 Loading system registry summary for customer:', id);
      const response = await api.request(`/api/customers/${id}/system-registry/summary`);
      console.log('✅ System registry summary loaded:', response);
      setSystemRegSummary(response);
    } catch (error) {
      console.error('❌ Error loading system registry summary:', error);
    }
  };

  const loadSystemRegStats = async () => {
    try {
      const response = await api.request(`/api/customers/${id}/system-registry/cioc-stats`);
      setSystemRegStats(response);
    } catch (err) {
      console.error('Error loading CIOC/Charm stats:', err);
    }
  };

  const handleSharePointSync = async () => {
    setSpSyncing(true);
    try {
      const result = await api.request(`/api/sharepoint/sync-customer/${id}`, { method: 'POST' });
      if (result.success) {
        setSpLastSync(new Date().toLocaleTimeString());
        await loadNotes();
        showMessage(`Synced ${result.added} note(s) from SharePoint`, 'success');
      } else {
        showMessage(result.error || 'SharePoint sync failed', 'error');
      }
    } catch (err) {
      showMessage('SharePoint sync error: ' + err.message, 'error');
    } finally {
      setSpSyncing(false);
    }
  };

  const handleSystemRegImport = async (e) => {
    e.preventDefault();

    const fileInput = e.target.xml_file.files[0];
    if (!fileInput) {
      showMessage('Please select an XML file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const buf = new Uint8Array(event.target.result);
      let encoding = 'UTF-8';
      if (buf.length >= 2) {
        if (buf[0] === 0xff && buf[1] === 0xfe) encoding = 'UTF-16LE';
        else if (buf[0] === 0xfe && buf[1] === 0xff) encoding = 'UTF-16BE';
      }
      const decoder = new TextDecoder(encoding);
      await processXMLImport(decoder.decode(buf));
    };
    reader.readAsArrayBuffer(fileInput);
  };

  const processXMLImport = async (xmlData) => {
    try {
      console.log('📤 Starting XML import...');
      console.log('📤 XML data length:', xmlData.length, 'characters');
      showMessage('Importing system registry data...', 'info');
      
      const result = await api.request(`/api/customers/${id}/system-registry/import`, {
        method: 'POST',
        body: JSON.stringify({ xmlData }),
      });
      
      console.log('📥 Import result:', result);
      
      if (result.success) {
        console.log('✅ Import successful, stats:', result.stats);
        
        const stats = result.stats;
        const totalImported = Object.values(stats).reduce((a, b) => a + b, 0);
        
        if (totalImported === 0) {
          soundSystem.playError();
          showMessage('Import completed but no data was found. Please check your XML format matches the expected structure. See the sample file for reference.', 'error');
          console.warn('⚠️ XML structure may not match expected format');
          console.warn('⚠️ Expected elements: Workstation, Controller, SmartSwitch, IODevice, CharmsIOCard, Charm, AMSSystem');
          // Don't close the modal so user can see the message and try again
          return;
        }
        
        soundSystem.playSuccess();
        const summary = [
          stats.workstations && `${stats.workstations} workstations`,
          stats.controllers && `${stats.controllers} controllers`,
          stats.smartSwitches && `${stats.smartSwitches} smart switches`,
          stats.ioDevices && `${stats.ioDevices} I/O devices`,
          stats.charmsIOCards && `${stats.charmsIOCards} Charms I/O cards`,
          stats.charms && `${stats.charms} Charms`,
          stats.amsSystems && `${stats.amsSystems} AMS system`
        ].filter(Boolean).join(', ');
        
        const mergeInfo = (result.updatedCount > 0) 
          ? ` (${result.newCount || 0} new, ${result.updatedCount} updated - assignments preserved)`
          : '';
        
        showMessage(`Successfully imported: ${summary}${mergeInfo}. Ready for PM sessions!`, 'success');
        
        // Reload summary to show new data
        console.log('🔄 Reloading system registry summary...');
        await loadSystemRegSummary();
        
        // Keep modal open for a moment to show the success message
        setTimeout(() => {
          setShowSystemRegModal(false);
        }, 2000);
      } else {
        soundSystem.playError();
        console.error('❌ Import failed:', result.error);
        console.error('❌ Details:', result.details);
        console.error('❌ Help:', result.help);
        
        let errorMsg = result.error || 'Error importing system registry';
        if (result.lineNumber) {
          errorMsg += ` (Line ${result.lineNumber})`;
        }
        if (result.help) {
          errorMsg += '\n\n' + result.help;
        }
        
        showMessage(errorMsg, 'error');
      }
    } catch (error) {
      soundSystem.playError();
      console.error('❌ Import exception:', error);
      showMessage('Error importing system registry: ' + error.message, 'error');
    }
  };

  const formatBundleFhxCounts = (c) => {
    if (!c || typeof c !== 'object') return '';
    const parts = [
      c.simple_io != null && `${c.simple_io} simple I/O`,
      c.charms != null && `${c.charms} charms`,
      c.modules != null && `${c.modules} modules`,
      c.pid != null && `${c.pid} PID`,
      c.ai != null && `${c.ai} AI`,
      c.ao != null && `${c.ao} AO`,
      c.di != null && `${c.di} DI`,
      c.do != null && `${c.do} DO`,
    ].filter(Boolean);
    return parts.join('; ');
  };

  const handleCustomerBundleImport = async (e) => {
    e.preventDefault();
    const file = e.target.bundle_zip?.files?.[0];
    if (!file) {
      showMessage('Choose a .zip bundle (cabinet-pm-customer-import-bundle/v1).', 'error');
      return;
    }
    setBundleImporting(true);
    try {
      const result = await api.uploadCustomerImportBundle(id, file);
      const reg = result.registration;
      const fhx = result.fhx;

      if (result.success) {
        soundSystem.playSuccess();
        const regParts = reg?.ok && reg.stats
          ? [
              reg.stats.workstations && `${reg.stats.workstations} workstations`,
              reg.stats.controllers && `${reg.stats.controllers} controllers`,
              reg.stats.smartSwitches && `${reg.stats.smartSwitches} switches`,
              reg.stats.charmsIOCards && `${reg.stats.charmsIOCards} CIOCs`,
              reg.stats.ioDevices && `${reg.stats.ioDevices} I/O`,
              reg.stats.charms && `${reg.stats.charms} charms`,
              reg.stats.amsSystems && `${reg.stats.amsSystems} AMS`,
            ].filter(Boolean).join(', ')
          : '';
        const regLine =
          reg?.skipped ? `Registration: skipped (${reg.note || 'no XML in ZIP'}).` :
          reg?.ok ? `Registration: imported${regParts ? ` — ${regParts}` : ''}.` :
          'Registration failed.';
        const fhxLine =
          fhx?.skipped ? `FHX: skipped (${fhx.note || 'no workbook'}).` :
          fhx?.ok ? `FHX: ${formatBundleFhxCounts(fhx.counts)}.` :
          '';
        showMessage(`${regLine} ${fhxLine}`.trim(), 'success');
        setShowImportBundleModal(false);
        if (bundleZipInputRef.current) bundleZipInputRef.current.value = '';
        await loadCustomerData();
        await loadSystemRegSummary();
        await loadSystemRegStats();
        return;
      }

      soundSystem.playError();
      const errTxt = Array.isArray(result.errors) ? result.errors.join(' ') : (result.error || 'Bundle import failed');
      if (result.partialRegistration && reg?.ok) {
        showMessage(
          `Registration succeeded but FHX ingest failed — I/O rows may reflect only registration XML: ${errTxt}`,
          'error'
        );
        await loadCustomerData();
        await loadSystemRegSummary();
        await loadSystemRegStats();
      } else {
        showMessage(errTxt, 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Bundle import error: ' + error.message, 'error');
    } finally {
      setBundleImporting(false);
    }
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      const result = await api.updateCustomer(id, data);
      if (result.success) {
        setShowEditModal(false);
        loadCustomerData();
        showMessage('Customer updated successfully', 'success');
      } else {
        showMessage(result.error || 'Error updating customer', 'error');
      }
    } catch (error) {
      showMessage('Error updating customer', 'error');
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (newNodeScope === 'selected' && newNodeIds.length === 0) {
      showMessage('Select at least one node, or choose include all nodes', 'error');
      return;
    }
    const formData = new FormData(e.target);
    const data = {
      customer_id: id,
      session_type: formData.get('session_type') || 'pm',
      session_name: formatSessionNameWithLabel(
        newSessionSiteLabel,
        newSessionType,
        newSessionDate
      ),
      node_scope: newNodeScope,
      node_ids: newNodeScope === 'selected' ? newNodeIds : undefined,
    };

    console.log('Creating session with data:', data);

    try {
      const result = await api.createSession(data);
      console.log('Session creation result:', result);
      if (result.success) {
        soundSystem.playSuccess();
        setShowNewSessionModal(false);
        setNewSessionSiteLabel('');
        setNewNodeScope('all');
        setNewNodeIds([]);
        loadCustomerData();
        showMessage(`${data.session_type?.toUpperCase() || 'Session'} created successfully`, 'success');
        e.target.reset();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error creating session', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage(error?.message || 'Error creating session', 'error');
    }
  };

  const activeSessions = sessions.filter(s => s.status !== 'completed');
  const completedSessions = sessions.filter(s => s.status === 'completed');

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner h-12 w-12"></div>
        </div>
      </Layout>
    );
  }

  if (!customer) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-400">Customer not found</p>
          <Link to="/customers" className="btn btn-primary mt-4">
            Back to Customers
          </Link>
        </div>
      </Layout>
    );
  }

  const displayName =
    customer.alias ||
    customer.company_name ||
    customer.name;
  const idSubtitle =
    customer.dongle_id ||
    (customer.alias && customer.name !== customer.alias ? customer.name : null);

  const copySiId = async () => {
    const value = String(customer.dongle_id || '').trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedSiId(true);
      showMessage('SI ID copied', 'success');
      setTimeout(() => setCopiedSiId(false), 2000);
    } catch (_) {
      showMessage('Could not copy SI ID', 'error');
    }
  };

  return (
    <Layout>
      <div className="breadcrumb">
        <Link to="/customers">Customers</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-200">{displayName}</span>
      </div>

      <div className="page-header !flex-col !items-stretch gap-4">
        <div className="min-w-0">
          <h1 className="page-title whitespace-nowrap truncate" title={displayName}>
            {displayName}
          </h1>
          {idSubtitle && idSubtitle !== displayName && (
            <p className="mt-1 font-mono text-sm text-gray-400 whitespace-nowrap truncate flex items-center gap-2" title={idSubtitle}>
              <span className="truncate">{customer.dongle_id ? `SI ID ${idSubtitle}` : idSubtitle}</span>
              {customer.dongle_id && (
                <button
                  type="button"
                  onClick={copySiId}
                  className="shrink-0 inline-flex items-center gap-1 rounded border border-gray-600 px-1.5 py-0.5 text-[11px] text-gray-300 hover:bg-gray-700 hover:text-white"
                  title="Copy SI ID"
                >
                  {copiedSiId ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedSiId ? 'Copied' : 'Copy'}
                </button>
              )}
            </p>
          )}
          {customer.location && (
            <p className="page-subtitle flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{customer.location}</span>
            </p>
          )}
        </div>
        <div className="page-actions !justify-start">
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              setNewSessionType('pm');
              setNewSessionDate(today);
              setNewSessionSiteLabel('');
              setNewNodeScope('all');
              setNewNodeIds([]);
              setShowNewSessionModal(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New PM session
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              setNewSessionType('ii');
              setNewSessionDate(today);
              setNewSessionSiteLabel('');
              setNewNodeScope('all');
              setNewNodeIds([]);
              setShowNewSessionModal(true);
            }}
            className="btn btn-warning"
          >
            <Wrench className="h-4 w-4" aria-hidden />
            New I&amp;I
          </button>
          <button type="button" onClick={() => setShowSystemRegModal(true)} className="btn btn-secondary">
            <Upload className="h-4 w-4" aria-hidden />
            Import nodes
          </button>
          <button type="button" onClick={() => setShowImportBundleModal(true)} className="btn btn-secondary">
            <Package className="h-4 w-4" aria-hidden />
            Import bundle
          </button>
          <button
            type="button"
            onClick={() => navigate(`/system-registry/${customer.id}`)}
            className="btn btn-secondary"
          >
            <Database className="h-4 w-4" aria-hidden />
            Manage nodes
          </button>
          <button
            type="button"
            onClick={openTrendPanel}
            className={`btn btn-secondary ${showTrendPanel ? 'ring-2 ring-blue-500/50 border-blue-500/60' : ''}`}
            title="View site health score and errors over time"
            aria-expanded={showTrendPanel}
          >
            <TrendingUp className="h-4 w-4" aria-hidden />
            Trend
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showTrendPanel ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          <button type="button" onClick={() => setShowEditModal(true)} className="btn btn-secondary">
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`alert ${
            message.type === 'success' ? 'alert-success' : message.type === 'error' ? 'alert-error' : 'alert-info'
          }`}
        >
          {message.title && <div className="font-semibold mb-1">{message.title}</div>}
          {message.text}
        </div>
      )}

      {showTrendPanel && (
        <div className="card mb-8 animate-fadeIn">
          <div className="card-header flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-100">Site health trend</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Health score (0–100, higher is better) and I/O error counts from completed PMs saved to history
              </p>
            </div>
            <button
              type="button"
              className="btn-icon"
              aria-label="Close trend"
              onClick={() => setShowTrendPanel(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="card-body space-y-6">
            {metricHistoryLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="spinner h-8 w-8" />
                <span className="ml-3 text-gray-400">Loading history…</span>
              </div>
            ) : trendChartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                No history yet. Complete a PM session and check &quot;Save to customer history&quot; to build this chart.
              </p>
            ) : (
              <>
                <div className="h-64 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d2d44" />
                      <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} stroke="#3d3d5c" />
                      <YAxis
                        yAxisId="score"
                        domain={[0, 100]}
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                        stroke="#3d3d5c"
                        width={36}
                      />
                      <YAxis
                        yAxisId="errors"
                        orientation="right"
                        allowDecimals={false}
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                        stroke="#3d3d5c"
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#1b1b2f',
                          border: '1px solid #2d2d44',
                          borderRadius: 8,
                          color: '#e5e7eb',
                        }}
                        labelStyle={{ color: '#9ca3af' }}
                      />
                      <Legend wrapperStyle={{ color: '#d1d5db', fontSize: 12 }} />
                      <Bar
                        yAxisId="errors"
                        dataKey="errors"
                        name="Errors"
                        fill="#f59e0b"
                        fillOpacity={0.35}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                      />
                      <Line
                        yAxisId="score"
                        type="monotone"
                        dataKey="score"
                        name="Health score"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto">
                  <p className="mb-2 text-xs text-gray-500">
                    Click a row for domain breakdown. Score is site health (100 = perfect).
                  </p>
                  <table className="table-compact">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Session</th>
                        <th className="text-right">Errors</th>
                        <th className="text-right">Score</th>
                        <th>Status</th>
                        <th className="text-right">Coverage</th>
                        <th className="text-right">Cabinets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricHistory.map((row) => {
                        const isExpanded = expandedMetricRow === row.id;
                        const domainScores = (() => {
                          try {
                            return row.domain_scores ? JSON.parse(row.domain_scores) : null;
                          } catch {
                            return null;
                          }
                        })();
                        const coveragePct =
                          row.coverage_total > 0
                            ? Math.round((100 * (row.coverage_completed ?? 0)) / row.coverage_total)
                            : null;
                        const badgeColors = {
                          CRITICAL: 'badge-red',
                          WARNING: 'badge-yellow',
                          MODERATE: 'badge-yellow',
                          ADVISORY: 'badge-blue',
                          GOOD: 'badge-green',
                          LOW: 'badge-yellow',
                        };
                        const badgeCls = badgeColors[row.risk_level] || 'badge-gray';
                        const scoreColor =
                          row.risk_score >= 95
                            ? 'text-emerald-400'
                            : row.risk_score >= 75
                              ? 'text-blue-300'
                              : row.risk_score >= 50
                                ? 'text-orange-400'
                                : row.risk_score >= 25
                                  ? 'text-amber-400'
                                  : 'text-red-400';
                        const domainLabels = {
                          controllers: 'Controllers',
                          network: 'Network',
                          power: 'Power',
                          cabinet_condition: 'Cabinet',
                          environmental: 'Environ.',
                          node_maintenance: 'Nodes',
                        };
                        return (
                          <Fragment key={row.id}>
                            <tr
                              className="cursor-pointer select-none"
                              onClick={() => setExpandedMetricRow(isExpanded ? null : row.id)}
                            >
                              <td>
                                {row.recorded_at
                                  ? new Date(row.recorded_at).toLocaleDateString(undefined, {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : '—'}
                              </td>
                              <td className="max-w-[12rem] truncate text-gray-200">
                                {row.session_name || row.session_id || '—'}
                              </td>
                              <td className="text-right">{row.error_count ?? '—'}</td>
                              <td className={`text-right font-semibold ${scoreColor}`}>{row.risk_score ?? '—'}</td>
                              <td>
                                {row.risk_level ? (
                                  <span className={`badge ${badgeCls}`}>{row.risk_level}</span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="text-right">{coveragePct !== null ? `${coveragePct}%` : '—'}</td>
                              <td className="text-right">{row.cabinet_count ?? '—'}</td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={7} className="bg-[var(--surface-inset)]/50">
                                  <div className="grid grid-cols-1 gap-4 py-2 text-xs sm:grid-cols-2">
                                    <div>
                                      <div className="mb-2 font-semibold uppercase tracking-wide text-gray-500">
                                        Domain scores
                                      </div>
                                      {domainScores ? (
                                        <div className="space-y-1.5">
                                          {Object.entries(domainLabels).map(([key, label]) => {
                                            const val = domainScores[key];
                                            if (val === null || val === undefined) {
                                              return (
                                                <div key={key} className="flex items-center gap-2">
                                                  <span className="w-20 text-gray-500">{label}</span>
                                                  <span className="italic text-gray-600">not inspected</span>
                                                </div>
                                              );
                                            }
                                            const barColor =
                                              val >= 60
                                                ? 'bg-red-500'
                                                : val >= 30
                                                  ? 'bg-orange-500'
                                                  : val >= 10
                                                    ? 'bg-amber-500'
                                                    : 'bg-emerald-500';
                                            return (
                                              <div key={key} className="flex items-center gap-2">
                                                <span className="w-20 text-gray-400">{label}</span>
                                                <div className="h-2 flex-1 overflow-hidden rounded bg-[var(--border-strong)]">
                                                  <div
                                                    className={`h-full rounded ${barColor}`}
                                                    style={{ width: `${Math.min(val, 100)}%` }}
                                                  />
                                                </div>
                                                <span className="w-8 text-right font-semibold text-gray-300">{val}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <span className="italic text-gray-600">No domain data</span>
                                      )}
                                    </div>
                                    <div>
                                      <div className="mb-2 font-semibold uppercase tracking-wide text-gray-500">
                                        Coverage
                                      </div>
                                      {row.coverage_total > 0 ? (
                                        <div className="text-gray-300">
                                          {row.coverage_completed} / {row.coverage_total} checkpoints
                                          <div className="mt-2 flex items-center gap-2">
                                            <div className="h-2 flex-1 overflow-hidden rounded bg-[var(--border-strong)]">
                                              <div
                                                className="h-full rounded bg-blue-500"
                                                style={{ width: `${coveragePct}%` }}
                                              />
                                            </div>
                                            <span className="w-10 text-right font-semibold text-blue-400">
                                              {coveragePct}%
                                            </span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="italic text-gray-600">No coverage data</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-100">Customer information</h3>
          </div>
          <div className="card-body space-y-3">
            {customer.alias && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Alias</div>
                <div className="text-gray-200 font-medium">{customer.alias}</div>
              </div>
            )}
            {customer.company_name && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Company Name</div>
                <div className="text-gray-200">{customer.company_name}</div>
              </div>
            )}
            {customer.contact_person && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Contact Person</div>
                <div className="text-gray-200">{customer.contact_person}</div>
              </div>
            )}
            {customer.email && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Email</div>
                <div className="text-gray-200">{customer.email}</div>
              </div>
            )}
            {customer.phone && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Phone</div>
                <div className="text-gray-200">{customer.phone}</div>
              </div>
            )}
            {(customer.street_address || customer.city || customer.state || customer.zip || customer.country) ? (
              <div>
                <div className="text-xs text-gray-500 uppercase">Address</div>
                <div className="text-gray-200 text-sm">
                  {customer.street_address && <div>{customer.street_address}</div>}
                  {(customer.city || customer.state || customer.zip) && (
                    <div>
                      {[customer.city, customer.state].filter(Boolean).join(', ')}
                      {customer.zip ? ` ${customer.zip}` : ''}
                    </div>
                  )}
                  {customer.country && <div>{customer.country}</div>}
                </div>
              </div>
            ) : customer.address ? (
              <div>
                <div className="text-xs text-gray-500 uppercase">Address</div>
                <div className="text-gray-200">{customer.address}</div>
              </div>
            ) : null}
            {customer.dongle_id && (
              <div>
                <div className="text-xs text-gray-500 uppercase flex items-center justify-between gap-2">
                  <span>SI ID</span>
                  <button
                    type="button"
                    onClick={copySiId}
                    className="inline-flex items-center gap-1 text-[11px] normal-case tracking-normal text-blue-400 hover:text-blue-300"
                    title="Copy SI ID"
                  >
                    {copiedSiId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSiId ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="text-gray-200 font-mono text-sm select-all">{customer.dongle_id}</div>
              </div>
            )}
            {customer.contact_info && (
              <div>
                <div className="text-xs text-gray-500 uppercase">Additional Info</div>
                <div className="text-gray-200 text-sm">{customer.contact_info}</div>
              </div>
            )}
            {(customer.system_username || customer.system_password) && (
              <div className="border-t border-[var(--border-subtle)] pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-gray-500 uppercase">System Credentials</div>
                  <button
                    onClick={() => setShowSystemPassword(p => !p)}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    title={showSystemPassword ? 'Hide password' : 'Reveal password'}
                  >
                    {showSystemPassword ? '🙈 Hide' : '👁 Reveal'}
                  </button>
                </div>
                {customer.system_username && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-400">Username</div>
                    <div className="text-gray-200 font-mono text-sm">{customer.system_username}</div>
                  </div>
                )}
                {customer.system_password && (
                  <div>
                    <div className="text-xs text-gray-400">Password</div>
                    <div className="text-gray-200 font-mono text-sm select-all">
                      {showSystemPassword ? customer.system_password : '••••••••'}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-100">Statistics</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-[var(--surface-inset)] p-4 text-center">
                <div className="text-3xl font-bold text-white">{sessions.length}</div>
                <div className="text-xs text-gray-500">Total sessions</div>
              </div>
              <div className="rounded-lg bg-[var(--surface-inset)] p-4 text-center">
                <div className="text-3xl font-bold text-white">{activeSessions.length}</div>
                <div className="text-xs text-gray-500">Active sessions</div>
              </div>
            </div>
            {systemRegSummary && (systemRegSummary.workstations > 0 || systemRegSummary.controllers > 0 || systemRegSummary.smartSwitches > 0) && (
              <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-400">System Registry Data</div>
                  <button
                    onClick={() => navigate(`/system-registry/${customer.id}`)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View Details →
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {systemRegSummary.workstations > 0 && (
                    <div className="text-center bg-purple-900/30 rounded p-2 cursor-pointer hover:bg-purple-900/50"
                         onClick={() => navigate(`/system-registry/${customer.id}`)}>
                      <div className="font-bold text-purple-300">{systemRegSummary.workstations}</div>
                      <div className="text-gray-400">Workstations</div>
                    </div>
                  )}
                  {systemRegSummary.controllers > 0 && (
                    <div className="text-center bg-blue-900/30 rounded p-2 cursor-pointer hover:bg-blue-900/50"
                         onClick={() => navigate(`/system-registry/${customer.id}`)}>
                      <div className="font-bold text-blue-300">{systemRegSummary.controllers}</div>
                      <div className="text-gray-400">Controllers</div>
                    </div>
                  )}
                  {systemRegSummary.smartSwitches > 0 && (
                    <div className="text-center bg-green-900/30 rounded p-2 cursor-pointer hover:bg-green-900/50"
                         onClick={() => navigate(`/system-registry/${customer.id}`)}>
                      <div className="font-bold text-green-300">{systemRegSummary.smartSwitches}</div>
                      <div className="text-gray-400">Switches</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {systemRegSummary &&
              ((systemRegSummary.ioDevices ?? 0) > 0 ||
                (systemRegSummary.charms ?? 0) > 0 ||
                (systemRegSummary.fhxModuleTotal ?? 0) > 0) && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-400">Imported extracts (workbook/XML)</div>
                  <button
                    type="button"
                    onClick={() => navigate(`/system-registry/${customer.id}`)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View Details →
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {(systemRegSummary.ioDevices ?? 0) > 0 && (
                    <div className="text-center bg-yellow-900/20 rounded p-2">
                      <div className="font-bold text-yellow-200">{systemRegSummary.ioDevices}</div>
                      <div className="text-gray-500">Simple I-O</div>
                    </div>
                  )}
                  {(systemRegSummary.charms ?? 0) > 0 && (
                    <div className="text-center bg-orange-900/20 rounded p-2">
                      <div className="font-bold text-orange-200">{systemRegSummary.charms}</div>
                      <div className="text-gray-500">CHARM linkage</div>
                    </div>
                  )}
                  {(systemRegSummary.fhxModuleTotal ?? 0) > 0 && systemRegSummary.fhxModules && (
                    <>
                      <div className="text-center bg-violet-900/25 rounded p-2 col-span-2 sm:col-span-2">
                        <div className="font-bold text-violet-200">
                          {(systemRegSummary.fhxModules.modules ?? 0) +
                            (systemRegSummary.fhxModules.pid ?? 0)}{' '}
                          mod + PID
                        </div>
                        <div className="text-gray-500 text-[10px] mt-1">
                          AI {(systemRegSummary.fhxModules.ai ?? 0)} · AO {(systemRegSummary.fhxModules.ao ?? 0)} · DI{' '}
                          {(systemRegSummary.fhxModules.di ?? 0)} · DO {(systemRegSummary.fhxModules.do ?? 0)} — lists on Nodes
                          page
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {systemRegStats && (systemRegStats.cioc_count > 0 || systemRegStats.charm_count > 0) && (
              <div className="mt-4 pt-4 border-t border-gray-600">
                <div className="text-sm text-gray-400 mb-2">CHARMs Data</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {systemRegStats.cioc_count > 0 && (
                    <div className="text-center bg-yellow-900/30 rounded p-2">
                      <div className="font-bold text-yellow-300">{systemRegStats.cioc_count}</div>
                      <div className="text-gray-400">CIOC Cards</div>
                    </div>
                  )}
                  {systemRegStats.charm_count > 0 && (
                    <div className="text-center bg-orange-900/30 rounded p-2">
                      <div className="font-bold text-orange-300">{systemRegStats.charm_count}</div>
                      <div className="text-gray-400">CHARMs</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Workstations + Dell warranty */}
      <div className="card mb-8">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-100">Workstations &amp; Dell warranty</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Registry workstations · cached Dell warranty (Refresh pulls live from TechDirect)
              {wsWarranty?.checked_at && (
                <span> · last checked {new Date(wsWarranty.checked_at).toLocaleString()}</span>
              )}
              {wsWarranty?.from_cache && (wsWarranty.unchecked_count > 0) && (
                <span className="text-yellow-500"> · {wsWarranty.unchecked_count} not checked yet</span>
              )}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadWorkstationWarranties(true)}
            disabled={wsWarrantyLoading}
          >
            <RefreshCw className={`h-4 w-4 ${wsWarrantyLoading ? 'animate-spin' : ''}`} aria-hidden />
            {wsWarrantyLoading ? 'Checking Dell…' : 'Refresh warranties'}
          </button>
        </div>
        <div className="card-body p-0">
          {wsWarrantyLoading && !wsWarranty ? (
            <div className="flex justify-center py-12">
              <div className="spinner h-8 w-8" />
            </div>
          ) : !wsWarranty?.workstations?.length ? (
            <div className="py-10 text-center text-sm text-gray-400">
              No workstations in system registry for this customer.
            </div>
          ) : (
            <>
              {wsWarrantyError && (
                <div className="alert alert-error mx-4 mt-4 mb-0 text-xs">
                  Warranty API: {wsWarrantyError}
                </div>
              )}
              <div className="table-scroll-5">
                <table className="table-compact">
                  <thead>
                    <tr>
                      <th className="w-[28%]">Workstation</th>
                      <th className="w-[22%]">Tag / model</th>
                      <th className="w-[38%]">Warranty</th>
                      <th className="w-[12%] text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {wsWarranty.workstations.map((w) => {
                      const ends = w.warranty?.warrantyEnds
                        ? new Date(w.warranty.warrantyEnds)
                        : null;
                      const support = w.warranty?.serviceLevel || '';
                      let warrantyBadge = null;
                      if (!w.dell_capable) {
                        warrantyBadge = <span className="text-xs text-gray-500">No Dell tag</span>;
                      } else if (w.warranty?.invalid) {
                        warrantyBadge = <span className="badge badge-gray">Invalid tag</span>;
                      } else if (w.warranty?.inCoverage) {
                        warrantyBadge = <span className="badge badge-green">In warranty</span>;
                      } else if (w.warranty) {
                        warrantyBadge = <span className="badge badge-red">Expired</span>;
                      } else {
                        warrantyBadge = <span className="text-xs text-amber-400">Not checked</span>;
                      }
                      return (
                        <tr key={w.id}>
                          <td>
                            <div className="font-medium leading-snug text-gray-100 break-words">{w.name}</div>
                            {w.type && (
                              <div className="mt-0.5 text-xs leading-snug text-gray-500 break-words">{w.type}</div>
                            )}
                          </td>
                          <td>
                            <div className="font-mono text-xs text-gray-200">
                              {w.service_tag || <span className="font-sans text-gray-600">—</span>}
                            </div>
                            <div className="mt-0.5 text-xs leading-snug text-gray-500 break-words">
                              {w.warranty?.product || w.model || '—'}
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              {warrantyBadge}
                              {ends && (
                                <span className="text-xs text-gray-400">
                                  {ends.toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {support && (
                              <div className="mt-1 text-xs leading-snug text-gray-500 line-clamp-2" title={support}>
                                {support}
                              </div>
                            )}
                          </td>
                          <td className="text-right">
                            {w.dell_capable && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm !px-2"
                                title="Request part"
                                onClick={() => {
                                  setSearchParams((prev) => {
                                    const next = new URLSearchParams(prev);
                                    next.set('tab', 'parts');
                                    next.set('node', String(w.node_id));
                                    return next;
                                  });
                                  setActiveTab('parts');
                                  loadHddHistory();
                                }}
                              >
                                <Package className="h-3.5 w-3.5" aria-hidden />
                                <span className="hidden lg:inline">Part</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-[var(--border-subtle)] px-4 py-3 text-xs text-gray-500">
                {wsWarranty.workstations.length} workstation
                {wsWarranty.workstations.length !== 1 ? 's' : ''} · {wsWarranty.tag_count || 0} Dell
                tag{(wsWarranty.tag_count || 0) !== 1 ? 's' : ''}
                {wsWarranty.from_cache ? ' (from cache)' : ' (just refreshed from Dell)'}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header !pb-0">
          <div className="tabs border-0">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`tab ${activeTab === 'active' ? 'tab-active' : ''}`}
            >
              Active sessions ({activeSessions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('completed')}
              className={`tab ${activeTab === 'completed' ? 'tab-active' : ''}`}
            >
              Completed ({completedSessions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`tab ${activeTab === 'notes' ? 'tab-active' : ''}`}
            >
              Site notes ({notes.length})
            </button>
            <button
              type="button"
              onClick={openPartsTab}
              className={`tab ${activeTab === 'parts' ? 'tab-active' : ''}`}
            >
              Dell Parts
            </button>
          </div>
        </div>
        {/* Site Notes Panel */}
        {activeTab === 'notes' && (
          <div className="p-6 space-y-4">
            {/* Toolbar: add note + SharePoint sync */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 space-y-2">
                <label className="form-label">New Site Note</label>
                <textarea
                  className="form-input w-full"
                  rows={3}
                  placeholder="e.g. Customer is strict about blowing out computers. Main server room is in Building B."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAddNote(); }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleAddNote}
                  disabled={savingNote || !newNote.trim()}
                >
                  {savingNote ? 'Saving...' : '+ Add Note'}
                </button>
              </div>
              <div className="flex flex-col justify-start gap-2 md:w-48">
                <label className="form-label">SharePoint</label>
                <button
                  className="btn btn-secondary flex items-center gap-2 justify-center"
                  onClick={handleSharePointSync}
                  disabled={spSyncing}
                  title="Pull latest notes from ECI SharePoint site notes list"
                >
                  {spSyncing ? '⏳ Syncing...' : '☁️ Sync from SharePoint'}
                </button>
                {spLastSync && (
                  <p className="text-xs text-gray-500 text-center">Last sync: {spLastSync}</p>
                )}
                <p className="text-xs text-gray-600 text-center">Matches by Dongle ID</p>
              </div>
            </div>

            {/* Notes list */}
            {notesLoading ? (
              <p className="text-gray-400 text-sm">Loading notes...</p>
            ) : notes.length === 0 ? (
              <p className="text-gray-500 text-sm italic">No site notes yet. Add one above.</p>
            ) : (
              <div className="space-y-3">
                {notes.map(note => (
                  <div key={note.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                    {editingNote === note.id ? (
                      <div className="space-y-2">
                        <textarea
                          className="form-input w-full"
                          rows={3}
                          value={editNoteText}
                          onChange={e => setEditNoteText(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleSaveEditNote(note.id)}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setEditingNote(null); setEditNoteText(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-gray-100 whitespace-pre-wrap flex-1">{note.note}</p>
                          {note.source === 'sharepoint' ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700 shrink-0">☁️ SharePoint</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 border border-gray-600 shrink-0">📱 App</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            {note.created_by && <span className="mr-2">By {note.created_by}</span>}
                            {new Date(note.created_at).toLocaleString()}
                            {note.updated_at !== note.created_at && ' (edited)'}
                          </span>
                          <div className="flex gap-3">
                            <button
                              className="text-blue-400 hover:text-blue-300 text-sm"
                              onClick={() => { setEditingNote(note.id); setEditNoteText(note.note); }}
                            >
                              Edit
                            </button>
                            {note.source !== 'sharepoint' && (
                              <button
                                className="text-sky-400 hover:text-sky-300 text-sm"
                                title="Push this note to SharePoint"
                                onClick={async () => {
                                  try {
                                    const r = await api.request(`/api/sharepoint/push-note/${note.id}`, { method: 'POST' });
                                    if (r.success) { showMessage('Note pushed to SharePoint ☁️', 'success'); await loadNotes(); }
                                    else showMessage(r.error || 'Push failed', 'error');
                                  } catch (e) { showMessage('Push error: ' + e.message, 'error'); }
                                }}
                              >
                                ☁️ Push
                              </button>
                            )}
                            <button
                              className="text-red-400 hover:text-red-300 text-sm"
                              onClick={() => handleDeleteNote(note.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dell Parts Panel */}
        {activeTab === 'parts' && (
          <DellPartsPanel
            customerId={id}
            initialNodeId={partsNodeId}
            hddHistory={hddHistory}
            hddLoading={hddLoading}
            showMessage={showMessage}
          />
        )}

        <div className="overflow-x-auto" style={{ display: (activeTab === 'notes' || activeTab === 'parts') ? 'none' : undefined }}>
          <table className="table-dark">
            <thead>
              <tr>
                <th>Session Name</th>
                <th>Type</th>
                <th>Created</th>
                {activeTab === 'completed' && <th>Completed</th>}
                <th>Cabinets</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(activeTab === 'active' ? activeSessions : completedSessions).length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'completed' ? 6 : 5} className="text-center py-12 text-gray-400">
                    No {activeTab} sessions found.
                  </td>
                </tr>
              ) : (
                (activeTab === 'active' ? activeSessions : completedSessions).map((session) => (
                  <tr key={session.id}>
                    <td className="font-medium text-gray-200">
                      <div>{session.session_name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {session.node_scope === 'selected' && (
                          <span className="badge badge-blue text-[10px]">Partial nodes</span>
                        )}
                        {Number(session.location_count) > 0 && (
                          <span className="badge badge-gray text-[10px]">
                            {session.location_count} location{Number(session.location_count) !== 1 ? 's' : ''}
                          </span>
                        )}
                        {Number(session.site_notes_count) > 0 && (
                          <span className="badge badge-yellow text-[10px]">Site notes</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-blue">
                        {(session.session_type || 'PM').toUpperCase()}
                      </span>
                    </td>
                    <td>{new Date(session.created_at).toLocaleDateString()}</td>
                    {activeTab === 'completed' && (
                      <td>{session.completed_at ? new Date(session.completed_at).toLocaleDateString() : 'N/A'}</td>
                    )}
                    <td>
                      {(() => {
                        const total     = session.cabinet_count || 0;
                        const done      = session.completed_cabinet_count || 0;
                        const completed = session.status === 'completed';
                        if (total === 0) {
                          return (
                            <div className="min-w-[80px]">
                              <div className="flex justify-between text-xs text-gray-400 mb-1">
                                <span>0 / 0</span>
                                <span className={completed ? 'text-green-400' : 'text-gray-500'}>{completed ? '100%' : '—'}</span>
                              </div>
                              <div className="w-full bg-gray-700 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${completed ? 'bg-green-500 w-full' : 'w-0'}`} />
                              </div>
                            </div>
                          );
                        }
                        const pct     = Math.round((done / total) * 100);
                        const allDone = done === total;
                        return (
                          <div className="min-w-[80px]">
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                              <span>{done} / {total}</span>
                              <span className={allDone ? 'text-green-400' : ''}>{pct}%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <div className="flex gap-3 flex-wrap">
                        <Link
                          to={`/session/${session.id}`}
                          className="text-blue-400 hover:text-blue-300 font-medium"
                        >
                          Open
                        </Link>
                        <button
                          onClick={() => {
                            setEditingSession(session);
                            setShowEditSessionModal(true);
                          }}
                          className="text-gray-400 hover:text-gray-300 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setDuplicatingSession(session);
                            setDupNodeScope('all');
                            setDupNodeIds([]);
                            setShowDuplicateModal(true);
                          }}
                          className="text-yellow-400 hover:text-yellow-300 font-medium"
                        >
                          Duplicate
                        </button>
                        {activeTab === 'active' && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Mark "${session.session_name}" as completed?`)) return;
                              try {
                                const result = await api.completeSession(session.id);
                                if (result.success) {
                                  soundSystem.playSuccess();
                                  loadCustomerData();
                                  showMessage('Session completed', 'success');
                                } else {
                                  soundSystem.playError();
                                  showMessage('Error completing session', 'error');
                                }
                              } catch (error) {
                                soundSystem.playError();
                                showMessage('Error completing session', 'error');
                              }
                            }}
                            className="text-green-400 hover:text-green-300 font-medium"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Customer Modal */}
      {showEditModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Edit Customer</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleUpdateCustomer}>
              <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="form-label">Customer Name *</label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={customer.name}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Alias</label>
                  <input
                    type="text"
                    name="alias"
                    defaultValue={customer.alias}
                    className="form-input"
                    placeholder="Short name for search and cards"
                  />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    name="location"
                    defaultValue={customer.location}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Contact Info</label>
                  <textarea
                    name="contact_info"
                    rows="3"
                    defaultValue={customer.contact_info}
                    className="form-textarea"
                  ></textarea>
                </div>
                <div>
                  <label className="form-label">Contact Person</label>
                  <input
                    type="text"
                    name="contact_person"
                    defaultValue={customer.contact_person}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={customer.email}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={customer.phone}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Address (general)</label>
                  <textarea
                    name="address"
                    rows="2"
                    defaultValue={customer.address}
                    className="form-textarea"
                  ></textarea>
                </div>

                {/* System Registry Address Fields */}
                <div className="pt-4 border-t border-gray-600">
                  <h4 className="text-gray-300 font-medium mb-3">System Registry Info</h4>
                  <p className="text-xs text-gray-500 mb-3">These fields are auto-populated from System Registry XML imports, but can be edited manually.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="form-label">Company Name</label>
                      <input type="text" name="company_name" defaultValue={customer.company_name} className="form-input" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Street Address</label>
                        <input type="text" name="street_address" defaultValue={customer.street_address} className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">City</label>
                        <input type="text" name="city" defaultValue={customer.city} className="form-input" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="form-label">State</label>
                        <input type="text" name="state" defaultValue={customer.state} className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">Zip</label>
                        <input type="text" name="zip" defaultValue={customer.zip} className="form-input" />
                      </div>
                      <div>
                        <label className="form-label">Country</label>
                        <input type="text" name="country" defaultValue={customer.country} className="form-input" />
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Dongle ID</label>
                      <input type="text" name="dongle_id" defaultValue={customer.dongle_id} className="form-input font-mono" />
                    </div>
                  </div>
                </div>

                {/* System Credentials Section */}
                <div className="pt-4 border-t border-gray-600">
                  <h4 className="text-gray-300 font-medium mb-3">System Login Credentials</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="form-label">System Username</label>
                      <input
                        type="text"
                        name="system_username"
                        defaultValue={customer.system_username}
                        className="form-input"
                        placeholder="e.g., admin, operator"
                      />
                      <p className="text-xs text-gray-400 mt-1">Username for accessing customer's DeltaV system</p>
                    </div>
                    <div>
                      <label className="form-label">System Password</label>
                      <input
                        type="password"
                        name="system_password"
                        defaultValue={customer.system_password}
                        className="form-input"
                        placeholder="Enter system password"
                      />
                      <p className="text-xs text-gray-400 mt-1">Password for accessing customer's DeltaV system</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Session Modal */}
      {showNewSessionModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Create New Session</h3>
              <button
                onClick={() => {
                  setShowNewSessionModal(false);
                  setNewNodeScope('all');
                  setNewNodeIds([]);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateSession}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Session Type *</label>
                  <select
                    name="session_type"
                    required
                    value={newSessionType}
                    onChange={e => setNewSessionType(e.target.value)}
                    className="form-select"
                  >
                    <option value="pm">PM - Preventive Maintenance</option>
                    <option value="ii">I&amp;I - Installation &amp; Integration</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Site / session label</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Sherwood — Area 1"
                    value={newSessionSiteLabel}
                    onChange={(e) => setNewSessionSiteLabel(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional. For split sites use the area in the name, e.g.{' '}
                    <strong className="text-gray-400">Area 1 PM-3/5/2026</strong>
                  </p>
                </div>
                <div>
                  <label className="form-label">Session Date *</label>
                  <input
                    type="date"
                    name="session_date"
                    required
                    value={newSessionDate}
                    onChange={e => setNewSessionDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Full session name (preview)</label>
                  <input
                    type="text"
                    readOnly
                    value={formatSessionNameWithLabel(
                      newSessionSiteLabel,
                      newSessionType,
                      newSessionDate
                    )}
                    className="form-input bg-gray-700 cursor-default"
                  />
                </div>
                {notes.length > 0 && (
                  <div className="rounded-lg border border-amber-600/50 bg-amber-950/40 px-3 py-2.5 text-sm text-amber-100">
                    <p className="font-medium text-amber-200">Please check site notes before beginning PM</p>
                    <p className="mt-1 text-xs text-amber-100/80">
                      This customer has {notes.length} site note{notes.length !== 1 ? 's' : ''} (access, hazards, contacts, etc.).
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-amber-300 underline hover:text-amber-200"
                      onClick={() => {
                        setShowNewSessionModal(false);
                        setActiveTab('notes');
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.set('tab', 'notes');
                          return next;
                        });
                      }}
                    >
                      View site notes
                    </button>
                  </div>
                )}
                <SessionNodeScopePicker
                  customerId={id}
                  mode={newNodeScope}
                  onModeChange={setNewNodeScope}
                  selectedIds={newNodeIds}
                  onSelectedIdsChange={setNewNodeIds}
                />
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewSessionModal(false);
                    setNewSessionType('pm');
                    setNewSessionDate(new Date().toISOString().split('T')[0]);
                    setNewSessionSiteLabel('');
                    setNewNodeScope('all');
                    setNewNodeIds([]);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer import bundle ZIP (registration + FHX workbook) */}
      {showImportBundleModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📦 Import customer bundle</h3>
              <button
                type="button"
                onClick={() => { setShowImportBundleModal(false); }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCustomerBundleImport}>
              <div className="px-6 py-4 space-y-4">
                <div className="rounded-lg border border-violet-500/40 bg-violet-950/40 p-3 text-sm text-violet-100 space-y-2">
                  <p>
                    Upload a ZIP in <strong className="text-violet-200">cabinet-pm-customer-import-bundle/v1</strong>{' '}
                    form: optionally <code className="text-xs bg-black/30 px-1 rounded">registration/SystemRegistration.xml</code>,{' '}
                    plus <code className="text-xs bg-black/30 px-1 rounded">fhx/AllExtracts.xlsx</code> from FHXWEBAPP’s Cabinet bundle download.
                  </p>
                  <p className="text-violet-200/90">
                    Order: registration import runs first, then FHX replaces this customer’s simple I/O and charm rows from the workbook and loads module tables (<code className="text-xs bg-black/30 px-1 rounded">dv_*</code>).
                  </p>
                </div>
                <div className="rounded-lg border border-amber-600/40 bg-amber-950/30 p-3 text-xs text-amber-100">
                  Re-importing FHX overwrites cabinet-scoped simple I/O and charm linkage derived from SIMPLE_IO / CHARMS. Confirm cabinet assignments if those keys moved.
                </div>
                <div>
                  <label className="form-label">Bundle ZIP</label>
                  <input
                    ref={bundleZipInputRef}
                    type="file"
                    name="bundle_zip"
                    accept=".zip,application/zip"
                    className="form-input"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowImportBundleModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={bundleImporting}>
                  {bundleImporting ? 'Importing…' : 'Upload bundle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* System Registry Import Modal */}
      {showSystemRegModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-lg w-full mx-4 border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-3 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-base font-semibold text-gray-100">Import System Registry XML</h3>
              <button
                onClick={() => setShowSystemRegModal(false)}
                className="text-gray-400 hover:text-gray-200 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSystemRegImport}>
              <div className="px-5 py-3 space-y-3">
                {systemRegSummary && (
                  <div className={`border rounded-lg p-3 text-sm ${
                    (systemRegSummary.workstations > 0 || systemRegSummary.controllers > 0 || systemRegSummary.smartSwitches > 0)
                      ? 'bg-blue-900/30 border-blue-500'
                      : 'bg-gray-700/30 border-gray-600'
                  }`}>
                    <div className="font-medium text-gray-200 mb-1.5">Current registry</div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-gray-300 text-xs">
                      <div>WS <strong>{systemRegSummary.workstations || 0}</strong></div>
                      <div>Ctrl <strong>{systemRegSummary.controllers || 0}</strong></div>
                      <div>Switch <strong>{systemRegSummary.smartSwitches || 0}</strong></div>
                      <div>I/O <strong>{systemRegSummary.ioDevices || 0}</strong></div>
                      <div>CIOC <strong>{systemRegSummary.charmsIOCards || 0}</strong></div>
                      <div>Charm <strong>{systemRegSummary.charms || 0}</strong></div>
                    </div>
                    {(systemRegSummary.workstations > 0 || systemRegSummary.controllers > 0) && (
                      <p className="text-[11px] text-blue-200/90 mt-2 pt-2 border-t border-blue-700/50">
                        Re-import updates matching names; cabinet assignments are preserved.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="form-label text-sm">XML file</label>
                  <input
                    type="file"
                    name="xml_file"
                    accept=".xml"
                    className="form-input text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">DeltaV System Registry export</p>
                </div>

                <p className="text-[11px] text-amber-200/90 bg-amber-950/25 border border-amber-600/30 rounded px-2 py-1.5">
                  Root elements must match exactly: Workstation, Controller, SmartSwitch, IODevice, CharmsIOCard, Charm, AMSSystem. See{' '}
                  <code className="bg-black/30 px-0.5 rounded text-[10px]">sample-system-registry.xml</code>.
                </p>
              </div>
              <div className="px-5 py-3 border-t border-gray-700 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSystemRegModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  📋 Import Nodes (XML)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Session Modal */}
      {showEditSessionModal && editingSession && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Edit Session</h3>
              <button
                onClick={() => {
                  setShowEditSessionModal(false);
                  setEditingSession(null);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);

                try {
                  const result = await api.updateSession(editingSession.id, data);
                  if (result.success) {
                    soundSystem.playSuccess();
                    setShowEditSessionModal(false);
                    setEditingSession(null);
                    loadCustomerData();
                    showMessage('Session updated successfully', 'success');
                  } else {
                    soundSystem.playError();
                    showMessage(result.error || 'Error updating session', 'error');
                  }
                } catch (error) {
                  soundSystem.playError();
                  showMessage('Error updating session', 'error');
                }
              }}
            >
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Session Name *</label>
                  <input
                    type="text"
                    name="session_name"
                    required
                    defaultValue={editingSession.session_name}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select
                    name="status"
                    defaultValue={editingSession.status || 'active'}
                    className="form-select"
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-between">
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete "${editingSession.session_name}" and all associated data?`)) return;
                    try {
                      const result = await api.deleteSession(editingSession.id);
                      if (result.success) {
                        soundSystem.playSuccess();
                        setShowEditSessionModal(false);
                        setEditingSession(null);
                        loadCustomerData();
                        showMessage('Session deleted successfully', 'success');
                      } else {
                        soundSystem.playError();
                        showMessage('Error deleting session', 'error');
                      }
                    } catch (error) {
                      soundSystem.playError();
                      showMessage('Error deleting session', 'error');
                    }
                  }}
                  className="btn btn-danger"
                >
                  Delete
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditSessionModal(false);
                      setEditingSession(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Duplicate Session Modal */}
      {showDuplicateModal && duplicatingSession && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">Duplicate Session</h3>
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicatingSession(null);
                  setDupNodeScope('all');
                  setDupNodeIds([]);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-gray-300">
                Duplicating: <strong className="text-white">{duplicatingSession.session_name}</strong>
              </p>

              <SessionNodeScopePicker
                customerId={id}
                sessionId={duplicatingSession.id}
                mode={dupNodeScope}
                onModeChange={setDupNodeScope}
                selectedIds={dupNodeIds}
                onSelectedIdsChange={setDupNodeIds}
                allLabel="Include all nodes from this session"
                selectedLabel="Include only specific ones from this session"
                hint="“All” keeps the same node set as the source (including a prior custom scope). Checklist answers still clear."
              />
              
              <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3">
                <p className="text-sm font-medium text-green-300 mb-2">What gets KEPT:</p>
                <ul className="text-sm text-green-200/80 space-y-1">
                  <li>- All cabinets and racks</li>
                  <li>- Controller / CIOC assignments to cabinets</li>
                  <li>- Workstation assignments to racks</li>
                  <li>- Network switch assignments</li>
                  <li>- Distribution blocks (names and metadata; readings cleared)</li>
                  <li>- Diodes (custom names; readings cleared)</li>
                  <li>- Media converters and carrier/baseplates (custom names; readings cleared)</li>
                  <li>- Location assignments</li>
                </ul>
              </div>
              
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
                <p className="text-sm font-medium text-red-300 mb-2">What gets CLEARED:</p>
                <ul className="text-sm text-red-200/80 space-y-1">
                  <li>- Power supply readings (reset to pass)</li>
                  <li>- Distribution block DC readings / pass-fail status (reset)</li>
                  <li>- Diode readings (reset to pass)</li>
                  <li>- Media converter and carrier/baseplate readings (reset to pass)</li>
                  <li>- Inspection pass/fail data (reset to pass)</li>
                  <li>- Node troubleshooting / maintenance checks</li>
                  <li>- I/O error diagnostics</li>
                </ul>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicatingSession(null);
                  setDupNodeScope('all');
                  setDupNodeIds([]);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                disabled={duplicateProgress}
                onClick={async () => {
                  if (dupNodeScope === 'selected' && dupNodeIds.length === 0) {
                    showMessage('Select at least one node, or include all from this session', 'error');
                    return;
                  }
                  setDuplicateProgress(true);
                  try {
                    const result = await api.duplicateSession(duplicatingSession.id, {
                      node_scope: dupNodeScope,
                      node_ids: dupNodeScope === 'selected' ? dupNodeIds : undefined,
                    });
                    if (result.success) {
                      soundSystem.playSuccess();
                      showMessage('Session duplicated successfully! Cabinets and assignments preserved.', 'success');
                      setShowDuplicateModal(false);
                      setDuplicatingSession(null);
                      setDupNodeScope('all');
                      setDupNodeIds([]);
                      loadCustomerData();
                    } else {
                      soundSystem.playError();
                      showMessage(result.error || 'Error duplicating session', 'error');
                    }
                  } catch (error) {
                    soundSystem.playError();
                    showMessage(error?.message || 'Error duplicating session', 'error');
                  } finally {
                    setDuplicateProgress(false);
                  }
                }}
                className="btn btn-primary"
              >
                {duplicateProgress ? 'Duplicating...' : 'Duplicate Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
