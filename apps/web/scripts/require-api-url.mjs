// Fail-closed gate for production builds: without VITE_API_URL the app silently runs on its
// built-in demo data (localStorage), so nothing real would be saved or audited.
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
