import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { SpotlightPresentation as Presentation, SpotlightPartId, SpotlightPlacement } from '@/lib/customization';
import { customizationLabel as label, customizationMessage as message } from '@/lib/customizationLabels';
import '@/components/customization/customization.css';
import './spotlight-layout.css';

export const SPOTLIGHT_PLACEMENTS: readonly SpotlightPlacement[] = ['original', 'top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
export const SPOTLIGHT_PARTS: readonly SpotlightPartId[] = ['title', 'details', 'description', 'actions'];
interface PresentationState { presentation?: Presentation | null; editing: boolean; onChange?(change: Partial<Presentation>): void }
const PresentationContext = createContext<PresentationState>({ editing: false });
const StageContext = createContext<HTMLElement | null>(null);
export function SpotlightPresentationProvider({ presentation, editing = false, onChange, children }: { presentation?: Presentation | null; editing?: boolean; onChange?(change: Partial<Presentation>): void; children: ReactNode }) {
  return <PresentationContext.Provider value={{ presentation, editing, onChange }}>{children}</PresentationContext.Provider>;
}
export function useSpotlightPresentation() { return useContext(PresentationContext).presentation; }
export function useSpotlightEditing() { return useContext(PresentationContext).editing; }
export function spotlightArtworkBlur(value: unknown, fallback = 18): number {
  if (typeof document !== 'undefined' && (document.body?.classList.contains('ultra-lite-theme') || document.documentElement?.classList.contains('ultra-lite-theme'))) return 0;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(64, value)) : fallback;
}
function SnapZone({ placement }: { placement: SpotlightPlacement }) {
  const { setNodeRef, isOver } = useDroppable({ id: `spotlight-zone:${placement}` });
  return <div ref={setNodeRef} data-spotlight-drop-zone={placement} className={`spotlight-snap-zone ${isOver ? 'spotlight-snap-zone-active' : ''}`}>{label(placement.replace(/-/g, ' '))}</div>;
}
export function SpotlightPresentation({ children }: { children: ReactNode }) {
  const { presentation, editing, onChange } = useContext(PresentationContext);
  const wrapper = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const cinematicEdit = editing && presentation?.variant === 'cinematic';
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  useLayoutEffect(() => {
    if (!wrapper.current || typeof window === 'undefined') return;
    const chooseStage = () => {
      const candidates = [...wrapper.current!.querySelectorAll<HTMLElement>('[data-spotlight-stage]')];
      setStage(candidates.find(element => element.getClientRects().length > 0) || candidates[0] || null);
    };
    chooseStage(); window.addEventListener('resize', chooseStage);
    return () => window.removeEventListener('resize', chooseStage);
  }, [presentation?.variant, cinematicEdit]);
  function drop(event: DragEndEvent) {
    setDragging(false);
    const part = String(event.active.id).replace('spotlight-part:', '') as SpotlightPartId;
    const placement = String(event.over?.id || '').replace('spotlight-zone:', '') as SpotlightPlacement;
    if (SPOTLIGHT_PARTS.includes(part) && SPOTLIGHT_PLACEMENTS.includes(placement)) onChange?.({ placements: { ...presentation?.placements, [part]: placement } });
  }
  if ((!presentation || !Object.keys(presentation).length) && !editing) return <>{children}</>;
  const align = presentation?.titleAlign || 'left';
  const style = {
    '--spotlight-height': presentation?.height == null ? undefined : `${Math.max(320, Math.min(1000, presentation.height))}px`,
    '--spotlight-title-size': presentation?.titleSize == null ? undefined : `${Math.max(18, Math.min(96, presentation.titleSize))}px`,
    '--spotlight-title-align': align,
    '--spotlight-content-align': align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
    '--spotlight-shade': presentation?.shade == null ? undefined : Math.max(0, Math.min(1, presentation.shade)),
  } as CSSProperties;
  const content = <div ref={wrapper} className="spotlight-presentation" onClickCapture={editing ? event => { event.preventDefault(); event.stopPropagation(); } : undefined} data-custom-spotlight data-spotlight-variant={presentation?.variant || 'default'} data-spotlight-height={presentation?.height != null} data-spotlight-title-size={presentation?.titleSize != null} data-spotlight-title-align={presentation?.titleAlign != null} data-spotlight-shade-set={presentation?.shade != null} data-spotlight-description={presentation?.showDescription} data-spotlight-metadata={presentation?.showMetadata} style={style}>
    <StageContext.Provider value={stage}>{editing && !cinematicEdit ? <div {...({ inert: '' } as any)}>{children}</div> : children}</StageContext.Provider>
    {cinematicEdit && <div className={`spotlight-snap-grid ${dragging ? 'spotlight-snap-grid-visible' : ''}`} aria-hidden="true">{SPOTLIGHT_PLACEMENTS.filter(position => position !== 'original').map(position => <SnapZone key={position} placement={position} />)}</div>}
  </div>;
  return cinematicEdit ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setDragging(true)} onDragCancel={() => setDragging(false)} onDragEnd={drop}>{content}</DndContext> : content;
}
/** Cinematic text can snap around the existing artwork; source actions remain unchanged after Save. */
export function SpotlightPart({ part, children }: { part: SpotlightPartId; children: ReactNode }) {
  const { presentation, editing } = useContext(PresentationContext);
  const stage = useContext(StageContext);
  const movable = editing && presentation?.variant === 'cinematic';
  const draggable = useDraggable({ id: `spotlight-part:${part}`, disabled: !movable });
  const placement = presentation?.placements?.[part];
  const placed = presentation?.variant === 'cinematic' && placement && placement !== 'original' && SPOTLIGHT_PLACEMENTS.includes(placement);
  if (!movable && !placed) return <>{children}</>;
  const scale = draggable.transform && stage?.offsetWidth ? stage.getBoundingClientRect().width / stage.offsetWidth || 1 : 1;
  const content = <div ref={draggable.setNodeRef} className={`spotlight-part ${placed ? 'spotlight-part-placed' : ''}`} data-spotlight-part={part} data-spotlight-placement={placed ? placement : undefined} style={draggable.transform ? { translate: `${draggable.transform.x / scale}px ${draggable.transform.y / scale}px` } : undefined}>
    {movable && <button type="button" ref={draggable.setActivatorNodeRef} {...draggable.listeners} {...draggable.attributes} className="spotlight-part-handle" aria-label={message('drag', 'Drag {{name}}', { name: label(part) })}><GripVertical className="size-4" />{label(part)}</button>}
    {editing && part === 'actions' ? <div {...({ inert: '' } as any)}>{children}</div> : children}
  </div>;
  return placed && stage ? createPortal(content, stage) : content;
}
export function SpotlightOptionalDescription({ description }: { description?: string }) {
  const presentation = useSpotlightPresentation();
  return presentation?.showDescription === true && description ? <p data-spotlight-description className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{description}</p> : null;
}
