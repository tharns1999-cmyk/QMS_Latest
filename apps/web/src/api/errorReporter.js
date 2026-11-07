import { sendErrorReport } from './client';

// Web error tracking: uncaught errors, unhandled promise rejections and React render crashes (the shared ErrorBoundary
// announces those with CLIENT_ERROR_EVENT, since shared/ may not import the API layer) are sent once each to the API log.
export const CLIENT_ERROR_EVENT = 'qms:client-error';
export const MAX_REPORTS_PER_PAGE = 10;

const clip = (value, max) => String(value ?? '').slice(0, max);

export const createErrorReporter = ({ send = sendErrorReport, max = MAX_REPORTS_PER_PAGE } = {}) => {
  const seen = new Set();
  let sent = 0;
  return (kind, error, extra = {}) => {
    const message = clip(error?.message ?? error, 500).trim();
    if (!message) return false;
    const key = `${kind}:${message}`;
    if (seen.has(key) || sent >= max) return false;
    seen.add(key);
    const accepted = send({
      kind,
      message,
      stack: clip(error?.stack ?? extra.stack, 2000),
      page: clip(typeof window !== 'undefined' ? window.location.pathname : '', 300),
      requestId: clip(error?.requestId, 64) || undefined,
      appVersion: clip(import.meta.env.VITE_APP_VERSION, 50) || undefined
    });
    if (accepted) sent += 1;
    return accepted;
  };
};

let installed = false;

export const installErrorReporter = (options) => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const report = createErrorReporter(options);
  window.addEventListener('error', (event) => report('error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => report('unhandledrejection', event.reason));
  window.addEventListener(CLIENT_ERROR_EVENT, (event) => report('render', event.detail?.error, { stack: event.detail?.componentStack }));
};
