import { logClientError } from './errorLogger';

const noop = () => {};

// Preserve original console methods to avoid recursion when we overwrite console.* later
const origConsole = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

export const logger = {
  debug: (...args: any[]) => {
    if (!import.meta.env.PROD) {
      origConsole.debug(...args);
    }
  },
  info: (...args: any[]) => {
    if (!import.meta.env.PROD) {
      origConsole.info(...args);
    }
  },
  warn: (...args: any[]) => {
    if (!import.meta.env.PROD) {
      origConsole.warn(...args);
    }
    // NOTE: warnings are intentionally NOT forwarded to Discord. They are still
    // recorded via logClientError with level 'warning' (DB opt-in only) so
    // they don't contribute to webhook spam.
    try {
      const first = args[0];
      const message = typeof first === 'string' ? first : safePreview(first);
      void logClientError(new Error(`[console.warn] ${message}`), { args: previewArgs(args) }, { level: 'warning' });
    } catch {}
  },
  error: async (...args: any[]) => {
    // Always keep original error output so developers can inspect locally
    origConsole.error(...args);

    try {
      const first = args[0];
      const err = first instanceof Error ? first : new Error(args.map(a => (typeof a === 'string' ? a : safePreview(a))).join(' '));

      // Log to client admin_logs
      await logClientError(err, { args: previewArgs(args.slice(1)) }, { level: 'error' });

      // Send to Sentry if available
      try {
        const { captureException } = await import('@/lib/sentry');
        captureException(err, { args: previewArgs(args.slice(1)) });
      } catch {}
    } catch {}
  },
};

function safePreview(value: unknown): string {
  try {
    if (typeof value === 'string') return value.slice(0, 300);
    return JSON.stringify(value)?.slice(0, 300) ?? String(value);
  } catch {
    return '[unserializable]';
  }
}

function previewArgs(args: unknown[]): unknown[] {
  // Keep only a small, serializable preview so error payloads stay tiny.
  return args.slice(0, 3).map((a) => {
    if (typeof a === 'string') return a.slice(0, 300);
    try {
      const json = JSON.stringify(a);
      return json ? json.slice(0, 300) : String(a);
    } catch {
      return '[unserializable]';
    }
  });
}

// Optionally patch console in production to remove noisy dev logs
export function initConsoleProtection() {
  if (import.meta.env.PROD) {
    // eslint-disable-next-line no-console
    console.log = noop;
    // eslint-disable-next-line no-console
    console.info = noop;
    // eslint-disable-next-line no-console
    console.debug = noop;
    // We keep console.warn/error but forward warn->logger.warn and error->logger.error
    // eslint-disable-next-line no-console
    console.warn = (...args: any[]) => void logger.warn(...args);
    // eslint-disable-next-line no-console
    console.error = (...args: any[]) => void logger.error(...args);
  }
}
