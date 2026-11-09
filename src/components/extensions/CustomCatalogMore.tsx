import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { isExplicitExtensionContent } from '@/lib/contentSafety';
import { fetchCustomCatalogPage } from '@/core/content/custom-source-runtime';
import { mergeCustomCatalogPage } from '@/core/content/custom-catalog-pagination';
import type { CustomHomeSection, CustomMediaCard } from '@/core/extensions/sdk/types';
import { Button } from '@/components/ui/button';
import uiI18n from '@/lib/uiI18n';
import { isTV } from '@/core/tv/device';
import { customSourceBase } from '@/core/content/custom-source-model';

export function CustomCatalogMore({ namespace, sourceId, section, children }: {
  namespace: string; sourceId: string; section: CustomHomeSection;
  children(items: CustomMediaCard[]): ReactNode;
}) {
  const [items, setItems] = useState(section.items);
  const [nextSkip, setNextSkip] = useState(section.pagination?.nextSkip ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController>();
  const container = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<string | true>();
  const { settings: safety } = useContentSafetySettings();
  useEffect(() => () => { const controller = active.current; active.current = undefined; controller?.abort(); }, []);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const links = [...(container.current?.querySelectorAll<HTMLAnchorElement>('a[href]') || [])];
    const href = typeof pendingFocus.current === 'string' ? `${customSourceBase({ namespace, id: sourceId })}/info/${encodeURIComponent(pendingFocus.current)}` : undefined;
    const target = href ? links.find(link => link.getAttribute('href') === href) : links.at(-1);
    pendingFocus.current = undefined;
    if (target) { target.tabIndex = 0; target.focus(); target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
  }, [items, nextSkip, namespace, sourceId]);
  async function load() {
    if (!section.pagination || nextSkip === null || active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError('');
    try {
      const page = await fetchCustomCatalogPage(namespace, sourceId, section.pagination.catalogId, nextSkip, controller.signal);
      if (controller.signal.aborted) return;
      const merged = mergeCustomCatalogPage(items, page);
      if (isTV() && document.activeElement === moreButton.current) {
        pendingFocus.current = page.items.find(item => !items.some(previous => previous.id === item.id) && (safety.showAdultEverywhere || !isExplicitExtensionContent(item)))?.id || (merged.nextSkip === null ? true : undefined);
      }
      setItems(merged.items); setNextSkip(merged.nextSkip);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : uiI18n.t('extensionSetup.catalogLoadFailed'));
    } finally {
      if (active.current === controller) { active.current = undefined; setBusy(false); }
    }
  }
  return <div ref={container}>
    {children(safety.showAdultEverywhere ? items : items.filter(item => !isExplicitExtensionContent(item)))}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {nextSkip !== null && <Button ref={moreButton} className="mt-3" variant="outline" disabled={busy && !isTV()} aria-busy={busy}
      data-tv-key={`catalog-more-${namespace}-${sourceId}-${section.pagination?.catalogId}`}
      onClick={() => void load()}>{busy ? uiI18n.t('extensionSetup.loadingCatalog') : uiI18n.t('extensionSetup.moreCatalog', { name: section.title })}</Button>}
  </div>;
}
