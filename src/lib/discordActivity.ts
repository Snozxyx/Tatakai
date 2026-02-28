/**
 * Discord Activity SDK integration.
 *
 * When Tatakai is launched inside a Discord Activity (embedded in a voice channel),
 * this module initialises the Discord Embedded App SDK so the app renders correctly
 * inside the VC overlay.
 *
 * If the app is NOT running inside Discord, everything is a no-op.
 */

import { DiscordSDK, DiscordSDKMock } from '@discord/embedded-app-sdk';

// ── Client ID — must match the Application with Activities enabled ────
// In production this is baked in; override with VITE_DISCORD_CLIENT_ID env var.
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID ?? '1477016986889224364';

// ── State ─────────────────────────────────────────────────────────────
let discordSdk: DiscordSDK | null = null;
let isDiscordActivity = false;
let activityReady = false;

/**
 * Detect whether we are running inside a Discord Activity iframe.
 * Discord injects specific query params and the nested iframe has
 * `document.referrer` pointing to discord.com, plus the SDK sets
 * `window.__DISCORD_ACTIVITY__` when the client bootstraps.
 */
export function detectDiscordActivity(): boolean {
  if (typeof window === 'undefined') return false;

  // The Embedded App SDK sets frame_id and instance_id in the URL
  const params = new URLSearchParams(window.location.search);
  const hasFrameId = params.has('frame_id');
  const hasInstanceId = params.has('instance_id');

  // Also check referrer and parent !== self (iframe)
  const isIframe = window.self !== window.top;

  return (hasFrameId && hasInstanceId) || (isIframe && /discord\.com/i.test(document.referrer));
}

/**
 * Initialise the Discord Embedded App SDK.
 * Call this once at app startup (e.g. in main.tsx).
 * Returns `true` if we are inside a Discord Activity and the SDK is ready.
 */
export async function initDiscordActivity(): Promise<boolean> {
  if (!detectDiscordActivity()) {
    console.log('[DiscordActivity] Not running inside a Discord Activity — skipping SDK init.');
    return false;
  }

  console.log('[DiscordActivity] Detected Discord Activity environment. Initialising SDK…');
  isDiscordActivity = true;

  try {
    discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

    // Wait for the SDK handshake with the Discord client
    await discordSdk.ready();
    activityReady = true;
    console.log('[DiscordActivity] SDK ready ✅');

    // Optional: authorise the user so we can show their name/avatar
    // (requires the `identify` scope in your Activity settings)
    // const { code } = await discordSdk.commands.authorize({
    //   client_id: DISCORD_CLIENT_ID,
    //   response_type: 'code',
    //   state: '',
    //   prompt: 'none',
    //   scope: ['identify'],
    // });

    return true;
  } catch (err) {
    console.error('[DiscordActivity] Failed to initialise SDK:', err);
    // Still let the app render — worst case it works like a normal web page
    return false;
  }
}

// ── Public getters ────────────────────────────────────────────────────

/** Whether we are currently running inside a Discord Activity. */
export function getIsDiscordActivity(): boolean {
  return isDiscordActivity;
}

/** Whether the SDK handshake completed successfully. */
export function getIsActivityReady(): boolean {
  return activityReady;
}

/** Get the raw DiscordSDK instance (null if not in an Activity). */
export function getDiscordSdk(): DiscordSDK | null {
  return discordSdk;
}
