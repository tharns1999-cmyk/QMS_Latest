import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createStaticHandler, parseHeadersFile } from './staticFiles.js';

describe('security headers file', () => {
  it('reads the catch-all block and ignores other paths and comments', () => {
    expect(parseHeadersFile('# note\n/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src \'self\'; connect-src \'self\' https://a.example\n\n/assets/*\n  Cache-Control: x\n'))
      .toEqual({ 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://a.example" });
  });
});

describe('serving the web app from the API host', () => {
  let parent;
  let dist;
  let handle;
  const get = (path, method = 'GET') => handle(new Request(`http://host${path}`, { method }));

  beforeAll(async () => {
    parent = mkdtempSync(join(tmpdir(), 'qms-web-'));
    dist = join(parent, 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>QMS</title>');
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(dist, 'privacy.html'), '<p>privacy</p>');
    writeFileSync(join(dist, '_headers'), '/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src \'self\'\n');
    writeFileSync(join(parent, 'secret.txt'), 'outside');
    handle = await createStaticHandler(dist);
  });

  afterAll(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  it('serves the app shell at the root and for any page the browser router owns', async () => {
    for (const path of ['/', '/dcc/documents', '/vcc/assets/12']) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toContain('<title>QMS</title>');
    }
  });

  it('serves built assets as cacheable files with the right type', async () => {
    const res = await get('/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('puts the security headers on every answer', async () => {
    for (const path of ['/', '/assets/app-abc123.js', '/privacy.html']) {
      const res = await get(path);
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('content-security-policy')).toBe("default-src 'self'");
    }
  });

  it('answers 404 for a missing file instead of the app shell, and never hands out the headers file', async () => {
    expect((await get('/assets/missing.js')).status).toBe(404);
    expect((await get('/_headers')).status).toBe(404);
  });

  it('cannot be walked out of the folder', async () => {
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/assets/../../secret.txt', '/..\\secret.txt', '/_HEADERS']) {
      const res = await get(path);
      expect(await res.text()).not.toContain('outside');
    }
  });

  it('only answers GET and HEAD', async () => {
    expect((await get('/', 'POST')).status).toBe(405);
  });
});
