import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
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

const STORAGE_KEY = 'tatakai:last-opened-version';
export function UpdateChangelogSheet() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { data: releases, isLoading, isError } = useChangelog();
  const version = __APP_VERSION__;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
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
  const dismiss = () => {
    setOpen(false);
    setPending(false);
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
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 px-6 pb-4 pt-6 pr-16">
          <SheetTitle>{t('releaseSheet.title', { version })}</SheetTitle>
          <SheetDescription>{t('releaseSheet.description')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6" data-release-notes-scroll>
          <ul className="my-8 list-disc space-y-4 pl-5 text-sm leading-relaxed">
            {release?.changes.map((change, index) => (
              <li key={index}>{change}</li>
            ))}
          </ul>
          {!release && (
            <p className="my-8 text-sm text-muted-foreground">
              {t('releaseSheet.unavailable')}
            </p>
          )}
        </div>
        <div className="shrink-0 border-t p-6">
          <Button onClick={dismiss} className="w-full">
            {t('releaseSheet.continue')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
