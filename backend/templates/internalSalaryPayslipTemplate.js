module.exports = (data) => {
    const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const allowances = data.allowances || [];
    const deductions = data.deductions || [];

    const earningsRows = [
        { label: 'Basic Salary', amount: data.basic_salary },
        ...allowances.map((a) => ({ label: a.label, amount: a.amount })),
        ...(data.commission_amount > 0 ? [{ label: 'Sales Commission', amount: data.commission_amount }] : []),
    ];

    const deductionRows = [
        ...(data.epf_employee_applicable ? [{ label: 'EPF Employee Contribution (8%)', amount: data.epf_employee_amount }] : []),
        ...deductions.map((d) => ({ label: d.label, amount: d.amount })),
    ];

    const rowCount = Math.max(earningsRows.length, deductionRows.length);
    const tableRows = Array.from({ length: rowCount }).map((_, i) => {
        const e = earningsRows[i];
        const d = deductionRows[i];
        return `
            <tr>
                <td>${e ? e.label : '-'}</td>
                <td class="tr">${e ? fmt(e.amount) : '-'}</td>
                <td>${d ? d.label : '-'}</td>
                <td class="tr">${d ? fmt(d.amount) : '-'}</td>
            </tr>`;
    }).join('');

    const employerRows = [
        ...(data.epf_employee_applicable ? [{ label: 'EPF Employer Contribution (12%)', basis: `12% of Basic Salary (LKR ${fmt(data.basic_salary)})`, amount: data.epf_employer_amount }] : []),
        ...(data.etf_employer_applicable ? [{ label: 'ETF Employer Contribution (3%)', basis: `3% of Basic Salary (LKR ${fmt(data.basic_salary)})`, amount: data.etf_employer_amount }] : []),
    ];
    const totalEmployerContribution = employerRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const totalEpfRemitted = (parseFloat(data.epf_employee_amount || 0) + parseFloat(data.epf_employer_amount || 0));

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; color: #1e293b; font-size: 12px; background: #f8fafc; }

        .sheet { background: #fff; border-radius: 10px; padding: 32px; }

        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d4ed8; padding-bottom: 14px; margin-bottom: 20px; }
        .header h1 { font-size: 20px; color: #0f172a; }
        .header .sub { font-size: 11px; color: #64748b; margin-top: 2px; }
        .header .payslip-label { font-size: 22px; font-weight: bold; color: #1d4ed8; letter-spacing: 1px; }

        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; background: #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 22px; font-size: 12px; }
        .info-grid .lbl { color: #64748b; font-weight: 600; }
        .info-grid .val { color: #0f172a; }

        .section-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 10px; }

        table.pay-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        table.pay-table th { background: #0f172a; color: #fff; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        table.pay-table th.tr, table.pay-table td.tr { text-align: right; }
        table.pay-table td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        table.pay-table tr.totals td { font-weight: bold; border-top: 2px solid #cbd5e1; border-bottom: none; padding-top: 9px; }
        table.pay-table tr.totals td:nth-child(2) { color: #1d4ed8; }
        table.pay-table tr.totals td:nth-child(4) { color: #dc2626; }

        .net-banner { background: #1d4ed8; color: #fff; border-radius: 8px; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; margin: 20px 0 26px; }
        .net-banner .nb-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .net-banner .nb-amount { font-size: 22px; font-weight: bold; }

        table.employer-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        table.employer-table th { background: #334155; color: #fff; text-align: left; padding: 7px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        table.employer-table th.tr, table.employer-table td.tr { text-align: right; }
        table.employer-table td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; }
        table.employer-table tr.totals td { font-weight: bold; border-top: 1px solid #cbd5e1; }

        .note { background: #fffbeb; border-left: 3px solid #d97706; padding: 10px 14px; font-size: 10.5px; color: #78350f; margin-bottom: 26px; }

        .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
        .signatures .sig { width: 45%; text-align: center; }
        .signatures .sig .line { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; color: #64748b; }

        .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
    </style>
</head>
<body>
<div class="sheet">

    <div class="header">
        <div>
            <h1>VCare Facility Services (Pvt) Ltd</h1>
            <div class="sub">OFFICIAL SALARY STATEMENT</div>
        </div>
        <div class="payslip-label">PAYSLIP</div>
    </div>

    <div class="info-grid">
        <div><span class="lbl">Employee Name:</span> <span class="val">${data.staff_name}</span></div>
        <div><span class="lbl">Pay Period:</span> <span class="val">${data.month_label}</span></div>
        <div><span class="lbl">Designation:</span> <span class="val">${data.designation || '—'}</span></div>
        <div><span class="lbl">Pay Date:</span> <span class="val">${fmtDate(data.pay_date)}</span></div>
    </div>

    <div class="section-title">Earnings & Deductions Breakdown</div>
    <table class="pay-table">
        <thead>
            <tr>
                <th>Earnings Description</th>
                <th class="tr">Amount (LKR)</th>
                <th>Deductions Description</th>
                <th class="tr">Amount (LKR)</th>
            </tr>
        </thead>
        <tbody>
            ${tableRows}
            <tr class="totals">
                <td>Total Gross Earnings</td>
                <td class="tr">${fmt(data.gross_earnings)}</td>
                <td>Total Deductions</td>
                <td class="tr">${fmt(data.total_deductions)}</td>
            </tr>
        </tbody>
    </table>

    <div class="net-banner">
        <div class="nb-label">Net Payable Salary</div>
        <div class="nb-amount">LKR ${fmt(data.net_payable)}</div>
    </div>

    ${employerRows.length > 0 ? `
    <div class="section-title">Employer Statutory Contributions (Not Deducted From Employee)</div>
    <table class="employer-table">
        <thead>
            <tr>
                <th>Contribution Type</th>
                <th>Calculation Basis</th>
                <th class="tr">Amount (LKR)</th>
            </tr>
        </thead>
        <tbody>
            ${employerRows.map((r) => `
            <tr>
                <td>${r.label}</td>
                <td>${r.basis}</td>
                <td class="tr">${fmt(r.amount)}</td>
            </tr>`).join('')}
            <tr class="totals">
                <td colspan="2">Total Employer Statutory Obligation</td>
                <td class="tr">${fmt(totalEmployerContribution)}</td>
            </tr>
        </tbody>
    </table>

    <div class="note">
        <strong>Statutory Note:</strong> Total EPF contribution remitted for this period is LKR ${fmt(totalEpfRemitted)}
        (LKR ${fmt(data.epf_employee_amount)} Employee + LKR ${fmt(data.epf_employer_amount)} Employer).
    </div>` : ''}

    <div class="signatures">
        <div class="sig"><div class="line">Employee Signature</div></div>
        <div class="sig"><div class="line">Authorized Signature</div></div>
    </div>

    <div class="footer">
        Generated on ${fmtDate(new Date())} &nbsp;·&nbsp; <strong>VCare Facility Services (Pvt) Ltd</strong>
    </div>

</div>
</body>
</html>`;
};
