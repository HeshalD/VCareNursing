module.exports = (data) => {
    // Generate current date and time
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const formattedTime = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    return `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica', sans-serif; padding: 30px; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
          .logo { width: 150px; height: auto; }
          .details { text-align: right; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #f2f2f2; text-align: left; padding: 10px; border-bottom: 2px solid #ddd; }
          td { padding: 10px; border-bottom: 1px solid #ddd; }
          .totals { margin-left: auto; width: 30%; margin-top: 20px; }
          .footer { margin-top: 50px; font-size: 10px; color: #555; }
          .patient-info { margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <img src="https://tuvh2lxa24zjyv7p.public.blob.vercel-storage.com/VCareLogo.png" class="logo" alt="VCare Logo" />
          </div>
          <div class="details">
            <h1>Estimate</h1>
            <p># ${data.estimate_number}</p>
            <p>Date: ${formattedDate}</p>
            <p>Time: ${formattedTime}</p>
          </div>
        </div>
        
        <div class="patient-info">
          <strong>Patient Information:</strong><br>
          <strong>Patient Name:</strong> ${data.patient_name}<br>
          <strong>Service Type:</strong> ${data.service_type}<br>
          <strong>Payer:</strong> ${data.payer_name}<br>
          <strong>Contact:</strong> ${data.payer_mobile}
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th><th>Item & Description</th><th>Qty</th><th>Rate</th><th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>Registration (Valid for 1 year)</td>
              <td>1.00</td>
              <td>LKR ${parseFloat(data.registration_fee).toFixed(2)}</td>
              <td>LKR ${parseFloat(data.registration_fee).toFixed(2)}</td>
            </tr>
            <tr>
              <td>2</td>
              <td>${data.service_type} Daily Rates</td>
              <td>${data.qty_days}</td>
              <td>LKR ${parseFloat(data.daily_rate).toFixed(2)}</td>
              <td>LKR ${(data.daily_rate * data.qty_days).toFixed(2)}</td>
            </tr>
            <tr>
              <td>3</td>
              <td>Transport</td>
              <td>1.00</td>
              <td>LKR ${parseFloat(data.transport_fee).toFixed(2)}</td>
              <td>LKR ${parseFloat(data.transport_fee).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="totals">
          <table>
            <tr>
              <td><strong>Sub Total:</strong></td>
              <td>LKR ${parseFloat(data.sub_total).toFixed(2)}</td>
            </tr>
            <tr>
              <td><h3>Total Amount:</h3></td>
              <td><h3>LKR ${parseFloat(data.total_amount).toFixed(2)}</h3></td>
            </tr>
          </table>
        </div>
        
        <div class="footer">
          <p><strong>Terms & Conditions:</strong></p>
          <ul>
            <li>This estimate is valid for 30 days from date of issue</li>
            <li>Payment is due upon commencement of services</li>
            <li>Additional charges may apply for extended services</li>
            <li>Cancellation policy: 24-hour notice required</li>
          </ul>
          <hr>
          <p><strong>VCare Nursing Services</strong><br>
          Professional healthcare at your doorstep<br>
          Contact: +94 11 2XXX XXX | Email: info@vcare.lk</p>
        </div>
      </body>
    </html>`;
};