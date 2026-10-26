// Tatakai — push notification dispatch (Supabase Edge Function)
//
// SECURITY (audit finding SRV-1). This function runs with the SERVICE ROLE key,
// can read every row in user_notification_tokens and can address every user at
// once. Before the fix it:
//
//   * performed NO authorization at all — any signed-in user could POST
//     { target: 'all', title, body } and push arbitrary text (phishing, abuse)
//     to the entire user base;
//   * answered with `Access-Control-Allow-Origin: *`;
//   * returned raw `error.message` (Postgres/Deno internals) to the caller.
//
// Now it requires a caller JWT, resolves that caller's profile server-side and
// only allows staff (is_admin / role = 'admin' / moderator) to broadcast, with a
// per-caller rate limit and no internal error detail in responses.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// Allowed browser origins for this admin-only endpoint. Keep in sync with the
// app's production origins; add operator-specific origins via ALLOWED_ORIGINS.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://tatakai.me",
  "https://www.tatakai.me",
  "http://localhost:8090",
  "http://127.0.0.1:8090",
];

function allowedOrigins(): string[] {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

interface NotificationPayload {
  title: string;
  body: string;
  target: "all" | "users" | "room";
  userId?: string;
  data?: Record<string, string>;
}

const MAX_TITLE = 200;
const MAX_BODY = 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 10;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) {
    rateBuckets.set(userId, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX_PER_WINDOW;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const cors = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      // Never describe the misconfiguration to the caller.
      console.error("send-notification: service credentials are not configured");
      return json({ error: "unavailable" }, 503, cors);
    }

    // ── 1. Authenticate the caller ───────────────────────────────────────────
    const authorization = req.headers.get("authorization") ?? "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return json({ error: "unauthorized" }, 401, cors);
    }

    // User-scoped client: validates the JWT against GoTrue, no service role.
    const userClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ error: "unauthorized" }, 401, cors);
    }
    const callerId = userData.user.id;

    // ── 2. Authorize: staff only ─────────────────────────────────────────────
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("is_admin, is_moderator, role")
      .eq("user_id", callerId)
      .maybeSingle();
    if (profileError) {
      console.error("send-notification: profile lookup failed", profileError.message);
      return json({ error: "unavailable" }, 503, cors);
    }
    const isStaff = profile?.is_admin === true || profile?.is_moderator === true ||
      ["admin", "moderator"].includes(profile?.role ?? "");
    if (!isStaff) {
      console.warn(`send-notification: caller ${callerId} is not staff — denied`);
      return json({ error: "forbidden" }, 403, cors);
    }

    if (rateLimited(callerId)) {
      return json({ error: "rate_limited" }, 429, { ...cors, "Retry-After": "60" });
    }

    // ── 3. Validate the payload ──────────────────────────────────────────────
    const payload = (await req.json()) as NotificationPayload;
    const title = String(payload?.title ?? "").trim();
    const body = String(payload?.body ?? "").trim();
    const target = payload?.target;
    const userId = payload?.userId;

    if (!title || title.length > MAX_TITLE || !body || body.length > MAX_BODY) {
      return json({ error: "invalid_payload" }, 400, cors);
    }
    if (!["all", "users", "room"].includes(String(target))) {
      return json({ error: "invalid_target" }, 400, cors);
    }
    if (target !== "all" && !userId) {
      return json({ error: "invalid_target" }, 400, cors);
    }

    // ── 4. Resolve recipients ────────────────────────────────────────────────
    let query = adminClient.from("user_notification_tokens").select("token");
    if (target === "users" && userId) {
      query = query.eq("user_id", userId);
    }

    const { data: tokens, error: tokenError } = await query;
    if (tokenError) {
      console.error("send-notification: token query failed", tokenError.message);
      return json({ error: "unavailable" }, 503, cors);
    }
    const fcmTokens = [...new Set((tokens ?? []).map((t: { token: string }) => t.token).filter(Boolean))];

    // NOTE: delivery is not implemented here (no FCM service account is
    // configured). The audit trail below is intentional: broadcast actions must
    // be attributable to the staff member who triggered them.
    const { error: auditError } = await adminClient.from("admin_logs").insert({
      user_id: callerId,
      action: "send_notification",
      entity_type: "notification",
      entity_id: userId ?? null,
      details: { title, target, recipientCount: fcmTokens.length, userId: userId ?? null },
    });
    if (auditError) {
      console.error("send-notification: audit write failed", auditError.message);
      return json({ error: "unavailable" }, 503, cors);
    }

    if (fcmTokens.length === 0) {
      return json({ success: true, message: "No devices found to notify" }, 200, cors);
    }

    return json({ success: true, count: fcmTokens.length }, 200, cors);
  } catch (error) {
    // Log internally; never return the raw message (it can contain SQL text).
    console.error("send-notification: unhandled error", error instanceof Error ? error.message : String(error));
    return json({ error: "internal_error" }, 500, cors);
  }
});
