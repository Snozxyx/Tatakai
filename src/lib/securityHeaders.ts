/**
 * Security headers and CSP configuration
 * For production deployment
 */

/**
 * Content Security Policy configuration
 */
export const CSP_POLICY = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Required for React
    "'unsafe-eval'", // Required for some libraries
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for Tailwind and inline styles
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https:',
  ],
  'font-src': [
    "'self'",
    'data:',
  ],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'https://*.datadoghq.com',
    'https://www.google-analytics.com',
    'https://tatakaiapi.vercel.app',
    'https://api.jikan.moe',
  ],
  'media-src': [
    "'self'",
    'blob:',
    'https:',
  ],
  'frame-src': [
    "'self'",
    'https://*.supabase.co',
  ],
  'worker-src': [
    "'self'",
    'blob:',
  ],
  'manifest-src': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
};

/**
 * Generate CSP header string
 */
export function generateCSPHeader(): string {
  return Object.entries(CSP_POLICY)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive;
      }
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}

/**
 * Security headers for production
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': generateCSPHeader(),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/**
 * Apply security headers (for server-side)
 * Note: This is a reference - actual implementation depends on your server
 */
export function applySecurityHeaders(headers: Headers) {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
}
