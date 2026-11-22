// cron/regFeeInvoiceDocs.js
// Every 10 minutes: create the invoice document for any registration fee that is on a
// client's ledger but has no PDF (see services/regFeeInvoiceDocs.js). Self-heals every path
// that books the fee without making the document, including a PDF render that failed once.
const cron = require('node-cron');
const { ensureRegFeeInvoiceDocs } = require('../services/regFeeInvoiceDocs');

const startRegFeeInvoiceDocs = () => {
  cron.schedule('*/10 * * * *', () => {
    ensureRegFeeInvoiceDocs().then((r) => {
      if (r.created || r.failed.length) console.log(`[RegFeeInvoiceDocs] created ${r.created}, failed ${r.failed.length}`);
    });
  });
};

module.exports = startRegFeeInvoiceDocs;
