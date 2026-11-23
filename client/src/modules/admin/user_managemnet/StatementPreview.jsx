import React from 'react';
import { Loader2 } from 'lucide-react';
import EditedAmountBadge from '../components/EditedAmountBadge';

// On-screen preview of the Statement of Accounts PDF (backend/templates/statementTemplate.html).
// It renders the same data the PDF is built from (GET /statement/:client_id), laid out the same way,
// so what is shown here is what Download / Send WhatsApp will produce for the selected period.
//
// Balance convention (same as the PDF): what the client owes is positive; credit is negative.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BLUE = '#2f80b9';
const LOGO_URL = 'https://tuvh2lxa24zjyv7p.public.blob.vercel-storage.com/VCareLogo.png';

const fmtDay = (day) => {
  if (!day) return '—';
  const [y, m, d] = String(day).slice(0, 10).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
};
const fmtMoney = (n) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatementPreview = ({ data, loading, error, clientName, start, end }) => {
  const summary = data?.account_summary || null;
  const ledger = Array.isArray(data?.ledger) ? data.ledger : [];

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3.5 @xl:px-5">
        <div>
          <h3 className="text-[13px] font-semibold text-gray-800">Statement Preview</h3>
          <p className="mt-0.5 text-xs text-gray-400">
            How the statement will look for the selected period — Download and Send WhatsApp use exactly this.
          </p>
        </div>
        {loading && data && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      <div className="bg-gray-100/70 p-3 @xl:p-5">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 rounded-md bg-white py-16 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Building statement preview…
          </div>
        ) : error && !data ? (
          <div className="rounded-md bg-white px-5 py-10 text-center text-sm text-rose-600">{error}</div>
        ) : !summary ? (
          <div className="rounded-md bg-white px-5 py-10 text-center text-sm text-gray-400">
            Choose a start and end date to preview the statement.
          </div>
        ) : (
          <div className="mx-auto max-w-[900px] bg-white px-5 py-6 text-[12px] text-gray-700 shadow-sm ring-1 ring-gray-200 @xl:px-8">
            {/* header: logo left, company right */}
            <div className="flex items-start justify-between gap-4">
              <div className="relative h-[93px] w-[190px] shrink-0 overflow-hidden">
                <img
                  src={LOGO_URL}
                  alt="VCare Nursing"
                  style={{ position: 'absolute', width: 316.7, left: -62.7, top: -112.1, maxWidth: 'none' }}
                />
              </div>
              <div className="text-right leading-relaxed text-gray-600">
                <div className="font-bold text-gray-900">Vcare Nursing</div>
                <div>No: 293/17B</div>
                <div>Hospital Rd</div>
                <div>Sri Jayewardenepura Sri Lanka</div>
                <div>SriLanka</div>
              </div>
            </div>

            {/* To  |  title, period, summary */}
            <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-[160px] pt-1 font-bold leading-relaxed text-gray-900">
                <div>To</div>
                <div>{clientName}</div>
              </div>
              <div className="w-full max-w-[330px]">
                <div
                  className="border-b-2 border-gray-900 pb-1 text-right text-[22px] font-bold leading-tight"
                  style={{ color: BLUE }}
                >
                  Statement of Accounts
                </div>
                <div className="mb-5 border-b-2 border-gray-900 py-1 text-right text-[11px] text-gray-700">
                  {fmtDay(start)} To {fmtDay(end)}
                </div>
                <div>
                  <div className="bg-gray-200 px-2 py-2 text-[12px] font-bold text-gray-900">Account Summary</div>
                  <table className="w-full">
                    <tbody>
                      <tr><td className="px-2 py-1.5">Opening Balance</td><td className="px-2 py-1.5 text-right">LKR {fmtMoney(summary.opening_balance)}</td></tr>
                      <tr><td className="px-2 py-1.5">Invoiced Amount</td><td className="px-2 py-1.5 text-right">LKR {fmtMoney(summary.invoiced_amount)}</td></tr>
                      <tr><td className="px-2 py-1.5">Amount Paid</td><td className="px-2 py-1.5 text-right">LKR {fmtMoney(summary.amount_paid)}</td></tr>
                      <tr className="border-t-[1.5px] border-gray-900">
                        <td className="px-2 pb-1.5 pt-2">Balance Due</td>
                        <td className="px-2 pb-1.5 pt-2 text-right">LKR {fmtMoney(summary.balance_due)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ledger */}
            <div className="mt-7 max-h-[640px] overflow-auto">
              <table className="w-full min-w-[640px] table-fixed border-collapse">
                <thead className="sticky top-0 z-10 text-white" style={{ background: BLUE }}>
                  <tr className="text-left text-[12px] font-bold">
                    <th className="w-[14%] px-2 py-2">Date</th>
                    <th className="w-[15%] px-2 py-2">Transactions</th>
                    <th className="w-[31%] px-2 py-2">Details</th>
                    <th className="w-[14%] px-2 py-2 text-right">Amount</th>
                    <th className="w-[13%] px-2 py-2 text-right">Payments</th>
                    <th className="w-[13%] px-2 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600 [&>tr:nth-child(even)]:bg-gray-100/80">
                  <tr>
                    <td className="px-2 py-3 align-middle">{fmtDay(start)}</td>
                    <td className="px-2 py-3 align-middle">***Opening Balance***</td>
                    <td className="px-2 py-3" />
                    <td className="px-2 py-3 text-right align-middle whitespace-nowrap">{fmtMoney(summary.opening_balance)}</td>
                    <td className="px-2 py-3" />
                    <td className="px-2 py-3 text-right align-middle whitespace-nowrap">{fmtMoney(summary.opening_balance)}</td>
                  </tr>
                  {ledger.map((row, i) => (
                    <tr key={`${row.transaction_id}-${i}`}>
                      <td className="px-2 py-3 align-middle whitespace-nowrap">{fmtDay(row.date)}</td>
                      <td className="px-2 py-3 align-middle">{row.label || row.transactions}</td>
                      <td className="whitespace-pre-line break-words px-2 py-3 align-middle">{row.details}</td>
                      <td className="px-2 py-3 text-right align-middle whitespace-nowrap">
                        {row.amount_invoiced ? fmtMoney(row.amount_invoiced) : ''}
                        {row.amount_invoiced ? <EditedAmountBadge record={row} className="ml-1" /> : null}
                      </td>
                      <td className="px-2 py-3 text-right align-middle whitespace-nowrap">
                        {row.amount_paid ? fmtMoney(row.amount_paid) : ''}
                        {row.amount_paid ? <EditedAmountBadge record={row} className="ml-1" /> : null}
                      </td>
                      <td className="px-2 py-3 text-right align-middle whitespace-nowrap">{fmtMoney(row.balance)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-300 !bg-white font-bold text-gray-900">
                    <td colSpan={4} />
                    <td className="px-2 pt-2.5 text-right">Balance Due</td>
                    <td className="px-2 pt-2.5 text-right whitespace-nowrap">LKR {fmtMoney(summary.balance_due)}</td>
                  </tr>
                </tbody>
              </table>
              {ledger.length === 0 && (
                <p className="py-4 text-center text-xs text-gray-400">No transactions in this period.</p>
              )}
            </div>

            {/* bank note */}
            <div className="mt-7 leading-relaxed text-gray-600">
              <div>Note:</div>
              <div>Please use the below bank account details for the payments,</div>
              <div>And you will receive a payment receipt after you done the payment.</div>
              <div className="mt-3">Account Number - 100654589154</div>
              <div>Account Name - VCare</div>
              <div>Bank - Sampath Bank</div>
              <div>Branch - Maharagama</div>
              <div>Description - Vcare Home Nursing</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatementPreview;
