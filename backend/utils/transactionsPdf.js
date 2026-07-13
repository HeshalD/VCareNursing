const html_to_pdf = require('html-pdf-node');
const transactionsExportTemplate = require('../templates/transactionsExportTemplate');

// Renders the filtered transactions ledger to a landscape A4 PDF buffer.
// Not uploaded to S3 — this is an ad-hoc report download, not a stored document.
async function generateTransactionsPdf(data) {
  const html = transactionsExportTemplate(data);
  return html_to_pdf.generatePdf({ content: html }, { format: 'A4', landscape: true, printBackground: true });
}

module.exports = { generateTransactionsPdf };
