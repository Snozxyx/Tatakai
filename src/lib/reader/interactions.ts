export const READER_STEP = 0.85;
export const READER_CONTROL_SELECTOR = 'button,a,input,textarea,select,[role="button"],[role="slider"],[contenteditable]:not([contenteditable="false"])';

/** A drag stays cancelled even if the pointer returns to its starting point. */
export class ReaderTapTracker {
  private pointers = new Map<number, { x: number; y: number; cancelled: boolean }>();
  down(id: number, x: number, y: number) {
    this.pointers.set(id, { x, y, cancelled: this.pointers.size > 0 });
    if (this.pointers.size > 1) this.cancel();
  }
  move(id: number, x: number, y: number) {
    const start = this.pointers.get(id);
    if (start && Math.hypot(x - start.x, y - start.y) > 8) start.cancelled = true;
  }
  up(id: number, x: number, y: number) {
    this.move(id, x, y);
    const start = this.pointers.get(id);
    this.pointers.delete(id);
    return Boolean(start && !start.cancelled);
  }
  cancel() { this.pointers.forEach(pointer => { pointer.cancelled = true; }); }
  remove(id: number) { this.pointers.delete(id); }
}

export function readerCanAdvance(root: HTMLElement, step: number) {
  const pages = [...root.querySelectorAll<HTMLElement>('[data-page]')];
  if (!pages.length) return false;
  const bounds = root.getBoundingClientRect();
  const target = Math.min(bounds.top + root.clientHeight + step, pages[pages.length - 1].getBoundingClientRect().bottom - 1);
  const page = pages.find(page => page.getBoundingClientRect().bottom >= target);
  return page?.querySelector('[data-reader-image-state="ready"]') !== null && Boolean(page);
}
