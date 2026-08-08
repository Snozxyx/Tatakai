// Feature: admin-dashboard-overhaul, Property 26: IP address format validation
// **Validates: Requirements 10.1, 10.3**
import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { validateIpAddress } from '../../src/utils/banUtils';

describe('Property 26: IP address format validation', () => {
  // Valid IPv4 generator
  const ipv4Arb = fc.tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

  test('accepts all valid IPv4 addresses', () => {
    fc.assert(
      fc.property(ipv4Arb, (ip) => validateIpAddress(ip) === true),
      { numRuns: 100 }
    );
  });

  test('accepts known valid IPv6 addresses', () => {
    const validIPv6 = [
      '::1',
      '::',
      '2001:db8::1',
      'fe80::1',
      '2001:0db8:0000:0000:0000:0000:0000:0001',
      '::ffff:192.0.2.1',
    ];
    for (const ip of validIPv6) {
      expect(validateIpAddress(ip)).toBe(true);
    }
  });

  test('rejects strings that are clearly not IP addresses', () => {
    const invalid = ['not-an-ip', 'hello', '', 'foo.bar.baz.qux', '999.999.999.999'];
    for (const ip of invalid) {
      expect(validateIpAddress(ip)).toBe(false);
    }
  });

  test('rejects IPv4 with out-of-range octets', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 256, max: 999 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (a, b, c, d) => validateIpAddress(`${a}.${b}.${c}.${d}`) === false
      ),
      { numRuns: 100 }
    );
  });
});
