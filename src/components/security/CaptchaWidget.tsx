import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { CAPTCHA_TOKEN_MAX_AGE_MS, isCaptchaRequired, isCaptchaToken, type CaptchaAction } from '@/lib/security/captcha';
import { solveCaptcha } from '@/lib/security/capClient';

export interface CaptchaWidgetHandle { reset: () => void; }
interface CaptchaWidgetProps {
  action: CaptchaAction;
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  onTimeout?: () => void;
  className?: string;
  disabled?: boolean;
}

/** Cap runs invisibly on every device. Only a recoverable failure needs visible UI. */
export const CaptchaWidget = forwardRef<CaptchaWidgetHandle, CaptchaWidgetProps>(function CaptchaWidget(props, ref) {
  return isCaptchaRequired() ? <InvisibleCaptcha {...props} ref={ref} /> : null;
});

const InvisibleCaptcha = forwardRef<CaptchaWidgetHandle, CaptchaWidgetProps>(function InvisibleCaptcha(
  { action, onToken, onExpire, onError, onTimeout, className, disabled = false }, ref,
) {
  useUiTranslation();
  const callbacks = useRef({ onToken, onExpire, onError, onTimeout });
  callbacks.current = { onToken, onExpire, onError, onTimeout };
  const generation = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const reset = () => {
    generation.current++;
    callbacks.current.onExpire?.();
    setAttempt(value => value + 1);
  };
  useImperativeHandle(ref, () => ({ reset }));

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setFailed(false);
    callbacks.current.onExpire?.();
    solveCaptcha(action, { signal: controller.signal }).then(token => {
      if (current !== generation.current || controller.signal.aborted) return;
      if (!isCaptchaToken(token)) throw new Error('Verification unavailable');
      expiry = setTimeout(() => {
        if (current === generation.current) reset();
      }, CAPTCHA_TOKEN_MAX_AGE_MS);
      callbacks.current.onToken(token);
    }).catch(error => {
      if (current !== generation.current || controller.signal.aborted) return;
      callbacks.current.onExpire?.();
      if (error?.code === 'timeout') (callbacks.current.onTimeout || callbacks.current.onError)?.();
      else callbacks.current.onError?.();
      setFailed(true);
    });
    return () => {
      generation.current++;
      clearTimeout(expiry);
      controller.abort();
    };
  }, [action, attempt]);

  if (!failed) return null;
  return <div className={cn('flex items-center justify-between gap-3', className)}>
    <p role="status" aria-live="polite" className="text-xs text-destructive">{uiI18n.t('captcha.unavailable')}</p>
    <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={disabled} className="shrink-0 gap-1.5">
      <RefreshCw className="h-4 w-4" aria-hidden="true" />{uiI18n.t('captcha.refresh')}
    </Button>
  </div>;
});
