// Serves the built web app (the Vite dist folder) from the same host as the API, so one address does both.
// Security headers come from dist/_headers, the file the web build already carries for Cloudflare, so moving the
// host does not drop the Content-Security-Policy and the rest.
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
};

// Only the catch-all block ("/*") of the Cloudflare format is used.
export const parseHeadersFile = (text) => {
  const headers = {};
  let inCatchAll = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inCatchAll = line.trim() === '/*';
      continue;
    }
    const colon = line.indexOf(':');
    if (inCatchAll && colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return headers;
};

export const createStaticHandler = async (distDir) => {
  const root = resolve(distDir);
  const headers = await readFile(join(root, '_headers'), 'utf8').then(parseHeadersFile, () => ({}));
  await stat(join(root, 'index.html')); // fail at start-up, not on the first visit

  const send = async (file, extra = {}) => {
    const body = await readFile(file);
    return new Response(body, { headers: { ...headers, 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', ...extra } });
  };

  // Returns a Response, or null when the path is not for this handler.
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    let path;
    try {
      path = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    if (path.toLowerCase() === '/_headers') return new Response('Not Found', { status: 404 });
    const file = resolve(root, `.${path}`);
    if (file !== root && !file.startsWith(root + sep)) return new Response('Not Found', { status: 404 });
    const info = await stat(file).catch(() => null);
    if (info?.isFile()) {
      // Build output names assets by content, so they can be kept; everything else is checked each time.
      const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      return send(file, { 'Cache-Control': cache });
    }
    // A page of the app (React Router handles it in the browser), but not a missing file.
    if (extname(path)) return new Response('Not Found', { status: 404 });
    return send(join(root, 'index.html'), { 'Cache-Control': 'no-cache' });
  };
};
