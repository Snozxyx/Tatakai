import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';

interface PillPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  viewport: number;
}

// Page-owned mobile docks remount during navigation. Keep only their geometry
// so the next dock can finish the same selection movement.
const rememberedPositions = new Map<string, PillPosition>();

/** React orchestration for the Transitions.dev sliding-tabs recipe. */
export function useSlidingPill<T extends HTMLElement = HTMLDivElement>(value: unknown, {
  activeSelector = '[aria-selected="true"]',
  tabSelector = '.t-tab',
  targetSelector,
  rememberKey,
  observeSelection = false,
  matchTabStyle = false,
}: {
  activeSelector?: string;
  tabSelector?: string;
  targetSelector?: string;
  rememberKey?: string;
  observeSelection?: boolean;
  matchTabStyle?: boolean;
} = {}) {
  const group = useRef<T | null>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const positioned = useRef(false);
  const previousIndicator = useRef<HTMLSpanElement | null>(null);
  const reducedMotion = useMotionPreference();

  const movePill = useCallback((animate: boolean) => {
    const bar = group.current;
    const indicator = pill.current;
    const active = bar?.querySelector<HTMLElement>(activeSelector);
    if (!bar || !indicator) return;
    if (previousIndicator.current !== indicator) {
      positioned.current = false;
      previousIndicator.current = indicator;
    }
    if (!active || !bar.offsetWidth) {
      indicator.style.visibility = 'hidden';
      return;
    }
    const target = (targetSelector && active.querySelector<HTMLElement>(targetSelector)) || active;
    // Move the existing selected surface, keeping each tab bar's own palette,
    // border and shape. Suspend its paint override while reading the final style.
    if (matchTabStyle) {
      bar.setAttribute('data-sliding-tab-measuring', '');
      const style = getComputedStyle(target);
      for (const property of [
        'backgroundColor', 'backgroundImage', 'borderRadius', 'boxShadow',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
        'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
      ] as const) indicator.style[property] = style[property];
      bar.removeAttribute('data-sliding-tab-measuring');
      bar.setAttribute('data-sliding-tab-ready', '');
    }
    const bounds = target.getBoundingClientRect();
    const barBounds = bar.getBoundingClientRect();
    const position: PillPosition = {
      x: bounds.left - barBounds.left + bar.scrollLeft - bar.clientLeft,
      y: bounds.top - barBounds.top + bar.scrollTop - bar.clientTop,
      width: bounds.width,
      height: bounds.height,
      viewport: window.innerWidth,
    };
    const write = (next: PillPosition) => {
      indicator.style.transform = `translate(${next.x}px, ${next.y}px)`;
      indicator.style.width = `${next.width}px`;
      indicator.style.top = '0';
      indicator.style.height = `${next.height}px`;
    };
    const previous = !positioned.current && rememberKey ? rememberedPositions.get(rememberKey) : undefined;
    const resume = previous?.viewport === position.viewport && !reducedMotion;
    const transition = indicator.style.transition;
    if (!animate || resume) {
      indicator.style.transition = 'none';
      write(resume && previous ? previous : position);
      void indicator.offsetWidth;
      indicator.style.transition = transition;
    }
    write(position);
    indicator.style.visibility = 'visible';
    positioned.current = true;
    if (rememberKey) rememberedPositions.set(rememberKey, position);
  }, [activeSelector, targetSelector, rememberKey, reducedMotion, matchTabStyle]);

  useLayoutEffect(() => {
    movePill(positioned.current && !reducedMotion);
  }, [value, movePill, reducedMotion]);

  useEffect(() => {
    const bar = group.current;
    if (!bar) return;
    let observed = false;
    const observer = new ResizeObserver(() => {
      if (observed) movePill(false);
      observed = true;
    });
    const observeTabs = () => {
      observer.disconnect();
      observed = false;
      observer.observe(bar);
      bar.querySelectorAll(tabSelector).forEach(tab => observer.observe(tab));
    };
    observeTabs();
    // Radix updates its triggers through context, without rerendering the list.
    // Also cover inserted/removed tabs and translated labels in custom lists.
    const selectionObserver = observeSelection ? new MutationObserver(records => {
      const changedTabs = records.some(record => record.type === 'childList');
      if (changedTabs) observeTabs();
      movePill(positioned.current && !reducedMotion);
    }) : undefined;
    selectionObserver?.observe(bar, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'aria-pressed', 'aria-current', 'data-active', 'data-state', 'class'],
    });
    // Scoped themes can change their CSS variables without rerendering a list.
    const themeObserver = matchTabStyle ? new MutationObserver(() => movePill(false)) : undefined;
    for (let ancestor = bar.parentElement; ancestor && themeObserver; ancestor = ancestor.parentElement) {
      themeObserver.observe(ancestor, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme'],
      });
    }
    return () => {
      observer.disconnect();
      selectionObserver?.disconnect();
      themeObserver?.disconnect();
    };
  }, [value, movePill, tabSelector, observeSelection, reducedMotion, matchTabStyle]);

  return { group, pill };
}
