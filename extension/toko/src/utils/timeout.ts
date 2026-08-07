/**
 * Provider timeout utility for Toko extension.
 * Requirement: 2.11
 */

/**
 * Wraps a promise with a hard timeout. If the promise does not settle within
 * `ms` milliseconds, the returned promise rejects with a timeout error.
 *
 * Used by `runProviders` in TokoBundleClass to enforce per-provider timeout
 * during `single()`, `batch()`, and `getMangaChapters()` calls.
 *
 * Increased to 30 seconds to allow time for Cloudflare bypass (embedded FlareSolverr).
 *
 * @param promise - The promise to race against the timeout.
 * @param ms - Timeout in milliseconds. Defaults to 30 000 ms (30 seconds).
 */
export function withProviderTimeout<T>(promise: Promise<T>, ms: number = 30_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Provider timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
