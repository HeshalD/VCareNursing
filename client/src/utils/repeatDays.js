// Weekly repeat days for a booking or shift. Weekday numbers follow JS getDay() /
// Postgres EXTRACT(DOW): 0 = Sunday … 6 = Saturday. null means every day.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first display order
export const DAY_SHORT = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKENDS = [0, 6];

const sameDays = (a, b) => a.length === b.length && a.every((d) => b.includes(d));

export const isRepeatDay = (days, date) => !Array.isArray(days) || days.includes(date.getDay());

export const describeRepeatDays = (days) => {
  if (!Array.isArray(days) || days.length === 7) return 'Every day (7 days a week)';
  if (days.length === 0) return 'No days selected';
  if (sameDays(days, WEEKDAYS)) return 'Weekdays (Mon – Fri)';
  if (sameDays(days, WEEKENDS)) return 'Weekends (Sat – Sun)';
  return `Every ${WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(', ')}`;
};
