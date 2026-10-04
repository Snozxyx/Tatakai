/**
 * Cloudflare Turnstile — client helpers.
 *
 * Scope (Phase 4, "Auth + high-value forms"): the auth flow (Supabase verifies
 * the token natively via options.captchaToken) plus the suggestion and report
 * forms, which write straight to Supabase from the browser. For those forms the
 * client fetches a token, posts it to TatakaiAPI's /security/turnstile/verify
 * (the secret key stays server-side), and only inserts on { ok: true }. This is
 * defence-in-depth on top of the DB automod + rate-limit backstop
 * (20260925000600_ugc_guard.sql), not a hard gate.
 *
 * Degrades gracefully:
 *  - No VITE_TURNSTILE_SITE_KEY   → disabled; callers proceed without a token.
 *  - Desktop file:// (null origin) → disabled; the widget can't render there and
 *    the siteverify would reject a null hostname, so we skip it entirely.
 *  - TatakaiAPI unreachable        → verify fails OPEN (the server itself fails
 *    open on a Cloudflare outage; the DB backstop still guards the write).
 */

export const TURNSTILE_SITE_KEY = String(
  import.meta.env.VITE_TURNSTILE_SITE_KEY || ""
).trim();

/** The Turnstile script URL (explicit-render mode). */
export const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Whether Turnstile should be presented/enforced in this environment. False when
 * no site key is configured or we're running from a file:// origin (desktop
 * build), where the widget can't render and siteverify rejects the null host.
 */
export function isTurnstileEnabled(): boolean {
  if (!TURNSTILE_SITE_KEY) return false;
  if (typeof window !== "undefined" && window.location.protocol === "file:") return false;
  return true;
}

/**
 * Resolve the TatakaiAPI `/api/v3` base. Prefers VITE_BACKEND_ORIGIN, then the
 * origin of VITE_TATAKAI_API_URL, then the current page origin. We append the
 * fixed `/api/v3` segment ourselves rather than trusting VITE_TATAKAI_API_URL's
 * path (which varies between deployments) since the router is mounted there.
 */
function resolveApiV3Base(): string {
  const explicit = String(import.meta.env.VITE_BACKEND_ORIGIN || "").trim();
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit.replace(/\/+$/, "") + "/api/v3";
  }
  const apiUrl = String(import.meta.env.VITE_TATAKAI_API_URL || "").trim();
  try {
    if (apiUrl) return new URL(apiUrl).origin + "/api/v3";
  } catch {
    /* fall through */
  }
  // Capacitor's origin is the WebView host, not the backend — use production.
  const cap = (globalThis as any).Capacitor;
  const isNative = !!cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform();
  if (isNative) return "https://api.tatakai.me/api/v3";
  if (typeof window !== "undefined") return window.location.origin + "/api/v3";
  return "/api/v3";
}

/**
 * Verify a Turnstile token against TatakaiAPI. Returns true when the caller may
 * proceed with its write.
 *  - Disabled env → true (nothing to verify).
 *  - Enabled but no token → false (widget not solved).
 *  - API/network error → true (fail open; DB backstop still applies).
 */
export async function verifyTurnstileToken(token: string | null | undefined): Promise<boolean> {
  if (!isTurnstileEnabled()) return true;
  if (!token) return false;

  try {
    const res = await fetch(`${resolveApiV3Base()}/security/turnstile/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: { ok?: boolean } }
      | null;
    // Envelope: { success, data: { ok } }. Missing shape → allow (fail open).
    if (!json) return true;
    if (json.data && typeof json.data.ok === "boolean") return json.data.ok;
    return true;
  } catch {
    return true;
  }
}
