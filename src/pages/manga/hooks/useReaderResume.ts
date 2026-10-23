import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

export function clampReaderPageIndex(page: number, total: number) {
  const requested = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  return total > 0 ? Math.min(total - 1, requested) : requested;
}

/** Hold the requested page at the viewport edge while preceding images resolve.
 * User input ends anchoring immediately, so it never fights reading gestures. */
export function useReaderResume({
  rootRef,
  identity,
  page,
  currentPage,
  total,
  vertical,
  onPage,
  pageSelector = "[data-page]",
}: {
  rootRef: RefObject<HTMLDivElement>;
  identity: string;
  page: number;
  currentPage?: number;
  total: number;
  vertical: boolean;
  onPage: (index: number) => void;
  pageSelector?: string;
}) {
  const restoring = useRef(false);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const previousRef = useRef<{ identity: string; vertical: boolean } | null>(
    null
  );
  useLayoutEffect(() => {
    if (!total) return;
    const previous = previousRef.current;
    const changedMode =
      previous?.identity === identity && previous.vertical !== vertical;
    const index = clampReaderPageIndex(
      changedMode ? currentPageRef.current ?? page : page,
      total
    );
    previousRef.current = { identity, vertical };
    onPage(index);
    const root = rootRef.current;
    const entry = root?.querySelector<HTMLElement>("[data-reader-entry]");
    if (!vertical || !root || !entry || index === 0) return;
    restoring.current = true;
    let stopped = false;
    let frame = 0;
    const previousAnchor = root.style.overflowAnchor;
    root.style.overflowAnchor = "none";
    const align = () => {
      if (stopped) return;
      const target = Array.from(
        entry.querySelectorAll<HTMLElement>(pageSelector)
      )[index];
      if (!target) return;
      const top =
        target.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop;
      root.scrollTo({ top, behavior: "instant" });
      onPage(index);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(align);
    };
    const resize = new ResizeObserver(schedule);
    const mutation = new MutationObserver(schedule);
    resize.observe(entry);
    mutation.observe(entry, { childList: true, subtree: true });
    const stop = () => {
      stopped = true;
      restoring.current = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      root.style.overflowAnchor = previousAnchor;
    };
    const inputs = ["wheel", "touchstart", "pointerdown"] as const;
    inputs.forEach((event) =>
      root.addEventListener(event, stop, { passive: true })
    );
    window.addEventListener("keydown", stop, { capture: true });
    window.addEventListener("pointerdown", stop, {
      capture: true,
      passive: true,
    });
    align();
    return () => {
      stop();
      inputs.forEach((event) => root.removeEventListener(event, stop));
      window.removeEventListener("keydown", stop, { capture: true });
      window.removeEventListener("pointerdown", stop, { capture: true });
    };
  }, [rootRef, identity, page, total, vertical, onPage, pageSelector]);
  return restoring;
}
