export type DevtoolsTrapPayload = {
  success: boolean;
  message: string;
  detectedAt?: string;
  reason?: string;
};

export const DEVTOOLS_TRAP_PAYLOAD: DevtoolsTrapPayload = {
  success: false,
  message: "Unauthorized: Developer tools are not allowed to be open while using this application.",
};

export const DEVTOOLS_TRAP_STORAGE_KEY = "tatakai.devtools-trap-response";
export const DEVTOOLS_LOCK_STORAGE_KEY = "tatakai.devtools-trap-lock";
export const DEVTOOLS_LOCK_STORAGE_KEY_GLOBAL = "tatakai.devtools-trap-lock-global";
export const DEVTOOLS_LOCK_TTL_MS = 15 * 60 * 1000;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function isDevtoolsGuardBypassedHost(hostnameInput?: string): boolean {
  const hostnameRaw = String(
    hostnameInput ||
      (typeof window !== "undefined" ? window.location.hostname : "")
  )
    .trim()
    .toLowerCase();

  if (!hostnameRaw) return false;
  if (hostnameRaw === "localhost" || hostnameRaw === "0.0.0.0" || hostnameRaw === "::1") {
    return true;
  }
  if (hostnameRaw.endsWith(".local")) return true;
  if (isPrivateIpv4(hostnameRaw)) return true;
  return false;
}

type DevtoolsLockState = {
  lockedAt: number;
  expiresAt: number;
  reason?: string;
};

export function readDevtoolsTrapPayload(): DevtoolsTrapPayload | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(DEVTOOLS_TRAP_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DevtoolsTrapPayload;
    if (!parsed || typeof parsed.message !== "string") return null;

    return {
      success: Boolean(parsed.success),
      message: parsed.message,
      detectedAt: typeof parsed.detectedAt === "string" ? parsed.detectedAt : undefined,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return null;
  }
}

export function readDevtoolsLockState(): DevtoolsLockState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw =
      window.sessionStorage.getItem(DEVTOOLS_LOCK_STORAGE_KEY) ||
      window.localStorage.getItem(DEVTOOLS_LOCK_STORAGE_KEY_GLOBAL);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DevtoolsLockState;
    if (!parsed || !Number.isFinite(parsed.expiresAt) || !Number.isFinite(parsed.lockedAt)) {
      return null;
    }

    return {
      lockedAt: parsed.lockedAt,
      expiresAt: parsed.expiresAt,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return null;
  }
}

export function isDevtoolsLockActive(now = Date.now()): boolean {
  const lock = readDevtoolsLockState();
  if (!lock) return false;
  if (lock.expiresAt <= now) {
    clearDevtoolsTrapState();
    return false;
  }
  return true;
}

export function persistDevtoolsTrapState(reason = "devtools-open"): DevtoolsTrapPayload {
  const payload: DevtoolsTrapPayload = {
    ...DEVTOOLS_TRAP_PAYLOAD,
    reason,
    detectedAt: new Date().toISOString(),
  };

  if (typeof window === "undefined") return payload;

  try {
    window.sessionStorage.setItem(DEVTOOLS_TRAP_STORAGE_KEY, JSON.stringify(payload, null, 2));
    const now = Date.now();
    const lock: DevtoolsLockState = {
      lockedAt: now,
      expiresAt: now + DEVTOOLS_LOCK_TTL_MS,
      reason,
    };
    window.sessionStorage.setItem(DEVTOOLS_LOCK_STORAGE_KEY, JSON.stringify(lock));
    window.localStorage.setItem(DEVTOOLS_LOCK_STORAGE_KEY_GLOBAL, JSON.stringify(lock));
  } catch {
    // Ignore storage write failures and still return payload.
  }

  return payload;
}

export function clearDevtoolsTrapState() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(DEVTOOLS_TRAP_STORAGE_KEY);
    window.sessionStorage.removeItem(DEVTOOLS_LOCK_STORAGE_KEY);
    window.localStorage.removeItem(DEVTOOLS_LOCK_STORAGE_KEY_GLOBAL);
  } catch {
    // Ignore cleanup errors.
  }
}

export function isLikelyDevtoolsOpenByViewport(threshold = 200): boolean {
  if (typeof window === "undefined") return false;

  const widthDiff = Math.abs(window.outerWidth - window.innerWidth);
  const heightDiff = Math.abs(window.outerHeight - window.innerHeight);

  return widthDiff > threshold || heightDiff > threshold;
}

export function isLikelyDevtoolsOpenByDebugger(thresholdMs = 160): boolean {
  if (typeof window === "undefined") return false;

  const startTime = performance.now();
  // eslint-disable-next-line no-debugger
  debugger;
  const elapsed = performance.now() - startTime;
  return elapsed > thresholdMs;
}

export function isLikelyDevtoolsOpen(): boolean {
  return isLikelyDevtoolsOpenByViewport() || isLikelyDevtoolsOpenByDebugger();
}
