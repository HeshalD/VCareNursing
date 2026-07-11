// Daily Service Invoice PDF template.
//
// Expected `data` shape:
//   {
//     invoice_code,       // e.g. "DINV-1A2B3C4D"
//     invoice_date,       // generated-on date string
//     service_date,       // date the service was delivered
//     client_name,
//     booking_code,
//     service_type,       // e.g. "SHIFT_BASED"
//     shift_label,        // e.g. "Day Shift" (optional)
//     status,             // INVOICED | SKIPPED | PENDING
//     amount,             // numeric
//     decided_by_name,    // admin who approved (optional)
//     decided_at,         // date string (optional)
//     notes,              // optional
//   }
module.exports = (data) => {
    const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const STATUS_STYLES = {
        INVOICED: 'background:#ecfdf5;color:#047857;border:1px solid #6ee7b7;',
        SKIPPED:  'background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;',
        PENDING:  'background:#fffbeb;color:#b45309;border:1px solid #fde68a;',
    };
    const statusStyle = STATUS_STYLES[data.status] || 'background:#f3f4f6;color:#4b5563;border:1px solid #e5e7eb;';

    const serviceLabel = (data.service_type || 'Care Service').replace(/_/g, ' ');

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
        .title-bar .inv-no { font-size: 11px; color: #9ca3af; margin-top: 6px; letter-spacing: 1px; }

        .top-grid { display: flex; justify-content: space-between; align-items: stretch; gap: 24px; margin-bottom: 28px; }

        .bill-to { flex: 1; }
        .bill-to .lbl { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
        .bill-to .name { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }

        .inv-detail { font-size: 11px; }
        .inv-detail table td { padding: 4px 0; vertical-align: top; }
        .inv-detail table td:first-child { color: #9ca3af; padding-right: 16px; white-space: nowrap; }
        .inv-detail table td:last-child { font-weight: 600; color: #111827; }

        .amount-banner { background: #137A6B; color: #fff; border-radius: 10px; padding: 20px 26px; min-width: 200px; display: flex; flex-direction: column; justify-content: center; }
        .amount-banner .ab-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.85; }
        .amount-banner .ab-amount { font-size: 28px; font-weight: 700; margin-top: 6px; }
        .amount-banner .ab-due { font-size: 10px; opacity: 0.75; margin-top: 4px; }

        .status-chip { display: inline-block; border-radius: 6px; padding: 3px 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }

        .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 10px; }

        .items-table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
        .items-table thead tr { background: #f1f5f9; }
        .items-table thead th { padding: 10px 16px; text-align: left; font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; }
        .items-table thead th.tr { text-align: right; }
        .items-table tbody td { padding: 14px 16px; border-top: 1px solid #f1f5f9; }
        .items-table .item-label { font-weight: 600; color: #111827; font-size: 12.5px; }
        .items-table .item-desc { font-size: 11px; color: #6b7280; margin-top: 2px; }
        .items-table .tr { text-align: right; }
        .items-table tfoot td { padding: 14px 16px; background: #f8fafc; border-top: 2px solid #137A6B; font-weight: 700; font-size: 13px; color: #137A6B; }

        .meta-block { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
        .meta-block .meta-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 12px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px; }
        .meta-row .mt-label { font-size: 10px; color: #9ca3af; margin-bottom: 2px; }
        .meta-row .mt-value { font-size: 12px; font-weight: 600; color: #111827; }

        .notes-block { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; }
        .notes-block .nb-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #b45309; margin-bottom: 6px; }
        .notes-block p { font-size: 11.5px; color: #78350f; line-height: 1.6; }

        .footer { margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 14px; font-size: 10px; color: #9ca3af; text-align: center; line-height: 1.6; }
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
        <h1>Daily Service Invoice</h1>
        <div class="inv-no">${esc(data.invoice_code)}</div>
    </div>

    <div class="top-grid">
        <div>
            <div class="bill-to">
                <div class="lbl">Bill To</div>
                <div class="name">${esc(data.client_name) || '—'}</div>
            </div>
            <div class="inv-detail" style="margin-top: 16px;">
                <table>
                    <tr><td>Service Date</td><td>${esc(data.service_date) || '—'}</td></tr>
                    <tr><td>Booking</td><td>${esc(data.booking_code) || '—'}</td></tr>
                    <tr><td>Status</td><td><span class="status-chip" style="${statusStyle}">${esc(data.status) || '—'}</span></td></tr>
                </table>
            </div>
        </div>
        <div class="amount-banner">
            <div class="ab-label">Invoice Amount</div>
            <div class="ab-amount">LKR ${fmt(data.amount)}</div>
            <div class="ab-due">For services on ${esc(data.service_date) || '—'}</div>
        </div>
    </div>

    <div class="section-title">Invoice Details</div>
    <table class="items-table">
        <thead>
            <tr>
                <th>Description</th>
                <th class="tr">Amount</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>
                    <div class="item-label">${esc(serviceLabel)}${data.shift_label ? ` — ${esc(data.shift_label)}` : ''}</div>
                    <div class="item-desc">Daily care service charge for ${esc(data.service_date) || '—'} (Booking ${esc(data.booking_code) || '—'})</div>
                </td>
                <td class="tr">LKR ${fmt(data.amount)}</td>
            </tr>
        </tbody>
        <tfoot>
            <tr>
                <td>Total</td>
                <td class="tr">LKR ${fmt(data.amount)}</td>
            </tr>
        </tfoot>
    </table>

    <div class="meta-block">
        <div class="meta-title">Approval Details</div>
        <div class="meta-grid">
            <div class="meta-row">
                <div class="mt-label">Decided By</div>
                <div class="mt-value">${esc(data.decided_by_name) || '—'}</div>
            </div>
            <div class="meta-row">
                <div class="mt-label">Decided On</div>
                <div class="mt-value">${esc(data.decided_at) || '—'}</div>
            </div>
        </div>
    </div>

    ${data.notes ? `
    <div class="notes-block">
        <div class="nb-title">Notes</div>
        <p>${esc(data.notes)}</p>
    </div>` : ''}

    <div class="footer">
        Generated on ${esc(data.invoice_date) || ''} &nbsp;·&nbsp; <strong>VCare Nursing</strong> &nbsp;·&nbsp; No: 293/17B, Hospital Rd, Sri Jayewardenepura<br>
        Thank you for choosing VCare Nursing.
    </div>

</body>
</html>`;
};
