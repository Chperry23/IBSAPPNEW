import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function Sync() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [unsyncedCounts, setUnsyncedCounts] = useState({});
  const [lastSyncTimes, setLastSyncTimes] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('unknown');

  useEffect(() => {
    loadSyncData();
  }, []);

  const loadSyncData = async () => {
    try {
      const [device, status, unsynced, lastSync, connection] = await Promise.all([
        api.request('/api/sync/device/info'),
        api.request('/api/sync/enhanced-merge/status'),
        api.request('/api/sync/unsynced/counts'),
        api.request('/api/sync/last-sync/times'),
        api.request('/api/sync/connection/test').catch(() => ({ connected: false })),
      ]);

      setDeviceInfo(device);
      setSyncStatus(status);
      setUnsyncedCounts(unsynced);
      setLastSyncTimes(lastSync);
      setConnectionStatus(connection.connected ? 'connected' : 'disconnected');
    } catch (error) {
      console.error('Error loading sync data:', error);
      showMessage('Error loading sync data', 'error');
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleFullSync = async () => {
    if (!confirm('Start full sync with cloud? This will sync all data.')) return;

    setSyncing(true);
    showMessage('Starting full sync with cleanup...', 'info');

    try {
      const result = await api.request('/api/sync/enhanced-merge/full-with-cleanup', {
        method: 'POST',
      });

      if (result.success) {
        soundSystem.playSuccess();
        showMessage(`Sync completed! ${result.summary || ''}`, 'success');
        loadSyncData();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Sync failed', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Sync failed: ' + error.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handlePullSync = async () => {
    setSyncing(true);
    showMessage('Pulling data from cloud...', 'info');

    try {
      const result = await api.request('/api/sync/enhanced-merge/pull-with-cleanup', {
        method: 'POST',
      });

      if (result.success) {
        soundSystem.playSuccess();
        showMessage(`Pull completed! Downloaded ${result.pulled || 0} records`, 'success');
        loadSyncData();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Pull failed', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Pull failed: ' + error.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handlePushSync = async () => {
    if (unsyncedCounts.total === 0) {
      showMessage('No unsynced data to push', 'info');
      return;
    }

    setSyncing(true);
    showMessage('Pushing data to cloud...', 'info');

    try {
      const result = await api.request('/api/sync/enhanced-merge/push', {
        method: 'POST',
      });

      if (result.success) {
        soundSystem.playSuccess();
        showMessage(`Push completed! Uploaded ${result.pushed || 0} records`, 'success');
        loadSyncData();
      } else {
        soundSystem.playError();
        showMessage(result.error || 'Push failed', 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Push failed: ' + error.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Layout>
      <div className="mb-8 animate-fadeIn">
        <h1 className="text-4xl font-bold gradient-text mb-2">🔄 Data Synchronization</h1>
        <p className="text-gray-400">Sync data between this device and the cloud server</p>
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

      {/* Device Info */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-100">📱 Device Information</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase mb-1">Device ID</div>
              <div className="text-gray-200 font-mono text-sm bg-gray-700/50 px-3 py-2 rounded">
                {deviceInfo?.deviceId || 'Loading...'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase mb-1">Connection Status</div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    connectionStatus === 'connected'
                      ? 'bg-green-400 animate-pulse'
                      : 'bg-red-400'
                  }`}
                ></div>
                <span className="text-gray-200">
                  {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unsynced Data Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-3xl font-bold text-red-400">
            {unsyncedCounts.total || 0}
          </div>
          <div className="text-sm text-gray-400">Total Unsynced</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-2xl font-bold text-blue-400">
            {unsyncedCounts.sessions || 0}
          </div>
          <div className="text-sm text-gray-400">Sessions</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-2xl font-bold text-purple-400">
            {unsyncedCounts.cabinets || 0}
          </div>
          <div className="text-sm text-gray-400">Cabinets</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-2xl font-bold text-green-400">
            {unsyncedCounts.nodes || 0}
          </div>
          <div className="text-sm text-gray-400">Nodes</div>
        </div>
      </div>

      {/* Sync Actions */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-100">⚡ Sync Actions</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={handleFullSync}
              disabled={syncing}
              className="btn btn-primary h-24 flex flex-col items-center justify-center"
            >
              <div className="text-2xl mb-2">🔄</div>
              <div className="font-semibold">Full Sync</div>
              <div className="text-xs opacity-75">Bi-directional sync</div>
            </button>
            <button
              onClick={handlePullSync}
              disabled={syncing}
              className="btn btn-success h-24 flex flex-col items-center justify-center"
            >
              <div className="text-2xl mb-2">⬇️</div>
              <div className="font-semibold">Pull from Cloud</div>
              <div className="text-xs opacity-75">Download latest</div>
            </button>
            <button
              onClick={handlePushSync}
              disabled={syncing || unsyncedCounts.total === 0}
              className="btn btn-warning h-24 flex flex-col items-center justify-center"
            >
              <div className="text-2xl mb-2">⬆️</div>
              <div className="font-semibold">Push to Cloud</div>
              <div className="text-xs opacity-75">Upload changes</div>
            </button>
          </div>
        </div>
      </div>

      {/* Last Sync Times */}
      {lastSyncTimes && Object.keys(lastSyncTimes).length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-100">⏱️ Last Sync Times</h3>
          </div>
          <div className="card-body">
            <div className="space-y-2">
              {Object.entries(lastSyncTimes).map(([table, time]) => (
                <div key={table} className="flex justify-between items-center py-2 border-b border-gray-700">
                  <span className="text-gray-400 capitalize">{table.replace(/_/g, ' ')}</span>
                  <span className="text-gray-200">
                    {time ? new Date(time).toLocaleString() : 'Never'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sync Status */}
      {syncStatus && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-semibold text-gray-100">📊 Sync Status</h3>
          </div>
          <div className="card-body">
            <pre className="text-xs text-gray-400 bg-gray-900/50 p-4 rounded-lg overflow-auto">
              {JSON.stringify(syncStatus, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Layout>
  );
}
