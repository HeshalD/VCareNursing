// scripts/regFeeIntegrity.js
//
// Read-only report of clients whose registration fee is not in order.
//   node scripts/regFeeIntegrity.js              summary + client codes per check
//   node scripts/regFeeIntegrity.js --json       machine-readable
// Exit code 1 when any high-severity check finds a client, so it can run from a scheduler.
const { runChecks } = require('../services/registrationFeeIntegrity');

(async () => {
  const results = await runChecks({ limitPerCheck: 1000 });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log(`\n[${r.severity.toUpperCase()}] ${r.label}: ${r.count}`);
      if (r.count) console.log('  ' + r.clients.map((c) => c.client_code).join(', '));
    }
  }
  process.exit(results.some((r) => r.severity === 'high' && r.count > 0) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
