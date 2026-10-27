import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useMobileConfig } from '@/hooks/ui/useMobileConfig';
import { buildMobileCloudProxyUrl } from '@/core/player/mobile-cloud-proxy';
import uiI18n from '@/lib/uiI18n';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function useMobileCloudProxy({ source, headers, enabled, videoRef }: {
  source?: { url: string; originalUrl?: string; sourceType?: string; headers?: Record<string, string> };
  headers?: Record<string, string | undefined>;
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement>;
}) {
  const { config } = useMobileConfig();
  const sourceKey = source?.url || '';
  const candidate = enabled && source ? buildMobileCloudProxyUrl(source, headers) : null;
  const [acceptedSource, setAcceptedSource] = useState('');
  const [promptSource, setPromptSource] = useState('');
  const offeredSource = useRef('');
  const decisionPending = useRef(false);
  const declined = useRef<(() => void) | undefined>();
  const resumePosition = useRef(0);
  const cloudProxyUrl = candidate && (config.cloudProxyByDefault || acceptedSource === sourceKey) ? candidate : null;

  useEffect(() => {
    offeredSource.current = '';
    decisionPending.current = false;
    declined.current = undefined;
    setPromptSource('');
    setAcceptedSource('');
    resumePosition.current = 0;
  }, [sourceKey]);

  const offerCloudProxy = useCallback((onDecline?: () => void): boolean => {
    if (!candidate || cloudProxyUrl) return false;
    // A terminal failure while the timed prompt is open must wait for the
    // same decision, rather than switching servers underneath the dialog.
    if (offeredSource.current === sourceKey) {
      if (decisionPending.current && onDecline) declined.current = onDecline;
      return decisionPending.current;
    }
    offeredSource.current = sourceKey;
    decisionPending.current = true;
    declined.current = onDecline;
    setPromptSource(sourceKey);
    return true;
  }, [candidate, cloudProxyUrl, sourceKey]);
  const offerRef = useRef(offerCloudProxy);
  offerRef.current = offerCloudProxy;
  // Stable identity: opening the dialog must never restart playback.
  const offer = useCallback((onDecline?: () => void) => offerRef.current(onDecline), []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !candidate || cloudProxyUrl) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { clearTimeout(timer); timer = undefined; };
    const arm = () => {
      if (timer || video.ended) return;
      timer = setTimeout(() => { timer = undefined; offer(); }, 8000);
    };
    // Cover both a manifest that never loads (video stays paused) and later
    // rebuffering. A ready, deliberately paused video must not trigger consent.
    if (video.readyState < 2) arm();
    video.addEventListener('waiting', arm);
    video.addEventListener('stalled', arm);
    video.addEventListener('playing', clear);
    video.addEventListener('loadeddata', clear);
    const pause = () => { if (video.readyState >= 2) clear(); };
    video.addEventListener('pause', pause);
    return () => {
      clear();
      video.removeEventListener('waiting', arm);
      video.removeEventListener('stalled', arm);
      video.removeEventListener('playing', clear);
      video.removeEventListener('loadeddata', clear);
      video.removeEventListener('pause', pause);
    };
  }, [sourceKey, candidate, cloudProxyUrl, videoRef, offer]);

  const decline = () => {
    decisionPending.current = false;
    setPromptSource('');
    const callback = declined.current;
    declined.current = undefined;
    callback?.();
  };
  const dialog = <AlertDialog open={!!promptSource && promptSource === sourceKey} onOpenChange={open => { if (!open) decline(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{uiI18n.t('mobileCloudProxy.title')}</AlertDialogTitle>
        <AlertDialogDescription>{uiI18n.t('mobileCloudProxy.description')}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={decline}>{uiI18n.t('mobileCloudProxy.decline')}</AlertDialogCancel>
        <AlertDialogAction onClick={() => {
          resumePosition.current = videoRef.current?.currentTime || 0;
          decisionPending.current = false;
          declined.current = undefined;
          setAcceptedSource(sourceKey);
          setPromptSource('');
        }}>{uiI18n.t('mobileCloudProxy.accept')}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
  return { cloudProxyUrl, offerCloudProxy: offer, cloudProxyDialog: dialog, cloudResumePosition: resumePosition };
}
