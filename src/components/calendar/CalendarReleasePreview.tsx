import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Hover previews remain clickable; tapping opens the same details on touch. */
export function CalendarReleasePreview({ trigger, children }: { trigger: ReactElement; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const restoreFocus = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const clearTimer = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  const enter = () => {
    clearTimer();
    timer.current = setTimeout(() => setOpen(true), 160);
  };
  const leave = () => {
    clearTimer();
    timer.current = setTimeout(() => { if (!pinned.current) setOpen(false); }, 200);
  };
  return <Popover open={open} onOpenChange={value => {
    clearTimer();
    restoreFocus.current = value || pinned.current;
    pinned.current = value;
    setOpen(value);
  }}>
    <PopoverTrigger asChild onPointerEnter={event => { if (event.pointerType === "mouse") enter(); }}
      onPointerLeave={leave}>{trigger}</PopoverTrigger>
    <PopoverContent className="calendar-release-preview" align="start" sideOffset={8}
      onOpenAutoFocus={event => event.preventDefault()} onPointerEnter={clearTimer} onPointerLeave={leave}
      onCloseAutoFocus={event => {
        if (!restoreFocus.current) event.preventDefault();
        restoreFocus.current = false;
      }}
      onFocusCapture={() => { pinned.current = true; }}>
      {children}
    </PopoverContent>
  </Popover>;
}

export function CalendarArtwork({ src, className = "" }: { src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <span className={`calendar-artwork ${className}`} aria-hidden="true">
    {src && !failed && <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />}
    <span className="calendar-artwork-shade" />
  </span>;
}
