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
      "timeout-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "compact" | "flexible" | "invisible";
      retry?: "auto" | "never";
      "retry-interval"?: number;
      "refresh-expired"?: "auto" | "manual" | "never";
      "refresh-timeout"?: "auto" | "manual" | "never";
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
      // The script tag may already be in the DOM but still loading (common on
      // iOS Safari after a content-blocker hiccup). Wait for it instead of
      // resolving early, and allow a later retry by clearing the cache on error.
      if (window.turnstile) {
        resolve();
        return;
      }
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        scriptPromise = null;
        reject(new Error("turnstile script failed"));
      };
      const cleanup = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
      };
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile script failed"));
    };
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
  onTimeout?: () => void;
  action?: string;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken, onExpire, onError, onTimeout, action, className }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    // Keep the latest callbacks without forcing a re-render/re-mount of the widget.
    const cbRef = useRef({ onToken, onExpire, onError, onTimeout });
    cbRef.current = { onToken, onExpire, onError, onTimeout };

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
            // Flexible width prevents clipping/overflow on narrow iPhone
            // viewports (390px). Auto-retry + auto-refresh keeps an expired or
            // failed challenge (e.g. iCloud Private Relay / content-blocker
            // hiccup) from bricking the form with a dead "Verification failed".
            size: "flexible",
            retry: "auto",
            "retry-interval": 1500,
            "refresh-expired": "auto",
            "refresh-timeout": "auto",
            action,
            callback: (token) => cbRef.current.onToken(token),
            "expired-callback": () => cbRef.current.onExpire?.(),
            "error-callback": () => cbRef.current.onError?.(),
            "timeout-callback": () => cbRef.current.onTimeout?.() ?? cbRef.current.onError?.(),
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
    // Width-constrained wrapper: the flexible widget fills this box and never
    // overflows a 320–390px iPhone viewport; min-height avoids layout shift.
    return <div ref={containerRef} className={className} style={{ width: "100%", maxWidth: 320, minHeight: 65, overflow: "hidden" }} />;
  }
);
