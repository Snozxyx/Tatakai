import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, CheckCircle2, Monitor } from 'lucide-react';
import { useDeviceTranslation } from '@/hooks/community/useDeviceTranslation';
import {
  inspectDeviceTranslation,
  prepareDeviceTranslation,
  setDeviceTranslationEnabled,
  setDeviceTranslationMode,
} from '@/lib/community/onDeviceTranslation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function TranslationStatus() {
  const { t, i18n } = useTranslation();
  const state = useDeviceTranslation();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void inspectDeviceTranslation();
  }, []);
  const browser = state.mode === 'browser';
  const ready = state.status === 'ready';
  const status =
    state.status === 'loading'
      ? 'downloading'
      : ready
      ? 'ready'
      : state.status === 'error' || failed
      ? 'error'
      : state.cached && !browser
      ? 'cached'
      : 'notReady';
  return (
    <div className="space-y-4 px-1 py-4">
      <Select
        value={state.mode || 'auto'}
        disabled={state.status === 'loading'}
        onValueChange={(value) => {
          setFailed(false);
          setDeviceTranslationMode(value as 'auto' | 'browser');
        }}
      >
        <SelectTrigger aria-label={t('translationStatus.engine')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="browser">{t('translationStatus.lite')}</SelectItem>
          <SelectItem value="auto">{t('translationStatus.full')}</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t(
          browser
            ? 'translationStatus.liteDescription'
            : 'translationStatus.fullDescription'
        )}
      </p>
      <div className="flex items-center gap-2 text-sm" role="status">
        {ready ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Monitor className="h-4 w-4" />
        )}
        {t(`translationStatus.${status}`)}
        {state.status === 'loading' && state.progress !== null && (
          <span className="tabular-nums">{state.progress}%</span>
        )}
      </div>
      {state.engine && (
        <p className="text-sm text-muted-foreground">
          {t(
            state.engine === 'native'
              ? 'translationStatus.nativeEngine'
              : 'translationStatus.offlineEngine'
          )}
        </p>
      )}
      {state.status === 'loading' && state.progress !== null && (
        <progress
          className="h-2 w-full accent-primary"
          max={100}
          value={state.progress}
          aria-label={t('translationStatus.progress')}
        />
      )}
      {!state.nativeAvailable && browser && (
        <p className="text-sm text-muted-foreground">
          {t('translationStatus.unsupported')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={state.status === 'loading'}
          onClick={() => {
            setFailed(false);
            void prepareDeviceTranslation(
              (i18n.resolvedLanguage || 'en').split('-')[0]
            ).catch((error) => {
              if (error?.name !== 'AbortError') setFailed(true);
            });
          }}
        >
          <Download className="mr-2 h-4 w-4" />
          {t(ready ? 'translationStatus.recheck' : 'translationStatus.prepare')}
        </Button>
        {state.status === 'loading' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeviceTranslationEnabled(false)}
          >
            {t('community.translation.stopDownload')}
          </Button>
        )}
      </div>
    </div>
  );
}
