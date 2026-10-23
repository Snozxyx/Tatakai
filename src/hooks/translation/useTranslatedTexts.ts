import { useQuery } from '@tanstack/react-query';
import { translateTexts, TranslationUnavailableError } from '@/lib/translation/translate';

/**
 * Translate an array of text slots 1:1 through the configured engine, with
 * caching and abort support. Returns undefined while pending/failed so callers
 * keep rendering the original text.
 */
export function useTranslatedTexts(
  texts: string[],
  options: {
    enabled?: boolean;
    target?: string;
    timeoutMs?: number;
  } = {},
) {
  const key = texts.join('\u0000');
  return useQuery({
    queryKey: ['translated-texts', options.target ?? 'auto', key],
    queryFn: ({ signal }) => translateTexts(texts, { signal, target: options.target, timeoutMs: options.timeoutMs }),
    enabled: options.enabled !== false && texts.some((text) => text.trim().length > 0),
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}

export { TranslationUnavailableError };
