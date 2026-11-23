// Renders the Zoho Books sample statement through the real template, no database needed:
//
//   node scripts/renderStatementSample.js [out.pdf]
//
// Used to eyeball the PDF against the original Zoho one (tests/fixtures/zohoStatement.js).
const fs = require('fs');
const path = require('path');
const { buildStatement, toPdfData } = require('../services/statementLedger');
const { generateStatementPDF } = require('../utils/statement');
const { classify, zohoRows } = require('../tests/fixtures/zohoStatement');

(async () => {
  const out = process.argv[2] || path.join(__dirname, 'statement-sample.pdf');
  const st = { ...buildStatement(classify(zohoRows()), { start: '2026-07-01', end: '2026-08-31' }), start: '2026-07-01', end: '2026-08-31' };
  const pdf = await generateStatementPDF(toPdfData('Mr. Ramasubramanian Gomathinayegam', st));
  fs.writeFileSync(out, pdf);
  console.log('wrote', out, pdf.length, 'bytes');
})().catch((e) => { console.error(e); process.exit(1); });
