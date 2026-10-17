/** WebView-safe pagination with scroll, observer and remote-focus triggers. */
export function installTVPagination(button: HTMLButtonElement, state: {
  ready(): boolean;
  load(): unknown;
}) {
  const root = button.closest<HTMLElement>('.tv-shell') || document.documentElement;
  const scope = button.parentElement?.parentElement || root;
  const selector = '.tv-content-card,a[href],button:not(:disabled),[data-tv-key]';
  let inFlight = false;
  let disposed = false;
  let emptyLoads = 0;
  const request = async () => {
    if (disposed || inFlight || !state.ready()) return;
    inFlight = true;
    const remote = document.activeElement === button;
    const before = new Set(scope.querySelectorAll<HTMLElement>(selector));
    let anchor: HTMLElement | undefined;
    // Do not let Android keep the moving sentinel focused and jump past new rows.
    if (remote) {
      anchor = [...before].filter(el => el !== button).at(-1);
      if (anchor) { anchor.tabIndex = 0; anchor.focus({ preventScroll: true }); }
    }
    try { await state.load(); } catch { /* The page supplies its retry state. */ }
    finally {
      requestAnimationFrame(() => {
        inFlight = false;
        if (!scope.isConnected) return;
        const firstNew = [...scope.querySelectorAll<HTMLElement>(selector)].find(el => !before.has(el) && el !== button);
        if (remote && firstNew && (document.activeElement === anchor || document.activeElement === button || document.activeElement === document.body)) {
          firstNew.tabIndex = 0;
          firstNew.focus({ preventScroll: true });
          firstNew.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        emptyLoads = firstNew ? 0 : emptyLoads + 1;
        if (!disposed && button.isConnected && emptyLoads < 3) nearEnd();
      });
    }
  };
  const nearEnd = () => {
    const bounds = button.getBoundingClientRect();
    const viewport = root.getBoundingClientRect();
    if (bounds.top <= viewport.bottom + Math.max(300, root.clientHeight * .75) && bounds.bottom >= viewport.top) void request();
  };
  const onFocus = (event: FocusEvent) => { if (event.target === button) void request(); else nearEnd(); };
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
    entries => { if (entries.some(entry => entry.isIntersecting)) void request(); },
    { root: root === document.documentElement ? null : root, rootMargin: '500px' },
  );
  observer?.observe(button);
  root.addEventListener('scroll', nearEnd, { passive: true });
  root.addEventListener('focusin', onFocus);
  nearEnd();
  return {
    request,
    cleanup() {
      disposed = true;
      observer?.disconnect();
      root.removeEventListener('scroll', nearEnd);
      root.removeEventListener('focusin', onFocus);
    },
  };
}
