import { ThemeSelector } from '@/components/settings/ThemeSelector';
import { MobileAppearanceSelector } from '@/components/settings/MobileAppearanceSelector';
import { MediaCardStyleSelector } from '@/components/settings/MediaCardStyleSelector';

/** Appearance: theme picker. Thin wrapper around the existing selector. */
export function AppearancePanel() {
  return <><MediaCardStyleSelector /><MobileAppearanceSelector /><ThemeSelector /></>;
}
