import React, { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import DateInput, { todayISO } from '../../../components/common/DateInput';
import { Btn, Cap, Drawer, FIELD, Segmented, TEXTAREA } from './PaymentsUi';
import { dd, METHODS, methodName, rs } from './paymentsFormat';

const NO_EVENT = { preventDefault() {} };
const bankLine = (a) => a.account_nickname && a.account_nickname !== a.bank_name ? a.account_nickname : '';
const Label = ({ htmlFor, children }) => <label htmlFor={htmlFor} className="text-[13px] font-semibold text-slate-600">{children}</label>;

// Record a payment / pay from the wallet, each as form → review → confirm. Form values live in the
// parent (paymentForm / payoff* props); this component only owns the step, tab and validation state.
export default function RecordPaymentDrawer({
  open, initialTab, onClose, onConfirmStart,
  overdueAmount, walletBalance, walletAvailableHere, maxPayoff, canPayoff, payoffStatusOk,
  paymentForm, onPaymentFormChange, onSubmitPayment, paymentSubmitting, paymentError,
  payableBankAccounts, paymentSlipFile, slipInputKey, onSlipChange, onClearSlip,
  payoffAmount, payoffNotes, payoffError, payoffSubmitting, onPayoffAmountChange, onPayoffNotesChange, onWalletPayoff,
}) {
  const [tab, setTab] = useState('rec');
  const [step, setStep] = useState('form');
  const [err, setErr] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const fileRef = useRef(null);
  const f = paymentForm;
  const isRec = tab === 'rec';
  const amt = parseFloat(f.amount_received) || 0;
  const wamt = parseFloat(payoffAmount) || 0;
  const needsBank = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(f.payment_method);
  const isCheque = f.payment_method === 'CHEQUE';
  const bank = payableBankAccounts.find(a => String(a.account_id) === String(f.bank_account_id));

  const prefillPayment = (extra = {}) => onPaymentFormChange({
    ...f, ...extra, amount_received: overdueAmount > 0 ? overdueAmount.toFixed(2) : '',
    bank_account_id: extra.bank_account_id ?? (payableBankAccounts.length === 1 ? payableBankAccounts[0].account_id : f.bank_account_id),
  });
  // Fresh form each time the drawer opens, prefilled with the overdue amount / maximum payoff.
  useEffect(() => {
    if (!open) return;
    setTab(initialTab); setStep('form'); setErr(''); setMoreOpen(false); setAttempted(false);
    prefillPayment();
    onPayoffAmountChange(maxPayoff > 0 ? maxPayoff.toFixed(2) : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  const reset = () => {
    setErr(''); onClearSlip();
    onPaymentFormChange({ amount_received: overdueAmount > 0 ? overdueAmount.toFixed(2) : '', payment_method: 'BANK_TRANSFER', bank_account_id: payableBankAccounts.length === 1 ? payableBankAccounts[0].account_id : '', cheque_number: '', cheque_date: '', reference_number: '', notes: '', payment_date: todayISO() });
  };
  const setField = (patch) => { setErr(''); onPaymentFormChange({ ...f, ...patch }); };

  const reviewPayment = () => {
    if (!(amt > 0)) return setErr('Enter an amount greater than zero.');
    if (needsBank && !f.bank_account_id) return setErr('Choose the bank account.');
    if (isCheque && (!f.cheque_number || !f.cheque_date)) return setErr('Enter the cheque number and date.');
    setErr(''); setStep('confirm');
  };
  const reviewPayoff = () => {
    if (!(wamt > 0)) return setErr('Enter an amount greater than zero.');
    if (wamt > maxPayoff + 0.005) return setErr(`The most you can pay from the wallet here is ${rs(maxPayoff)}.`);
    setErr(''); setStep('confirm');
  };
  const confirm = () => {
    setAttempted(true);
    onConfirmStart(isRec ? amt : wamt);
    if (isRec) onSubmitPayment(NO_EVENT); else onWalletPayoff(NO_EVENT);
  };

  const serverErr = attempted ? (isRec ? paymentError : payoffError) : '';
  const banner = err || serverErr;
  const conf = step === 'confirm';
  const submitting = isRec ? paymentSubmitting : payoffSubmitting;
  const emptyReason = overdueAmount <= 0 ? 'There is no overdue amount on this booking.'
    : !payoffStatusOk ? 'Wallet payoff is only available while a booking is active, overdue or pending.'
    : walletBalance <= 0 ? "The client's wallet is empty."
    : "The client's wallet is reserved for their other bookings.";
  const walletOk = canPayoff && payoffStatusOk && overdueAmount > 0 && maxPayoff > 0;

  const title = conf ? `Review ${isRec ? 'payment' : 'payoff'}` : isRec ? 'Record payment' : 'Pay with wallet';
  let footer = null;
  if (conf) {
    footer = (<><Btn onClick={() => { setStep('form'); setAttempted(false); }} disabled={submitting}>Back</Btn>
      <Btn tone="primary" className="flex-1" onClick={confirm} disabled={submitting}>{submitting ? 'Saving…' : isRec ? 'Confirm payment' : 'Confirm payoff'}</Btn></>);
  } else if (isRec) {
    footer = (<><Btn onClick={reset}>Reset</Btn><Btn tone="primary" className="flex-1" onClick={reviewPayment}>Review payment</Btn></>);
  } else if (walletOk) {
    footer = <Btn tone="primary" className="flex-1" onClick={reviewPayoff}>Review payoff</Btn>;
  }

  const after = Math.max(overdueAmount - (isRec ? amt : wamt), 0);
  return (
    <Drawer open={open} onClose={onClose} label="Record payment" title={title} footer={footer}
      subtitle={conf ? 'Check the details before it is recorded' : 'Writes to the booking ledger'}>
      {!conf && (
        <div className="px-5 pt-3.5">
          <Segmented label="Payment actions" value={tab} onChange={(t) => { setTab(t); setErr(''); setAttempted(false); }}
            items={[{ id: 'rec', label: 'Record payment' }, { id: 'wal', label: 'Use wallet' }]} />
        </div>
      )}
      {banner && <div role="alert" className="mx-5 mt-3.5 rounded-md bg-red-50 px-3 py-2.5 text-[13px] text-red-700">{banner}</div>}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 text-sm text-slate-700">
        {conf ? (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <Cap>You are recording</Cap>
              <div className="mt-0.5 text-[28px] font-bold tabular-nums text-slate-900">{rs(isRec ? amt : wamt)}</div>
              <div className="text-[13px] text-slate-500">{isRec ? `on ${dd(f.payment_date)}` : 'applied today'}</div>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="px-3.5 py-3"><Cap>Method</Cap><b className="text-slate-900">{isRec ? methodName(f.payment_method) : 'Wallet payoff'}</b></div>
              {isRec && needsBank && bank && <div className="border-t border-slate-100 px-3.5 py-3"><Cap>Deposited to</Cap><b className="text-slate-900">{bank.bank_name}{bankLine(bank) ? ` · ${bankLine(bank)}` : ''}</b></div>}
              {isRec && isCheque && <div className="border-t border-slate-100 px-3.5 py-3"><Cap>Cheque</Cap><b className="text-slate-900">No. {f.cheque_number} · dated {dd(f.cheque_date)}</b></div>}
            </div>
            <p className="text-[13px] text-slate-500">Overdue after this {isRec ? 'payment' : 'payoff'}: {rs(after)}. This writes to the booking ledger.</p>
          </>
        ) : isRec ? (
          <>
            <div>
              <Label htmlFor="pay-amount">Amount (LKR)</Label>
              <input id="pay-amount" data-autofocus type="number" min="0.01" step="0.01" value={f.amount_received ?? ''} onWheel={e => e.currentTarget.blur()}
                onChange={e => setField({ amount_received: e.target.value })} className={`${FIELD} mt-1.5 text-lg font-semibold`} />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[13px] text-slate-500">{amt > 0 ? `Overdue after this payment: ${rs(after)}` : `Overdue now: ${rs(overdueAmount)}`}</span>
                {overdueAmount > 0 && <Btn tone="ghost" size="sm" onClick={() => setField({ amount_received: overdueAmount.toFixed(2) })}>Pay full overdue</Btn>}
              </div>
              {amt > overdueAmount && amt > 0 && <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-700">This is {rs(amt - overdueAmount)} more than the overdue amount.</div>}
            </div>
            <div>
              <Label htmlFor="pay-date">Payment date</Label>
              <div className="mt-1.5"><DateInput id="pay-date" required max={todayISO()} value={f.payment_date} onChange={e => setField({ payment_date: e.target.value })} className={FIELD} /></div>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-slate-600">Method</div>
              <div className="flex gap-1.5">
                {METHODS.map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={f.payment_method === k}
                    onClick={() => setField({ payment_method: k, bank_account_id: payableBankAccounts.length === 1 ? payableBankAccounts[0].account_id : '', cheque_number: '', cheque_date: '' })}
                    className={`flex-1 rounded-md border px-1.5 py-2 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${f.payment_method === k ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>
                ))}
              </div>
            </div>
            {needsBank && (
              <div>
                <div className="mb-1.5 text-[13px] font-semibold text-slate-600">Deposit to (company bank account)</div>
                <div className="flex flex-col gap-2">
                  {payableBankAccounts.map(a => {
                    const on = String(f.bank_account_id) === String(a.account_id);
                    return (
                      <button key={a.account_id} type="button" aria-pressed={on} onClick={() => setField({ bank_account_id: a.account_id })}
                        className={`block w-full rounded-lg border px-3.5 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${on ? 'border-blue-600 bg-blue-50' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
                        <b className="text-slate-900">{a.bank_name}</b>
                        {bankLine(a) && <span className="block text-[13px] text-slate-500">{bankLine(a)}</span>}
                      </button>
                    );
                  })}
                  {payableBankAccounts.length === 0 && <p className="text-[13px] text-slate-500">No active bank accounts are set up.</p>}
                </div>
              </div>
            )}
            {isCheque && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="pay-chq-no">Cheque no.</Label><input id="pay-chq-no" placeholder="000000" value={f.cheque_number ?? ''} onChange={e => setField({ cheque_number: e.target.value })} className={`${FIELD} mt-1.5`} /></div>
                <div><Label htmlFor="pay-chq-date">Cheque date</Label><div className="mt-1.5"><DateInput id="pay-chq-date" value={f.cheque_date} onChange={e => setField({ cheque_date: e.target.value })} className={FIELD} /></div></div>
              </div>
            )}
            <div>
              <div className="mb-1.5 text-[13px] font-semibold text-slate-600">Payment slip (optional)</div>
              <input ref={fileRef} key={slipInputKey} type="file" accept="image/*,.pdf" className="hidden" onChange={e => onSlipChange(e.target.files?.[0] || null)} />
              {paymentSlipFile ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
                  <span className="truncate font-semibold">{paymentSlipFile.name}</span>
                  <Btn tone="ghost" size="sm" onClick={onClearSlip}>Remove</Btn>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-0.5 rounded-lg border border-dashed border-slate-400 bg-slate-50 p-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                  <Upload className="h-4 w-4" aria-hidden="true" />Choose a file<span className="text-[13px] font-normal text-slate-500">Image or PDF</span>
                </button>
              )}
            </div>
            <div>
              <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)} className="text-sm font-semibold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                {moreOpen ? 'Hide reference and notes' : 'Add reference or notes'}
              </button>
              {moreOpen && (
                <div className="mt-2.5 flex flex-col gap-3.5">
                  <div><Label htmlFor="pay-ref">Reference</Label><input id="pay-ref" placeholder="TRF / receipt no." value={f.reference_number ?? ''} onChange={e => setField({ reference_number: e.target.value })} className={`${FIELD} mt-1.5`} /></div>
                  <div><Label htmlFor="pay-notes">Notes</Label><textarea id="pay-notes" rows={2} placeholder="e.g. 10-day advance" value={f.notes ?? ''} onChange={e => setField({ notes: e.target.value })} className={`${TEXTAREA} mt-1.5`} /></div>
                </div>
              )}
            </div>
          </>
        ) : walletOk ? (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <Cap>Available for this booking</Cap>
              <div className="mt-0.5 text-[22px] font-bold tabular-nums text-slate-900">{rs(walletAvailableHere)}</div>
              <div className="text-[13px] text-slate-500">of {rs(walletBalance)} in the client's wallet{walletAvailableHere < walletBalance ? `, with ${rs(walletBalance - walletAvailableHere)} reserved for their other bookings` : ''}</div>
            </div>
            <div>
              <Label htmlFor="payoff-amount">Amount to pay off (LKR)</Label>
              <div className="mt-1.5 flex gap-2">
                <input id="payoff-amount" data-autofocus type="number" min="0.01" step="0.01" value={payoffAmount} onWheel={e => e.currentTarget.blur()}
                  onChange={e => { setErr(''); onPayoffAmountChange(e.target.value); }} className={`${FIELD} text-lg font-semibold`} />
                <Btn className="h-10" onClick={() => { setErr(''); onPayoffAmountChange(maxPayoff.toFixed(2)); }}>Max</Btn>
              </div>
              <div className="mt-1.5 text-[13px] text-slate-500">{wamt > 0 ? `Overdue after this payoff: ${rs(Math.max(overdueAmount - wamt, 0))}` : `Most you can pay now: ${rs(maxPayoff)}`}</div>
            </div>
            <div><Label htmlFor="payoff-notes">Notes (optional)</Label><textarea id="payoff-notes" rows={2} placeholder="Anything worth remembering" value={payoffNotes} onChange={e => onPayoffNotesChange(e.target.value)} className={`${TEXTAREA} mt-1.5`} /></div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center leading-relaxed text-slate-600">{emptyReason}</div>
        )}
      </div>
    </Drawer>
  );
}
