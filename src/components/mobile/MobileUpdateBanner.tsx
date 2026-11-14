import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw, X } from 'lucide-react';
import { isCapacitor } from '@/lib/platform/platform';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import '@/components/layout/update-surfaces.css';
import {
  cancelMobileUpdateDownload,
  checkMobileUpdate,
  downloadMobileUpdate,
  installMobileUpdate,
  isAndroidAutoUpdateTarget,
  openMobileReleasePage,
  useMobileUpdateState,
  type MobileUpdateState,
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

  return (
    <MobileUpdateCard
      key={update.latestVersion}
      update={update}
      onDismiss={() => setDismissed(update.latestVersion ?? null)}
    />
  );
}

function MobileUpdateCard({
  update,
  onDismiss,
}: {
  update: MobileUpdateState;
  onDismiss(): void;
}) {
  const reducedMotion = useMotionPreference();
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void cardRef.current?.offsetWidth;
      setOpen(true);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);
  const dismiss = () => {
    if (closeTimer.current !== null) return;
    setOpen(false);
    const closeMs = reducedMotion ? 0 : parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--toast-close')
    ) || 250;
    closeTimer.current = window.setTimeout(onDismiss, closeMs);
  };
  const autoCapable = isAndroidAutoUpdateTarget() && !!update.downloadUrl;
  const progress = Math.max(0, Math.min(100, Math.round(Number(update.progress ?? 0))));

  return (
    <div className="mobile-update-banner">
      <div
        ref={cardRef}
        role="region"
        aria-labelledby="mobile-update-title"
        className={`mobile-update-card t-toast${open ? ' is-open' : ''}`}
      >
        <div className="mobile-update-header">
          <div className="mobile-update-copy">
            <div className="update-brand">
              <span className="update-bookmark" aria-hidden="true" />
              <span>{uiI18n.t('app.tatakai_28bda6bd')}</span>
              <span className="mobile-update-version">v{update.latestVersion}</span>
            </div>
            <div aria-live="polite" aria-atomic="true">
              <p id="mobile-update-title" className="mobile-update-title">
                {update.phase === 'available' && uiI18n.t('app.update_available_21f1865b')}
                {update.phase === 'downloading' && uiI18n.t('app.downloading_tatakai_i18n_value_0_i18n_value_1_e9cdf41e', { value0: update.latestVersion, value1: progress })}
                {update.phase === 'downloaded' && uiI18n.t('app.tatakai_i18n_value_0_is_ready_to_install_7fa95f9c', { value0: update.latestVersion })}
                {update.phase === 'installing' && uiI18n.t('app.opening_the_installer_e8883229')}
              </p>
            </div>
            {update.phase === 'available' && update.currentVersion && (
              <p className="mobile-update-current">
                {uiI18n.t('app.current_version_vi18n_value_0_0829162c', { value0: update.currentVersion })}
              </p>
            )}
          </div>
          <button
            type="button"
            title={uiI18n.t('app.dismiss_70afe9ef')}
            aria-label={uiI18n.t('app.dismiss_70afe9ef')}
            onClick={dismiss}
            className="mobile-update-icon-button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        {update.phase === 'downloading' && (
          <div
            className="mobile-update-progress"
            role="progressbar"
            aria-label={uiI18n.t('app.download_a479c9c3')}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="mobile-update-progress-fill" style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        )}
        <div className="mobile-update-actions">
          {update.phase === 'available' && autoCapable && (
            <button
              type="button"
              onClick={() => void downloadMobileUpdate()}
              className="mobile-update-action"
            >
              <Download aria-hidden="true" />
              {uiI18n.t('app.download_a479c9c3')}
            </button>
          )}
          {update.phase === 'available' && !autoCapable && (
            <button
              type="button"
              onClick={() => void openMobileReleasePage(update.releaseUrl)}
              className="mobile-update-action"
            >
              {uiI18n.t('app.update_fb91e24f')}
            </button>
          )}
          {update.phase === 'downloading' && (
            <button
              type="button"
              onClick={() => void cancelMobileUpdateDownload()}
              className="mobile-update-action mobile-update-action-secondary"
            >
              {uiI18n.t('app.cancel_77dfd213')}
            </button>
          )}
          {(update.phase === 'downloaded' || update.phase === 'installing') && (
            <button
              type="button"
              disabled={update.phase === 'installing'}
              aria-busy={update.phase === 'installing'}
              onClick={() => void installMobileUpdate()}
              className="mobile-update-action"
            >
              {update.phase === 'installing' && <Loader2 className="animate-spin" aria-hidden="true" />}
              {uiI18n.t('app.install_fd6c3ebf')}
            </button>
          )}
          <button
            type="button"
            title={uiI18n.t('app.check_again_e185048c')}
            aria-label={uiI18n.t('app.check_again_e185048c')}
            onClick={() => void checkMobileUpdate({ announce: true })}
            className="mobile-update-icon-button"
          >
            <RefreshCw aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
