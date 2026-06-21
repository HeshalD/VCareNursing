// Clean, dynamic payment receipt.
// Unlike a single-purpose invoice receipt, the "Payment for" table is driven by
// `line_items` so the same template serves booking payments, quote/invoice
// payments and wallet top-ups.
//
// Expected `data` shape:
//   {
//     receipt_code, payment_date, payment_method, reference_number, cheque_number,
//     received_from, total_amount, generated_at,
//     line_items: [{ label, description, amount }]
//   }
module.exports = (data) => {
    const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const methodLabel = {
        BANK_TRANSFER: 'Bank Transfer',
        CASH_DEPOSIT: 'Cash Deposit',
        CASH: 'Cash',
        CHEQUE: 'Cheque',
        WALLET: 'Wallet',
    };

    const lineItems = Array.isArray(data.line_items) ? data.line_items : [];
    const itemsTotal = lineItems.reduce((s, it) => s + parseFloat(it.amount || 0), 0);

    const itemRows = lineItems.map((it) => `
        <tr>
            <td>
                <div class="item-label">${it.label || '—'}</div>
                ${it.description ? `<div class="item-desc">${it.description}</div>` : ''}
            </td>
            <td class="tr">LKR ${fmt(it.amount)}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica', Arial, sans-serif; padding: 44px; color: #1f2937; font-size: 12px; }

        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
        .logo { width: 150px; height: auto; }
        .company-info { text-align: right; font-size: 11px; line-height: 1.7; color: #6b7280; }
        .company-info strong { color: #111827; font-size: 13px; }

        .title-bar { text-align: center; margin: 8px 0 28px; }
        .title-bar h1 { font-size: 22px; font-weight: 600; letter-spacing: 4px; color: #137A6B; text-transform: uppercase; }
        .title-bar .receipt-no { font-size: 11px; color: #9ca3af; margin-top: 6px; letter-spacing: 1px; }

        .top-grid { display: flex; justify-content: space-between; align-items: stretch; gap: 24px; margin-bottom: 28px; }
        .detail-table { flex: 1; }
        .detail-table td { padding: 5px 0; font-size: 12px; vertical-align: top; }
        .detail-table td:first-child { color: #9ca3af; padding-right: 20px; white-space: nowrap; }
        .detail-table td:last-child { font-weight: 600; color: #111827; }

        .amount-banner { background: #137A6B; color: #fff; border-radius: 10px; padding: 20px 26px; min-width: 230px; display: flex; flex-direction: column; justify-content: center; }
        .amount-banner .ab-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.85; }
        .amount-banner .ab-amount { font-size: 30px; font-weight: 700; margin-top: 6px; }

        .received-block { margin-bottom: 22px; }
        .received-block .lbl { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
        .received-block .name { font-size: 17px; font-weight: bold; color: #111827; }

        .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 10px; }

        .items-table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
        .items-table thead tr { background: #f1f5f9; }
        .items-table thead th { padding: 10px 16px; text-align: left; font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; }
        .items-table thead th.tr { text-align: right; }
        .items-table tbody td { padding: 12px 16px; border-top: 1px solid #f1f5f9; }
        .items-table .item-label { font-weight: 600; color: #111827; font-size: 12.5px; }
        .items-table .item-desc { font-size: 11px; color: #6b7280; margin-top: 2px; }
        .items-table .tr { text-align: right; }
        .items-table tfoot td { padding: 14px 16px; background: #f8fafc; border-top: 2px solid #137A6B; font-weight: 700; font-size: 13px; color: #137A6B; }

        .no-items { text-align: center; color: #9ca3af; font-style: italic; padding: 16px; }

        .note { margin-top: 22px; font-size: 11px; color: #6b7280; background: #f9fafb; border-left: 3px solid #137A6B; padding: 10px 14px; border-radius: 4px; }

        .footer { margin-top: 36px; border-top: 1px solid #e5e7eb; padding-top: 14px; font-size: 10px; color: #9ca3af; text-align: center; line-height: 1.6; }
        .footer strong { color: #6b7280; }
    </style>
</head>
<body>

    <div class="header">
        <img src="https://tuvh2lxa24zjyv7p.public.blob.vercel-storage.com/VCareLogo.png" class="logo" alt="VCare Nursing" />
        <div class="company-info">
            <strong>VCare Nursing</strong><br>
            No: 293/17B, Hospital Rd<br>
            Sri Jayewardenepura, Sri Lanka
        </div>
    </div>

    <div class="title-bar">
        <h1>Payment Receipt</h1>
        <div class="receipt-no">${data.receipt_code || ''}</div>
    </div>

    <div class="top-grid">
        <table class="detail-table">
            <tr><td>Payment Date</td><td>${fmtDate(data.payment_date)}</td></tr>
            <tr><td>Payment Mode</td><td>${methodLabel[data.payment_method] || data.payment_method || '—'}</td></tr>
            ${data.reference_number ? `<tr><td>Reference No.</td><td>${data.reference_number}</td></tr>` : ''}
            ${data.cheque_number ? `<tr><td>Cheque No.</td><td>${data.cheque_number}</td></tr>` : ''}
        </table>
        <div class="amount-banner">
            <div class="ab-label">Amount Received</div>
            <div class="ab-amount">LKR ${fmt(data.total_amount)}</div>
        </div>
    </div>

    <div class="received-block">
        <div class="lbl">Received From</div>
        <div class="name">${data.received_from || '—'}</div>
    </div>

    <div class="section-title">Payment For</div>
    <table class="items-table">
        <thead>
            <tr>
                <th>Description</th>
                <th class="tr">Amount</th>
            </tr>
        </thead>
        <tbody>
            ${itemRows || '<tr><td colspan="2" class="no-items">No allocation details available</td></tr>'}
        </tbody>
        <tfoot>
            <tr>
                <td>Total</td>
                <td class="tr">LKR ${fmt(itemsTotal || data.total_amount)}</td>
            </tr>
        </tfoot>
    </table>

    <div class="note">
        This is a computer-generated receipt confirming the payment recorded against your VCare Nursing account.
        Please retain it for your records.
    </div>

    <div class="footer">
        Generated on ${data.generated_at || fmtDate(new Date())} &nbsp;·&nbsp; <strong>VCare Nursing</strong> &nbsp;·&nbsp; No: 293/17B, Hospital Rd, Sri Jayewardenepura<br>
        Thank you for choosing VCare Nursing.
    </div>

</body>
</html>`;
};
