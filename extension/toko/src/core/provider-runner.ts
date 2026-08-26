/**
 * Provider Runner
 * Manages concurrent execution of providers with retry logic and timeout handling
 */

import { withProviderTimeout } from '../utils/common/timeout.js';
import type {
  ProviderDiagnostic,
  ProviderChunk,
  ProviderRunOptions,
} from '../types/index.js';

export const DEFAULT_PROVIDER_RUN_OPTIONS: Required<ProviderRunOptions> = {
  maxConcurrency: 10,
  maxRetries: 2,
  retryDelayMs: 250,
  timeoutMs: 15_000,
};

/**
 * Resolves and validates provider run options with safety boundaries
 * Clamps caller settings to prevent unbounded retry/request loops
 */
export function resolveProviderRunOptions(
  opts?: Partial<ProviderRunOptions>
): Required<ProviderRunOptions> {
  const raw = opts ?? {};
  
  const clampNumber = (
    value: unknown,
    fallback: number,
    min: number,
    max: number
  ): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
  };

  return {
    maxConcurrency: clampNumber(
      raw.maxConcurrency,
      DEFAULT_PROVIDER_RUN_OPTIONS.maxConcurrency,
      1,
      24
    ),
    maxRetries: clampNumber(
      raw.maxRetries,
      DEFAULT_PROVIDER_RUN_OPTIONS.maxRetries,
      0,
      4
    ),
    retryDelayMs: clampNumber(
      raw.retryDelayMs,
      DEFAULT_PROVIDER_RUN_OPTIONS.retryDelayMs,
      0,
      10_000
    ),
    timeoutMs: clampNumber(
      raw.timeoutMs,
      DEFAULT_PROVIDER_RUN_OPTIONS.timeoutMs,
      1_000,
      30_000
    ),
  };
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface ProviderAttempt<T> {
  results: T[];
  diagnostic: ProviderDiagnostic;
}

/**
 * Executes a provider with retry logic
 *
 * A completed call is terminal, empty or not — retries exist for *thrown*
 * failures only. See the note inside for why empty is not retried.
 */
async function runProviderWithRetry<T, P extends { name: string }>(
  provider: P,
  fn: (p: P) => Promise<T[]>,
  options: Required<ProviderRunOptions>
): Promise<ProviderAttempt<T>> {
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const results = await withProviderTimeout(
        Promise.resolve().then(() => fn(provider)),
        options.timeoutMs
      );

      // An empty result is a deterministic *answer* — "this site's catalogue has
      // no match for this title" — produced by a successful HTTP exchange, so
      // re-running the identical scrape returns the identical nothing. Measured
      // on Mushoku Tensei S3 ep1, where 17 of 23 providers answer empty:
      // retrying them twice more took the sweep from 118s to 258s and added not
      // one source (animepahe alone: 12s → 37s). Only thrown failures are
      // transient enough to be worth another attempt.
      return {
        results,
        diagnostic: {
          provider: provider.name,
          status: results.length > 0 ? 'ok' : 'empty',
          durationMs: Date.now() - startedAt,
          resultCount: results.length,
          attempts: attempt + 1,
        },
      };
    } catch (error) {
      lastError = error;

      // A timeout means the host is unreachable or simply slower than the
      // budget; neither clears up within one request, and retrying multiplies
      // the dead wait (a blocked indexer cost 3x timeoutMs before this).
      if (error instanceof Error && /timed out/i.test(error.message)) {
        return {
          results: [],
          diagnostic: {
            provider: provider.name,
            status: 'timeout',
            durationMs: Date.now() - startedAt,
            resultCount: 0,
            attempts: attempt + 1,
            error: error.message,
          },
        };
      }
    }

    // Add delay before retry (except after last attempt)
    if (attempt < options.maxRetries && options.retryDelayMs > 0) {
      await delay(options.retryDelayMs * (attempt + 1));
    }
  }

  // Every attempt threw a non-timeout error.
  const message = lastError instanceof Error
    ? lastError.message
    : lastError
    ? String(lastError)
    : undefined;

  return {
    results: [],
    diagnostic: {
      provider: provider.name,
      status: message
        ? (/timed out/i.test(message) ? 'timeout' : 'error')
        : 'empty',
      durationMs: Date.now() - startedAt,
      resultCount: 0,
      attempts: options.maxRetries + 1,
      ...(message ? { error: message } : {}),
    },
  };
}

/**
 * Runs all providers concurrently with timeout and retry handling
 * Failed or timed-out providers are silently dropped
 */
export async function runProviders<T, P extends { name: string }>(
  providers: P[],
  fn: (p: P) => Promise<T[]>,
  diagnostics?: ProviderDiagnostic[],
  options: Required<ProviderRunOptions> = DEFAULT_PROVIDER_RUN_OPTIONS
): Promise<T[]> {
  const results: T[][] = Array.from({ length: providers.length }, () => []);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= providers.length) return;
      
      const attempt = await runProviderWithRetry(providers[index], fn, options);
      results[index] = attempt.results;
      diagnostics?.push(attempt.diagnostic);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(options.maxConcurrency, providers.length) },
      worker
    )
  );
  
  return results.flat();
}

