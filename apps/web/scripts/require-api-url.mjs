// Fail-closed gate for production builds: without VITE_API_URL the app silently runs on its
// built-in demo data (localStorage), so nothing real would be saved or audited.
const url = process.env.VITE_API_URL || '';
if (!/^https:\/\/\S+$/.test(url)) {
  console.error('build:production needs VITE_API_URL set to the https URL of the API (got: "' + url + '").');
  process.exit(1);
}
