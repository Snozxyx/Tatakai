'use strict';

/**
 * FlareSolverr Client
 * 
 * Communicates with a FlareSolverr instance to bypass Cloudflare protection.
 * FlareSolverr uses a real browser to solve challenges and returns cookies/user-agent.
 * 
 * This can connect to:
 * 1. Local FlareSolverr instance (user must install separately)
 * 2. Remote FlareSolverr service
 * 3. Embedded FlareSolverr (if we bundle it)
 */

const DEFAULT_FLARESOLVERR_URL = 'http://localhost:8191/v1';
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Session cache: domain -> { sessionId, cookies, userAgent, expiresAt }
const sessionCache = new Map();

class FlareSolverrClient {
  constructor(logger, options = {}) {
    this._logger = logger;
    this._baseUrl = options.url || process.env.FLARESOLVERR_URL || DEFAULT_FLARESOLVERR_URL;
    this._enabled = options.enabled !== false;
    this._maxTimeout = options.maxTimeout || 60000; // 60 seconds
  }

  /**
   * Check if FlareSolverr is available
   */
  async isAvailable() {
    if (!this._enabled) return false;
    
    try {
      const response = await fetch(this._baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'sessions.list' }),
        signal: AbortSignal.timeout(5000),
      });
      
      return response.ok;
    } catch (error) {
      this._logger?.warn(`[FlareSolverr] Not available at ${this._baseUrl}: ${error.message}`);
      return false;
    }
  }

  /**
   * Enable or disable FlareSolverr
   */
  setEnabled(enabled) {
    this._enabled = !!enabled;
    this._logger?.info(`[FlareSolverr] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Set FlareSolverr URL
   */
  setUrl(url) {
    this._baseUrl = url;
    this._logger?.info(`[FlareSolverr] URL set to ${url}`);
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      enabled: this._enabled,
      url: this._baseUrl,
      available: null, // Will be checked async
    };
  }

  /**
   * Solve Cloudflare challenge for a URL
   * 
   * @param {string} url - The URL to solve
   * @returns {Promise<{cookies: Array, userAgent: string}>}
   */
  async solve(url) {
    if (!this._enabled) {
      throw new Error('FlareSolverr is disabled');
    }

    const domain = this._extractDomain(url);
    if (!domain) {
      throw new Error('Invalid URL');
    }

    // Check cache first
    if (this._isSessionValid(domain)) {
      this._logger?.info(`[FlareSolverr] Using cached session for ${domain}`);
      const cached = sessionCache.get(domain);
      return {
        cookies: cached.cookies,
        userAgent: cached.userAgent,
      };
    }

    this._logger?.info(`[FlareSolverr] Solving challenge for ${url}`);

    try {
      // Create a session
      const sessionId = await this._createSession();
      
      // Solve the challenge
      const response = await fetch(this._baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: 'request.get',
          url: url,
          session: sessionId,
          maxTimeout: this._maxTimeout,
        }),
        signal: AbortSignal.timeout(this._maxTimeout + 5000),
      });

      if (!response.ok) {
        throw new Error(`FlareSolverr HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== 'ok') {
        throw new Error(`FlareSolverr error: ${data.message || 'Unknown error'}`);
      }

      const solution = data.solution;
      const cookies = solution.cookies || [];
      const userAgent = solution.userAgent || '';

      // Cache the session
      sessionCache.set(domain, {
        sessionId,
        cookies,
        userAgent,
        expiresAt: Date.now() + SESSION_TTL_MS,
      });

      this._logger?.info(`[FlareSolverr] Successfully solved challenge for ${domain} (${cookies.length} cookies)`);

      return { cookies, userAgent };

    } catch (error) {
      this._logger?.error(`[FlareSolverr] Failed to solve ${url}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a FlareSolverr session
   */
  async _createSession() {
    const sessionId = `tatakai_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const response = await fetch(this._baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'sessions.create',
        session: sessionId,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status !== 'ok') {
      throw new Error(`Failed to create session: ${data.message || 'Unknown error'}`);
    }

    return sessionId;
  }

  /**
   * Destroy a FlareSolverr session
   */
  async _destroySession(sessionId) {
    try {
      await fetch(this._baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: 'sessions.destroy',
          session: sessionId,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      this._logger?.warn(`[FlareSolverr] Failed to destroy session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Extract domain from URL
   */
  _extractDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Check if cached session is still valid
   */
  _isSessionValid(domain) {
    const session = sessionCache.get(domain);
    if (!session) return false;
    return Date.now() < session.expiresAt;
  }

  /**
   * Clear cached session for a domain
   */
  clearSession(domain) {
    const session = sessionCache.get(domain);
    if (session && session.sessionId) {
      this._destroySession(session.sessionId).catch(() => {});
    }
    sessionCache.delete(domain);
  }

  /**
   * Clear all cached sessions
   */
  clearAllSessions() {
    const sessions = Array.from(sessionCache.values());
    for (const session of sessions) {
      if (session.sessionId) {
        this._destroySession(session.sessionId).catch(() => {});
      }
    }
    sessionCache.clear();
  }

  /**
   * Convert FlareSolverr cookies to HTTP Cookie header string
   */
  static cookiesToHeader(cookies) {
    return cookies
      .map(cookie => {
        // FlareSolverr returns cookies as objects with 'name' and 'value'
        if (typeof cookie === 'object' && cookie.name && cookie.value) {
          return `${cookie.name}=${cookie.value}`;
        }
        return null;
      })
      .filter(Boolean)
      .join('; ');
  }
}

module.exports = {
  FlareSolverrClient,
};
