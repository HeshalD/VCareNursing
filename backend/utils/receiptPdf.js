const html_to_pdf = require('html-pdf-node');
const cloudinary = require('cloudinary').v2;
const paymentReceiptTemplate = require('../templates/paymentReceiptTemplate');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Render the receipt HTML to a PDF and upload it to Cloudinary as a raw asset.
// Returns the secure_url of the uploaded PDF.
async function generateAndUploadReceipt(data) {
    const html = paymentReceiptTemplate(data);
    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });

    const safeCode = (data.receipt_code || `Receipt_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    // The `.pdf` extension must be part of the public_id so the delivered raw URL
    // ends in `.pdf` and is served/downloaded with the correct content type.
    const publicId = `payment_receipts/${safeCode}_${Date.now()}.pdf`;

    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload(
            `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
            { resource_type: 'raw', public_id: publicId },
            (err, result) => {
                if (err) return reject(err);
                resolve(result.secure_url);
            }
        );
    });
}

module.exports = { generateAndUploadReceipt };
