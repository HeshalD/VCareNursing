import React, { useState } from 'react';
import DocPage, { Badge, PdfButtons, usePdfActions, fmtMoney, fmtDate } from './components/DocPage';

const KIND_LABEL = { SERVICE: 'Care service', PRODUCT: 'Products / rentals', REG_FEE: 'Registration' };
const statusTone = s => ({ PAID: 'green', CONFIRMED: 'green', PENDING: 'amber', SENT: 'blue', OVERDUE: 'red' }[s] || 'grey');

const ClientInvoices = () => {
  const [error, setError] = useState('');
  const actions = usePdfActions(setError);

  return (
    <DocPage
      title="Invoices" subtitle="Invoices raised for your care services, products and registration."
      listKey="invoices" searchFields={['code', 'description', 'status']}
      error={error} setError={setError}
    >
      {rows => (
        <table className="doc-table">
          <thead>
            <tr><th>Invoice</th><th>Type</th><th>Details</th><th>Date</th><th>Status</th><th>Amount</th><th /></tr>
          </thead>
          <tbody>
            {rows.map(i => (
              <tr key={`${i.kind}-${i.id}`}>
                <td style={{ fontWeight: 600 }}>{i.code}</td>
                <td>{KIND_LABEL[i.kind]}</td>
                <td style={{ color: '#475569', maxWidth: 280 }}>{i.description || '—'}</td>
                <td>{fmtDate(i.date)}</td>
                <td><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
                <td>
                  <span style={{ fontWeight: 600 }}>{fmtMoney(i.amount)}</span>
                  {i.amount_paid != null && Number(i.amount_paid) > 0 && (
                    <div style={{ fontSize: 11, color: '#166534' }}>Paid {fmtMoney(i.amount_paid)}</div>
                  )}
                </td>
                <td><PdfButtons id={`${i.kind}-${i.id}`} path={`/invoices/${i.kind}/${i.id}/pdf`} filename={`${i.code}.pdf`} actions={actions} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DocPage>
  );
};

export default ClientInvoices;
