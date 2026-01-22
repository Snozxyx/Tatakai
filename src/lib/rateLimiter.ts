type Bucket = { remaining: number; reset: number };

const DEFAULT_LIMIT = 100; // requests
const DEFAULT_WINDOW = 60; // seconds

// Simple in-memory token bucket per key (IP). For production use, prefer Redis.
const buckets = new Map<string, Bucket>();

// Periodically cleanup old buckets
setInterval(() => {
  const now = Date.now() / 1000;
  for (const [key, b] of buckets) {
    if (b.reset + 60 < now) {
      buckets.delete(key);
    }
  }
}, 60_000).unref();

export function checkRateLimit(key: string, limit = DEFAULT_LIMIT, windowSeconds = DEFAULT_WINDOW) {
  const now = Math.floor(Date.now() / 1000);
  let bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    bucket = { remaining: limit - 1, reset: now + windowSeconds };
    buckets.set(key, bucket);
    return { limited: false, remaining: bucket.remaining, reset: bucket.reset };
  }

  if (bucket.remaining <= 0) {
    return { limited: true, remaining: 0, reset: bucket.reset };
  }

  bucket.remaining -= 1;
  return { limited: false, remaining: bucket.remaining, reset: bucket.reset };
}

export function getRetryAfter(reset: number) {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, reset - now);
}
