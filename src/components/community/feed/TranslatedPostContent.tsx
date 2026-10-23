import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Languages, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDeviceTranslation } from '@/hooks/community/useDeviceTranslation';
import { useTranslationConfig } from '@/hooks/translation/useTranslationConfig';
import { resolveTargetLanguage } from '@/lib/translation/config';
import { translateTexts } from '@/lib/translation/translate';
import {
  setDeviceTranslationEnabled,
  translateOnDevice,
} from '@/lib/community/onDeviceTranslation';
import { preparePostTranslation } from '@/lib/community/translationDocument';
import { RichContent, sanitizeRichContent } from './richText';

/**
 * Community post translation.
 *
 * Follows the app-wide engine config (Settings → Translation): the selected
 * provider — free cloud endpoints, a keyed service, or the on-device engine —
 * plus a shared target language. `autoTranslatePosts` decides whether visible
 * posts translate on their own; otherwise a per-post Translate button runs one
 * request. The master switch turns everything off and leaves posts untouched.
 *
 * The loop guard: requests never auto-refetch (no focus/reconnect/mount
 * refetching) and two consecutive failures stop automatic attempts for this
 * post, so a broken engine can never pin every card on "Translating…".
 */

const MAX_AUTO_FAILURES = 2;
const DEVICE_TIMEOUT_MS = 90_000;

