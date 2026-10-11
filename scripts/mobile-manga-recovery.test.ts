import { expect, mock, test } from 'bun:test';
const storage = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
const files = new Map<string, { data: string; size: number }>();
const requests = new Map<string, number>();
const completions: any[] = [];
let pageTwoAvailable = false;
mock.module('@capacitor/core', () => ({ Capacitor: { convertFileSrc: (value: string) => value } }));
mock.module('../src/lib/platform/platform', () => ({ isCapacitor: () => true }));
mock.module('../src/core/download/mobile/mobileDownloadService', () => ({ downloadServiceStart() {}, downloadServiceProgress() {}, downloadServiceFinish() {} }));
mock.module('../src/core/download/manga-download-monitor', () => ({
  mangaJobId: (id: number, key: string) => `manga:${id}:${key}`, markMangaProgress() {}, markMangaError() {},
  markMangaQueued() {}, rememberMangaJobMeta() {}, markMangaCompleted: (value: any) => completions.push(value),
}));
mock.module('../src/core/extensions/mobile/mobileExtensionInstaller', () => ({ initMobileExtensions: async () => {} }));
mock.module('../src/core/extensions/mobile/mobileProxy', () => ({
  isMobileProxyUrl: () => false, isNativeProxyUrl: () => false, normalizeMobileHeaders: (headers: any) => headers || {}, resolveMobileProxy: () => undefined,
  fetchViaMobileProxy: async (url: string) => {
    requests.set(url, (requests.get(url) || 0) + 1);
    if (url.includes('page2') && !pageTwoAvailable) throw new Error('HTTP 404');
    return { ok: true, data: new Uint8Array([1, 2, 3, 4]).buffer, contentType: 'image/png' };
  },
}));
mock.module('../src/core/content/manga-extension-runtime', () => ({ fetchExtensionMangaPages: async () => ({ success: true, data: { pages: [
  { imageUrl: 'https://fixture/page1.png' }, { imageUrl: 'https://fixture/page2.png' },
] } }) }));
mock.module('@capacitor/filesystem', () => ({ Directory: { Documents: 'documents' }, Encoding: { UTF8: 'utf8' }, Filesystem: {
  mkdir: async () => {},
  readFile: async ({ path }: any) => { const file = files.get(path); if (!file) throw new Error('Missing file'); return { data: file.data }; },
  writeFile: async ({ path, data, encoding }: any) => { files.set(path, { data, size: encoding ? data.length : Buffer.from(data, 'base64').length }); },
  rename: async ({ from, to }: any) => { files.set(to, files.get(from)!); files.delete(from); },
  stat: async ({ path }: any) => { if (!files.has(path)) throw new Error('Missing file'); return { size: files.get(path)!.size }; },
  readdir: async ({ path }: any) => ({ files: [...files.keys()].filter(key => key.startsWith(path + '/')).map(key => ({ name: key.split('/').at(-1) })) }),
  deleteFile: async ({ path }: any) => files.delete(path),
} }));
const { downloadMangaChapterMobile, resumeInterruptedMangaDownloads } = await import('../src/core/download/mobile/mobileMangaDownloader');
const { getInterruptedMangaJobs } = await import('../src/core/download/mobile/mangaRecovery');
const { getDownloadAutoResume } = await import('../src/lib/downloadPreferences');
const series = { anilistId: 123, title: 'Fixture Manga' };
const chapter = { chapterKey: 'c4', chapterNumber: 4, provider: 'fixture' };

test('mobile manga retry reuses finished pages and preserves interrupted job across a disabled resume', async () => {
  expect(getDownloadAutoResume()).toBe(true);
  expect((await downloadMangaChapterMobile(series, chapter)).ok).toBe(false);
  expect(completions.length).toBe(0);
  expect(Object.keys(getInterruptedMangaJobs()).length).toBe(1);
  localStorage.setItem('tatakai:download-auto-resume', 'false');
  await resumeInterruptedMangaDownloads();
  expect(requests.get('https://fixture/page1.png')).toBe(1);
  localStorage.setItem('tatakai:download-auto-resume', 'true');
  pageTwoAvailable = true;
  await resumeInterruptedMangaDownloads();
  expect(requests.get('https://fixture/page1.png')).toBe(1);
  expect(completions[0].pageCount).toBe(2);
  expect(Object.keys(getInterruptedMangaJobs()).length).toBe(0);
});
