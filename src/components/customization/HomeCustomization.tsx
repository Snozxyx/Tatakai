import { ThemedSelect } from '@/components/ui/themed-select';
import { customizationLabel as label, customizationMessage as message } from '@/lib/customizationLabels';
import { createContext, useContext, useEffect, useMemo, useState, Fragment, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, Plus, Eye, EyeOff, SlidersHorizontal, MoreHorizontal } from 'lucide-react';
import { useCustomization } from '@/hooks/ui/useCustomization';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { getTargetCustomization, type CardDesign, type LayoutTarget, type PageCustomization, type SectionCustomization, type CustomShelf, type SpotlightPresentation } from '@/lib/customization';
import { arrangeSectionIds, customShelves, moveSection, retainUnavailableSectionIds } from '@/lib/customizationSections';
import { diffCustomizationValue } from '@/lib/customizationDraft';
import { useCustomizationScope, CardDesignPreviewProvider, useCardDesignContext } from './CardDesignContext';
import { AppearanceBackground, BackgroundEditor, AppearanceDraftProvider } from '@/components/settings/BackgroundEditor';
import { CustomShelfEditor } from './CustomShelfEditor';
import { SavedCustomShelf } from './CustomShelf';
import { Button } from '@/components/ui/button';
import { SpotlightPresentationProvider } from './SpotlightPresentation';
import { SpotlightControls } from './SpotlightControls';
import '@/components/customization/customization.css';

export interface HomeSectionDescriptor { id: string; label: string; node: ReactNode; collection?: boolean; available?: boolean; feed?: boolean; group?: boolean; layoutLocked?: 'shelf' | 'original'; preservePresentation?: boolean }
interface HomeEditingValue { editing: boolean; page: PageCustomization; setPage(value: PageCustomization | ((current: PageCustomization) => PageCustomization)): void; target: LayoutTarget; themeId: string; designs: Record<string, CardDesign | null>; activeDesign?: string | null; sharedSpotlight?: SpotlightPresentation | null; setSharedSpotlight(value: SpotlightPresentation | null | undefined): void }
const HomeEditingContext = createContext<HomeEditingValue | undefined>(undefined);
export function useHomeSectionSettings() { return useContext(HomeEditingContext)?.page.sections; }
const inputClass = 'min-h-11 rounded-xl border border-border bg-background px-3 text-sm';

function SectionShell({ section, customization: storedCustomization, children, context }: { section: HomeSectionDescriptor; customization?: SectionCustomization | null; children: ReactNode; context: HomeEditingValue }) {
  const inherited = useCardDesignContext();
  const customization = section.layoutLocked ? { ...storedCustomization, layout: 'default' as const } : storedCustomization;
  if (section.preservePresentation) return <CardDesignPreviewProvider design={null} readOnly={context.editing}>{children}</CardDesignPreviewProvider>;
  const selectedDesign = context.activeDesign ? context.designs[context.activeDesign] : undefined;
  const sectionDesign = customization?.designId ? context.designs[customization.designId] : undefined;
  const design = customization?.designId === undefined && inherited ? inherited.design ?? selectedDesign : sectionDesign ?? selectedDesign;
  const hasStyle = customization && (customization.layout && customization.layout !== 'default' || customization.density || customization.background) || section.collection && design?.style?.width;
  const width = context.target === 'mobile' ? customization?.density === 'compact' ? 100 : customization?.density === 'spacious' ? 160 : 130 : context.target === 'tv' ? customization?.density === 'compact' ? 220 : customization?.density === 'spacious' ? 360 : 280 : customization?.density === 'compact' ? 130 : customization?.density === 'spacious' ? 220 : 170;
  const style = { '--section-card-width': `${design?.style?.width ?? width}px`, '--section-gap': customization?.density === 'compact' ? '10px' : customization?.density === 'spacious' ? '24px' : '16px' } as CSSProperties;
  const content = hasStyle ? <div data-custom-section={section.id} data-card-width={Boolean(design?.style?.width)} data-section-layout={customization?.layout} data-section-density={customization?.density} data-section-background={Boolean(customization?.background)} className="home-custom-section" style={style}>
    <AppearanceBackground background={customization?.background} />{children}
  </div> : children;
  const presentation = context.sharedSpotlight ?? customization?.spotlight;
  return <CardDesignPreviewProvider design={design} readOnly={context.editing}><SpotlightPresentationProvider presentation={presentation} editing={context.editing && section.id === 'spotlight'} onChange={change => context.setSharedSpotlight({ ...presentation, ...change })}>{content}</SpotlightPresentationProvider></CardDesignPreviewProvider>;
}

