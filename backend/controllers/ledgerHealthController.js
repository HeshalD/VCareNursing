// Ledger health check API. The check itself lives in services/ledgerHealth.js and is read-only
// against the books; these endpoints only read its results, start a run, and record acknowledgements.

const db = require('../config/db');
const { runLedgerHealth, ALL_CHECKS } = require('../services/ledgerHealth');
const { logActivity } = require('../utils/activityLogger');

const extractActorRole = (role) => {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
};
const getActorName = async (userId) => {
  const r = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
  return r.rows[0]?.full_name || 'Admin';
};
const safeLog = async (params) => { try { await logActivity(params); } catch (e) { console.error('Activity log error:', e.message); } };

// GET /api/ledger-health/summary
exports.getSummary = async (req, res) => {
  try {
    const [lastRun, counts, byCheck, running] = await Promise.all([
      db.query(`SELECT run_id, started_at, finished_at, status, trigger_source, error_count, warning_count, new_error_count, duration_ms, notes
                FROM ledger_health_runs WHERE status <> 'RUNNING' ORDER BY started_at DESC LIMIT 1`),
      db.query(`SELECT
                  COUNT(*) FILTER (WHERE resolved_at IS NULL AND acknowledged_at IS NULL AND severity = 'ERROR')::int AS errors,
                  COUNT(*) FILTER (WHERE resolved_at IS NULL AND acknowledged_at IS NULL AND severity = 'WARNING')::int AS warnings,
                  COUNT(*) FILTER (WHERE resolved_at IS NULL AND acknowledged_at IS NOT NULL)::int AS acknowledged,
                  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at > NOW() - INTERVAL '7 days')::int AS resolved_7d
                FROM ledger_health_findings`),
      db.query(`SELECT check_key, severity,
                  COUNT(*) FILTER (WHERE acknowledged_at IS NULL)::int AS open,
                  COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL)::int AS acknowledged
                FROM ledger_health_findings WHERE resolved_at IS NULL GROUP BY check_key, severity`),
      db.query(`SELECT 1 FROM ledger_health_runs WHERE status = 'RUNNING' AND started_at > NOW() - INTERVAL '30 minutes' LIMIT 1`),
    ]);
    const open = {};
    byCheck.rows.forEach((r) => { open[r.check_key] = open[r.check_key] || { open: 0, acknowledged: 0 }; open[r.check_key].open += r.open; open[r.check_key].acknowledged += r.acknowledged; });
    res.json({
      status: 'success',
      data: {
        last_run: lastRun.rows[0] || null,
        running: running.rows.length > 0,
        counts: counts.rows[0],
        checks: ALL_CHECKS.map((c) => ({ key: c.key, group: c.group, title: c.title, help: c.help, severity: c.severity, ...(open[c.key] || { open: 0, acknowledged: 0 }) })),
      },
    });
  } catch (err) {
    console.error('Ledger health summary error:', err);
    res.status(500).json({ message: 'Failed to load the ledger health summary' });
  }
};

