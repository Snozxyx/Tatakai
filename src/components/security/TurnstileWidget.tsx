/**
 * Cloudflare Turnstile widget (explicit-render). Renders nothing when Turnstile
 * is disabled for this environment (no site key / desktop file://), so callers
 * can mount it unconditionally and gate on isTurnstileEnabled() elsewhere.
 *
 * Exposes an imperative reset() so a form can clear the challenge after a submit
 * or a verification failure.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  TURNSTILE_SITE_KEY,
  TURNSTILE_SCRIPT_SRC,
  isTurnstileEnabled,
} from "@/lib/security/turnstile";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      action?: string;
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile script failed")));
      if (window.turnstile) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileWidgetHandle {
  reset: () => void;
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  action?: string;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken, onExpire, onError, action, className }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    // Keep the latest callbacks without forcing a re-render/re-mount of the widget.
    const cbRef = useRef({ onToken, onExpire, onError });
    cbRef.current = { onToken, onExpire, onError };

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (window.turnstile && widgetIdRef.current) {
          try {
            window.turnstile.reset(widgetIdRef.current);
          } catch {
            /* ignore */
          }
        }
      },
    }));

    useEffect(() => {
      if (!isTurnstileEnabled()) return;
      let cancelled = false;

      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return;
          if (widgetIdRef.current) return; // already rendered
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: TURNSTILE_SITE_KEY,
            theme: "auto",
            action,
            callback: (token) => cbRef.current.onToken(token),
            "expired-callback": () => cbRef.current.onExpire?.(),
            "error-callback": () => cbRef.current.onError?.(),
          });
        })
        .catch(() => {
          // Script blocked/offline: treat as an error so callers can fall back.
          if (!cancelled) cbRef.current.onError?.();
        });

      return () => {
        cancelled = true;
        if (window.turnstile && widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [action]);

    if (!isTurnstileEnabled()) return null;
    return <div ref={containerRef} className={className} />;
  }
);
