import { Settings, X, RotateCcw, Volume2, Subtitles, Gauge, PlayCircle, Type } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useVideoSettings, VideoSettings } from '@/hooks/useVideoSettings';

interface VideoSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  availableSubtitles?: Array<{ lang: string; label: string; value: string }>;
}

const DEFAULT_SUBTITLE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'english', label: 'English' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'french', label: 'French' },
  { value: 'german', label: 'German' },
  { value: 'portuguese', label: 'Portuguese' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'arabic', label: 'Arabic' },
  { value: 'hindi', label: 'Hindi' },
  { value: 'off', label: 'Off' },
];

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const SIZE_OPTIONS: { value: VideoSettings['subtitleSize']; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
  { value: 'xlarge', label: 'XL' },
];

const FONT_OPTIONS: { value: VideoSettings['subtitleFont']; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
];

const BG_OPTIONS: { value: VideoSettings['subtitleBackground']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'semi', label: 'Semi' },
  { value: 'solid', label: 'Solid' },
];

export function VideoSettingsPanel({ isOpen, onClose, embedded = false, availableSubtitles }: VideoSettingsPanelProps) {
  const { settings, updateSetting, resetSettings } = useVideoSettings();

  if (!isOpen && !embedded) return null;

  const containerClass = embedded
    ? "space-y-6"
    : "absolute inset-0 z-50 bg-black/95 backdrop-blur-md overflow-y-auto";

  const innerClass = embedded ? "" : "max-w-lg mx-auto p-4 md:p-6";

  return (
    <div className={containerClass}>
      <div className={innerClass}>
        {/* Header - only show in overlay mode */}
        {!embedded && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Player Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="space-y-5">
          {/* Volume Slider */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium">Volume</h3>
              <span className="ml-auto text-sm text-muted-foreground">{Math.round(settings.volume * 100)}%</span>
            </div>
            <Slider
              value={[settings.volume * 100]}
              onValueChange={([v]) => updateSetting('volume', v / 100)}
              max={100}
              step={5}
              className="w-full"
            />
          </section>

          {/* Subtitle Language */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Subtitles className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium">Subtitles</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Combine defaults with actually available tracks */}
              {(() => {
                const seen = new Set();
                const options = [
                  ...DEFAULT_SUBTITLE_OPTIONS,
                  ...(availableSubtitles || [])
                ].filter(opt => {
                  if (seen.has(opt.value)) return false;
                  seen.add(opt.value);
                  return true;
                });

                return options.map(option => (
                  <button
                    key={option.value}
                    onClick={() => updateSetting('subtitleLanguage', option.value as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${settings.subtitleLanguage === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/30 text-foreground hover:bg-muted/50'
                      }`}
                  >
                    {option.label}
                  </button>
                ));
              })()}
            </div>
          </section>

          {/* Subtitle Styling */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium">Subtitle Style</h3>
            </div>
            <div className="space-y-2">
              {/* Size */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">Size</span>
                <div className="flex gap-1 flex-1">
                  {SIZE_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      onClick={() => updateSetting('subtitleSize', option.value)}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${settings.subtitleSize === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-foreground hover:bg-muted/50'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Font */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">Font</span>
                <div className="flex gap-1 flex-1">
                  {FONT_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      onClick={() => updateSetting('subtitleFont', option.value)}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${settings.subtitleFont === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-foreground hover:bg-muted/50'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Background */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">BG</span>
                <div className="flex gap-1 flex-1">
                  {BG_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      onClick={() => updateSetting('subtitleBackground', option.value)}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${settings.subtitleBackground === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-foreground hover:bg-muted/50'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Playback Speed */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium">Speed</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {SPEED_OPTIONS.map(speed => (
                <button
                  key={speed}
                  onClick={() => updateSetting('playbackSpeed', speed)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${settings.playbackSpeed === speed
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/30 text-foreground hover:bg-muted/50'
                    }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </section>

          {/* Toggle Options */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium">Playback</h3>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20">
                <span className="text-sm">Autoplay</span>
                <Switch
                  checked={settings.autoplay}
                  onCheckedChange={(checked) => updateSetting('autoplay', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20">
                <span className="text-sm">Auto Next Episode</span>
                <Switch
                  checked={settings.autoNextEpisode}
                  onCheckedChange={(checked) => updateSetting('autoNextEpisode', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20">
                <span className="text-sm">Auto Skip Intro</span>
                <Switch
                  checked={settings.autoSkipIntro}
                  onCheckedChange={(checked) => updateSetting('autoSkipIntro', checked)}
                />
              </div>
            </div>
          </section>

          {/* Reset Button */}
          <button
            onClick={resetSettings}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
