import { useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ThemedSelect } from '@/components/ui/themed-select';
import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { BackgroundEditor } from '@/components/settings/BackgroundEditor';
import { CARD_SLOT_DEFAULTS_BY_BASE, SLOT_ZONES } from '@/components/customization/CardDesignContext';
import type { CardDesign, CardSlotId, CardSlotZone } from '@/lib/customization';

const fields: CardSlotId[] = ['title', 'rating', 'type', 'status', 'year', 'episodes', 'chapters', 'views', 'rank', 'menu'];
function DragField({ id, label, selected, onSelect }: { id: CardSlotId; label: string; selected: boolean; onSelect: () => void }) {
  const drag = useDraggable({ id });
  return <button type="button" ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} onClick={onSelect}
    aria-pressed={selected} className={`customization-drag-field ${selected ? 'is-selected' : ''}`}
    style={{ opacity: drag.isDragging ? .4 : 1 }}><GripVertical aria-hidden className="size-3" />{label}</button>;
}
function Zone({ zone, children, label }: { zone: CardSlotZone; children: React.ReactNode; label: string }) {
  const drop = useDroppable({ id: zone });
  return <div ref={drop.setNodeRef} className={`customization-zone ${drop.isOver ? 'is-over' : ''}`} data-zone={zone}>
    <span className="customization-zone-label">{label}</span>{children}
  </div>;
}
export function CardDesignEditor({ design, onChange }: { design: CardDesign; onChange: (value: CardDesign) => void }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<CardSlotId>('title');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }), useSensor(KeyboardSensor));
  const defaults = CARD_SLOT_DEFAULTS_BY_BASE[design.base];
  const slot = (id: CardSlotId) => design.slots?.[id] || defaults[id];
  const move = (id: CardSlotId, zone: CardSlotZone) => onChange({ ...design, slots: { ...design.slots, [id]: { ...slot(id), zone, order: Math.max(-1, ...fields.filter(field => field !== id && slot(field).zone === zone).map(field => slot(field).order)) + 1 } } });
  const dragEnd = ({ active, over }: DragEndEvent) => { if (over && fields.includes(active.id as CardSlotId) && SLOT_ZONES.includes(over.id as CardSlotZone)) move(active.id as CardSlotId, over.id as CardSlotZone); };
  const updateStyle = (patch: Partial<NonNullable<CardDesign['style']>>) => onChange({ ...design, style: { ...design.style, ...patch } });
  const range = (key: keyof NonNullable<CardDesign['style']>, min: number, max: number, fallback: number, step = 1) => <label className="customization-field">
    <span>{t(`customization.card.${key}`)} <output>{String(design.style?.[key] ?? fallback)}</output></span>
    <input type="range" min={min} max={max} step={step} value={Number(design.style?.[key] ?? fallback)} onChange={event => updateStyle({ [key]: Number(event.target.value) })} />
  </label>;
  return <div className="space-y-5" data-card-design-editor>
    <label className="customization-field"><span>{t('customization.designName')}</span><input value={design.name} maxLength={80} onChange={event => onChange({ ...design, name: event.target.value })} /></label>
    <label className="customization-field"><span>{t('customization.baseStyle')}</span><ThemedSelect value={design.base} onChange={event => onChange({ ...design, base: event.target.value as CardDesign['base'] })}>
      <option value="overlay">{t('customization.overlay')}</option><option value="poster">{t('customization.poster')}</option>
    </ThemedSelect></label>
    <p className="text-xs text-muted-foreground">{t('customization.dragHelp')}</p>
    <DndContext sensors={sensors} onDragEnd={dragEnd}>
      <div className="customization-zone-grid">{SLOT_ZONES.map(zone => <Zone key={zone} zone={zone} label={t(`customization.zones.${zone}`)}>
        {fields.filter(id => slot(id).zone === zone).sort((a, b) => slot(a).order - slot(b).order).map(id => <DragField key={id} id={id} label={t(`customization.slots.${id}`)} selected={selected === id} onSelect={() => setSelected(id)} />)}
      </Zone>)}</div>
    </DndContext>
    <div className="customization-control-grid">
      <label className="customization-field"><span>{t('customization.selectedField')}</span><ThemedSelect value={selected} onChange={event => setSelected(event.target.value as CardSlotId)}>{fields.map(id => <option key={id} value={id}>{t(`customization.slots.${id}`)}</option>)}</ThemedSelect></label>
      <label className="customization-field"><span>{t('customization.position')}</span><ThemedSelect value={slot(selected).zone} onChange={event => move(selected, event.target.value as CardSlotZone)}>{SLOT_ZONES.map(zone => <option key={zone} value={zone}>{t(`customization.zones.${zone}`)}</option>)}</ThemedSelect></label>
      <label className="customization-field"><span>{t('customization.fieldOrder')}</span><input type="number" min={0} max={99} value={slot(selected).order} onChange={event => onChange({ ...design, slots: { ...design.slots, [selected]: { ...slot(selected), order: Math.max(0, Math.min(99, Number(event.target.value))) } } })} /></label>
      <label className="flex items-center gap-2 text-sm"><ThemedCheckbox checked={slot(selected).visible} disabled={selected === 'title' || selected === 'menu'} onChange={event => onChange({ ...design, slots: { ...design.slots, [selected]: { ...slot(selected), visible: event.target.checked } } })} />{t('customization.showField')}</label>
    </div>
    <details className="customization-advanced"><summary>{t('customization.cardAppearance')}</summary><div className="customization-control-grid">
      {range('width', 120, 320, 192, 4)}{range('radius', 0, 32, 16)}{range('gap', 0, 16, 4)}{range('padding', 0, 24, 12)}
      {range('titleSize', 10, 28, design.base === 'overlay' ? 18 : 14)}{range('metadataSize', 10, 20, 12)}{range('titleWeight', 400, 900, 700, 100)}{range('gradient', 0, 1, .9, .05)}{range('borderWidth', 0, 4, 1)}
      <label className="customization-field"><span>{t('customization.card.aspectRatio')}</span><ThemedSelect value={design.style?.aspectRatio || 'poster'} onChange={event => updateStyle({ aspectRatio: event.target.value as 'poster' | 'square' | 'landscape' })}>{['poster', 'square', 'landscape'].map(value => <option key={value} value={value}>{t(`customization.${value}`)}</option>)}</ThemedSelect></label>
      <label className="customization-field"><span>{t('customization.card.titleLines')}</span><ThemedSelect value={design.style?.titleLines || 2} onChange={event => updateStyle({ titleLines: Number(event.target.value) as 1 | 2 | 3 })}>{[1, 2, 3].map(value => <option key={value} value={value}>{value}</option>)}</ThemedSelect></label>
      <label className="customization-field"><span>{t('customization.card.shadow')}</span><ThemedSelect value={design.style?.shadow || 'none'} onChange={event => updateStyle({ shadow: event.target.value as 'none' | 'soft' | 'strong' })}>{['none', 'soft', 'strong'].map(value => <option key={value} value={value}>{t(`customization.${value}`)}</option>)}</ThemedSelect></label>
      <label className="customization-field"><span>{t('customization.card.textColor')}</span><input type="color" value={design.style?.textColor || '#ffffff'} onChange={event => updateStyle({ textColor: event.target.value })} /></label>
      <label className="customization-field"><span>{t('customization.card.borderColor')}</span><input type="color" value={design.style?.borderColor || '#808080'} onChange={event => updateStyle({ borderColor: event.target.value })} /></label>
    </div>
    <BackgroundEditor value={design.style?.background} onChange={background => updateStyle({ background })} /></details>
  </div>;
}
