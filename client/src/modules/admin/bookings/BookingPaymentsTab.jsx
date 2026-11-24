// Payments tab of the admin booking detail page. Thin wrapper: it owns the filters, the history
// view and the drawer/toast state, and hands everything else to small components in this folder
// (PaymentsSummary, PaymentsToolbar, PaymentsTable, PaymentDetailsDrawer, RecordPaymentDrawer).
// Data, form state and handlers all come from props, so the parent page is unchanged.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Btn } from './PaymentsUi';
import PaymentsSummary from './PaymentsSummary';
import PaymentsToolbar from './PaymentsToolbar';
import PaymentsTable from './PaymentsTable';
import PaymentDetailsDrawer from './PaymentDetailsDrawer';
import RecordPaymentDrawer from './RecordPaymentDrawer';
import { receiptState, referenceText, rs } from './paymentsFormat';

/**
 * Payments, from normPayments in the page: { id, date, amount, method ('WALLET' | …), methodLabel, reference,
 *   notes, slipUrl, chequeNumber, chequeDate, bankName, wasEdited, productInvoice }
 * @param totalInvoiced, overdueAmount, paymentsReceivedTotal, walletBalance, walletAvailableHere, maxPayoff  numbers
 * @param lastPaymentDate       ISO date | null
 * @param receivedPayments      bank/cash/cheque payments, newest first
 * @param walletPayments        wallet auto-applications, newest first
 * @param receiptByPayment      { [paymentId]: receipt } (receipt_id, receipt_code, pdf_url, whatsapp_sent, whatsapp_sent_at, total_amount, allocated_amount)
 * @param receiptBusy           receipt_id being sent/retried, or `gen-<paymentId>` while creating
 * @param lastRecordedPaymentId id of the payment just recorded (closes the drawer and highlights the new row)
 * @param paymentForm, onPaymentFormChange(nextForm), onSubmitPayment(event), paymentSubmitting
 * @param payableBankAccounts   [{ account_id, account_nickname, bank_name }]
 * @param paymentSlipFile, slipInputKey, onSlipChange(file|null), onClearSlip()
 * @param onSendReceipt(receiptId), onRegenerateReceipt(receiptId), onGenerateReceipt(paymentId)
 * @param canPayoff, payoffStatusOk, payoffAmount, payoffNotes, payoffError, payoffDone, payoffSubmitting,
 *        onPayoffAmountChange(value), onPayoffNotesChange(value), onWalletPayoff(event)
 * Optional: paymentError (message from a failed payment save, shown in the drawer)
 */
