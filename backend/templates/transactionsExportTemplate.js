const { COMPANY_NAME, COMPANY_ADDRESS_LINES, COMPANY_LOGO_URL } = require('../constants/company');

const money = (v) => `LKR ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const CATEGORY_LABELS = {
  CLIENT_PAYMENT: 'Client Payment', BOOKING_PAYMENT: 'Booking Payment', WALLET_TOPUP: 'Wallet Top-up',
  OTHER_INCOME: 'Other Income', STAFF_SALARY_PAID: 'Salary Paid', STAFF_ADVANCE: 'Salary Advance',
  AGENCY_FEE: 'Agency Fee', INTERNAL_STAFF_SALARY: 'Internal Staff Salary', OTHER_EXPENSE: 'Other Expense', STAFF_SALARY: 'Staff Salary',
  SERVICE_INVOICE: 'Service Invoice', REGISTRATION_FEE: 'Registration Fee', WALLET_DEBIT: 'Wallet Debit',
  WALLET_REFUND: 'Wallet Refund', BOOKING_SETTLEMENT: 'Booking Settlement', PRODUCT_SALE: 'Product Sale',
  RENTAL_PAYMENT: 'Rental Payment', DEPOSIT_REFUND: 'Deposit Refund',
};

const relatedTo = (tx) => {
  if (tx.external_party) return tx.external_party;
  if (tx.client_name) return tx.client_name;
  if (tx.staff_name) return tx.staff_name;
  return '—';
};

const FILTER_LABELS = {
  category: 'Category', flow: 'Direction', payment_method: 'Payment Method', status: 'Status',
  source: 'Source', search: 'Search', from_date: 'From', to_date: 'To',
};

module.exports = (data) => {
  const { transactions = [], summary = {}, filters = {}, generatedAt, generatedBy } = data;

  const appliedFilters = Object.entries(filters)
    .filter(([k, v]) => FILTER_LABELS[k] && v)
    .map(([k, v]) => `${FILTER_LABELS[k]}: ${k === 'category' ? (CATEGORY_LABELS[v] || v) : v}`)
    .join('  ·  ');

  const rowsHtml = transactions.map(tx => {
    const flow = tx._flow;
    const amountColor = flow === 'IN' ? '#0f766e' : flow === 'OUT' ? '#be123c' : '#555';
    const sign = flow === 'IN' ? '+ ' : flow === 'OUT' ? '− ' : '';
    return `
      <tr>
        <td>${fmtDate(tx.transaction_date)}</td>
        <td>${tx.custom_category_label || CATEGORY_LABELS[tx.category] || (tx.category || '').replace(/_/g, ' ')}</td>
        <td>${relatedTo(tx)}</td>
        <td>${(tx.payment_method || '—').replace(/_/g, ' ')}</td>
        <td>${tx.reference_number || '—'}</td>
        <td>${tx.status || '—'}</td>
        <td style="text-align:right; color:${amountColor}; font-weight:bold;">${sign}${money(tx.amount)}</td>
      </tr>
    `;
  }).join('');

  return `
  <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica', Arial, sans-serif; padding: 30px; color: #333; font-size: 11px; }

        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .logo { width: 130px; height: auto; }
        .header-right { text-align: right; }
        .header-right h1 { font-size: 28px; font-weight: 300; color: #555; margin-bottom: 4px; }
        .header-right .meta { font-size: 11px; color: #555; }

        .company-info { margin-bottom: 20px; font-size: 11px; line-height: 1.6; }
        .company-info strong { font-size: 12px; }

        .filters-row { font-size: 10px; color: #888; margin-bottom: 14px; }

        .summary-wrapper { display: flex; gap: 14px; margin-bottom: 20px; }
        .summary-card { flex: 1; border: 1px solid #e8e8e8; border-radius: 6px; padding: 10px 14px; }
        .summary-card .label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
        .summary-card .value { font-size: 15px; font-weight: bold; margin-top: 3px; }

        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #4a90a4; color: white; }
        thead th { padding: 8px 10px; text-align: left; font-weight: normal; font-size: 10px; }
        thead th:last-child { text-align: right; }
        tbody tr { border-bottom: 1px solid #e8e8e8; }
        tbody tr:nth-child(even) { background: #fafafa; }
        tbody td { padding: 7px 10px; font-size: 10px; vertical-align: top; }

        .footer { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 9px; color: #aaa; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <img src="${COMPANY_LOGO_URL}" class="logo" alt="${COMPANY_NAME} Logo" />
        </div>
        <div class="header-right">
          <h1>Transaction Report</h1>
          <div class="meta">Generated ${fmtDateTime(generatedAt)}${generatedBy ? ` by ${generatedBy}` : ''}</div>
        </div>
      </div>

      <div class="company-info">
        <strong>${COMPANY_NAME}</strong><br>
        ${COMPANY_ADDRESS_LINES.join('<br>')}
      </div>

      ${appliedFilters ? `<div class="filters-row">Filters applied — ${appliedFilters}</div>` : ''}

      <div class="summary-wrapper">
        <div class="summary-card">
          <div class="label">Money In</div>
          <div class="value" style="color:#0f766e;">${money(summary.total_in)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Money Out</div>
          <div class="value" style="color:#be123c;">${money(summary.total_out)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Net</div>
          <div class="value">${money(summary.net)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Transactions</div>
          <div class="value">${transactions.length}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Party</th>
            <th>Method</th>
            <th>Reference</th>
            <th>Status</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="footer">${COMPANY_NAME} — Transaction Report — Generated ${fmtDateTime(generatedAt)}</div>
    </body>
  </html>
  `;
};
