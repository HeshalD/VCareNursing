import React, { useState } from 'react';
import DocPage, { Badge, PdfButtons, usePdfActions, fmtMoney, fmtDate } from './components/DocPage';

const statusTone = s => ({ ACCEPTED: 'green', PAID: 'green', REJECTED: 'red', EXPIRED: 'red', SENT: 'blue' }[s] || 'grey');

const ClientQuotations = () => {
  const [error, setError] = useState('');
  const actions = usePdfActions(setError);

  return (
    <DocPage
      title="Quotations" subtitle="Quotations sent to you, and how much has been paid against each."
      listKey="quotations" searchFields={['estimate_number', 'service_type', 'patient_name', 'items_summary']}
      error={error} setError={setError}
    >
      {rows => (
        <table className="doc-table">
          <thead>
            <tr><th>Quotation</th><th>For</th><th>Date</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th><th /></tr>
          </thead>
          <tbody>
            {rows.map(q => {
              const paid = Number(q.amount_paid) || 0;
              const balance = Math.max(Number(q.total_amount) - paid, 0);
              return (
                <tr key={q.quote_id}>
                  <td style={{ fontWeight: 600 }}>{q.estimate_number || `#${String(q.quote_id).slice(0, 8)}`}</td>
                  <td style={{ color: '#475569', maxWidth: 260 }}>
                    {q.items_summary || q.service_type || '—'}
                    {q.patient_name && <div style={{ fontSize: 11, color: '#94a3b8' }}>{q.patient_name}</div>}
                  </td>
                  <td>{fmtDate(q.estimate_date || q.created_at)}</td>
                  <td><Badge tone={statusTone(q.status)}>{q.status}</Badge></td>
                  <td>{fmtMoney(q.total_amount)}</td>
                  <td>
                    {paid > 0 ? <span style={{ color: '#166534', fontWeight: 600 }}>{fmtMoney(paid)}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    {(q.payments || []).length > 1 && <div style={{ fontSize: 11, color: '#94a3b8' }}>{q.payments.length} payments</div>}
                  </td>
                  <td>{paid > 0 ? (balance > 0 ? fmtMoney(balance) : <Badge tone="green">Fully paid</Badge>) : '—'}</td>
                  <td><PdfButtons id={q.quote_id} path={`/quotations/${q.quote_id}/pdf`} filename={`Quotation_${q.estimate_number || q.quote_id}.pdf`} actions={actions} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </DocPage>
  );
};

export default ClientQuotations;
