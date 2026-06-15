module.exports = (data) => {
    const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const methodLabel = { BANK_TRANSFER: 'Bank Transfer', CASH: 'Cash', CHEQUE: 'Cheque' };

    const breakdown = data.breakdown || [];
    const deductions = data.deductions || [];
    const advances = data.advances || [];
    const priorPayouts = data.prior_payouts || [];
    const previousLeftover = parseFloat(data.previous_leftover || 0);
    const grossTotal = breakdown.reduce((s, b) => s + parseFloat(b.total_salary_earned || 0), 0);
    const totalDeductions = deductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
    const totalAdvances = advances.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
    const totalPriorPayouts = priorPayouts.reduce((s, p) => s + parseFloat(p.amount_paid || 0), 0);
    const monthNet = Math.max(0, grossTotal - totalDeductions - totalAdvances - totalPriorPayouts);
    const netPayable = Math.max(0, monthNet + previousLeftover);

    const bookingSections = breakdown.map(b => {
        const entries = Array.isArray(b.daily_entries) ? b.daily_entries : [];
        const daysWorked = entries.length;

        const dayRows = entries.map(e => `
            <tr class="day-row">
                <td>${fmtDate(e.date)}</td>
                <td class="tr">LKR ${fmt(e.amount)}</td>
            </tr>
        `).join('');

        return `
            <div class="booking-block">
                <div class="booking-header">
                    <div class="booking-meta">
                        <span class="booking-code">${b.booking_code || '—'}</span>
                        ${b.client_name ? `<span class="booking-client">Client: ${b.client_name}</span>` : ''}
                        <span class="booking-patient">Patient: ${b.patient_name || '—'}</span>
                    </div>
                    <div class="booking-period">
                        ${fmtDate(b.service_start_date)} – ${fmtDate(b.service_end_date)}
                        &nbsp;·&nbsp; ${daysWorked} day${daysWorked !== 1 ? 's' : ''}
                        &nbsp;·&nbsp; LKR ${fmt(b.daily_rate)}/day
                    </div>
                </div>
                <table class="day-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th class="tr">Daily Salary</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dayRows || '<tr><td colspan="2" class="no-entries">No daily entries recorded</td></tr>'}
                    </tbody>
                    <tfoot>
                        <tr class="booking-total-row">
                            <td>Booking Total (${daysWorked} day${daysWorked !== 1 ? 's' : ''})</td>
                            <td class="tr">LKR ${fmt(b.total_salary_earned)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; color: #333; font-size: 12px; }

        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .logo { width: 140px; height: auto; }
        .title-block { text-align: right; }
        .title-block h1 { font-size: 36px; font-weight: 300; color: #555; letter-spacing: 2px; }
        .title-block .ref { font-size: 11px; color: #888; margin-top: 4px; }

        .company-info { font-size: 11px; line-height: 1.7; color: #555; margin-bottom: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; }

        .info-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
        .staff-block .lbl { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
        .staff-block .staff-name { font-size: 18px; font-weight: bold; color: #111; }
        .staff-block .designation { font-size: 12px; color: #6b7280; margin-top: 2px; }

        .pay-info td { padding: 3px 0; font-size: 12px; }
        .pay-info td:first-child { color: #6b7280; padding-right: 24px; }
        .pay-info td:last-child { font-weight: 500; text-align: right; }

        .amount-banner { background: #137A6B; color: white; border-radius: 8px; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
        .amount-banner .ab-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.85; }
        .amount-banner .ab-amount { font-size: 28px; font-weight: bold; }

        .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 12px; }

        .booking-block { margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
        .booking-header { background: #f8fafc; padding: 10px 14px; border-bottom: 1px solid #e5e7eb; }
        .booking-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 3px; }
        .booking-code { font-weight: bold; font-size: 13px; color: #137A6B; }
        .booking-client { color: #6b7280; font-size: 11px; }
        .booking-patient { color: #374151; font-size: 12px; }
        .booking-period { font-size: 11px; color: #6b7280; }

        .day-table { width: 100%; border-collapse: collapse; }
        .day-table thead tr { background: #f1f5f9; }
        .day-table thead th { padding: 8px 14px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
        .day-table thead th.tr { text-align: right; }
        .day-row td { padding: 7px 14px; border-bottom: 1px solid #f1f5f9; }
        .day-row:last-child td { border-bottom: none; }
        .day-table tfoot .booking-total-row td { padding: 8px 14px; font-weight: bold; background: #f8fafc; border-top: 1px solid #e5e7eb; }
        .no-entries { text-align: center; color: #9ca3af; padding: 12px; font-style: italic; }
        .tr { text-align: right; }

        .adj-block { margin-bottom: 20px; border: 1px solid #fde8e8; border-radius: 6px; overflow: hidden; }
        .adj-block.advance { border-color: #e8edfde8; }
        .adj-header { background: #fef2f2; padding: 8px 14px; border-bottom: 1px solid #fde8e8; font-size: 11px; font-weight: 700; color: #dc2626; text-transform: uppercase; letter-spacing: 0.5px; }
        .adj-block.advance .adj-header { background: #eff6ff; border-color: #dbeafe; color: #2563eb; }
        .adj-table { width: 100%; border-collapse: collapse; }
        .adj-table td { padding: 7px 14px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
        .adj-table tr:last-child td { border-bottom: none; }
        .adj-table .adj-total td { font-weight: bold; background: #fef2f2; border-top: 1px solid #fde8e8; }
        .adj-block.advance .adj-table .adj-total td { background: #eff6ff; border-color: #dbeafe; }
        .adj-block.payout { border-color: #fde68a; }
        .adj-block.payout .adj-header { background: #fffbeb; border-color: #fde68a; color: #b45309; }
        .adj-block.payout .adj-table .adj-total td { background: #fffbeb; border-color: #fde68a; }
        .carryover-banner { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .carryover-banner .co-label { font-size: 11px; font-weight: 700; color: #6d28d9; text-transform: uppercase; letter-spacing: 0.5px; }
        .carryover-banner .co-sub { font-size: 10px; color: #8b5cf6; margin-top: 2px; }
        .carryover-banner .co-amount { font-size: 14px; font-weight: bold; color: #6d28d9; }

        .totals-section { display: flex; justify-content: flex-end; margin-top: 4px; margin-bottom: 32px; }
        .totals-table { border-collapse: collapse; }
        .totals-table td { padding: 6px 14px; font-size: 12px; }
        .totals-table td:first-child { color: #6b7280; }
        .totals-table td:last-child { text-align: right; min-width: 160px; }
        .totals-table .deduction-row td { color: #dc2626; }
        .totals-table .advance-row td { color: #2563eb; }
        .totals-table .payout-row td { color: #b45309; }
        .totals-table .carryover-row td { color: #6d28d9; }
        .totals-table .separator td { border-top: 1px solid #e5e7eb; padding-top: 8px; }
        .grand-total-row td { font-size: 13px; font-weight: bold; border-top: 1px solid #e5e7eb; padding-top: 8px; color: #111; }
        .net-payable-row td { font-size: 15px; font-weight: bold; border-top: 2px solid #137A6B; padding-top: 10px; color: #137A6B; }

        .footer { border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 10px; color: #9ca3af; text-align: center; }
        .footer strong { color: #6b7280; }
    </style>
</head>
<body>

    <div class="header">
        <img src="https://tuvh2lxa24zjyv7p.public.blob.vercel-storage.com/VCareLogo.png" class="logo" alt="VCare" />
        <div class="title-block">
            <h1>Salary Sheet</h1>
            ${data.reference_number ? `<div class="ref">Ref: ${data.reference_number}</div>` : ''}
        </div>
    </div>

    <div class="company-info">
        <strong>VCare Nursing</strong><br>
        No: 293/17B, Hospital Rd<br>
        Sri Jayewardenepura, Sri Lanka
    </div>

    <div class="info-row">
        <div class="staff-block">
            <div class="lbl">Staff Member</div>
            <div class="staff-name">${data.staff_name}</div>
            <div class="designation">${data.designation || ''}</div>
        </div>
        <table class="pay-info">
            <tr><td>Payment Date</td><td>${data.payment_date}</td></tr>
            <tr><td>Method</td><td>${methodLabel[data.payment_method] || data.payment_method || '—'}</td></tr>
            ${data.reference_number ? `<tr><td>Reference</td><td>${data.reference_number}</td></tr>` : ''}
            ${data.notes ? `<tr><td>Notes</td><td>${data.notes}</td></tr>` : ''}
        </table>
    </div>

    <div class="amount-banner">
        <div class="ab-label">Amount Paid — ${data.month_label}</div>
        <div class="ab-amount">LKR ${fmt(data.payment_amount)}</div>
    </div>

    ${previousLeftover > 0 ? `
    <div class="carryover-banner">
        <div>
            <div class="co-label">Carried Over from Previous Months</div>
            <div class="co-sub">Unpaid earnings before ${data.month_label}</div>
        </div>
        <div class="co-amount">LKR ${fmt(previousLeftover)}</div>
    </div>` : ''}

    <div class="section-title">${data.month_label} — Earnings Breakdown</div>

    ${breakdown.length > 0
        ? bookingSections
        : '<p style="color:#9ca3af;font-style:italic;margin-bottom:20px;">No booking earnings found.</p>'}

    ${deductions.length > 0 ? `
    <div class="section-title" style="margin-top:24px;">Deductions</div>
    <div class="adj-block">
        <div class="adj-header">Deductions</div>
        <table class="adj-table">
            <tbody>
                ${deductions.map(d => `
                <tr>
                    <td>${d.reason || 'Deduction'}</td>
                    <td>${fmtDate(d.created_at)}</td>
                    <td style="text-align:right;color:#dc2626;">- LKR ${fmt(d.amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
                <tr class="adj-total">
                    <td colspan="2">Total Deductions</td>
                    <td style="text-align:right;color:#dc2626;">- LKR ${fmt(totalDeductions)}</td>
                </tr>
            </tfoot>
        </table>
    </div>` : ''}

    ${advances.length > 0 ? `
    <div class="section-title" style="margin-top:${deductions.length > 0 ? '12px' : '24px'};">Advances</div>
    <div class="adj-block advance">
        <div class="adj-header">Advances Disbursed</div>
        <table class="adj-table">
            <tbody>
                ${advances.map(a => `
                <tr>
                    <td>${a.notes || 'Advance'}</td>
                    <td>${fmtDate(a.created_at)}</td>
                    <td style="text-align:right;color:#2563eb;">- LKR ${fmt(a.amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
                <tr class="adj-total">
                    <td colspan="2">Total Advances</td>
                    <td style="text-align:right;color:#2563eb;">- LKR ${fmt(totalAdvances)}</td>
                </tr>
            </tfoot>
        </table>
    </div>` : ''}

    ${priorPayouts.length > 0 ? `
    <div class="section-title" style="margin-top:12px;">Previous Payouts This Month</div>
    <div class="adj-block payout">
        <div class="adj-header">Already Paid — ${data.month_label}</div>
        <table class="adj-table">
            <tbody>
                ${priorPayouts.map(p => `
                <tr>
                    <td>${methodLabel[p.payment_method] || p.payment_method || 'Payment'}</td>
                    <td>${p.reference_number ? 'Ref: ' + p.reference_number : fmtDate(p.paid_at)}</td>
                    <td style="text-align:right;color:#b45309;">- LKR ${fmt(p.amount_paid)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
                <tr class="adj-total">
                    <td colspan="2">Total Already Paid</td>
                    <td style="text-align:right;color:#b45309;">- LKR ${fmt(totalPriorPayouts)}</td>
                </tr>
            </tfoot>
        </table>
    </div>` : ''}

    <div class="totals-section">
        <table class="totals-table">
            <tr>
                <td>Gross Earnings (${data.month_label})</td>
                <td>LKR ${fmt(grossTotal)}</td>
            </tr>
            ${totalDeductions > 0 ? `<tr class="deduction-row"><td>Less: Deductions</td><td>- LKR ${fmt(totalDeductions)}</td></tr>` : ''}
            ${totalAdvances > 0 ? `<tr class="advance-row"><td>Less: Advances</td><td>- LKR ${fmt(totalAdvances)}</td></tr>` : ''}
            ${totalPriorPayouts > 0 ? `<tr class="payout-row"><td>Less: Already Paid This Month</td><td>- LKR ${fmt(totalPriorPayouts)}</td></tr>` : ''}
            ${previousLeftover > 0 ? `<tr class="carryover-row"><td>+ Carried Over (Previous Months)</td><td>LKR ${fmt(previousLeftover)}</td></tr>` : ''}
            <tr class="net-payable-row">
                <td>${previousLeftover > 0 ? 'Total Outstanding' : 'Current Earnings (Net Payable)'}</td>
                <td>LKR ${fmt(netPayable)}</td>
            </tr>
            <tr class="grand-total-row">
                <td>Amount Paid This Transaction</td>
                <td>LKR ${fmt(data.payment_amount)}</td>
            </tr>
        </table>
    </div>

    <div class="footer">
        Generated on ${data.generated_at} &nbsp;·&nbsp; <strong>VCare Nursing</strong> &nbsp;·&nbsp; No: 293/17B, Hospital Rd, Sri Jayewardenepura
    </div>

</body>
</html>`;
};
