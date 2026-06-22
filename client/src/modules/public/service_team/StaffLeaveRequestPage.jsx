import React, { useState, useEffect } from 'react';
import {
  CalendarOff, CheckCircle, Clock, XCircle, Send, AlertCircle, CalendarDays,
} from 'lucide-react';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import StaffSidebar from './StaffSidebar';

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
  REJECTED: { label: 'Rejected', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const dayCount = (start, end) => {
  if (!start || !end) return 0;
  const ms = new Date(end) - new Date(start);
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const StaffLeaveRequestPage = () => {
  const { user, loading: authLoading } = useAuth();

  const [staffData, setStaffData] = useState(null);
  const [myLeaves, setMyLeaves] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const fetchLeaves = async () => {
    try {
      const res = await apiClient.getMyLeaves();
      setMyLeaves(res.data || []);
    } catch (err) {
      console.error('getMyLeaves error:', err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (authLoading) return;
      const userId = user?.user_id || user?.id;
      if (!userId) { setDataLoading(false); return; }
      try {
        const staffRes = await apiClient.getStaffByUserID(userId);
        if (staffRes?.data) setStaffData(staffRes.data);
        await fetchLeaves();
      } catch (err) {
        console.error('StaffLeaveRequestPage fetch error:', err);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();
  }, [user, authLoading]);

  const computedDays = dayCount(startDate, endDate);
  const invalidRange = startDate && endDate && new Date(endDate) < new Date(startDate);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!startDate || !endDate) {
      setSubmitError('Please select both a start and end date.');
      return;
    }
    if (invalidRange) {
      setSubmitError('End date cannot be before start date.');
      return;
    }

    try {
      setSubmitting(true);
      await apiClient.requestLeave({ start_date: startDate, end_date: endDate, reason: reason.trim() || null });
      setSubmitSuccess(true);
      setStartDate('');
      setEndDate('');
      setReason('');
      await fetchLeaves();
    } catch (err) {
      console.error('requestLeave error:', err);
      setSubmitError(err.message || 'Failed to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} title="Request Leave" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 md:px-8 py-6 md:py-8 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <CalendarOff className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Request Leave</h1>
              <p className="text-sm text-slate-500">Submit a leave request for a range of dates.</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  min={todayISO()}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">End date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || todayISO()}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {computedDays > 0 && !invalidRange && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <span>This request covers <span className="font-semibold text-slate-900">{computedDays}</span> day{computedDays === 1 ? '' : 's'}.</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Reason (optional)</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Let us know why you need time off..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                Your leave request has been submitted and is pending review.
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Submit Request
              </button>
            </div>
          </form>

          {/* History */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">My Leave Requests</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {myLeaves.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <CalendarOff className="w-8 h-8 mb-2 text-slate-300" />
                  <p className="text-sm">You have not made any leave requests yet.</p>
                </div>
              ) : (
                myLeaves.map((lv) => (
                  <div key={lv.leave_id} className="px-6 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {fmtDate(lv.start_date)} → {fmtDate(lv.end_date)}
                        <span className="ml-2 text-xs font-medium text-slate-400">
                          ({dayCount(lv.start_date, lv.end_date)} day{dayCount(lv.start_date, lv.end_date) === 1 ? '' : 's'})
                        </span>
                      </p>
                      {lv.reason && <p className="text-sm text-slate-500 mt-0.5">{lv.reason}</p>}
                      {lv.status === 'REJECTED' && lv.rejected_reason && (
                        <p className="text-xs text-rose-600 mt-1">Reason: {lv.rejected_reason}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">Requested {fmtDate(lv.requested_at)}</p>
                    </div>
                    <StatusBadge status={lv.status} />
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default StaffLeaveRequestPage;
