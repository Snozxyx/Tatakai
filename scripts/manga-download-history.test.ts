import { expect, mock, test } from 'bun:test';

const history: any[] = [];
const offline: any[] = [];
const callbacks: Record<string, (value: any) => void> = {};
mock.module('../src/core/db/tatakai-db', () => ({ db: {
  downloadHistory: { put: async (row: any) => { history.push(row); } },
  offlineChapters: { put: async (row: any) => { offline.push(row); } },
} }));
mock.module('../src/lib/haptics', () => ({ triggerHaptic: async () => {} }));
(globalThis as any).window = { dispatchEvent() {}, electron: { manga: {
  onProgress: (fn: any) => { callbacks.progress = fn; },
  onCompleted: (fn: any) => { callbacks.completed = fn; },
  onError: (fn: any) => { callbacks.error = fn; },
} } };
const monitor = await import('../src/core/download/manga-download-monitor');
monitor.ensureMangaDownloadMonitor();

test('desktop completion carries chapter metadata and duplicate IPC events do not duplicate history', async () => {
  const jobId = monitor.mangaJobId(123, 'v2-ch4');
  monitor.rememberMangaJobMeta(jobId, { title: 'Fixture Manga', chapterNumber: 4, volume: 2, provider: 'Fixture' });
  monitor.markMangaQueued(jobId, { anilistId: 123, chapterKey: 'v2-ch4', title: 'Fixture Manga', chapterLabel: 'Vol 2 · Ch. 4' });
  callbacks.progress({ jobId, anilistId: 123, chapterKey: 'v2-ch4', page: 5, totalPages: 10, percent: 50 });
  expect(history.length).toBe(0);
  const completed = { jobId, anilistId: 123, chapterKey: 'v2-ch4', localDir: '/fixture', pageCount: 10, sizeBytes: 4096 };
  callbacks.completed(completed);
  callbacks.completed(completed);
  await Promise.resolve();
  expect(history.length).toBe(1);
  expect(history[0]).toMatchObject({ mediaType: 'manga', status: 'completed', chapterNumber: 4, volume: 2,
    chapterLabel: 'Vol 2 · Ch. 4', animeTitle: 'Fixture Manga', localPath: '/fixture', fileSizeBytes: 4096 });
  expect(offline[0].chapterNumber).toBe(4);
});

test('failed starts, cancellation, and retry are separate attempts', async () => {
  const jobId = monitor.mangaJobId(123, 'v1-ch4');
  const meta = { anilistId: 123, chapterKey: 'v1-ch4', title: 'Fixture Manga', chapterLabel: 'Vol 1 · Ch. 4' };
  monitor.markMangaQueued(jobId, meta);
  monitor.markMangaFailedStart(jobId, 'IPC failed');
  monitor.markMangaQueued(jobId, meta);
  monitor.markMangaCancelled(jobId);
  callbacks.error({ jobId, anilistId: 123, chapterKey: 'v1-ch4', error: 'cancelled' });
  monitor.markMangaQueued(jobId, meta);
  callbacks.completed({ jobId, anilistId: 123, chapterKey: 'v1-ch4', localDir: '/retry', pageCount: 1, sizeBytes: 100 });
  await Promise.resolve();
  expect(history.slice(1).map(row => row.status)).toEqual(['failed', 'cancelled', 'completed']);
  expect(new Set(history.map(row => row.id)).size).toBe(4);
});
