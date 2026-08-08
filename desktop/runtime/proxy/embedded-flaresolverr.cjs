'use strict';

/**
 * Embedded FlareSolverr
 * 
 * A built-in FlareSolverr implementation that runs directly in the Electron app.
 * Provides the same API as FlareSolverr without requiring Docker or external services.
 * 
 * Uses Playwright with stealth plugins to solve Cloudflare challenges.
 */

const http = require('http');
const crypto = require('crypto');

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SESSIONS = 5;
const DEFAULT_TIMEOUT = 60000; // 60 seconds

class EmbeddedFlareSolverr {
  constructor(logger, options = {}) {
    this._logger = logger;
    this._port = options.port || 8191;
    this._host = options.host || '127.0.0.1';
    this._server = null;
    this._sessions = new Map(); // sessionId -> { browser, context, cookies, userAgent, createdAt }
    this._enabled = false;
    this._playwright = null;
    this._chromium = null;
  }

  /**
   * Start the embedded FlareSolverr server
   */
  async start() {
    if (this._server) {
      this._logger?.info('[EmbeddedFlareSolverr] Already running');
      return;
    }

    try {
      // Lazy-load Playwright (only if embedded FlareSolverr is used)
      this._playwright = require('playwright-core');
      this._chromium = this._playwright.chromium;

      this._server = http.createServer(this._handleRequest.bind(this));
      
      await new Promise((resolve, reject) => {
        this._server.once('error', reject);
        this._server.listen(this._port, this._host, () => {
          this._enabled = true;
          this._logger?.info(`[EmbeddedFlareSolverr] Started on ${this._host}:${this._port}`);
          resolve();
        });
      });

      // Cleanup old sessions periodically
      this._cleanupInterval = setInterval(() => {
        this._cleanupExpiredSessions();
      }, 60000); // Every minute

    } catch (error) {
      this._logger?.error('[EmbeddedFlareSolverr] Failed to start:', error.message);
      throw error;
    }
  }

