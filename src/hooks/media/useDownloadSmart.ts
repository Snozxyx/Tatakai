/**
 * Phase D3 — smart download orchestration (auto-queue next N, quality ladder, subtitle prefetch).
 * Hooks here will subscribe to the modular download manager once the queue service exposes events.
 */
export function useDownloadSmart(_opts?: { animeId?: string }) {
  return {
    autoQueueNext: async (_count: number) => {
      /* wired when download manager exposes season graphs */
    },
    prefetchSubtitlesForEpisode: async (_episodeId: string) => {
      /* wired to playback manifest + caption pipeline */
    },
  };
}
