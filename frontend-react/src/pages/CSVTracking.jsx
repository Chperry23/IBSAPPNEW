import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../services/api';

export default function CSVTracking() {
  const [csvHistory, setCSVHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCSVHistory();
  }, []);

  const loadCSVHistory = async () => {
    try {
      // This endpoint will need to be created
      const data = await api.request('/api/csv-history');
      setCSVHistory(data || []);
    } catch (error) {
      console.error('Error loading CSV history:', error);
    } finally {
      setLoading(false);
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

  return (
    <Layout>
      <div className="mb-8 animate-fadeIn">
        <h1 className="text-4xl font-bold gradient-text mb-2">📊 CSV Import History</h1>
        <p className="text-gray-400">Track node CSV imports for each customer</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-xl font-semibold text-gray-100">Import History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table-dark">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Nodes Imported</th>
                <th>Last Import Date</th>
                <th>CSV File</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {csvHistory.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-gray-400">
                    No CSV imports yet. Import nodes from a customer profile to see history here.
                  </td>
                </tr>
              ) : (
                csvHistory.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <Link
                        to={`/customer/${record.customer_id}`}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        {record.customer_name}
                      </Link>
                    </td>
                    <td>{record.node_count} nodes</td>
                    <td>{new Date(record.imported_at).toLocaleString()}</td>
                    <td className="text-sm text-gray-400">{record.filename || 'N/A'}</td>
                    <td>
                      <Link
                        to={`/nodes/${record.customer_id}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        View Nodes
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