/**
 * How long non-lead chunks are held while a lead provider is still working.
 *
 * Sized against what the lead provider actually costs: `nebula` resolves from an
 * AniList id with no title search and normally answers in well under a second,
 * so the hold is invisible in the common case. The cap is what keeps a dead lead
 * from stalling the whole sweep — past it, everything is released and the lead
 * simply loses its head start.
 */
const LEAD_GRACE_MS = 2_500;

export interface ProgressiveOrdering {
  /**
   * Provider names whose chunks must be emitted before any other. Ordered:
   * `['nebula']` means nebula's chunk is first on the wire.
   */
  lead?: string[];
  /** Override for how long non-lead chunks wait. Defaults to LEAD_GRACE_MS. */
  graceMs?: number;
  /** Rank for a provider name, lowest first. Stamped onto each chunk. */
  priorityOf?: (providerName: string) => number;
}

/**
 * Runs providers concurrently and streams results as they complete.
 *
 * Chunks are emitted in completion order, which is what makes the fan-out worth
 * having — a fast provider's sources reach the player without waiting on a slow
 * one. `ordering.lead` carves out a bounded exception: chunks from providers not
 * named there are buffered until every lead provider has reported or
 * `graceMs` elapses, whichever comes first. That is what puts the registry's
 * first provider on screen first without giving up progressive delivery, and it
 * costs nothing when the lead provider is the fast one (the usual case).
 */
export async function runProvidersProgressive<T, P extends { name: string }>(
  providers: P[],
  fn: (p: P) => Promise<T[]>,
  onChunk: (chunk: ProviderChunk<T>) => void,
  options: Required<ProviderRunOptions> = DEFAULT_PROVIDER_RUN_OPTIONS,
  ordering?: ProgressiveOrdering
): Promise<T[]> {
  const allResults: T[] = [];
  let cursor = 0;

  const priorityOf = ordering?.priorityOf;
  const decorate = (chunk: ProviderChunk<T>): ProviderChunk<T> =>
    priorityOf ? { ...chunk, providerPriority: priorityOf(chunk.provider) } : chunk;

  // ── Lead gate ────────────────────────────────────────────────────────────
  const leadNames = new Set(
    (ordering?.lead ?? [])
      .map(name => String(name || '').trim().toLowerCase())
      .filter(name => name.length > 0 && providers.some(p => p.name.toLowerCase() === name))
  );

  // Buffer of held chunks, kept in registry order so releasing them does not
  // just swap one arbitrary order for another.
  let held: ProviderChunk<T>[] | null = leadNames.size > 0 ? [] : null;
  let pendingLeads = leadNames.size;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;

  const release = () => {
    if (!held) return;
    const buffered = held;
    held = null;
    if (releaseTimer !== undefined) {
      clearTimeout(releaseTimer);
      releaseTimer = undefined;
    }
    if (priorityOf) {
      buffered.sort((a, b) => priorityOf(a.provider) - priorityOf(b.provider));
    }
    for (const chunk of buffered) onChunk(chunk);
  };

  if (held) {
    releaseTimer = setTimeout(release, Math.max(0, ordering?.graceMs ?? LEAD_GRACE_MS));
    // Never let the grace timer keep a Node process alive on its own.
    (releaseTimer as unknown as { unref?: () => void }).unref?.();
  }

  const emit = (chunk: ProviderChunk<T>, isLead: boolean) => {
    const decorated = decorate(chunk);
    if (isLead) {
      // A lead chunk always goes straight out; it is what the gate exists for.
      onChunk(decorated);
      pendingLeads -= 1;
      if (pendingLeads <= 0) release();
      return;
    }
    if (held) {
      held.push(decorated);
      return;
    }
    onChunk(decorated);
  };

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= providers.length) return;

      const provider = providers[index];
      const attempt = await runProviderWithRetry(provider, fn, options);

      emit(
        {
          provider: provider.name,
          results: attempt.results,
          diagnostic: attempt.diagnostic,
        },
        leadNames.has(provider.name.toLowerCase())
      );

      allResults.push(...attempt.results);
    }
  };

  // Lead providers are dispatched first so they are never stuck behind a full
  // concurrency pool — being first in the array is not enough once the pool is
  // saturated by long-running scrapes.
  const ordered = leadNames.size > 0
    ? [
        ...providers.filter(p => leadNames.has(p.name.toLowerCase())),
        ...providers.filter(p => !leadNames.has(p.name.toLowerCase())),
      ]
    : providers;
  providers = ordered;

  try {
    await Promise.all(
      Array.from(
        { length: Math.min(options.maxConcurrency, providers.length) },
        worker
      )
    );
  } finally {
    // Anything still held (all leads errored before reporting, say) must not be
    // dropped on the floor.
    release();
  }

  return allResults;
}
