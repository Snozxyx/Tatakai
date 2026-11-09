import { type ComponentProps } from 'react';
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
  const variant = resolveLogoVariant(choice ?? getThemeCustomization(settings, selected).logo, selected, customThemes);
  return <img {...props} alt={alt} src={brandLogoSource(variant)} data-brand-logo={variant} />;
}
