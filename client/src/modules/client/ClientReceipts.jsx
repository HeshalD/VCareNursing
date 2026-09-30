import React, { useState } from 'react';
import DocPage, { PdfButtons, usePdfActions, fmtMoney, fmtDate } from './components/DocPage';

const METHODS = { BANK_TRANSFER: 'Bank Transfer', CASH_DEPOSIT: 'Cash Deposit', CASH: 'Cash', CHEQUE: 'Cheque', WALLET: 'Wallet' };

// What the receipt was issued for, from its stored line items.
const purpose = r => {
  const items = Array.isArray(r.line_items) ? r.line_items : [];
  const text = items.map(i => i.description || i.label).filter(Boolean).join('; ');
  return text || 'Payment received';
};

const ClientReceipts = () => {
  const [error, setError] = useState('');
  const actions = usePdfActions(setError);

  return (
    <DocPage
      title="Receipts" subtitle="Receipts for payments we have received from you."
      listKey="receipts" searchFields={['receipt_code', 'reference_number', 'payment_method']}
      error={error} setError={setError}
    >
      {rows => (
        <table className="doc-table">
          <thead>
            <tr><th>Receipt</th><th>Date</th><th>Issued For</th><th>Method</th><th>Amount</th><th /></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.receipt_id}>
                <td style={{ fontWeight: 600 }}>
                  {r.receipt_code}
                  {r.reference_number && <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>Ref {r.reference_number}</div>}
                </td>
                <td>{fmtDate(r.payment_date || r.created_at)}</td>
                <td style={{ color: '#475569', maxWidth: 320 }}>{purpose(r)}</td>
                <td>{METHODS[r.payment_method] || r.payment_method || '—'}</td>
                <td style={{ fontWeight: 600 }}>{fmtMoney(r.total_amount)}</td>
                <td><PdfButtons id={r.receipt_id} path={`/receipts/${r.receipt_id}/pdf`} filename={`${r.receipt_code}.pdf`} actions={actions} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DocPage>
  );
};

export default ClientReceipts;
