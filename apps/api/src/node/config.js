// Settings for running the API on a plain Node host (Azure App Service or a container). They come from environment
// variables, which App Service calls "application settings"; nothing secret is read from a file.
import { entraSettings } from '../entraAuth.js';

const MIN_SECRET_LENGTH = 32;
const ENTRA_SETTINGS = ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'ENTRA_REDIRECT_URI', 'ENTRA_POST_LOGIN_URL', 'ENTRA_AUTHORITY_HOST'];

// Files go to Azure Blob Storage when an account (managed identity) or a connection string is given, else to a folder.
// Shared with the tool that moves the existing PDFs, so both read the same settings the same way.
export const readBlobSettings = (source = process.env) => {
  const problems = [];
  const text = (name) => String(source[name] ?? '').trim();
  const account = text('AZURE_STORAGE_ACCOUNT');
  const connectionString = text('AZURE_STORAGE_CONNECTION_STRING');
  if (account && connectionString) problems.push('Set AZURE_STORAGE_ACCOUNT (managed identity) or AZURE_STORAGE_CONNECTION_STRING, not both');
  if (account && !/^[a-z0-9]{3,24}$/.test(account)) problems.push(`AZURE_STORAGE_ACCOUNT "${account}" is not a storage account name (3-24 lowercase letters and digits)`);
  const container = text('AZURE_STORAGE_CONTAINER') || 'qms-files';
  if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,62}$/.test(container)) problems.push(`AZURE_STORAGE_CONTAINER "${container}" is not a container name (3-63 lowercase letters, digits and single hyphens)`);
  return { problems, blob: account || connectionString ? { container, account, connectionString } : null };
};

export const readConfig = (source = process.env) => {
  const problems = [];
  const text = (name) => String(source[name] ?? '').trim();
  const required = (name, hint) => {
    const value = text(name);
    if (!value) problems.push(`${name} is not set (${hint})`);
    return value;
  };

  const databaseUrl = required('DATABASE_URL', 'postgres://user:password@host:5432/database');
  const jwtSecret = required('JWT_SECRET', `at least ${MIN_SECRET_LENGTH} random characters`);
  if (jwtSecret && jwtSecret.length < MIN_SECRET_LENGTH) problems.push(`JWT_SECRET is shorter than ${MIN_SECRET_LENGTH} characters`);
  const allowedOrigin = required('ALLOWED_ORIGIN', 'the web address people open, https://..., comma-separated if several');
  if (/localhost|127\.0\.0\.1/.test(allowedOrigin) && text('ALLOW_LOCAL_ORIGIN') !== '1') {
    problems.push('ALLOWED_ORIGIN points at localhost; set ALLOW_LOCAL_ORIGIN=1 only on a developer machine');
  }
  if (text('DISABLE_LOGIN_THROTTLE')) problems.push('DISABLE_LOGIN_THROTTLE must not be set when running the API as a service');

  const port = Number(text('PORT') || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push(`PORT "${text('PORT')}" is not a port number`);
  const poolMax = Number(text('DATABASE_POOL_MAX') || 10);
  if (!Number.isInteger(poolMax) || poolMax < 1) problems.push(`DATABASE_POOL_MAX "${text('DATABASE_POOL_MAX')}" is not a positive whole number`);

  const storage = readBlobSettings(source);
  problems.push(...storage.problems);

  // Sign-in: passwords (the default) or the company Microsoft account. Microsoft mode needs all of its settings to start.
  const authMode = text('AUTH_MODE').toLowerCase() || 'password';
  if (!['password', 'entra'].includes(authMode)) problems.push(`AUTH_MODE "${text('AUTH_MODE')}" must be "password" or "entra"`);
  const entra = Object.fromEntries(ENTRA_SETTINGS.map((name) => [name, text(name)]));
  if (authMode === 'entra') problems.push(...entraSettings({ ...entra, AUTH_MODE: 'entra' }).problems);

  if (problems.length) throw new Error(`Cannot start the API:\n- ${problems.join('\n- ')}`);

  return {
    databaseUrl,
    jwtSecret,
    allowedOrigin,
    // The one header the host's front end sets with the caller's address; without it the per-address login limit is off.
    clientIpHeader: text('CLIENT_IP_HEADER'),
    port,
    poolMax,
    filesDir: text('FILES_DIR') || './data/files',
    blob: storage.blob,
    authMode,
    entra,
    webDistDir: text('WEB_DIST_DIR'),
    runScheduler: text('RUN_SCHEDULER') !== '0'
  };
};
