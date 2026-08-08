// Feature: admin-dashboard-overhaul, Property 25: Device ID display truncation
// Validates: Requirements 9.5
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { truncateDeviceId } from '../../src/utils/banUtils';

describe('Property 25: Device ID display truncation', () => {
  test('strings > 20 chars: display is first 20 chars, full is complete value', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 21, maxLength: 300 }),
        (device_id) => {
          const { display, full } = truncateDeviceId(device_id);
          return (
            display === device_id.slice(0, 20) &&
            full === device_id
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('strings <= 20 chars: display equals full value unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20 }),
        (device_id) => {
          const { display, full } = truncateDeviceId(device_id);
          return display === device_id && full === device_id;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('full always equals the original device_id regardless of length', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (device_id) => {
          const { full } = truncateDeviceId(device_id);
          return full === device_id;
        }
      ),
      { numRuns: 100 }
    );
  });
});
