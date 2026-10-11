/**
 * Fullscreen ancestor lock.
 *
 * A `position: fixed; inset: 0` player is viewport-relative ONLY when none of
 * its ancestors creates a containing block for fixed descendants. Any ancestor
 * with a non-`none` `transform` / `filter` / `backdrop-filter` / `perspective`,
 * a non-`visible` `contain` (e.g. `paint`), `will-change: transform/filter`,
 * or the individual `translate`/`rotate`/`scale` properties reparents the
 * fixed player to that ancestor's box — on phones this shows as the player
 * shifted right / clipped, with controls cut off at the screen edge.
 *
 * The CSS `:has()` fallback in index.css covers modern browsers, but it is
 * expensive and unsupported on older WebViews. This helper clears the offending
 * inline/computed properties on every ancestor while fullscreen is active and
 * restores them exactly on exit. No-ops in non-DOM environments.
 */

type SavedProps = {
  el: HTMLElement;
  properties: Array<{ name: string; value: string; priority: string }>;
};

const TRACKED = [
  'transform',
  'filter',
  'backdrop-filter',
  'perspective',
  'contain',
  'will-change',
  'translate',
  'rotate',
  'scale',
] as const;

function createsFixedContainingBlock(computed: CSSStyleDeclaration): boolean {
  if (computed.transform !== 'none') return true;
  if (computed.filter !== 'none') return true;
  const backdrop = computed.getPropertyValue('backdrop-filter') || (computed as unknown as Record<string, string>).backdropFilter;
  if (backdrop && backdrop !== 'none') return true;
  if (computed.perspective !== 'none') return true;
  if (computed.translate !== 'none') return true;
  if (computed.rotate !== 'none') return true;
  if (computed.scale !== 'none') return true;
  const contain = computed.contain;
  if (contain && contain !== 'none' && contain !== 'normal' && contain !== 'visible') return true;
  const willChange = computed.willChange;
  if (willChange && (willChange.includes('transform') || willChange.includes('filter') || willChange.includes('perspective'))) return true;
  return false;
}

/**
 * Neutralize fixed-position containing blocks on every ancestor of `node`.
 * Returns an unlock function that restores every touched property.
 */
export function lockFullscreenAncestors(node: HTMLElement | null): () => void {
  if (!node || typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return () => undefined;
  }
  const saved: SavedProps[] = [];
  let el: HTMLElement | null = node.parentElement;
  while (el) {
    let computed: CSSStyleDeclaration | null = null;
    try {
      computed = getComputedStyle(el);
    } catch {
      computed = null;
    }
    if (computed && createsFixedContainingBlock(computed)) {
      const entry: SavedProps = {
        el,
        properties: TRACKED.map((name) => ({ name, value: el.style.getPropertyValue(name), priority: el.style.getPropertyPriority(name) })),
      };
      saved.push(entry);
      try {
        for (const name of TRACKED) el.style.setProperty(name, name === 'will-change' ? 'auto' : 'none', 'important');
      } catch {
        /* read-only style — ignore */
      }
    }
    if (el === document.documentElement) break;
    el = el.parentElement;
  }
  return () => {
    for (const entry of saved) {
      try {
        for (const { name, value, priority } of entry.properties) {
          if (value) entry.el.style.setProperty(name, value, priority);
          else entry.el.style.removeProperty(name);
        }
      } catch {
        /* ignore restore failures */
      }
    }
  };
}
