const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { AGREEMENT_KEY_BY_LANGUAGE } = require('../services/managedDocuments');

const actorInfo = async (req) => {
  const nameRes = await db.query(
    `SELECT COALESCE(sp.full_name, ist.full_name) AS full_name
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.user_id
     LEFT JOIN internal_staff ist ON ist.user_id = u.user_id
     WHERE u.user_id = $1`,
    [req.user.user_id]
  );
  const role = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
  return { name: nameRes.rows[0]?.full_name || 'Admin', role };
};

// Admin: every managed document with its version history (newest first).
exports.listDocuments = async (req, res) => {
  try {
    const docs = await db.query(
      `SELECT d.document_key, d.title, d.description, d.audience, d.language, d.sent_via,
              d.file_url, d.file_name, d.version, d.updated_at,
              COALESCE(sp.full_name, ist.full_name) AS updated_by_name
       FROM managed_documents d
       LEFT JOIN staff_profiles sp ON sp.user_id = d.updated_by
       LEFT JOIN internal_staff ist ON ist.user_id = d.updated_by
       ORDER BY d.sort_order, d.document_key`
    );
    const versions = await db.query(
      `SELECT document_key, version, file_url, file_name, note, uploaded_by_name, uploaded_at
       FROM managed_document_versions ORDER BY document_key, version DESC`
    );
    const byKey = {};
    for (const v of versions.rows) (byKey[v.document_key] ||= []).push(v);
    res.json({ success: true, data: docs.rows.map((d) => ({ ...d, versions: byKey[d.document_key] || [] })) });
  } catch (err) {
    console.error('listDocuments error:', err);
    res.status(500).json({ success: false, message: 'Failed to load documents' });
  }
};

// Public: current agreement links for the worker registration page.
exports.getPublicAgreements = async (req, res) => {
  try {
    const keys = Object.values(AGREEMENT_KEY_BY_LANGUAGE);
    const r = await db.query('SELECT document_key, file_url FROM managed_documents WHERE document_key = ANY($1)', [keys]);
    const out = {};
    for (const [lang, key] of Object.entries(AGREEMENT_KEY_BY_LANGUAGE)) {
      out[lang] = r.rows.find((row) => row.document_key === key)?.file_url || null;
    }
    res.json({ success: true, data: out });
  } catch (err) {
    console.error('getPublicAgreements error:', err);
    res.status(500).json({ success: false, message: 'Failed to load agreements' });
  }
};

// Shared by replace and restore: make the given file the new current version of a document.
async function publishVersion(client, documentKey, fileUrl, fileName, note, req, actor) {
  const next = await client.query(
    `UPDATE managed_documents
     SET file_url = $2, file_name = $3, version = version + 1, updated_by = $4, updated_at = NOW()
     WHERE document_key = $1 RETURNING version`,
    [documentKey, fileUrl, fileName, req.user.user_id]
  );
  const version = next.rows[0].version;
  await client.query(
    `INSERT INTO managed_document_versions (document_key, version, file_url, file_name, note, uploaded_by, uploaded_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [documentKey, version, fileUrl, fileName, note || null, req.user.user_id, actor.name]
  );
  return version;
}

const logChange = (req, actor, actionType, doc, details) =>
  logActivity({
    actorUserId: req.user.user_id,
    actorName: actor.name,
    actorRole: actor.role,
    actionType,
    entityType: 'managed_document',
    entityId: null,
    details: { document_key: doc.document_key, title: doc.title, ...details },
  }).catch((e) => console.error('Activity log failed (documents):', e.message));

// Admin: replace a document with a newly uploaded PDF (multer-s3 has already stored it).
exports.replaceDocument = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Attach a PDF file.' });
  const client = await db.pool.connect();
  try {
    const { key } = req.params;
    const note = (req.body?.note || '').trim().slice(0, 300);
    const actor = await actorInfo(req);
    await client.query('BEGIN');
    const cur = await client.query('SELECT document_key, title, file_name, version FROM managed_documents WHERE document_key = $1 FOR UPDATE', [key]);
    if (!cur.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    // Keep the delivered filename stable for recipients (e.g. WhatsApp shows it).
    const version = await publishVersion(client, key, req.file.location, cur.rows[0].file_name, note, req, actor);
    await client.query('COMMIT');
    await logChange(req, actor, 'DOCUMENT_REPLACED', cur.rows[0], { from_version: cur.rows[0].version, to_version: version, note });
    res.json({ success: true, message: `${cur.rows[0].title} updated to version ${version}.`, version });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('replaceDocument error:', err);
    res.status(500).json({ success: false, message: 'Failed to replace the document' });
  } finally {
    client.release();
  }
};

// Admin: make an earlier version current again (recorded as a new version, so history stays linear).
exports.restoreVersion = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { key, version } = req.params;
    const actor = await actorInfo(req);
    await client.query('BEGIN');
    const cur = await client.query('SELECT document_key, title, version FROM managed_documents WHERE document_key = $1 FOR UPDATE', [key]);
    const old = await client.query('SELECT file_url, file_name FROM managed_document_versions WHERE document_key = $1 AND version = $2', [key, parseInt(version, 10)]);
    if (!cur.rows[0] || !old.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Document version not found' });
    }
    const next = await publishVersion(client, key, old.rows[0].file_url, old.rows[0].file_name, `Restored version ${version}`, req, actor);
    await client.query('COMMIT');
    await logChange(req, actor, 'DOCUMENT_RESTORED', cur.rows[0], { restored_version: Number(version), to_version: next });
    res.json({ success: true, message: `${cur.rows[0].title}: version ${version} is current again (saved as v${next}).`, version: next });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('restoreVersion error:', err);
    res.status(500).json({ success: false, message: 'Failed to restore the version' });
  } finally {
    client.release();
  }
};
