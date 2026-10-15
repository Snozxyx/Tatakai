import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { Download, Loader2, RefreshCw, X } from 'lucide-react';
import { isCapacitor } from '@/lib/platform/platform';
import {
  cancelMobileUpdateDownload,
  checkMobileUpdate,
  downloadMobileUpdate,
  installMobileUpdate,
  isAndroidAutoUpdateTarget,
  openMobileReleasePage,
  useMobileUpdateState,
} from '@/core/update/mobile-update';

/**
 * MobileUpdateBanner — in-app updater surface for Capacitor.
 *
 * Android downloads + installs the release APK inside the app (no browser).
 * iOS keeps the manual flow: the banner opens the releases page so the
 * unsigned IPA can be sideloaded with an external tool.
 * Mounted in MainLayout above the app content.
 */
export function MobileUpdateBanner() {
  useUiTranslation();
  const update = useMobileUpdateState();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!isCapacitor()) return null;
  if (update.phase === 'idle' || update.phase === 'checking' || update.phase === 'current') return null;
  if (update.phase === 'error') return null;
  if (!update.latestVersion) return null;
  if (dismissed === update.latestVersion) return null;

  const autoCapable = isAndroidAutoUpdateTarget() && !!update.downloadUrl;
  const progress = Math.max(0, Math.min(100, Math.round(Number(update.progress ?? 0))));

  return (
    <div className="sticky top-0 z-[80] flex justify-center px-4 pt-2">
      <div className="w-full max-w-2xl rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          {update.phase === 'installing' ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : (
            <Download className="h-4 w-4 shrink-0 text-primary" />
          )}
          <p className="flex-1 text-sm text-foreground/90">
            {update.phase === 'downloading' && uiI18n.t('app.downloading_tatakai_i18n_value_0_i18n_value_1_e9cdf41e', { value0: update.latestVersion, value1: progress })}
            {update.phase === 'downloaded' && uiI18n.t('app.tatakai_i18n_value_0_is_ready_to_install_7fa95f9c', { value0: update.latestVersion })}
            {update.phase === 'installing' && uiI18n.t('app.opening_the_installer_e8883229')}
            {update.phase === 'available' && (
              <>{uiI18n.t('app.tatakai_28bda6bd')} {update.latestVersion} {uiI18n.t('app.is_available_6b7a7a3e')}{update.currentVersion ? uiI18n.t('app.you_have_i18n_value_0_2c7c5e44', { value0: update.currentVersion }) : ''}.</>
            )}
          </p>
          {update.phase === 'available' && autoCapable && (
            <button
              type="button"
              onClick={() => void downloadMobileUpdate()}
              className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {uiI18n.t('app.download_a479c9c3')}
            </button>
          )}
          {update.phase === 'available' && !autoCapable && (
            <button
              type="button"
              onClick={() => void openMobileReleasePage(update.releaseUrl)}
              className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {uiI18n.t('app.update_fb91e24f')}
            </button>
          )}
          {update.phase === 'downloading' && (
            <button
              type="button"
              onClick={() => void cancelMobileUpdateDownload()}
              className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              {uiI18n.t('app.cancel_77dfd213')}
            </button>
          )}
          {(update.phase === 'downloaded' || update.phase === 'installing') && (
            <button
              type="button"
              disabled={update.phase === 'installing'}
              onClick={() => void installMobileUpdate()}
              className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {uiI18n.t('app.install_fd6c3ebf')}
            </button>
          )}
          <button
            type="button"
            title={uiI18n.t('app.check_again_e185048c')}
            aria-label={uiI18n.t('app.check_again_e185048c')}
            onClick={() => void checkMobileUpdate({ announce: true })}
            className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={uiI18n.t('app.dismiss_70afe9ef')}
            aria-label={uiI18n.t('app.dismiss_70afe9ef')}
            onClick={() => setDismissed(update.latestVersion ?? 'x')}
            className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {update.phase === 'downloading' && (
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