// GET /api/ledger-health/findings?state=open|acknowledged|resolved&severity=&check_key=&search=&page=&limit=
exports.getFindings = async (req, res) => {
  const { state = 'open', severity, check_key, search } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  try {
    const where = [];
    const params = [];
    if (state === 'open') where.push('f.resolved_at IS NULL AND f.acknowledged_at IS NULL');
    else if (state === 'acknowledged') where.push('f.resolved_at IS NULL AND f.acknowledged_at IS NOT NULL');
    else if (state === 'resolved') where.push('f.resolved_at IS NOT NULL');
    if (severity) { params.push(severity); where.push(`f.severity = $${params.length}`); }
    if (check_key) { params.push(check_key); where.push(`f.check_key = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`(f.entity_label ILIKE $${params.length} OR f.detail ILIKE $${params.length} OR cp.full_name ILIKE $${params.length} OR cp.client_code ILIKE $${params.length})`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const base = `FROM ledger_health_findings f
                  LEFT JOIN client_profiles cp ON cp.client_profile_id = f.client_id
                  LEFT JOIN bookings b ON b.booking_id = f.booking_id ${whereSql}`;
    const [rows, total] = await Promise.all([
      db.query(
        `SELECT f.finding_id, f.check_key, f.severity, f.entity_type, f.entity_id, f.entity_label, f.client_id, f.booking_id, f.amount,
                f.title, f.detail, f.link_path, f.first_seen_at, f.last_seen_at, f.resolved_at, f.acknowledged_at, f.acknowledged_by_name, f.acknowledge_note,
                cp.full_name AS client_name, cp.client_code, b.booking_code
         ${base}
         ORDER BY (f.severity = 'ERROR') DESC, f.first_seen_at DESC, f.finding_id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, (page - 1) * limit]
      ),
      db.query(`SELECT COUNT(*)::int AS n ${base}`, params),
    ]);
    res.json({ status: 'success', data: rows.rows, pagination: { total: total.rows[0].n, page, limit } });
  } catch (err) {
    console.error('Ledger health findings error:', err);
    res.status(500).json({ message: 'Failed to load findings' });
  }
};

// POST /api/ledger-health/run — starts a run in the background and returns at once.
exports.runNow = async (req, res) => {
  const running = await db.query(`SELECT 1 FROM ledger_health_runs WHERE status = 'RUNNING' AND started_at > NOW() - INTERVAL '30 minutes' LIMIT 1`);
  if (running.rows.length > 0) return res.status(409).json({ message: 'A ledger health run is already in progress' });

  runLedgerHealth({ trigger: 'MANUAL', triggeredBy: req.user?.user_id || null })
    .catch((err) => console.error('[ledgerHealth] manual run failed:', err.message));

  const actorName = await getActorName(req.user?.user_id);
  safeLog({ actorUserId: req.user?.user_id, actorName, actorRole: extractActorRole(req.user?.role), actionType: 'LEDGER_HEALTH_RUN', entityType: 'LEDGER_HEALTH', entityId: null, details: {} });
  res.status(202).json({ status: 'success', message: 'Ledger health check started' });
};

// POST /api/ledger-health/findings/:id/acknowledge   body: { note }
exports.acknowledge = async (req, res) => {
  const note = String(req.body?.note || '').trim();
  if (!note) return res.status(400).json({ message: 'A note is required, so the reason is on record' });
  try {
    const actorName = await getActorName(req.user?.user_id);
    const result = await db.query(
      `UPDATE ledger_health_findings
       SET acknowledged_at = NOW(), acknowledged_by = $2, acknowledged_by_name = $3, acknowledge_note = $4
       WHERE finding_id = $1 AND resolved_at IS NULL RETURNING finding_id, check_key, entity_label`,
      [req.params.id, req.user?.user_id || null, actorName, note]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Finding not found or already resolved' });
    safeLog({ actorUserId: req.user?.user_id, actorName, actorRole: extractActorRole(req.user?.role), actionType: 'LEDGER_HEALTH_ACKNOWLEDGED', entityType: 'LEDGER_HEALTH', entityId: req.params.id,
      details: { check_key: result.rows[0].check_key, item: result.rows[0].entity_label, note } });
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Ledger health acknowledge error:', err);
    res.status(500).json({ message: 'Failed to acknowledge the finding' });
  }
};

// POST /api/ledger-health/findings/:id/unacknowledge
exports.unacknowledge = async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE ledger_health_findings SET acknowledged_at = NULL, acknowledged_by = NULL, acknowledged_by_name = NULL, acknowledge_note = NULL
       WHERE finding_id = $1 AND resolved_at IS NULL RETURNING finding_id`, [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Finding not found or already resolved' });
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Ledger health unacknowledge error:', err);
    res.status(500).json({ message: 'Failed to reopen the finding' });
  }
};
