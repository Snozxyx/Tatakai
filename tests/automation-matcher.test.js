import { describe, expect, test } from 'bun:test';
import { scoreAutoDownloadCandidate } from '../src/core/download/automation-matcher';

describe('scoreAutoDownloadCandidate', () => {
  test('prefers exact episode, title, and quality matches', () => {
    const rule = {
      preferredQuality: '1080p',
      audioLanguage: 'sub',
      fallbackLanguage: 'dub',
      providerPriority: ['provider-a', 'provider-b'],
      preferredSourceType: 'torrent',
      subtitleLanguage: 'en',
    };

    const result = scoreAutoDownloadCandidate(rule, {
      title: 'Attack on Titan',
      episodeNumber: 12,
      quality: '1080p',
      language: 'jpn',
      providerId: 'provider-a',
      sourceType: 'torrent',
    }, ['Attack on Titan']);

    expect(result.score).toBeGreaterThan(100);
    expect(result.reasons).toContain('episode-match');
    expect(result.reasons).toContain('title-match');
    expect(result.reasons).toContain('quality-match');
  });

  test('falls back to alternate language when preferred is absent', () => {
    const rule = {
      preferredQuality: 'auto',
      audioLanguage: 'sub',
      fallbackLanguage: 'dub',
      providerPriority: ['provider-a'],
      preferredSourceType: 'any',
      subtitleLanguage: 'en',
    };

    const result = scoreAutoDownloadCandidate(rule, {
      title: 'Spy x Family',
      episodeNumber: 8,
      quality: '720p',
      language: 'eng',
      providerId: 'provider-a',
      sourceType: 'torrent',
    }, ['Spy x Family']);

    expect(result.score).toBeGreaterThan(50);
    expect(result.reasons).toContain('fallback-language');
  });

  test('rejects candidates that do not satisfy hard filters', () => {
    const rule = {
      preferredQuality: 'auto',
      audioLanguage: 'sub',
      fallbackLanguage: 'none',
      providerPriority: ['provider-a'],
      preferredSourceType: 'torrent',
      subtitleLanguage: 'en',
      releaseGroups: ['SubsPlease'],
      excludeTerms: ['cam'],
      additionalTerms: ['web-dl'],
      titleComparisonType: 'contains',
    };

    const rejected = scoreAutoDownloadCandidate(rule, {
      title: 'My Hero Academia',
      episodeNumber: 1,
      quality: '1080p',
      language: 'jpn',
      providerId: 'provider-a',
      sourceType: 'torrent',
      releaseGroup: 'RandomGroup',
    }, ['My Hero Academia']);

    expect(rejected.score).toBe(0);
    expect(rejected.reasons).toContain('release-group-mismatch');
  });

  test('scores candidate languages based on priority list order', () => {
    const rule = {
      preferredQuality: 'auto',
      audioLanguage: 'none',
      fallbackLanguage: 'none',
      providerPriority: ['provider-a'],
      preferredLanguages: ['hi', 'en', 'ja'],
    };

    const matchHindi = scoreAutoDownloadCandidate(rule, {
      title: 'One Piece',
      episodeNumber: 100,
      language: 'Hindi',
    }, ['One Piece']);

    const matchEnglish = scoreAutoDownloadCandidate(rule, {
      title: 'One Piece',
      episodeNumber: 100,
      language: 'eng',
    }, ['One Piece']);

    const matchJapanese = scoreAutoDownloadCandidate(rule, {
      title: 'One Piece',
      episodeNumber: 100,
      language: 'sub',
    }, ['One Piece']);

    // Hindi is 1st preference (bonus 18)
    // English is 2nd preference (bonus 12)
    // Japanese is 3rd preference (bonus 8)
    expect(matchHindi.score).toBeGreaterThan(matchEnglish.score);
    expect(matchEnglish.score).toBeGreaterThan(matchJapanese.score);
    expect(matchHindi.reasons).toContain('preferred-language');
    expect(matchEnglish.reasons).toContain('fallback-language-1');
    expect(matchJapanese.reasons).toContain('fallback-language-2');
  });
});

