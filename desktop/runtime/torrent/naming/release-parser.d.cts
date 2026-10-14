export interface ParsedFilename {
  title: string; searchTitle: string; episodeNumber: number | null; season: number | null;
  resolution?: string; source?: string; audio?: string; releaseGroup?: string;
  subtitleFormats?: string[]; isBatch?: boolean;
}
export function parseReleaseName(name: string): ParsedFilename;
