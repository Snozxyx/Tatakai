import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

const PROMPT_KEY = 'tatakai_reduce_motion_prompt_seen';
const REDUCE_MOTION_KEY = 'tatakai_reduce_motion';
const REDUCE_MOTION_DELAY_UNTIL_KEY = 'tatakai_reduce_motion_prompt_delay_until';
const V5_ANNOUNCEMENT_SEEN_KEY = 'tatakai_v5_announced';
const V5_ANNOUNCEMENT_DELAY_MS = 60 * 1000;

export function ReduceMotionPrompt() {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    const hasPreference = localStorage.getItem(REDUCE_MOTION_KEY);
    const hasSeen = localStorage.getItem(PROMPT_KEY);
    if (hasPreference !== null || hasSeen === 'true') return;

    const hasSeenV5Announcement = localStorage.getItem(V5_ANNOUNCEMENT_SEEN_KEY) === 'true';
    if (!hasSeenV5Announcement) {
      const currentDelayUntil = Number(localStorage.getItem(REDUCE_MOTION_DELAY_UNTIL_KEY) || '0');
      const enforcedDelayUntil = Math.max(currentDelayUntil, Date.now() + V5_ANNOUNCEMENT_DELAY_MS);
      localStorage.setItem(REDUCE_MOTION_DELAY_UNTIL_KEY, String(enforcedDelayUntil));
    }

    const delayUntil = Number(localStorage.getItem(REDUCE_MOTION_DELAY_UNTIL_KEY) || '0');
    const delayedMs = Number.isFinite(delayUntil) ? Math.max(0, delayUntil - Date.now()) : 0;
    if (delayUntil > 0 && delayedMs <= 0) {
      localStorage.removeItem(REDUCE_MOTION_DELAY_UNTIL_KEY);
    }

    const openDelayMs = delayedMs > 0 ? delayedMs : 800;
    const timer = setTimeout(() => setIsOpen(true), openDelayMs);
    return () => clearTimeout(timer);
  }, [isMobile]);

  const applyReduceMotion = (enabled: boolean) => {
    // store global preference (used by web + onboarding)
    localStorage.setItem(REDUCE_MOTION_KEY, String(enabled));

    // also sync mobile config object (if present) so MobileSettings shows the
    // same preference consistently across the app
    try {
      const saved = localStorage.getItem('tatakai_mobile_config');
      if (saved) {
        const cfg = JSON.parse(saved);
        cfg.reduceMotion = enabled;
        localStorage.setItem('tatakai_mobile_config', JSON.stringify(cfg));
      }
    } catch (e) {
      /* ignore JSON errors */
    }

    document.documentElement.classList.toggle('reduce-motion', enabled);
    document.body.classList.toggle('reduce-motion', enabled);
  };

  const handleClose = (setPreference?: boolean) => {
    if (setPreference !== undefined) {
      applyReduceMotion(setPreference);
    }
    localStorage.setItem(PROMPT_KEY, 'true');
    setIsOpen(false);
  };

  if (!isMobile || !isOpen) return null;

  const content = (
    <div className="fixed inset-x-4 bottom-24 z-[120]">
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="relative p-4">
          <button
            onClick={() => handleClose(false)}
            className="absolute top-2 right-2 p-1 rounded-lg hover:bg-muted/50 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex items-start gap-3 mb-3 pr-6">
            <div className="p-2 rounded-xl bg-primary/10">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 pt-0.5">
              <h3 className="font-semibold text-sm mb-1">Reduce motion effects?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                If animations feel too intense, we can tone them down.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleClose(true)}
              className="flex-1 h-9 text-xs"
              variant="secondary"
            >
              Reduce Motion
            </Button>
            <Button
              onClick={() => handleClose(false)}
              className="flex-1 h-9 text-xs"
              variant="ghost"
            >
              Keep Motion
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
