import { describe, expect, test } from 'bun:test';
import { getReadingHistory, readingHistoryHref } from '../src/lib/readingHistory';

describe('novel activity history', () => {
  test('includes saved reading progress, excludes unread library entries, and sorts by activity', () => {
    const rows = [
      { manga_id: 'old', format: 'novel', status: 'reading', last_chapter_number: 0, updated_at: '2026-10-01' },
      { manga_id: 'unread', format: 'novel', status: 'reading', updated_at: '2026-10-25' },
      { manga_id: 'planned', format: 'novel', status: 'plan_to_read', last_chapter_key: 'ch1', updated_at: '2026-10-25' },
      { manga_id: 'recent', format: 'novel', status: 'reading', last_chapter_key: 'ch2', updated_at: '2026-10-24' },
    ];
    expect(getReadingHistory(rows).map(row => row.manga_id)).toEqual(['recent', 'old']);
    expect(rows[0].manga_id).toBe('old');
  });

  test('novels resume their provider, chapter and paragraph without confusing manga page progress', () => {
    const href = readingHistoryHref({ manga_id: 'novel:12', format: 'novel', last_chapter_key: 'chapter/?2', last_page_index: 14, last_provider: 'source-a', last_chapter_number: 2, last_chapter_title: 'A new start' });
    const url = new URL(href, 'https://tatakai.me');
    expect(url.pathname).toBe('/novel/read/novel%3A12');
    expect(Object.fromEntries(url.searchParams)).toEqual({ chapterKey: 'chapter/?2', paragraph: '14', provider: 'source-a', chapterNumber: '2', chapterTitle: 'A new start' });
    expect(readingHistoryHref({ manga_id: '12', format: 'novel' })).toBe('/novel/12');
    expect(readingHistoryHref({ manga_id: '12', resolved_manga_id: 'mal:34', last_chapter_key: 'ch1', last_page_index: -1 })).toBe('/manga/read/mal%3A34?chapterKey=ch1&page=0');
  });
});
