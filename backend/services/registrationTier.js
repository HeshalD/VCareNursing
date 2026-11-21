// services/registrationTier.js
//
// One definition of a client's registration TIER, worked out from data we already store
// (nothing is saved, so it can never drift from the ledger or the fee status).
//
//   ACTIVE_PAID    Fee PAID or WAIVED and the membership has not expired.
//   ACTIVE_UNPAID  Not in good standing, but the client has an ongoing or past booking.
//                  Covers: invoiced / receipt not yet verified / never invoiced / expired.
//                  A membership that expires while a booking runs lands here at once.
//   INACTIVE       Everything else: no paid fee and no booking (including invoiced, never booked).
//
// "Has a booking" = at least one booking that has started (ACTIVE, PAUSED, OVERDUE, COMPLETED).
// PENDING, SCHEDULED and CANCELLED bookings do not count.
// RECEIPT_UPLOADED counts as unpaid until staff verify it.

const TIERS = {
  ACTIVE_PAID: 'ACTIVE_PAID',
  ACTIVE_UNPAID: 'ACTIVE_UNPAID',
  INACTIVE: 'INACTIVE',
};

const TIER_LABELS = {
  ACTIVE_PAID: 'Active · Paid',
  ACTIVE_UNPAID: 'Active · Unpaid',
  INACTIVE: 'Inactive',
};

// Booking statuses that mean the client has used the service (ongoing or past).
const STARTED_BOOKING_STATUSES = ['ACTIVE', 'PAUSED', 'OVERDUE', 'COMPLETED'];
const STARTED_LIST_SQL = STARTED_BOOKING_STATUSES.map((s) => `'${s}'`).join(', ');

// SQL fragments. `cp` must be the client_profiles alias.
const MEMBERSHIP_IN_GOOD_STANDING_SQL =
  `(cp.reg_fee_status IN ('PAID', 'WAIVED') AND (cp.reg_fee_expires_at IS NULL OR cp.reg_fee_expires_at > NOW()))`;
const HAS_STARTED_BOOKING_SQL =
  `EXISTS (SELECT 1 FROM bookings tb WHERE tb.client_id = cp.client_profile_id AND tb.status::text IN (${STARTED_LIST_SQL}))`;

// A column expression returning the tier key.
const TIER_SQL = `(CASE
  WHEN ${MEMBERSHIP_IN_GOOD_STANDING_SQL} THEN 'ACTIVE_PAID'
  WHEN ${HAS_STARTED_BOOKING_SQL} THEN 'ACTIVE_UNPAID'
  ELSE 'INACTIVE' END)`;

// Same rule for a single already-loaded client (used where a row is in hand).
const computeTier = ({ reg_fee_status, reg_fee_expires_at, has_started_booking }) => {
  const inGoodStanding = ['PAID', 'WAIVED'].includes(reg_fee_status)
    && (!reg_fee_expires_at || new Date(reg_fee_expires_at) > new Date());
  if (inGoodStanding) return TIERS.ACTIVE_PAID;
  if (has_started_booking) return TIERS.ACTIVE_UNPAID;
  return TIERS.INACTIVE;
};

// One-line plain-English reason, for tooltips and the client page.
const describeTier = ({ tier, reg_fee_status, reg_fee_expires_at }) => {
  if (tier === TIERS.ACTIVE_PAID) {
    return reg_fee_expires_at
      ? `Fee ${reg_fee_status === 'WAIVED' ? 'waived' : 'paid'}; membership valid until ${new Date(reg_fee_expires_at).toISOString().slice(0, 10)}`
      : `Fee ${reg_fee_status === 'WAIVED' ? 'waived' : 'paid'}`;
  }
  if (tier === TIERS.ACTIVE_UNPAID) {
    const why = {
      INVOICED: 'fee invoiced but not paid',
      RECEIPT_UPLOADED: 'receipt uploaded, not yet verified',
      EXPIRED: 'membership expired',
      PENDING: 'fee never invoiced',
    }[reg_fee_status] || 'fee not paid';
    return `Has a booking; ${why}`;
  }
  return 'No paid fee and no booking yet';
};

module.exports = {
  TIERS, TIER_LABELS, STARTED_BOOKING_STATUSES,
  TIER_SQL, MEMBERSHIP_IN_GOOD_STANDING_SQL, HAS_STARTED_BOOKING_SQL,
  computeTier, describeTier,
};
