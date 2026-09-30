import React, { useState } from 'react';
import DocPage, { PdfButtons, usePdfActions, fmtMoney, fmtDate } from './components/DocPage';

const ClientStatements = () => {
  const [error, setError] = useState('');
  const [range, setRange] = useState({ start: '', end: '' });
  const actions = usePdfActions(setError);

  const query = new URLSearchParams();
  if (range.start) query.set('start_date', range.start);
  if (range.end) query.set('end_date', `${range.end}T23:59:59.999Z`);
  const customPath = `/statements/download${query.toString() ? `?${query}` : ''}`;

  const dateInput = { border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: "'DM Sans', sans-serif", display: 'block', marginTop: 4 };

  const generator = (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>From
        <input type="date" value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} style={dateInput} />
      </label>
      <label style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>To
        <input type="date" value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} style={dateInput} />
      </label>
      <PdfButtons id="custom" path={customPath} filename="Statement.pdf" actions={actions} />
    </div>
  );

  return (
    <DocPage
      title="Statements" subtitle="Generate a statement for any period, or re-open one issued to you earlier."
      listKey="statements" headerExtra={generator}
      error={error} setError={setError}
    >
      {rows => (
        <table className="doc-table">
          <thead>
            <tr><th>Period</th><th>Issued</th><th>Opening</th><th>Invoiced</th><th>Paid</th><th>Balance</th><th /></tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.statement_id}>
                <td style={{ fontWeight: 600 }}>{fmtDate(s.period_start)} – {fmtDate(s.period_end)}</td>
                <td>{fmtDate(s.created_at)}</td>
                <td>{fmtMoney(s.opening_balance)}</td>
                <td>{fmtMoney(s.total_invoiced)}</td>
                <td>{fmtMoney(s.total_paid)}</td>
                <td style={{ fontWeight: 600 }}>{fmtMoney(s.balance_due)}</td>
                <td><PdfButtons id={s.statement_id} path={`/statements/download?statement_id=${s.statement_id}`} filename={`Statement_${s.period_start}_${s.period_end}.pdf`} actions={actions} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DocPage>
  );
};

export default ClientStatements;
