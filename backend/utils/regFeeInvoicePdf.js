const html_to_pdf = require('html-pdf-node');
const { uploadBufferToS3 } = require('../config/s3Config');
const regFeeInvoiceTemplate = require('../templates/regFeeInvoiceTemplate');

// Generate a registration fee invoice PDF and upload it to S3.
// Returns the public S3 URL of the uploaded PDF.
async function generateAndUploadRegFeeInvoice(data) {
    const html = regFeeInvoiceTemplate(data);
    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });

    const safeCode = (data.invoice_code || `RegFeeInv_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const key = `reg_fee_invoices/${safeCode}_${Date.now()}.pdf`;

    return uploadBufferToS3(pdfBuffer, key, 'application/pdf');
}

module.exports = { generateAndUploadRegFeeInvoice };
