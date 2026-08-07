'use strict';

/**
 * CloudflareBypasser
 *
 * Uses Playwright (headless Chromium) to bypass Cloudflare protection by:
 * 1. Opening pages in a real browser
 * 2. Waiting for Cloudflare challenges to complete
 * 3. Extracting cookies and user-agent
 * 4. Using those credentials for subsequent requests
 *
 * Features:
 * - Cookie/session management
 * - Automatic challenge solving
 * - Session persistence (5 min TTL)
 * - Concurrent request handling
 */

const { chromium } = require('playwright');

// Default user agent
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

// Session cache: domain -> { cookies, userAgent, expiresAt }
const sessionCache = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Browser instance pool
let browserInstance = null;
let browserContexts = new Map(); // domain -> context

/**
 * Gets or creates a shared browser instance
 */
async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true, // Back to headless for production
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });
  }
  return browserInstance;
}

/**
 * Gets or creates a browser context for a domain with stealth settings
 */
async function getBrowserContext(domain) {
  if (browserContexts.has(domain)) {
    return browserContexts.get(domain);
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // Stealth settings
    javaScriptEnabled: true,
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  });

  // Add stealth scripts to evade detection
  await context.addInitScript(() => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    
    // Override chrome object
    window.chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {},
    };
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  browserContexts.set(domain, context);
  return context;
}

/**
 * Extracts domain from URL
 */
function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Checks if a session is still valid
 */
function isSessionValid(domain) {
  const session = sessionCache.get(domain);
  if (!session) return false;
  return Date.now() < session.expiresAt;
}

/**
 * Bypasses Cloudflare for a given URL and returns cookies + user agent
 * 
 * Strategy:
 * 1. Visit the homepage first to establish a session
 * 2. Wait for Cloudflare challenge to complete
 * 3. Then visit the actual target URL
 * 
 * @param {string} url - The URL to bypass Cloudflare for
 * @param {object} logger - Logger instance
 * @returns {Promise<{cookies: Array, userAgent: string}>}
 */
async function bypassCloudflare(url, logger) {
  const domain = extractDomain(url);
  if (!domain) {
    throw new Error('Invalid URL');
  }

  // Check cache first
  if (isSessionValid(domain)) {
    logger?.info(`[CloudflareBypasser] Using cached session for ${domain}`);
    const cached = sessionCache.get(domain);
    return {
      cookies: cached.cookies,
      userAgent: cached.userAgent,
    };
  }

  logger?.info(`[CloudflareBypasser] Bypassing Cloudflare for ${domain}...`);

  const context = await getBrowserContext(domain);
  const page = await context.newPage();

  try {
    // Step 1: Visit homepage first to establish session
    const parsedUrl = new URL(url);
    const homepageUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
    
    logger?.info(`[CloudflareBypasser] Step 1: Visiting homepage ${homepageUrl}`);
    
    // Navigate to homepage
    const navigationPromise = page.goto(homepageUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    // Add a safety timeout
    const navigationTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Navigation timeout')), 35000)
    );
    
    try {
      await Promise.race([navigationPromise, navigationTimeout]);
    } catch (err) {
      logger?.warn(`[CloudflareBypasser] Homepage navigation warning: ${err.message}`);
      // Continue anyway - page might have loaded partially
    }

    // Wait for Cloudflare challenge to complete on homepage
    logger?.info(`[CloudflareBypasser] Step 2: Waiting for challenge on homepage...`);
    
    let attempts = 0;
    const maxAttempts = 8; // Reduced for faster timeouts - 12 seconds max
    const checkInterval = 1500;
    
    // Give initial time for page to settle
    await page.waitForTimeout(1000); // Reduced from 3000ms
    
    while (attempts < maxAttempts) {
      try {
        const title = await Promise.race([
          page.title(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Title timeout')), 3000))
        ]);
        
        const currentUrl = page.url();
        
        // Check if we're still on a Cloudflare challenge page
        const isCloudflareChallenge = 
          title.toLowerCase().includes('just a moment') ||
          title.toLowerCase().includes('attention required') ||
          title.toLowerCase().includes('please wait') ||
          title.toLowerCase().includes('checking your browser') ||
          currentUrl.includes('cdn-cgi/challenge');
        
        if (!isCloudflareChallenge) {
          logger?.info(`[CloudflareBypasser] Homepage challenge completed (attempts: ${attempts + 1})`);
          break;
        }
        
        logger?.info(`[CloudflareBypasser] Still in challenge... (attempt ${attempts + 1}/${maxAttempts})`);
        await page.waitForTimeout(checkInterval);
        attempts++;
        
      } catch (err) {
        logger?.warn(`[CloudflareBypasser] Error checking page state: ${err.message}`);
        attempts++;
        if (attempts < maxAttempts) {
          await page.waitForTimeout(checkInterval);
        }
      }
    }
    
    if (attempts >= maxAttempts) {
      logger?.warn(`[CloudflareBypasser] Max attempts reached for homepage`);
    }
    
    // Wait a bit more after challenge completes
    await page.waitForTimeout(2000);
    
    // Step 3: Now visit the actual target URL if it's different from homepage
    if (url !== homepageUrl) {
      logger?.info(`[CloudflareBypasser] Step 3: Visiting target URL ${url}`);
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await page.waitForTimeout(2000);
      } catch (err) {
        logger?.warn(`[CloudflareBypasser] Target URL navigation warning: ${err.message}`);
        // Continue anyway
      }
    }

    // Extract cookies and user agent with timeout protection
    const cookies = await Promise.race([
      context.cookies(),
      new Promise((resolve) => setTimeout(() => resolve([]), 5000))
    ]);
    
    const userAgent = await Promise.race([
      page.evaluate(() => navigator.userAgent),
      new Promise((resolve) => setTimeout(() => resolve(DEFAULT_USER_AGENT), 3000))
    ]);

    // Cache the session
    sessionCache.set(domain, {
      cookies,
      userAgent,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });

    logger?.info(`[CloudflareBypasser] Successfully bypassed Cloudflare for ${domain} (${cookies.length} cookies)`);

    await page.close();

    return { cookies, userAgent };

  } catch (error) {
    await page.close();
    logger?.error(`[CloudflareBypasser] Failed to bypass Cloudflare for ${domain}:`, error.message);
    throw error;
  }
}

/**
 * Converts Playwright cookies to HTTP Cookie header string
 */
function cookiesToHeader(cookies) {
  return cookies
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

/**
 * Clears cached session for a domain
 */
function clearSession(domain) {
  sessionCache.delete(domain);
}

/**
 * Clears all cached sessions
 */
function clearAllSessions() {
  sessionCache.clear();
}

/**
 * Closes all browser contexts and the browser instance
 */
async function cleanup() {
  for (const [domain, context] of browserContexts.entries()) {
    try {
      await context.close();
    } catch (err) {
      // Ignore cleanup errors
    }
  }
  browserContexts.clear();
  
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (err) {
      // Ignore cleanup errors
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
};
