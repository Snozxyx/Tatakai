import { test, expect } from 'bun:test';
import { chooseAutomaticMatch } from '../src/core/library/match-policy';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { identifyMediaFiles, groupMediaBySeries } = require('../desktop/runtime/library/media-identifier.cjs');
const candidate = (confidence: number, seasonConflict = false) => ({ mediaId: String(confidence), title: 'Fixture', confidence, seasonConflict });
test('ambiguous, low-confidence and conflicting-season matches require review', () => {
  expect(chooseAutomaticMatch([candidate(94)])).toBeUndefined();
  expect(chooseAutomaticMatch([candidate(99), candidate(93)])).toBeUndefined();
  expect(chooseAutomaticMatch([candidate(100, true)])).toBeUndefined();
  expect(chooseAutomaticMatch([candidate(95), candidate(85)])?.confidence).toBe(95);
});
test('numeric title tokens and seasons remain separate library identities', () => {
  const identified = identifyMediaFiles(['C:/media/Mob Psycho 100 - S01E01 [1080p].mkv', 'C:/media/Mob Psycho 100 - S02E01 [1080p].mkv', 'C:/media/86 - S01E01 [1080p].mkv']);
  const grouped = groupMediaBySeries(identified);
  expect(Object.keys(grouped)).toHaveLength(3);
  expect(Object.keys(grouped).filter(key => key.includes('100'))).toHaveLength(2);
  expect(Object.keys(grouped).some(key => key.includes('86'))).toBe(true);
});
