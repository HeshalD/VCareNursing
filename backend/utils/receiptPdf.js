const html_to_pdf = require('html-pdf-node');
const { uploadBufferToS3 } = require('../config/s3Config');
const paymentReceiptTemplate = require('../templates/paymentReceiptTemplate');

// Render the receipt HTML to a PDF and upload it to S3.
// Returns the public URL of the uploaded PDF.
async function generateAndUploadReceipt(data) {
    const html = paymentReceiptTemplate(data);
    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });

    const safeCode = (data.receipt_code || `Receipt_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    // The `.pdf` extension is part of the key so the URL ends in `.pdf` and is
    // served/downloaded with the correct content type (needed for WhatsApp).
    const key = `payment_receipts/${safeCode}_${Date.now()}.pdf`;

    return uploadBufferToS3(pdfBuffer, key, 'application/pdf');
}

module.exports = { generateAndUploadReceipt };
