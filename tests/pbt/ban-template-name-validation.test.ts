// Feature: admin-dashboard-overhaul, Property 31: Ban template name uniqueness and length
// **Validates: Requirements 12.2, 12.3**
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { validateTemplateName } from '../../src/utils/banUtils';

describe('Property 31: Ban template name uniqueness and length', () => {
  test('accepts names 1-100 chars that are not in existingNames', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 100 })),
        (name, existingNames) => {
          // Ensure name is not in existingNames for this test
          const filteredExisting = existingNames.filter(n => n !== name);
          return validateTemplateName(name, filteredExisting) === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('rejects empty names', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        (existingNames) => validateTemplateName('', existingNames) === false
      ),
      { numRuns: 100 }
    );
  });

  test('rejects names longer than 100 chars', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 200 }),
        fc.array(fc.string()),
        (name, existingNames) => validateTemplateName(name, existingNames) === false
      ),
      { numRuns: 100 }
    );
  });

  test('rejects names that already exist (case-sensitive)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 100 })),
        (name, others) => {
          const existingNames = [...others, name];
          return validateTemplateName(name, existingNames) === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});
