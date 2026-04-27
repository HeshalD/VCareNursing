module.exports = (data) => {
    // Generate current date
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: '2-digit' 
    });

    return `
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; color: #333; font-size: 13px; }

          /* Header */
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
          .logo { width: 160px; height: auto; }
          .header-right { text-align: right; }
          .header-right h1 { font-size: 42px; font-weight: 300; color: #555; margin-bottom: 4px; }
          .header-right .est-number { font-size: 14px; color: #555; }

          /* Company address */
          .company-info { margin-bottom: 30px; font-size: 12px; line-height: 1.6; }
          .company-info strong { font-size: 13px; }

          /* Bill To + Estimate Date row */
          .bill-date-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
          .bill-to-label { font-size: 12px; color: #888; margin-bottom: 2px; }
          .bill-to-name { font-size: 14px; font-weight: bold; }
          .estimate-date { font-size: 12px; color: #555; }
          .estimate-date span { margin-left: 30px; }

          /* Table */
          table { width: 100%; border-collapse: collapse; margin: 0 0 20px 0; }
          thead tr { background: #4a90a4; color: white; }
          thead th { padding: 10px 12px; text-align: left; font-weight: normal; font-size: 12px; }
          thead th:last-child, thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
          tbody tr { border-bottom: 1px solid #e8e8e8; }
          tbody tr:nth-child(even) { background: #fafafa; }
          tbody td { padding: 12px 12px; vertical-align: top; font-size: 12px; }
          tbody td:nth-child(1) { color: #888; width: 30px; }
          tbody td:nth-child(3), tbody td:nth-child(4), tbody td:nth-child(5) { text-align: right; }
          .item-desc { font-size: 11px; color: #888; margin-top: 2px; }

          /* Totals */
          .totals-wrapper { display: flex; justify-content: flex-end; margin-bottom: 30px; }
          .totals-table { width: 260px; }
          .totals-table td { padding: 6px 12px; font-size: 13px; }
          .totals-table td:last-child { text-align: right; }
          .totals-table tr.total-row td { font-weight: bold; font-size: 14px; border-top: 2px solid #333; padding-top: 10px; }

          /* Notes & Terms */
          .notes-section { margin-bottom: 20px; }
          .notes-section h4 { font-size: 12px; color: #888; font-weight: normal; margin-bottom: 6px; border-bottom: 1px solid #e8e8e8; padding-bottom: 4px; }
          .notes-section p { font-size: 12px; color: #555; line-height: 1.6; }

          /* Footer */
          .footer { margin-top: 60px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 10px; color: #aaa; text-align: center; }
        </style>
      </head>
      <body>

        <!-- Header: Logo left, Estimate title right -->
        <div class="header">
          <div>
            <img src="https://tuvh2lxa24zjyv7p.public.blob.vercel-storage.com/VCareLogo.png" class="logo" alt="VCare Logo" />
          </div>
          <div class="header-right">
            <h1>Estimate</h1>
            <div class="est-number"># ${data.estimate_number}</div>
          </div>
        </div>

        <!-- Company Address -->
        <div class="company-info">
          <strong>Vcare Nursing</strong><br>
          No: 293/17B<br>
          Hospital Rd<br>
          Sri Jayewardenepura Sri Lanka<br>
          SriLanka
        </div>

        <!-- Bill To + Estimate Date inline -->
        <div class="bill-date-row">
          <div>
            <div class="bill-to-label">Bill To</div>
            <div class="bill-to-name">${data.payer_name}</div>
          </div>
          <div class="estimate-date">
            Estimate Date : <span>${formattedDate}</span>
          </div>
        </div>

        <!-- Items Table -->
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item &amp; Description</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>
                Registration
                <div class="item-desc">Valid for 1 year from date of commencement</div>
              </td>
              <td>1.00</td>
              <td>${parseFloat(data.registration_fee).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              <td>${parseFloat(data.registration_fee).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>2</td>
              <td>
                ${data.service_type}
                <div class="item-desc">Daily rates</div>
              </td>
              <td>${data.qty_days}.00<br><span style="font-size:10px;color:#888;">Days</span></td>
              <td>${parseFloat(data.daily_rate).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              <td>${(data.daily_rate * data.qty_days).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
              <td>3</td>
              <td>Transport</td>
              <td>1.00</td>
              <td>${parseFloat(data.transport_fee).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
              <td>${parseFloat(data.transport_fee).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
          </tbody>
        </table>

        <!-- Totals -->
        <div class="totals-wrapper">
          <table class="totals-table">
            <tr>
              <td>Sub Total</td>
              <td>${parseFloat(data.sub_total).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr class="total-row">
              <td>Total</td>
              <td>LKR${parseFloat(data.total_amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            </tr>
          </table>
        </div>

        <!-- Notes -->
        <div class="notes-section">
          <h4>Notes</h4>
          <p>Looking forward for your business.</p>
        </div>

        <!-- Terms & Conditions -->
        <div class="notes-section">
          <h4>Terms &amp; Conditions</h4>
          <p>Please note: The initial estimated amount is non-refundable. Our work includes a Service Guarantee.</p>
        </div>

        <!-- Page footer -->
        <div class="footer">1</div>

      </body>
    </html>`;
};