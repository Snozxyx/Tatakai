import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUp, ArrowDown, GripVertical, MoreHorizontal, Settings, User, Plus, Trash2 } from 'lucide-react';
import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import { randomUUID } from '@/lib/uuid';
import { normalizeSidebarRoute, sidebarQuickPeek, type SidebarOpenMode } from '@/lib/sidebarLinks';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/branding/BrandLogo';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { DEFAULT_SIDEBAR, getSidebarItem, sidebarItemLabel, normalizeSidebarPreferences, sidebarRailItems, useSidebarPreferences, type SidebarItemId, type SidebarPreferences, type SidebarRouteItem } from '@/lib/sidebarCustomization';
import { sidebarIcon } from '@/components/layout/sidebarIcons';

function SidebarRow({ item, index, count, shown, onShow, onMove, onRemove }: { item: SidebarRouteItem; index: number; count: number; shown: boolean; onShow: (shown: boolean) => void; onMove: (delta: number) => void; onRemove?: () => void }) {
  const { t } = useTranslation();
  const id = item.id, label = sidebarItemLabel(item, t);
  const sortable = useSortable({ id });
  const Icon = sidebarIcon(id);
  const style: CSSProperties = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.55 : 1 };
  return <div ref={sortable.setNodeRef} style={style} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-3">
    <button type="button" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent touch-none" aria-label={t('customization.sidebar.drag', { item: label })}><GripVertical className="size-4" /></button>
    <Icon className="size-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 text-sm font-medium">{label}{item.desktopOnly && <span className="block text-xs font-normal text-muted-foreground">{t('customization.sidebar.desktopOnly')}</span>}{item.name && <span className="block truncate text-xs font-normal text-muted-foreground">{item.path}</span>}</span>
    <Button type="button" size="icon" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('customization.sidebar.up', { item: label })}><ArrowUp className="size-4" /></Button>
    <Button type="button" size="icon" variant="ghost" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t('customization.sidebar.down', { item: label })}><ArrowDown className="size-4" /></Button>
    {onRemove && <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label={t('customization.sidebar.removeShortcut', { item: label })}><Trash2 className="size-4" /></Button>}
    <ThemedCheckbox checked={shown} onChange={event => onShow(event.target.checked)} aria-label={t('customization.sidebar.show', { item: label })} />
  </div>;
}
export function SidebarCustomizationEditor() {
  const { t } = useTranslation();
  const { preferences, save } = useSidebarPreferences();
  const desktop = useIsDesktopApp();
  const [draft, setDraft] = useState<SidebarPreferences | null>(preferences);
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [shortcutName, setShortcutName] = useState('');
  const [shortcutRoute, setShortcutRoute] = useState('');
  const [shortcutMode, setShortcutMode] = useState<SidebarOpenMode>('page');
  const normalizedRoute = normalizeSidebarRoute(shortcutRoute);
  const canQuickView = !!normalizedRoute && !!sidebarQuickPeek(normalizedRoute, shortcutName || 'Shortcut');
  const closeAdd = () => { setAdding(false); setShortcutName(''); setShortcutRoute(''); setShortcutMode('page'); };
  const add = () => {
    if (!normalizedRoute || !shortcutName.trim()) return;
    const id = `link:${randomUUID()}` as const;
    setDraft(current => { const value = current ?? DEFAULT_SIDEBAR; return { ...value, order: [...value.order, id], links: { ...value.links, [id]: { id, name: shortcutName.trim(), path: normalizedRoute, mode: shortcutMode === 'quick-view' && canQuickView ? 'quick-view' : 'page' } } }; });
    closeAdd(); setMessage('');
  };
  const remove = (id: SidebarItemId) => setDraft(current => { const value = current ?? DEFAULT_SIDEBAR; return { ...value, order: value.order.filter(item => item !== id), hidden: value.hidden.filter(item => item !== id), links: { ...value.links, [id]: null } }; });
  const config = draft ?? DEFAULT_SIDEBAR;
  const savedKey = JSON.stringify(preferences), draftKey = JSON.stringify(normalizeSidebarPreferences(draft));
  const dirty = savedKey !== draftKey;
  useEffect(() => { if (!dirty) setDraft(preferences); }, [savedKey, dirty]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const move = (id: SidebarItemId, delta: number) => setDraft(current => { const value = current ?? DEFAULT_SIDEBAR, index = value.order.indexOf(id); return { ...value, order: arrayMove(value.order, index, index + delta) }; });
  function end(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    setDraft(current => { const value = current ?? DEFAULT_SIDEBAR; return { ...value, order: arrayMove(value.order, value.order.indexOf(event.active.id as SidebarItemId), value.order.indexOf(event.over!.id as SidebarItemId)) }; });
  }
  const normalizedPreview = normalizeSidebarPreferences(draft);
  const visible = sidebarRailItems(normalizedPreview, desktop);
  const beforeMore = normalizedPreview ? visible : visible.filter(item => item.id !== 'downloads');
  const afterMore = normalizedPreview ? [] : visible.filter(item => item.id === 'downloads');
  return <section data-sidebar-customization className="space-y-4">
    <div><h3 className="text-lg font-semibold">{t('customization.sidebar.title')}</h3><p className="text-sm text-muted-foreground">{t('customization.sidebar.description')}</p></div>
    <Button variant="outline" onClick={() => setAdding(true)}><Plus className="size-4" />{t('customization.sidebar.addShortcut')}</Button>
    {adding && <div data-sidebar-link-form className="space-y-3 rounded-xl border border-border bg-card p-4">
      <label className="block space-y-1"><span className="text-sm font-medium">{t('customization.sidebar.shortcutName')}</span><input aria-label={t('customization.sidebar.shortcutName')} value={shortcutName} maxLength={100} onChange={event => setShortcutName(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
      <label className="block space-y-1"><span className="text-sm font-medium">{t('customization.sidebar.shortcutRoute')}</span><input aria-label={t('customization.sidebar.shortcutRoute')} value={shortcutRoute} maxLength={2048} placeholder="/anime/123" onChange={event => setShortcutRoute(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
      {!!shortcutRoute && !normalizedRoute && <p role="alert" className="text-xs text-destructive">{t('customization.sidebar.invalidRoute')}</p>}
      <label className="block space-y-1"><span className="text-sm font-medium">{t('customization.sidebar.openMode')}</span><ThemedSelect aria-label={t('customization.sidebar.openMode')} value={shortcutMode === 'quick-view' && canQuickView ? 'quick-view' : 'page'} onChange={event => setShortcutMode(event.target.value as SidebarOpenMode)}><option value="page">{t('customization.sidebar.page')}</option><option value="quick-view" disabled={!canQuickView}>{t('customization.sidebar.quickView')}</option></ThemedSelect></label>
      <p className="text-xs text-muted-foreground">{t('customization.sidebar.quickViewHint')}</p>
      <div className="flex gap-2"><Button disabled={!shortcutName.trim() || !normalizedRoute} onClick={add}>{t('customization.sidebar.createShortcut')}</Button><Button variant="outline" onClick={closeAdd}>{t('customization.cancel')}</Button></div>
    </div>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}><SortableContext items={config.order} strategy={verticalListSortingStrategy}><div className="space-y-2">{config.order.map((id, index) => { const item = getSidebarItem(id, config); return item && <SidebarRow key={id} item={item} index={index} count={config.order.length} onRemove={id.startsWith('link:') ? () => remove(id) : undefined} shown={!config.hidden.includes(id)} onMove={delta => move(id, delta)} onShow={shown => setDraft(current => { const value = current ?? DEFAULT_SIDEBAR; return { ...value, hidden: shown ? value.hidden.filter(hidden => hidden !== id) : [...value.hidden, id] }; })} />; })}</div></SortableContext></DndContext>
      <div className="rounded-2xl border border-border bg-muted/20 p-4"><p className="mb-3 text-center text-xs text-muted-foreground">{t('customization.livePreview')}</p><div data-sidebar-preview className="mx-auto flex w-[72px] flex-col items-center gap-3 rounded-[2rem] border border-border/40 bg-background/70 px-2 py-4 shadow-sm"><BrandLogo alt="" className="mb-1 size-10 rounded-xl" />{beforeMore.map(item => { const Icon = sidebarIcon(item.id); return <div key={item.id} title={sidebarItemLabel(item, t)} className="flex size-10 items-center justify-center rounded-xl text-muted-foreground"><Icon className="size-5" /></div>; })}<div title={t('nav.more')} className="flex size-10 items-center justify-center rounded-xl text-muted-foreground"><MoreHorizontal className="size-5" /></div>{afterMore.map(item => { const Icon = sidebarIcon(item.id); return <div key={item.id} title={sidebarItemLabel(item, t)} className="flex size-10 items-center justify-center rounded-xl text-muted-foreground"><Icon className="size-5" /></div>; })}<div className="my-1 h-px w-8 bg-border" /><User className="size-5 text-muted-foreground" /><div title={t('nav.settings')} className="flex size-10 items-center justify-center rounded-xl text-muted-foreground"><Settings className="size-5" /></div></div></div>
    </div>
    <p className="text-xs text-muted-foreground">{t('customization.sidebar.reachable')}</p>
    <div className="flex flex-wrap gap-2"><Button disabled={!dirty} onClick={() => { try { save(draft); setMessage(t('customization.saved')); } catch { setMessage(t('customization.saveFailed')); } }}>{t('customization.save')}</Button><Button variant="outline" disabled={!dirty} onClick={() => { setDraft(preferences); closeAdd(); setMessage(t('customization.cancelled')); }}>{t('customization.cancel')}</Button><Button variant="ghost" onClick={() => { setDraft(null); closeAdd(); setMessage(''); }}>{t('customization.sidebar.reset')}</Button><span role="status" className="self-center text-xs text-muted-foreground">{dirty ? t('customization.unsaved') : message}</span></div>
  </section>;
}
