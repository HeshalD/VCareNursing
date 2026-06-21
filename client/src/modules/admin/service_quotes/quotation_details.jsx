import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, RefreshCw, Receipt, CheckCircle2, Clock3, AlertTriangle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const getStatus = (totalAmount, totalPaid) => {
  const total = parseFloat(totalAmount || 0);
  const paid = parseFloat(totalPaid || 0);
  if (paid > total) return 'OVERPAID';
  if (paid === 0) return 'UNPAID';
  if (paid === total) return 'FULLY_PAID';
  return 'PARTIALLY_PAID';
};

const statusStyles = {
  FULLY_PAID: 'bg-green-100 text-green-700 border-green-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  UNPAID: 'bg-slate-100 text-slate-700 border-slate-200',
  OVERPAID: 'bg-red-100 text-red-700 border-red-200'
};

const QuotationDetailsPage = () => {
  const { quoteId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [quoteRes, progressRes, paymentsRes] = await Promise.all([
        apiClient.getQuoteDetails(quoteId),
        apiClient.getQuotePaymentProgress(quoteId),
        apiClient.getQuotePayments(quoteId)
      ]);

      setQuote(quoteRes.data || null);
      setSummary(progressRes || null);
      setPayments(paymentsRes.payments || []);
    } catch (err) {
      setError(err.message || 'Failed to load quotation details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quoteId) {
      loadData();
    }
  }, [quoteId]);

  const status = useMemo(() => getStatus(summary?.total_amount ?? quote?.total_amount, summary?.total_paid ?? 0), [quote, summary]);

  return (
    <AdminLayout
      title="Quotation Details"
      subtitle="Summary of the selected quotation and all payments recorded against it."
      actions={
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/admin/quotations')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      }
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading quotation...</div>
      ) : !quote ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Quotation not found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm">{quote.estimate_number}</span>
                  </div>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900">{quote.payer_name}</h2>
                  <p className="text-sm text-slate-500">{quote.patient_name} · {quote.service_type}</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[status]}`}>
                  {status.replace('_', ' ')}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Total Amount" value={money(summary?.total_amount ?? quote.total_amount)} icon={Receipt} />
                <SummaryCard label="Paid" value={money(summary?.total_paid ?? 0)} icon={CheckCircle2} valueClassName="text-green-700" />
                <SummaryCard label="Remaining" value={money(summary?.remaining_amount ?? 0)} icon={Clock3} valueClassName="text-amber-700" />
                <SummaryCard label="Payments" value={String(summary?.payment_count ?? payments.length ?? 0)} icon={AlertTriangle} />
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">Payment Progress</span>
                  <span className="text-slate-500">{summary?.percent_paid || '0.00'}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${Math.min(parseFloat(summary?.percent_paid || 0), 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Quotation Line Items</h3>
              {Array.isArray(quote.line_items) && quote.line_items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Unit Price</th>
                        <th className="px-3 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.line_items.map((item) => (
                        <tr key={item.line_item_id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-600">{item.item_type}</td>
                          <td className="px-3 py-2 text-slate-900">{item.description}</td>
                          <td className="px-3 py-2 text-slate-600">{item.quantity}</td>
                          <td className="px-3 py-2 text-slate-600">{money(item.unit_price)}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{money(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No quotation line items available.</p>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Payment Breakdown</h3>
              <div className="space-y-2 text-sm">
                <Row label="Payer" value={quote.payer_name} />
                <Row label="Mobile" value={quote.payer_mobile} />
                <Row label="Service" value={quote.service_type} />
                <Row label="Request Status" value={quote.request_status || 'N/A'} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Payments Made</h3>
              {payments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {payments.map((payment) => (
                    <div key={payment.payment_id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">{money(payment.amount)}</p>
                          <p className="text-xs text-slate-500">{payment.payment_method} · {new Date(payment.payment_date).toLocaleString()}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                          {payment.status}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        {payment.reference_number && <p>Reference: {payment.reference_number}</p>}
                        {payment.cheque_number && <p>Cheque: {payment.cheque_number}</p>}
                        {payment.slip_url && (
                          <a href={payment.slip_url} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:text-blue-700">
                            View slip
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

const SummaryCard = ({ label, value, icon: Icon, valueClassName = 'text-slate-900' }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
      <Icon className="h-4 w-4" /> {label}
    </div>
    <div className={`mt-2 text-lg font-semibold ${valueClassName}`}>{value}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-slate-900">{value || '—'}</span>
  </div>
);

export default QuotationDetailsPage;