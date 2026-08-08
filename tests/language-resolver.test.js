import { describe, expect, test } from 'bun:test';
import { resolveExtensionForEpisode } from '../src/core/download/language-resolver';

describe('resolveExtensionForEpisode', () => {
  test('resolves preferred language strictly when available', async () => {
    const mockProviderA = {
      id: 'prov-a',
      name: 'Provider A',
      type: 'torrent',
      search: async () => [],
      getEpisodeLanguages: async (id, ep) => [
        { language: 'ja', label: 'Japanese', type: 'audio' },
      ],
    };

    const mockProviderB = {
      id: 'prov-b',
      name: 'Provider B',
      type: 'onlinestream',
      search: async () => [],
      getEpisodeLanguages: async (id, ep) => [
        { language: 'en', label: 'English', type: 'audio' },
        { language: 'hi', label: 'Hindi', type: 'audio' },
      ],
    };

    // User wants Hindi first, then English, then Japanese
    const providers = [mockProviderA, mockProviderB];
    const preferredLanguages = ['hi', 'en', 'ja'];

    const result = await resolveExtensionForEpisode(providers, 1, 100, preferredLanguages);

    expect(result).not.toBeNull();
    expect(result.provider.id).toBe('prov-b');
    expect(result.resolvedLanguage).toBe('hi');
    expect(result.matchType).toBe('strict');
  });

  test('falls back to second preferred language if first is unavailable', async () => {
    const mockProviderA = {
      id: 'prov-a',
      name: 'Provider A',
      type: 'torrent',
      search: async () => [],
      getEpisodeLanguages: async (id, ep) => [
        { language: 'ja', label: 'Japanese', type: 'audio' },
      ],
    };

    const mockProviderB = {
      id: 'prov-b',
      name: 'Provider B',
      type: 'onlinestream',
      search: async () => [],
      getEpisodeLanguages: async (id, ep) => [
        { language: 'en', label: 'English', type: 'audio' },
      ],
    };

    // User wants Hindi, English, then Japanese
    const providers = [mockProviderA, mockProviderB];
    const preferredLanguages = ['hi', 'en', 'ja'];

    const result = await resolveExtensionForEpisode(providers, 1, 100, preferredLanguages);

    expect(result).not.toBeNull();
    // Since prov-a only has ja, and prov-b has en, en is higher in preference than ja.
    // Provider B should be chosen since English is the 2nd preference.
    expect(result.provider.id).toBe('prov-b');
    expect(result.resolvedLanguage).toBe('en');
  });

  test('falls back to language-agnostic (heuristic) provider if no strict match exists', async () => {
    const mockProviderA = {
      id: 'prov-a',
      name: 'Provider A',
      search: async () => [],
      // No getEpisodeLanguages -> language agnostic
    };

    const mockProviderB = {
      id: 'prov-b',
      name: 'Provider B',
      search: async () => [],
      getEpisodeLanguages: async () => [
        { language: 'es', label: 'Spanish', type: 'audio' },
      ],
    };

    const preferredLanguages = ['hi', 'en'];
    const result = await resolveExtensionForEpisode([mockProviderA, mockProviderB], 1, 100, preferredLanguages);

    expect(result).not.toBeNull();
    expect(result.provider.id).toBe('prov-a');
    expect(result.resolvedLanguage).toBe('hi');
    expect(result.matchType).toBe('heuristic');
  });

  test('falls back to default global language when preferred language matches are absent', async () => {
    const mockProviderA = {
      id: 'prov-a',
      name: 'Provider A',
      search: async () => [],
      getEpisodeLanguages: async () => [
        { language: 'fr', label: 'French', type: 'audio' },
      ],
    };

    const preferredLanguages = ['hi'];
    const result = await resolveExtensionForEpisode([mockProviderA], 1, 100, preferredLanguages, 'fr');

    expect(result).not.toBeNull();
    expect(result.provider.id).toBe('prov-a');
    expect(result.resolvedLanguage).toBe('fr');
    expect(result.matchType).toBe('fallback-default');
  });
});
