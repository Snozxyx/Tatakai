/**
 * Result Processor
 * Transforms and enriches provider results
 */

import { inferTorrentFileFormat } from '../utils/torrent/matcher.js';
import type { SourceResult, MangaChapterEntry } from '../types/index.js';

/**
 * Ensures every torrent result has proper magnet and file format fields
 */
export function annotateTorrentResults(results: SourceResult[]): SourceResult[] {
  return results.map((result) => {
    if (result.sourceType !== 'torrent') return result;
    
    const magnetLink = result.magnetLink ??
      (result.url.startsWith('magnet:') ? result.url : undefined);
    
    return {
      ...result,
      magnetLink,
      fileFormat: result.fileFormat ??
        inferTorrentFileFormat(result.torrentTitle, magnetLink, result.url),
    };
  });
}

/**
 * Merges manga chapters by chapter number
 * Combines multiple sources for the same chapter into a single entry
 */
export function mergeMangaChapters(all: MangaChapterEntry[]): MangaChapterEntry[] {
  const map = new Map<number, MangaChapterEntry>();
  
  for (const ch of all) {
    if (map.has(ch.number)) {
      // Merge sources for existing chapter
      map.get(ch.number)!.sources.push(...ch.sources);
    } else {
      // Add new chapter entry
      map.set(ch.number, { ...ch, sources: [...ch.sources] });
    }
  }
  
  // Sort by chapter number ascending
  return Array.from(map.values()).sort((a, b) => a.number - b.number);
}
