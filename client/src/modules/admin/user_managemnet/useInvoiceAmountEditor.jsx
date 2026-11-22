import React, { useState } from 'react';
import { SingleAmountModal, QuotationAmountsModal, CancelInvoiceModal, InvoiceDateModal } from './InvoiceAmountEditModals';

/**
 * const [openEdit, editModal] = useInvoiceAmountEditor({ clientId, onSaved });
 * openEdit({ kind: 'CARE' | 'REG_FEE' | 'PRODUCT' | 'EXTRA' | 'COMBINED', ... })
 *   CARE      — bookingId, serviceDate, dailyInvoiceId, currentAmount
 *   REG_FEE   — invoiceId, currentAmount
 *   PRODUCT / EXTRA — invoiceId, currentAmount, paid
 *   COMBINED  — quoteId
 *   CANCEL    — invoiceId, currentAmount (cancels an unpaid product invoice)
 *   DATE      — invoiceId, currentDate (YYYY-MM-DD) (changes the date a product/rental invoice is issued on)
 *   all       — optional label, code (shown as the dialog subtitle)
 */
export default function useInvoiceAmountEditor({ clientId, onSaved }) {
  const [target, setTarget] = useState(null);
  const close = () => setTarget(null);
  const saved = () => onSaved?.();

  let modal = null;
  if (target?.kind === 'DATE') {
    modal = <InvoiceDateModal key={`date-${target.invoiceId}`} target={target} onClose={close} onSaved={saved} />;
  } else if (target?.kind === 'CANCEL') {
    modal = <CancelInvoiceModal key={`cancel-${target.invoiceId}`} target={target} onClose={close} onSaved={saved} />;
  } else if (target?.kind === 'COMBINED') {
    modal = <QuotationAmountsModal key={target.quoteId} target={target} onClose={close} onSaved={saved} />;
  } else if (target) {
    modal = <SingleAmountModal key={`${target.kind}-${target.invoiceId || target.dailyInvoiceId}`} target={target} clientId={clientId} onClose={close} onSaved={saved} />;
  }
  return [setTarget, modal];
}
