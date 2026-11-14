import { useSyncExternalStore, type ComponentProps } from 'react';
import { getAdultMode, subscribeAdultMode } from '@/lib/adultMode';
import { adultBrandLogo } from '@/lib/adultBranding';
import { useTheme } from '@/hooks/ui/useTheme';
import { useCustomization, useActiveThemeId } from '@/hooks/ui/useCustomization';
import { getThemeCustomization, type LogoChoice, type CustomThemeDefinitions } from '@/lib/customization';
import { brandLogoSource, resolveLogoVariant } from '@/lib/branding';

export interface BrandLogoProps extends Omit<ComponentProps<'img'>, 'src'> { theme?: string; choice?: LogoChoice; customThemes?: CustomThemeDefinitions }
export function BrandLogo({ theme: override, choice, customThemes, alt = 'Tatakai', ...props }: BrandLogoProps) {
  const { theme } = useTheme();
  const active = useActiveThemeId();
  const { settings } = useCustomization();
  const selected = override ?? active ?? theme;
  const mode = useSyncExternalStore(subscribeAdultMode, getAdultMode, () => 'sfw' as const);
  const variant = resolveLogoVariant(choice ?? getThemeCustomization(settings, selected).logo, selected, customThemes);
  return <img {...props} alt={alt} src={mode === 'adult' ? adultBrandLogo(resolveLogoVariant('auto', selected, customThemes) === 'light') : brandLogoSource(variant)} data-brand-logo={variant} data-brand-mode={mode} />;
}
