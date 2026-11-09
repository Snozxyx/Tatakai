import { resolveApiV3Base } from '@/lib/api/backendOrigin';

export type CaptchaAction = 'signin' | 'signup' | 'recover' | 'resend' | 'email-proof' | 'suggestion' | 'report';
// Cap proofs last five minutes; leave thirty seconds for the protected request.
export const CAPTCHA_TOKEN_MAX_AGE_MS = 4 * 60 * 1000 + 30 * 1000;
export const CAPTCHA_SOLVE_TIMEOUT_MS = 60_000;

export function isCaptchaRequired(): boolean {
  return import.meta.env.VITE_CAPTCHA_ENABLED === 'true';
}

/** Every browser and native shell uses its configured first-party API. */
export function getCapApiEndpoint(action: CaptchaAction): string {
  return `${resolveApiV3Base()}/security/cap/${action}/`;
}

export function isCaptchaToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/\s/.test(value);
}

export class SecurityRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'SecurityRequestError';
  }
}

/** The server consumes each Cap token once, together with its protected mutation. */
export async function requestSecurity<T>(
  path: string,
  body: Record<string, unknown>,
  options: { accessToken?: string; signal?: AbortSignal } = {},
): Promise<T> {
  if (isCaptchaRequired() && !isCaptchaToken(body.captchaToken)) throw new SecurityRequestError('Verification required', 403, 'missing_proof');
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  const { clientPlatform: _clientPlatform, ...input } = body;
  if (!isCaptchaRequired()) delete input.captchaToken;
  try {
    const response = await fetch(resolveApiV3Base() + '/security/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.accessToken ? { Authorization: 'Bearer ' + options.accessToken } : {}),
      },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: 'no-store',
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.success !== true || !('data' in result)) {
      const error = result?.error;
      const message = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : 'Verification unavailable';
      throw new SecurityRequestError(message, response.status, error?.code);
    }
    return result.data as T;
  } catch (error) {
    if (timedOut) throw new SecurityRequestError('Verification timed out', 0, 'timeout');
    throw error;
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', cancel);
  }
}
