const html_to_pdf = require('html-pdf-node');
const { uploadBufferToS3 } = require('../config/s3Config');
const internalSalaryPayslipTemplate = require('../templates/internalSalaryPayslipTemplate');

async function generateAndUploadInternalSalaryPdf(data) {
    const html = internalSalaryPayslipTemplate(data);
    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });

    const safeName = (data.staff_name || 'staff').replace(/\s+/g, '_');
    const key = `internal_salary_sheets/Salary_${safeName}_${Date.now()}.pdf`;

    return uploadBufferToS3(pdfBuffer, key, 'application/pdf');
}

module.exports = { generateAndUploadInternalSalaryPdf };
