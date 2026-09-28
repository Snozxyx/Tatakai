'use strict';

/**
 * CloudflareBypasser — stealth Playwright.
 *
 * Ports the CoorenLabs bypass approach onto the desktop proxy: a stealth-patched
 * browser (playwright-extra + puppeteer-extra-plugin-stealth, both already
 * dependencies) instead of stock headless Chromium, which Cloudflare's managed
 * challenge fingerprints and rejects on sight. Once a challenge clears, Cloudflare
 * returns a `cf_clearance` cookie accepted on ordinary requests — but only when
 * replayed with the same User-Agent (and IP) that earned it. So we solve once per
 * domain, cache cookies + UA keyed by the cookie's own expiry, dedupe concurrent
 * solves for one domain, back off a domain that just failed, and let the proxy
 * replay the session cheaply.
 *
 * Everything degrades rather than taking the run down: if the stealth browser
 * cannot load we fall back to stock Playwright; if that is absent too the caller
 * proceeds without a bypass.
 */

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

// Session cache: domain -> { cookies, userAgent, expiresAt }
const sessionCache = new Map();
// In-flight solves: domain -> Promise, so N concurrent requests solve once.
const inflight = new Map();
// Domains whose last solve failed, with a cooldown so we stop paying for each.
const failures = new Map();

const SESSION_TTL_MS = 20 * 60 * 1000; // fallback when the clearance cookie has no expiry
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // back off a domain that just failed
const SOLVE_TIMEOUT_MS = 45_000;
const HEADLESS = String(process.env.CF_BYPASS_HEADLESS || 'true').toLowerCase() !== 'false';

const CHALLENGE_TITLE_MARKERS = [
  'just a moment',
  'attention required',
  'please wait',
  'checking your browser',
  'cloudflare',
];
const CHALLENGE_BODY_MARKERS = [
  'cf-browser-verification',
  'cf_chl_opt',
  '__cf_chl_',
  'challenge-platform',
  'cf-challenge-running',
  'turnstile',
  'just a moment',
  'enable javascript and cookies to continue',
  'attention required! | cloudflare',
];

// ── stealth browser resolution ───────────────────────────────────────────────

let browserInstance = null;
const browserContexts = new Map(); // domain -> { context, lastUsed }
let chromiumImpl; // undefined = unresolved, null = unavailable, else the chromium API

// Evict a Cloudflare BrowserContext after this long idle. Each context pins tens
// of MB, and the resident Chromium is ~120–300MB, so a session that solved a few
// domains hours ago should not keep paying for them. A later request simply
// re-solves and re-creates the context.
const CONTEXT_IDLE_TTL_MS = 5 * 60 * 1000;
const CONTEXT_SWEEP_INTERVAL_MS = 60 * 1000;
let contextSweeper = null;
let sweeperLogger = null;

/**
 * Resolve a chromium launcher: playwright-extra + stealth if available (the
 * CoorenLabs-equivalent patched browser), else stock Playwright, else null. The
 * stealth plugin is what lets a *headless* Chromium clear a managed challenge —
 * stock headless is fingerprinted and rejected before the proof-of-work even runs.
 */
function resolveChromium(logger) {
  if (chromiumImpl !== undefined) return chromiumImpl;
  chromiumImpl = null;
  try {
    const { chromium } = require('playwright-extra');
    try {
      const stealth = require('puppeteer-extra-plugin-stealth')();
      chromium.use(stealth);
      logger?.info('[CloudflareBypasser] Using playwright-extra + stealth');
    } catch (err) {
      logger?.warn(`[CloudflareBypasser] Stealth plugin unavailable: ${err.message}`);
    }
    chromiumImpl = chromium;
  } catch {
    try {
      chromiumImpl = require('playwright').chromium;
      logger?.warn('[CloudflareBypasser] playwright-extra missing; using stock Playwright');
    } catch {
      chromiumImpl = null;
    }
  }
  return chromiumImpl;
}

async function getBrowser(logger) {
  if (browserInstance) return browserInstance;
  const chromium = resolveChromium(logger);
  if (!chromium) throw new Error('No Chromium runtime available for Cloudflare bypass');
  browserInstance = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
  return browserInstance;
}

