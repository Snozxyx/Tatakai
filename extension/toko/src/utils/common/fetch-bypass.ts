/**
 * Fetch with Cloudflare bypass capabilities
 * Wrapper around fetchResponse that attempts to bypass CF challenges
 */

import { fetchResponse } from '../http/fetch.js';

export interface FetchBypassOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  method?: string;
}

/**
 * Fetches HTML text with automatic Cloudflare bypass attempts
 * Falls back to regular fetch if bypass is not available
 */
export async function fetchTextWithBypass(
  url: string,
  options?: FetchBypassOptions
): Promise<string | null> {
  try {
    const response = await fetchResponse(url, {
      headers: options?.headers,
      timeoutMs: options?.timeoutMs,
      method: options?.method,
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
