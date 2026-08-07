/**
 * Property-based tests for ReleaseParser robustness.
 *
 * **Property 1: Parser never crashes on arbitrary input**
 *
 * For any string passed to `parseReleaseName()`, the function must return a
 * valid `ParsedRelease` object with `confidence` in [0, 100] and must never
 * throw an exception.
 *
 * **Validates: Requirements 13.1, 13.2**
 */

import { describe, it, expect } from 'bun:test';
import { createRequire } from 'module';
import * as fc from 'fast-check';

const require = createRequire(import.meta.url);
const { parseReleaseName } = require('../desktop/runtime/torrent/naming/release-parser.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a value is a valid ParsedRelease object.
 * Checks shape and confidence range without being overly strict about
 * optional fields (which may be undefined for arbitrary inputs).
 */
function assertValidParsedRelease(result, input) {
  // Must be a non-null object
  expect(typeof result).toBe('object');
  expect(result).not.toBeNull();

  // confidence must be a number in [0, 100]
  expect(typeof result.confidence).toBe('number');
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(100);

  // raw must equal the original input
  expect(result.raw).toBe(input);

  // Boolean fields must be booleans
  expect(typeof result.isSpecial).toBe('boolean');
  expect(typeof result.isBatch).toBe('boolean');
  expect(typeof result.isDualAudio).toBe('boolean');
  expect(typeof result.isHardSub).toBe('boolean');
  expect(typeof result.isTrusted).toBe('boolean');
  expect(typeof result.remux).toBe('boolean');

  // Array fields must be arrays
  expect(Array.isArray(result.audio)).toBe(true);
  expect(Array.isArray(result.subtitleFormats)).toBe(true);

  // searchTitle must be a string
  expect(typeof result.searchTitle).toBe('string');
}

// ---------------------------------------------------------------------------
// Unit tests — specific edge cases
// ---------------------------------------------------------------------------

describe('parseReleaseName — edge case unit tests', () => {
  it('handles empty string without throwing', () => {
    const result = parseReleaseName('');
    assertValidParsedRelease(result, '');
    expect(result.confidence).toBe(0);
  });

  it('handles null-like input (undefined coerced to string) without throwing', () => {
    // The function accepts any value; undefined becomes 'undefined' via String()
    const result = parseReleaseName(undefined);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it('handles null input without throwing', () => {
    const result = parseReleaseName(null);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it('handles a very long string without throwing', () => {
    const longInput = 'A'.repeat(100_000);
    const result = parseReleaseName(longInput);
    assertValidParsedRelease(result, longInput);
  });

  it('handles a string of only special characters without throwing', () => {
    const input = '!@#$%^&*()[]{}|\\/<>?~`\'"';
    const result = parseReleaseName(input);
    assertValidParsedRelease(result, input);
  });

  it('handles unicode and emoji without throwing', () => {
    const input = '竜神 🎌 Ryūjin — Anime Title S01E05 [1080p]';
    const result = parseReleaseName(input);
    assertValidParsedRelease(result, input);
  });

  it('handles a string of only whitespace without throwing', () => {
    const input = '   \t\n\r   ';
    const result = parseReleaseName(input);
    assertValidParsedRelease(result, input);
  });

  it('handles a string with null bytes without throwing', () => {
    const input = 'Anime\x00Title\x00S01E01';
    const result = parseReleaseName(input);
    assertValidParsedRelease(result, input);
  });

  it('handles a numeric string without throwing', () => {
    const input = '12345678901234567890';
    const result = parseReleaseName(input);
    assertValidParsedRelease(result, input);
  });

  it('handles a string with only brackets without throwing', () => {
    const input = '[[[[]]]]((()))';
    const result = parseReleaseName(input);
    assertValidParsedRelease(result, input);
  });

  it('handles a string with regex special characters without throwing', () => {
    const input = '(.*+?^${}()|[]\\)';
    const result = parseReleaseName(input);
    assertValidParsedRelease(result, input);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — Property 1
// ---------------------------------------------------------------------------

/**
 * Property 1: Parser never crashes on arbitrary input
 *
 * For any string passed to `parseReleaseName()`, the function must:
 * 1. Never throw an exception
 * 2. Return a valid ParsedRelease object
 * 3. Return confidence in [0, 100]
 *
 * **Validates: Requirements 13.1, 13.2**
 */
describe('parseReleaseName — Property 1: parser never crashes on arbitrary input', () => {
  // -------------------------------------------------------------------------
  // Arbitrary strings (full unicode range)
  // -------------------------------------------------------------------------

  it('never throws for any arbitrary string', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        let result;
        expect(() => {
          result = parseReleaseName(input);
        }).not.toThrow();

        assertValidParsedRelease(result, input);
      }),
      { numRuns: 500, seed: 42 }
    );
  });

  // -------------------------------------------------------------------------
  // Strings with full unicode (including surrogates, emoji, CJK)
  // -------------------------------------------------------------------------

  it('never throws for strings with full unicode characters', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (input) => {
        let result;
        expect(() => {
          result = parseReleaseName(input);
        }).not.toThrow();

        // confidence must be in [0, 100]
        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);

        // Must be a non-null object
        expect(typeof result).toBe('object');
        expect(result).not.toBeNull();
      }),
      { numRuns: 300, seed: 99 }
    );
  });

  // -------------------------------------------------------------------------
  // Very long strings
  // -------------------------------------------------------------------------

  it('never throws for very long strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1000, maxLength: 50_000 }),
        (input) => {
          let result;
          expect(() => {
            result = parseReleaseName(input);
          }).not.toThrow();

          expect(typeof result.confidence).toBe('number');
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 50, seed: 7 }
    );
  });

  // -------------------------------------------------------------------------
  // Strings that look like anime filenames (realistic inputs)
  // -------------------------------------------------------------------------

  it('never throws for realistic anime filename patterns', () => {
    const groups = fc.constantFrom(
      'SubsPlease', 'Erai-raws', 'HorribleSubs', 'EMBER', 'Judas', 'GJM', 'RandomGroup'
    );
    const titles = fc.constantFrom(
      'Naruto', 'One Piece', 'Attack on Titan', 'Re:Zero', '86', 'Demon Slayer',
      'My Hero Academia', 'Sword Art Online', 'Fullmetal Alchemist Brotherhood'
    );
    const episodes = fc.integer({ min: 1, max: 999 });
    const resolutions = fc.constantFrom('480p', '720p', '1080p', '2160p', '');
    const codecs = fc.constantFrom('x264', 'x265', 'HEVC', 'AV1', '');
    const sources = fc.constantFrom('WEB-DL', 'BluRay', 'AMZN', 'CR', '');
    const extensions = fc.constantFrom('.mkv', '.mp4', '.avi', '');

    const filenameArb = fc.tuple(groups, titles, episodes, resolutions, codecs, sources, extensions).map(
      ([group, title, ep, res, codec, src, ext]) => {
        const epStr = String(ep).padStart(2, '0');
        const parts = [title, `-`, epStr, res, codec, src].filter(Boolean).join(' ');
        return `[${group}] ${parts}${ext}`;
      }
    );

    fc.assert(
      fc.property(filenameArb, (input) => {
        let result;
        expect(() => {
          result = parseReleaseName(input);
        }).not.toThrow();

        assertValidParsedRelease(result, input);
      }),
      { numRuns: 300, seed: 13 }
    );
  });

  // -------------------------------------------------------------------------
  // Strings with only special/control characters
  // -------------------------------------------------------------------------

  it('never throws for strings composed of special characters', () => {
    const SPECIAL_CHARS = '[](){ }-_.!?:;/\\|@#$%^&*+=~`"\'';
    const specialChars = fc.string({
      unit: fc.constantFrom(...SPECIAL_CHARS.split('')),
    });

    fc.assert(
      fc.property(specialChars, (input) => {
        let result;
        expect(() => {
          result = parseReleaseName(input);
        }).not.toThrow();

        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
      }),
      { numRuns: 300, seed: 55 }
    );
  });

  // -------------------------------------------------------------------------
  // Confidence is always clamped to [0, 100] — explicit property
  // -------------------------------------------------------------------------

  it('confidence is always in [0, 100] for any input', () => {
    fc.assert(
      fc.property(fc.oneof(
        fc.string(),
        fc.string({ unit: 'grapheme' }),
        fc.constant(''),
        fc.constant(null),
        fc.constant(undefined),
        fc.integer().map(String),
        fc.float().map(String),
      ), (input) => {
        const result = parseReleaseName(input);
        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
      }),
      { numRuns: 500, seed: 77 }
    );
  });

  // -------------------------------------------------------------------------
  // Returned object always has the expected shape
  // -------------------------------------------------------------------------

  it('returned object always has the expected ParsedRelease shape', () => {
    const REQUIRED_BOOLEAN_FIELDS = ['isSpecial', 'isBatch', 'isDualAudio', 'isHardSub', 'isTrusted', 'remux'];
    const REQUIRED_ARRAY_FIELDS = ['audio', 'subtitleFormats'];

    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parseReleaseName(input);

        // Must be a non-null object
        expect(typeof result).toBe('object');
        expect(result).not.toBeNull();

        // confidence: number in [0, 100]
        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);

        // raw: must equal input
        expect(result.raw).toBe(input);

        // searchTitle: must be a string
        expect(typeof result.searchTitle).toBe('string');

        // Boolean fields
        for (const field of REQUIRED_BOOLEAN_FIELDS) {
          expect(typeof result[field]).toBe('boolean');
        }

        // Array fields
        for (const field of REQUIRED_ARRAY_FIELDS) {
          expect(Array.isArray(result[field])).toBe(true);
        }
      }),
      { numRuns: 500, seed: 33 }
    );
  });
});
