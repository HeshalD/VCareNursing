import React, { useState, useEffect } from 'react';
import {
  CalendarOff, CheckCircle, Send, CalendarDays, Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import StaffSidebar from './StaffSidebar';
import DateInput from '../../../components/common/DateInput';

const STATUS_CONFIG = {
  PENDING:  { dot: 'bg-amber-400',   text: 'text-amber-700',   labelKey: 'status.pending' },
  APPROVED: { dot: 'bg-emerald-500', text: 'text-emerald-700', labelKey: 'status.approved' },
  REJECTED: { dot: 'bg-red-400',     text: 'text-red-700',     labelKey: 'status.rejected' },
};

const StatusBadge = ({ status, t }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {t(cfg.labelKey)}
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

const inputCls =
  'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors';

const StaffLeaveRequestPage = () => {
  const { t } = useTranslation('staffLeaveRequest');
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
      setSubmitError(t('errors.missingDates'));
      return;
    }
    if (invalidRange) {
      setSubmitError(t('errors.invalidRange'));
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
      setSubmitError(err.message || t('errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} title={t('header.title')} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 md:px-8 py-6 md:py-8 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
              <CalendarOff className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{t('header.title')}</h1>
              <p className="text-sm text-slate-500">{t('header.subtitle')}</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 pt-5 pb-2.5 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('form.sectionLabel')}</p>
            </div>

            <div className="px-5 pt-4 pb-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t('form.startDateLabel')}<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <DateInput
                    value={startDate}
                    min={todayISO()}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t('form.endDateLabel')}<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <DateInput
                    value={endDate}
                    min={startDate || todayISO()}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {computedDays > 0 && !invalidRange && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CalendarDays className="w-4 h-4 text-slate-400" />
                  <span>{t('form.daysCoveredPrefix')} <span className="font-semibold text-slate-900">{computedDays}</span> {t('dayUnit', { count: computedDays })}.</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('form.reasonLabel')}</label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('form.reasonPlaceholder')}
                  className={`${inputCls} resize-none`}
                />
              </div>

              {submitError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  {t('form.submitSuccess')}
                </div>
              )}
            </div>

            <div className="flex justify-end px-5 py-4 border-t border-slate-200 bg-slate-50">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting ? t('form.submitting') : t('form.submitButton')}
              </button>
            </div>
          </form>

          {/* History */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 pt-5 pb-2.5 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('history.sectionLabel')}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {myLeaves.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-sm">
                  {t('history.empty')}
                </div>
              ) : (
                myLeaves.map((lv) => (
                  <div key={lv.leave_id} className="px-5 py-4 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {fmtDate(lv.start_date)} → {fmtDate(lv.end_date)}
                        <span className="ml-2 text-xs font-medium text-slate-400">
                          {t('history.daysCount', { count: dayCount(lv.start_date, lv.end_date) })}
                        </span>
                      </p>
                      {lv.reason && <p className="text-sm text-slate-500 mt-0.5">{lv.reason}</p>}
                      {lv.status === 'REJECTED' && lv.rejected_reason && (
                        <p className="text-xs text-red-600 mt-1">{t('history.rejectedReason', { reason: lv.rejected_reason })}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">{t('history.requestedOn', { date: fmtDate(lv.requested_at) })}</p>
                    </div>
                    <StatusBadge status={lv.status} t={t} />
                  </div>
                ))
              )}
            </div>

            {myLeaves.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
                {t('history.showingCount', { count: myLeaves.length })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default StaffLeaveRequestPage;
