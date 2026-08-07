/**
 * Unit tests for banUtils.ts
 *
 * Covers: validateCustomDuration and formatBanDuration
 * Requirements: 8.2, 8.6, 8.7
 */

import { describe, it, expect } from 'bun:test';
import { validateCustomDuration, formatBanDuration } from '../src/utils/banUtils';

// ---------------------------------------------------------------------------
// validateCustomDuration
// ---------------------------------------------------------------------------

describe('validateCustomDuration', () => {
  it('accepts the minimum valid value (1)', () => {
    expect(validateCustomDuration(1)).toBe(true);
  });

  it('accepts the maximum valid value (8760)', () => {
    expect(validateCustomDuration(8760)).toBe(true);
  });

  it('accepts a mid-range integer', () => {
    expect(validateCustomDuration(168)).toBe(true); // 7 days
    expect(validateCustomDuration(720)).toBe(true); // 30 days
  });

  it('rejects zero', () => {
    expect(validateCustomDuration(0)).toBe(false);
  });

  it('rejects negative values', () => {
    expect(validateCustomDuration(-1)).toBe(false);
    expect(validateCustomDuration(-100)).toBe(false);
  });

  it('rejects values above 8760', () => {
    expect(validateCustomDuration(8761)).toBe(false);
    expect(validateCustomDuration(10000)).toBe(false);
  });

  it('rejects non-integer values', () => {
    expect(validateCustomDuration(1.5)).toBe(false);
    expect(validateCustomDuration(0.5)).toBe(false);
    expect(validateCustomDuration(8759.9)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(validateCustomDuration(NaN)).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(validateCustomDuration(Infinity)).toBe(false);
    expect(validateCustomDuration(-Infinity)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatBanDuration
// ---------------------------------------------------------------------------

describe('formatBanDuration', () => {
  const now = new Date('2024-01-15T12:00:00.000Z');

  it('returns "Banned · permanent" for null', () => {
    expect(formatBanDuration(null, now)).toBe('Banned · permanent');
  });

  it('shows days and hours when both are non-zero', () => {
    // 6 days 12 hours from now
    const expiresAt = new Date(now.getTime() + (6 * 24 + 12) * 60 * 60 * 1000).toISOString();
    expect(formatBanDuration(expiresAt, now)).toBe('Banned · expires in 6 days 12 hours');
  });

  it('omits hours when hours = 0 (exactly N days remaining)', () => {
    // Exactly 2 days from now
    const expiresAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatBanDuration(expiresAt, now)).toBe('Banned · expires in 2 days');
  });

  it('omits days when days = 0 (less than 24 hours remaining)', () => {
    // Exactly 3 hours from now
    const expiresAt = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
    expect(formatBanDuration(expiresAt, now)).toBe('Banned · expires in 3 hours');
  });

  it('uses singular "day" when days = 1', () => {
    const expiresAt = new Date(now.getTime() + (24 + 5) * 60 * 60 * 1000).toISOString();
    expect(formatBanDuration(expiresAt, now)).toBe('Banned · expires in 1 day 5 hours');
  });

  it('uses singular "hour" when hours = 1', () => {
    const expiresAt = new Date(now.getTime() + (48 + 1) * 60 * 60 * 1000).toISOString();
    expect(formatBanDuration(expiresAt, now)).toBe('Banned · expires in 2 days 1 hour');
  });

  it('shows "0 hours" when less than 1 hour remaining', () => {
    // 30 minutes remaining
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    expect(formatBanDuration(expiresAt, now)).toBe('Banned · expires in 0 hours');
  });

  it('handles 7-day preset (168 hours)', () => {
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatBanDuration(expiresAt, now)).toBe('Banned · expires in 7 days');
  });

  it('handles 30-day preset (720 hours)', () => {
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatBanDuration(expiresAt, now)).toBe('Banned · expires in 30 days');
  });

  it('uses default now parameter when not specified', () => {
    // Just verify it doesn't throw and returns the correct prefix
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(formatBanDuration(futureExpiry)).toMatch(/^Banned · expires in /);
  });
});