function SortableSection({ section, index, count, context, groupId, order }: { section: HomeSectionDescriptor; index: number; count: number; context: HomeEditingValue; groupId?: string; order: string[] }) {
  const sortable = useSortable({ id: section.id });
  const config = context.page.sections?.[section.id];
  const spotlight = context.sharedSpotlight ?? config?.spotlight;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const customShelf = context.page.customSections?.[section.id];
  const selectedDesignId = config?.designId && context.designs[config.designId] ? config.designId : context.activeDesign || '';
  const visible = config?.visible !== false;
  function patch(change: Partial<SectionCustomization>) {
    if (section.id === 'spotlight') {
      setPreviewOpen(true);
      if (change.spotlight !== undefined) { context.setSharedSpotlight(change.spotlight ?? { variant: 'default' }); return; }
    }
    context.setPage(current => ({ ...current, sections: { ...current.sections, [section.id]: { ...(current.sections?.[section.id] || {}), ...change } } }));
  }
  function reorder(delta: number) {
    const next = moveSection(order, section.id, delta);
    context.setPage(current => groupId ? { ...current, sections: { ...current.sections, [groupId]: { ...(current.sections?.[groupId] || {}), order: retainUnavailableSectionIds(next, current.sections?.[groupId]?.order) } } } : { ...current, order: retainUnavailableSectionIds(next, current.order) });
  }
  return <div ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="home-edit-section" data-edit-section={section.id}>
    <div className="flex items-center gap-1 sm:gap-2">
      <button type="button" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground touch-none hover:bg-muted" aria-label={message('drag', 'Drag {{name}}', { name: label(section.label) })}><GripVertical className="size-5" /></button>
      <button type="button" className="mr-auto min-w-0 text-left" aria-expanded={previewOpen} onClick={() => setPreviewOpen(value => !value)}>
        <strong className="block truncate text-sm">{label(section.label)}</strong><span className="block text-xs text-muted-foreground">{visible ? previewOpen ? label('Hide preview') : section.feed || section.group ? label('Show shelves') : label('Preview') : label('Hidden section')}</span>
      </button>
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={index === 0} aria-label={message('move_up', 'Move {{name}} up', { name: label(section.label) })} onClick={() => reorder(-1)}><ArrowUp className="size-4" /></Button>
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={index === count - 1} aria-label={message('move_down', 'Move {{name}} down', { name: label(section.label) })} onClick={() => reorder(1)}><ArrowDown className="size-4" /></Button>
      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-pressed={visible} aria-label={message(visible ? 'hide_section' : 'show_section', visible ? 'Hide {{name}}' : 'Show {{name}}', { name: label(section.label) })} onClick={() => patch({ visible: !visible })}>{visible ? <Eye className="size-4" /> : <EyeOff className="size-4 text-muted-foreground" />}</Button>
      {!section.preservePresentation && <Button variant={settingsOpen ? 'secondary' : 'ghost'} size="icon" className="h-10 w-10 shrink-0" aria-expanded={settingsOpen} aria-label={message('section_settings', 'Settings for {{name}}', { name: label(section.label) })} onClick={() => setSettingsOpen(value => !value)}><SlidersHorizontal className="size-4" /></Button>}
    </div>
    {settingsOpen && <div className="mt-3 space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      {section.id === 'spotlight' && <SpotlightControls value={spotlight} onChange={value => patch({ spotlight: value })} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {section.collection && <>{!section.layoutLocked && <label className="text-xs text-muted-foreground">{label('Section layout')}<ThemedSelect className={`${inputClass} mt-1 w-full`} value={config?.layout || 'default'} onChange={event => patch({ layout: event.target.value as SectionCustomization['layout'] })}><option value="default">{label('Original layout')}</option><option value="grid">{label('Grid')}</option><option value="shelf">{label('Shelf')}</option></ThemedSelect></label>}
          <label className="text-xs text-muted-foreground">{label('Card density')}<ThemedSelect className={`${inputClass} mt-1 w-full`} value={config?.density || 'comfortable'} onChange={event => patch({ density: event.target.value as SectionCustomization['density'] })}><option value="comfortable">{label('Comfortable')}</option><option value="compact">{label('Compact')}</option><option value="spacious">{label('Spacious')}</option></ThemedSelect></label></>}
        <label className="text-xs text-muted-foreground">{label('Card design')}<ThemedSelect className={`${inputClass} mt-1 w-full`} value={selectedDesignId} onChange={event => patch({ designId: event.target.value || null })}><option value="">{label('Theme card design')}</option>{Object.entries(context.designs).filter(([, design]) => design).map(([id, design]) => <option key={id} value={id}>{design!.name}</option>)}</ThemedSelect></label>
      </div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setBackgroundOpen(value => !value)}>{label('Background')}</Button><Button size="sm" variant="ghost" onClick={() => { if (section.id === 'spotlight') context.setSharedSpotlight({ variant: 'default' }); context.setPage(current => ({ ...current, sections: { ...current.sections, [section.id]: null } })); }}>{label('Reset section')}</Button>
        {customShelf && <><Button size="sm" variant="outline" onClick={() => setSourceOpen(value => !value)}>{label('Edit source')}</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => context.setPage(current => ({ ...current, order: current.order?.filter(id => id !== section.id), sections: { ...current.sections, [section.id]: null }, customSections: { ...current.customSections, [section.id]: null } }))}>{label('Remove')}</Button></>}
      </div>
      {backgroundOpen && <BackgroundEditor value={config?.background} onChange={background => patch({ background })} />}
      {sourceOpen && customShelf && <CustomShelfEditor initial={customShelf} onSave={shelf => { context.setPage(current => ({ ...current, customSections: { ...current.customSections, [shelf.id]: shelf } })); setSourceOpen(false); }} onCancel={() => setSourceOpen(false)} />}
    </div>}
    {(previewOpen || section.id === 'spotlight' && settingsOpen) && <div className="mt-3" data-live-spotlight-preview={section.id === 'spotlight'}>{section.available === false || !visible ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{!visible ? label('Hidden section') : label('This section has no content right now.')}</p> : section.feed || section.group || section.id === 'spotlight' ? <SectionShell section={section} customization={config} context={context}>{section.node}</SectionShell> : <div className="home-edit-content" aria-hidden="true" {...({ inert: '' } as any)}><SectionShell section={section} customization={config} context={context}>{section.node}</SectionShell></div>}</div>}
  </div>;
}