async function getBrowserContext(domain, logger) {
  const existing = browserContexts.get(domain);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.context;
  }
  const browser = await getBrowser(logger);
  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    javaScriptEnabled: true,
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  });
  // Belt-and-suspenders init script on top of the stealth plugin.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {}, loadTimes() {}, csi() {}, app: {} };
  });
  browserContexts.set(domain, { context, lastUsed: Date.now() });
  startContextSweeper(logger);
  return context;
}

/**
 * Close (and forget) a domain's context, dropping its cached CF session too.
 * A subsequent request for that domain re-solves and re-creates it.
 */
async function evictContext(domain) {
  const entry = browserContexts.get(domain);
  if (!entry) return;
  browserContexts.delete(domain);
  sessionCache.delete(domain);
  try {
    await entry.context.close();
  } catch {
    /* already gone */
  }
}

/**
 * Close every context idle longer than `maxIdleMs`. When the map empties, tear
 * down the whole Chromium so its ~120–300MB is reclaimed — the expensive part.
 * Returns the number of contexts closed.
 */
async function reclaimIdleContexts(maxIdleMs = CONTEXT_IDLE_TTL_MS) {
  const now = Date.now();
  const stale = [];
  for (const [domain, entry] of browserContexts) {
    if (now - entry.lastUsed >= maxIdleMs) stale.push(domain);
  }
  for (const domain of stale) {
    sweeperLogger?.info?.(`[CloudflareBypasser] Evicting idle context for ${domain}`);
    await evictContext(domain);
  }
  if (browserContexts.size === 0) {
    stopContextSweeper();
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch {
        /* ignore */
      }
      browserInstance = null;
    }
  }
  return stale.length;
}

/** Lazily start the idle sweeper (once, unref'd so it never holds the app open). */
function startContextSweeper(logger) {
  if (contextSweeper) return;
  sweeperLogger = logger || sweeperLogger;
  contextSweeper = setInterval(() => {
    void reclaimIdleContexts().catch(() => {});
  }, CONTEXT_SWEEP_INTERVAL_MS);
  if (typeof contextSweeper.unref === 'function') contextSweeper.unref();
}

