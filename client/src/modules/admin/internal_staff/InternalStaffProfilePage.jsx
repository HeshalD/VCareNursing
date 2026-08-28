import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, FileText, Plus, ShieldCheck } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';

const STATUS_CONFIG = {
  Active:      { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Active' },
  Inactive:    { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Inactive' },
  'On Leave':  { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'On Leave' },
};

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

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Active;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const SheetStatusBadge = ({ status }) => {
  const cfg = SHEET_STATUS_CONFIG[status] || SHEET_STATUS_CONFIG.DRAFT;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.text} ${cfg.bg} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const InternalStaffProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [staff, setStaff] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingFlag, setSavingFlag] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.getInternalStaffSalaryProfile(id);
      setStaff(res.staff);
      setSheets(res.sheets || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load staff profile');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
      setCreatingSheet(false);
    }
  };

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

  return (
    <AdminLayout
      title={staff.full_name}
      subtitle="Internal staff profile & salary history"
      actions={
        <button
          onClick={() => navigate('/admin/internal-staff')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Internal Staff
        </button>
      }
    >
      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{staff.full_name}</h2>
              {staff.user_id && <ShieldCheck className="w-4 h-4 text-blue-500" title="Has login account" />}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{staff.role}</p>
            <div className="mt-2"><StatusBadge status={staff.status} /></div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Email</p>
              <p className="text-slate-700">{staff.email}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Phone</p>
              <p className="text-slate-700">{formatMobileNumber(staff.phone) || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Base Salary</p>
              <p className="text-slate-700 font-medium">{money(staff.base_salary)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Joined</p>
              <p className="text-slate-700">
                {staff.joined_date ? new Date(staff.joined_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6">
          <button
            type="button"
            onClick={() => toggleFlag('epf_applicable')}
            disabled={savingFlag}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              staff.epf_applicable ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            EPF {staff.epf_applicable ? 'Applicable' : 'Not Applicable'}
          </button>
          <button
            type="button"
            onClick={() => toggleFlag('etf_applicable')}
            disabled={savingFlag}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              staff.etf_applicable ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            ETF {staff.etf_applicable ? 'Applicable' : 'Not Applicable'}
          </button>
          <p className="text-xs text-slate-400">Toggle to change this staff member's default EPF/ETF eligibility for future sheets.</p>
        </div>
      </div>

      {/* Salary sheets */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Salary Sheets</h3>
          <button
            onClick={buildSheet}
            disabled={creatingSheet}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {creatingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Build Salary Sheet
          </button>
        </div>

        {sheets.length === 0 ? (
          <div className="text-center py-14 text-slate-400 text-sm">No salary sheets yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Net Payable</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Finalized On</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sheets.map((sheet) => (
                <tr key={sheet.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900">{monthLabel(sheet.month)}</td>
                  <td className="px-5 py-3"><SheetStatusBadge status={sheet.status} /></td>
                  <td className="px-5 py-3 text-right font-medium text-slate-800">{money(sheet.net_payable)}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {sheet.finalized_at ? new Date(sheet.finalized_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
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
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
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
      </div>
    </AdminLayout>
  );
};

export default InternalStaffProfilePage;
