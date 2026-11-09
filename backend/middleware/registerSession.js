const db = require('../config/db');
const { userHasPermission } = require('./authMiddleware');
const { runInRegisterScope } = require('../utils/registerContext');
const { todayLocal } = require('../services/cashRegister');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Route middleware for the shared payment endpoints. When the request carries an
// X-Register-Session header (sent by the frontdesk Cash Register screen) the payment is
// stamped as a register payment of that session; otherwise this is a no-op, so the normal
// admin screens behave exactly as before.
//
// Mount it AFTER multer (upload.single): AsyncLocalStorage context can be lost across
// multer's stream callbacks, and the scope has to wrap the controller itself.
const attachRegisterSession = async (req, res, next) => {
  const sessionId = req.headers['x-register-session'];
  if (!sessionId) return next();

  try {
    if (!uuidRegex.test(String(sessionId))) {
      return res.status(400).json({ status: 'error', message: 'Invalid register session id' });
    }
    if (!(await userHasPermission(req.user, 'CASH_REGISTER_OPERATE'))) {
      return res.status(403).json({ message: 'Permission Denied: You cannot take payments through the cash register.' });
    }

    const result = await db.query(
      'SELECT session_id, status FROM cash_register_sessions WHERE session_id = $1',
      [sessionId]
    );
    const session = result.rows[0];
    if (!session) {
      return res.status(404).json({ status: 'error', message: 'Register session not found' });
    }
    if (session.status !== 'OPEN') {
      return res.status(409).json({
        status: 'error',
        message: 'This register day is closed. Ask a super-admin to reopen it before taking more payments.',
      });
    }

    // A payment at the desk is cash in the drawer today - backdating it would put it
    // in a different day's ledger than the till it was counted into.
    const dated = req.body?.payment_date;
    if (dated && String(dated).slice(0, 10) !== todayLocal()) {
      return res.status(400).json({ status: 'error', message: 'Payments taken at the cash register must be dated today.' });
    }

    return runInRegisterScope({ sessionId: session.session_id, cashierId: req.user.user_id }, next);
  } catch (err) {
    console.error('attachRegisterSession error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { attachRegisterSession };
