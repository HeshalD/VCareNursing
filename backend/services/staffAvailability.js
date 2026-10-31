// A staff member normally holds one booking at a time. Staff flagged
// can_dual_book (they work two shifts a day at two different bookings) may hold two.
const MAX_BOOKINGS = 2;

// The conflict queries count date-overlapping commitments on OTHER bookings (fetching
// at most MAX_BOOKINGS rows). Assignment is refused once that count reaches this
// threshold: 1 other booking blocks a normal staff member, 2 block a dual-booking one.
const conflictThreshold = (canDualBook) => (canDualBook ? MAX_BOOKINGS : 1);

module.exports = { MAX_BOOKINGS, conflictThreshold };
