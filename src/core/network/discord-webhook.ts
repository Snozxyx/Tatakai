import { TATAKAI_API_URL } from '@/lib/api/api-client';

/**
 * Discord Webhook Service
 *
 * Sends notifications to Discord channels via webhook URLs stored in
 * server-side env vars.  The frontend never sees the webhook URLs —
 * all calls are routed through a Supabase Edge Function or the
 * TatakaiAPI proxy.
 *
 * Channels:
 *  1. User Created  — fires when a new account is created
 *  2. Error Logs    — fires on unhandled client errors (throttled + deduped)
 *  3. Comments      — fires when a new comment is posted
 *  4. Review popup / Suggestions — fires on feedback
 */

// The backend exposes the forwarder at `${API}/api/v3/webhooks/discord`.
// TATAKAI_API_URL is already the resolved `/api/v3` base (a relative `/api/v3`
// in dev, which the Vite proxy forwards; the absolute origin in prod), so the
// webhook base is simply that. (Older builds mangled this into a legacy
// `/api/v2/anime` path that no route ever served — hence webhooks silently 404'd.)
function resolveWebhookBase(url: string): string {
  const trimmed = (url || '').replace(/\/+$/, '');
  if (!trimmed) return '/api/v3';
  return trimmed;
}

const TATAKAI_WEBHOOK_BASE = resolveWebhookBase(TATAKAI_API_URL);

// ── Types ───────────────────────────────────────────────────────────

export type WebhookChannel = 'user_created' | 'error_logs' | 'comment' | 'review_popup';

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number; // decimal colour
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string; // ISO 8601
  thumbnail?: { url: string };
}

