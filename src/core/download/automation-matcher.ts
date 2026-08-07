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

function normalize(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function includesAny(haystack: string, terms: string[] = []): boolean {
  return terms
    .map(normalize)
    .filter(Boolean)
    .some((term) => haystack.includes(term));
}

function compareTitle(candidateTitle: string, targetTitle: string, comparisonType: AutoDownloadRulePreferences['titleComparisonType'] = 'contains'): boolean {
  const candidate = normalize(candidateTitle);
  const target = normalize(targetTitle);
  if (!candidate || !target) return false;
  if (comparisonType === 'exact') return candidate === target;
  if (comparisonType === 'fuzzy') return candidate.includes(target) || target.includes(candidate);
  return candidate === target || candidate.includes(target) || target.includes(candidate);
}

function matchesLanguagePreference(candidateLang: string, preferred: string): boolean {
  const normalizedCandidate = normalize(candidateLang);
  const normalizedPreferred = normalize(preferred);
  if (!normalizedCandidate || !normalizedPreferred || normalizedPreferred === 'none') return false;

  if (normalizedCandidate.includes(normalizedPreferred)) return true;

  // Japanese / sub aliases
  if (['sub', 'ja', 'jp', 'jpn', 'japanese'].includes(normalizedPreferred) &&
      ['jpn', 'ja', 'jp', 'japanese', 'sub'].some((alias) => normalizedCandidate.includes(alias))) {
    return true;
  }
  // English / dub aliases
  if (['dub', 'en', 'eng', 'english'].includes(normalizedPreferred) &&
      ['eng', 'en', 'english', 'dub', 'dual audio', 'multi audio'].some((alias) => normalizedCandidate.includes(alias))) {
    return true;
  }
  // Hindi aliases
  if (['hi', 'hin', 'hindi'].includes(normalizedPreferred) &&
      ['hi', 'hin', 'hindi'].some((alias) => normalizedCandidate.includes(alias))) {
    return true;
  }
  if (normalizedPreferred === 'multi' && ['multi', 'dual', 'both', 'dual audio'].some((alias) => normalizedCandidate.includes(alias))) {
    return true;
  }
  return false;
}

export function scoreAutoDownloadCandidate(
  rule: AutoDownloadRulePreferences,
  candidate: AutoDownloadCandidate,
  targetTitles: string[] = []
): AutoDownloadScore {
  const reasons: string[] = [];
  let score = 0;
  const normalizedCandidateTitle = normalize(candidate.title);
  const normalizedCandidateGroup = normalize(candidate.releaseGroup);
  const normalizedCandidateSource = normalize(candidate.sourceType || candidate.source);
  const normalizedCandidateSeason = candidate.seasonNumber ?? undefined;
  const episodeOffset = Number(rule.episodeOffset || 0);

  const normalizedTargetTitles = targetTitles.map(normalize).filter(Boolean);
  const titleComparisonType = rule.titleComparisonType || 'contains';
  const hasTitleMatch = normalizedTargetTitles.some((title) => compareTitle(normalizedCandidateTitle, title, titleComparisonType));

  const requiredGroups = (rule.releaseGroups || []).map(normalize).filter(Boolean);
  const requiredResolutions = (rule.resolutions || []).map(normalize).filter(Boolean);
  const additionalTerms = (rule.additionalTerms || []).map(normalize).filter(Boolean);
  const excludeTerms = (rule.excludeTerms || []).map(normalize).filter(Boolean);

  if (excludeTerms.length) {
    const candidateBlob = [normalizedCandidateTitle, normalizedCandidateGroup, normalize(candidate.quality), normalize(candidate.language), normalizedCandidateSource].join(' ');
    if (includesAny(candidateBlob, excludeTerms)) {
      return { score: 0, reasons: ['excluded-term'] };
    }
  }

  if (requiredGroups.length && !requiredGroups.includes(normalizedCandidateGroup)) {
    return { score: 0, reasons: ['release-group-mismatch'] };
  }

  if (requiredResolutions.length) {
    const candidateResolution = normalize(candidate.quality);
    if (!requiredResolutions.some((resolution) => candidateResolution.includes(resolution))) {
      return { score: 0, reasons: ['resolution-mismatch'] };
    }
  }

  if (additionalTerms.length) {
    const candidateBlob = [normalizedCandidateTitle, normalizedCandidateGroup, normalize(candidate.quality), normalize(candidate.language), normalizedCandidateSource].join(' ');
    if (!includesAny(candidateBlob, additionalTerms)) {
      return { score: 0, reasons: ['additional-term-mismatch'] };
    }
  }

  if (hasTitleMatch) {
    score += 45;
    reasons.push('title-match');
  }

  if (candidate.episodeNumber != null) {
    score += 30;
    reasons.push('episode-match');
  }

  if (rule.seasonNumber != null && normalizedCandidateSeason != null && rule.seasonNumber === normalizedCandidateSeason) {
    score += 10;
    reasons.push('season-match');
  }

  if (episodeOffset && candidate.episodeNumber != null) {
    const expectedEpisode = candidate.episodeNumber - episodeOffset;
    if (expectedEpisode > 0) {
      score += 5;
      reasons.push('episode-offset');
    }
  }

  const preferredQuality = String(rule.preferredQuality || 'auto').toLowerCase();
  const candidateQuality = String(candidate.quality || '').toLowerCase();
  if (preferredQuality === 'auto' || !candidateQuality) {
    score += 8;
    reasons.push('quality-auto');
  } else if (candidateQuality.includes(preferredQuality)) {
    score += 20;
    reasons.push('quality-match');
  }

  const candidateLang = normalize(candidate.language);
  if (rule.preferredLanguages && rule.preferredLanguages.length > 0) {
    let matched = false;
    for (let i = 0; i < rule.preferredLanguages.length; i++) {
      const preferred = rule.preferredLanguages[i];
      if (matchesLanguagePreference(candidateLang, preferred)) {
        const scoreBonus = i === 0 ? 18 : i === 1 ? 12 : i === 2 ? 8 : 4;
        score += scoreBonus;
        reasons.push(i === 0 ? 'preferred-language' : `fallback-language-${i}`);
        matched = true;
        break;
      }
    }
  } else {
    const preferredLang = normalize(rule.audioLanguage);
    const fallbackLang = normalize(rule.fallbackLanguage);
    if (preferredLang && preferredLang !== 'none' && matchesLanguagePreference(candidateLang, preferredLang)) {
      score += 18;
      reasons.push('preferred-language');
    } else if (fallbackLang && fallbackLang !== 'none' && matchesLanguagePreference(candidateLang, fallbackLang)) {
      score += 12;
      reasons.push('fallback-language');
    }
  }

  if (candidate.providerId) {
    const providerPriority = rule.providerPriority || [];
    const providerIndex = providerPriority.indexOf(candidate.providerId);
    if (providerIndex >= 0) {
      score += Math.max(1, 10 - providerIndex);
      reasons.push('provider-priority');
    }
  }

  const preferredSourceType = normalize(rule.preferredSourceType || 'any');
  const candidateSourceType = normalize(candidate.sourceType);
  if (!preferredSourceType || preferredSourceType === 'any' || preferredSourceType === candidateSourceType) {
    score += 6;
    reasons.push('source-type');
  }

  if (candidate.releaseGroup && normalizedCandidateGroup) {
    score += 3;
    reasons.push('release-group');
  }

  if (rule.minimumScore != null && score < rule.minimumScore) {
    return { score, reasons: [...reasons, 'below-minimum-score'] };
  }

  return { score, reasons };
}
