// Feature: admin-dashboard-overhaul, Property 24: Device ban form field validation
// **Validates: Requirements 9.1**
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { validateDeviceBan } from '../../src/utils/banUtils';

describe('Property 24: Device ban form field validation', () => {
  test('accepts valid device_id [1-255] and reason [1-500]', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 255 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        (device_id, reason) => validateDeviceBan(device_id, reason) === true
      ),
      { numRuns: 100 }
    );
  });

  test('rejects empty device_id', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (reason) => validateDeviceBan('', reason) === false
      ),
      { numRuns: 100 }
    );
  });

  test('rejects device_id longer than 255 chars', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 256, maxLength: 400 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        (device_id, reason) => validateDeviceBan(device_id, reason) === false
      ),
      { numRuns: 100 }
    );
  });

  test('rejects empty reason', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 255 }),
        (device_id) => validateDeviceBan(device_id, '') === false
      ),
      { numRuns: 100 }
    );
  });

  test('rejects reason longer than 500 chars', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 255 }),
        fc.string({ minLength: 501, maxLength: 700 }),
        (device_id, reason) => validateDeviceBan(device_id, reason) === false
      ),
      { numRuns: 100 }
    );
  });
});
