import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Languages, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDeviceTranslation } from '@/hooks/community/useDeviceTranslation';
import {
  setDeviceTranslationEnabled,
  translateOnDevice,
} from '@/lib/community/onDeviceTranslation';
import { preparePostTranslation } from '@/lib/community/translationDocument';
import { RichContent, sanitizeRichContent } from './richText';

export function TranslatedPostContent({
  title,
  content,
  titleClassName,
  contentClassName,
}: {
  title?: string | null;
  content?: string | null;
  titleClassName?: string;
  contentClassName?: string;
}) {
  const { t, i18n } = useTranslation();
  const device = useDeviceTranslation();
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef(false);
  const [visible, setVisible] = useState(false);
  const [setup, setSetup] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  const target = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
  const uniqueTitle = title && title !== content ? title : '';
  const key = JSON.stringify([uniqueTitle, content || '', target]);
  const document = useMemo(
    () =>
      typeof DOMParser !== 'undefined'
        ? preparePostTranslation(
            uniqueTitle,
            sanitizeRichContent(content || '')
          )
        : null,
    [uniqueTitle, content]
  );
  const canTranslate =
    !!document?.texts.length &&
    document.texts.length <= 120 &&
    document.texts.reduce((n, s) => n + s.length, 0) <= 12000;
  useEffect(() => {
    if (!root.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '80px' }
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const translation = useQuery({
    queryKey: [
      'on-device-post-translation',
      uniqueTitle,
      content || '',
      target,
    ],
    queryFn: ({ signal }) =>
      translateOnDevice(document!.texts, target, {
        signal,
        userGesture: gesture.current,
      }),
    enabled: device.enabled && visible && canTranslate,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
  const changed =
    !!translation.data &&
    translation.data.texts.some(
      (text, index) => text.trim() !== document?.texts[index]?.trim()
    );
  const rendered = useMemo(
    () =>
      translation.data && document
        ? document.render(translation.data.texts)
        : null,
    [translation.data, document]
  );
  const showTranslated = device.enabled && changed && original !== key;
  const translatedFrom = translation.data?.sourceLanguage;
  const languageName = translatedFrom
    ? new Intl.DisplayNames([target], { type: 'language' }).of(translatedFrom)
    : '';
  const enable = () => {
    gesture.current = true;
    setDeviceTranslationEnabled(true);
    setSetup(false);
    void translation.refetch().finally(() => {
      gesture.current = false;
    });
  };

  return (
    <div ref={root} className="min-w-0 space-y-2">
      {uniqueTitle && (
        <h3 className={titleClassName}>
          {showTranslated ? rendered?.title : uniqueTitle}
        </h3>
      )}
      {content && (
        <RichContent
          html={showTranslated ? rendered?.content || content : content}
          className={contentClassName}
        />
      )}
      {canTranslate && (
        <div
          className="space-y-2 text-xs"
          onClick={(event) => event.stopPropagation()}
        >
          {translation.isFetching ? (
            <span
              className="inline-flex items-center gap-1.5 text-muted-foreground"
              role="status"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              {device.status === 'loading'
                ? t('community.translation.downloading', {
                    progress: device.progress ?? 0,
                  })
                : t('community.translation.translating')}
            </span>
          ) : changed && device.enabled ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-muted-foreground">
                {t('community.translation.translatedFrom', {
                  language: languageName,
                })}
              </span>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                aria-pressed={!showTranslated}
                onClick={() => setOriginal(showTranslated ? key : null)}
              >
                {t(
                  showTranslated
                    ? 'community.translation.showOriginal'
                    : 'community.translation.showTranslation'
                )}
              </button>
            </div>
          ) : (
            (!device.enabled || translation.isError) && (
              <button
                type="button"
                className="inline-flex min-h-8 items-center gap-1.5 font-medium text-primary hover:underline"
                aria-expanded={setup}
                onClick={() =>
                  device.enabled ? enable() : setSetup((value) => !value)
                }
              >
                <Languages className="h-3.5 w-3.5" />
                {t(
                  translation.isError
                    ? 'community.translation.retry'
                    : 'community.translation.translate'
                )}
              </button>
            )
          )}
          {device.enabled && translation.isError && !translation.isFetching && (
            <p className="text-muted-foreground" role="status">
              {t(
                (translation.error as Error)?.message ===
                  'language-pack-required'
                  ? 'community.translation.packRequired'
                  : 'community.translation.failed'
              )}
            </p>
          )}
          {device.status === 'loading' && (
            <button
              type="button"
              className="min-h-8 font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setDeviceTranslationEnabled(false)}
            >
              {t('community.translation.stopDownload')}
            </button>
          )}
          {setup && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <p className="leading-relaxed text-muted-foreground">
                {t('community.translation.setupDescription')}
              </p>
              <button
                type="button"
                className="min-h-8 font-semibold text-primary hover:underline"
                onClick={enable}
              >
                {t('community.translation.enable')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
