import { describe, expect, it } from 'bun:test';
import { confidentCompatibilityTitle } from '../src/core/extensions/compatibility/matching';
describe('compatibility route matching', () => {
  it('matches a single title without losing its upstream ID', () => expect(confidentCompatibilityTitle([{ id: '9223372036854775807', title: 'Naruto' }], 'Naruto')).toBe('9223372036854775807'));
  it('rejects ambiguous editions and different seasons', () => {
    expect(confidentCompatibilityTitle([{ id: 'a', title: 'Naruto' }, { id: 'b', title: 'Naruto' }], 'Naruto')).toBeNull();
    expect(confidentCompatibilityTitle([{ id: 'a', title: 'Show Season 2' }], 'Show Season 1')).toBeNull();
  });
});
