// Calendar-year-aligned period resolution for the finance dashboard widgets
// (Cash Flow, Income & Expense, Top Expenses). Fiscal year == calendar year
// (Jan-Dec), so "This/Previous Fiscal Year" are just this/last calendar year.
// All ranges are UTC-month-aligned, matching the Date.UTC conventions used
// throughout financesController.js (monthKey, computeProfitLoss, etc).

function monthLabel(monthStart) {
  return monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Builds the `months` array (one entry per calendar month in [start, endExclusive)).
function buildMonths(start, endExclusive) {
  const months = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor < endExclusive) {
    months.push({ monthStart: cursor, label: monthLabel(cursor) });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return months;
}

// referenceDate defaults to now; passing an explicit date is mainly useful for testing.
function resolvePeriodRange(period, referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();

  let start, endExclusive, label;

  switch (period) {
    case 'this_fiscal_year':
      start = new Date(Date.UTC(year, 0, 1));
      endExclusive = new Date(Date.UTC(year + 1, 0, 1));
      label = 'This Fiscal Year';
      break;

    case 'previous_fiscal_year':
      start = new Date(Date.UTC(year - 1, 0, 1));
      endExclusive = new Date(Date.UTC(year, 0, 1));
      label = 'Previous Fiscal Year';
      break;

    case 'last_12_months':
      start = new Date(Date.UTC(year, month - 11, 1));
      endExclusive = new Date(Date.UTC(year, month + 1, 1));
      label = 'Last 12 Months';
      break;

    case 'last_6_months':
      start = new Date(Date.UTC(year, month - 5, 1));
      endExclusive = new Date(Date.UTC(year, month + 1, 1));
      label = 'Last 6 Months';
      break;

    case 'this_quarter': {
      const qStartMonth = Math.floor(month / 3) * 3;
      start = new Date(Date.UTC(year, qStartMonth, 1));
      endExclusive = new Date(Date.UTC(year, qStartMonth + 3, 1));
      label = 'This Quarter';
      break;
    }

    case 'previous_quarter': {
      const qStartMonth = Math.floor(month / 3) * 3;
      start = new Date(Date.UTC(year, qStartMonth - 3, 1));
      endExclusive = new Date(Date.UTC(year, qStartMonth, 1));
      label = 'Previous Quarter';
      break;
    }

    case 'this_month':
      start = new Date(Date.UTC(year, month, 1));
      endExclusive = new Date(Date.UTC(year, month + 1, 1));
      label = 'This Month';
      break;

    case 'previous_month':
      start = new Date(Date.UTC(year, month - 1, 1));
      endExclusive = new Date(Date.UTC(year, month, 1));
      label = 'Previous Month';
      break;

    default:
      throw new Error(`Unknown period: ${period}`);
  }

  return { start, endExclusive, label, months: buildMonths(start, endExclusive) };
}

const CASH_FLOW_PERIODS = ['this_fiscal_year', 'previous_fiscal_year', 'last_12_months'];
const INCOME_EXPENSE_PERIODS = ['this_fiscal_year', 'previous_fiscal_year', 'last_12_months', 'last_6_months'];
const TOP_EXPENSES_PERIODS = [
  'this_fiscal_year', 'this_quarter', 'this_month',
  'previous_fiscal_year', 'previous_quarter', 'previous_month',
  'last_6_months', 'last_12_months',
];

module.exports = { resolvePeriodRange, CASH_FLOW_PERIODS, INCOME_EXPENSE_PERIODS, TOP_EXPENSES_PERIODS };
