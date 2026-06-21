const html_to_pdf = require('html-pdf-node');
const { uploadBufferToS3 } = require('../config/s3Config');
const salarySheetTemplate = require('../templates/salarySheetTemplate');

async function generateAndUploadSalarySheet(data) {
    const html = salarySheetTemplate(data);
    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });

    const safeName = (data.staff_name || 'staff').replace(/\s+/g, '_');
    const key = `salary_sheets/Salary_${safeName}_${Date.now()}.pdf`;

    return uploadBufferToS3(pdfBuffer, key, 'application/pdf');
}

module.exports = { generateAndUploadSalarySheet };