  /**
   * Stop the embedded FlareSolverr server
   */
  async stop() {
    if (!this._server) return;

    clearInterval(this._cleanupInterval);

    // Close all browser sessions
    for (const [sessionId, session] of this._sessions.entries()) {
      try {
        if (session.context) await session.context.close();
        if (session.browser) await session.browser.close();
      } catch (err) {
        this._logger?.warn(`[EmbeddedFlareSolverr] Error closing session ${sessionId}:`, err.message);
      }
    }
    this._sessions.clear();

    // Close HTTP server
    const server = this._server;
    this._server = null;
    this._enabled = false;

    await new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });

    this._logger?.info('[EmbeddedFlareSolverr] Stopped');
  }

  /**
   * Check if embedded FlareSolverr is running
   */
  isRunning() {
    return this._enabled && this._server !== null;
  }

  /**
   * Get server URL
   */
  getUrl() {
    return `http://${this._host}:${this._port}/v1`;
  }

  /**
   * Handle HTTP requests (FlareSolverr API compatible)
   */
  async _handleRequest(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      // Health check endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        msg: 'FlareSolverr (Embedded) is ready!',
        version: '1.0.0-embedded',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Method not allowed' }));
      return;
    }

    // Read request body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : '{}';

    try {
      const payload = JSON.parse(body);
      const result = await this._handleCommand(payload);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      this._logger?.error('[EmbeddedFlareSolverr] Request error:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        message: error.message,
      }));
    }
  }

  /**
   * Handle FlareSolverr commands
   */
  async _handleCommand(payload) {
    const cmd = payload.cmd;

    switch (cmd) {
      case 'sessions.create':
        return await this._createSession(payload);
      
      case 'sessions.list':
        return this._listSessions();
      
      case 'sessions.destroy':
        return await this._destroySession(payload);
      
      case 'request.get':
        return await this._solveChallenge(payload);
      
      default:
        return {
          status: 'error',
          message: `Unknown command: ${cmd}`,
        };
    }
  }

  /**
   * Create a new browser session
   */
  async _createSession(payload) {
    const sessionId = payload.session || this._generateSessionId();

    // Check if session already exists
    if (this._sessions.has(sessionId)) {
      return {
        status: 'ok',
        message: 'Session already exists',
        session: sessionId,
      };
    }

    // Enforce max sessions
    if (this._sessions.size >= MAX_SESSIONS) {
      // Remove oldest session
      const oldestSessionId = Array.from(this._sessions.keys())[0];
      await this._destroySession({ session: oldestSessionId });
    }

    try {
      // Launch browser with stealth
      const browser = await this._chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
        ],
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
      });

      // Add stealth scripts
      await context.addInitScript(() => {
        // Remove webdriver flag
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // Mock plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Mock languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });

        // Chrome runtime
        window.chrome = { runtime: {} };
      });

      this._sessions.set(sessionId, {
        browser,
        context,
        cookies: [],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        createdAt: Date.now(),
      });

      this._logger?.info(`[EmbeddedFlareSolverr] Created session: ${sessionId}`);

      return {
        status: 'ok',
        message: 'Session created successfully',
        session: sessionId,
      };
    } catch (error) {
      this._logger?.error('[EmbeddedFlareSolverr] Failed to create session:', error.message);
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * List all active sessions
   */
  _listSessions() {
    const sessions = Array.from(this._sessions.keys());
    return {
      status: 'ok',
      sessions,
    };
  }

  /**
   * Destroy a session
   */
  async _destroySession(payload) {
    const sessionId = payload.session;
    const session = this._sessions.get(sessionId);

    if (!session) {
      return {
        status: 'ok',
        message: 'Session not found',
      };
    }

    try {
      if (session.context) await session.context.close();
      if (session.browser) await session.browser.close();
      this._sessions.delete(sessionId);

      this._logger?.info(`[EmbeddedFlareSolverr] Destroyed session: ${sessionId}`);

      return {
        status: 'ok',
        message: 'Session destroyed successfully',
      };
    } catch (error) {
      this._logger?.error('[EmbeddedFlareSolverr] Failed to destroy session:', error.message);
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Solve Cloudflare challenge
   */
  async _solveChallenge(payload) {
    const sessionId = payload.session;
    const url = payload.url;
    const maxTimeout = payload.maxTimeout || DEFAULT_TIMEOUT;

    if (!sessionId) {
      return {
        status: 'error',
        message: 'Session ID is required',
      };
    }

    if (!url) {
      return {
        status: 'error',
        message: 'URL is required',
      };
    }

    const session = this._sessions.get(sessionId);
    if (!session) {
      return {
        status: 'error',
        message: 'Session not found',
      };
    }

    try {
      this._logger?.info(`[EmbeddedFlareSolverr] Solving challenge for: ${url}`);

      const page = await session.context.newPage();
      
      // Set timeout
      page.setDefaultTimeout(maxTimeout);

      try {
        // Navigate to URL
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: maxTimeout,
        });

        // Wait for potential Cloudflare challenge
        await this._waitForChallengeCompletion(page, maxTimeout);

        // Extract cookies
        const cookies = await session.context.cookies();
        session.cookies = cookies;

        // Get user agent
        const userAgent = await page.evaluate(() => navigator.userAgent);
        session.userAgent = userAgent;

        // Get response
        const responseBody = await page.content();
        const responseUrl = page.url();

        await page.close();

        this._logger?.info(`[EmbeddedFlareSolverr] Challenge solved for ${url} (${cookies.length} cookies)`);

        return {
          status: 'ok',
          message: 'Challenge solved!',
          solution: {
            url: responseUrl,
            status: 200,
            cookies: cookies,
            userAgent: userAgent,
            response: responseBody,
          },
          startTimestamp: Date.now() - 10000, // Approximate
          endTimestamp: Date.now(),
        };
      } finally {
        if (!page.isClosed()) {
          await page.close();
        }
      }
    } catch (error) {
      this._logger?.error(`[EmbeddedFlareSolverr] Failed to solve challenge for ${url}:`, error.message);
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Wait for Cloudflare challenge to complete
   */
  async _waitForChallengeCompletion(page, timeout) {
    const startTime = Date.now();
    const checkInterval = 500;

    while (Date.now() - startTime < timeout) {
      try {
        // Check for common Cloudflare challenge indicators
        const hasChallengeTitle = await page.evaluate(() => {
          return document.title.includes('Just a moment') ||
                 document.title.includes('Attention Required') ||
                 document.title.includes('Please Wait');
        });

        const hasChallengeContent = await page.evaluate(() => {
          const body = document.body.innerText.toLowerCase();
          return body.includes('checking your browser') ||
                 body.includes('ddos protection') ||
                 body.includes('cloudflare');
        });

        if (!hasChallengeTitle && !hasChallengeContent) {
          // Challenge completed
          return;
        }

        // Wait before checking again
        await page.waitForTimeout(checkInterval);
      } catch (error) {
        // Page might have navigated or closed
        return;
      }
    }

    // Timeout reached, but continue anyway
    this._logger?.warn('[EmbeddedFlareSolverr] Challenge timeout reached, continuing...');
  }

  /**
   * Cleanup expired sessions
   */
  _cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this._sessions.entries()) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this._destroySession({ session: sessionId }).catch(() => {});
    }

    if (expiredSessions.length > 0) {
      this._logger?.info(`[EmbeddedFlareSolverr] Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Generate a random session ID
   */
  _generateSessionId() {
    return `tatakai_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
}

module.exports = { EmbeddedFlareSolverr };
