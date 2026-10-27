const DELAY = 3 * 60 * 1000;
let sessionStartedAt: number | undefined;
let dismissedThisSession = false;

/** A browsing deadline survives route remounts without requiring an account. */
export function reviewPromptDelay(storage: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now()): number | null {
  if (dismissedThisSession) return null;
  try {
    if (storage.getItem('tatakai_review_shown')) return null;
    const saved = Number(storage.getItem('tatakai_review_started_at'));
    const start = saved > 0 && saved <= now ? saved : now;
    storage.setItem('tatakai_review_started_at', String(start));
    return Math.max(0, DELAY - (now - start));
  } catch {
    sessionStartedAt ??= now;
    return Math.max(0, DELAY - (now - sessionStartedAt));
  }
}

export function markReviewPromptDismissed() {
  dismissedThisSession = true;
  try { localStorage.setItem('tatakai_review_shown', 'true'); } catch { /* session dismissal still works */ }
}
