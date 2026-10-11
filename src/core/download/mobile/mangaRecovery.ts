import type { MangaDownloadChapter, MangaDownloadSeries } from '@/types/electron-bridge';
const key = 'tatakai:manga:interrupted-jobs';
export function getInterruptedMangaJobs(): Record<string, { series: MangaDownloadSeries; chapter: MangaDownloadChapter }> {
  try {
    const jobs = JSON.parse(localStorage.getItem(key) || '{}');
    return jobs && typeof jobs === 'object' && !Array.isArray(jobs) ? jobs : {};
  } catch { return {}; }
}
export function saveInterruptedMangaJob(series: MangaDownloadSeries, chapter: MangaDownloadChapter): void {
  const jobs = getInterruptedMangaJobs();
  jobs[`manga:${series.anilistId}:${chapter.chapterKey}`] = { series, chapter };
  localStorage.setItem(key, JSON.stringify(jobs));
}
export function removeInterruptedMangaJob(jobId: string): void {
  const jobs = getInterruptedMangaJobs(); delete jobs[jobId]; localStorage.setItem(key, JSON.stringify(jobs));
}
