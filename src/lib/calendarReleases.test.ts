import { expect, test } from 'bun:test';
import { deduplicateReleases } from './calendarReleases';

test('merges identical events while preserving chapters, volumes, dates, and regions', () => {
  const item = { id:'1', seriesId:'mu:42', title:'A Story!', date:'2026-10-30', chapter:'12', provider:'mangaupdates', region:'US', releaseKind:'chapter' };
  const rows = deduplicateReleases([item, item,
    { ...item, id:'2', seriesId:'otaku:2', title:'a story', provider:'otakucalendar' },
    { ...item, id:'3', chapter:'13' }, { ...item, id:'4', releaseKind:'volume', chapter:null, volume:'12' },
    { ...item, id:'5', region:'UK' }, { ...item, id:'6', date:'2026-10-31' },
  ]);
  expect(rows).toHaveLength(5);
});

test('does not collapse unknown edition numbers or distinct canonical series', () => {
  const item = { id:'1', seriesId:'mu:42', title:'Same', date:'2026-10-30', chapter:null };
  expect(deduplicateReleases([item, { ...item, id:'2' }])).toHaveLength(2);
  expect(deduplicateReleases([{ ...item, chapter:'1', canonicalSeriesId:'al:1' }, { ...item, id:'3', chapter:'1', canonicalSeriesId:'al:2' }])).toHaveLength(2);
});