type TranslationData = { texts: string[]; sourceLanguage: string };

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
  const config = useTranslationConfig();
  const device = useDeviceTranslation();
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef(false);
  const [visible, setVisible] = useState(false);
  const [setup, setSetup] = useState(false);
  const [manual, setManual] = useState(false);
  const [failures, setFailures] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);

  const deviceMode = config.provider === 'on-device';
  const target = resolveTargetLanguage();
  const uniqueTitle = title && title !== content ? title : '';
  const key = JSON.stringify([uniqueTitle, content || '', target]);

  // Reset per-post request state when the post changes or the target moves.
  useEffect(() => {
    setManual(false);
    setFailures(0);
    setShowOriginal(false);
  }, [key]);

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

  const automatic = !!config.autoTranslatePosts;
  // The auto loop guard: after two consecutive failures stop requesting on
  // this post automatically (manual retry clears the count).
  const autoAvailable = failures < MAX_AUTO_FAILURES;
  const enabled =
    !!config.enabled &&
    visible &&
    canTranslate &&
    autoAvailable &&
    (automatic || manual) &&
    // Cloud providers translate right away; the on-device engine additionally
    // requires the user to have opted into offline translation.
    (deviceMode ? device.enabled : true);

  const translation = useQuery({
    queryKey: ['post-translation', key, deviceMode ? 'device' : 'cloud'],
    queryFn: async ({ signal }): Promise<TranslationData> => {
      if (!document) return { texts: [], sourceLanguage: 'und' };
      if (deviceMode) {
        // The offline worker can hang behind a stalled model download — give
        // every request a hard ceiling so the UI can recover instead of
        // spinning forever.
        const watchdog = new AbortController();
        const timer = window.setTimeout(
          () => watchdog.abort(new DOMException('Timeout', 'TimeoutError')),
          DEVICE_TIMEOUT_MS
        );
        const onOuterAbort = () => watchdog.abort(signal?.reason);
        if (signal?.aborted) watchdog.abort(signal.reason);
        else signal?.addEventListener('abort', onOuterAbort, { once: true });
        try {
          const result = await translateOnDevice(document.texts, target, {
            signal: watchdog.signal,
            userGesture: gesture.current,
          });
          return { texts: result.texts, sourceLanguage: result.sourceLanguage };
        } finally {
          window.clearTimeout(timer);
          signal?.removeEventListener('abort', onOuterAbort);
        }
      }
      const result = await translateTexts(document.texts, {
        signal,
        target,
        userGesture: gesture.current,
      });
      return { texts: result.texts, sourceLanguage: result.sourceLanguage };
    },
    enabled,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  // Two failed attempts in a row park the automatic path; only the explicit
  // retry button clears them.
  useEffect(() => {
    if (translation.isError) setFailures((count) => count + 1);
  }, [translation.isError, translation.error]);

  const changed =
    !!translation.data &&
    !!document &&
    translation.data.texts.length === document.texts.length &&
    translation.data.texts.some(
      (text, index) => text.trim() !== document.texts[index]?.trim()
    );
  const rendered = useMemo(
    () =>
      translation.data && document && translation.data.texts.length === document.texts.length
        ? document.render(translation.data.texts)
        : null,
    [translation.data, document]
  );
  const showTranslated = changed && config.enabled && !showOriginal;
  const translatedFrom = translation.data?.sourceLanguage;
  const languageName =
    translatedFrom && translatedFrom !== 'und'
      ? new Intl.DisplayNames([i18n.resolvedLanguage || 'en'], { type: 'language' }).of(translatedFrom)
      : '';
  const deviceWaiting = deviceMode && device.status === 'loading';

  const request = () => {
    gesture.current = true;
    setManual(true);
    void translation.refetch().finally(() => {
      gesture.current = false;
    });
  };

  // Master switch off — original content only, no translation affordances.
  if (!config.enabled) {
    return (
      <div ref={root} className="min-w-0 space-y-2">
        {uniqueTitle && <h3 className={titleClassName}>{uniqueTitle}</h3>}
        {content && <RichContent html={content} className={contentClassName} />}
      </div>
    );
  }

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
              {deviceWaiting
                ? t('community.translation.downloading', {
                    progress: device.progress ?? 0,
                  })
                : t('community.translation.translating')}
            </span>
          ) : changed ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-muted-foreground">
                {t('community.translation.translatedFrom', {
                  language: languageName,
                })}
              </span>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                aria-pressed={!showOriginal}
                onClick={() => setShowOriginal((value) => !value)}
              >
                {t(
                  showTranslated
                    ? 'community.translation.showOriginal'
                    : 'community.translation.showTranslation'
                )}
              </button>
            </div>
          ) : translation.isError ? (
            <>
              <button
                type="button"
                className="inline-flex min-h-8 items-center gap-1.5 font-medium text-primary hover:underline"
                onClick={() => {
                  setFailures(0);
                  if (deviceMode && !device.enabled) setSetup(true);
                  else request();
                }}
              >
                <Languages className="h-3.5 w-3.5" />
                {t('community.translation.retry')}
              </button>
              <p className="text-muted-foreground" role="status">
                {t('community.translation.failed')}
              </p>
            </>
          ) : (
            !enabled && (
              <>
                {deviceMode && !device.enabled ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex min-h-8 items-center gap-1.5 font-medium text-primary hover:underline"
                      aria-expanded={setup}
                      onClick={() => setSetup((value) => !value)}
                    >
                      <Languages className="h-3.5 w-3.5" />
                      {t('community.translation.translate')}
                    </button>
                    {setup && (
                      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                        <p className="leading-relaxed text-muted-foreground">
                          {t('community.translation.setupDescription')}
                        </p>
                        <button
                          type="button"
                          className="min-h-8 font-semibold text-primary hover:underline"
                          onClick={() => {
                            gesture.current = true;
                            setDeviceTranslationEnabled(true);
                            setManual(true);
                            setSetup(false);
                            void translation.refetch().finally(() => {
                              gesture.current = false;
                            });
                          }}
                        >
                          {t('community.translation.enable')}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  !automatic && (
                    <button
                      type="button"
                      className="inline-flex min-h-8 items-center gap-1.5 font-medium text-primary hover:underline"
                      onClick={request}
                    >
                      <Languages className="h-3.5 w-3.5" />
                      {t('community.translation.translate')}
                    </button>
                  )
                )}
              </>
            )
          )}
          {deviceWaiting && (
            <button
              type="button"
              className="min-h-8 font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setDeviceTranslationEnabled(false)}
            >
              {t('community.translation.stopDownload')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
