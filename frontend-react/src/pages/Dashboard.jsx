import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    total_customers: 0,
    total_sessions: 0,
    completed_sessions: 0,
    total_cabinets: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load stats
      const statsData = await api.getDashboardStats();
      setStats(statsData);

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#2d2d44] border-t-blue-500"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 animate-fadeIn">
        <h1 className="text-4xl font-bold gradient-text mb-2">Dashboard</h1>
        <p className="text-gray-400">Professional Control Cabinet Preventative Maintenance System</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-blue-400 mb-2">{stats.total_customers}</div>
              <div className="text-sm text-gray-400">Total Customers</div>
            </div>
            <div className="text-4xl">👥</div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-purple-400 mb-2">{stats.total_sessions}</div>
              <div className="text-sm text-gray-400">PM Sessions</div>
            </div>
            <div className="text-4xl">📋</div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-green-400 mb-2">{stats.completed_sessions}</div>
              <div className="text-sm text-gray-400">Completed</div>
            </div>
            <div className="text-4xl">✅</div>
          </div>
        </div>
        <div className="stats-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-cyan-400 mb-2">{stats.total_cabinets}</div>
              <div className="text-sm text-gray-400">Total Cabinets</div>
            </div>
            <div className="text-4xl">🗄️</div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* What's New */}
        <div className="card flex flex-col">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-100">What's New</h2>
            <span className="text-xs text-gray-400 font-mono">May 2026</span>
          </div>
          <div className="card-body overflow-y-auto max-h-[420px] space-y-4 pr-1">

            {/* v2.7 entry */}
            <div className="border-l-4 border-violet-500 pl-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold bg-violet-600 text-white px-2 py-0.5 rounded">v2.7 — May 15</span>
              </div>
              <ul className="text-sm text-gray-300 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">~</span>
                  <span><strong className="text-gray-100">Duplicate session / cabinets</strong> — Duplicating a PM session now carries over cabinet structure more reliably, including equipment labels and related options you choose at copy time, so new sessions do not drop or mis-link cabinet data.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">~</span>
                  <span><strong className="text-gray-100">Import nodes (System Registry)</strong> — Import is <strong className="text-gray-200">file upload only</strong> (paste XML removed). Modals on the customer page and System Registry tracking page are <strong className="text-gray-200">smaller and simpler</strong> so the flow matches how teams actually import.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">~</span>
                  <span><strong className="text-gray-100">CIOC charms / I/O errors</strong> — Controllers marked as <strong className="text-gray-200">CIOC</strong> again use the <strong className="text-gray-200">two-stage charm picker</strong> when adding I/O errors. Fixed a crash when registry data was still loading (<strong className="text-gray-200">null cards</strong>) and aligned detection with controller type and diagnostics.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">First-time cloud download</strong> — On a <strong className="text-gray-200">brand-new database</strong> (no customers, sessions, or cabinets yet), Cloud Sync offers a <strong className="text-gray-200">one-time fast full pull</strong> from the cloud with less per-record work. Regular download also benefits from <strong className="text-gray-200">cached schema metadata</strong> so large pulls are quicker.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">~</span>
                  <span><strong className="text-gray-100">Customer import bundle</strong> — ZIP bundle path (registration XML + FHX workbook) continues to align with the expected manifest; use it when you need FHX-driven I/O and module tables in one step.</span>
                </li>
              </ul>
            </div>

            {/* v2.6 entry */}
            <div className="border-l-4 border-sky-500 pl-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold bg-sky-600 text-white px-2 py-0.5 rounded">v2.6 — May 7</span>
              </div>
              <ul className="text-sm text-gray-300 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">PM APP branding</strong> — App title is PM APP with a logo asset (<strong className="text-gray-200">public/logo.svg</strong> — replace with your own file). Login and shell headers updated.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Sidebar navigation</strong> — Main nav defaults to a left sidebar; open <strong className="text-gray-200">Profile</strong> to switch to classic <strong className="text-gray-200">top navigation</strong> (saved on this device).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Profile & settings</strong> — New <strong className="text-gray-200">/profile</strong> page for account note and layout preference; top bar uses a compact profile icon so the menu stays clean.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">~</span>
                  <span><strong className="text-gray-100">Visual refresh</strong> — Dark navy palette and stronger buttons/cards for readability during long PM work.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Custom workstations</strong> — When adding a custom workstation, model is either <strong className="text-gray-200">DeltaV Workstation</strong> or <strong className="text-gray-200">Non DeltaV workstation</strong> (clear segmented choice).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">I/O errors — No Card</strong> — Register <strong className="text-gray-200">No Card</strong> per card type when the controller has config for that type but no numbered cards; copy and tiles explain it applies to the <strong className="text-gray-200">whole card type</strong> on that controller.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">~</span>
                  <span><strong className="text-gray-100">I/O errors UI</strong> — Expand/collapse uses a standard rotating chevron; <strong className="text-gray-200">Add Error</strong> opens on <strong className="text-gray-200">Manual Entry</strong> first with Detected Cards as the alternate tab.</span>
                </li>
              </ul>
            </div>

            {/* v2.5 entry */}
            <div className="border-l-4 border-emerald-500 pl-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded">v2.5 — May 6</span>
              </div>
              <ul className="text-sm text-gray-300 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">I/O diagnostics — empty controllers</strong> — If System Registry has no I/O devices for a controller, Detected Cards no longer shows a blank step; you get guidance to use Manual Entry. Pick-card flow always opens for non-CIOC controllers.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">No Card manual entry</strong> — Choose a card type, then No Card, then <strong className="text-gray-200">Submit</strong> (the button reads <strong className="text-gray-200">Select card type first</strong> until a type is chosen so it is obvious why Submit was disabled). Saving opens the I/O error form for that No Card slot right away.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">~</span>
                  <span><strong className="text-gray-100">No Card data consistency</strong> — Same “no physical card” slot is handled reliably whether the sentinel is stored as −1 or a string from the API; duplicate slot detection uses normalized card numbers.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">~</span>
                  <span><strong className="text-gray-100">System Registry import and customer alias</strong> — UserInfo from XML still updates company/address/contact fields when present, but <strong className="text-gray-100">customer name and alias</strong> stay as you set them in the customer profile (never overwritten by import).</span>
                </li>
              </ul>
            </div>

            {/* v2.4 entry */}
            <div className="border-l-4 border-blue-500 pl-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">v2.4 — Apr 24</span>
              </div>
              <ul className="text-sm text-gray-300 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Redundancy check</strong> — risk engine now flags controllers that have a partner but redundancy was not verified during PM.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Risk scoring rebalanced</strong> — tier weights changed to 40-40-20 (critical / moderate / slight) and power supply failures carry more weight.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Critical issue hard cap</strong> — any critical fault now forces site score to WARNING or below (−20 pts per issue, max 79 cap).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Searchable customer picker</strong> — New PM Session modal now has a live-search dropdown instead of a plain list.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5 shrink-0">~</span>
                  <span><strong className="text-gray-100">Connection diagnostics</strong> — sync now logs DNS, TCP port, and auth checks separately to help troubleshoot VPN issues.</span>
                </li>
              </ul>
            </div>

            {/* v2.3 entry */}
            <div className="border-l-4 border-purple-500 pl-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold bg-purple-700 text-white px-2 py-0.5 rounded">v2.3 — Apr 24</span>
              </div>
              <ul className="text-sm text-gray-300 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Duplicate cabinet</strong> — copy a cabinet's structure and component counts into a new cabinet with a fresh inspection state.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Cabinet notes in PDF</strong> — comments entered on a cabinet now appear in the generated PDF report.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Switch software revision</strong> — RM200 and FP50 firmware now populates automatically in cabinet inspection when a switch is linked.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Expanded node types</strong> — Virtual nodes (VRTX, Host, File Witness), full DeltaV workstation types, Batch Historian, OPC Server, and more added to manual node creation.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 shrink-0">+</span>
                  <span><strong className="text-gray-100">Risk score debug logging</strong> — PDF generation logs all found errors and the full score breakdown to console for verification.</span>
                </li>
              </ul>
            </div>

          </div>
        </div>

        {/* Quick Links */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-xl font-semibold text-gray-100">Quick Links</h2>
          </div>
          <div className="card-body space-y-3">
            <Link to="/customers" className="block p-4 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg border border-gray-600 hover:border-blue-500 transition-all">
              <div className="flex items-center gap-3">
                <div className="text-2xl">👥</div>
                <div>
                  <div className="font-medium text-gray-200">Customers</div>
                  <div className="text-xs text-gray-400">Manage customer database</div>
                </div>
              </div>
            </Link>
            <Link to="/sessions?action=new" className="block p-4 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg border border-gray-600 hover:border-green-500 transition-all">
              <div className="flex items-center gap-3">
                <div className="text-2xl">📋</div>
                <div>
                  <div className="font-medium text-gray-200">New PM Session</div>
                  <div className="text-xs text-gray-400">Create new session</div>
                </div>
              </div>
            </Link>
            <Link to="/csv-tracking" className="block p-4 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg border border-gray-600 hover:border-cyan-500 transition-all">
              <div className="flex items-center gap-3">
                <div className="text-2xl">📈</div>
                <div>
                  <div className="font-medium text-gray-200">System Registry</div>
                  <div className="text-xs text-gray-400">View & manage imports</div>
                </div>
              </div>
            </Link>
            <Link to="/sync" className="block p-4 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg border border-gray-600 hover:border-purple-500 transition-all">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🔄</div>
                <div>
                  <div className="font-medium text-gray-200">Sync Data</div>
                  <div className="text-xs text-gray-400">Cloud synchronization</div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
