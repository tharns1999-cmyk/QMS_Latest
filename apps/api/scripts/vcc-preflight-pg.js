#!/usr/bin/env node
// The VCC data integrity check (src/vccPreflight.js, the same one `pnpm run db:preflight` runs against Cloudflare D1) run
// against PostgreSQL. Read-only. Use it on the moved database before cut-over and after any data fix.
//
//   DATABASE_URL=postgres://user:password@host:5432/qms?sslmode=require node scripts/vcc-preflight-pg.js
//
// Exit code 0 only when the check passes and the status is READY; anything else, including a connection failure, is 1.
import { createPgDatabase } from '../src/db/pgAdapter.js';
import { createPgDriver } from '../src/db/pgDriver.js';
import { PREFLIGHT_STATUS, validateVccMigrationPreflight } from '../src/vccPreflight.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL=postgres://... first.');
  process.exit(2);
}

const driver = createPgDriver({ connectionString: url, max: 1, serializeWrites: false });
try {
  // Read-only: the driver is told not to take the write lock and nothing below writes.
  const result = await validateVccMigrationPreflight(createPgDatabase(driver));
  console.log(result.reportText);
  if (!result.isValid || result.status !== PREFLIGHT_STATUS.READY) {
    console.error(`FAIL-CLOSED: the check did not pass (status ${result.status}). Do not go on.`);
    process.exitCode = 1;
  } else {
    console.log('PASSED: the database passed the VCC integrity check.');
  }
} catch (err) {
  console.error(`FATAL: ${err.message}`);
  process.exitCode = 1;
} finally {
  await driver.close().catch(() => {});
}
