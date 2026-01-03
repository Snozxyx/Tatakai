import { useTheme, Theme, THEME_INFO } from '@/hooks/useTheme';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Check, Palette, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export function ThemeSelector() {
  const { theme, setTheme, themes, themeInfo } = useTheme();

  // Separate themes by category
  const darkThemes = themes.filter(t => themeInfo[t].category === 'dark');
  const lightThemes = themes.filter(t => themeInfo[t].category === 'light');

  const renderThemes = (themeList: typeof themes, categoryLabel: string) => (
    <div className="mb-8 last:mb-0">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        {categoryLabel}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {themeList.map((t, index) => {
          const info = themeInfo[t];
          const isActive = theme === t;
          
          return (
            <motion.button
              key={t}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setTheme(t)}
              className={`relative p-3 rounded-2xl border-2 transition-all duration-300 text-left group overflow-hidden ${
                isActive 
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30' 
                  : 'border-border/50 hover:border-primary/50 bg-muted/30 hover:bg-muted/50'
              }`}
            >
              {/* Animated background on hover */}
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-br ${info.gradient}`} />
              
              {/* Theme icon */}
              <div className="text-2xl mb-2">{info.icon}</div>
              
              {/* Color Preview */}
              <div 
                className={`w-full h-12 rounded-xl mb-3 bg-gradient-to-r ${info.gradient} shadow-lg group-hover:shadow-xl transition-shadow relative overflow-hidden`}
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
    </div>
  );

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-primary/20">
          <Palette className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Appearance</h2>
          <p className="text-sm text-muted-foreground">Choose your visual theme</p>
        </div>
      </div>
      
      {renderThemes(darkThemes, 'Dark Themes')}
      {renderThemes(lightThemes, 'Light Themes')}
    </GlassPanel>
  );
}