interface WebhookPayload {
  channel: WebhookChannel;
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

// ── Colours (decimal) ───────────────────────────────────────────────
const COLORS = {
  success: 0x22c55e, // green-500
  error: 0xef4444,   // red-500
  info: 0x6366f1,    // indigo-500 (brand)
  warning: 0xf59e0b, // amber-500
} as const;

// ── Core sender ─────────────────────────────────────────────────────

async function sendToDiscord(payload: WebhookPayload): Promise<void> {
  try {
    // Route through TatakaiAPI which holds the actual webhook URLs
    const res = await fetch(`${TATAKAI_WEBHOOK_BASE}/webhooks/discord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      if (res.status === 404) {
        if (!import.meta.env.PROD) {
          console.warn('[Discord Webhook] Endpoint reachable but webhook env is not configured for this channel.');
        }
        return;
      }
      // 429 = backend is rate-limiting us — back off silently, never retry-loop.
      if (res.status === 429) {
        if (!import.meta.env.PROD) {
          console.warn('[Discord Webhook] Rate limited (429), dropping payload.');
        }
        return;
      }
      if (!import.meta.env.PROD) {
        console.warn(`[Discord Webhook] Failed (${res.status}):`, await res.text().catch(() => ''));
      }
    }
  } catch (err) {
    // Never let webhook errors break the app
    if (!import.meta.env.PROD) {
      console.warn('[Discord Webhook] Send failed:', err);
    }
  }
}

// ── Shared client context (makes every webhook more detailed) ───────

interface ClientContext {
  pageUrl: string;
  route: string;
  userAgent: string;
  browser: string;
  os: string;
  viewport: string;
  language: string;
  appVersion: string;
  env: string;
}

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return 'Chrome';
  if (/firefox\//i.test(ua)) return 'Firefox';
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return 'Safari';
  if (/capacitor/i.test(ua)) return 'Capacitor WebView';
  return 'Unknown';
}

function detectOS(ua: string): string {
  if (/windows nt 10/i.test(ua)) return 'Windows 10/11';
  if (/windows/i.test(ua)) return 'Windows';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/mac os/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}

function getClientContext(): ClientContext {
  const pageUrl = typeof window !== 'undefined' ? window.location.href : 'N/A';
  let route = 'N/A';
  try {
    route = typeof window !== 'undefined' ? window.location.pathname + window.location.search : 'N/A';
    if (route.length > 200) route = route.slice(0, 200);
  } catch { /* ignore */ }
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A';
  const viewport =
    typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A';
  const language = typeof navigator !== 'undefined' ? navigator.language || 'N/A' : 'N/A';
  return {
    pageUrl: pageUrl.slice(0, 400),
    route,
    userAgent: userAgent.slice(0, 400),
    browser: detectBrowser(userAgent),
    os: detectOS(userAgent),
    viewport,
    language,
    appVersion: '6.0.1',
    env: import.meta.env.PROD ? 'prod' : 'dev',
  };
}

/** Discord field values cap at 1024 chars — truncate safely. */
function field(value: string | undefined | null, max = 900): string {
  const v = (value ?? '').toString().trim() || 'N/A';
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}

// ── Error throttle + dedup ──────────────────────────────────────────
// Goal: at most ONE error webhook per user every 5 minutes, and never send
// the same error twice within the dedup window. Suppressed occurrences are
// counted and reported on the next allowed send ("x3 in last 5 min").

const ERROR_THROTTLE_MS = 5 * 60 * 1000;
const ERROR_DEDUP_MS = 60 * 60 * 1000;
const ERROR_STORE_PREFIX = 'tatakai:discord:error:';
const MAX_STORED_SIGNATURES = 100;

const IGNORED_ERROR_PATTERNS: RegExp[] = [
  /resizeobserver loop/i,
  /intersectionobserver/i,
  /script error\.?$/i,
  /^non-error promise rejection/i,
  /loading chunk [\w-]+ failed/i,
  /dynamically imported module/i,
  /failed to load resource: net::err_/i,
  /third-party cookie/i,
  /favicon\.ico/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /^cancelled$/i,
  /^aborted$/i,
  /user denied/i,
  /notallowederror.*play\(\)/i,
  /the play\(\) request was interrupted/i,
];

function storageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch { /* private mode — ignore */ }
}

/** In-memory fallback so throttling still works when localStorage is blocked. */
const memStore = new Map<string, string>();

function storeGet(key: string): string | null {
  return storageGet(key) ?? memStore.get(key) ?? null;
}

function storeSet(key: string, value: string): void {
  memStore.set(key, value);
  storageSet(key, value);
}

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

function normalizeMessage(message: string): string {
  return (message || 'unknown error')
    .replace(/\s+/g, ' ')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .trim()
    .toLowerCase()
    .slice(0, 220);
}

function firstStackLine(stack?: string): string {
  if (!stack) return '';
  const lines = stack.split('\n').map((l) => l.trim()).filter(Boolean);
  // Skip the "Error: message" head line — take the first `at …` frame.
  const frame = lines.find((l) => /^at\s/.test(l)) || lines[1] || lines[0] || '';
  return frame
    .replace(/https?:\/\/[^\s)]+/g, '<url>')
    .replace(/:\d+:\d+/g, '')
    .replace(/\b\d{3,}\b/g, '<n>')
    .slice(0, 220);
}

function getErrorSignature(input: { message: string; stack?: string; url?: string }): string {
  let pathname = '';
  try {
    pathname = input.url ? new URL(input.url, 'http://x').pathname : '';
  } catch {
    pathname = (input.url || '').slice(0, 120);
  }
  const normalized = normalizeMessage(input.message);
  const frame = firstStackLine(input.stack).toLowerCase();
  return hashString(`${normalized}|${pathname}|${frame}`);
}

function isIgnorableError(message: string): boolean {
  const m = (message || '').trim();
  if (!m || m.length < 3) return true;
  return IGNORED_ERROR_PATTERNS.some((re) => re.test(m));
}

interface ErrorThrottleState {
  lastSentAt: number;
  sigs: Record<string, number>;
  pending: Record<string, number>;
}

function loadThrottleState(scopeKey: string): ErrorThrottleState {
  try {
    const raw = storeGet(ERROR_STORE_PREFIX + scopeKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ErrorThrottleState>;
      if (typeof parsed.lastSentAt === 'number') {
        return {
          lastSentAt: parsed.lastSentAt,
          sigs: parsed.sigs && typeof parsed.sigs === 'object' ? parsed.sigs : {},
          pending: parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : {},
        };
      }
    }
  } catch { /* corrupt — reset */ }
  return { lastSentAt: 0, sigs: {}, pending: {} };
}

function saveThrottleState(scopeKey: string, state: ErrorThrottleState): void {
  try {
    // Cap stored signatures so the entry can't grow unbounded.
    const entries = Object.entries(state.sigs).sort((a, b) => b[1] - a[1]);
    if (entries.length > MAX_STORED_SIGNATURES) {
      state.sigs = Object.fromEntries(entries.slice(0, MAX_STORED_SIGNATURES));
    }
    storeSet(ERROR_STORE_PREFIX + scopeKey, JSON.stringify(state));
  } catch { /* ignore */ }
}

function pruneState(state: ErrorThrottleState, now: number): void {
  for (const [sig, ts] of Object.entries(state.sigs)) {
    if (now - ts > ERROR_DEDUP_MS) {
      delete state.sigs[sig];
      delete state.pending[sig];
    }
  }
}

/**
 * Returns `{ allowed, suppressedCount }`. Updates + persists throttle state.
 * `scopeKey` is per-user so the "5 min per user" rule is enforced per account
 * (anonymous browsers share the `anon` bucket on that device).
 */
function checkErrorThrottle(signature: string, scopeKey: string): { allowed: boolean; suppressedCount: number } {
  const now = Date.now();
  const state = loadThrottleState(scopeKey);
  pruneState(state, now);

  // 1. Duplicate? Same signature already reported within the dedup window.
  const lastSeen = state.sigs[signature] || 0;
  if (lastSeen && now - lastSeen < ERROR_DEDUP_MS) {
    state.pending[signature] = (state.pending[signature] || 0) + 1;
    saveThrottleState(scopeKey, state);
    return { allowed: false, suppressedCount: 0 };
  }

  // 2. Throttle? Any error webhook sent for this user in the last 5 minutes.
  if (now - state.lastSentAt < ERROR_THROTTLE_MS) {
    state.pending[signature] = (state.pending[signature] || 0) + 1;
    saveThrottleState(scopeKey, state);
    return { allowed: false, suppressedCount: 0 };
  }

  // Allowed — collect suppressed duplicates to report alongside.
  const suppressedCount = Object.values(state.pending).reduce((a, b) => a + b, 0);
  state.lastSentAt = now;
  state.sigs[signature] = now;
  state.pending = {};
  saveThrottleState(scopeKey, state);
  return { allowed: true, suppressedCount };
}

// ── Public helpers ──────────────────────────────────────────────────

/**
 * Notify when a new user signs up.
 */
export function notifyUserCreated(user: {
  email?: string;
  displayName?: string;
  provider?: string;
  userId?: string;
}) {
  const ctx = getClientContext();
  const embed: DiscordEmbed = {
    title: '🎉 New User Signed Up',
    description: `**${field(user.displayName || user.email?.split('@')[0] || 'New member', 120)}** just joined Tatakai.`,
    color: COLORS.success,
    fields: [
      { name: '👤 Display Name', value: field(user.displayName || 'N/A', 120), inline: true },
      { name: '✉️ Email', value: field(maskEmail(user.email || ''), 120), inline: true },
      { name: '🔑 Provider', value: field(user.provider || 'email', 60), inline: true },
      ...(user.userId ? [{ name: '🆔 User ID', value: field(user.userId, 120), inline: true }] : []),
      { name: '🌐 Page', value: field(ctx.pageUrl, 200), inline: false },
      { name: '💻 Client', value: field(`${ctx.browser} · ${ctx.os} · ${ctx.viewport}`, 160), inline: true },
      { name: '🌍 Locale / Env', value: field(`${ctx.language} · ${ctx.env} · v${ctx.appVersion}`, 160), inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Tatakai Auth' },
  };

  void sendToDiscord({
    channel: 'user_created',
    embeds: [embed],
    username: 'Tatakai Auth',
  });
}

export interface ErrorReport {
  message: string;
  stack?: string;
  url?: string;
  userId?: string;
  context?: string;
  /** Stable id from errorLogger (err_xxx) — shown so Discord ↔ DB can be joined. */
  errorId?: string;
  userAgent?: string;
  severity?: 'error' | 'warning' | 'fatal';
}

/**
 * Send an error report.
 *
 * Rate limiting (client-side, per user):
 * - max 1 error webhook per user every 5 minutes
 * - identical errors (same message + route + stack frame) are sent at most
 *   once per hour — repeats are counted and reported on the next send
 * - known-benign browser noise is dropped outright
 *
 * @returns true when the report was forwarded, false when throttled/deduped.
 */
export function notifyError(error: ErrorReport): boolean {
  try {
    const message = (error.message || 'Unknown error').trim();
    if (isIgnorableError(message)) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

    const url = error.url || (typeof window !== 'undefined' ? window.location.href : undefined);
    const signature = getErrorSignature({ message, stack: error.stack, url });
    const scopeKey = `scope:${(error.userId || 'anon').slice(0, 64)}`;

    const { allowed, suppressedCount } = checkErrorThrottle(signature, scopeKey);
    if (!allowed) return false;

    const ctx = getClientContext();
    const severityEmoji = error.severity === 'fatal' ? '💥' : error.severity === 'warning' ? '⚠️' : '🔴';
    const stackPreview = (error.stack || '')
      .split('\n')
      .slice(0, 6)
      .join('\n')
      .slice(0, 900);

    const embed: DiscordEmbed = {
      title: `${severityEmoji} Client Error — ${field(normalizeMessage(message).slice(0, 80) || 'unknown', 80)}`,
      description: `\`\`\`\n${message.slice(0, 1500)}\n\`\`\``,
      color: COLORS.error,
      fields: [
        ...(error.errorId ? [{ name: '🆔 Error ID', value: field(error.errorId, 120), inline: true }] : []),
        { name: '🔖 Signature', value: field(`\`${signature}\``, 60), inline: true },
        ...(suppressedCount > 0
          ? [{ name: '🔁 Suppressed repeats', value: field(`+${suppressedCount} occurrence(s) throttled in window`, 160), inline: true }]
          : []),
        { name: '🔗 Route', value: field(url ? (() => { try { const u = new URL(url); return u.pathname + u.search; } catch { return url; } })() : ctx.route, 300), inline: false },
        { name: '🌐 Page', value: field(url || ctx.pageUrl, 300), inline: false },
        ...(error.userId ? [{ name: '👤 User', value: field(`\`${error.userId}\``, 160), inline: true }] : [{ name: '👤 User', value: 'anonymous', inline: true }]),
        { name: '💻 Client', value: field(`${ctx.browser} · ${ctx.os} · ${ctx.viewport}`, 200), inline: true },
        { name: '🌍 Locale / Env', value: field(`${ctx.language} · ${ctx.env} · v${ctx.appVersion}`, 200), inline: true },
        ...(stackPreview ? [{ name: '📚 Stack (top)', value: `\`\`\`\n${stackPreview}\n\`\`\``, inline: false }] : []),
        ...(error.context ? [{ name: '🧩 Context', value: `\`\`\`json\n${error.context.slice(0, 800)}\n\`\`\``, inline: false }] : []),
        { name: '🧾 User-Agent', value: field(error.userAgent || ctx.userAgent, 300), inline: false },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `Tatakai Error Logger · ${error.severity || 'error'} · 5-min throttle / 1h dedup` },
    };

    void sendToDiscord({
      channel: 'error_logs',
      embeds: [embed],
      username: 'Tatakai Errors',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Notify when a new comment is posted.
 */
export function notifyComment(comment: {
  userName?: string;
  userId?: string;
  animeName?: string;
  entityType?: string;
  entityId?: string;
  episodeId?: string;
  content: string;
  isSpoiler?: boolean;
  parentId?: string;
  attachmentCount?: number;
}) {
  const ctx = getClientContext();
  const preview = comment.content.slice(0, 900);
  const entity = [comment.entityType, comment.entityId].filter(Boolean).join(':')
    || comment.animeName
    || 'N/A';
  const embed: DiscordEmbed = {
    title: '💬 New Comment',
    color: COLORS.info,
    description: comment.isSpoiler ? `||${preview}||` : preview,
    fields: [
      { name: '👤 User', value: field(comment.userName || 'Anonymous', 160), inline: true },
      ...(comment.userId ? [{ name: '🆔 User ID', value: field(`\`${comment.userId}\``, 160), inline: true }] : []),
      { name: '📺 Entity', value: field(entity, 200), inline: true },
      ...(comment.animeName && entity !== comment.animeName
        ? [{ name: '🏷️ Title', value: field(comment.animeName, 200), inline: true }]
        : []),
      ...(comment.episodeId ? [{ name: '🎞️ Episode', value: field(comment.episodeId, 80), inline: true }] : []),
      { name: '🚩 Flags', value: field(`${comment.isSpoiler ? 'spoiler' : 'no-spoiler'} · ${comment.parentId ? `reply→${comment.parentId.slice(0, 8)}` : 'top-level'} · ${comment.attachmentCount || 0} attachment(s) · ${comment.content.length} chars`, 200), inline: false },
      { name: '🌐 Page', value: field(ctx.pageUrl, 300), inline: false },
      { name: '💻 Client', value: field(`${ctx.browser} · ${ctx.os} · ${ctx.env}`, 160), inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Tatakai Comments' },
  };

  void sendToDiscord({
    channel: 'comment',
    embeds: [embed],
    username: 'Tatakai Comments',
  });
}

/**
 * Notify when a user submits the ReviewPopup feedback.
 */
export function notifyReviewPopup(review: {
  userId?: string;
  userName?: string;
  animeId?: string;
  animeName?: string;
  rating: number;
  feedback?: string;
}) {
  const ctx = getClientContext();
  const stars = '★'.repeat(Math.max(0, Math.min(5, review.rating))) + '☆'.repeat(5 - Math.max(0, Math.min(5, review.rating)));
  const embed: DiscordEmbed = {
    title: '📝 Review Popup Submitted',
    description: `${stars}  **${review.rating}/5**`,
    color: COLORS.warning,
    fields: [
      { name: '⭐ Rating', value: field(`${review.rating}/5 ${stars}`, 60), inline: true },
      ...(review.userName ? [{ name: '👤 User', value: field(review.userName, 160), inline: true }] : []),
      ...(review.userId ? [{ name: '🆔 User ID', value: field(`\`${review.userId}\``, 160), inline: true }] : []),
      ...(review.animeName ? [{ name: '📺 Anime', value: field(review.animeName, 200), inline: true }] : []),
      ...(review.animeId ? [{ name: '🆔 Anime ID', value: field(review.animeId, 120), inline: true }] : []),
      {
        name: '💭 Feedback',
        value: (review.feedback?.trim() || 'No additional feedback').slice(0, 900),
        inline: false,
      },
      { name: '🌐 Page', value: field(ctx.pageUrl, 300), inline: false },
      { name: '💻 Client', value: field(`${ctx.browser} · ${ctx.os} · ${ctx.viewport} · ${ctx.env} v${ctx.appVersion}`, 220), inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Tatakai Review Popup' },
  };

  void sendToDiscord({
    channel: 'review_popup',
    embeds: [embed],
    username: 'Tatakai Reviews',
  });
}

/**
 * Notify when a user submits a suggestion / bug report from the Suggestions
 * page. Routed to the same feedback channel as the review popup.
 */
export function notifySuggestion(suggestion: {
  title: string;
  description: string;
  category: string;
  priority?: string;
  userId?: string;
  userName?: string;
  imageUrl?: string;
}) {
  const ctx = getClientContext();
  const categoryEmoji: Record<string, string> = {
    feature: '✨',
    bug: '🐛',
    improvement: '⚡',
    content: '📚',
    feedback: '💬',
    other: '💡',
  };
  const embed: DiscordEmbed = {
    title: `${categoryEmoji[suggestion.category] || '💡'} New ${suggestion.category} suggestion`,
    description: `**${suggestion.title.slice(0, 240)}**\n${suggestion.description.slice(0, 1500)}`,
    color: COLORS.info,
    fields: [
      { name: '📂 Category', value: field(suggestion.category, 80), inline: true },
      ...(suggestion.priority ? [{ name: '🎯 Priority', value: field(suggestion.priority, 80), inline: true }] : []),
      ...(suggestion.userName ? [{ name: '👤 User', value: field(suggestion.userName, 160), inline: true }] : []),
      ...(suggestion.userId ? [{ name: '🆔 User ID', value: field(`\`${suggestion.userId}\``, 160), inline: true }] : []),
      { name: '🌐 Page', value: field(ctx.pageUrl, 300), inline: false },
      { name: '💻 Client', value: field(`${ctx.browser} · ${ctx.os} · ${ctx.env} v${ctx.appVersion}`, 220), inline: true },
      { name: '🌍 Locale', value: field(ctx.language, 60), inline: true },
    ],
    ...(suggestion.imageUrl ? { thumbnail: { url: suggestion.imageUrl } } : {}),
    timestamp: new Date().toISOString(),
    footer: { text: 'Tatakai Suggestions' },
  };

  void sendToDiscord({
    channel: 'review_popup',
    embeds: [embed],
    username: 'Tatakai Suggestions',
  });
}

// ── Utilities ───────────────────────────────────────────────────────

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  const masked = local.length <= 2
    ? '*'.repeat(local.length)
    : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
  return `${masked}@${domain}`;
}
