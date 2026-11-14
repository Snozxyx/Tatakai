import { AdultTitleBoundary } from "./AdultTitleBoundary";
import { useModalTransition } from '@/hooks/ui/useModalTransition';
import { X } from 'lucide-react';
import '@/pages/adult/adult-surfaces.css';
import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  getAdultMode,
  getAdultModeRevision,
  isAdultConfirmationPending,
  subscribeAdultMode,
  requestAdultMode,
  dismissAdultMode,
  confirmAdultMode,
  disableAdultMode,
  contentModePath,
  installContentModeFetch,
} from "@/lib/adultMode";
import warningImage from "@/assets/adult-warning.png";
installContentModeFetch();
export function AdultModeBoundary({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (notify: () => void) => {
      let last = getAdultModeRevision();
      return subscribeAdultMode(() => {
        if (last !== getAdultModeRevision()) {
          last = getAdultModeRevision();
          void queryClient.cancelQueries();
          queryClient.removeQueries({
            predicate: (q) =>
              /anime|manga|novel|media|catalog|search|trending|home|recommend|suggestion|adult|genre|tag/i.test(
                String(q.queryKey[0])
              ),
          });
        }
        notify();
      });
    },
    [queryClient]
  );
  const revision = useSyncExternalStore(
    subscribe,
    getAdultModeRevision,
    () => 0
  );
  const pending = useSyncExternalStore(
    subscribeAdultMode,
    isAdultConfirmationPending,
    () => false
  );
  const mode = getAdultMode();
  const confirmationMotion = useModalTransition(pending);
  const previousMode = useRef(mode);
  const location = useLocation();
  const navigate = useNavigate();
  const destination = contentModePath(location.pathname, mode);
  const adultPath = location.pathname.startsWith("/adult/");
  const needsGate = adultPath && mode !== "adult";
  useEffect(() => {
    const leavingAdultMode = previousMode.current === "adult" && mode === "sfw";
    previousMode.current = mode;
    if ((mode === "adult" || leavingAdultMode) && destination !== location.pathname)
      navigate(destination + location.search, { replace: true });
  }, [mode, destination, location.pathname, location.search, navigate]);
  const leave = () => {
    let path = contentModePath(location.pathname, "sfw");
    if (/^\/(anime|watch)\//.test(path)) path = "/browse";
    else if (/^\/(manga|novel)\/.+/.test(path))
      path = path.startsWith("/novel") ? "/novel" : "/manga";
    disableAdultMode();
    navigate(path + location.search, { replace: true });
  };
  return (
    <>
      <Dialog
        open={confirmationMotion.visible}
        onOpenChange={(open) => {
          if (!open) dismissAdultMode();
        }}
      >
        <DialogContent
          className="adult-confirm-dialog z-[400]"
          overlayClassName="z-[399]"
          showCloseButton={false}
        >
          <div className={'t-modal adult-confirm-surface ' + confirmationMotion.motionClass}>
            <div className="adult-confirm-copy">
              <p className="adult-confirm-label">18+ only</p>
              <DialogTitle className="adult-confirm-title">
                Enter Adult Mode
              </DialogTitle>
              <DialogDescription className="adult-confirm-description">
                Continue only if you’re 18 or older. Your catalogs switch to adult content for this session and reset when you reopen Tatakai.
              </DialogDescription>
            </div>
            <img src={warningImage} alt="" className="adult-confirm-art" />
            <div className="adult-confirm-actions">
              <Button variant="outline" onClick={dismissAdultMode}>Cancel</Button>
              <Button className="adult-confirm-primary" onClick={confirmAdultMode}>I’m 18+ — continue</Button>
            </div>
            <button type="button" className="adult-confirm-close" aria-label="Close confirmation" onClick={dismissAdultMode}><X size={16} strokeWidth={1.5} /></button>
          </div>
        </DialogContent>
      </Dialog>
      {needsGate ? (
        <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
          <h1 className="text-2xl font-semibold">Adult Mode is off</h1>
          <p className="text-muted-foreground">
            Confirm your age to open this separate catalog.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={leave}>
              Return to SFW
            </Button>
            <Button onClick={requestAdultMode}>Enable Adult Mode</Button>
          </div>
        </main>
      ) : mode === "adult" && destination !== location.pathname ? null : (
        <div key={mode + ":" + revision}>
          <AdultTitleBoundary>{children}</AdultTitleBoundary>
        </div>
      )}
    </>
  );
}
