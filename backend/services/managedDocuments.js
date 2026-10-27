const db = require('../config/db');

// Last-resort copies, used only if the managed_documents table can't be read.
const FALLBACKS = {
  STAFF_AGREEMENT_EN: {
    file_url: 'https://vcarenursing-files.s3.eu-north-1.amazonaws.com/contracts/VCare_Contractor_Agreement_Final+(1).pdf',
    file_name: 'VCare_Independent_Contractor_Agreement_English.pdf',
  },
  STAFF_AGREEMENT_SI: {
    file_url: 'https://vcarenursing-files.s3.eu-north-1.amazonaws.com/contracts/VCare_Contractor_Agreement_Sinhala+(1).pdf',
    file_name: 'VCare_Independent_Contractor_Agreement_Sinhala.pdf',
  },
};

const AGREEMENT_KEY_BY_LANGUAGE = { en: 'STAFF_AGREEMENT_EN', si: 'STAFF_AGREEMENT_SI' };

// Always read fresh: an admin replacing a file must take effect on the very next send.
async function getCurrentDocument(documentKey) {
  try {
    const res = await db.query(
      'SELECT document_key, file_url, file_name, version FROM managed_documents WHERE document_key = $1',
      [documentKey]
    );
    if (res.rows[0]) return res.rows[0];
  } catch (err) {
    console.error(`[managedDocuments] failed to load ${documentKey}, using fallback:`, err.message);
  }
  return FALLBACKS[documentKey] ? { document_key: documentKey, ...FALLBACKS[documentKey] } : null;
}

module.exports = { getCurrentDocument, AGREEMENT_KEY_BY_LANGUAGE };
