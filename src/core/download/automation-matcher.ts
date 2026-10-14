export interface AutoDownloadCandidate {
  title?: string;
  episodeNumber?: number | null;
  seasonNumber?: number | null;
  quality?: string | null;
  language?: string | null;
  providerId?: string;
  sourceType?: string | null;
  releaseGroup?: string | null;
  source?: string | null;
  subtitles?: Array<{ language?: string; lang?: string; label?: string }>;
}

export interface AutoDownloadRulePreferences {
  preferredQuality: string;
  audioLanguage: string;
  fallbackLanguage: string;
  providerPriority: string[];
  titleComparisonType?: 'exact' | 'contains' | 'fuzzy';
  releaseGroups?: string[];
  resolutions?: string[];
  additionalTerms?: string[];
  excludeTerms?: string[];
  episodeOffset?: number;
  seasonNumber?: number;
  preferredSourceType?: string;
  subtitleLanguage?: string;
  minimumScore?: number;
  preferredLanguages?: string[];
  sourceExtensionIds?: string[];
  languageFallbackMode?: 'switch-source' | 'default' | 'error';
}

export interface AutoDownloadScore {
  score: number;
  reasons: string[];
}

export { scoreAutoDownloadCandidate } from '@tatakai/candidate-scorer';
