import { CAPTCHA_SOLVE_TIMEOUT_MS, getCapApiEndpoint, isCaptchaRequired, isCaptchaToken, SecurityRequestError, type CaptchaAction } from './captcha';

async function solveInvisibleCap(action: CaptchaAction, signal?: AbortSignal): Promise<string> {
  const aborted = () => new DOMException('Verification canceled', 'AbortError');
  if (signal?.aborted) throw aborted();
  // Import in the browser only; the package registers its custom element on load.
  const { default: Cap } = await import('cap-widget');
  if (signal?.aborted) throw aborted();
  const cap = new Cap({
    apiEndpoint: getCapApiEndpoint(action),
    'data-cap-worker-count': String(Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2))),
  });
  cap.widget.hidden = true;
  cap.widget.setAttribute('aria-hidden', 'true');
  let cancel!: (error: Error) => void;
  const cancellation = new Promise<never>((_resolve, reject) => { cancel = reject; });
  const onAbort = () => cancel(aborted());
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const deadline = setTimeout(() => cancel(new SecurityRequestError('Verification timed out', 0, 'timeout')), CAPTCHA_SOLVE_TIMEOUT_MS);
  try {
    const result = await Promise.race([cap.solve(), cancellation]);
    if (!result?.success || !isCaptchaToken(result.token)) throw new Error('Verification unavailable');
    return result.token;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', onAbort);
    // Disconnecting aborts requests, terminates workers and removes instrumentation.
    cap.widget.remove();
  }
}

export const capClient = { solve: solveInvisibleCap };

/** Resends and other explicit actions solve automatically without a second user step. */
export function solveCaptcha(action: CaptchaAction, options: { signal?: AbortSignal } = {}) {
  if (!isCaptchaRequired()) return Promise.resolve('');
  return capClient.solve(action, options.signal);
}
