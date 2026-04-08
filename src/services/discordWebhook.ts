/**
 * Discord Webhook Service
 *
 * Sends notifications to Discord channels via webhook URLs stored in
 * server-side env vars.  The frontend never sees the webhook URLs —
 * all calls are routed through a Supabase Edge Function or the
 * TatakaiAPI proxy.
 *
 * Three channels:
 *  1. User Created  — fires when a new account is created
 *  2. Error Logs    — fires on unhandled client errors  
 *  3. Comments      — fires when a new comment is posted
 */

const RAW_TATAKAI_API_URL =
  import.meta.env.VITE_TATAKAI_API_URL || 'https://api.tatakai.me/api/v2/anime';

function normalizeWebhookBase(url: string): string {
  const trimmed = (url || '').replace(/\/+$/, '');
  if (!trimmed) return 'https://api.tatakai.me/api/v2/anime';
  if (/^https?:\/\/[^/]+$/i.test(trimmed)) return `${trimmed}/api/v2/anime`;
  if (/\/api\/v2\/anime$/i.test(trimmed)) return trimmed;
  if (/\/api\/v1$/i.test(trimmed)) return `${trimmed.replace(/\/api\/v1$/i, '')}/api/v2/anime`;
  if (/\/api\/v2$/i.test(trimmed)) return `${trimmed}/anime`;
  if (/\/api$/i.test(trimmed)) return `${trimmed}/v2/anime`;
  return trimmed;
}

function resolveWebhookBase(url: string): string {
  // In dev, always use same-origin so Vite proxy handles CORS.
  if (import.meta.env.DEV) {
    return '/api/v2/anime';
  }

  const normalized = normalizeWebhookBase(url);
  return normalized;
}

const TATAKAI_WEBHOOK_BASE = resolveWebhookBase(RAW_TATAKAI_API_URL);

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

// ── Public helpers ──────────────────────────────────────────────────

/**
 * Notify when a new user signs up.
 */
export function notifyUserCreated(user: {
  email?: string;
  displayName?: string;
  provider?: string;
}) {
  const embed: DiscordEmbed = {
    title: '🎉 New User Signed Up',
    color: COLORS.success,
    fields: [
      { name: 'Display Name', value: user.displayName || 'N/A', inline: true },
      { name: 'Email', value: maskEmail(user.email || ''), inline: true },
      { name: 'Provider', value: user.provider || 'email', inline: true },
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

/**
 * Send an error report.
 */
export function notifyError(error: {
  message: string;
  stack?: string;
  url?: string;
  userId?: string;
  context?: string;
}) {
  const embed: DiscordEmbed = {
    title: '🔴 Client Error',
    description: `\`\`\`\n${(error.message || 'Unknown error').slice(0, 1800)}\n\`\`\``,
    color: COLORS.error,
    fields: [
      ...(error.url ? [{ name: 'URL', value: error.url, inline: false }] : []),
      ...(error.userId ? [{ name: 'User', value: error.userId, inline: true }] : []),
      ...(error.context ? [{ name: 'Context', value: error.context, inline: true }] : []),
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Tatakai Error Logger' },
  };

  void sendToDiscord({
    channel: 'error_logs',
    embeds: [embed],
    username: 'Tatakai Errors',
  });
}

/**
 * Notify when a new comment is posted.
 */
export function notifyComment(comment: {
  userName?: string;
  animeName?: string;
  episodeId?: string;
  content: string;
  isSpoiler?: boolean;
}) {
  const embed: DiscordEmbed = {
    title: '💬 New Comment',
    color: COLORS.info,
    fields: [
      { name: 'User', value: comment.userName || 'Anonymous', inline: true },
      { name: 'Anime', value: comment.animeName || 'N/A', inline: true },
      ...(comment.episodeId ? [{ name: 'Episode', value: comment.episodeId, inline: true }] : []),
      {
        name: 'Content',
        value: comment.isSpoiler
          ? '||' + comment.content.slice(0, 900) + '||'
          : comment.content.slice(0, 900),
        inline: false,
      },
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
  animeId?: string;
  animeName?: string;
  rating: number;
  feedback?: string;
}) {
  const embed: DiscordEmbed = {
    title: '📝 Review Popup Submitted',
    color: COLORS.warning,
    fields: [
      { name: 'Rating', value: `${review.rating}/5`, inline: true },
      ...(review.userId ? [{ name: 'User ID', value: review.userId, inline: true }] : []),
      ...(review.animeName ? [{ name: 'Anime', value: review.animeName, inline: true }] : []),
      ...(review.animeId ? [{ name: 'Anime ID', value: review.animeId, inline: true }] : []),
      {
        name: 'Feedback',
        value: (review.feedback?.trim() || 'No additional feedback').slice(0, 900),
        inline: false,
      },
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

// ── Utilities ───────────────────────────────────────────────────────

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  const masked = local.length <= 2
    ? '*'.repeat(local.length)
    : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
  return `${masked}@${domain}`;
}