export default function BookingPaymentsTab({
  totalInvoiced = 0, overdueAmount = 0, paymentsReceivedTotal = null, walletBalance = 0, walletAvailableHere = 0, maxPayoff = 0,
  lastPaymentDate = null, receivedPayments = [], walletPayments = [], receiptByPayment = {}, receiptBusy = '', lastRecordedPaymentId = null,
  paymentForm = {}, onPaymentFormChange = () => {}, onSubmitPayment = (e) => e?.preventDefault?.(), paymentSubmitting = false, paymentError = '',
  payableBankAccounts = [], paymentSlipFile = null, slipInputKey = 0, onSlipChange = () => {}, onClearSlip = () => {},
  onSendReceipt = () => {}, onRegenerateReceipt = () => {}, onGenerateReceipt = () => {},
  canPayoff = false, payoffStatusOk = true, payoffAmount = '', payoffNotes = '', payoffError = '', payoffDone = '', payoffSubmitting = false,
  onPayoffAmountChange = () => {}, onPayoffNotesChange = () => {}, onWalletPayoff = (e) => e?.preventDefault?.(),
}) {
  const [view, setView] = useState('recv');
  const [query, setQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');
  const [unsentOnly, setUnsentOnly] = useState(false);
  const [limit, setLimit] = useState(5);
  const [selectedId, setSelectedId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('rec');
  const [highlightId, setHighlightId] = useState(null);
  const [toast, setToast] = useState('');
  const timers = useRef([]);
  const submitted = useRef(null);   // { amount, tops } captured when the admin confirms
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (m) => { setToast(m); later(() => setToast(''), 2600); };

  const isRecv = view === 'recv';
  const walletApplied = walletPayments.reduce((t, p) => t + Number(p.amount || 0), 0);
  const receivedSum = paymentsReceivedTotal ?? receivedPayments.reduce((t, p) => t + Number(p.amount || 0), 0);
  const stateOf = (p) => receiptState(receiptByPayment[p.id]);

  // ── filters ──
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => (isRecv ? receivedPayments : walletPayments).filter(p => (
    (!isRecv || methodFilter === 'All' || p.method === methodFilter)
    && (!(isRecv && unsentOnly) || stateOf(p) !== 'sent')
    && (!q || `${referenceText(p)} ${p.notes} ${p.bankName || ''} ${p.methodLabel}`.toLowerCase().includes(q))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  )), [isRecv, receivedPayments, walletPayments, methodFilter, unsentOnly, q, receiptByPayment]);
  const methodCounts = { All: receivedPayments.length };
  receivedPayments.forEach(p => { methodCounts[p.method] = (methodCounts[p.method] || 0) + 1; });
  const unsentCount = receivedPayments.filter(p => stateOf(p) !== 'sent').length;
  const clearFilters = () => { setQuery(''); setMethodFilter('All'); setUnsentOnly(false); setLimit(5); };

  // ── receipts: one primary action per row ──
  const receiptAction = (p) => {
    const rcpt = receiptByPayment[p.id];
    const st = receiptState(rcpt);
    if (st === 'none') onGenerateReceipt(p.id);
    else if (st === 'failed') onRegenerateReceipt(rcpt.receipt_id);
    else onSendReceipt(rcpt.receipt_id);
  };
  const busyFor = (p) => { const r = receiptByPayment[p.id]; return (!!r && receiptBusy === r.receipt_id) || receiptBusy === `gen-${p.id}`; };

  // ── CSV of the filtered rows ──
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Date', 'Method', 'Bank', 'Reference', 'Amount (LKR)', 'Notes'];
    const lines = rows.map(p => [String(p.date || '').slice(0, 10), p.methodLabel, p.bankName || '', referenceText(p), Number(p.amount || 0), p.notes === '-' ? '' : p.notes].map(esc).join(','));
    const url = URL.createObjectURL(new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `payments-${isRecv ? 'received' : 'wallet'}.csv`; a.click(); URL.revokeObjectURL(url);
    flash(`Exported ${rows.length} row${rows.length !== 1 ? 's' : ''} to CSV`);
  };

  // ── drawer + success handling ──
  const openDrawer = (tab) => { setSelectedId(null); setDrawerTab(tab); setDrawerOpen(true); };
  const onConfirmStart = (amount) => {
    submitted.current = { amount, tops: { recv: `${receivedPayments.length}:${receivedPayments[0]?.id}`, wal: `${walletPayments.length}:${walletPayments[0]?.id}` } };
  };
  const finishSuccess = (kind) => {
    const amount = submitted.current?.amount ?? 0;
    setDrawerOpen(false); setView(kind === 'rec' ? 'recv' : 'wal'); clearFilters();
    flash(kind === 'rec' ? `Payment of ${rs(amount)} recorded` : `Paid ${rs(amount)} from the wallet`);
  };
  const prevRecorded = useRef(lastRecordedPaymentId);
  useEffect(() => {
    if (lastRecordedPaymentId && lastRecordedPaymentId !== prevRecorded.current && submitted.current) finishSuccess('rec');
    prevRecorded.current = lastRecordedPaymentId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRecordedPaymentId]);
  const prevDone = useRef(payoffDone);
  useEffect(() => {
    if (payoffDone && payoffDone !== prevDone.current && submitted.current) finishSuccess('wal');
    prevDone.current = payoffDone;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payoffDone]);

  // Highlight the new row once the refetched list shows it.
  const recvSig = `${receivedPayments.length}:${receivedPayments[0]?.id}`;
  const walSig = `${walletPayments.length}:${walletPayments[0]?.id}`;
  useEffect(() => {
    const s = submitted.current;
    if (!s) return;
    let id = null;
    if (recvSig !== s.tops.recv) id = receivedPayments.find(p => p.id === lastRecordedPaymentId)?.id || receivedPayments[0]?.id;
    else if (walSig !== s.tops.wal) id = walletPayments[0]?.id;
    if (!id) return;
    submitted.current = null;
    setHighlightId(id); later(() => setHighlightId(null), 3500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recvSig, walSig]);

  const selected = [...receivedPayments, ...walletPayments].find(p => p.id === selectedId) || null;

  return (
    <div className="flex flex-col gap-[18px] text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold">Payments</h2>
          <div className="mt-0.5 text-[13px] text-slate-500">What has been paid and what is still owed on this booking</div>
        </div>
        <div className="flex gap-2.5">
          <Btn onClick={() => openDrawer('wal')}><Wallet className="h-4 w-4" aria-hidden="true" />Pay with wallet</Btn>
          <Btn tone="primary" onClick={() => openDrawer('rec')}>Record payment</Btn>
        </div>
      </div>

      <PaymentsSummary overdueAmount={overdueAmount} totalInvoiced={totalInvoiced} paymentsReceived={receivedSum}
        walletBalance={walletBalance} walletApplied={walletApplied} lastPaymentDate={lastPaymentDate || receivedPayments[0]?.date || null} />

      <PaymentsToolbar view={view} onView={(v) => { setView(v); setLimit(5); setQuery(''); }} receivedCount={receivedPayments.length} walletCount={walletPayments.length}
        query={query} onQuery={(v) => { setQuery(v); setLimit(5); }} methodFilter={methodFilter} onMethodFilter={(m) => { setMethodFilter(m); setLimit(5); }} methodCounts={methodCounts}
        unsentOnly={unsentOnly} onUnsentOnly={() => { setUnsentOnly(u => !u); setLimit(5); }} unsentCount={unsentCount} onExport={exportCsv} canExport={rows.length > 0} />

      <PaymentsTable rows={rows} isWallet={!isRecv} limit={limit} onMore={() => setLimit(n => n + 5)} highlightId={highlightId}
        receiptByPayment={receiptByPayment} receiptBusy={receiptBusy} onOpen={(p) => setSelectedId(p.id)} onReceiptAction={receiptAction} onClear={clearFilters} />

      <PaymentDetailsDrawer payment={selected} receipt={selected ? receiptByPayment[selected.id] : null} busy={selected ? busyFor(selected) : false}
        onClose={() => setSelectedId(null)} onReceiptAction={receiptAction} />

      <RecordPaymentDrawer open={drawerOpen} initialTab={drawerTab} onClose={() => setDrawerOpen(false)} onConfirmStart={onConfirmStart}
        overdueAmount={overdueAmount} walletBalance={walletBalance} walletAvailableHere={walletAvailableHere} maxPayoff={maxPayoff}
        canPayoff={canPayoff} payoffStatusOk={payoffStatusOk}
        paymentForm={paymentForm} onPaymentFormChange={onPaymentFormChange} onSubmitPayment={onSubmitPayment} paymentSubmitting={paymentSubmitting} paymentError={paymentError}
        payableBankAccounts={payableBankAccounts} paymentSlipFile={paymentSlipFile} slipInputKey={slipInputKey} onSlipChange={onSlipChange} onClearSlip={onClearSlip}
        payoffAmount={payoffAmount} payoffNotes={payoffNotes} payoffError={payoffError} payoffSubmitting={payoffSubmitting}
        onPayoffAmountChange={onPayoffAmountChange} onPayoffNotesChange={onPayoffNotesChange} onWalletPayoff={onWalletPayoff} />

      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-50">{toast}</div>}
    </div>
  );
}
