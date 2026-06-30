import React, { useState, useEffect } from 'react';
import { Loader2, Search, ChevronRight, UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const ROLE_LABELS = {
  CARETAKER: 'Caretaker',
  NURSING_ASSISTANT: 'Nursing Assistant',
  NURSE: 'Nurse',
  PHYSIOTHERAPIST: 'Physiotherapist',
  NANNY: 'Nanny',
  COUNSELLOR: 'Counsellor',
};

function parseRoles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.replace(/^\{|\}$/g, '').split(',').map(r => r.trim()).filter(Boolean);
}

function formatRoles(raw) {
  return parseRoles(raw).map(r => ROLE_LABELS[r] || r).join(', ') || '—';
}

function docStatus(app) {
  if (app.status !== 'ACCEPTED') return null;
  const gn = !!app.grama_niladhari_url;
  const pr = !!app.police_report_url;
  if (gn && pr) return 'full';
  if (gn || pr) return 'partial';
  return 'none';
}

const STATUS_TABS = ['All', 'PENDING', 'ACCEPTED', 'REJECTED'];

const StatusDot = ({ status }) => {
  const cfg = {
    PENDING:  { dot: 'bg-amber-400',  text: 'text-amber-700',  label: 'Pending' },
    ACCEPTED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Accepted' },
    REJECTED: { dot: 'bg-red-400',    text: 'text-red-700',    label: 'Rejected' },
  }[status] ?? { dot: 'bg-slate-300', text: 'text-slate-500', label: status };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const Pill = ({ color, label }) => {
  const palettes = {
    green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    slate:  'bg-slate-50 text-slate-500 border-slate-200',
    red:    'bg-red-50 text-red-600 border-red-200',
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
  };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${palettes[color] ?? palettes.slate}`}>
      {label}
    </span>
  );
};

const WorkerVerification = () => {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (adminToken) fetchApplications();
  }, [adminToken]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      apiClient.setToken(adminToken);
      const response = await apiClient.getApplications();
      setApplications(Array.isArray(response) ? response : response.data ?? []);
    } catch (err) {
      setError(err.message || 'Error fetching applications');
    } finally {
      setLoading(false);
    }
  };

  const filtered = applications.filter(app => {
    const matchTab = activeTab === 'All' || app.status === activeTab;
    const q = search.toLowerCase();
    const matchSearch = !q || [app.full_name, app.mobile_number, app.email, app.application_code, app.location]
      .some(v => v?.toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const counts = STATUS_TABS.reduce((acc, t) => {
    acc[t] = t === 'All' ? applications.length : applications.filter(a => a.status === t).length;
    return acc;
  }, {});

  if (loading) {
    return (
      <AdminLayout title="Staff Applications" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!adminToken || error) {
    return (
      <AdminLayout title="Staff Applications">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error || 'Admin authentication required.'}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Staff Applications"
      subtitle="Review and verify identity documents and qualifications of applicants."
    >
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        {/* Filter tabs */}
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'All' ? 'All' : { PENDING: 'Pending', ACCEPTED: 'Accepted', REJECTED: 'Rejected' }[tab]}
              <span className={`ml-1.5 tabular-nums ${activeTab === tab ? 'text-slate-400' : 'text-slate-400'}`}>
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, email…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Applicant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Applied Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Bank Acct</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Documents</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Contract</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-400 text-sm">
                    No applications match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map(app => {
                  const ds = docStatus(app);
                  return (
                    <tr
                      key={app.application_id}
                      onClick={() => navigate(`/admin/workers/${app.application_id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      {/* Applicant */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-[160px]">
                          {app.profile_picture_url ? (
                            <img src={app.profile_picture_url} alt={app.full_name}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                              <UserCircle className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">{app.full_name ?? '—'}</p>
                            {app.application_code && (
                              <p className="text-xs text-slate-400 font-mono">{app.application_code}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-slate-700">{app.mobile_number ?? '—'}</p>
                        <p className="text-xs text-slate-400">{app.email ?? '—'}</p>
                      </td>

                      {/* Applied Role */}
                      <td className="px-4 py-3">
                        <span className="text-slate-700">{formatRoles(app.applied_roles)}</span>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-slate-600">{app.location ?? '—'}</span>
                      </td>

                      {/* Application Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusDot status={app.status ?? 'PENDING'} />
                      </td>

                      {/* Bank Account */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {app.status === 'ACCEPTED'
                          ? <Pill color={app.has_bank_account ? 'green' : 'slate'} label={app.has_bank_account ? 'Added' : 'Not Added'} />
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>

                      {/* Compliance Documents */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {app.status === 'ACCEPTED' ? (
                          ds === 'full'    ? <Pill color="green" label="Fully Uploaded" /> :
                          ds === 'partial' ? <Pill color="amber" label="1 Uploaded" /> :
                                            <Pill color="slate" label="Not Uploaded" />
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      {/* Contract */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {app.status === 'ACCEPTED'
                          ? <Pill color={app.agreement_sent_at ? 'blue' : 'slate'} label={app.agreement_sent_at ? 'Sent' : 'Not Sent'} />
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>

                      {/* Arrow */}
                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {filtered.length} of {applications.length} application{applications.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default WorkerVerification;
