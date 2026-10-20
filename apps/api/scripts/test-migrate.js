import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

// Fresh local D1 for every test run, built from the same migrations used in production.
export default function setup() {
  rmSync('.wrangler/test', { recursive: true, force: true });
  execSync('npx wrangler d1 migrations apply DB --local --persist-to .wrangler/test', { stdio: 'inherit', env: { ...process.env, CI: 'true' } });
}
