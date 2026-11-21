// controllers/walletPaymentController.js
// Admin pays a client's unpaid invoices (care days, products/rentals, registration fee) from the
// client's wallet. All the rules live in services/walletPayments.js.

const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { payFromWallet, listPayable } = require('../services/walletPayments');
const { creditSalespersonForRegistration } = require('../services/clientSalespersonService');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TYPES = ['DAY', 'PRODUCT', 'REG_FEE', 'BOOKING_DUE'];

const parseBody = (req) => {
  const { targets, allow_other_earmarks, override_reason, note } = req.body || {};
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > 200) {
    return { error: 'Choose between 1 and 200 invoices to pay' };
  }
  for (const t of targets) {
    if (!t || !VALID_TYPES.includes(t.type)) return { error: 'Each target needs a valid type' };
    if (t.type !== 'REG_FEE' && !uuidRegex.test(String(t.id || ''))) return { error: 'Each target needs a valid id' };
    if (t.amount != null && !(Number(t.amount) > 0)) return { error: 'Amounts must be greater than 0' };
  }
  return {
    targets: targets.map((t) => ({ type: t.type, id: t.id || null, amount: t.amount == null ? null : Number(t.amount) })),
    allowOtherEarmarks: allow_other_earmarks === true,
    overrideReason: override_reason ? String(override_reason).trim() : null,
    note: note ? String(note).trim().slice(0, 500) : null,
  };
};

const sendError = (res, err, label) => {
  if (err.statusCode) {
    return res.status(err.statusCode).json({ status: 'error', message: err.message, code: err.code || undefined });
  }
  console.error(`${label}:`, err);
  return res.status(500).json({ status: 'error', message: 'Could not complete the wallet payment' });
};

/**
 * GET /api/client/:client_id/wallet-pay/info
 * Wallet balance, what is reserved per booking, and everything currently payable.
 */
exports.getWalletPayInfo = async (req, res) => {
  const { client_id } = req.params;
  if (!uuidRegex.test(client_id)) return res.status(400).json({ status: 'error', message: 'Invalid client ID' });
  const client = await db.pool.connect();
  try {
    const wallet = await client.query(`SELECT COALESCE(wallet_balance, 0) AS wallet FROM client_profiles WHERE client_profile_id = $1`, [client_id]);
    if (wallet.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Client not found' });
    const reservations = await client.query(
      `SELECT booking_id, booking_code, status, wallet_earmarked AS reserved
       FROM bookings WHERE client_id = $1 AND COALESCE(wallet_earmarked, 0) > 0.005
       ORDER BY wallet_earmarked DESC`,
      [client_id]
    );
    const payable = await listPayable(client, client_id);
    const walletBalance = parseFloat(wallet.rows[0].wallet);
    const reservedTotal = reservations.rows.reduce((s, r) => s + parseFloat(r.reserved), 0);
    res.json({
      status: 'success',
      data: {
        wallet_balance: walletBalance,
        reserved_total: Math.round(reservedTotal * 100) / 100,
        unreserved: Math.max(Math.round((walletBalance - reservedTotal) * 100) / 100, 0),
        reservations: reservations.rows.map((r) => ({ ...r, reserved: parseFloat(r.reserved) })),
        payable,
      },
    });
  } catch (err) {
    sendError(res, err, 'getWalletPayInfo');
  } finally {
    client.release();
  }
};

const run = async (req, res, { commit }) => {
  const { client_id } = req.params;
  if (!uuidRegex.test(client_id)) return res.status(400).json({ status: 'error', message: 'Invalid client ID' });
  const parsed = parseBody(req);
  if (parsed.error) return res.status(400).json({ status: 'error', message: parsed.error });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await payFromWallet(client, {
      client_id, targets: parsed.targets, allowOtherEarmarks: parsed.allowOtherEarmarks,
      overrideReason: parsed.overrideReason, note: parsed.note,
      actorUserId: req.user?.user_id || null, creditSalespersonForRegistration,
    });
    if (!commit) {
      await client.query('ROLLBACK');
      return res.json({ status: 'success', data: { ...result, preview: true } });
    }
    await client.query('COMMIT');

    logActivity({
      actorUserId: req.user?.user_id, actorRole: req.user?.role,
      actionType: 'WALLET_INVOICE_PAYOFF', entityType: 'CLIENT', entityId: String(client_id),
      details: {
        total: result.total, wallet_before: result.wallet_before, wallet_after: result.wallet_after,
        items: result.items, used_other_bookings_money: result.breakdown.fromOthers > 0,
        reserved_for_other_bookings: result.breakdown.others, override_reason: parsed.overrideReason, note: parsed.note,
      },
    }).catch((e) => console.error('Activity log failed:', e));

    res.status(201).json({ status: 'success', message: 'Paid from the client wallet', data: result });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendError(res, err, commit ? 'walletPay' : 'previewWalletPay');
  } finally {
    client.release();
  }
};

/** POST /api/client/:client_id/wallet-pay/preview — same work as the payment, rolled back. */
exports.previewWalletPay = (req, res) => run(req, res, { commit: false });

/** POST /api/client/:client_id/wallet-pay */
exports.walletPay = (req, res) => run(req, res, { commit: true });
