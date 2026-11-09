/** User appearance overrides. Built-in theme and card definitions remain immutable. */
export type LayoutTarget = 'desktop' | 'mobile' | 'tv';
export type LogoChoice = 'auto' | 'light' | 'dark' | 'monochrome' | 'legacy';
export interface ThemeSelection {
  mode: 'manual' | 'system';
  theme: string;
  lightTheme?: string;
  darkTheme?: string;
}
export interface AppearanceAssetRef {
  id: string;
  bucket?: string;
  path?: string;
  namespace?: string;
}
export interface BackgroundConfig {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  gradient?: string;
  asset?: AppearanceAssetRef;
  fit?: 'cover' | 'contain' | 'tile';
  position?: string;
  tint?: string;
  tintOpacity?: number;
  blur?: number;
}
export type CardSlotId = 'title' | 'rating' | 'type' | 'status' | 'year' | 'episodes' | 'chapters' | 'views' | 'rank' | 'menu';
export type CardSlotZone = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'below';
export interface CardSlotConfig { zone: CardSlotZone; order: number; visible: boolean }
export interface CardDesign {
  id: string;
  name: string;
  base: 'poster' | 'overlay';
  slots?: Partial<Record<CardSlotId, CardSlotConfig>>;
  style?: {
    width?: number;
    radius?: number;
    gap?: number;
    titleSize?: number;
    titleWeight?: number;
    aspectRatio?: 'poster' | 'square' | 'landscape';
    titleLines?: 1 | 2 | 3;
    gradient?: number;
    borderWidth?: number;
    borderColor?: string;
    metadataSize?: number;
    padding?: number;
    textColor?: string;
    background?: BackgroundConfig | null;
    shadow?: 'none' | 'soft' | 'strong';
  };
}
export type SpotlightPartId = 'title' | 'details' | 'description' | 'actions';
export type SpotlightPlacement = 'original' | 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export interface SpotlightPresentation {
  variant?: 'default' | 'classic' | 'cinematic';
  height?: number;
  titleAlign?: 'left' | 'center' | 'right';
  shade?: number;
  /** Blur applied to spotlight artwork, independently of native window blur. */
  backgroundBlur?: number;
  showDescription?: boolean;
  showMetadata?: boolean;
  titleSize?: number;
  placements?: Partial<Record<SpotlightPartId, SpotlightPlacement>>;
}
export interface SectionCustomization {
  visible?: boolean;
  layout?: 'default' | 'grid' | 'shelf';
  density?: 'comfortable' | 'compact' | 'spacious';
  background?: BackgroundConfig | null;
  designId?: string | null;
  order?: string[];
  spotlight?: SpotlightPresentation | null;
}
export type ShelfSource =
  | { kind: 'anime' | 'manga' | 'novel'; filters: Record<string, unknown> }
  | { kind: 'provider-search'; namespace: string; sourceId: string; query: string; filters?: Record<string, unknown> }
  | { kind: 'provider-catalog'; namespace: string; sourceId: string; catalogId?: string; sectionId?: string; sectionTitle?: string };
export interface CustomShelf {
  id: string;
  title: string;
  source: ShelfSource;
}
export interface PageCustomization {
  order?: string[];
  sections?: Record<string, SectionCustomization | null>;
  customSections?: Record<string, CustomShelf | null>;
}
export interface TargetCustomization {
  /** One spotlight presentation shared by every content home for this theme/device. */
  spotlight?: SpotlightPresentation | null;
  designs?: Record<string, CardDesign | null>;
  activeDesign?: string | null;
  pages?: Record<string, PageCustomization | null>;
}
export interface ThemeCustomization {
  palette?: Record<string, string> | null;
  logo?: LogoChoice;
  background?: BackgroundConfig | null;
  targets?: Partial<Record<LayoutTarget, TargetCustomization | null>>;
}
export interface CustomizationSettings {
  version: 1;
  themes: Record<string, ThemeCustomization | null>;
  tvSelection?: ThemeSelection | null;
  customThemes?: CustomThemeDefinitions;
}
export interface CustomThemeDefinition { name: string; baseTheme: string }
export type CustomThemeDefinitions = Record<string, CustomThemeDefinition | null>;
export type CustomizationPatch = Partial<CustomizationSettings>;
export const EMPTY_CUSTOMIZATION: CustomizationSettings = Object.freeze({ version: 1, themes: Object.freeze({}) });
const reservedKeys = new Set(['__proto__', 'prototype', 'constructor']);
export function isCustomizationObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Null is a persistent reset tombstone; arrays replace rather than concatenate. */
export function mergeCustomizationValue(base: unknown, patch: unknown): unknown {
  if (!isCustomizationObject(patch)) return patch;
  const next: Record<string, unknown> = {};
  if (isCustomizationObject(base)) for (const key of Object.keys(base)) {
    if (!reservedKeys.has(key)) next[key] = base[key];
  }
  for (const key of Object.keys(patch)) {
    if (!reservedKeys.has(key) && patch[key] !== undefined) next[key] = mergeCustomizationValue(next[key], patch[key]);
  }
  return next;
}
export function readCustomization(value: unknown): CustomizationSettings {
  if (!isCustomizationObject(value) || value.version !== 1 || !isCustomizationObject(value.themes)) return EMPTY_CUSTOMIZATION;
  return mergeCustomizationValue(EMPTY_CUSTOMIZATION, value) as CustomizationSettings;
}
export function mergeCustomization(base: CustomizationSettings, patch: CustomizationPatch): CustomizationSettings {
  return readCustomization(mergeCustomizationValue(base, { ...patch, version: 1 }));
}
export function getThemeCustomization(settings: CustomizationSettings, theme: string): ThemeCustomization {
  const entry = settings.themes[theme];
  return isCustomizationObject(entry) ? entry as ThemeCustomization : {};
}
export function getTargetCustomization(settings: CustomizationSettings, theme: string, target: LayoutTarget): TargetCustomization {
  const entry = getThemeCustomization(settings, theme).targets?.[target];
  return isCustomizationObject(entry) ? entry as TargetCustomization : {};
}
