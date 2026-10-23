import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Loader2, RotateCcw } from 'lucide-react';
import { CommentContent, type TimestampTarget } from '@/components/comments/CommentContent';
import { useTranslationConfig } from '@/hooks/translation/useTranslationConfig';
import { resolveTargetLanguage } from '@/lib/translation/config';
import {
  protectCommentMarkup,
  restoreCommentMarkup,
  type PreparedCommentBlock,
} from '@/lib/translation/commentDocument';
import { useTranslatedTexts } from '@/hooks/translation/useTranslatedTexts';
import { splitCommentBlocks } from '@/lib/commentQuotes';
import { decodeHtmlEntities } from '@/lib/commentMarkup';
import { detectPostLanguage } from '@/lib/community/detectLanguage';

/**
 * Comment body with live translation, driven by the app-wide engine config
 * (Settings → Translation): a master switch, a comments toggle and one target
 * language everything follows. Markup, mentions and links never reach the
 * engine — they are protected as ‹n› placeholders and restored after.
 *
 * Renders exactly like CommentContent; when translation is off the wrapper is
 * a pure pass-through.
 */

const MAX_SLOTS = 24;
const MAX_CHARS = 6000;
const MAX_TRANSLATABLE_BLOCK = 2000;

type PreparedBlock = PreparedCommentBlock & { quote: boolean; text: string };

export function TranslatedCommentContent({
  content,
  className,
  timestampTarget,
  clamp = false,
}: {
  content: string;
  className?: string;
  timestampTarget?: TimestampTarget;
  clamp?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const config = useTranslationConfig();
  const target = resolveTargetLanguage();
  const [showOriginal, setShowOriginal] = useState(false);

  const displayNames = useMemo(
    () => new Intl.DisplayNames([i18n.resolvedLanguage || 'en'], { type: 'language' }),
    [i18n.resolvedLanguage],
  );

  const blocks = useMemo(() => {
    const text = decodeHtmlEntities(String(content ?? '').replace(/\r\n/g, '\n'));
    return splitCommentBlocks(text).map<PreparedBlock>((block) => ({
      quote: block.quote,
      text: block.text,
      ...protectCommentMarkup(block.text),
    }));
  }, [content]);

  const slots = useMemo(
    () =>
      blocks
        .map((block, index) => ({ block, index }))
        .filter(
          ({ block }) =>
            !block.quote &&
            block.translatable &&
            block.forTranslation.length <= MAX_TRANSLATABLE_BLOCK,
        ),
    [blocks],
  );

  // Nothing to do when the comment already reads in the target language.
  const sermon = useMemo(() => {
    const sample = blocks
      .filter((block) => !block.quote)
      .map((block) => block.forTranslation)
      .join(' ')
      .slice(0, 400);
    return sample.trim() ? detectPostLanguage(sample) : null;
  }, [blocks]);

  const overLimit =
    slots.length > MAX_SLOTS ||
    slots.reduce((n, slot) => n + slot.block.forTranslation.length, 0) > MAX_CHARS;

  const enabled =
    config.enabled &&
    config.translateComments &&
    !overLimit &&
    slots.length > 0 &&
    (sermon === null || sermon !== target);

  const translation = useTranslatedTexts(
    slots.map(({ block }) => block.forTranslation),
    { enabled, target },
  );

  const translatedContent = useMemo(() => {
    if (!enabled || !translation.data || translation.data.texts.length !== slots.length) return null;
    let failed = false;
    const slotIndex = new Map<number, number>(slots.map((slot, i) => [slot.index, i]));
    const out = blocks.map((block, blockIndex) => {
      if (block.quote) return block.text;
      const slotAt = slotIndex.get(blockIndex);
      if (slotAt === undefined) return block.text;
      const translated = translation.data!.texts[slotAt];
      const restored = restoreCommentMarkup(translated, block.tokens);
      if (restored === null) {
        failed = true;
        return block.text;
      }
      return restored;
    });
    if (failed) return null;
    return out.join('\n');
  }, [enabled, translation.data, slots, blocks]);

  const sourceLanguage = translation.data?.sourceLanguage ?? '';
  const translatedFromLabel = useMemo(() => {
    if (!sourceLanguage || sourceLanguage === 'und') return '';
    try { return displayNames.of(sourceLanguage) ?? ''; }
    catch { return ''; }
  }, [displayNames, sourceLanguage]);

  const showTranslated = !!translatedContent && !showOriginal;
  const showMeta = enabled && (translation.isFetching || translation.isError || !!translatedContent);

  const body: ReactNode = (
    <>
      <CommentContent
        content={showTranslated && translatedContent ? translatedContent : content}
        className={className}
        timestampTarget={timestampTarget}
        clamp={clamp}
      />
      {showMeta && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {translation.isFetching ? (
            <span className="inline-flex items-center gap-1.5" role="status">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('translation.comment.translating')}
            </span>
          ) : translation.isError ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 hover:text-foreground"
              onClick={() => translation.refetch()}
            >
              <RotateCcw className="h-3 w-3" />
              {t('community.translation.retry')}
            </button>
          ) : (
            <>
              {translatedFromLabel && (
                <span className="inline-flex items-center gap-1">
                  <Languages className="h-3 w-3" />
                  {t('translation.comment.translatedFrom', { language: translatedFromLabel })}
                </span>
              )}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                aria-pressed={!showOriginal}
                onClick={() => setShowOriginal((value) => !value)}
              >
                {t(
                  showOriginal
                    ? 'translation.comment.showTranslation'
                    : 'translation.comment.showOriginal',
                )}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );

  return clamp ? <div>{body}</div> : body;
}
