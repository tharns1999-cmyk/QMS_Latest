import { describe, it, expect } from 'vitest';
import { readConfig } from './config.js';

const good = {
  DATABASE_URL: 'postgres://qms:secret@db.example:5432/qms',
  JWT_SECRET: 'x'.repeat(40),
  ALLOWED_ORIGIN: 'https://qms.example.com'
};

describe('settings for running the API as a service', () => {
  it('reads a complete set and fills in the defaults', () => {
    expect(readConfig(good)).toMatchObject({
      databaseUrl: good.DATABASE_URL,
      allowedOrigin: good.ALLOWED_ORIGIN,
      port: 8080,
      poolMax: 10,
      filesDir: './data/files',
      clientIpHeader: '',
      webDistDir: '',
      runScheduler: true
    });
  });

  it('takes the optional settings when given', () => {
    const config = readConfig({ ...good, PORT: '3000', DATABASE_POOL_MAX: '4', CLIENT_IP_HEADER: 'X-Azure-ClientIP', FILES_DIR: '/data/f', WEB_DIST_DIR: '/app/web', RUN_SCHEDULER: '0' });
    expect(config).toMatchObject({ port: 3000, poolMax: 4, clientIpHeader: 'X-Azure-ClientIP', filesDir: '/data/f', webDistDir: '/app/web', runScheduler: false });
  });

  it('lists every missing or weak setting at once, so one start-up attempt shows them all', () => {
    expect(() => readConfig({})).toThrow(/DATABASE_URL is not set[\s\S]*JWT_SECRET is not set[\s\S]*ALLOWED_ORIGIN is not set/);
    expect(() => readConfig({ ...good, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET is shorter than 32/);
  });

  it('refuses a localhost origin unless a developer machine says so', () => {
    expect(() => readConfig({ ...good, ALLOWED_ORIGIN: 'http://localhost:5173' })).toThrow(/points at localhost/);
    expect(readConfig({ ...good, ALLOWED_ORIGIN: 'http://localhost:5173', ALLOW_LOCAL_ORIGIN: '1' }).allowedOrigin).toBe('http://localhost:5173');
  });

  it('refuses to start with the login limit switched off, as the Worker deploy guard does', () => {
    expect(() => readConfig({ ...good, DISABLE_LOGIN_THROTTLE: '1' })).toThrow(/DISABLE_LOGIN_THROTTLE/);
  });

  it('refuses a port or pool size that is not a number', () => {
    expect(() => readConfig({ ...good, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => readConfig({ ...good, PORT: '70000' })).toThrow(/PORT/);
    expect(() => readConfig({ ...good, DATABASE_POOL_MAX: '0' })).toThrow(/DATABASE_POOL_MAX/);
  });
});
