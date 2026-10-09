// Effective amounts for a backdated swap's per-day pay decision (see
// BackdatedSwapPayCalendar). A blank override means "the figure already on
// record": what the cron paid the outgoing staff, or the replacement's rate.

export const backdatedOldAmount = (day, decision) => (
  decision?.oldAmount !== '' && decision?.oldAmount != null ? Number(decision.oldAmount) : Number(day.oldRecord?.salary_amount || 0)
);

export const backdatedNewAmount = (decision, newRate) => (
  decision?.newAmount !== '' && decision?.newAmount != null ? Number(decision.newAmount) : Number(newRate || 0)
);
