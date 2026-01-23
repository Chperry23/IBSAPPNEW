import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import soundSystem from '../utils/sounds';

export default function Sync() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    await Promise.all([
      loadDeviceInfo(),
      testConnection(),
      refreshStatus(),
    ]);
  };

  const loadDeviceInfo = async () => {
    try {
      const result = await api.request('/api/sync/device/info');
      setDeviceInfo(result);
    } catch (error) {
      console.error('Error loading device info:', error);
    }
  };

  const testConnection = async () => {
    try {
      // Use GET method instead of POST
      const result = await api.request('/api/sync/connection/test');
      setConnectionStatus(result);
    } catch (error) {
      console.error('Error testing connection:', error);
      setConnectionStatus({ success: false, error: error.message });
    }
  };

  const refreshStatus = async () => {
    try {
      setLoading(true);
      const [status, unsynced, lastSync] = await Promise.all([
        api.request('/api/sync/enhanced-merge/status'),
        api.request('/api/sync/unsynced/counts'),
        api.request('/api/sync/last-sync/times'),
      ]);

      if (status.success && status.status) {
        setSyncStatus({
          ...status.status,
          unsyncedCounts: unsynced,
          lastSyncTimes: lastSync,
        });
      }
    } catch (error) {
      console.error('Error refreshing status:', error);
      showMessage('Error loading sync status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    if (type !== 'info' || !text.includes('...')) {
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const downloadFromCloud = async () => {
    setSyncing(true);
    showMessage('Downloading latest data from cloud...', 'info');
    try {
      const result = await api.request('/api/sync/enhanced-merge/pull', { method: 'POST' });
      if (result.success) {
        const conflictMsg = result.totalConflicts > 0 
          ? ` (${result.totalConflicts} conflicts - your changes preserved)` 
          : '';
        soundSystem.playSuccess();
        showMessage(`✅ Downloaded ${result.totalPulled} records${conflictMsg}`, 'success');
        refreshStatus();
      } else {
        soundSystem.playError();
        showMessage(`❌ Download failed: ${result.error}`, 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Download failed!', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const uploadToCloud = async () => {
    setSyncing(true);
    showMessage('Uploading your changes to cloud...', 'info');
    try {
      const result = await api.request('/api/sync/enhanced-merge/push', { method: 'POST' });
      if (result.success) {
        soundSystem.playSuccess();
        showMessage(`✅ Uploaded ${result.totalPushed} records`, 'success');
        refreshStatus();
      } else {
        soundSystem.playError();
        showMessage(`❌ Upload failed: ${result.error}`, 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Upload failed!', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    showMessage('Syncing all data with cloud...', 'info');
    try {
      const result = await api.request('/api/sync/enhanced-merge/full', { method: 'POST' });
      if (result.success) {
        soundSystem.playSuccess();
        showMessage(`✅ Sync complete!`, 'success');
        refreshStatus();
      } else {
        soundSystem.playError();
        showMessage(`❌ Sync failed: ${result.error}`, 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Sync failed!', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const resetSync = async () => {
    if (!confirm('This will mark all data as unsynced. Continue?')) {
      return;
    }
    setSyncing(true);
    showMessage('Resetting sync status...', 'info');
    try {
      const result = await api.request('/api/sync/enhanced-merge/reset-sync-state', { method: 'POST' });
      if (result.success) {
        soundSystem.playSuccess();
        showMessage(`✅ Reset ${result.totalReset} records`, 'success');
        refreshStatus();
      } else {
        soundSystem.playError();
        showMessage(`❌ Reset failed: ${result.error}`, 'error');
      }
    } catch (error) {
      soundSystem.playError();
      showMessage('Reset failed!', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const calculateTotalUnsynced = () => {
    if (!syncStatus?.unsyncedCounts) return 0;
    return Object.values(syncStatus.unsyncedCounts).reduce((sum, count) => sum + count, 0);
  };

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold gradient-text mb-2">Cloud Sync</h1>
        <p className="text-gray-400">Keep your data synchronized across all devices</p>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-green-900/30 text-green-200 border border-green-500/50'
              : message.type === 'error'
              ? 'bg-red-900/30 text-red-200 border border-red-500/50'
              : 'bg-blue-900/30 text-blue-200 border border-blue-500/50'
          }`}
        >
          <div className="flex items-center">
            {message.type === 'info' && message.text.includes('...') && (
              <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin mr-3"></div>
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-2xl font-bold hover:opacity-75 ml-4">&times;</button>
        </div>
      )}

      {/* Connection & Device Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Connection Status */}
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-100">Cloud Server</h3>
            <button onClick={testConnection} className="btn-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm">
              Test
            </button>
          </div>
          <div className="card-body">
            {connectionStatus ? (
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full ${connectionStatus.success ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <div>
                  <div className={`font-semibold ${connectionStatus.success ? 'text-green-400' : 'text-red-400'}`}>
                    {connectionStatus.success ? 'Connected' : 'Not Connected'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    mongodb://172.16.10.124:27017/cabinet_pm_db
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">Checking connection...</p>
            )}
          </div>
        </div>

        {/* Device Info */}
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-100">This Device</h3>
            <button onClick={loadDeviceInfo} className="btn-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm">
              Refresh
            </button>
          </div>
          <div className="card-body">
            {deviceInfo ? (
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-gray-500 uppercase">Device ID</div>
                  <div className="font-mono text-sm text-blue-300 truncate">{deviceInfo.deviceId}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase">Hostname</div>
                  <div className="text-sm text-gray-200">{deviceInfo.hostname}</div>
                </div>
              </div>
            ) : (
              <p className="text-gray-400">Loading...</p>
            )}
          </div>
        </div>
      </div>

      {/* Sync Actions */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-100">Sync Actions</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={syncAll}
              disabled={syncing}
              className="btn btn-primary h-32 flex flex-col items-center justify-center disabled:opacity-50"
            >
              <div className="text-3xl mb-2">🔄</div>
              <div className="text-lg font-semibold">Sync All</div>
              <div className="text-xs opacity-75 mt-1">Upload & Download</div>
            </button>
            <button
              onClick={downloadFromCloud}
              disabled={syncing}
              className="btn btn-success h-32 flex flex-col items-center justify-center disabled:opacity-50"
            >
              <div className="text-3xl mb-2">⬇️</div>
              <div className="text-lg font-semibold">Download</div>
              <div className="text-xs opacity-75 mt-1">Get Latest Data</div>
            </button>
            <button
              onClick={uploadToCloud}
              disabled={syncing}
              className="btn btn-success h-32 flex flex-col items-center justify-center disabled:opacity-50"
            >
              <div className="text-3xl mb-2">⬆️</div>
              <div className="text-lg font-semibold">Upload</div>
              <div className="text-xs opacity-75 mt-1">Send Your Changes</div>
            </button>
          </div>
        </div>
      </div>

      {/* Sync Status */}
      <div className="card mb-6">
        <div className="card-header flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-100">Data Status</h3>
          <button 
            onClick={refreshStatus} 
            disabled={loading}
            className="btn-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="card-body">
          {syncStatus ? (
            <>
              {/* Summary */}
              <div className="mb-6 bg-gray-700/30 rounded-lg p-4 text-center">
                <div className="text-sm text-gray-400 mb-1">Unsynced Changes</div>
                <div className={`text-4xl font-bold ${calculateTotalUnsynced() > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {calculateTotalUnsynced()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {calculateTotalUnsynced() > 0 ? 'Records waiting to sync' : 'Everything is synced'}
                </div>
              </div>

              {/* Table Details */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-300 font-semibold">Data Type</th>
                      <th className="px-4 py-3 text-center text-gray-300 font-semibold">Local</th>
                      <th className="px-4 py-3 text-center text-gray-300 font-semibold">Cloud</th>
                      <th className="px-4 py-3 text-center text-gray-300 font-semibold">Unsynced</th>
                      <th className="px-4 py-3 text-center text-gray-300 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {Object.keys(syncStatus.localCounts || {}).map((table) => {
                      const localCount = syncStatus.localCounts[table] || 0;
                      const masterCount = syncStatus.masterCounts[table] || 0;
                      const unsyncedCount = syncStatus.unsyncedCounts[table] || 0;
                      
                      const isMatch = localCount === masterCount;
                      const hasUnsynced = unsyncedCount > 0;
                      
                      // Format table name for display
                      const displayName = table
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase())
                        .replace('Csv', 'CSV')
                        .replace('Ii', 'I&I')
                        .replace('Pm', 'PM');
                      
                      let statusClass, statusText, statusIcon;
                      if (hasUnsynced) {
                        statusClass = 'text-yellow-400 font-semibold';
                        statusText = 'Needs Sync';
                        statusIcon = '⚠️';
                      } else if (isMatch) {
                        statusClass = 'text-green-400 font-semibold';
                        statusText = 'Synced';
                        statusIcon = '✅';
                      } else {
                        statusClass = 'text-gray-400';
                        statusText = 'Different';
                        statusIcon = '⚡';
                      }
                      
                      return (
                        <tr key={table} className="hover:bg-gray-700/20">
                          <td className="px-4 py-3 text-gray-200">{displayName}</td>
                          <td className="px-4 py-3 text-center text-gray-300">{localCount}</td>
                          <td className="px-4 py-3 text-center text-gray-300">{masterCount}</td>
                          <td className={`px-4 py-3 text-center ${hasUnsynced ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>
                            {unsyncedCount}
                          </td>
                          <td className={`px-4 py-3 text-center ${statusClass}`}>
                            {statusIcon} {statusText}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-gray-400 text-center py-8">Loading sync status...</p>
          )}
        </div>
      </div>

      {/* Advanced Options */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-100">Advanced Options</h3>
        </div>
        <div className="card-body">
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 mb-4">
            <p className="text-yellow-300 text-sm">⚠️ These options should only be used for troubleshooting or when instructed by support.</p>
          </div>
          <button
            onClick={resetSync}
            disabled={syncing}
            className="btn btn-danger disabled:opacity-50"
          >
            Reset Sync Status
          </button>
        </div>
      </div>
    </Layout>
  );
}
