import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, Landmark, ChevronRight, CheckCircle2 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { formatMobileNumber } from '../../../utils/phoneFormat';

const StaffMissingBankDetails = () => {
  const navigate = useNavigate();
  const { adminToken } = useAdminAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!adminToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.getStaffMissingBankDetails();
        if (!cancelled) setStaff(Array.isArray(res?.data) ? res.data : []);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load staff.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adminToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(s =>
      (s.full_name || '').toLowerCase().includes(q) || (s.mobile_number || '').includes(q)
    );
  }, [staff, search]);

  const openBankSection = (id) => navigate(`/admin/staff/${id}/v2?section=bank-accounts`);

  return (
    <AdminLayout
      title="Missing Bank Details"
      subtitle="Active staff members who have no bank account on file. Click a name to add it."
    >
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or mobile"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <span className="text-sm text-slate-500 ml-auto">
              <span className="font-semibold tabular-nums text-slate-900">{filtered.length}</span> staff missing bank details
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              {staff.length === 0 ? 'Every active staff member has bank details on file.' : 'No staff match your search.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map(s => (
                <li key={s.staff_profile_id}>
                  <button
                    onClick={() => openBankSection(s.staff_profile_id)}
                    className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                      {s.profile_picture_url
                        ? <img src={s.profile_picture_url} alt="" className="w-full h-full object-cover" />
                        : <Landmark className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 text-sm truncate">{s.full_name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {[s.designation, s.mobile_number ? formatMobileNumber(s.mobile_number) : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="hidden sm:inline text-xs font-medium text-amber-700 bg-amber-50 rounded-full px-2.5 py-1">No bank account</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AdminLayout>
  );
};

export default StaffMissingBankDetails;
