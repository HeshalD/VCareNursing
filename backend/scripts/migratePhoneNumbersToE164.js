/**
 * One-off backfill: converts every legacy local-format phone number (e.g.
 * "0771234567") already in the DB to E.164 ("+94771234567"), so it lines up
 * with the new normalize-before-store / normalize-before-query logic used
 * throughout the backend (see backend/utils/phone.js).
 *
 * Idempotent — rows already starting with '+' are skipped, so it's safe to
 * re-run. Rows that can't be parsed as a valid number are left untouched and
 * reported at the end for manual follow-up, rather than guessed at.
 *
 * IMPORTANT deploy ordering: run this BEFORE restarting the server with the
 * new backend code (same as `npm run migrate`) — the new login/lookup code
 * normalizes incoming input to E.164 before querying, which only matches
 * once the stored values are also E.164.
 *
 * Usage:
 *   node backend/scripts/migratePhoneNumbersToE164.js
 *   node backend/scripts/migratePhoneNumbersToE164.js --dry-run
 */

const db = require('../config/db');
const { toE164 } = require('../utils/phone');

// { table, primaryKey, column }
const TARGETS = [
  { table: 'users', pk: 'user_id', column: 'mobile_number' },
  { table: 'staff_applications', pk: 'application_id', column: 'mobile_number' },
  { table: 'pending_registrations', pk: 'pending_id', column: 'mobile_number' },
  { table: 'service_requests', pk: 'request_id', column: 'payer_mobile' },
  { table: 'internal_staff', pk: 'id', column: 'phone' },
  { table: 'walk_in_customers', pk: 'walk_in_customer_id', column: 'mobile_number' },
  { table: 'vendors', pk: 'vendor_id', column: 'phone' },
];

async function migrateTarget({ table, pk, column }, dryRun) {
  const rows = await db.query(
    `SELECT ${pk} AS pk, ${column} AS value FROM ${table}
     WHERE ${column} IS NOT NULL AND ${column} <> '' AND ${column} NOT LIKE '+%'`
  );

  let updated = 0;
  const unparseable = [];

  for (const row of rows.rows) {
    const e164 = toE164(row.value);
    if (!e164) {
      unparseable.push({ table, pk: row.pk, value: row.value });
      continue;
    }
    if (!dryRun) {
      await db.query(`UPDATE ${table} SET ${column} = $1 WHERE ${pk} = $2`, [e164, row.pk]);
    }
    updated++;
  }

  return { table, column, scanned: rows.rows.length, updated, unparseable };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? 'DRY RUN — no rows will be modified.\n' : 'Backfilling phone numbers to E.164...\n');

  const allUnparseable = [];
  for (const target of TARGETS) {
    const result = await migrateTarget(target, dryRun);
    console.log(`${result.table}.${result.column}: scanned ${result.scanned}, ${dryRun ? 'would update' : 'updated'} ${result.updated}, unparseable ${result.unparseable.length}`);
    allUnparseable.push(...result.unparseable);
  }

  if (allUnparseable.length) {
    console.log('\nRows that could not be parsed as a valid phone number (left untouched — review manually):');
    for (const row of allUnparseable) {
      console.log(`  ${row.table}#${row.pk}: "${row.value}"`);
    }
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Phone number backfill failed:', err);
  process.exit(1);
});
