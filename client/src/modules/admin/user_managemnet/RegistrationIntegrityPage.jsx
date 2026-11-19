import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ChevronDown, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const SEVERITY = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
};

// Admin → Users → Registration Fee Audit. Lists every client whose registration fee is not in
// order (never invoiced, marked paid with no payment, duplicate charge, ...). Read-only: open a
// client to fix it from the Registration Fee card.
const RegistrationIntegrityPage = () => {
  const navigate = useNavigate();
  const { adminToken } = useAdminAuth();
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({});

  useEffect(() => {
    if (!adminToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.getRegFeeIntegrity();
        if (!cancelled) setChecks(Array.isArray(res?.data) ? res.data : []);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load the registration fee audit.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adminToken]);

  const problems = checks.filter((c) => c.count > 0);

  return (
    <AdminLayout title="Registration Fee Audit" subtitle="Clients whose registration fee is not in order">
      <div className="space-y-4">
        <button onClick={() => navigate('/admin/users')} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to users
        </button>

        {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Running checks…</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {!loading && !error && problems.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Every client’s registration fee is in order.
          </div>
        )}

        {checks.map((c) => (
          <div key={c.code} className="rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              disabled={c.count === 0}
              onClick={() => setOpen((o) => ({ ...o, [c.code]: !o[c.code] }))}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default"
            >
              <div className="flex items-center gap-2">
                {c.count > 0 ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                <span className="text-sm font-medium text-slate-800">{c.label}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY[c.severity] || SEVERITY.low}`}>{c.severity}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums text-slate-700">{c.count}</span>
                {c.count > 0 && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open[c.code] ? 'rotate-180' : ''}`} />}
              </div>
            </button>
            {open[c.code] && c.count > 0 && (
              <div className="border-t border-slate-100">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr><th className="px-4 py-2">Client</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Fee status</th><th className="px-4 py-2">Imported</th></tr>
                  </thead>
                  <tbody>
                    {c.clients.map((cl) => (
                      <tr key={cl.client_code} onClick={() => navigate(`/admin/users/${cl.client_profile_id}/detail`)}
                        className="cursor-pointer border-t border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-blue-600">{cl.client_code}</td>
                        <td className="px-4 py-2 text-slate-700">{cl.full_name}</td>
                        <td className="px-4 py-2 text-slate-600">{cl.status}</td>
                        <td className="px-4 py-2 text-slate-600">{cl.imported ? 'Yes' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {c.count > c.clients.length && (
                  <p className="px-4 py-2 text-[11px] text-slate-400">Showing the first {c.clients.length} of {c.count}.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </AdminLayout>
  );
};

export default RegistrationIntegrityPage;
