import { supabase } from '@/integrations/supabase/client';

function generateErrorId() {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

export async function logClientError(err: unknown, context: Record<string, any> = {}) {
  try {
    const errorId = generateErrorId();

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
      message,
      stack,
      url: typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      context,
    };

    // Insert into admin_logs as a client_error. This relies on a DB policy
    // that allows public inserts where action = 'client_error' and entity_type = 'frontend'.
    await supabase.from('admin_logs').insert({
      user_id: userId,
      action: 'client_error',
      entity_type: 'frontend',
      entity_id: null,
      details,
    });

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
