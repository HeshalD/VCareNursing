import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Plus, X, Eye, CheckCircle2, Target, ChevronDown,
  Wallet, Receipt, ShieldCheck, Calendar,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const EPF_EMPLOYEE_RATE = 0.08;
const EPF_EMPLOYER_RATE = 0.12;
const ETF_EMPLOYER_RATE = 0.03;

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthLabel = (month) => {
  if (!month) return '—';
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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

const SectionCard = ({ title, action, children }) => (
  <div className="rounded-lg border border-gray-200 bg-white overflow-hidden mb-4 last:mb-0">
    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
      <h3 className="text-[13px] font-semibold text-gray-700">{title}</h3>
      {action}
    </div>
    <div className="p-4 @xl:p-5">{children}</div>
  </div>
);

const LineItemRow = ({ item, onRemove }) => (
  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
    <span className="text-sm text-gray-700">{item.label}</span>
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-800">{money(item.amount)}</span>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-600 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

const LineItemAdder = ({ presets, onAdd }) => {
  const [presetId, setPresetId] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [amount, setAmount] = useState('');

  const add = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    const preset = presets.find((p) => String(p.id) === String(presetId));
    const label = preset ? preset.name : customLabel.trim();
    if (!label) return;
    onAdd({ preset_id: preset ? preset.id : null, label, amount: amt });
    setPresetId('');
    setCustomLabel('');
    setAmount('');
  };

  return (
    <div className="flex items-center gap-2 mt-3">
      <select
        value={presetId}
        onChange={(e) => setPresetId(e.target.value)}
        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
      >
        <option value="">Custom label…</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {!presetId && (
        <input
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          placeholder="Label"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
        />
      )}
      <input
        type="number"
        min="0"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onWheel={(e) => e.target.blur()}
        placeholder="Amount (LKR)"
        className="w-36 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
      />
      <button
        type="button"
        onClick={add}
        className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors flex-shrink-0"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

// Editable per-registration commission amount — local draft value while
// typing, committed via onSave on blur (or Enter) so we don't fire a save
// request on every keystroke.
const CommissionInput = ({ value, onSave, disabled }) => {
  const [draft, setDraft] = useState(String(value ?? 0));

  useEffect(() => { setDraft(String(value ?? 0)); }, [value]);

  const commit = () => {
    const amt = parseFloat(draft);
    if (isNaN(amt) || amt < 0 || amt === parseFloat(value || 0)) { setDraft(String(value ?? 0)); return; }
    onSave(amt);
  };

  return (
    <input
      type="number"
      min="0"
      step="0.01"
      disabled={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onWheel={(e) => e.target.blur()}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      className="w-28 px-2 py-1 text-xs text-right border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 disabled:bg-gray-50"
    />
  );
};

const InternalStaffSalaryBuilder = () => {
  const { sheetId } = useParams();
  const navigate = useNavigate();

  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [presets, setPresets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState(null);
  const [attribution, setAttribution] = useState({ registrations: [], bookings: [] });
  const [toast, setToast] = useState(null);
  const [activeSection, setActiveSection] = useState('earnings');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsDropdownRef = useRef(null);

  const [lineItems, setLineItems] = useState([]);
  const [epfApplicable, setEpfApplicable] = useState(true);
  const [etfApplicable, setEtfApplicable] = useState(true);
  const [commissionAmount, setCommissionAmount] = useState('0');
  const [performanceMode, setPerformanceMode] = useState('NONE');
  const [performanceSummary, setPerformanceSummary] = useState(null);
  const [goals, setGoals] = useState([]);
  const [advancesDeducted, setAdvancesDeducted] = useState(0);

  const isReadOnly = sheet?.status === 'FINALIZED';

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [sheetRes, presetsRes] = await Promise.all([
        apiClient.getSalarySheet(sheetId),
        apiClient.listSalaryPresets(),
      ]);
      const s = sheetRes.sheet;
      setSheet(s);
      setLineItems(s.line_items || []);
      setEpfApplicable(s.epf_employee_applicable);
      setEtfApplicable(s.etf_employer_applicable);
      setCommissionAmount(String(s.commission_amount || 0));
      setPerformanceMode(s.performance_allowance_mode || 'NONE');
      setAdvancesDeducted(parseFloat(s.advances_deducted || 0));
      setPresets((presetsRes.presets || []).filter((p) => p.is_active));
      setError(null);

      // Registration commissions and the performance allowance are always
      // available, regardless of role — any internal staff member can bring
      // in registrations and earn commission/goal rewards for them.
      const [attrRes, perfRes, goalsRes] = await Promise.all([
        apiClient.getSalesAttribution(s.staff_id, s.month),
        apiClient.getPerformanceSummary(s.staff_id, s.month),
        apiClient.listStaffGoals(s.staff_id).catch(() => ({ goals: [] })),
      ]);
      setAttribution(attrRes);
      setPerformanceSummary(perfRes);
      setGoals(goalsRes.goals || []);
    } catch (err) {
      setError(err.message || 'Failed to load salary sheet');
    } finally {
      setLoading(false);
    }
  }, [sheetId]);

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

  const payGoal = performanceMode === 'GOAL' || performanceMode === 'BOTH';
  const payPerReg = performanceMode === 'PER_REGISTRATION' || performanceMode === 'BOTH';
  const togglePayMethod = (method) => {
    const nextGoal = method === 'goal' ? !payGoal : payGoal;
    const nextPerReg = method === 'perReg' ? !payPerReg : payPerReg;
    setPerformanceMode(nextGoal && nextPerReg ? 'BOTH' : nextGoal ? 'GOAL' : nextPerReg ? 'PER_REGISTRATION' : 'NONE');
  };

  const performanceAllowanceAmount = useMemo(() => {
    if (!performanceSummary) return 0;
    return (payGoal ? (performanceSummary.goal_amount || 0) : 0) + (payPerReg ? (performanceSummary.per_registration_amount || 0) : 0);
  }, [performanceSummary, payGoal, payPerReg]);

  const totals = useMemo(() => {
    const basicSalary = parseFloat(sheet?.basic_salary || 0);
    const allowancesTotal = lineItems.filter((i) => i.item_type === 'ALLOWANCE').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const deductionsTotal = lineItems.filter((i) => i.item_type === 'DEDUCTION').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const commission = parseFloat(commissionAmount || 0);
    const epfEmployeeAmount = epfApplicable ? basicSalary * EPF_EMPLOYEE_RATE : 0;
    const epfEmployerAmount = epfApplicable ? basicSalary * EPF_EMPLOYER_RATE : 0;
    const etfEmployerAmount = etfApplicable ? basicSalary * ETF_EMPLOYER_RATE : 0;
    const grossEarnings = basicSalary + allowancesTotal + commission + performanceAllowanceAmount;
    const totalDeductions = deductionsTotal + epfEmployeeAmount + advancesDeducted;
    const netPayable = grossEarnings - totalDeductions;
    return { basicSalary, allowancesTotal, deductionsTotal, commission, epfEmployeeAmount, epfEmployerAmount, etfEmployerAmount, grossEarnings, totalDeductions, netPayable };
  }, [sheet, lineItems, epfApplicable, etfApplicable, commissionAmount, performanceAllowanceAmount, advancesDeducted]);

  const addLineItem = (type) => (item) => setLineItems((items) => [...items, { ...item, item_type: type }]);
  const removeLineItem = (idx) => setLineItems((items) => items.filter((_, i) => i !== idx));

  // Admin sets/edits the commission the staff member personally earns for one
  // specific registration. Saved immediately (not deferred to Save Draft),
  // then re-syncs the performance summary since the PER_REGISTRATION total
  // is a live sum computed server-side.
  const updateRegistrationCommission = async (assignmentId, amount) => {
    setAttribution((prev) => ({
      ...prev,
      registrations: prev.registrations.map((r) => (r.id === assignmentId ? { ...r, commission_amount: amount } : r)),
    }));
    try {
      await apiClient.updateRegistrationCommission(assignmentId, amount);
      const perfRes = await apiClient.getPerformanceSummary(sheet.staff_id, sheet.month);
      setPerformanceSummary(perfRes);
    } catch (err) {
      showToast(err.message || 'Failed to save commission', 'error');
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const res = await apiClient.updateSalarySheet(sheetId, {
        epf_employee_applicable: epfApplicable,
        etf_employer_applicable: etfApplicable,
        commission_amount: parseFloat(commissionAmount || 0),
        performance_allowance_mode: performanceMode,
        line_items: lineItems.map((i) => ({ item_type: i.item_type, preset_id: i.preset_id, label: i.label, amount: i.amount })),
      });
      setSheet(res.sheet);
      setLineItems(res.sheet.line_items || []);
      setAdvancesDeducted(parseFloat(res.sheet.advances_deducted || 0));
      return res.sheet;
    } catch (err) {
      showToast(err.message || 'Failed to save draft', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const openPreview = async () => {
    const saved = await saveDraft();
    if (!saved) return;
    try {
      const res = await apiClient.previewSalarySheet(sheetId);
      setPreview(res.preview);
      setShowPreview(true);
    } catch (err) {
      showToast(err.message || 'Failed to build preview', 'error');
    }
  };

  const confirmAndPay = async () => {
    setFinalizing(true);
    try {
      const res = await apiClient.finalizeSalarySheet(sheetId);
      setSheet(res.sheet);
      setShowPreview(false);
      showToast(
        res.notify_sent
          ? 'Salary sheet finalized and sent via WhatsApp.'
          : 'Salary sheet finalized. WhatsApp notification could not be sent.'
      );
      setTimeout(() => navigate(`/admin/internal-staff/${res.sheet.staff_id}`), 1200);
    } catch (err) {
      showToast(err.message || 'Failed to finalize salary sheet', 'error');
    } finally {
      setFinalizing(false);
    }
  };

  const sectionConfig = useMemo(() => ([
    { id: 'earnings', label: 'Earnings', icon: Wallet },
    { id: 'deductions', label: 'Deductions', icon: Receipt },
    { id: 'statutory', label: 'EPF / ETF', icon: ShieldCheck },
  ]), []);

  if (loading) {
    return (
      <AdminLayout title="Salary Sheet" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !sheet) {
    return (
      <AdminLayout title="Salary Sheet">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error || 'Sheet not found'}
        </div>
      </AdminLayout>
    );
  }

  const activeNavSection = sectionConfig.find((s) => s.id === activeSection);
  const ActiveSectionIcon = activeNavSection?.icon;

  return (
    <AdminLayout title={sheet.staff_name} subtitle={sheet.staff_role}>
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
            onClick={() => navigate(`/admin/internal-staff/${sheet.staff_id}`)}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Profile
          </button>

          <div className="relative" ref={actionsDropdownRef}>
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-700"
            >
              Actions <ChevronDown className="h-4 w-4" />
            </button>

            {actionsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setActionsOpen(false); navigate(`/admin/internal-staff/${sheet.staff_id}`); }}
                  className="w-full px-4 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                >
                  View Staff Profile
                </button>
                {sheet.pdf_url && (
                  <a
                    href={sheet.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setActionsOpen(false)}
                    className="block w-full px-4 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                  >
                    Open PDF
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Zoho Books-style header ── */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-4 py-4 @xl:px-6">
            <div className="flex min-w-0 items-center gap-3 @xl:gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                {(sheet.staff_name || 'S').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[15px] font-semibold text-gray-900 break-words @xl:text-[17px]">{sheet.staff_name}</h1>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                    isReadOnly ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                  }`}>
                    {isReadOnly ? 'Finalized' : 'Draft'}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gray-400">
                  <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{monthLabel(sheet.month)}</span>
                  <span>{sheet.staff_role}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Financial snapshot strip */}
          <div className="grid grid-cols-2 gap-px bg-gray-100 @xl:grid-cols-3 @4xl:grid-cols-6">
            {[
              { label: 'Basic Salary',     value: money(totals.basicSalary) },
              { label: 'Allowances',       value: money(totals.allowancesTotal) },
              { label: 'Gross Earnings',   value: money(totals.grossEarnings), cls: 'text-blue-700' },
              { label: 'Total Deductions', value: money(totals.totalDeductions), cls: 'text-red-600' },
              { label: 'EPF Employee',     value: money(totals.epfEmployeeAmount) },
              { label: 'Net Payable',      value: money(totals.netPayable), cls: 'text-emerald-700' },
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

          <aside className="hidden w-56 shrink-0 space-y-4 @3xl:block">
            <div className="sticky top-6 space-y-4">
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
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

              {/* Summary & primary actions */}
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="text-[13px] font-semibold text-gray-700 mb-3">Summary</h3>
                <div className="space-y-1.5 text-[13px]">
                  <div className="flex justify-between"><span className="text-gray-500">Basic Salary</span><span className="text-gray-800">{money(totals.basicSalary)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Allowances</span><span className="text-gray-800">{money(totals.allowancesTotal)}</span></div>
                  {totals.commission > 0 && <div className="flex justify-between"><span className="text-gray-500">Booking Commission</span><span className="text-gray-800">{money(totals.commission)}</span></div>}
                  {performanceAllowanceAmount > 0 && <div className="flex justify-between"><span className="text-gray-500">Performance Allowance</span><span className="text-gray-800">{money(performanceAllowanceAmount)}</span></div>}
                  <div className="flex justify-between pt-1.5 border-t border-gray-100 font-semibold"><span>Gross Earnings</span><span className="text-blue-700">{money(totals.grossEarnings)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Deductions</span><span className="text-red-600">{money(totals.deductionsTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">EPF Employee</span><span className="text-red-600">{money(totals.epfEmployeeAmount)}</span></div>
                  {advancesDeducted > 0 && <div className="flex justify-between"><span className="text-gray-500">Advances</span><span className="text-red-600">{money(advancesDeducted)}</span></div>}
                  <div className="flex justify-between pt-1.5 border-t border-gray-100 font-semibold"><span>Total Deductions</span><span className="text-red-700">{money(totals.totalDeductions)}</span></div>
                  <div className="flex justify-between pt-2 border-t-2 border-gray-900 text-sm font-bold"><span>Net Payable</span><span className="text-emerald-700">{money(totals.netPayable)}</span></div>
                </div>

                {!isReadOnly ? (
                  <div className="mt-4 space-y-2">
                    <button
                      onClick={saveDraft}
                      disabled={saving}
                      className="w-full px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save Draft'}
                    </button>
                    <button
                      onClick={openPreview}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors"
                    >
                      <Eye className="w-4 h-4" /> Preview Payslip
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-2 text-emerald-700 text-sm font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-4 h-4" /> Finalized
                  </div>
                )}
              </div>
            </div>
          </aside>

          <div className="@container min-w-0 flex-1">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50 px-4 py-3 @xl:px-5">
                {ActiveSectionIcon && <ActiveSectionIcon className="h-4 w-4 shrink-0 text-gray-400" />}
                <h2 className="text-[13px] font-semibold text-gray-700">{activeNavSection?.label}</h2>
              </div>

              <div className="p-4 @xl:p-5">
                {/* ── Earnings ── */}
                {activeSection === 'earnings' && (
                  <>
                    <SectionCard title="Basic Salary">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Basic Salary (snapshot)</span>
                        <span className="text-lg font-semibold text-gray-900">{money(sheet.basic_salary)}</span>
                      </div>
                    </SectionCard>

                    <SectionCard title="Allowances">
                      <div className="space-y-2">
                        {lineItems.filter((i) => i.item_type === 'ALLOWANCE').length === 0 && (
                          <p className="text-sm text-gray-400">No allowances added.</p>
                        )}
                        {lineItems.map((item, idx) => item.item_type === 'ALLOWANCE' && (
                          <LineItemRow key={idx} item={item} onRemove={() => removeLineItem(idx)} />
                        ))}
                      </div>
                      {!isReadOnly && <LineItemAdder presets={presets.filter((p) => p.type === 'ALLOWANCE')} onAdd={addLineItem('ALLOWANCE')} />}
                    </SectionCard>

                    <SectionCard title="Registration Commissions">
                      <p className="text-xs text-gray-500 mb-3">
                        Choose how this staff member is paid for registrations — per goal, per registration, or both — then set each registration's commission below.
                      </p>
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Assigned goals &amp; progress</p>
                        {(() => {
                          const regCount = performanceSummary?.registration_count ?? attribution.registrations.length;
                          const relevant = goals.filter((g) => g.status !== 'CLOSED' && (!g.month || g.month === sheet.month));
                          if (relevant.length === 0) {
                            return <p className="text-xs text-gray-400 rounded-lg border border-dashed border-gray-200 p-3">No goals assigned for {monthLabel(sheet.month)}. Add one from the staff profile page.</p>;
                          }
                          return (
                            <div className="space-y-2">
                              {relevant.map((g) => {
                                const achieved = regCount >= g.target_count;
                                const pct = Math.min(100, Math.round((regCount / g.target_count) * 100));
                                return (
                                  <div key={g.id} className={`rounded-lg border p-3 ${achieved ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50/50'}`}>
                                    <div className="flex items-center justify-between gap-2">
                                      <div>
                                        <p className="text-[13px] font-semibold text-gray-800">{g.target_count} registrations{g.month ? '' : ' · Recurring'}</p>
                                        <p className="text-[11px] text-gray-500">Reward {money(g.reward_amount)}</p>
                                      </div>
                                      {achieved ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white"><CheckCircle2 className="w-3 h-3" /> Achieved</span>
                                      ) : (
                                        <span className="text-[11px] font-semibold text-gray-500">{g.target_count - regCount} to go</span>
                                      )}
                                    </div>
                                    <div className="mt-2">
                                      <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                                        <span>Progress</span>
                                        <span className="font-semibold text-gray-700">{regCount} / {g.target_count}</span>
                                      </div>
                                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${achieved ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex flex-wrap gap-3 mb-4">
                        {[
                          { key: 'goal', label: 'Pay per goal', desc: 'Fixed reward when the monthly goal is met', checked: payGoal },
                          { key: 'perReg', label: 'Pay per registration', desc: 'Commission on each registration', checked: payPerReg },
                        ].map((opt) => (
                          <label
                            key={opt.key}
                            className={`flex-1 min-w-[200px] flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${
                              opt.checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                            } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={opt.checked}
                              disabled={isReadOnly}
                              onChange={() => togglePayMethod(opt.key)}
                              className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>
                              <span className="block text-[13px] font-semibold text-gray-800">{opt.label}</span>
                              <span className="block text-[11px] text-gray-500">{opt.desc}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
                        {attribution.registrations.length === 0 ? (
                          <p className="text-xs text-gray-400 p-3">No registrations this month.</p>
                        ) : attribution.registrations.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{r.client_name}</p>
                              <p className="text-[11px] text-gray-400">Reg. fee {money(r.credited_amount)}</p>
                            </div>
                            <CommissionInput
                              value={r.commission_amount}
                              disabled={isReadOnly}
                              onSave={(amt) => updateRegistrationCommission(r.id, amt)}
                            />
                          </div>
                        ))}
                      </div>
                      {attribution.registrations.length > 0 && (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-xs">
                          <span className="text-gray-500">Total commission this month</span>
                          <span className="font-semibold text-gray-800">
                            {money(attribution.registrations.reduce((s, r) => s + parseFloat(r.commission_amount || 0), 0))}
                          </span>
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard title="Bookings This Month">
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                        {attribution.bookings.length === 0 ? (
                          <p className="text-xs text-gray-400 p-3">None</p>
                        ) : attribution.bookings.map((b) => (
                          <div key={b.id} className="flex items-center justify-between px-3 py-2 text-xs">
                            <span className="text-gray-700">{b.client_name} · {b.booking_code}</span>
                            <span className="font-medium text-gray-800">{money(b.credited_amount)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Booking Commission (LKR, manual)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={isReadOnly}
                          value={commissionAmount}
                          onChange={(e) => setCommissionAmount(e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          className="w-48 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 disabled:bg-gray-50"
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Performance Allowance">
                      <p className="text-xs text-gray-400 mb-3">
                        Based on the payment method(s) selected in Registration Commissions above.
                      </p>
                      {!payGoal && !payPerReg && (
                        <p className="text-sm text-gray-400 mb-3">No payment method selected — nothing will be added to the payslip.</p>
                      )}

                      {!performanceSummary ? (
                        <p className="text-sm text-gray-400">No performance data for this month.</p>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 mb-3">
                            <span className="font-semibold text-gray-700">{performanceSummary.registration_count}</span> registrations this month
                          </p>

                          {payGoal && (
                            performanceSummary.goal ? (
                              <div className={`rounded-lg border p-3 mb-3 ${performanceSummary.goal_amount > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-gray-700">Target: {performanceSummary.goal.target_count} registrations</span>
                                  <span className={`inline-flex items-center gap-1 text-xs font-bold ${performanceSummary.goal_amount > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                                    {performanceSummary.goal_amount > 0 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />}
                                    {performanceSummary.goal_amount > 0 ? 'Goal Achieved' : 'Not Achieved'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                                  <span className="text-xs text-gray-500">Reward</span>
                                  <span className="text-sm font-bold text-gray-800">{money(performanceSummary.goal.reward_amount)}</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400 mb-3">No active goal set for this staff member. Set one on their profile page.</p>
                            )
                          )}

                          {payPerReg && (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-700">Sum of registration commissions set above</span>
                                <span className="text-sm font-bold text-gray-800">{money(performanceSummary.per_registration_amount)}</span>
                              </div>
                              <p className="text-[11px] text-gray-400 mt-1">Edit individual amounts in the Registration Commissions card above.</p>
                            </div>
                          )}

                          <div className="flex items-center justify-between bg-blue-600 text-white rounded-lg px-4 py-2.5">
                            <span className="text-xs font-semibold uppercase tracking-wide">Applied to Payslip</span>
                            <span className="text-base font-bold">{money(performanceAllowanceAmount)}</span>
                          </div>
                        </>
                      )}
                    </SectionCard>
                  </>
                )}

                {/* ── Deductions ── */}
                {activeSection === 'deductions' && (
                  <SectionCard title="Deductions">
                    <div className="space-y-2">
                      {advancesDeducted > 0 && (
                        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100">
                          <span className="text-sm text-gray-700">Advances (this month)</span>
                          <span className="text-sm font-medium text-amber-700">{money(advancesDeducted)}</span>
                        </div>
                      )}
                      {lineItems.filter((i) => i.item_type === 'DEDUCTION').length === 0 && advancesDeducted === 0 && (
                        <p className="text-sm text-gray-400">No deductions added.</p>
                      )}
                      {lineItems.map((item, idx) => item.item_type === 'DEDUCTION' && (
                        <LineItemRow key={idx} item={item} onRemove={() => removeLineItem(idx)} />
                      ))}
                    </div>
                    {!isReadOnly && <LineItemAdder presets={presets.filter((p) => p.type === 'DEDUCTION')} onAdd={addLineItem('DEDUCTION')} />}
                  </SectionCard>
                )}

                {/* ── Statutory ── */}
                {activeSection === 'statutory' && (
                  <SectionCard title="EPF / ETF">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setEpfApplicable((v) => !v)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 ${
                          epfApplicable ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                        }`}
                      >
                        EPF (8% Employee / 12% Employer) {epfApplicable ? 'Applied' : 'Not Applied'}
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setEtfApplicable((v) => !v)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 ${
                          etfApplicable ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                        }`}
                      >
                        ETF (3% Employer) {etfApplicable ? 'Applied' : 'Not Applied'}
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 @xl:grid-cols-3 gap-4 text-sm">
                      <div><p className="text-xs text-gray-400 uppercase">EPF Employee</p><p className="font-medium text-red-600">{money(totals.epfEmployeeAmount)}</p></div>
                      <div><p className="text-xs text-gray-400 uppercase">EPF Employer</p><p className="font-medium text-gray-600">{money(totals.epfEmployerAmount)}</p></div>
                      <div><p className="text-xs text-gray-400 uppercase">ETF Employer</p><p className="font-medium text-gray-600">{money(totals.etfEmployerAmount)}</p></div>
                    </div>
                  </SectionCard>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {showPreview && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Payslip Preview</h2>
              <button onClick={() => setShowPreview(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-xs text-gray-400 uppercase">Employee</p>
                  <p className="font-semibold text-gray-900">{preview.staff_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase">Pay Period</p>
                  <p className="font-semibold text-gray-900">{preview.month_label}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-5">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Earnings</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-gray-600">Basic Salary</span><span>{money(preview.basic_salary)}</span></div>
                    {preview.allowances.map((a, i) => (
                      <div key={i} className="flex justify-between"><span className="text-gray-600">{a.label}</span><span>{money(a.amount)}</span></div>
                    ))}
                    {preview.commission_amount > 0 && (
                      <div className="flex justify-between"><span className="text-gray-600">Sales Commission</span><span>{money(preview.commission_amount)}</span></div>
                    )}
                    {preview.performance_allowance_amount > 0 && (
                      <div className="flex justify-between"><span className="text-gray-600">Performance Allowance</span><span>{money(preview.performance_allowance_amount)}</span></div>
                    )}
                    <div className="flex justify-between pt-1.5 border-t border-gray-100 font-semibold"><span>Total</span><span>{money(preview.gross_earnings)}</span></div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Deductions</p>
                  <div className="space-y-1.5 text-sm">
                    {preview.epf_employee_applicable && (
                      <div className="flex justify-between"><span className="text-gray-600">EPF Employee (8%)</span><span>{money(preview.epf_employee_amount)}</span></div>
                    )}
                    {preview.deductions.map((d, i) => (
                      <div key={i} className="flex justify-between"><span className="text-gray-600">{d.label}</span><span>{money(d.amount)}</span></div>
                    ))}
                    {preview.advances_deducted > 0 && (
                      <div className="flex justify-between"><span className="text-gray-600">Advances</span><span>{money(preview.advances_deducted)}</span></div>
                    )}
                    <div className="flex justify-between pt-1.5 border-t border-gray-100 font-semibold"><span>Total</span><span>{money(preview.total_deductions)}</span></div>
                  </div>
                </div>
              </div>

              <div className="mt-5 bg-blue-600 text-white rounded-lg px-5 py-3.5 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide">Net Payable Salary</span>
                <span className="text-xl font-bold">{money(preview.net_payable)}</span>
              </div>

              {(preview.epf_employee_applicable || preview.etf_employer_applicable) && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Employer Statutory Contributions (Not Deducted From Employee)</p>
                  <div className="space-y-1.5 text-sm">
                    {preview.epf_employee_applicable && (
                      <div className="flex justify-between"><span className="text-gray-600">EPF Employer (12%)</span><span>{money(preview.epf_employer_amount)}</span></div>
                    )}
                    {preview.etf_employer_applicable && (
                      <div className="flex justify-between"><span className="text-gray-600">ETF Employer (3%)</span><span>{money(preview.etf_employer_amount)}</span></div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={confirmAndPay}
                disabled={finalizing}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {finalizing && <Loader2 className="w-4 h-4 animate-spin" />}
                {finalizing ? 'Processing…' : 'Confirm & Pay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default InternalStaffSalaryBuilder;
