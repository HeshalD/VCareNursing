// A staff member normally holds one booking at a time. Staff flagged can_dual_book
// (they work several shifts a day at different bookings) may hold any number.
//
// The conflict queries fetch date-overlapping commitments on OTHER bookings (LIMIT 2 —
// enough to tell "one" from "more"). Assignment is refused once that count reaches this
// threshold: 1 other booking blocks a normal staff member; a badged one is never blocked.
const conflictThreshold = (canDualBook) => (canDualBook ? Infinity : 1);

module.exports = { conflictThreshold };
