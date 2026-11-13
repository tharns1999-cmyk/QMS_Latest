// Fail-closed gate for production builds: without VITE_API_URL the app silently runs on its
// built-in demo data (localStorage), so nothing real would be saved or audited.
import { readFileSync } from 'node:fs';

const url = process.env.VITE_API_URL || '';
if (!/^https:\/\/\S+$/.test(url)) {
  console.error('build:production needs VITE_API_URL set to the https URL of the API (got: "' + url + '").');
  process.exit(1);
}
// A build pointing at the developer's own machine would ship a site whose API nobody else can reach.
if (/^https:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url)) {
  console.error('build:production cannot use a localhost API URL (got: "' + url + '").');
  process.exit(1);
}
// The browser only calls origins listed in connect-src of public/_headers. A new API address that is missing there
// builds fine and then fails every request (login included) once deployed.
const origin = new URL(url).origin;
const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const connectSrc = /connect-src([^;\n]*)/.exec(headers)?.[1].split(/\s+/) || [];
if (!connectSrc.includes(origin)) {
  console.error('build:production: ' + origin + ' is not in connect-src of apps/web/public/_headers, so the browser would block every API call.');
  console.error('Add it there (replace the UAT address for the company account) and build again.');
  process.exit(1);
}
