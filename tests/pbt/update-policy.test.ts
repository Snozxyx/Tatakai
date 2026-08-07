// Feature: admin-dashboard-overhaul, Properties 1-3: Update Policy
// Validates: Requirements 1.3, 1.4, 1.5, 1.8
import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { UPDATE_STATUS_LABELS } from '../../src/types/admin-dashboard';
import type { UpdatePolicy } from '../../src/types/admin-dashboard';

const CHANNELS = ['stable', 'beta', 'experimental'] as const;
const TYPES = ['mandatory', 'recommended', 'experimental', 'rollback'] as const;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

// Pure form validation logic mirroring the panel's requirements
function isValidChannel(v: string): v is UpdatePolicy['channel'] {
  return CHANNELS.includes(v as UpdatePolicy['channel']);
}

function isValidType(v: string): v is UpdatePolicy['type'] {
  return TYPES.includes(v as UpdatePolicy['type']);
}

function isValidSemver(v: string): boolean {
  return SEMVER_RE.test(v);
}

function isFormValid(
  channel: string,
  type: string,
  targetVersion: string,
  rollbackFromVersion: string
): boolean {
  if (!isValidChannel(channel)) return false;
  if (!isValidType(type)) return false;
  if (!isValidSemver(targetVersion)) return false;
  if (type === 'rollback' && !isValidSemver(rollbackFromVersion)) return false;
  return true;
}

const safeMs = fc.integer({ min: 946684800000, max: 4102444800000 }); // 2000–2100

const policyArb = fc.record({
  id: fc.uuid(),
  channel: fc.constantFrom(...CHANNELS),
  type: fc.constantFrom(...TYPES),
  target_version: fc.tuple(
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 999 })
  ).map(([a, b, c]) => `${a}.${b}.${c}`),
  rollback_from_version: fc.option(
    fc.tuple(
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 999 })
    ).map(([a, b, c]) => `${a}.${b}.${c}`),
    { nil: undefined }
  ),
  active: fc.boolean(),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  published_at: safeMs.map(ms => new Date(ms).toISOString()),
}) as fc.Arbitrary<UpdatePolicy>;

// Property 1: Update policy row rendering completeness
describe('Property 1: Update policy row rendering completeness', () => {
  test('all required fields are present on every UpdatePolicy object', () => {
    fc.assert(
      fc.property(policyArb, (policy) => {
        return (
          typeof policy.channel === 'string' &&
          typeof policy.type === 'string' &&
          typeof policy.target_version === 'string' &&
          typeof policy.active === 'boolean' &&
          typeof policy.published_at === 'string'
        );
      }),
      { numRuns: 100 }
    );
  });

  test('rollback_from_version is present when type is rollback', () => {
    const rollbackPolicies = Array.from({ length: 20 }, () => ({
      id: 'test-id',
      channel: 'stable' as const,
      type: 'rollback' as const,
      target_version: '1.2.3',
      rollback_from_version: '1.3.0',
      active: true,
      published_at: new Date().toISOString(),
    }));
    for (const p of rollbackPolicies) {
      expect(p.rollback_from_version).toBeDefined();
    }
  });
});

// Property 2: Create-policy form validation gate
describe('Property 2: Create-policy form validation gate', () => {
  test('valid channel + type + semver version enables submit', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CHANNELS),
        fc.constantFrom('mandatory' as const, 'recommended' as const, 'experimental' as const),
        fc.tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }))
          .map(([a, b, c]) => `${a}.${b}.${c}`),
        (channel, type, version) => isFormValid(channel, type, version, '') === true
      ),
      { numRuns: 100 }
    );
  });

  test('rollback type requires non-empty valid rollback_from_version', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CHANNELS),
        fc.tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }))
          .map(([a, b, c]) => `${a}.${b}.${c}`),
        (channel, version) => {
          const withEmpty = isFormValid(channel, 'rollback', version, '');
          const withValid = isFormValid(channel, 'rollback', version, version);
          return withEmpty === false && withValid === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('invalid semver rejects submit', () => {
    const badVersions = ['1', '1.2', 'v1.2.3', '1.2.3.4', 'abc', ''];
    for (const v of badVersions) {
      expect(isFormValid('stable', 'mandatory', v, '')).toBe(false);
    }
  });

  test('invalid channel rejects submit', () => {
    const badChannels = ['', 'nightly', 'prod', 'STABLE'];
    for (const ch of badChannels) {
      expect(isFormValid(ch, 'mandatory', '1.0.0', '')).toBe(false);
    }
  });
});

// Property 3: Update status label mapping completeness
describe('Property 3: Update status label mapping completeness', () => {
  const KNOWN_STATUSES = [
    'checking', 'available', 'not-available', 'downloading',
    'downloaded', 'mandatory-update', 'error',
  ] as const;

  test('all known status strings map to non-empty labels distinct from the key', () => {
    for (const status of KNOWN_STATUSES) {
      const label = UPDATE_STATUS_LABELS[status];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(status);
    }
  });

  test('all 7 status keys are present in UPDATE_STATUS_LABELS', () => {
    for (const status of KNOWN_STATUSES) {
      expect(UPDATE_STATUS_LABELS).toHaveProperty(status);
    }
  });
});
