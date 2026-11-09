import { createContext, useContext, type ReactNode } from 'react';
import { useCustomization, useCustomizationScope } from '@/hooks/ui/useCustomization';
import { getTargetCustomization, type CardDesign, type CardSlotId, type CardSlotZone, type LayoutTarget } from '@/lib/customization';

export const SLOT_ZONES: readonly CardSlotZone[] = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right', 'below'];
export const CARD_SLOT_LABELS: Record<CardSlotId, string> = { title: 'Title', rating: 'Rating', type: 'Media type', status: 'Status', year: 'Year', episodes: 'Episodes', chapters: 'Chapters', views: 'Views', rank: 'Rank', menu: 'Menu' };
export const CARD_SLOT_DEFAULTS_BY_BASE = {
  overlay: { title: { zone: 'bottom-left', order: 0, visible: true }, rating: { zone: 'bottom-left', order: 1, visible: true }, type: { zone: 'top-left', order: 0, visible: true }, status: { zone: 'top-left', order: 1, visible: true }, year: { zone: 'bottom-left', order: 2, visible: true }, episodes: { zone: 'bottom-left', order: 3, visible: true }, chapters: { zone: 'bottom-left', order: 3, visible: true }, views: { zone: 'bottom-left', order: 4, visible: true }, rank: { zone: 'top-center', order: 0, visible: true }, menu: { zone: 'top-right', order: 0, visible: true } },
  poster: { title: { zone: 'below', order: 0, visible: true }, rating: { zone: 'top-left', order: 0, visible: true }, type: { zone: 'below', order: 1, visible: true }, status: { zone: 'below', order: 2, visible: true }, year: { zone: 'below', order: 3, visible: true }, episodes: { zone: 'below', order: 4, visible: true }, chapters: { zone: 'below', order: 4, visible: true }, views: { zone: 'below', order: 5, visible: true }, rank: { zone: 'top-center', order: 0, visible: true }, menu: { zone: 'top-right', order: 0, visible: true } },
} as const;
export const CARD_SLOT_DEFAULTS = CARD_SLOT_DEFAULTS_BY_BASE.overlay;

export { useCustomizationScope } from '@/hooks/ui/useCustomization';

interface CardDesignContextValue { design?: CardDesign | null; readOnly?: boolean }
const DesignContext = createContext<CardDesignContextValue | undefined>(undefined);
export function useCardDesignContext() { return useContext(DesignContext); }
export function CardDesignPreviewProvider({ design, children, readOnly = true }: CardDesignContextValue & { children: ReactNode }) {
  return <DesignContext.Provider value={{ design, readOnly }}>{children}</DesignContext.Provider>;
}
export function useCardDesign() {
  const preview = useContext(DesignContext);
  const { settings } = useCustomization();
  const { themeId, target } = useCustomizationScope();
  const config = getTargetCustomization(settings, themeId, target);
  const saved = config.activeDesign ? config.designs?.[config.activeDesign] : undefined;
  return { design: preview === undefined ? saved : preview.design, readOnly: preview?.readOnly === true };
}
