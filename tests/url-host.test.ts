// URL host allowlisting — see src/lib/urlHost.ts
//
// Regression coverage for the auto-moderation link whitelist, which compared
// `matchText.includes(domain)` and so treated any URL merely *containing* an allowlisted
// domain as safe.
import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { extractHostname, isHostAllowed, isUrlAllowed } from '../src/lib/urlHost';

// The list that ships in src/lib/autoModeration.ts.
const ALLOWED = [
  'myanimelist.net',
  'anilist.co',
  'mal.net',
  'kitsu.io',
  'imgur.com',
  'i.imgur.com',
  'tenor.com',
  'giphy.com',
];

describe('extractHostname', () => {
  test('lowercases the host and ignores path, query and fragment', () => {
    expect(extractHostname('https://GIPHY.com/media/x?a=1#f')).toBe('giphy.com');
  });

  test('strips trailing prose punctuation', () => {
    expect(extractHostname('https://giphy.com/x.')).toBe('giphy.com');
    expect(extractHostname('https://giphy.com/x),')).toBe('giphy.com');
    expect(extractHostname('(https://giphy.com/x)')).toBe(null); // leading paren is part of the scheme
  });

  test('returns the real host for userinfo URLs', () => {
    expect(extractHostname('https://giphy.com@evil.com/x')).toBe('evil.com');
  });

  test('returns null for anything that will not parse', () => {
    for (const bad of ['', '   ', 'not a url', 'giphy.com', '://x', 'https://']) {
      expect(extractHostname(bad)).toBe(null);
    }
  });
});

describe('isUrlAllowed — the bypasses that used to pass', () => {
  test('rejects an allowlisted domain in the query string', () => {
    expect(isUrlAllowed('https://evil.com/?ref=giphy.com', ALLOWED)).toBe(false);
  });

  test('rejects an allowlisted domain used as a subdomain label', () => {
    expect(isUrlAllowed('https://giphy.com.evil.com/x', ALLOWED)).toBe(false);
  });

  test('rejects an allowlisted domain used as URL userinfo', () => {
    expect(isUrlAllowed('https://giphy.com@evil.com/x', ALLOWED)).toBe(false);
  });

  test('rejects an allowlisted domain in the path', () => {
    expect(isUrlAllowed('https://evil.com/giphy.com/cat.gif', ALLOWED)).toBe(false);
  });

  test('rejects a suffix-glued host', () => {
    expect(isUrlAllowed('https://notgiphy.com/x', ALLOWED)).toBe(false);
    expect(isUrlAllowed('https://giphy.company/x', ALLOWED)).toBe(false);
  });
});

describe('isUrlAllowed — legitimate links still pass', () => {
  test('accepts exact allowlisted hosts', () => {
    for (const domain of ALLOWED) {
      expect(isUrlAllowed(`https://${domain}/some/path`, ALLOWED)).toBe(true);
    }
  });

  test('accepts subdomains of allowlisted hosts', () => {
    expect(isUrlAllowed('https://media.giphy.com/media/x.gif', ALLOWED)).toBe(true);
    expect(isUrlAllowed('https://i.imgur.com/abc.png', ALLOWED)).toBe(true);
    expect(isUrlAllowed('https://cdn.deep.nested.tenor.com/x', ALLOWED)).toBe(true);
  });

  test('accepts http as well as https', () => {
    expect(isUrlAllowed('http://giphy.com/x', ALLOWED)).toBe(true);
  });
});

describe('isHostAllowed properties', () => {
  const hostLabel = fc.stringMatching(/^[a-z0-9]{1,12}$/);

  test('an allowlisted domain is always allowed, in any letter case', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALLOWED), fc.boolean(), (domain, upper) =>
        isHostAllowed(upper ? domain.toUpperCase() : domain, ALLOWED)
      ),
      { numRuns: 100 }
    );
  });

  test('any subdomain of an allowlisted domain is allowed', () => {
    fc.assert(
      fc.property(hostLabel, fc.constantFrom(...ALLOWED), (label, domain) =>
        isHostAllowed(`${label}.${domain}`, ALLOWED)
      ),
      { numRuns: 200 }
    );
  });

  test('an allowlisted domain as a left-hand label is never allowed', () => {
    // "giphy.com.attacker.dev" must not inherit giphy's allowance.
    fc.assert(
      fc.property(hostLabel, fc.constantFrom(...ALLOWED), (label, domain) => {
        const host = `${domain}.${label}.dev`;
        return isHostAllowed(host, ALLOWED) === false;
      }),
      { numRuns: 200 }
    );
  });

  test('an empty allowlist allows nothing', () => {
    fc.assert(
      fc.property(hostLabel, (label) => isHostAllowed(`${label}.com`, []) === false),
      { numRuns: 100 }
    );
  });

  test('blank allowlist entries are ignored rather than matching everything', () => {
    fc.assert(
      fc.property(hostLabel, (label) => isHostAllowed(`${label}.com`, ['', '  ', '.']) === false),
      { numRuns: 100 }
    );
  });
});
