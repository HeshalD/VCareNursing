import React, { useEffect, useMemo, useState } from 'react';
import { History, Calendar, User } from 'lucide-react';
import apiClient from '../../../api/api';
import StaffPageShell, { EmptyState } from './StaffPageShell';
import useMyStaffProfile from './useMyStaffProfile';

const formatDate = (v) => (v
  ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : null);
const label = (v) => (v ? String(v).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

const STATUS_STYLES = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  SCHEDULED: 'bg-blue-50 text-blue-700 border-blue-100',
  COMPLETED: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-100',
};

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'SCHEDULED', label: 'Scheduled' },
  { id: 'PAST', label: 'Past' },
];

const StaffCareHistoryPage = () => {
  const { staff, loading: profileLoading, error: profileError } = useMyStaffProfile();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getMyCareHistory();
        setRows(res.data || []);
      } catch (err) {
        console.error('Error loading care history:', err);
        setError('Could not load your care profile history. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => rows.filter((r) => {
    const st = (r.assignment_status || '').toUpperCase();
    if (filter === 'ALL') return true;
    if (filter === 'PAST') return st !== 'ACTIVE' && st !== 'SCHEDULED';
    return st === filter;
  }), [rows, filter]);

  const uniquePatients = new Set(rows.map((r) => r.patient_id).filter(Boolean)).size;

  return (
    <StaffPageShell
      staffProfileId={staff?.staff_profile_id}
      title="Care Profile History"
      subtitle="Every care profile you have been assigned to."
      loading={loading || profileLoading}
      error={error || profileError}
    >
      {rows.length === 0 ? (
        <EmptyState icon={History} title="No care history yet" description="Care profiles you are assigned to will appear here." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Care profiles served</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{uniquePatients}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Assignments</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{rows.length}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === f.id ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          <section className="space-y-3">
            {visible.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Nothing matches this filter.</p>
            ) : visible.map((r) => {
              const st = (r.assignment_status || '').toUpperCase();
              const start = formatDate(r.service_start_date);
              const end = formatDate(r.service_end_date);
              return (
                <article key={r.assignment_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white font-semibold">
                        {(r.patient_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{r.patient_name || 'Care profile'}</h3>
                        <p className="text-xs text-slate-500">
                          {[r.patient_age != null ? `${r.patient_age} yrs` : null, r.patient_gender ? label(r.patient_gender) : null].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[st] || STATUS_STYLES.COMPLETED}`}>
                      {label(r.assignment_status)}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      {start ? `${start} → ${end || 'Ongoing'}` : '—'}
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                      <History className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      {[r.service_type ? label(r.service_type) : null, r.service_model ? label(r.service_model) : null].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                      <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      Client: {r.client_name || '—'}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </StaffPageShell>
  );
};

export default StaffCareHistoryPage;
