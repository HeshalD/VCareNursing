import React, { useState, useEffect, useMemo } from 'react';
import { MonitorSmartphone, Loader2, LogOut } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

const ActiveSessionsPage = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggingOutId, setLoggingOutId] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadSessions(); }, []);

  const loadSessions = async () => {
    try {
      const res = await apiClient.listAllSessions();
      setSessions(res.sessions || []);
    } catch (err) {
      console.error('loadSessions error:', err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleForceLogout = async (sessionId) => {
    setLoggingOutId(sessionId);
    try {
      await apiClient.forceLogoutSession(sessionId);
      setSessions((prev) =>
        prev.map((s) => (s.session_id === sessionId ? { ...s, is_active: false } : s))
      );
      showToast('Session logged out.');
    } catch (err) {
      showToast(err.message || 'Failed to log out session.', 'error');
    } finally {
      setLoggingOutId(null);
    }
  };

  const filteredSessions = useMemo(() => {
    if (filter === 'active') return sessions.filter((s) => s.is_active);
    if (filter === 'inactive') return sessions.filter((s) => !s.is_active);
    return sessions;
  }, [sessions, filter]);

  const activeCount = useMemo(() => sessions.filter((s) => s.is_active).length, [sessions]);

  return (
    <AdminLayout title="Active Sessions" subtitle="Devices assigned to staff and their current login status">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between gap-4 p-5 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 text-slate-600">
            <MonitorSmartphone className="w-4 h-4" />
            <span className="font-medium text-sm">
              {loading
                ? 'Loading…'
                : `${sessions.length} device${sessions.length !== 1 ? 's' : ''} · ${activeCount} active now`}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  filter === f.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 h-48 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading sessions…
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <MonitorSmartphone className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="font-medium text-slate-500">
                {filter === 'all' ? 'No devices assigned yet' : `No ${filter} devices`}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Device</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">IP Address</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Seen</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSessions.map((s) => (
                  <tr key={s.device_row_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{s.staff_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.device_label || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.is_active ? 'text-emerald-700' : 'text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.ip_address || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.is_active ? (
                        <button
                          onClick={() => handleForceLogout(s.session_id)}
                          disabled={loggingOutId === s.session_id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          {loggingOutId === s.session_id ? 'Logging out…' : 'Force Logout'}
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default ActiveSessionsPage;