function stopContextSweeper() {
  if (contextSweeper) {
    clearInterval(contextSweeper);
    contextSweeper = null;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isSessionValid(domain) {
  const session = sessionCache.get(domain);
  if (!session) return false;
  return Date.now() < session.expiresAt;
}

function isCoolingDown(domain) {
  const until = failures.get(domain);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    failures.delete(domain);
    return false;
  }
  return true;
}

/**
 * Does this upstream response look like an unsolved Cloudflare wall? The proxy
 * calls this so a request whose cached clearance has gone stale (a 403/503 with a
 * challenge body) triggers a re-solve instead of forwarding the challenge page.
 */
function isChallengeResponse(status, body) {
  const haystack = String(body || '').slice(0, 6000).toLowerCase();
  if (!haystack) return status === 403 || status === 503;
  if (CHALLENGE_BODY_MARKERS.some((m) => haystack.includes(m))) return true;
  if ((status === 403 || status === 503 || status === 429) && haystack.length < 2000) {
    return haystack.includes('cloudflare') || haystack.includes('cf-ray');
  }
  return false;
}

/** Derive a cache expiry from the clearance cookie's own lifetime, capped sanely. */
function computeExpiry(cookies) {
  const clearance = (cookies || []).find((c) => c && c.name === 'cf_clearance');
  const rawExpires = clearance && typeof clearance.expires === 'number' ? clearance.expires : -1;
  if (rawExpires > 0) {
    const ms = rawExpires * 1000 - Date.now();
    // Expire a minute early to avoid replaying a cookie mid-rotation; cap at 2h.
    if (ms > 60_000) return Date.now() + Math.min(ms - 60_000, 2 * 60 * 60 * 1000);
  }
  return Date.now() + SESSION_TTL_MS;
}

// ── solving ─────────────────────────────────────────────────────────────────

/**
 * Drive the stealth browser until the challenge clears, then harvest cookies + UA.
 * Visits the homepage first (challenges are issued per-origin, and the target path
 * often 404s until clearance exists), polls the title rather than sleeping a fixed
 * amount, then loads the actual target so its cookies are in the jar.
 */
async function solve(url, logger) {
  const domain = extractDomain(url);
  const context = await getBrowserContext(domain, logger);
  const page = await context.newPage();
  try {
    const parsed = new URL(url);
    const homepageUrl = `${parsed.protocol}//${parsed.hostname}`;
    logger?.info(`[CloudflareBypasser] Solving challenge for ${domain}...`);

    try {
      await page.goto(homepageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (err) {
      logger?.warn(`[CloudflareBypasser] Homepage nav warning: ${err.message}`);
    }

    const deadline = Date.now() + SOLVE_TIMEOUT_MS;
    let cleared = false;
    await page.waitForTimeout(1000);
    while (Date.now() < deadline) {
      let title = '';
      try {
        title = await Promise.race([
          page.title(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('title timeout')), 3000)),
        ]);
      } catch {
        title = '';
      }
      const current = page.url();
      const stillChallenged =
        CHALLENGE_TITLE_MARKERS.some((m) => title.toLowerCase().includes(m)) ||
        current.includes('cdn-cgi/challenge');
      if (!stillChallenged) {
        cleared = true;
        break;
      }
      await page.waitForTimeout(1500);
    }
    if (!cleared) logger?.warn(`[CloudflareBypasser] Challenge budget exhausted for ${domain}`);
    else await page.waitForTimeout(1500);

    // Land on the actual target so path-scoped cookies join the jar.
    if (url !== homepageUrl) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForTimeout(1500);
      } catch (err) {
        logger?.warn(`[CloudflareBypasser] Target nav warning: ${err.message}`);
      }
    }

    const cookies = await Promise.race([
      context.cookies(),
      new Promise((resolve) => setTimeout(() => resolve([]), 5000)),
    ]);
    const userAgent = await Promise.race([
      page.evaluate(() => navigator.userAgent),
      new Promise((resolve) => setTimeout(() => resolve(DEFAULT_USER_AGENT), 3000)),
    ]);

    if (!cookies || cookies.length === 0) throw new Error('No cookies harvested');

    sessionCache.set(domain, { cookies, userAgent, expiresAt: computeExpiry(cookies) });
    logger?.info(`[CloudflareBypasser] Bypassed ${domain} (${cookies.length} cookies)`);
    return { cookies, userAgent };
  } finally {
    try {
      await page.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Bypass Cloudflare for `url`, returning replayable cookies + UA.
 *
 * Reuses a live cached session, dedupes concurrent solves per domain so a page's
 * worth of image requests solve once, and backs a domain off after a failure so a
 * dead challenge does not cost 45s on every request. `forceRefresh` drops the
 * cached session first — the proxy passes it when a replayed cookie has gone stale.
 */
async function bypassCloudflare(url, logger, opts = {}) {
  const domain = extractDomain(url);
  if (!domain) throw new Error('Invalid URL');

  if (opts.forceRefresh) sessionCache.delete(domain);

  if (isSessionValid(domain)) {
    const cached = sessionCache.get(domain);
    logger?.info(`[CloudflareBypasser] Using cached session for ${domain}`);
    return { cookies: cached.cookies, userAgent: cached.userAgent };
  }

  if (!opts.forceRefresh && isCoolingDown(domain)) {
    throw new Error(`Cloudflare bypass cooling down for ${domain}`);
  }

  const existing = inflight.get(domain);
  if (existing) return existing;

  const task = solve(url, logger)
    .then((result) => {
      failures.delete(domain);
      return result;
    })
    .catch((err) => {
      failures.set(domain, Date.now() + FAILURE_COOLDOWN_MS);
      throw err;
    })
    .finally(() => {
      inflight.delete(domain);
    });
  inflight.set(domain, task);
  return task;
}

// ── session utilities ─────────────────────────────────────────────────────────

function cookiesToHeader(cookies) {
  return (cookies || []).map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function clearSession(domain) {
  sessionCache.delete(domain);
}

function clearAllSessions() {
  sessionCache.clear();
}

async function cleanup() {
  stopContextSweeper();
  for (const entry of browserContexts.values()) {
    try {
      await entry.context.close();
    } catch {
      /* ignore */
    }
  }
  browserContexts.clear();
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      /* ignore */
    }
    browserInstance = null;
  }
  clearAllSessions();
}

module.exports = {
  bypassCloudflare,
  cookiesToHeader,
  clearSession,
  clearAllSessions,
  cleanup,
  isSessionValid,
  isChallengeResponse,
  reclaimIdleContexts,
};
