import React from 'react';
import { X, FileText } from 'lucide-react';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Read-only payslip preview — used from InternalStaffProfilePage to preview a
// sheet without opening the full builder. Mirrors the preview modal built
// into InternalStaffSalaryBuilder.jsx (same field shape from previewSalarySheet).
const PayslipPreviewModal = ({ preview, pdfUrl, onClose }) => {
  if (!preview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Payslip Preview</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
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
                {preview.performance_allowance_amount > 0 && (
                  <div className="flex justify-between"><span className="text-slate-600">Performance Allowance</span><span>{money(preview.performance_allowance_amount)}</span></div>
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
                {preview.advances_deducted > 0 && (
                  <div className="flex justify-between"><span className="text-slate-600">Advances</span><span>{money(preview.advances_deducted)}</span></div>
                )}
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
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-4 h-4" /> Open PDF
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PayslipPreviewModal;
