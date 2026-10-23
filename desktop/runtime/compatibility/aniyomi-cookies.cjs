'use strict';

/** Translate original OkHttp Set-Cookie callbacks to Chromium's cookie contract. */
function sourceCookie(address, header, now = Date.now() / 1000) {
  const url = new URL(address);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid cookie URL');
  if (typeof header !== 'string' || header.length > 16384 || /[\r\n\0]/.test(header)) return null;
  const [pair, ...attributes] = header.split(';'), at = pair.indexOf('=');
  if (at < 1) return null;
  const name = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) return null;
  const path = url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/';
  const cookie = { url: url.href, name, value, path };
  let maxAge;
  for (const attribute of attributes) {
    const [key, ...parts] = attribute.trim().split('='), item = parts.join('=').trim();
    switch (key.toLowerCase()) {
      case 'path': if (item.startsWith('/')) cookie.path = item; break;
      case 'domain': {
        const domain = item.replace(/^\./, '').toLowerCase();
        if (!domain || domain.endsWith('.') || (url.hostname !== domain && !url.hostname.endsWith('.' + domain))) return null;
        cookie.domain = '.' + domain; break;
      }
      case 'secure': cookie.secure = true; break;
      case 'httponly': cookie.httpOnly = true; break;
      case 'expires': { const date = Date.parse(item); if (Number.isFinite(date)) cookie.expirationDate = date / 1000; break; }
      case 'max-age': if (/^-?\d+$/.test(item)) maxAge = Number(item); break;
      case 'samesite': {
        const mode = { lax: 'lax', strict: 'strict', none: 'no_restriction' }[item.toLowerCase()];
        if (mode) cookie.sameSite = mode; break;
      }
    }
  }
  // Max-Age takes precedence over Expires; an expired value removes the cookie.
  if (maxAge !== undefined) cookie.expirationDate = maxAge <= 0 ? 1 : Math.min(253402300799, now + maxAge);
  // Chromium otherwise rejects deleting an existing HttpOnly cookie when the
  // server's expiry header omits HttpOnly. This expired value is never retained.
  if (cookie.expirationDate !== undefined && cookie.expirationDate <= now) cookie.httpOnly = true;
  return cookie;
}

module.exports = { sourceCookie };
