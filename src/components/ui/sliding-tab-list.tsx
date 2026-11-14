import * as React from 'react';
import { useSlidingPill } from '@/hooks/ui/useSlidingPill';
import { cn } from '@/lib/utils';

/** Custom tab bars share Search's motion while retaining their own markup/style. */
export function SlidingTabList({
  as = 'div',
  children,
  className,
  targetSelector,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'nav' | 'aside'; targetSelector?: string }) {
  const { group, pill } = useSlidingPill<HTMLElement>(children, {
    activeSelector: ':is([aria-selected="true"], [aria-pressed="true"], [aria-current="page"], [data-active="true"]):not([data-sliding-tab-static])',
    tabSelector: 'button, a, [role="tab"]',
    targetSelector,
    observeSelection: true,
    matchTabStyle: true,
  });
  return React.createElement(as, {
    ...props,
    ref: group,
    className: cn('sliding-tab-list', className),
  }, <span ref={pill} className="t-tabs-pill" aria-hidden="true" />, children);
}
