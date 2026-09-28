import { useEffect, useRef, useState } from 'react';
import {
  Settings,
  RotateCcw,
  Volume2,
  Subtitles,
  Gauge,
  PlayCircle,
  Type,
  Music,
  Video,
  Keyboard,
  Palette,
  Sparkles,
  Moon,
  Timer,
  Repeat,
  MonitorPlay,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useVideoSettings, VideoSettings } from '@/hooks/media/useVideoSettings';
import { useKeybinds } from '@/hooks/media/useKeybinds';
import {
  KEYBIND_ACTIONS,
  formatKeyToken,
  normalizeKeyToken,
  type KeybindAction,
} from '@/lib/video/keybindings';
import { buildSubtitleCueStyle } from '@/lib/video/subtitleStyle';
import {
  CUSTOM_SUBTITLE_FONT_UPDATED_EVENT,
  clearCustomSubtitleFont,
  ensureCustomSubtitleFontLoaded,
  getCustomSubtitleFontName,
  setCustomSubtitleFont,
} from '@/lib/video/customSubtitleFont';

interface VideoSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  availableSubtitles?: Array<{ lang: string; label: string; value: string }>;
  audioTracks?: Array<{ id: number; label: string; lang: string }>;
  currentAudioTrack?: number;
  onAudioTrackChange?: (id: number) => void;
  internalSubtitles?: Array<{ id: number; label: string; lang: string }>;
  currentInternalSubtitleTrackId?: number | null;
  onInternalSubtitleChange?: (id: number) => void;
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
  { value: 'korean', label: 'Korean' },
  { value: 'chinese', label: 'Chinese' },
  { value: 'thai', label: 'Thai' },
  { value: 'indonesian', label: 'Indonesian' },
  { value: 'vietnamese', label: 'Vietnamese' },
  { value: 'italian', label: 'Italian' },
  { value: 'russian', label: 'Russian' },
  { value: 'turkish', label: 'Turkish' },
  { value: 'dutch', label: 'Dutch' },
  { value: 'polish', label: 'Polish' },
  { value: 'off', label: 'Off' },
];

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const QUALITY_OPTIONS: { value: VideoSettings['defaultQuality']; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
];

const ANIME4K_OPTIONS: { value: VideoSettings['anime4kPreset']; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'light', label: 'Light' },
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'High' },
];

const SLEEP_OPTIONS: { value: VideoSettings['sleepTimer']; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '45', label: '45m' },
  { value: '60', label: '60m' },
  { value: 'end-of-episode', label: 'End of episode' },
];

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
  { value: 'comic', label: 'Comic' },
  { value: 'custom', label: 'Custom' },
];

const BG_OPTIONS: { value: VideoSettings['subtitleBackground']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'semi', label: 'Semi' },
  { value: 'solid', label: 'Solid' },
];

const COLOR_SWATCHES = ['#ffffff', '#ffff00', '#00e5ff', '#7CFC00', '#ff5f5f'];

type TabId = 'playback' | 'video' | 'subtitles' | 'audio' | 'shortcuts';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'playback', label: 'Playback', icon: PlayCircle },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'subtitles', label: 'Subtitles', icon: Subtitles },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'shortcuts', label: 'Keys', icon: Keyboard },
];

