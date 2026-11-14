import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { CHANGELOG } from '@/lib/changelog';
import { useChangelog } from '@/hooks/admin/useAdminFeatures';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import './update-surfaces.css';

const STORAGE_KEY = 'tatakai:last-opened-version';
export function UpdateChangelogSheet() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const mobile = useIsMobile();
  const reducedMotion = useMotionPreference();
  const { data: releases, isLoading, isError } = useChangelog();
  const version = __APP_VERSION__;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [motionClass, setMotionClass] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const published = releases?.find(
    (release) => release.version.replace(/^v/, '') === version.replace(/^v/, '')
  );
  const release =
    published || CHANGELOG.find((release) => release.version === version);
  useEffect(() => {
    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      if (!previous && localStorage.getItem('tatakai_v6_announced') === 'true')
        setPending(true);
      else if (!previous) localStorage.setItem(STORAGE_KEY, version);
      else if (previous !== version) setPending(true);
    } catch {
      /* Storage unavailable: do not replay an announcement every boot. */
    }
  }, [version]);
  useEffect(() => {
    if (
      pending &&
      !isLoading &&
      !/^\/(auth|watch|read|manga\/read|novel\/read|setup)/.test(pathname)
    )
      setOpen(true);
  }, [pending, isLoading, release, isError, pathname]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      // Establish the recipe's resting scale before entering.
      void contentRef.current?.offsetWidth;
      setMotionClass('is-open');
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);
  const dismiss = () => {
    if (closeTimer.current !== null) return;
    setMotionClass('is-closing');
    setPending(false);
    const closeMs = reducedMotion ? 0 : parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--modal-close-dur')
    ) || 150;
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setMotionClass('');
      closeTimer.current = null;
    }, closeMs);
    try {
      localStorage.setItem(STORAGE_KEY, version);
    } catch {
      /* session only */
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) dismiss();
      }}
    >
      <SheetContent
        ref={contentRef}
        side={mobile ? 'bottom' : 'right'}
        className={`release-sheet t-modal ${motionClass} flex w-full flex-col sm:max-w-lg`}
        overlayClassName={`release-sheet-backdrop ${motionClass}`}
      >
        <div className="release-sheet-handle" aria-hidden="true" />
        <SheetHeader className="release-sheet-header space-y-0">
          <div className="update-brand">
            <span className="update-bookmark" aria-hidden="true" />
            <span>Tatakai</span>
          </div>
          <SheetTitle className="release-sheet-title">{t('releaseSheet.title', { version })}</SheetTitle>
          <SheetDescription className="release-sheet-description">{t('releaseSheet.description')}</SheetDescription>
        </SheetHeader>
        <div className="release-sheet-notes" data-release-notes-scroll>
          <ul className="release-notes-list">
            {release?.changes.map((change, index) => (
              <li key={index}>
                <span className="release-note-number" aria-hidden="true">{index + 1}</span>
                <span>{change}</span>
              </li>
            ))}
          </ul>
          {!release && (
            <p className="release-sheet-unavailable">
              {t('releaseSheet.unavailable')}
            </p>
          )}
        </div>
        <div className="release-sheet-footer">
          <Button onClick={dismiss} className="release-continue">
            {t('releaseSheet.continue')}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
