import { resolveColors, useTheme, type ThemeId } from '@/hooks/ui/useTheme';
import { SettingsSection } from '@/components/settings/SettingsPrimitives';
import { Check, Palette, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * The swatch for a theme, built from the values `applyTheme` actually writes to
 * the document.
 *
 * These used to be the Tailwind class string in `THEME_INFO[t].gradient`, which
 * had two problems. `tailwind.config.ts` sets `colors.orange` to a single theme
 * colour, which replaces the whole default scale — so the `to-orange-500` stop
 * in solar and the `from-orange-500` stop in caffeine emitted no CSS and those
 * two previews faded out into nothing. And a hand-written gradient is free to
 * disagree with the theme it is previewing; reading the resolved palette (built-in
 * OR extension-contributed) means it can't.
 */
function swatchGradient(t: ThemeId): string {
  const c = resolveColors(t);
  return `linear-gradient(135deg, hsl(${c.primary}) 0%, hsl(${c.secondary}) 55%, hsl(${c.accent}) 100%)`;
}

export function ThemeSelector() {
  const { theme, setTheme, themes, themeInfo } = useTheme();

  const darkThemes = themes.filter(t => themeInfo[t]?.category === 'dark');
  const lightThemes = themes.filter(t => themeInfo[t]?.category === 'light');

  const renderThemeGrid = (themeList: typeof themes, startIndex: number = 0) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {themeList.map((t, index) => {
        const info = themeInfo[t];
        const isActive = theme === t;
        const gradient = swatchGradient(t);

        return (
          <motion.button
            key={t}
            type="button"
            aria-pressed={isActive}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (startIndex + index) * 0.05 }}
            onClick={() => setTheme(t)}
            className={`relative p-3 rounded-2xl border-2 transition-all duration-300 text-left group overflow-hidden ${
              isActive
                ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                : 'border-border/50 hover:border-primary/50 bg-muted/30 hover:bg-muted/50'
            }`}
          >
            {/* Animated background on hover */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500"
              style={{ background: gradient }}
            />

            {/* Theme icon */}
            <div className="text-2xl mb-2">{info.icon}</div>

            {/* Color Preview */}
            <div
              className="w-full h-12 rounded-xl mb-3 border border-white/10 shadow-lg group-hover:shadow-xl transition-shadow relative overflow-hidden"
              style={{ background: gradient }}
            >
              {isActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Sparkles className="w-5 h-5 text-white animate-pulse" />
                </div>
              )}
            </div>

            {/* Theme Info */}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-medium text-sm">{info.name}</h3>
                {isActive && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
                {info.description}
              </p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );

  return (
    <SettingsSection
      icon={Palette}
      title="Appearance"
      description={`Choose your visual theme — ${themes.length} available`}
    >
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="text-lg">🌙</span> Dark Themes
        </h3>
        {renderThemeGrid(darkThemes, 0)}
      </div>

      {lightThemes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="text-lg">☀️</span> Light Themes
          </h3>
          {renderThemeGrid(lightThemes, darkThemes.length)}
        </div>
      )}
    </SettingsSection>
  );
}