function SectionList({ sections, context, groupId }: { sections: HomeSectionDescriptor[]; context: HomeEditingValue; groupId?: string }) {
  const ids = sections.map(section => section.id);
  const savedOrder = groupId ? context.page.sections?.[groupId]?.order : context.page.order;
  const order = arrangeSectionIds(ids, savedOrder).filter(id => ids.includes(id));
  const arranged = order.map(id => sections.find(section => section.id === id)!).filter(Boolean);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function end(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const next = arrayMove(order, order.indexOf(String(event.active.id)), order.indexOf(String(event.over.id)));
    context.setPage(current => groupId ? { ...current, sections: { ...current.sections, [groupId]: { ...(current.sections?.[groupId] || {}), order: retainUnavailableSectionIds(next, current.sections?.[groupId]?.order) } } } : { ...current, order: retainUnavailableSectionIds(next, current.order) });
  }
  if (context.editing) return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}><SortableContext items={order} strategy={verticalListSortingStrategy}>{arranged.map((section, index) => <SortableSection key={section.id} section={section} context={context} groupId={groupId} order={order} index={index} count={arranged.length} />)}</SortableContext></DndContext>;
  return <>{arranged.map(section => context.page.sections?.[section.id]?.visible === false ? null : <SectionShell key={section.id} section={section} customization={context.page.sections?.[section.id]} context={context}>{section.node}</SectionShell>)}</>;
}

/** Nested infinite shelves share the page draft but remain inside their movable feed group. */
export function HomeSectionGroup({ groupId, sections }: { groupId: string; sections: HomeSectionDescriptor[] }) {
  const context = useContext(HomeEditingContext);
  if (!context) return <>{sections.map(section => <Fragment key={section.id}>{section.node}</Fragment>)}</>;
  return <SectionList sections={sections} context={context} groupId={groupId} />;
}

