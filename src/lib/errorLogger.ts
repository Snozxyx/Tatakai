import { supabase } from '@/integrations/supabase/client';
import { notifyError } from '@/core/network/discord-webhook';

function generateErrorId() {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

type LogLevel = 'error' | 'warning' | 'fatal';

interface LogOptions {
  level?: LogLevel;
  /** Set true to force a Discord ping even for warnings. Default: warnings never ping. */
  notifyDiscord?: boolean;
}

function safeStringify(value: unknown, max = 800): string | undefined {
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(value, (_key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[circular]';
        seen.add(val);
      }
      if (typeof val === 'function') return '[function]';
      if (typeof val === 'bigint') return String(val);
      return val;
    });
    if (!json) return undefined;
    return json.length > max ? json.slice(0, max - 1) + '…' : json;
  } catch {
    try {
      return String(value).slice(0, max);
    } catch {
      return undefined;
    }
  }
}

export async function logClientError(
  err: unknown,
  context: Record<string, any> = {},
  options: LogOptions = {},
) {
  try {
    const errorId = generateErrorId();
    const level: LogLevel = options.level ?? 'error';

    const message = err instanceof Error ? err.message : String(err || 'Unknown error');
    const stack = err instanceof Error ? err.stack : undefined;

    // Try to get currently logged-in user id if available
    let userId: string | null = null;
    try {
      // supabase.auth.getUser is async
      // It returns { data: { user }, error }
      const res = await (supabase.auth as any).getUser?.();
      userId = res?.data?.user?.id ?? null;
    } catch (e) {
      // noop
    }

    const details = {
      error_id: errorId,
      level,
      message,
      stack,
      url: typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      context,
    };

    // Frontend errors are intentionally NOT persisted to admin_logs/staff logs by default.
    // Keep an explicit opt-in switch for exceptional debugging sessions (set the
    // env var to 'true' to turn persistence ON).
    const shouldPersistToAdminLogs = import.meta.env.VITE_LOG_FRONTEND_ERRORS_TO_DB === 'true';
    if (shouldPersistToAdminLogs) {
      await supabase.from('admin_logs').insert({
        user_id: userId,
        action: 'client_error',
        entity_type: 'frontend',
        entity_id: null,
        details,
      });
    }

    const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    const enableDiscordLogging = (import.meta.env.PROD && !isLocalhost) || import.meta.env.VITE_ENABLE_DISCORD_WEBHOOKS === 'true';

    if (enableDiscordLogging) {
      // Warnings never ping Discord unless explicitly forced — this was the main
      // source of webhook spam (every console.warn → Discord).
      const shouldNotify = options.notifyDiscord ?? level !== 'warning';
      if (shouldNotify) {
        // notifyError itself enforces the 5-min/user throttle + 1h dedup and
        // drops known-benign browser noise, so bursty callers can't spam.
        notifyError({
          message,
          stack,
          url: details.url || undefined,
          userId: userId || undefined,
          context: safeStringify({ ...context, errorId, level }),
          errorId,
          userAgent: details.userAgent || undefined,
          severity: level === 'fatal' ? 'fatal' : level === 'warning' ? 'warning' : 'error',
        });
      }
    }

    return { errorId };
  } catch (e) {
    // If even logging fails, swallow the error silently. We don't want to break the app.
    try {
      // Best-effort: send to console in non-production
      // eslint-disable-next-line no-console
      console.warn('[logClientError] failed to record error', e);
    } catch {}
    return undefined;
  }
}
