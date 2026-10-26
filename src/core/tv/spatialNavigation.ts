export type Direction = "left" | "right" | "up" | "down";
export type Rect = Pick<
  DOMRect,
  "left" | "right" | "top" | "bottom" | "width" | "height"
>;
export function nextCandidate<T extends { rect: Rect }>(
  origin: Rect,
  candidates: T[],
  direction: Direction
): T | undefined {
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  const cx = (origin.left + origin.right) / 2,
    cy = (origin.top + origin.bottom) / 2;
  let best: T | undefined;
  let bestScore = Infinity;
  for (const candidate of candidates) {
      const r = candidate.rect,
        x = (r.left + r.right) / 2,
        y = (r.top + r.bottom) / 2;
      const primary = (horizontal ? x - cx : y - cy) * sign;
      const overlap = horizontal
        ? Math.min(origin.bottom, r.bottom) - Math.max(origin.top, r.top)
        : Math.min(origin.right, r.right) - Math.max(origin.left, r.left);
      const perpendicular = Math.abs(horizontal ? y - cy : x - cx);
      const inDirection = overlap > -0.5 || primary >= perpendicular * 0.5;
      const score = primary + perpendicular * 0.5 + Math.max(0, -overlap) * 0.75;
      if (primary > 0.5 && inDirection && score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}
const selector =
  'a[href],summary,button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[role="button"],[role="link"],[role="tab"],[role="slider"],[role="checkbox"],[role="switch"],[role="radio"],[role="menuitem"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"],[data-tv-focus]';
export function installSpatialNavigation(
  root: HTMLElement,
  onBack: () => void
) {
  const getScope = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-tv-modal]'
      ),
    ]
      .filter(visible)
      .at(-1) || root;
  function visible(el: HTMLElement) {
    const style = getComputedStyle(el);
    return (
      !el.closest('[inert],[aria-hidden="true"],[aria-disabled="true"]') &&
      !el.matches(':disabled,[disabled]') &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      el.getClientRects().length > 0
    );
  }
  let dirty = true;
  let cachedScope: HTMLElement | undefined;
  let cachedElements: HTMLElement[] = [];
  const candidates = () => {
    const scope = getScope();
    if (dirty || cachedScope !== scope) {
      cachedElements = [...scope.querySelectorAll<HTMLElement>(selector)];
      cachedScope = scope; dirty = false;
    }
    return cachedElements.filter(visible);
  };
  let lastContentFocus: HTMLElement | undefined;
  function focus(el: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    if (previous && previous !== el && previous.matches(selector)) previous.tabIndex = -1;
    el.tabIndex = 0;
    el.focus({ preventScroll: true });
    // Fixed sidebar controls must never scroll the catalogue behind them.
    if (el.closest('.tv-icon-rail')) {
      if (previous && root.contains(previous) && !previous.closest('.tv-icon-rail') && previous.matches(selector)) lastContentFocus = previous;
      return;
    }
    lastContentFocus = el;
    const hero = el.closest<HTMLElement>('.tv-cinema');
    if (hero && getScope() === root) {
      // Nearest reveals just the button, leaving the title and artwork clipped.
      const top = root.scrollTop + hero.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      return;
    }
    el.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  }
  const key = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key.startsWith("Arrow")) root.dataset.tvInput = "remote";
    const active = document.activeElement as HTMLElement;
    const editing = active?.matches(
      'input:not([type="checkbox"]):not([type="radio"]),textarea,[role="slider"],[contenteditable="true"]'
    );
    if (
      !editing &&
      getScope() === root &&
      active?.matches("[data-tv-reader]") &&
      (event.key.startsWith("Arrow") || event.key === "Enter")
    ) {
      event.preventDefault();
      window.dispatchEvent(
        new CustomEvent("tatakai-tv-reader-key", { detail: event.key })
      );
      return;
    }
    if (
      ["Escape", "BrowserBack", "GoBack"].includes(event.key) ||
      event.keyCode === 4
    ) {
      if (getScope() !== root) return; // Radix owns its dialog dismissal.
      event.preventDefault();
      onBack();
      return;
    }
    if (
      event.key === "Enter" &&
      !editing &&
      active?.matches(
        'input[type="checkbox"],input[type="radio"],[data-tv-focus],[role="checkbox"],[role="switch"],[role="radio"],[role="menuitem"],[role="option"],[role="menuitemcheckbox"],[role="menuitemradio"]'
      )
    ) {
      event.preventDefault();
      active.click();
      return;
    }
    if (
      editing &&
      active.matches("input") &&
      ["ArrowDown", "ArrowUp"].includes(event.key)
    ) {
      const direction = event.key === "ArrowUp" ? "up" : "down";
      const target = nextCandidate(
        active.getBoundingClientRect(),
        candidates()
          .filter((el) => el !== active)
          .map((el) => ({ el, rect: el.getBoundingClientRect() })),
        direction
      )?.el;
      if (target) {
        event.preventDefault();
        focus(target);
      }
      return;
    }
    if (editing && event.key !== "Tab") return;
    if (event.key === "Tab") {
      const list = candidates(),
        index = list.indexOf(active);
      const target =
        list[(index + (event.shiftKey ? -1 : 1) + list.length) % list.length];
      if (target) {
        event.preventDefault();
        focus(target);
      }
      return;
    }
    if (!event.key.startsWith("Arrow")) return;
    // Rails already encode horizontal order. Avoid laying out the entire page
    // for each repeat from a remote, including cards hundreds of rows away.
    const rail = active?.closest('.tv-rail-items');
    if (rail && getScope() === root && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      const row = [...rail.querySelectorAll<HTMLElement>(selector)];
      const step = event.key === 'ArrowRight' ? 1 : -1;
      for (let index = row.indexOf(active) + step; index >= 0 && index < row.length; index += step) {
        if (!visible(row[index])) continue;
        event.preventDefault(); focus(row[index]); return;
      }
      if (step < 0) {
        const nav = nextCandidate(active.getBoundingClientRect(), candidates().filter(el => el.closest('.tv-icon-rail')).map(el => ({ el, rect: el.getBoundingClientRect() })), 'left')?.el;
        if (nav) { event.preventDefault(); focus(nav); return; }
      }
    }
    // Analytics can have long stretches of reading content between actions.
    const profile = active?.closest('[data-tv-profile]');
    const list = candidates();
    const inSidebar = !!active?.closest('.tv-icon-rail');
    const vertical = ["ArrowDown", "ArrowUp"].includes(event.key);
    let pool = list.filter(el => el !== active);
    if (getScope() === root) {
      // Up/Down stays in the current region. Left explicitly opens navigation.
      if (vertical) pool = pool.filter(el => !!el.closest('.tv-icon-rail') === inSidebar);
      else if (inSidebar) pool = event.key === 'ArrowRight' ? pool.filter(el => !el.closest('.tv-icon-rail')) : [];
      else {
        const content = pool.filter(el => !el.closest('.tv-icon-rail'));
        const horizontalTarget = nextCandidate(active.getBoundingClientRect(), content.map(el => ({ el, rect: el.getBoundingClientRect() })), event.key === 'ArrowLeft' ? 'left' : 'right');
        if (horizontalTarget || event.key === 'ArrowRight') pool = content;
      }
    }
    const returningToContent = getScope() === root && inSidebar && event.key === 'ArrowRight' && lastContentFocus?.isConnected && visible(lastContentFocus);
    const target = returningToContent ? lastContentFocus : !list.includes(active)
      ? pool[0]
      : nextCandidate(
          active.getBoundingClientRect(),
          pool.map(el => ({ el, rect: el.getBoundingClientRect() })),
          event.key.slice(5).toLowerCase() as Direction
        )?.el;
    event.preventDefault();
    if (profile && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      const down = event.key === "ArrowDown";
      const viewport = root.getBoundingClientRect();
      const bounds = target?.getBoundingClientRect();
      if (!bounds || (down ? bounds.top > viewport.bottom - 40 : bounds.bottom < viewport.top + 100)) {
        const before = root.scrollTop;
        const limit = root.scrollHeight - root.clientHeight;
        const next = Math.max(0, Math.min(limit, before + (down ? 1 : -1) * root.clientHeight * 0.65));
        if (Math.abs(next - before) > 1) {
          root.scrollTo({ top: next, behavior: "instant" });
          return;
        }
      }
    }
    if (target) focus(target);
  };
  const pointer = (event: PointerEvent) => {
    if (event.movementX || event.movementY) root.dataset.tvInput = "pointer";
  };
  root.addEventListener("pointermove", pointer, { passive: true });
  document.addEventListener("keydown", key);
  const initialCandidates = candidates();
  initialCandidates.forEach(el => { el.tabIndex = el === document.activeElement ? 0 : -1; });
  const initial = initialCandidates.find((el) => el.dataset.tvKey === "nav-Home") || initialCandidates[0];
  if (initial && !root.contains(document.activeElement)) focus(initial);
  const observer = new MutationObserver(records => {
    dirty = true;
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      const element = node as HTMLElement;
      const additions = [...element.querySelectorAll<HTMLElement>(selector)];
      if (element.matches(selector)) additions.push(element);
      for (const el of additions) if (el !== document.activeElement && el.tabIndex !== -1) el.tabIndex = -1;
    }
    const active = document.activeElement as HTMLElement | null;
    if (active?.isConnected && getScope().contains(active) && visible(active)) return;
    const list = candidates();
    if (
      !list.includes(document.activeElement as HTMLElement) &&
      !document.activeElement?.matches(
        'input,textarea,[contenteditable="true"]'
      )
    )
      list[0] && focus(list[0]);
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'inert', 'aria-hidden', 'aria-disabled', 'role'] });
  return () => {
    observer.disconnect();
    document.removeEventListener("keydown", key);
    root.removeEventListener("pointermove", pointer);
  };
}