export function HomeCustomization({ pageId, sections, defaultContent }: { pageId: string; sections: HomeSectionDescriptor[]; defaultContent?: ReactNode }) {
  useUiTranslation();
  const { settings, userId, savePatch, syncStatus } = useCustomization();
  const actualScope = useCustomizationScope();
  const [params, setParams] = useSearchParams();
  const editing = params.get('customize') === '1';
  const chosenTarget = params.get('customizationTarget');
  const target = (editing && ['tv', 'mobile', 'desktop'].includes(chosenTarget || '') ? chosenTarget : actualScope.target) as LayoutTarget;
  const themeId = editing && params.get('customizationTheme') || actualScope.themeId;
  const targetSettings = getTargetCustomization(settings, themeId, target);
  const persisted = targetSettings.pages?.[pageId] || {};
  const [draft, setDraft] = useState<PageCustomization>(persisted);
  const [sharedSpotlightDraft, setSharedSpotlightDraft] = useState<SpotlightPresentation | null | undefined>(targetSettings.spotlight);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (editing) { setDraft(persisted); setSharedSpotlightDraft(targetSettings.spotlight); setError(''); } }, [editing, pageId, themeId, target, userId]);
  const page = editing ? draft : persisted;
  const extras = customShelves(page);
  const defaultIds = sections.map(section => section.id), feedId = sections.find(section => section.feed)?.id;
  const order = arrangeSectionIds(defaultIds, page.order, extras.map(shelf => shelf.id), feedId);
  const allSections = [...sections, ...extras.map(shelf => ({ id: shelf.id, label: shelf.title, collection: true, node: <SavedCustomShelf shelf={shelf} target={target} preview={editing} /> }))];
  const hasPageOverrides = extras.length > 0 || Boolean(page.order && JSON.stringify(page.order) !== JSON.stringify(defaultIds)) || Object.values(page.sections || {}).some(value => value && Object.keys(value).length > 0);
  const sharedSpotlight = editing ? sharedSpotlightDraft : targetSettings.spotlight;
  const context: HomeEditingValue = { editing, page: { ...page, order }, setPage: setDraft, target, themeId, designs: targetSettings.designs || {}, activeDesign: targetSettings.activeDesign, sharedSpotlight, setSharedSpotlight: setSharedSpotlightDraft };
  function exitEditor() { setParams(current => { const next = new URLSearchParams(current); next.delete('customize'); next.delete('customizationTarget'); next.delete('customizationTheme'); return next; }, { replace: true }); setAdding(false); }
  async function save() {
    setSaving(true); setError('');
    try {
      const changed = diffCustomizationValue(persisted, draft) as PageCustomization | undefined;
      const spotlightChanged = diffCustomizationValue(targetSettings.spotlight, sharedSpotlightDraft) as SpotlightPresentation | null | undefined;
      if (changed || spotlightChanged !== undefined) await savePatch({ themes: { [themeId]: { targets: { [target]: { ...(changed ? { pages: { [pageId]: changed } } : {}), ...(spotlightChanged !== undefined ? { spotlight: spotlightChanged } : {}) } } } } });
      exitEditor();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : label("Your changes could not be saved.")); }
    finally { setSaving(false); }
  }
  const content = <HomeEditingContext.Provider value={context}><SpotlightPresentationProvider presentation={sharedSpotlight}>
    {editing && <div className="sticky top-3 z-[65] mb-6 rounded-2xl border border-primary/30 bg-background/95 p-4 shadow-lg backdrop-blur-md" role="region" aria-label={label("Home customization controls")}>
      <div className="flex flex-wrap items-center gap-2"><strong className="mr-auto">{message('home_title', 'Customize this home · {{target}}', { target })}</strong><details className="relative"><summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-xl hover:bg-muted" aria-label={label('More options')}><MoreHorizontal className="size-4" /></summary><div className="absolute right-0 top-12 z-10 rounded-xl border border-border bg-background p-2 shadow-lg"><Button variant="outline" onClick={() => { setSharedSpotlightDraft(targetSettings.spotlight); setDraft({ order: defaultIds, sections: Object.fromEntries(Object.keys({ ...persisted.sections, ...draft.sections }).map(id => [id, null])), customSections: Object.fromEntries(Object.keys({ ...persisted.customSections, ...draft.customSections }).map(id => [id, null])) }); }}>{label("Reset page")}</Button></div></details><Button onClick={() => setAdding(value => !value)} variant="outline"><Plus className="mr-2 size-4" />{label("Add section")}</Button><Button variant="outline" disabled={saving} onClick={exitEditor}>{label("Cancel")}</Button><Button disabled={saving} onClick={() => void save()}>{saving ? label("Saving…") : label("Save")}</Button></div>
      <p className="mt-2 text-xs text-muted-foreground">{label("Drag sections or use the move buttons. Changes stay in this preview until Save.")}</p>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {syncStatus === 'pending' && <p role="status" className="mt-2 text-xs text-muted-foreground">{label('Settings saved on this device; image upload is pending.')}</p>}
      {adding && <div className="mt-4"><CustomShelfEditor onSave={shelf => { setDraft(current => ({ ...current, customSections: { ...current.customSections, [shelf.id]: shelf }, order: retainUnavailableSectionIds(arrangeSectionIds(defaultIds, current.order, [...customShelves(current).map(item => item.id), shelf.id], feedId), current.order) })); setAdding(false); }} onCancel={() => setAdding(false)} /></div>}
    </div>}
    {!editing && !hasPageOverrides && defaultContent !== undefined ? defaultContent : <SectionList sections={allSections} context={context} />}
  </SpotlightPresentationProvider></HomeEditingContext.Provider>;
  return editing ? <AppearanceDraftProvider>{content}</AppearanceDraftProvider> : content;
}
