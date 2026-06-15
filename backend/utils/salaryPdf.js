const html_to_pdf = require('html-pdf-node');
const cloudinary = require('cloudinary').v2;
const salarySheetTemplate = require('../templates/salarySheetTemplate');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function generateAndUploadSalarySheet(data) {
    const html = salarySheetTemplate(data);
    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });

    const safeName = (data.staff_name || 'staff').replace(/\s+/g, '_');
    const publicId = `salary_sheets/Salary_${safeName}_${Date.now()}.pdf`;

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

module.exports = { generateAndUploadSalarySheet };
