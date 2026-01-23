import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function IISession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [showNewDocumentModal, setShowNewDocumentModal] = useState(false);
  const [showHeaderModal, setShowHeaderModal] = useState(false);

  useEffect(() => {
    loadSessionData();
  }, [id]);

  const loadSessionData = async () => {
    try {
      const sessionData = await api.getSession(id);
      
      // If this is a PM session, redirect to PM view
      if (sessionData.session_type !== 'ii') {
        navigate(`/session/${id}`);
        return;
      }
      
      setSession(sessionData);
      
      if (sessionData.customer_id) {
        const customerData = await api.getCustomer(sessionData.customer_id);
        setCustomer(customerData);
      }
      
      // Load I&I documents
      const docs = await api.request(`/api/sessions/${id}/ii-documents`);
      setDocuments(docs || []);
    } catch (error) {
      console.error('Error loading I&I session:', error);
      showMessage('Error loading I&I session data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateDocument = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      const result = await api.request(`/api/sessions/${id}/ii-documents`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      
      if (result) {
        soundSystem.playSuccess();
        setShowNewDocumentModal(false);
        loadSessionData();
        showMessage('Cabinet added to I&I session', 'success');
        e.target.reset();
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error adding cabinet', 'error');
    }
  };

  const handleSaveHeader = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      const result = await api.request(`/api/sessions/${id}/ii-header`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      
      if (result) {
        soundSystem.playSuccess();
        setShowHeaderModal(false);
        loadSessionData();
        showMessage('I&I header information saved', 'success');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error saving header information', 'error');
    }
  };

  const handleExportPDF = async () => {
    try {
      showMessage('Generating I&I PDF reports for all cabinets...', 'info');
      
      const response = await fetch(`/api/sessions/${id}/export-all-ii-pdfs`, {
        method: 'POST',
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `II-Report-${session.session_name}-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        soundSystem.playSuccess();
        showMessage('✅ I&I PDF generated and downloaded successfully!', 'success');
      } else {
        soundSystem.playError();
        showMessage('Error generating PDF', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error generating PDF: ' + error.message, 'error');
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
          <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
            Go Back
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-gray-400">
        <Link to="/customers" className="hover:text-gray-200">Customers</Link>
        <span className="mx-2">›</span>
        <Link to={`/customer/${customer?.id}`} className="hover:text-gray-200">
          {customer?.name || 'Customer'}
        </Link>
        <span className="mx-2">›</span>
        <span className="text-gray-200">I&I Session</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-8 animate-fadeIn">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">
            🔧 {session.session_name}
          </h1>
          <div className="flex gap-3 items-center">
            <span className="badge badge-warning text-lg">I&I Session</span>
            {session.status === 'completed' && (
              <span className="badge badge-green">✅ Completed</span>
            )}
            {customer && (
              <p className="text-gray-400 text-lg">{customer.name}</p>
            )}
          </div>
          {session.deltav_system_id && (
            <p className="text-gray-400 mt-2">
              <strong>DeltaV System ID:</strong> {session.deltav_system_id}
            </p>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowHeaderModal(true)}
            className="btn btn-secondary"
          >
            ⚙️ Edit Header Info
          </button>
          <button
            onClick={handleExportPDF}
            className="btn btn-warning"
            disabled={documents.length === 0}
          >
            📄 Export PDF Report
          </button>
          <button
            onClick={() => navigate(`/customer/${customer?.id}`)}
            className="btn btn-secondary"
          >
            ← Back to Customer
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-900/50 text-green-200 border border-green-500'
              : message.type === 'error'
              ? 'bg-red-900/50 text-red-200 border border-red-500'
              : 'bg-blue-900/50 text-blue-200 border border-blue-500'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* I&I Documents List */}
      <div className="card">
        <div className="card-header flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-100">
            📋 Installation & Integration Checklists
          </h2>
          <button
            onClick={() => setShowNewDocumentModal(true)}
            className="btn btn-primary"
            disabled={session.status === 'completed'}
          >
            ➕ Add Cabinet/Enclosure
          </button>
        </div>
        <div className="card-body">
          {documents.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔧</div>
              <p className="text-gray-400 text-lg mb-4">
                No cabinets added yet. Start by adding your first cabinet to inspect.
              </p>
              <button
                onClick={() => setShowNewDocumentModal(true)}
                className="btn btn-primary btn-lg"
              >
                ➕ Add Your First Cabinet
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc, index) => (
                <div
                  key={doc.id}
                  className="bg-gray-700/50 rounded-lg p-6 border border-gray-600 hover:border-blue-500 transition-colors cursor-pointer"
                  onClick={() => navigate(`/ii-document/${doc.id}`)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-semibold text-gray-100">
                      {doc.document_name || `Cabinet ${index + 1}`}
                    </h3>
                    <span className="badge badge-blue text-xs">#{index + 1}</span>
                  </div>
                  {doc.deltav_system_id && (
                    <p className="text-sm text-gray-400 mb-2">
                      <strong>System ID:</strong> {doc.deltav_system_id}
                    </p>
                  )}
                  {doc.location && (
                    <p className="text-sm text-gray-400 mb-2">
                      <strong>Location:</strong> {doc.location}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-3">
                    Created: {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/ii-document/${doc.id}`);
                      }}
                      className="btn btn-primary btn-sm flex-1"
                    >
                      Open Checklist
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Template Information */}
      <div className="card mt-6">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-100">
            📖 I&I Checklist Sections
          </h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div>
              <h4 className="font-semibold text-gray-100 mb-2">✅ Inspection Sections:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Equipment Necessary</li>
                <li>Good Engineering Practices</li>
                <li>Power and Grounding Connections</li>
                <li>Enclosures</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-100 mb-2">🔌 System Checks:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>AC Power System and Distribution</li>
                <li>DC Power System and Distribution</li>
                <li>DeltaV Controllers</li>
                <li>List of Equipment Used</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Header Info Modal */}
      {showHeaderModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">
                I&I Session Header Information
              </h3>
              <button
                onClick={() => setShowHeaderModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSaveHeader}>
              <div className="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
                <div>
                  <label className="form-label">Customer Name</label>
                  <input
                    type="text"
                    name="ii_customer_name"
                    defaultValue={session.ii_customer_name || customer?.name}
                    className="form-input"
                    placeholder="Customer name for PDF"
                  />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    name="ii_location"
                    defaultValue={session.ii_location || customer?.location}
                    className="form-input"
                    placeholder="e.g., Mill Hall, PA"
                  />
                </div>
                <div>
                  <label className="form-label">DeltaV System ID *</label>
                  <input
                    type="text"
                    name="deltav_system_id"
                    required
                    defaultValue={session.deltav_system_id}
                    className="form-input"
                    placeholder="e.g., DELTAV-001"
                  />
                </div>
                <div>
                  <label className="form-label">Performed By</label>
                  <input
                    type="text"
                    name="ii_performed_by"
                    defaultValue={session.ii_performed_by}
                    className="form-input"
                    placeholder="Technician name(s)"
                  />
                </div>
                <div>
                  <label className="form-label">Date Performed</label>
                  <input
                    type="date"
                    name="ii_date_performed"
                    defaultValue={session.ii_date_performed || new Date().toISOString().split('T')[0]}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowHeaderModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Header Info
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Document Modal */}
      {showNewDocumentModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">
                Add Cabinet/Enclosure
              </h3>
              <button
                onClick={() => setShowNewDocumentModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateDocument}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Cabinet/Enclosure Name *</label>
                  <input
                    type="text"
                    name="document_name"
                    required
                    className="form-input"
                    placeholder="e.g., Control Room Cabinet 1"
                  />
                </div>
                <div>
                  <label className="form-label">DeltaV System ID</label>
                  <input
                    type="text"
                    name="deltav_system_id"
                    defaultValue={session.deltav_system_id}
                    className="form-input"
                    placeholder="e.g., DELTAV-001"
                  />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    name="location"
                    className="form-input"
                    placeholder="e.g., Building A, Floor 2"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewDocumentModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Cabinet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
