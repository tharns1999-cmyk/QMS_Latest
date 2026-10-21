import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

// Fresh local D1 for every test run, built from the same migrations used in production.
export default function setup() {
  rmSync('.wrangler/test', { recursive: true, force: true });
  execSync('npx wrangler d1 migrations apply DB --local --persist-to .wrangler/test', { stdio: 'inherit', env: { ...process.env, CI: 'true' } });
  // Production asks DCC and L5+ for two-factor; most tests sign in with passwords alone, so it starts off here and two_factor.test.js turns it on for itself.
  execSync(`npx wrangler d1 execute DB --local --persist-to .wrangler/test --command "UPDATE settings SET value = '0' WHERE key IN ('two_factor_min_level', 'two_factor_for_dcc')"`, { stdio: 'inherit' });
}
