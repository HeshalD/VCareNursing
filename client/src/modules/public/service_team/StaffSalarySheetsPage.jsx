import React, { useEffect, useState } from 'react';
import { FileText, Download, Eye } from 'lucide-react';
import apiClient from '../../../api/api';
import StaffPageShell, { EmptyState } from './StaffPageShell';
import useMyStaffProfile from './useMyStaffProfile';

const formatCurrency = (v) => `LKR ${Number(v || 0).toLocaleString()}`;
const formatDate = (v) => (v
  ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—');
const label = (v) => (v ? String(v).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

const StaffSalarySheetsPage = () => {
  const { staff, loading: profileLoading, error: profileError } = useMyStaffProfile();
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getMySalarySheets();
        setSheets(res.data || []);
      } catch (err) {
        console.error('Error loading salary sheets:', err);
        setError('Could not load your salary sheets. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = sheets.reduce((sum, s) => sum + Number(s.amount_paid || 0), 0);

  return (
    <StaffPageShell
      staffProfileId={staff?.staff_profile_id}
      title="Salary Sheets"
      subtitle="Your payout statements. Open or download the PDF for each payment."
      loading={loading || profileLoading}
      error={error || profileError}
    >
      {sheets.length === 0 ? (
        <EmptyState icon={FileText} title="No salary sheets yet" description="Salary sheets appear here after a payout is made to you." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Total paid out</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatCurrency(total)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Salary sheets</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{sheets.length}</p>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Sheet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sheets.map((s) => (
                  <tr key={s.staff_payment_id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(s.paid_at)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(s.amount_paid)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {label(s.payment_method)}
                      {s.staff_bank_name && <span className="block text-xs text-slate-400">{s.staff_bank_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{s.reference_number || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {label(s.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <a href={s.salary_sheet_url} target="_blank" rel="noopener noreferrer" title="View" className="text-slate-500 hover:text-blue-600">
                          <Eye className="h-4 w-4" />
                        </a>
                        <a href={s.salary_sheet_url} download target="_blank" rel="noopener noreferrer" title="Download" className="text-slate-500 hover:text-blue-600">
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </StaffPageShell>
  );
};

export default StaffSalarySheetsPage;
