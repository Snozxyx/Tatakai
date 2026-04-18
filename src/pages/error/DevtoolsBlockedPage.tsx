import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Shield, Terminal, AlertTriangle } from 'lucide-react';
import {
  clearDevtoolsTrapState,
  DEVTOOLS_TRAP_PAYLOAD,
  isDevtoolsGuardBypassedHost,
  isLikelyDevtoolsOpen,
  persistDevtoolsTrapState,
  readDevtoolsTrapPayload,
  type DevtoolsTrapPayload,
} from '@/lib/devtoolsTrap';

const FALLBACK_TRAP_PAYLOAD: DevtoolsTrapPayload = DEVTOOLS_TRAP_PAYLOAD;

function resolveTrapPayload(locationState: unknown): DevtoolsTrapPayload {
  const statePayload = (locationState as { trapPayload?: DevtoolsTrapPayload } | null)?.trapPayload;
  if (statePayload && typeof statePayload.message === 'string') {
    return {
      success: Boolean(statePayload.success),
      message: statePayload.message,
      reason: statePayload.reason,
      detectedAt: statePayload.detectedAt,
    };
  }

  const storedPayload = readDevtoolsTrapPayload();
  if (storedPayload && typeof storedPayload.message === 'string') {
    return {
      success: Boolean(storedPayload.success),
      message: storedPayload.message,
      reason: storedPayload.reason,
      detectedAt: storedPayload.detectedAt,
    };
  }

  return FALLBACK_TRAP_PAYLOAD;
}

function formatTrapMessage(payload: DevtoolsTrapPayload) {
  const out = {
    success: payload.success,
    message: payload.message,
    reason: payload.reason || 'unknown',
    detectedAt: payload.detectedAt || 'unknown',
  };

  return JSON.stringify(out, null, 2);
}

function buildBlockedUrl() {
  return `/devtools-blocked?locked=${Date.now()}`;
}

export default function DevtoolsBlockedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const trapPayload = useMemo(() => resolveTrapPayload(location.state), [location.state]);
  const trapPayloadJson = useMemo(() => formatTrapMessage(trapPayload), [trapPayload]);
  const [devtoolsStillOpen, setDevtoolsStillOpen] = useState(true);
  const closedStableChecksRef = useRef(0);
  const releasedRef = useRef(false);

  const runSecurityRecheck = useCallback(() => {
    if (releasedRef.current) return false;

    if (isDevtoolsGuardBypassedHost()) {
      clearDevtoolsTrapState();
      releasedRef.current = true;
      navigate('/', { replace: true });
      return false;
    }

    const openSignal = isLikelyDevtoolsOpen();

    if (openSignal) {
      persistDevtoolsTrapState('blocked-page-recheck-open');
      closedStableChecksRef.current = 0;
      setDevtoolsStillOpen(true);
      return true;
    }

    closedStableChecksRef.current += 1;
    setDevtoolsStillOpen(false);

    // Require consecutive closed checks to avoid false unlocks from transient detector misses.
    if (closedStableChecksRef.current < 3) {
      return true;
    }

    clearDevtoolsTrapState();
    releasedRef.current = true;
    navigate('/', { replace: true });
    return false;
  }, [navigate]);

  useEffect(() => {
    runSecurityRecheck();

    const interval = setInterval(() => {
      const stillBlocked = runSecurityRecheck();
      if (stillBlocked && window.location.pathname !== '/devtools-blocked') {
        window.location.replace(buildBlockedUrl());
      }
    }, 2000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        runSecurityRecheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [runSecurityRecheck]);

  useEffect(() => {
    const preventInteraction = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const withStopImmediate = event as Event & { stopImmediatePropagation?: () => void };
      if (typeof withStopImmediate.stopImmediatePropagation === 'function') {
        withStopImmediate.stopImmediatePropagation();
      }
      return false;
    };

    const events = [
      'click',
      'dblclick',
      'mousedown',
      'mouseup',
      'mousemove',
      'pointerdown',
      'pointerup',
      'touchstart',
      'touchend',
      'wheel',
      'contextmenu',
      'keydown',
      'keyup',
      'keypress',
      'submit',
    ] as const;

    const options: AddEventListenerOptions = { capture: true, passive: false };
    for (const eventName of events) {
      document.addEventListener(eventName, preventInteraction, options);
      window.addEventListener(eventName, preventInteraction, options);
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousTouchAction = document.body.style.touchAction;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'not-allowed';

    return () => {
      for (const eventName of events) {
        document.removeEventListener(eventName, preventInteraction, options);
        window.removeEventListener(eventName, preventInteraction, options);
      }

      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.touchAction = previousTouchAction;
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 overflow-hidden relative">
      {/* Background animated noise */}
      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900 via-[#050505] to-[#050505]" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iLjc1IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWx0ZXI9InVybCgjYSkiIG9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')] opacity-20" />

      <div className="relative z-10 max-w-lg w-full text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-red-500/20 blur-3xl scale-150" />
            <div className="relative bg-red-950/60 border border-red-800/50 rounded-full p-8 backdrop-blur-sm">
              <Terminal className="w-16 h-16 text-red-400" />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-red-500">
            <AlertTriangle className="w-5 h-5" />
            <span className="uppercase tracking-[0.3em] text-xs font-bold">Security Alert</span>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Developer Console<br />
            <span className="text-red-400">Not Allowed</span>
          </h1>
        </div>

        {/* Description */}
        <div className="bg-red-950/30 border border-red-900/40 rounded-2xl p-6 backdrop-blur-sm space-y-3 text-left">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-zinc-300 text-sm leading-relaxed">
              Tatakai has detected that developer tools are open. For security reasons,
              the application cannot run while the developer console is active.
            </p>
          </div>
          <div className="rounded-lg border border-red-900/40 bg-black/20 px-3 py-2 text-xs">
            <span className={devtoolsStillOpen ? 'text-red-300' : 'text-emerald-300'}>
              {devtoolsStillOpen ? 'Status: devtools still detected' : 'Status: safe to continue'}
            </span>
          </div>
          <div className="border-t border-red-900/40 pt-3">
            <p className="text-zinc-500 text-xs">
              Close the developer tools (F12 or Ctrl+Shift+I) and refresh the page to continue.
            </p>
          </div>
        </div>

        {/* Code block decoration */}
        <div className="bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4 text-left font-mono text-xs text-zinc-500 backdrop-blur-sm select-none space-y-2">
          <div>
            <span className="text-red-500">▶</span> <span className="text-zinc-400">Tatakai</span>
            <span className="text-zinc-600"> | </span>
            <span className="text-yellow-500/70">SECURITY</span>
            <span className="text-zinc-600"> :: </span>
            <span className="text-zinc-400">devtools.detected</span>
            <span className="text-zinc-600"> → </span>
            <span className="text-red-400">access.denied</span>
          </div>
          <pre className="whitespace-pre-wrap break-words text-red-300 leading-relaxed">{trapPayloadJson}</pre>
        </div>

        {/* Locked State Notice */}
        <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-5 py-4 text-sm text-red-200">
          Interaction is locked while developer tools are open. Close developer tools to continue.
          Access restores automatically after closure is detected.
        </div>
      </div>
    </div>
  );
}
