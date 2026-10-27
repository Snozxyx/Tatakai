import { PullRefreshGesture } from './pull-refresh-gesture';

/** Only top-of-page gesture candidates need a cancelable move listener. */
export function installPullRefreshListeners(
  host: Window,
  busy: () => boolean,
  display: (amount: number) => void,
  refresh: () => void,
) {
  const doc = host.document;
  const gesture = new PullRefreshGesture();
  let tracking = false;
  const detach = () => {
    host.removeEventListener('touchmove', move);
    tracking = false;
  };
  function cancel() { detach(); gesture.cancel(); display(0); }
  function start(event: TouchEvent) {
    cancel();
    // Most touches never traverse ancestors or register a blocking listener.
    if (busy() || event.touches.length !== 1 || (doc.scrollingElement?.scrollTop ?? host.scrollY) > 1) return;
    const target = event.target as Element | null;
    if (!target?.closest || target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="slider"],video,iframe,canvas,[data-no-pull-refresh]') ||
      doc.querySelector('[role="dialog"],[data-state="open"][role="menu"],[data-state="open"][role="listbox"]')) return;
    // Cache eligibility for the touch sequence. Nested scrollers retain control.
    for (let element: Element | null = target; element; element = element.parentElement) {
      if (element.scrollTop > 1) return;
    }
    gesture.begin(event.touches[0].clientX, event.touches[0].clientY, true, false);
    tracking = true;
    // Install before the first move: waiting for a passive move can let native
    // scrolling latch before preventDefault can claim a downward refresh.
    host.addEventListener('touchmove', move, { passive: false });
  }
  function move(event: TouchEvent) {
    if (!event.touches[0]) { cancel(); return; }
    const amount = gesture.move(event.touches[0].clientX, event.touches[0].clientY, event.touches.length);
    if (!gesture.active) { cancel(); return; }
    if (amount > 0) {
      if (!event.cancelable) { cancel(); return; }
      event.preventDefault();
    }
    display(amount);
  }
  function end() {
    if (!tracking) return;
    const ready = gesture.finish();
    detach(); display(0);
    if (ready && !busy()) refresh();
  }
  host.addEventListener('touchstart', start, { passive: true });
  host.addEventListener('touchend', end, { passive: true });
  host.addEventListener('touchcancel', cancel, { passive: true });
  return () => {
    detach();
    host.removeEventListener('touchstart', start);
    host.removeEventListener('touchend', end);
    host.removeEventListener('touchcancel', cancel);
  };
}
