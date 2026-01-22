/**
 * Production environment utilities
 */

/**
 * Check if we're in production mode
 */
export const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';

/**
 * Suppress console in production
 */
if (isProduction && typeof window !== 'undefined') {
  // Override console methods in production
  const noop = () => {};
  
  // Keep error and warn for critical issues, but suppress others
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  console.trace = noop;
  console.table = noop;
  console.group = noop;
  console.groupEnd = noop;
  console.groupCollapsed = noop;
  console.time = noop;
  console.timeEnd = noop;
  
  // Filter out React DevTools messages
  console.error = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    // Suppress React DevTools messages
    if (message.includes('Download the React DevTools') || 
        message.includes('React Router Future Flag')) {
      return;
    }
    originalError(...args);
  };
  
  console.warn = (...args: any[]) => {
    const message = args[0]?.toString() || '';
    // Suppress React Router warnings
    if (message.includes('React Router Future Flag') ||
        message.includes('Encountered two children with the same key')) {
      return;
    }
    originalWarn(...args);
  };
}

/**
 * Safe console logging - only in development
 */
export const devLog = {
  log: (...args: any[]) => {
    if (!isProduction) console.log(...args);
  },
  debug: (...args: any[]) => {
    if (!isProduction) console.debug(...args);
  },
  info: (...args: any[]) => {
    if (!isProduction) console.info(...args);
  },
  warn: (...args: any[]) => {
    if (!isProduction) console.warn(...args);
  },
  error: (...args: any[]) => {
    // Always log errors, but format them properly
    console.error(...args);
  },
};
