import { useTheme, Theme } from '@/hooks/useTheme';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Check, Palette, Sparkles, Cpu, MemoryStick, Rocket, Gauge } from 'lucide-react';
import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';

export function ThemeSelector() {
  const { theme, setTheme, themes, themeInfo, isUltraLiteTheme, getDeviceCapabilityInfo, detectLowEndDevice } = useTheme();
  const [ultraLiteMode, setUltraLiteMode] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState({
    deviceMemory: 'Loading...',
    cpuCores: 'Loading...',
    isLowEndDevice: false,
  });

  // Load device info
  useEffect(() => {
    setDeviceInfo(getDeviceCapabilityInfo());
  }, [getDeviceCapabilityInfo]);

  // Load ultra-lite mode preference
  useEffect(() => {
    const savedUltraLiteMode = localStorage.getItem('ultra_lite_mode_enabled') === 'true';
    setUltraLiteMode(savedUltraLiteMode);
  }, []);

  // Handle ultra-lite mode toggle
  const handleUltraLiteToggle = (checked: boolean) => {
    setUltraLiteMode(checked);
    localStorage.setItem('ultra_lite_mode_enabled', checked ? 'true' : 'false');
    
    if (checked) {
      // Switch to lite theme if not already using it
      if (theme !== 'lite-minimal') {
        setTheme('lite-minimal');
        localStorage.setItem('manual_theme_selection', 'true');
      }
    }
  };

  // Categorize themes
  const darkThemes = themes.filter(t => themeInfo[t]?.category === 'dark');
  const lightThemes = themes.filter(t => themeInfo[t]?.category === 'light');

  const renderThemeGrid = (themeList: typeof themes, startIndex: number = 0) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {themeList.map((t, index) => {
        const info = themeInfo[t];
        const isActive = theme === t;
        
        // Check if this is the ultra-lite theme
        const isUltraLite = t === 'lite-minimal';

        return (
          <motion.button
            key={t}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (startIndex + index) * 0.05 }}
            onClick={() => {
              setTheme(t);
              localStorage.setItem('manual_theme_selection', 'true');
            }}
            className={`relative p-3 rounded-2xl border-2 transition-all duration-300 text-left group overflow-hidden ${
              isActive
                ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                : 'border-border/50 hover:border-primary/50 bg-muted/30 hover:bg-muted/50'
            }`}
          >
            {/* Animated background on hover */}
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-br ${info.gradient}`} />

            {/* Theme icon */}
            <div className="text-2xl mb-2 flex items-center gap-1">
              {info.icon}
              {isUltraLite && <Rocket className="w-4 h-4 text-green-500" />}
            </div>

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
                <h3 className="font-medium text-sm flex items-center gap-1">
                  {info.name}
                  {isUltraLite && <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-500">🚀 Ultra Fast</Badge>}
                </h3>
                {isActive && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
                {info.description}
              </p>
              {isUltraLite && (
                <p className="text-[10px] text-green-500 font-medium mt-1">
                  Optimized for low-end devices
                </p>
              )}
            </div>
          </motion.button>
        );
      })}
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

      {/* Device Capability Info */}
      <div className="mb-6 p-4 rounded-xl bg-muted/30 border border-border/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-sm">Device Capability</h3>
          </div>
          {deviceInfo.isLowEndDevice && (
            <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-500 text-xs">
              Low-end device detected
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <MemoryStick className="w-4 h-4 text-muted-foreground" />
            <span>RAM: {deviceInfo.deviceMemory}</span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            <span>CPU: {deviceInfo.cpuCores}</span>
          </div>
        </div>
        {deviceInfo.isLowEndDevice && (
          <p className="text-xs text-yellow-500 mt-2">
            🚀 Ultra Lite theme recommended for better performance
          </p>
        )}
      </div>

      {/* Ultra Lite Mode Toggle */}
      <div className="mb-6 p-4 rounded-xl bg-muted/30 border border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Rocket className="w-5 h-5 text-green-500" />
          <div>
            <h3 className="font-semibold text-sm">Ultra Lite Mode</h3>
            <p className="text-xs text-muted-foreground">
              Reduces animations, effects, and resource usage for low-end devices
            </p>
          </div>
        </div>
        <Switch
          checked={ultraLiteMode}
          onCheckedChange={handleUltraLiteToggle}
          className="data-[state=checked]:bg-green-500"
        />
      </div>

      {/* Performance Impact Legend */}
      <div className="mb-6 p-3 rounded-xl bg-green-500/10 border border-green-500/30">
        <div className="flex items-center gap-2 mb-2">
          <Rocket className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-green-500">Performance Impact</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Badge className="bg-green-500/20 text-green-500 text-xs">🚀 Ultra Fast</Badge>
            <span>Best for low-end devices</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge className="bg-blue-500/20 text-blue-500 text-xs">☀️ Light</Badge>
            <span>Good performance</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge className="bg-yellow-500/20 text-yellow-500 text-xs">🌙 Dark</Badge>
            <span>Standard performance</span>
          </div>
        </div>
      </div>

      {/* Dark Themes */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="text-lg">🌙</span> Dark Themes
        </h3>
        {renderThemeGrid(darkThemes, 0)}
      </div>

      {/* Light Themes */}
      {lightThemes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="text-lg">☀️</span> Light Themes
          </h3>
          {renderThemeGrid(lightThemes, darkThemes.length)}
        </div>
      )}
    </GlassPanel>
  );
}
