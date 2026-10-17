import { describe, expect, test } from 'bun:test';
import { compareAppVersions } from '../src/core/update/version';

describe('mobile manual-update version comparison', () => {
  test('TV flavor suffix does not trigger the same version update repeatedly', () => {
    expect(compareAppVersions('6.1.2', '6.1.2-tv')).toBe(0);
    expect(compareAppVersions('6.1.3', '6.1.2-tv')).toBe(1);
  });
  test('accepts GitHub v-prefixed tags', () => {
    expect(compareAppVersions('v6.0.4', '6.0.3')).toBe(1);
  });

  test('treats matching app and release versions as current', () => {
    expect(compareAppVersions('6.0.3', '6.0.3')).toBe(0);
  });

  test('compares each numeric component instead of lexicographic text', () => {
    expect(compareAppVersions('6.10.0', '6.9.9')).toBe(1);
    expect(compareAppVersions('5.12.9', '6.0.0')).toBe(-1);
  });
});
