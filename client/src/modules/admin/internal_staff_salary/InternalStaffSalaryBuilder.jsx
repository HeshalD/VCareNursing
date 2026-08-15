import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, X, Eye, CheckCircle2 } from 'lucide-react';
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

const SectionCard = ({ title, action, children }) => (
  <div className="bg-white border border-slate-200 rounded-xl mb-4">
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const LineItemRow = ({ item, onRemove }) => (
  <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
    <span className="text-sm text-slate-700">{item.label}</span>
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-slate-800">{money(item.amount)}</span>
      <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-600 transition-colors">
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
        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
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
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
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
        className="w-36 px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
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

  const [lineItems, setLineItems] = useState([]);
  const [epfApplicable, setEpfApplicable] = useState(true);
  const [etfApplicable, setEtfApplicable] = useState(true);
  const [commissionAmount, setCommissionAmount] = useState('0');

  const isReadOnly = sheet?.status === 'FINALIZED';
  const isSalesRole = (sheet?.staff_role || '').toLowerCase().includes('sales');

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
      setPresets((presetsRes.presets || []).filter((p) => p.is_active));
      setError(null);

      if ((s.staff_role || '').toLowerCase().includes('sales')) {
        const attrRes = await apiClient.getSalesAttribution(s.staff_id, s.month);
        setAttribution(attrRes);
      }
    } catch (err) {
      setError(err.message || 'Failed to load salary sheet');
    } finally {
      setLoading(false);
    }
  }, [sheetId]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const basicSalary = parseFloat(sheet?.basic_salary || 0);
    const allowancesTotal = lineItems.filter((i) => i.item_type === 'ALLOWANCE').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const deductionsTotal = lineItems.filter((i) => i.item_type === 'DEDUCTION').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const commission = parseFloat(commissionAmount || 0);
    const epfEmployeeAmount = epfApplicable ? basicSalary * EPF_EMPLOYEE_RATE : 0;
    const epfEmployerAmount = epfApplicable ? basicSalary * EPF_EMPLOYER_RATE : 0;
    const etfEmployerAmount = etfApplicable ? basicSalary * ETF_EMPLOYER_RATE : 0;
    const grossEarnings = basicSalary + allowancesTotal + commission;
    const totalDeductions = deductionsTotal + epfEmployeeAmount;
    const netPayable = grossEarnings - totalDeductions;
    return { basicSalary, allowancesTotal, deductionsTotal, commission, epfEmployeeAmount, epfEmployerAmount, etfEmployerAmount, grossEarnings, totalDeductions, netPayable };
  }, [sheet, lineItems, epfApplicable, etfApplicable, commissionAmount]);

  const addLineItem = (type) => (item) => setLineItems((items) => [...items, { ...item, item_type: type }]);
  const removeLineItem = (idx) => setLineItems((items) => items.filter((_, i) => i !== idx));

  const saveDraft = async () => {
    setSaving(true);
    try {
      const res = await apiClient.updateSalarySheet(sheetId, {
        epf_employee_applicable: epfApplicable,
        etf_employer_applicable: etfApplicable,
        commission_amount: parseFloat(commissionAmount || 0),
        line_items: lineItems.map((i) => ({ item_type: i.item_type, preset_id: i.preset_id, label: i.label, amount: i.amount })),
      });
      setSheet(res.sheet);
      setLineItems(res.sheet.line_items || []);
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

  return (
    <AdminLayout
      title={`${sheet.staff_name} — ${monthLabel(sheet.month)}`}
      subtitle={isReadOnly ? 'Finalized salary sheet' : 'Build salary sheet'}
      actions={
        <button
          onClick={() => navigate(`/admin/internal-staff/${sheet.staff_id}`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Profile
        </button>
      }
    >
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SectionCard title="Basic Salary">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Basic Salary (snapshot)</span>
              <span className="text-lg font-semibold text-slate-900">{money(sheet.basic_salary)}</span>
            </div>
          </SectionCard>

          <SectionCard title="Allowances">
            <div className="space-y-2">
              {lineItems.filter((i) => i.item_type === 'ALLOWANCE').length === 0 && (
                <p className="text-sm text-slate-400">No allowances added.</p>
              )}
              {lineItems.map((item, idx) => item.item_type === 'ALLOWANCE' && (
                <LineItemRow key={idx} item={item} onRemove={() => removeLineItem(idx)} />
              ))}
            </div>
            {!isReadOnly && <LineItemAdder presets={presets.filter((p) => p.type === 'ALLOWANCE')} onAdd={addLineItem('ALLOWANCE')} />}
          </SectionCard>

          <SectionCard title="Deductions">
            <div className="space-y-2">
              {lineItems.filter((i) => i.item_type === 'DEDUCTION').length === 0 && (
                <p className="text-sm text-slate-400">No deductions added.</p>
              )}
              {lineItems.map((item, idx) => item.item_type === 'DEDUCTION' && (
                <LineItemRow key={idx} item={item} onRemove={() => removeLineItem(idx)} />
              ))}
            </div>
            {!isReadOnly && <LineItemAdder presets={presets.filter((p) => p.type === 'DEDUCTION')} onAdd={addLineItem('DEDUCTION')} />}
          </SectionCard>

          <SectionCard title="EPF / ETF">
            <div className="flex items-center gap-6">
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => setEpfApplicable((v) => !v)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 ${
                  epfApplicable ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                EPF (8% Employee / 12% Employer) {epfApplicable ? 'Applied' : 'Not Applied'}
              </button>
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => setEtfApplicable((v) => !v)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 ${
                  etfApplicable ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                ETF (3% Employer) {etfApplicable ? 'Applied' : 'Not Applied'}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <div><p className="text-xs text-slate-400 uppercase">EPF Employee</p><p className="font-medium text-red-600">{money(totals.epfEmployeeAmount)}</p></div>
              <div><p className="text-xs text-slate-400 uppercase">EPF Employer</p><p className="font-medium text-slate-600">{money(totals.epfEmployerAmount)}</p></div>
              <div><p className="text-xs text-slate-400 uppercase">ETF Employer</p><p className="font-medium text-slate-600">{money(totals.etfEmployerAmount)}</p></div>
            </div>
          </SectionCard>

          {isSalesRole && (
            <SectionCard title="Sales Commission">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Registrations this month</p>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                    {attribution.registrations.length === 0 ? (
                      <p className="text-xs text-slate-400 p-3">None</p>
                    ) : attribution.registrations.map((r) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="text-slate-700">{r.client_name}</span>
                        <span className="font-medium text-slate-800">{money(r.credited_amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1.5">Bookings this month</p>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                    {attribution.bookings.length === 0 ? (
                      <p className="text-xs text-slate-400 p-3">None</p>
                    ) : attribution.bookings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="text-slate-700">{b.client_name} · {b.booking_code}</span>
                        <span className="font-medium text-slate-800">{money(b.credited_amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Commission Amount (LKR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={isReadOnly}
                  value={commissionAmount}
                  onChange={(e) => setCommissionAmount(e.target.value)}
                  onWheel={(e) => e.target.blur()}
                  className="w-48 px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 disabled:bg-slate-50"
                />
              </div>
            </SectionCard>
          )}
        </div>

        <div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 sticky top-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Basic Salary</span><span className="text-slate-800">{money(totals.basicSalary)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Allowances</span><span className="text-slate-800">{money(totals.allowancesTotal)}</span></div>
              {isSalesRole && <div className="flex justify-between"><span className="text-slate-500">Commission</span><span className="text-slate-800">{money(totals.commission)}</span></div>}
              <div className="flex justify-between pt-2 border-t border-slate-100 font-semibold"><span>Gross Earnings</span><span className="text-blue-700">{money(totals.grossEarnings)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Deductions</span><span className="text-red-600">{money(totals.deductionsTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">EPF Employee</span><span className="text-red-600">{money(totals.epfEmployeeAmount)}</span></div>
              <div className="flex justify-between pt-2 border-t border-slate-100 font-semibold"><span>Total Deductions</span><span className="text-red-700">{money(totals.totalDeductions)}</span></div>
              <div className="flex justify-between pt-3 border-t-2 border-slate-900 text-base font-bold"><span>Net Payable</span><span className="text-emerald-700">{money(totals.netPayable)}</span></div>
            </div>

            {!isReadOnly ? (
              <div className="mt-5 space-y-2">
                <button
                  onClick={saveDraft}
                  disabled={saving}
                  className="w-full px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
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
              <div className="mt-5 flex items-center gap-2 text-emerald-700 text-sm font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4" /> Finalized
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {showPreview && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Payslip Preview</h2>
              <button onClick={() => setShowPreview(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-xs text-slate-400 uppercase">Employee</p>
                  <p className="font-semibold text-slate-900">{preview.staff_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 uppercase">Pay Period</p>
                  <p className="font-semibold text-slate-900">{preview.month_label}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-5">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Earnings</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">Basic Salary</span><span>{money(preview.basic_salary)}</span></div>
                    {preview.allowances.map((a, i) => (
                      <div key={i} className="flex justify-between"><span className="text-slate-600">{a.label}</span><span>{money(a.amount)}</span></div>
                    ))}
                    {preview.commission_amount > 0 && (
                      <div className="flex justify-between"><span className="text-slate-600">Sales Commission</span><span>{money(preview.commission_amount)}</span></div>
                    )}
                    <div className="flex justify-between pt-1.5 border-t border-slate-100 font-semibold"><span>Total</span><span>{money(preview.gross_earnings)}</span></div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Deductions</p>
                  <div className="space-y-1.5 text-sm">
                    {preview.epf_employee_applicable && (
                      <div className="flex justify-between"><span className="text-slate-600">EPF Employee (8%)</span><span>{money(preview.epf_employee_amount)}</span></div>
                    )}
                    {preview.deductions.map((d, i) => (
                      <div key={i} className="flex justify-between"><span className="text-slate-600">{d.label}</span><span>{money(d.amount)}</span></div>
                    ))}
                    <div className="flex justify-between pt-1.5 border-t border-slate-100 font-semibold"><span>Total</span><span>{money(preview.total_deductions)}</span></div>
                  </div>
                </div>
              </div>

              <div className="mt-5 bg-blue-600 text-white rounded-lg px-5 py-3.5 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide">Net Payable Salary</span>
                <span className="text-xl font-bold">{money(preview.net_payable)}</span>
              </div>

              {(preview.epf_employee_applicable || preview.etf_employer_applicable) && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Employer Statutory Contributions (Not Deducted From Employee)</p>
                  <div className="space-y-1.5 text-sm">
                    {preview.epf_employee_applicable && (
                      <div className="flex justify-between"><span className="text-slate-600">EPF Employer (12%)</span><span>{money(preview.epf_employer_amount)}</span></div>
                    )}
                    {preview.etf_employer_applicable && (
                      <div className="flex justify-between"><span className="text-slate-600">ETF Employer (3%)</span><span>{money(preview.etf_employer_amount)}</span></div>
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
