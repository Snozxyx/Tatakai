import { expect, test } from 'bun:test';
import { preserveNovelReadlistFields } from '../src/lib/reader/novelReadlistPatch';

test('changing a novel status preserves chapter, paragraph and provider already in storage', () => {
  const patch = preserveNovelReadlistFields({ status: 'completed', format: 'novel', last_chapter_key: null,
    last_chapter_number: null, last_page_index: 0, last_provider: null, anilist_id: null },
  { novelId: '42', novelTitle: 'A novel', status: 'completed' });
  expect(patch).toEqual({ status: 'completed', format: 'novel' });
});

test('explicit reading progress and intentional clearing remain writable', () => {
  const patch = preserveNovelReadlistFields({ last_chapter_key: 'chapter-12', last_page_index: 70, last_provider: null },
    { novelId: '42', novelTitle: 'A novel', lastChapterKey: 'chapter-12', lastParagraphIndex: 70, lastProvider: null });
  expect(patch).toEqual({ last_chapter_key: 'chapter-12', last_page_index: 70, last_provider: null });
});
