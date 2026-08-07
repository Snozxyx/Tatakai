/**
 * Auto-start Embedded FlareSolverr
 * 
 * This module ensures embedded FlareSolverr is automatically started
 * when the proxy server starts, if configured to do so.
 */

'use strict';

let autoStartEnabled = false;
let autoStartMode = 'embedded'; // 'playwright', 'flaresolverr', or 'embedded'

/**
 * Enable auto-start of embedded FlareSolverr
 */
function enableAutoStart(mode = 'embedded') {
  autoStartEnabled = true;
  autoStartMode = mode;
}

/**
 * Disable auto-start of embedded FlareSolverr
 */
function disableAutoStart() {
  autoStartEnabled = false;
}

/**
 * Check if auto-start is enabled
 */
function isAutoStartEnabled() {
  return autoStartEnabled;
}

/**
 * Get configured mode
 */
function getAutoStartMode() {
  return autoStartMode;
}

/**
 * Auto-start embedded FlareSolverr if enabled
 * Should be called after proxy server starts
 */
async function maybeAutoStart(proxyServer, logger) {
  if (!autoStartEnabled) {
    return { started: false, reason: 'auto-start disabled' };
  }

  try {
    logger?.info('[AutoStart] Starting embedded FlareSolverr...');
    
    // Start embedded FlareSolverr
    const result = await proxyServer.startEmbeddedFlareSolverr();
    
    if (!result.success) {
      logger?.error('[AutoStart] Failed to start:', result.error);
      return { started: false, error: result.error };
    }

    logger?.info('[AutoStart] Embedded FlareSolverr started:', result.url);

    // Set bypass mode
    proxyServer.setBypassMode(autoStartMode);
    logger?.info(`[AutoStart] Bypass mode set to: ${autoStartMode}`);

    return { started: true, url: result.url, mode: autoStartMode };
  } catch (error) {
    logger?.error('[AutoStart] Error:', error.message);
    return { started: false, error: error.message };
  }
}

module.exports = {
  enableAutoStart,
  disableAutoStart,
  isAutoStartEnabled,
  getAutoStartMode,
  maybeAutoStart,
};
