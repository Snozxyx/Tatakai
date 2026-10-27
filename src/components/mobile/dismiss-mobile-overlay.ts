/** Route native Back through the same document event used by Radix Escape. */
export function dismissMobileOverlay(doc: Document): boolean {
  const overlay = doc.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper], [data-mobile-review]');
  if (!overlay) return false;
  const EventClass = doc.defaultView?.KeyboardEvent;
  if (!EventClass) return false;
  (doc.activeElement ?? doc).dispatchEvent(new EventClass('keydown', {
    key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
  }));
  return true;
}
