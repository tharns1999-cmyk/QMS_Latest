import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Uses the isolated governance-test fixture through a separate local Worker and API-mode Vite server.
export default defineConfig({
  testDir:'./e2e',testMatch:'module-governance-api.spec.js',workers:1,retries:0,timeout:60000,
  expect:{timeout:15000},reporter:'list',outputDir:join(tmpdir(),'qms-governance-e2e'),
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:5177',viewport:{width:1440,height:1000},timezoneId:'Asia/Bangkok',trace:'retain-on-failure'}
});
