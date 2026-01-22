// Lightweight Sentry initialization helpers for client and server
// Requires installing: @sentry/react, @sentry/tracing, @sentry/node

export async function initSentryClient() {
  try {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn) return;
    // Import lazily so build doesn't fail if the package isn't installed
    const Sentry = (await import('@sentry/react')).default;
    const { BrowserTracing } = await import('@sentry/tracing');

    Sentry.init({
      dsn,
      integrations: [new BrowserTracing()],
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0.05,
      release: __APP_VERSION__,
      environment: import.meta.env.VITE_SENTRY_ENV || 'production',
    });
  } catch (e) {
    // ignore if not installed or failed
    // eslint-disable-next-line no-console
    console.warn('Sentry client init failed', e);
  }
}

export function initSentryServer() {
  try {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return;
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const SentryNode = require('@sentry/node');
    const Tracing = require('@sentry/tracing');

    if (!SentryNode.getCurrentHub().getClient()) {
      SentryNode.init({
        dsn,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.05,
        environment: process.env.SENTRY_ENV || 'production',
        release: process.env.APP_VERSION || __APP_VERSION__,
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Sentry server init failed', e);
  }
}

export function captureException(err: any, context: any = {}) {
  try {
    // Try client-side Sentry first
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sentry = require('@sentry/react');
      Sentry.captureException(err, { extra: context });
    } else {
      // server-side
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SentryNode = require('@sentry/node');
      SentryNode.captureException(err, { extra: context });
    }
  } catch (e) {
    // noop
  }
}