/** Reusable label + optional caption + Switch row. */
function ToggleRow({
  label,
  caption,
  checked,
  onCheckedChange,
}: {
  label: string;
  caption?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/20">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {caption ? <p className="text-xs text-muted-foreground mt-0.5">{caption}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/**
 * The full tabbed settings body. Shared by both the right-side sheet (player
 * mode) and the inline settings-page (embedded) mode — only the surrounding
 * chrome differs.
 */
function SettingsPanelBody({
  showHeader,
  availableSubtitles,
  audioTracks = [],
  currentAudioTrack,
  onAudioTrackChange,
  internalSubtitles = [],
  currentInternalSubtitleTrackId = null,
  onInternalSubtitleChange,
}: {
  showHeader: boolean;
  availableSubtitles?: VideoSettingsPanelProps['availableSubtitles'];
  audioTracks?: NonNullable<VideoSettingsPanelProps['audioTracks']>;
  currentAudioTrack?: number;
  onAudioTrackChange?: (id: number) => void;
  internalSubtitles?: NonNullable<VideoSettingsPanelProps['internalSubtitles']>;
  currentInternalSubtitleTrackId?: number | null;
  onInternalSubtitleChange?: (id: number) => void;
}) {
  const { settings, updateSetting, resetSettings } = useVideoSettings();
  const { keybinds, setBinding, reset: resetKeybinds } = useKeybinds();
  const [activeTab, setActiveTab] = useState<TabId>('playback');
  const [listeningAction, setListeningAction] = useState<KeybindAction | null>(null);
  const [customFontName, setCustomFontName] = useState<string | null>(() => getCustomSubtitleFontName());
  const [fontError, setFontError] = useState<string | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  // Register the stored custom font so the preview reflects it, and keep the
  // displayed name in sync if it changes elsewhere.
  useEffect(() => {
    void ensureCustomSubtitleFontLoaded();
    const sync = () => setCustomFontName(getCustomSubtitleFontName());
    window.addEventListener(CUSTOM_SUBTITLE_FONT_UPDATED_EVENT, sync);
    return () => window.removeEventListener(CUSTOM_SUBTITLE_FONT_UPDATED_EVENT, sync);
  }, []);

  const handleFontUpload = async (file: File | undefined) => {
    if (!file) return;
    setFontError(null);
    try {
      const name = await setCustomSubtitleFont(file);
      setCustomFontName(name);
      updateSetting('subtitleFont', 'custom');
    } catch (err) {
      setFontError(err instanceof Error ? err.message : 'Could not load that font.');
    }
  };

  const handleClearFont = () => {
    clearCustomSubtitleFont();
    setCustomFontName(null);
    setFontError(null);
    if (settings.subtitleFont === 'custom') updateSetting('subtitleFont', 'default');
  };

  const previewCueStyle = buildSubtitleCueStyle(settings);

  // Capture the next keypress while a shortcut row is "listening".
  useEffect(() => {
    if (!listeningAction) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setListeningAction(null);
        return;
      }

      const token = normalizeKeyToken(e);
      if (!token) return; // modifier-only press — keep listening

      setBinding(listeningAction, token);
      setListeningAction(null);
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [listeningAction, setBinding]);

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
      active ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-foreground hover:bg-muted/50'
    }`;

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Player Settings</h2>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-xl">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="space-y-5">
        {/* ── Playback Tab ────────────────────────────── */}
        {activeTab === 'playback' && (
          <>
            {/* Volume Slider */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Volume</h3>
                <span className="ml-auto text-sm text-muted-foreground">
                  {Math.round(settings.volume * 100)}%
                </span>
              </div>
              <Slider
                value={[settings.volume * 100]}
                onValueChange={([v]) => updateSetting('volume', v / 100)}
                max={100}
                step={5}
                className="w-full"
              />
            </section>

            {/* Playback Speed */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Speed</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => updateSetting('playbackSpeed', speed)}
                    className={pill(settings.playbackSpeed === speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </section>

            {/* Behavior toggles */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <PlayCircle className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Behavior</h3>
              </div>
              <div className="space-y-2">
                <ToggleRow
                  label="Autoplay"
                  checked={settings.autoplay}
                  onCheckedChange={(checked) => updateSetting('autoplay', checked)}
                />
                <ToggleRow
                  label="Auto Next Episode"
                  checked={settings.autoNextEpisode}
                  onCheckedChange={(checked) => updateSetting('autoNextEpisode', checked)}
                />
                {settings.autoNextEpisode && (
                  <div className="flex items-center gap-2 pl-1 pt-0.5">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">Up-next countdown</span>
                    <div className="flex items-center gap-3 flex-1">
                      <Slider
                        value={[settings.autoNextCountdownSeconds]}
                        onValueChange={([v]) => updateSetting('autoNextCountdownSeconds', v)}
                        min={3}
                        max={30}
                        step={1}
                        className="flex-1"
                        aria-label="Up-next countdown seconds"
                      />
                      <span className="text-xs text-muted-foreground w-9 text-right tabular-nums">
                        {settings.autoNextCountdownSeconds}s
                      </span>
                    </div>
                  </div>
                )}
                <ToggleRow
                  label="Auto Skip Intro"
                  checked={settings.autoSkipIntro}
                  onCheckedChange={(checked) => updateSetting('autoSkipIntro', checked)}
                />
                <ToggleRow
                  label="Loop Video"
                  checked={settings.loopVideo}
                  onCheckedChange={(checked) => updateSetting('loopVideo', checked)}
                />
              </div>
            </section>
          </>
        )}

        {/* ── Video Tab ────────────────────────────── */}
        {activeTab === 'video' && (
          <>
            {/* Default Quality */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <MonitorPlay className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Default Quality</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUALITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updateSetting('defaultQuality', option.value)}
                    className={pill(settings.defaultQuality === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Anime4K Upscaling */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Anime4K Upscaling</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {ANIME4K_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updateSetting('anime4kPreset', option.value)}
                    className={pill(settings.anime4kPreset === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                GPU upscaling for anime. Higher presets need a stronger GPU.
              </p>
            </section>

            {/* Playback modes */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Display</h3>
              </div>
              <div className="space-y-2">
                <ToggleRow
                  label="Theater Mode"
                  caption="Wider cinematic layout"
                  checked={settings.theaterMode}
                  onCheckedChange={(checked) => updateSetting('theaterMode', checked)}
                />
                <ToggleRow
                  label="Ambient Mode"
                  caption="Glow that matches the video"
                  checked={settings.ambientMode}
                  onCheckedChange={(checked) => updateSetting('ambientMode', checked)}
                />
                <ToggleRow
                  label="Stable Volume"
                  caption="Even out loud and quiet parts"
                  checked={settings.stableVolume}
                  onCheckedChange={(checked) => updateSetting('stableVolume', checked)}
                />
              </div>
            </section>

            {/* Sleep Timer */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Sleep Timer</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {SLEEP_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updateSetting('sleepTimer', option.value)}
                    className={pill(settings.sleepTimer === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ── Subtitles Tab ────────────────────────────── */}
        {activeTab === 'subtitles' && (
          <>
            {/* Live Preview — mirrors exactly how cues render during playback */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Preview</h3>
              </div>
              <div
                className="relative flex items-end justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-black px-4 min-h-[140px] transition-[padding] duration-200"
                style={{ paddingTop: 16, paddingBottom: 16 + settings.subtitlePosition * 2.6 }}
              >
                <span style={previewCueStyle}>The quick brown fox jumps</span>
              </div>
            </section>

            {/* Subtitle Language */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Subtitles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Language</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const seen = new Set<string>();
                  const options = [...DEFAULT_SUBTITLE_OPTIONS, ...(availableSubtitles || [])].filter(
                    (opt) => {
                      if (seen.has(opt.value)) return false;
                      seen.add(opt.value);
                      return true;
                    },
                  );

                  return options.map((option) => (
                    <button
                      key={option.value}
                      onClick={() =>
                        updateSetting(
                          'subtitleLanguage',
                          option.value as VideoSettings['subtitleLanguage'],
                        )
                      }
                      className={pill(settings.subtitleLanguage === option.value)}
                    >
                      {option.label}
                    </button>
                  ));
                })()}
              </div>
            </section>

            {/* Internal Subtitles (MKV) */}
            {internalSubtitles.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Subtitles className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium">Internal Tracks</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {internalSubtitles.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => onInternalSubtitleChange?.(track.id)}
                      className={pill(currentInternalSubtitleTrackId === track.id)}
                    >
                      Load {track.label} ({track.lang})
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Subtitle Styling */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Style</h3>
              </div>
              <div className="space-y-2">
                {/* Size */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Size</span>
                  <div className="flex gap-1 flex-1">
                    {SIZE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateSetting('subtitleSize', option.value)}
                        className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                          settings.subtitleSize === option.value
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
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Font</span>
                  <div className="flex gap-1 flex-1">
                    {FONT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateSetting('subtitleFont', option.value)}
                        className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                          settings.subtitleFont === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/30 text-foreground hover:bg-muted/50'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Custom font upload — only relevant when Font = Custom */}
                {settings.subtitleFont === 'custom' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">File</span>
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <input
                        ref={fontInputRef}
                        type="file"
                        accept=".ttf,.otf,.woff,.woff2,font/*"
                        className="hidden"
                        onChange={(e) => {
                          void handleFontUpload(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                      <button
                        onClick={() => fontInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
                      >
                        {customFontName ? 'Replace' : 'Upload font'}
                      </button>
                      {customFontName ? (
                        <>
                          <span className="text-xs text-muted-foreground truncate" title={customFontName}>
                            {customFontName}
                          </span>
                          <button
                            onClick={handleClearFont}
                            aria-label="Remove custom font"
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground shrink-0"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 truncate">.ttf / .otf / .woff</span>
                      )}
                    </div>
                  </div>
                )}
                {settings.subtitleFont === 'custom' && fontError && (
                  <p className="text-xs text-destructive">{fontError}</p>
                )}

                {/* Background */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">BG</span>
                  <div className="flex gap-1 flex-1">
                    {BG_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateSetting('subtitleBackground', option.value)}
                        className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                          settings.subtitleBackground === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/30 text-foreground hover:bg-muted/50'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Color */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Color</span>
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="color"
                      aria-label="Subtitle text color"
                      value={settings.subtitleColor}
                      onChange={(e) => updateSetting('subtitleColor', e.target.value)}
                      className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5"
                    />
                    <div className="flex gap-1.5">
                      {COLOR_SWATCHES.map((color) => (
                        <button
                          key={color}
                          aria-label={`Set subtitle color ${color}`}
                          onClick={() => updateSetting('subtitleColor', color)}
                          style={{ backgroundColor: color }}
                          className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                            settings.subtitleColor.toLowerCase() === color.toLowerCase()
                              ? 'border-primary ring-2 ring-primary/50'
                              : 'border-white/20'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Background Opacity */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">BG Opacity</span>
                  <div className="flex items-center gap-3 flex-1">
                    <Slider
                      value={[Math.round(settings.subtitleOpacity * 100)]}
                      onValueChange={([v]) => updateSetting('subtitleOpacity', v / 100)}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-9 text-right">
                      {Math.round(settings.subtitleOpacity * 100)}%
                    </span>
                  </div>
                </div>

                {/* Position */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Position</span>
                  <div className="flex items-center gap-3 flex-1">
                    <Slider
                      value={[settings.subtitlePosition]}
                      onValueChange={([v]) => updateSetting('subtitlePosition', v)}
                      max={40}
                      step={1}
                      className="flex-1"
                      aria-label="Vertical position"
                    />
                    <span className="text-xs text-muted-foreground w-9 text-right">
                      {settings.subtitlePosition}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Vertical position — higher moves subtitles further from the bottom.
                </p>

                {/* Sync Offset */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">Sync</span>
                  <div className="flex items-center gap-2 flex-1">
                    <button
                      type="button"
                      aria-label="Shift subtitles earlier"
                      onClick={() =>
                        updateSetting(
                          'subtitleOffset',
                          Math.round(Math.max(-30, settings.subtitleOffset - 0.1) * 10) / 10,
                        )
                      }
                      className="h-7 w-7 shrink-0 rounded-lg bg-muted/30 text-sm font-semibold text-foreground hover:bg-muted/50"
                    >
                      −
                    </button>
                    <Slider
                      value={[settings.subtitleOffset]}
                      onValueChange={([v]) => updateSetting('subtitleOffset', Math.round(v * 10) / 10)}
                      min={-30}
                      max={30}
                      step={0.1}
                      className="flex-1"
                      aria-label="Subtitle sync offset in seconds"
                    />
                    <button
                      type="button"
                      aria-label="Shift subtitles later"
                      onClick={() =>
                        updateSetting(
                          'subtitleOffset',
                          Math.round(Math.min(30, settings.subtitleOffset + 0.1) * 10) / 10,
                        )
                      }
                      className="h-7 w-7 shrink-0 rounded-lg bg-muted/30 text-sm font-semibold text-foreground hover:bg-muted/50"
                    >
                      +
                    </button>
                    <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
                      {settings.subtitleOffset > 0 ? '+' : ''}
                      {settings.subtitleOffset.toFixed(1)}s
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Positive delays subtitles; negative shows them earlier. Tap ± for 0.1s steps.
                </p>

                {/* Outline */}
                <ToggleRow
                  label="Outline"
                  caption="Add an outline behind subtitle text"
                  checked={settings.subtitleOutline}
                  onCheckedChange={(checked) => updateSetting('subtitleOutline', checked)}
                />
              </div>
            </section>
          </>
        )}

        {/* ── Audio Tab ────────────────────────────── */}
        {activeTab === 'audio' && (
          <>
            {audioTracks.length >= 1 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium">Audio Tracks</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {audioTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => onAudioTrackChange?.(track.id)}
                      className={pill(currentAudioTrack === track.id)}
                    >
                      {track.label || `Track ${track.id}`} ({track.lang || 'und'})
                    </button>
                  ))}
                </div>
              </section>
            )}

            {audioTracks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Music className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No audio tracks detected</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Audio tracks are detected automatically for MKV files
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Shortcuts Tab ────────────────────────────── */}
        {activeTab === 'shortcuts' && (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">Keyboard Shortcuts</h3>
              </div>
              <div className="space-y-2">
                {KEYBIND_ACTIONS.map(({ action, label, hint }) => {
                  const isListening = listeningAction === action;
                  return (
                    <div
                      key={action}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/20"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
                      </div>
                      <button
                        onClick={() => setListeningAction(isListening ? null : action)}
                        className={`min-w-[96px] px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isListening
                            ? 'bg-primary text-primary-foreground animate-pulse'
                            : 'bg-muted/40 text-foreground hover:bg-muted/60'
                        }`}
                      >
                        {isListening ? 'Press a key…' : formatKeyToken(keybinds[action])}
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={resetKeybinds}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                <Repeat className="w-4 h-4" />
                Reset shortcuts
              </button>
            </section>
          </>
        )}
      </div>

      {/* Footer — Reset all settings */}
      <button
        onClick={resetSettings}
        className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors text-sm"
      >
        <RotateCcw className="w-4 h-4" />
        Reset
      </button>
    </div>
  );
}

export function VideoSettingsPanel({
  isOpen,
  onClose,
  embedded = false,
  availableSubtitles,
  audioTracks = [],
  currentAudioTrack,
  onAudioTrackChange,
  internalSubtitles = [],
  currentInternalSubtitleTrackId = null,
  onInternalSubtitleChange,
}: VideoSettingsPanelProps) {
  const bodyProps = {
    availableSubtitles,
    audioTracks,
    currentAudioTrack,
    onAudioTrackChange,
    internalSubtitles,
    currentInternalSubtitleTrackId,
    onInternalSubtitleChange,
  };

  // Settings-page mode: render inline, no sheet, no header.
  if (embedded) {
    return <SettingsPanelBody showHeader={false} {...bodyProps} />;
  }

  // Player mode: slide in from the right as a side sheet.
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-[400px] sm:max-w-[400px] overflow-y-auto bg-background/95 backdrop-blur-xl border-white/10"
      >
        <SettingsPanelBody showHeader {...bodyProps} />
      </SheetContent>
    </Sheet>
  );
}
