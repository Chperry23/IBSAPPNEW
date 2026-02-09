import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const [customersData, sessionsData] = await Promise.all([
        api.getCustomers(),
        api.getSessions(),
      ]);
      setCustomers(customersData);
      setSessions(sessionsData);
    } catch (error) {
      console.error('Error loading customers:', error);
      showMessage('Error loading customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Calculate session counts for each customer
  const getCustomerStats = (customerId) => {
    const customerSessions = sessions.filter(s => s.customer_id === customerId);
    return {
      totalSessions: customerSessions.length,
      activeSessions: customerSessions.filter(s => s.status !== 'completed').length,
    };
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
      const result = editingCustomer
        ? await api.updateCustomer(editingCustomer.id, data)
        : await api.createCustomer(data);

      if (result.success) {
        soundSystem.playSuccess();
        setShowModal(false);
        setEditingCustomer(null);
        loadCustomers();
        showMessage(
          editingCustomer ? 'Customer updated successfully' : 'Customer created successfully',
          'success'
        );
        e.target.reset();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error saving customer', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error saving customer', 'error');
    }
  };

  const handleDelete = async (customerId) => {
    const customer = customers.find((c) => c.id === customerId);
    const stats = getCustomerStats(customerId);
    
    const warningMessage = stats.totalSessions > 0
      ? `⚠️ WARNING: This will permanently delete "${customer.name}" and ALL ${stats.totalSessions} associated PM sessions and cabinet data.\n\nThis action cannot be undone. Are you absolutely sure?`
      : `Delete customer "${customer.name}"?`;
    
    if (!confirm(warningMessage)) {
      return;
    }

    try {
      const result = await api.deleteCustomer(customerId);
      if (result.success) {
        soundSystem.playSuccess();
        loadCustomers();
        showMessage('Customer deleted successfully', 'success');
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Error deleting customer', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Error deleting customer', 'error');
    }
  };
  
  const navigate = useNavigate();

  // Filter and sort customers
  const filteredCustomers = customers
    .filter((customer) => {
      const search = searchTerm.toLowerCase();
      return (
        customer.name.toLowerCase().includes(search) ||
        (customer.location && customer.location.toLowerCase().includes(search)) ||
        (customer.contact_info && customer.contact_info.toLowerCase().includes(search)) ||
        (customer.contact_person && customer.contact_person.toLowerCase().includes(search)) ||
        (customer.email && customer.email.toLowerCase().includes(search)) ||
        (customer.phone && customer.phone.toLowerCase().includes(search)) ||
        (customer.dongle_id && customer.dongle_id.toLowerCase().includes(search)) ||
        (customer.company_name && customer.company_name.toLowerCase().includes(search)) ||
        (customer.city && customer.city.toLowerCase().includes(search)) ||
        (customer.state && customer.state.toLowerCase().includes(search))
      );
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'location') {
        return (a.location || '').localeCompare(b.location || '');
      } else if (sortBy === 'sessions') {
        return getCustomerStats(b.id).totalSessions - getCustomerStats(a.id).totalSessions;
      } else if (sortBy === 'created') {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      return 0;
    });

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex justify-between items-center mb-8 animate-fadeIn">
        <div>
          <h1 className="text-4xl font-bold gradient-text mb-2">👥 Customers</h1>
          <p className="text-gray-400">Manage your customer database and access their PM sessions</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowBulkImportModal(true)}
            className="btn btn-success"
          >
            📤 Bulk Import
          </button>
          <button
            onClick={() => {
              setEditingCustomer(null);
              setShowModal(true);
            }}
            className="btn btn-primary"
          >
            ➕ Add Customer
          </button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="🔍 Search customers by name, location, contact..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSearchTerm('')}
                className="btn btn-secondary text-sm"
              >
                Clear
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="form-select"
              >
                <option value="name">Sort by Name</option>
                <option value="location">Sort by Location</option>
                <option value="sessions">Sort by Sessions</option>
                <option value="created">Sort by Created Date</option>
              </select>
            </div>
          </div>
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

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCustomers.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-400">
              {searchTerm ? 'No customers match your search.' : 'No customers yet. Add your first customer to get started.'}
            </p>
          </div>
        ) : (
          filteredCustomers.map((customer) => {
            const stats = getCustomerStats(customer.id);
            return (
              <div
                key={customer.id}
                className="card hover:border-blue-500/50 transition-all cursor-pointer"
                onClick={() => navigate(`/customer/${customer.id}`)}
              >
                <div className="card-header">
                  <h3 className="text-lg font-semibold text-gray-100">
                    {customer.dongle_id || customer.name}
                  </h3>
                </div>
                <div className="card-body">
                  {/* Customer Info */}
                  <div className="space-y-1.5 mb-4 text-sm">
                    {customer.location && (
                      <p className="text-gray-400">
                        <strong className="text-gray-300">Location:</strong> {customer.location}
                      </p>
                    )}
                    {customer.company_name && (
                      <p className="text-gray-400">
                        <strong className="text-gray-300">Company:</strong> {customer.company_name}
                      </p>
                    )}
                    {customer.contact_info && (
                      <p className="text-gray-400">
                        <strong className="text-gray-300">Contact:</strong> {customer.contact_info}
                      </p>
                    )}
                    {customer.contact_person && (
                      <p className="text-gray-400">
                        <strong className="text-gray-300">Person:</strong> {customer.contact_person}
                      </p>
                    )}
                    {customer.email && (
                      <p className="text-gray-400">
                        <strong className="text-gray-300">Email:</strong> {customer.email}
                      </p>
                    )}
                    {customer.phone && (
                      <p className="text-gray-400">
                        <strong className="text-gray-300">Phone:</strong> {customer.phone}
                      </p>
                    )}
                    {(customer.street_address || customer.city || customer.state) && (
                      <p className="text-gray-400">
                        <strong className="text-gray-300">Address:</strong>{' '}
                        {[
                          customer.street_address,
                          [customer.city, customer.state].filter(Boolean).join(', '),
                          customer.zip,
                          customer.country
                        ].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Session Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-gray-700">
                    <div className="text-center bg-gray-700/50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-blue-400">{stats.totalSessions}</div>
                      <div className="text-xs text-gray-400">Total Sessions</div>
                    </div>
                    <div className="text-center bg-gray-700/50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-green-400">{stats.activeSessions}</div>
                      <div className="text-xs text-gray-400">Active Sessions</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Link
                      to={`/sessions?customer=${customer.id}&name=${encodeURIComponent(
                        customer.name
                      )}`}
                      className="flex-1 btn btn-primary text-sm py-2"
                    >
                      View Sessions
                    </Link>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCustomer(customer);
                        setShowModal(true);
                      }}
                      className="btn btn-secondary text-sm py-2"
                      title="Edit Customer"
                    >
                      ⚙️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(customer.id);
                      }}
                      className="btn btn-danger text-sm py-2"
                      title="Delete Customer"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Customer Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">
                {editingCustomer ? 'Edit Customer' : 'New Customer'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingCustomer(null);
                }}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">Customer Name *</label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={editingCustomer?.name}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    name="location"
                    defaultValue={editingCustomer?.location}
                    placeholder="e.g., Manufacturing Plant - Chicago"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Contact Info</label>
                  <textarea
                    name="contact_info"
                    rows="3"
                    defaultValue={editingCustomer?.contact_info}
                    placeholder="General contact information..."
                    className="form-textarea"
                  ></textarea>
                </div>
                <div>
                  <label className="form-label">Contact Person</label>
                  <input
                    type="text"
                    name="contact_person"
                    defaultValue={editingCustomer?.contact_person}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editingCustomer?.email}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={editingCustomer?.phone}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Address</label>
                  <textarea
                    name="address"
                    rows="2"
                    defaultValue={editingCustomer?.address}
                    placeholder="Full address..."
                    className="form-textarea"
                  ></textarea>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCustomer(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingCustomer ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Customers Modal */}
      {showBulkImportModal && (
        <div className="modal-backdrop">
          <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-100">📤 Bulk Import Customers</h3>
              <button
                onClick={() => setShowBulkImportModal(false)}
                className="text-gray-400 hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const csvData = e.target.csv_data.value;
                
                // Parse CSV
                const lines = csvData.split('\n').filter((l) => l.trim());
                if (lines.length < 2) {
                  showMessage('CSV must have header and at least one row', 'error');
                  return;
                }

                const customers = lines.slice(1).map((line) => {
                  const [name, location, contact_info] = line.split(',').map((v) => v.trim());
                  return { name, location: location || '', contact_info: contact_info || '' };
                }).filter((c) => c.name);

                try {
                  soundSystem.playSuccess();
                  showMessage(`Importing ${customers.length} customers...`, 'info');
                  
                  let successCount = 0;
                  for (const customer of customers) {
                    const result = await api.createCustomer(customer);
                    if (result.success) successCount++;
                  }
                  
                  setShowBulkImportModal(false);
                  loadCustomers();
                  soundSystem.playSuccess();
                  showMessage(`Successfully imported ${successCount} customers`, 'success');
                } catch (error) {
                  soundSystem.playError();
                  showMessage('Error importing customers', 'error');
                }
              }}
            >
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="form-label">CSV Data</label>
                  <textarea
                    name="csv_data"
                    rows="12"
                    placeholder="Name,Location,Contact Info&#10;Company A,Building 1,John Doe - 555-1234&#10;Company B,Building 2,Jane Smith - 555-5678&#10;..."
                    className="form-textarea font-mono text-sm"
                  ></textarea>
                  <p className="text-sm text-gray-400 mt-2">
                    💡 Format: Name,Location,Contact Info (one per line, header required)
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
                  📤 Import Customers
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
