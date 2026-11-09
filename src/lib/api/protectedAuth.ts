import { resolveApiV3Base } from '@/lib/api/backendOrigin';
import { isCaptchaRequired, isCaptchaToken } from '@/lib/security/captcha';

type AuthAction = 'sign-in' | 'sign-up' | 'recover' | 'resend';

export interface ProtectedAuthResult {
  session?: { access_token: string; refresh_token: string } | null;
  mode?: 'otp_required' | 'restricted';
}

/** First-party auth respects the server's temporary CAPTCHA setting. */
export async function requestProtectedAuth(
  action: AuthAction,
  input: Record<string, unknown>,
  operationsSignup = false,
): Promise<ProtectedAuthResult> {
  if (isCaptchaRequired() && !isCaptchaToken(input.captchaToken)) {
    throw new Error('Please complete the verification challenge.');
  }
  const path = operationsSignup && action === 'sign-up'
    ? '/auth/signup'
    : `/security/auth/${action}`;
  const { clientPlatform: _clientPlatform, ...requestBody } = input;
  if (!isCaptchaRequired()) delete requestBody.captchaToken;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  let result: any;
  try {
    response = await fetch(`${resolveApiV3Base()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      cache: 'no-store',
    });
    result = await response.json().catch(() => null);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok || !result || (!(operationsSignup && action === 'sign-up') && result.success !== true)) {
    const message = typeof result?.error === 'string'
      ? result.error
      : typeof result?.error?.message === 'string' ? result.error.message : 'Authentication temporarily unavailable. Please try again.';
    throw new Error(message);
  }
  const data = operationsSignup && action === 'sign-up' ? result : result.data;
  if (!data || typeof data !== 'object') throw new Error('Invalid authentication response.');
  if (action === 'sign-in' && (typeof data.session?.access_token !== 'string' || !data.session.access_token || typeof data.session?.refresh_token !== 'string' || !data.session.refresh_token)) {
    throw new Error('Invalid authentication response.');
  }
  if (operationsSignup && action === 'sign-up' && !['otp_required', 'restricted'].includes(data.mode)) {
    throw new Error('Invalid registration response.');
  }
  return data as ProtectedAuthResult;
}
