import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, FileText, Plus, ShieldCheck, Target, Wallet, Users, Calendar,
  Briefcase, TrendingUp, Eye, X, HeartPulse, ChevronDown, Mail, Phone, CheckCircle2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import PayslipPreviewModal from '../internal_staff_salary/PayslipPreviewModal';

const SHEET_STATUS_CONFIG = {
  DRAFT:     { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Draft' },
  FINALIZED: { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Finalized' },
};

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const monthLabel = (month) => {
  if (!month) return '—';
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const shortMonthLabel = (month) => {
  if (!month) return '';
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const SheetStatusBadge = ({ status }) => {
  const cfg = SHEET_STATUS_CONFIG[status] || SHEET_STATUS_CONFIG.DRAFT;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.text} ${cfg.bg} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
};

const SideNavItem = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-all border-l-2 ${
      active
        ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
        : 'border-transparent text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'
    }`}
  >
    <Icon className="h-4 w-4 shrink-0" />
    <span>{label}</span>
  </button>
);

const EmptyRow = ({ children }) => <div className="text-center py-10 text-gray-400 text-[13px]">{children}</div>;

const SectionCard = ({ title, action, children }) => (
  <div className="rounded-lg border border-gray-200 bg-white overflow-hidden mb-4 last:mb-0">
    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
      <h3 className="text-[13px] font-semibold text-gray-700">{title}</h3>
      {action}
    </div>
    {children}
  </div>
);

const sectionConfig = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'work', label: 'Work', icon: Briefcase },
  { id: 'salary', label: 'Salary Sheets', icon: Wallet },
  { id: 'advances', label: 'Advances', icon: Users },
];

const InternalStaffProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [staff, setStaff] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [coordinatorWork, setCoordinatorWork] = useState({ service_requests: [], bookings: [], clients: [], care_profiles: [] });
  const [performanceHistory, setPerformanceHistory] = useState([]);
  const [monthAttribution, setMonthAttribution] = useState({ registrations: [], bookings: [] });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingFlag, setSavingFlag] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [toast, setToast] = useState(null);

  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsDropdownRef = useRef(null);

  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);

  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ target_count: '', reward_amount: '', month: currentMonth() });
  const [goalSubmitting, setGoalSubmitting] = useState(false);

  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', reason: '', month: currentMonth() });
  const [advanceSubmitting, setAdvanceSubmitting] = useState(false);

  const [calculating, setCalculating] = useState(false);
  const [performanceCalc, setPerformanceCalc] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.getInternalStaffSalaryProfile(id);
      setStaff(res.staff);
      setSheets(res.sheets || []);
      setError(null);

      const [goalsRes, advancesRes, workRes, historyRes, attrRes] = await Promise.allSettled([
        apiClient.listStaffGoals(id),
        apiClient.listStaffAdvances(id),
        apiClient.getCoordinatorWork(id),
        apiClient.getStaffPerformanceHistory(id),
        apiClient.getSalesAttribution(id, currentMonth()),
      ]);
      if (goalsRes.status === 'fulfilled') setGoals(goalsRes.value.goals || []);
      if (advancesRes.status === 'fulfilled') setAdvances(advancesRes.value.advances || []);
      if (workRes.status === 'fulfilled') setCoordinatorWork(workRes.value);
      if (historyRes.status === 'fulfilled') setPerformanceHistory(historyRes.value.history || []);
      if (attrRes.status === 'fulfilled') setMonthAttribution(attrRes.value);
    } catch (err) {
      setError(err.message || 'Failed to load staff profile');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!actionsOpen) return;
    const handleClickOutside = (e) => {
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(e.target)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [actionsOpen]);

  const toggleFlag = async (field) => {
    setSavingFlag(true);
    try {
      const res = await apiClient.updateInternalStaff(id, { [field]: !staff[field] });
      setStaff((s) => ({ ...s, [field]: res.staff[field] }));
    } catch (err) {
      console.error('toggleFlag error:', err);
    } finally {
      setSavingFlag(false);
    }
  };

  const buildSheet = async () => {
    setCreatingSheet(true);
    try {
      const month = currentMonth();
      const res = await apiClient.createSalarySheet(id, month);
      navigate(`/admin/internal-staff-salary/build/${res.sheet.id}`);
    } catch (err) {
      console.error('buildSheet error:', err);
      showToast(err.message || 'Failed to generate salary sheet', 'error');
      setCreatingSheet(false);
    }
  };

  // Add Allowance / Add Deduction both land on the current month's draft
  // sheet (creating it first if it doesn't exist yet) — allowances/deductions
  // are always attached to a specific sheet, edited in the builder.
  const goToDraftSheet = async () => {
    const draft = sheets.find((s) => s.month === currentMonth() && s.status === 'DRAFT');
    if (draft) {
      navigate(`/admin/internal-staff-salary/build/${draft.id}`);
      return;
    }
    await buildSheet();
  };

  const openPreview = async (sheet) => {
    try {
      const res = await apiClient.previewSalarySheet(sheet.id);
      setPreviewData(res.preview);
      setPreviewPdfUrl(sheet.pdf_url || null);
      setShowPreview(true);
    } catch (err) {
      showToast(err.message || 'Failed to load preview', 'error');
    }
  };

  const submitGoal = async (e) => {
    e.preventDefault();
    setGoalSubmitting(true);
    try {
      const res = await apiClient.createStaffGoal(id, {
        target_count: parseInt(goalForm.target_count, 10),
        reward_amount: parseFloat(goalForm.reward_amount || 0),
        month: goalForm.month || null,
        goal_type: 'REGISTRATION_COUNT',
      });
      setGoals((g) => [res.goal, ...g]);
      setShowGoalForm(false);
      setGoalForm({ target_count: '', reward_amount: '', month: currentMonth() });
      showToast('Goal added.');
    } catch (err) {
      showToast(err.message || 'Failed to add goal', 'error');
    } finally {
      setGoalSubmitting(false);
    }
  };

  const closeGoal = async (goalId) => {
    try {
      const res = await apiClient.updateStaffGoal(goalId, { status: 'CLOSED' });
      setGoals((g) => g.map((x) => (x.id === goalId ? res.goal : x)));
    } catch (err) {
      showToast(err.message || 'Failed to update goal', 'error');
    }
  };

  const submitAdvance = async (e) => {
    e.preventDefault();
    setAdvanceSubmitting(true);
    try {
      const res = await apiClient.giveStaffAdvance(id, {
        amount: parseFloat(advanceForm.amount || 0),
        reason: advanceForm.reason,
        month: advanceForm.month,
      });
      setAdvances((a) => [res.advance, ...a]);
      setShowAdvanceForm(false);
      setAdvanceForm({ amount: '', reason: '', month: currentMonth() });
      showToast('Advance given.');
    } catch (err) {
      showToast(err.message || 'Failed to give advance', 'error');
    } finally {
      setAdvanceSubmitting(false);
    }
  };

  const calculatePerformance = async () => {
    setCalculating(true);
    try {
      const res = await apiClient.getPerformanceSummary(id, currentMonth());
      setPerformanceCalc(res);
    } catch (err) {
      showToast(err.message || 'Failed to calculate performance allowance', 'error');
    } finally {
      setCalculating(false);
    }
  };

  const chartData = useMemo(
    () => performanceHistory.map((h) => ({ ...h, label: shortMonthLabel(h.month) })),
    [performanceHistory]
  );

  const currentRegCount = monthAttribution.registrations.length;
  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');
  const latestSheet = sheets[0];
  const pendingAdvancesTotal = advances.filter((a) => a.status !== 'SETTLED').reduce((s, a) => s + parseFloat(a.amount || 0), 0);

  if (loading) {
    return (
      <AdminLayout title="Internal Staff Profile" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !staff) {
    return (
      <AdminLayout title="Internal Staff Profile">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error || 'Staff member not found'}
        </div>
      </AdminLayout>
    );
  }

  const activeNavSection = sectionConfig.find((s) => s.id === activeSection);
  const ActiveSectionIcon = activeNavSection?.icon;

  return (
    <AdminLayout title={staff.full_name} subtitle={staff.role}>
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="@container min-w-0 space-y-4">
        {/* Top action bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/internal-staff')}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          {/* Actions dropdown */}
          <div className="relative" ref={actionsDropdownRef}>
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-700"
            >
              Actions <ChevronDown className="h-4 w-4" />
            </button>

            {actionsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {[
                  { label: 'Add Allowance', action: () => goToDraftSheet() },
                  { label: 'Add Deduction', action: () => goToDraftSheet() },
                  { label: 'Generate Salary Sheet', action: buildSheet, busy: creatingSheet },
                  { label: 'Calculate Performance Allowance', action: calculatePerformance, busy: calculating },
                  { label: 'Give Out Advance', action: () => setShowAdvanceForm(true) },
                  { label: 'Add Goal', action: () => setShowGoalForm(true) },
                ].map(({ label, action, busy }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { action(); setActionsOpen(false); }}
                    disabled={busy}
                    className="w-full px-4 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Zoho Books-style profile header ── */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-4 py-4 @xl:px-6">
            <div className="flex min-w-0 items-center gap-3 @xl:gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                {(staff.full_name || 'S').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[15px] font-semibold text-gray-900 break-words @xl:text-[17px]">{staff.full_name}</h1>
                  {staff.user_id && <ShieldCheck className="h-4 w-4 text-blue-500" title="Has login account" />}
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                    staff.status === 'Active' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                      : staff.status === 'On Leave' ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                      : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
                  }`}>
                    {staff.status}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gray-400">
                  <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{staff.email || '—'}</span>
                  <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{formatMobileNumber(staff.phone) || '—'}</span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Joined {staff.joined_date ? new Date(staff.joined_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleFlag('epf_applicable')}
                disabled={savingFlag}
                className={`rounded px-2 py-1 text-[11px] font-semibold border transition-colors ${
                  staff.epf_applicable ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                EPF {staff.epf_applicable ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => toggleFlag('etf_applicable')}
                disabled={savingFlag}
                className={`rounded px-2 py-1 text-[11px] font-semibold border transition-colors ${
                  staff.etf_applicable ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                ETF {staff.etf_applicable ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* Financial snapshot strip */}
          <div className="grid grid-cols-2 gap-px bg-gray-100 @xl:grid-cols-3 @4xl:grid-cols-6">
            {[
              { label: 'Base Salary',        value: money(staff.base_salary) },
              { label: 'Registrations',      value: String(staff.registrations_brought_count ?? 0) },
              { label: 'Bookings',           value: String(staff.bookings_brought_count ?? 0) },
              { label: 'Latest Net Payable', value: latestSheet ? money(latestSheet.net_payable) : '—' },
              { label: 'Pending Advances',   value: money(pendingAdvancesTotal), cls: pendingAdvancesTotal > 0 ? 'text-amber-600' : 'text-gray-900' },
              { label: 'This Month Regs',    value: String(currentRegCount), cls: 'text-blue-700' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="min-w-0 bg-white px-4 py-3 @xl:px-5">
                <p className="truncate text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
                <p title={value} className={`mt-0.5 break-words text-[13px] font-semibold leading-tight @xl:text-sm ${cls || 'text-gray-900'}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Goals & Progress — always visible, top of page ── */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5 @xl:px-5">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" />
              <h2 className="text-[13px] font-semibold text-gray-700">Goals & Progress</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowGoalForm(true)}
              className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add Goal
            </button>
          </div>

          <div className="p-4 @xl:p-5">
            {activeGoals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Target className="h-8 w-8 text-gray-200 mb-2" />
                <p className="text-sm text-gray-500">No active goal set for this staff member.</p>
                <button
                  type="button"
                  onClick={() => setShowGoalForm(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Set a Goal
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-4">
                {activeGoals.map((g) => {
                  const trackable = !g.month || g.month === currentMonth();
                  const progress = trackable ? Math.min(100, Math.round((currentRegCount / g.target_count) * 100)) : null;
                  const achieved = trackable && currentRegCount >= g.target_count;
                  return (
                    <div key={g.id} className={`rounded-lg border p-4 ${achieved ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50/50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{g.target_count} registrations{g.month ? ` · ${monthLabel(g.month)}` : ' · Recurring'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Reward on completion: <span className="font-medium text-gray-700">{money(g.reward_amount)}</span></p>
                        </div>
                        {achieved ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white flex-shrink-0">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Achieved
                          </span>
                        ) : (
                          <button onClick={() => closeGoal(g.id)} className="text-[11px] text-gray-400 hover:text-red-600 flex-shrink-0">Close</button>
                        )}
                      </div>
                      {trackable ? (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                            <span>Progress</span>
                            <span className="font-semibold text-gray-700">{currentRegCount} / {g.target_count}</span>
                          </div>
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${achieved ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-[11px] text-gray-400">Progress tracked when {monthLabel(g.month)} is the active month.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {performanceCalc && (
              <div className="mt-4 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5">
                <span className="text-xs text-indigo-700">
                  Calculated: {performanceCalc.registration_count} registrations this month · Goal reward {money(performanceCalc.goal_amount)} · Tier reward {money(performanceCalc.tier_amount)}
                </span>
                <button onClick={() => setPerformanceCalc(null)} className="text-indigo-400 hover:text-indigo-600"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar + content ── */}
        <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-start">
          <div className="-mx-1 overflow-x-auto px-1 pb-1 @3xl:hidden">
            <nav className="flex w-max items-center gap-1.5">
              {sectionConfig.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white font-semibold'
                        : 'border-gray-200 bg-white text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <aside className="hidden w-48 shrink-0 @3xl:block">
            <div className="sticky top-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sections</p>
              </div>
              <nav className="py-1">
                {sectionConfig.map((section) => (
                  <SideNavItem
                    key={section.id}
                    active={activeSection === section.id}
                    icon={section.icon}
                    label={section.label}
                    onClick={() => setActiveSection(section.id)}
                  />
                ))}
              </nav>
            </div>
          </aside>

          <div className="@container min-w-0 flex-1">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50 px-4 py-3 @xl:px-5">
                {ActiveSectionIcon && <ActiveSectionIcon className="h-4 w-4 shrink-0 text-gray-400" />}
                <h2 className="text-[13px] font-semibold text-gray-700">{activeNavSection?.label}</h2>
              </div>

              <div className="p-4 @xl:p-5">
                {/* ── Overview ── */}
                {activeSection === 'overview' && (
                  <div className="h-72">
                    {chartData.length === 0 ? (
                      <EmptyRow>No performance history yet.</EmptyRow>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="registrations" name="Registrations" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="bookings" name="Bookings" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}

                {/* ── Work ── */}
                {activeSection === 'work' && (
                  <>
                    <SectionCard title={`Service Requests (${coordinatorWork.service_requests.length})`}>
                      {coordinatorWork.service_requests.length === 0 ? <EmptyRow>No service requests coordinated.</EmptyRow> : (
                        <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                          {coordinatorWork.service_requests.map((r) => (
                            <div key={r.request_id} className="px-4 py-2.5 flex items-center justify-between text-[13px]">
                              <div>
                                <p className="font-medium text-gray-900">{r.payer_name}</p>
                                <p className="text-xs text-gray-500">{r.patient_name} · {r.service_type}</p>
                              </div>
                              <span className="text-xs font-medium text-gray-500">{r.status?.replace(/_/g, ' ')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard title={`Bookings (${coordinatorWork.bookings.length})`}>
                      {coordinatorWork.bookings.length === 0 ? <EmptyRow>No bookings coordinated.</EmptyRow> : (
                        <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                          {coordinatorWork.bookings.map((b) => (
                            <div key={b.booking_id} className="px-4 py-2.5 flex items-center justify-between text-[13px]">
                              <div>
                                <p className="font-medium text-gray-900">{b.client_name || '—'}</p>
                                <p className="text-xs text-gray-500 font-mono">{b.booking_code} · {b.service_type}</p>
                              </div>
                              <span className="text-xs font-medium text-gray-500">{b.status?.replace(/_/g, ' ')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>

                    <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-4">
                      <SectionCard title={`Clients (${coordinatorWork.clients.length})`}>
                        {coordinatorWork.clients.length === 0 ? <EmptyRow>No clients coordinated.</EmptyRow> : (
                          <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                            {coordinatorWork.clients.map((c) => (
                              <div key={c.client_profile_id} className="px-4 py-2.5 flex items-center justify-between text-[13px]">
                                <div className="flex items-center gap-2">
                                  <Users className="w-3.5 h-3.5 text-gray-400" />
                                  <span className="font-medium text-gray-900">{c.full_name}</span>
                                </div>
                                <span className="text-xs text-gray-400 font-mono">{c.client_code}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </SectionCard>

                      <SectionCard title={`Care Profiles (${coordinatorWork.care_profiles.length})`}>
                        {coordinatorWork.care_profiles.length === 0 ? <EmptyRow>No care profiles coordinated.</EmptyRow> : (
                          <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                            {coordinatorWork.care_profiles.map((p) => (
                              <div key={p.patient_id} className="px-4 py-2.5 flex items-center justify-between text-[13px]">
                                <div className="flex items-center gap-2">
                                  <HeartPulse className="w-3.5 h-3.5 text-gray-400" />
                                  <span className="font-medium text-gray-900">{p.full_name}</span>
                                </div>
                                <span className="text-xs text-gray-500">{p.client_name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </SectionCard>
                    </div>

                    <SectionCard title={`Registrations This Month (${monthAttribution.registrations.length})`}>
                      {monthAttribution.registrations.length === 0 ? <EmptyRow>No registrations this month.</EmptyRow> : (
                        <div className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                          {monthAttribution.registrations.map((r) => (
                            <div key={r.id} className="px-4 py-2.5 flex items-center justify-between text-[13px]">
                              <span className="text-gray-700">{r.client_name}</span>
                              <span className="font-medium text-gray-800">{money(r.credited_amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  </>
                )}

                {/* ── Salary Sheets ── */}
                {activeSection === 'salary' && (
                  <SectionCard
                    title="Salary Sheets"
                    action={
                      <button
                        onClick={buildSheet}
                        disabled={creatingSheet}
                        className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creatingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Generate Salary Sheet
                      </button>
                    }
                  >
                    {sheets.length === 0 ? (
                      <EmptyRow>No salary sheets yet.</EmptyRow>
                    ) : (
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Month</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Net Payable</th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Finalized On</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {sheets.map((sheet) => (
                            <tr key={sheet.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-medium text-gray-900">{monthLabel(sheet.month)}</td>
                              <td className="px-4 py-3"><SheetStatusBadge status={sheet.status} /></td>
                              <td className="px-4 py-3 text-right font-medium text-gray-800">{money(sheet.net_payable)}</td>
                              <td className="px-4 py-3 text-gray-500">
                                {sheet.finalized_at ? new Date(sheet.finalized_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => openPreview(sheet)}
                                    title="Preview payslip"
                                    className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  {sheet.pdf_url && (
                                    <a
                                      href={sheet.pdf_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                                    >
                                      <FileText className="w-3.5 h-3.5" /> PDF
                                    </a>
                                  )}
                                  <button
                                    onClick={() => navigate(`/admin/internal-staff-salary/build/${sheet.id}`)}
                                    className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                                  >
                                    {sheet.status === 'DRAFT' ? 'Resume' : 'View'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </SectionCard>
                )}

                {/* ── Advances ── */}
                {activeSection === 'advances' && (
                  <SectionCard
                    title="Advances"
                    action={
                      <button onClick={() => setShowAdvanceForm(true)} className="inline-flex items-center gap-1.5 rounded bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700">
                        <Plus className="w-3.5 h-3.5" /> Give Advance
                      </button>
                    }
                  >
                    {advances.length === 0 ? <EmptyRow>No advances given.</EmptyRow> : (
                      <div className="divide-y divide-gray-100">
                        {advances.map((a) => (
                          <div key={a.id} className="px-4 py-2.5 flex items-center justify-between text-[13px]">
                            <div>
                              <p className="font-medium text-gray-900">{money(a.amount)} · {monthLabel(a.month)}</p>
                              {a.reason && <p className="text-xs text-gray-500">{a.reason}</p>}
                            </div>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              a.status === 'SETTLED' ? 'text-gray-500 bg-gray-100 border-gray-200' : 'text-amber-700 bg-amber-50 border-amber-200'
                            }`}>
                              {a.status === 'SETTLED' ? 'Settled' : 'Pending Deduction'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {showPreview && (
        <PayslipPreviewModal preview={previewData} pdfUrl={previewPdfUrl} onClose={() => setShowPreview(false)} />
      )}

      {/* Add Goal modal */}
      {showGoalForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900 inline-flex items-center gap-2"><Target className="w-4 h-4 text-blue-600" /> Add Goal</h2>
              <button onClick={() => setShowGoalForm(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submitGoal} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Target Registrations</label>
                <input type="number" min="1" required value={goalForm.target_count} onChange={(e) => setGoalForm((f) => ({ ...f, target_count: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reward Amount (LKR)</label>
                <input type="number" min="0" step="0.01" required value={goalForm.reward_amount} onChange={(e) => setGoalForm((f) => ({ ...f, reward_amount: e.target.value }))} onWheel={(e) => e.target.blur()} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Month (leave blank for recurring)</label>
                <input type="month" value={goalForm.month} onChange={(e) => setGoalForm((f) => ({ ...f, month: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500" />
              </div>
              <button type="submit" disabled={goalSubmitting} className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors disabled:opacity-50">
                {goalSubmitting && <Loader2 className="w-4 h-4 animate-spin" />} Save Goal
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Give Advance modal */}
      {showAdvanceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900 inline-flex items-center gap-2"><Wallet className="w-4 h-4 text-amber-600" /> Give Advance</h2>
              <button onClick={() => setShowAdvanceForm(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submitAdvance} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (LKR)</label>
                <input type="number" min="0.01" step="0.01" required value={advanceForm.amount} onChange={(e) => setAdvanceForm((f) => ({ ...f, amount: e.target.value }))} onWheel={(e) => e.target.blur()} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deduct From Salary Month</label>
                <input type="month" required value={advanceForm.month} onChange={(e) => setAdvanceForm((f) => ({ ...f, month: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
                <textarea rows={2} value={advanceForm.reason} onChange={(e) => setAdvanceForm((f) => ({ ...f, reason: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-500" />
              </div>
              <button type="submit" disabled={advanceSubmitting} className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-500 transition-colors disabled:opacity-50">
                {advanceSubmitting && <Loader2 className="w-4 h-4 animate-spin" />} Give Advance
              </button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default InternalStaffProfilePage;
