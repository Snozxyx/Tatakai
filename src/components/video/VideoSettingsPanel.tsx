import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  Languages,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { useVideoSettings, VideoSettings } from '@/hooks/media/useVideoSettings';
import { isMobileNative } from '@/lib/platform/platform';
import { useKeybinds } from '@/hooks/media/useKeybinds';
import { setTranslationConfig } from '@/lib/translation/config';
import { TRANSLATION_LANGUAGES } from '@/lib/translation/languages';
import { useTranslationConfig } from '@/hooks/translation/useTranslationConfig';
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
  currentSubtitle?: string;
  onSubtitleChange?: (value: string) => void;
  availableSubtitles?: Array<{ lang: string; label: string; value: string }>;
  audioTracks?: Array<{ id: number; label: string; lang: string }>;
  currentAudioTrack?: number;
  onAudioTrackChange?: (id: number) => void;
  internalSubtitles?: Array<{ id: number; label: string; lang: string }>;
  currentInternalSubtitleTrackId?: number | null;
  onInternalSubtitleChange?: (id: number) => void;
  onSubtitleUpload?: () => void;
  initialTab?: TabId;
  portalContainer?: HTMLElement | null;
}

const DEFAULT_SUBTITLE_OPTIONS = [
  { value: 'auto', get label() { return uiI18n.t('app.auto_c614ba7c'); } },
  { value: 'english', get label() { return uiI18n.t('app.english_649df08a'); } },
  { value: 'spanish', get label() { return uiI18n.t('app.spanish_8df7f1b3'); } },
  { value: 'french', get label() { return uiI18n.t('app.french_44389f6a'); } },
  { value: 'german', get label() { return uiI18n.t('app.german_da91388c'); } },
  { value: 'portuguese', get label() { return uiI18n.t('app.portuguese_23882c57'); } },
  { value: 'japanese', get label() { return uiI18n.t('app.japanese_9239c22d'); } },
  { value: 'arabic', get label() { return uiI18n.t('app.arabic_af4f4762'); } },
  { value: 'hindi', get label() { return uiI18n.t('app.hindi_c9e6b253'); } },
  { value: 'korean', get label() { return uiI18n.t('app.korean_dec66c5b'); } },
  { value: 'chinese', get label() { return uiI18n.t('app.chinese_15dc1886'); } },
  { value: 'thai', get label() { return uiI18n.t('app.thai_c32767e0'); } },
  { value: 'indonesian', get label() { return uiI18n.t('app.indonesian_2339b8ad'); } },
  { value: 'vietnamese', get label() { return uiI18n.t('app.vietnamese_1d6b8a69'); } },
  { value: 'italian', get label() { return uiI18n.t('app.italian_485b57ad'); } },
  { value: 'russian', get label() { return uiI18n.t('app.russian_74ad93cb'); } },
  { value: 'turkish', get label() { return uiI18n.t('app.turkish_ab650a1a'); } },
  { value: 'dutch', get label() { return uiI18n.t('app.dutch_334a85f1'); } },
  { value: 'polish', get label() { return uiI18n.t('app.polish_d0119864'); } },
  { value: 'off', get label() { return uiI18n.t('app.off_e3de5ab0'); } },
];

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const QUALITY_OPTIONS: { value: VideoSettings['defaultQuality']; label: string }[] = [
  { value: 'auto', get label() { return uiI18n.t('app.auto_c614ba7c'); } },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
];

const ANIME4K_OPTIONS: { value: VideoSettings['anime4kPreset']; label: string }[] = [
  { value: 'off', get label() { return uiI18n.t('app.off_e3de5ab0'); } },
  { value: 'light', get label() { return uiI18n.t('app.light_a36ef8ab'); } },
  { value: 'standard', get label() { return uiI18n.t('app.standard_2dfa6607'); } },
  { value: 'high', get label() { return uiI18n.t('app.high_b1a5954a'); } },
];

const SLEEP_OPTIONS: { value: VideoSettings['sleepTimer']; label: string }[] = [
  { value: 'off', get label() { return uiI18n.t('app.off_e3de5ab0'); } },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '45', label: '45m' },
  { value: '60', label: '60m' },
  { value: 'end-of-episode', get label() { return uiI18n.t('app.end_of_episode_21e88d42'); } },
];

const SIZE_OPTIONS: { value: VideoSettings['subtitleSize']; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
  { value: 'xlarge', get label() { return uiI18n.t('app.xl_a2f9d0d1'); } },
];

const FONT_OPTIONS: { value: VideoSettings['subtitleFont']; label: string }[] = [
  { value: 'default', get label() { return uiI18n.t('app.default_808d7dca'); } },
  { value: 'serif', get label() { return uiI18n.t('app.serif_a5c78a86'); } },
  { value: 'mono', get label() { return uiI18n.t('app.mono_c5c55338'); } },
  { value: 'comic', get label() { return uiI18n.t('app.comic_5549c522'); } },
  { value: 'custom', get label() { return uiI18n.t('app.custom_081ae3fd'); } },
];

const BG_OPTIONS: { value: VideoSettings['subtitleBackground']; label: string }[] = [
  { value: 'none', get label() { return uiI18n.t('app.none_6eef6648'); } },
  { value: 'semi', get label() { return uiI18n.t('app.semi_3210d8fe'); } },
  { value: 'solid', get label() { return uiI18n.t('app.solid_d0063586'); } },
];

const COLOR_SWATCHES = ['#ffffff', '#ffff00', '#00e5ff', '#7CFC00', '#ff5f5f'];

type TabId = 'playback' | 'video' | 'subtitles' | 'audio' | 'shortcuts';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'playback', get label() { return uiI18n.t('app.playback_c8e30870'); }, icon: PlayCircle },
  { id: 'video', get label() { return uiI18n.t('app.video_bc17c1f0'); }, icon: Video },
  { id: 'subtitles', get label() { return uiI18n.t('app.subtitles_17770471'); }, icon: Subtitles },
  { id: 'audio', get label() { return uiI18n.t('app.audio_acdac205'); }, icon: Music },
  { id: 'shortcuts', get label() { return uiI18n.t('app.keys_e5651c68'); }, icon: Keyboard },
];

/**
 * Reusable label + optional caption + Switch row.
 */
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
  useUiTranslation();
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
 * Live subtitle translation controls — shared by the player sheet and the
 * settings modal, so the feature is reachable on web, desktop, mobile and TV.
 * Both controls write the same app-wide translation config the player's
 * `useSubtitleTranslation` hook reads.
 */
function SubtitleTranslationSection() {
  const translationConfig = useTranslationConfig();
  const enabled = translationConfig.enabled && translationConfig.subtitleTranslate;
  const target = translationConfig.subtitleTargetLanguage || '';
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Languages className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium">{uiI18n.t('translation.subtitlesTitle')}</h3>
      </div>
      <ToggleRow
        label={uiI18n.t('translation.subtitlesToggle')}
        caption={uiI18n.t('translation.subtitlesToggleDescription')}
        checked={translationConfig.subtitleTranslate}
        onCheckedChange={(checked) => setTranslationConfig({ subtitleTranslate: checked })}
      />
      <ToggleRow
        label={uiI18n.t('translation.pretranslate')}
        caption={uiI18n.t('translation.pretranslateDescription')}
        checked={translationConfig.subtitlePretranslate}
        onCheckedChange={(checked) => setTranslationConfig({ subtitlePretranslate: checked })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground w-28 shrink-0">
          {uiI18n.t('translation.subtitlesLanguage')}
        </span>
        <Select
          value={target || 'auto'}
          onValueChange={(value) =>
            setTranslationConfig({ subtitleTargetLanguage: value === 'auto' ? '' : value })
          }
        >
          <SelectTrigger className="h-9 min-w-40 flex-1 rounded-lg text-sm" aria-label={uiI18n.t('translation.subtitlesLanguage')}>
            <SelectValue placeholder={uiI18n.t('translation.auto')} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="auto">{uiI18n.t('translation.followTarget')}</SelectItem>
            {TRANSLATION_LANGUAGES.map((language) => (
              <SelectItem key={language.code} value={language.code}>
                {language.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        {enabled
          ? uiI18n.t('translation.subtitlesActiveHint')
          : uiI18n.t('translation.masterOffHint')}
      </p>
    </section>
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
  currentSubtitle,
  onSubtitleChange,
  audioTracks = [],
  currentAudioTrack,
  onAudioTrackChange,
  internalSubtitles = [],
  currentInternalSubtitleTrackId = null,
  onInternalSubtitleChange,
  onSubtitleUpload,
  initialTab = 'playback',
}: {
  showHeader: boolean;
  availableSubtitles?: VideoSettingsPanelProps['availableSubtitles'];
  currentSubtitle?: string;
  onSubtitleChange?: (value: string) => void;
  audioTracks?: NonNullable<VideoSettingsPanelProps['audioTracks']>;
  currentAudioTrack?: number;
  onAudioTrackChange?: (id: number) => void;
  internalSubtitles?: NonNullable<VideoSettingsPanelProps['internalSubtitles']>;
  currentInternalSubtitleTrackId?: number | null;
  onInternalSubtitleChange?: (id: number) => void;
  onSubtitleUpload?: () => void;
  initialTab?: TabId;
}) {
  useUiTranslation();
  const { settings, updateSetting, resetSettings } = useVideoSettings();
  const { keybinds, setBinding, reset: resetKeybinds } = useKeybinds();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  useEffect(() => setActiveTab(initialTab), [initialTab]);
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
    `min-h-11 max-w-full break-words px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
      active ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-foreground hover:bg-muted/50'
    }`;

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">{uiI18n.t('app.player_settings_763c3a64')}</h2>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex min-w-0 gap-1 p-1 bg-muted/30 rounded-xl">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={`min-h-11 min-w-0 flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium transition-all ${activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
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
            <section className="space-y-3">
              <label htmlFor="player-engine" className="block text-sm font-medium">Video player</label>
              <select id="player-engine" value={settings.playerEngine} onChange={event => updateSetting('playerEngine', event.target.value as VideoSettings['playerEngine'])}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                <option value="builtin">Tatakai (default)</option>
                <option value="jwplayer">JW Player (optional)</option>
              </select>
              {settings.playerEngine === 'jwplayer' && <>
                <label htmlFor="jw-library" className="block text-sm font-medium">JW Player library ID</label>
                <input id="jw-library" value={settings.jwPlayerLibraryId} onChange={event => updateSetting('jwPlayerLibraryId', event.target.value.trim())}
                  placeholder="8-character library ID" maxLength={8} autoComplete="off" spellCheck={false}
                  aria-describedby="jw-library-help" aria-invalid={!!settings.jwPlayerLibraryId && !/^[a-zA-Z0-9]{8}$/.test(settings.jwPlayerLibraryId)}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" />
                <p id="jw-library-help" className="text-sm text-muted-foreground">Use the cloud-hosted library ID from your licensed JW Player account. JW Player uses its own controls; Tatakai enhancements, torrents, streams with custom headers, and watch rooms use the built-in player.</p>
              </>}
            </section>
            {/* Volume Slider */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.volume_3b18e8e3')}</h3>
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
              <div className="flex flex-wrap items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.speed_2d2cb022')}</h3>
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
              <div className="flex flex-wrap items-center gap-2">
                <PlayCircle className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.behavior_70cb647a')}</h3>
              </div>
              <div className="space-y-2">
                <ToggleRow
                  label={uiI18n.t('app.autoplay_95619b53')}
                  checked={settings.autoplay}
                  onCheckedChange={(checked) => updateSetting('autoplay', checked)}
                />
                <ToggleRow
                  label={uiI18n.t('app.auto_next_episode_560e5abf')}
                  checked={settings.autoNextEpisode}
                  onCheckedChange={(checked) => updateSetting('autoNextEpisode', checked)}
                />
                {settings.autoNextEpisode && (
                  <div className="flex items-center gap-2 pl-1 pt-0.5">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">{uiI18n.t('app.up_next_countdown_28c9ad18')}</span>
                    <div className="flex min-w-0 items-center gap-3 flex-1">
                      <Slider
                        value={[settings.autoNextCountdownSeconds]}
                        onValueChange={([v]) => updateSetting('autoNextCountdownSeconds', v)}
                        min={3}
                        max={30}
                        step={1}
                        className="min-w-0 flex-1"
                        aria-label={uiI18n.t('app.up_next_countdown_seconds_694fe73c')}
                      />
                      <span className="text-xs text-muted-foreground w-9 text-right tabular-nums">
                        {settings.autoNextCountdownSeconds}s
                      </span>
                    </div>
                  </div>
                )}
                <ToggleRow
                  label={uiI18n.t('app.auto_skip_intro_3a2b0c81')}
                  checked={settings.autoSkipIntro}
                  onCheckedChange={(checked) => updateSetting('autoSkipIntro', checked)}
                />
                <ToggleRow
                  label={uiI18n.t('app.loop_video_ec14b3e2')}
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
              <div className="flex flex-wrap items-center gap-2">
                <MonitorPlay className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.default_quality_87d95e09')}</h3>
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
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.anime4k_upscaling_103f8463')}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {ANIME4K_OPTIONS
                  // On the mobile app the player clamps upscaling to the cheapest
                  // ("light") mode, so only offer Off/Light there — Standard/High
                  // would silently behave like Light.
                  .filter((option) =>
                    isMobileNative() ? option.value === 'off' || option.value === 'light' : true,
                  )
                  .map((option) => (
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
                {isMobileNative()
                  ? uiI18n.t('app.gpu_upscaling_for_anime_on_mobile_this_uses_the__1d3249a0')
                  : uiI18n.t('app.gpu_upscaling_for_anime_higher_presets_need_a_st_c99015ce')}
              </p>
            </section>

            {/* Playback modes */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Video className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.display_574ff9b0')}</h3>
              </div>
              <div className="space-y-2">
                <ToggleRow
                  label={uiI18n.t('app.theater_mode_437ff2cb')}
                  caption={uiI18n.t('app.wider_cinematic_layout_f56f9e6a')}
                  checked={settings.theaterMode}
                  onCheckedChange={(checked) => updateSetting('theaterMode', checked)}
                />
                <ToggleRow
                  label={uiI18n.t('app.ambient_mode_59f453b0')}
                  caption={uiI18n.t('app.glow_that_matches_the_video_7ec2b496')}
                  checked={settings.ambientMode}
                  onCheckedChange={(checked) => updateSetting('ambientMode', checked)}
                />
                <ToggleRow
                  label={uiI18n.t('app.stable_volume_baca6ef4')}
                  caption={uiI18n.t('app.even_out_loud_and_quiet_parts_61a82d21')}
                  checked={settings.stableVolume}
                  onCheckedChange={(checked) => updateSetting('stableVolume', checked)}
                />
              </div>
            </section>

            {/* Sleep Timer */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Timer className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.sleep_timer_ef29989e')}</h3>
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
              <div className="flex flex-wrap items-center gap-2">
                <Type className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.preview_f1fbb2b4')}</h3>
              </div>
              <div
                className="relative flex items-end justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-black px-4 min-h-[140px] transition-[padding] duration-200"
                style={{ paddingTop: 16, paddingBottom: 16 + settings.subtitlePosition * 2.6 }}
              >
                <span style={previewCueStyle}>{uiI18n.t('app.the_quick_brown_fox_jumps_743e2756')}</span>
              </div>
            </section>

            {/* Subtitle Language */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Subtitles className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.language_89b86ab0')}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const seen = new Set<string>();
                  const options = DEFAULT_SUBTITLE_OPTIONS.filter(
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

            {/* Subtitle translation — live cue translation via the app-wide engine */}
            <SubtitleTranslationSection />

            {onSubtitleUpload && <button type="button" onClick={onSubtitleUpload} className={`${pill(false)} w-full text-left`}>{uiI18n.t('app.add_subtitle_file_srt_ass_ssa_vtt_fd0ff143')}</button>}
            {onSubtitleChange && <button type="button" onClick={() => onSubtitleChange('off')} className={`${pill(currentSubtitle === 'off')} w-full text-left`}>{uiI18n.t('app.subtitles_off_c6906246')}</button>}
            {(availableSubtitles || []).length > 0 && <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-medium"><Subtitles className="h-4 w-4 text-primary" />{uiI18n.t('app.custom_amp_source_subtitles_17e949df')}{availableSubtitles!.length})</h3>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {availableSubtitles!.map((option, index) => <button key={option.value} type="button"
                  onClick={() => onSubtitleChange?.(option.value)}
                  className={`${pill((currentSubtitle || settings.subtitleLanguage) === option.value)} w-full text-left`}>
                  {option.label}{availableSubtitles!.filter(track => track.label === option.label).length > 1 ? uiI18n.t('app.i18n_value_0_92e4cd32', { value0: index + 1 }) : ''}
                </button>)}
              </div>
            </section>}

            {/* Internal Subtitles (MKV) */}
            {internalSubtitles.length > 0 && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Subtitles className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium">{uiI18n.t('app.internal_tracks_4a715c9b')}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {internalSubtitles.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => onInternalSubtitleChange?.(track.id)}
                      className={pill(currentInternalSubtitleTrackId === track.id)}
                    >
                      {uiI18n.t('app.load_ddcb77ff')} {track.label} ({track.lang})
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Subtitle Styling */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Type className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.style_99a0efc6')}</h3>
              </div>
              <div className="space-y-2">
                {/* Size */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{uiI18n.t('app.size_b7152342')}</span>
                  <div className="flex min-w-0 flex-wrap gap-1 flex-1">
                    {SIZE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateSetting('subtitleSize', option.value)}
                        className={`min-h-11 flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${settings.subtitleSize === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/30 text-foreground hover:bg-muted/50'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Font */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{uiI18n.t('app.font_b97c4d4c')}</span>
                  <div className="flex min-w-0 flex-wrap gap-1 flex-1">
                    {FONT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateSetting('subtitleFont', option.value)}
                        className={`min-h-11 flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${settings.subtitleFont === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/30 text-foreground hover:bg-muted/50'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Custom font upload — only relevant when Font = Custom */}
                {settings.subtitleFont === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{uiI18n.t('app.file_2c3cafa4')}</span>
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
                        {customFontName ? uiI18n.t('app.replace_a7cf7b25') : uiI18n.t('app.upload_font_8fa9d65d')}
                      </button>
                      {customFontName ? (
                        <>
                          <span className="text-xs text-muted-foreground truncate" title={customFontName}>
                            {customFontName}
                          </span>
                          <button
                            onClick={handleClearFont}
                            aria-label={uiI18n.t('app.remove_custom_font_72c9dae0')}
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground shrink-0"
                          >
                            {uiI18n.t('app.remove_e963907d')}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 truncate">{uiI18n.t('app.ttf_otf_woff_92f14c7e')}</span>
                      )}
                    </div>
                  </div>
                )}
                {settings.subtitleFont === 'custom' && fontError && (
                  <p className="text-xs text-destructive">{fontError}</p>
                )}

                {/* Background */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{uiI18n.t('app.bg_9f5da1d1')}</span>
                  <div className="flex min-w-0 flex-wrap gap-1 flex-1">
                    {BG_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateSetting('subtitleBackground', option.value)}
                        className={`min-h-11 flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${settings.subtitleBackground === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/30 text-foreground hover:bg-muted/50'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Color */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{uiI18n.t('app.color_1d0c8304')}</span>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 flex-1">
                    <input
                      type="color"
                      aria-label={uiI18n.t('app.subtitle_text_color_a79351bc')}
                      value={settings.subtitleColor}
                      onChange={(e) => updateSetting('subtitleColor', e.target.value)}
                      className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {COLOR_SWATCHES.map((color) => (
                        <button
                          key={color}
                          aria-label={uiI18n.t('app.set_subtitle_color_i18n_value_0_0e441340', { value0: color })}
                          onClick={() => updateSetting('subtitleColor', color)}
                          style={{ backgroundColor: color }}
                          className={`h-11 w-11 rounded-full border transition-transform hover:scale-110 ${settings.subtitleColor.toLowerCase() === color.toLowerCase()
                              ? 'border-primary ring-2 ring-primary/50'
                              : 'border-white/20'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Background Opacity */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{uiI18n.t('app.bg_opacity_54bfc748')}</span>
                  <div className="flex min-w-0 items-center gap-3 flex-1">
                    <Slider
                      value={[Math.round(settings.subtitleOpacity * 100)]}
                      onValueChange={([v]) => updateSetting('subtitleOpacity', v / 100)}
                      max={100}
                      step={5}
                      className="min-w-0 flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-9 text-right">
                      {Math.round(settings.subtitleOpacity * 100)}%
                    </span>
                  </div>
                </div>

                {/* Position */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{uiI18n.t('app.position_cf1c85ad')}</span>
                  <div className="flex min-w-0 items-center gap-3 flex-1">
                    <Slider
                      value={[settings.subtitlePosition]}
                      onValueChange={([v]) => updateSetting('subtitlePosition', v)}
                      max={40}
                      step={1}
                      className="min-w-0 flex-1"
                      aria-label={uiI18n.t('app.vertical_position_f2a31e6a')}
                    />
                    <span className="text-xs text-muted-foreground w-9 text-right">
                      {settings.subtitlePosition}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {uiI18n.t('app.vertical_position_higher_moves_subtitles_further_2ffa2f50')}
                </p>

                {/* Sync Offset */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground w-16 shrink-0">{uiI18n.t('app.sync_905f6309')}</span>
                  <div className="flex min-w-0 items-center gap-2 flex-1">
                    <button
                      type="button"
                      aria-label={uiI18n.t('app.shift_subtitles_earlier_03042f34')}
                      onClick={() =>
                        updateSetting(
                          'subtitleOffset',
                          Math.round(Math.max(-30, settings.subtitleOffset - 0.1) * 10) / 10,
                        )
                      }
                      className="h-11 w-11 shrink-0 rounded-lg bg-muted/30 text-sm font-semibold text-foreground hover:bg-muted/50"
                    >
                      −
                    </button>
                    <Slider
                      value={[settings.subtitleOffset]}
                      onValueChange={([v]) => updateSetting('subtitleOffset', Math.round(v * 10) / 10)}
                      min={-30}
                      max={30}
                      step={0.1}
                      className="min-w-0 flex-1"
                      aria-label={uiI18n.t('app.subtitle_sync_offset_in_seconds_0504e7ac')}
                    />
                    <button
                      type="button"
                      aria-label={uiI18n.t('app.shift_subtitles_later_d058a290')}
                      onClick={() =>
                        updateSetting(
                          'subtitleOffset',
                          Math.round(Math.min(30, settings.subtitleOffset + 0.1) * 10) / 10,
                        )
                      }
                      className="h-11 w-11 shrink-0 rounded-lg bg-muted/30 text-sm font-semibold text-foreground hover:bg-muted/50"
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
                  {uiI18n.t('app.positive_delays_subtitles_negative_shows_them_ea_3e2a971d')}
                </p>

                {/* Outline */}
                <ToggleRow
                  label={uiI18n.t('app.outline_cdd6290b')}
                  caption={uiI18n.t('app.add_an_outline_behind_subtitle_text_ac032246')}
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
            <section className="flex flex-col gap-2">
              <label htmlFor="preferred-audio-language" className="text-sm font-medium">Preferred audio language</label>
              <Select value={settings.audioLanguage} onValueChange={value => updateSetting('audioLanguage', value)}>
                <SelectTrigger id="preferred-audio-language"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{[['auto', 'Automatic'], ['ja', 'Japanese'], ['en', 'English'], ['hi', 'Hindi'], ['fr', 'French'], ['es', 'Spanish'], ['de', 'German'], ['pt', 'Portuguese'], ['ar', 'Arabic'], ['ko', 'Korean'], ['zh', 'Chinese']].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Applied when a stream provides matching audio tracks. Subtitle language is set in the Subtitles tab.</p>
            </section>
            {audioTracks.length >= 1 && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium">{uiI18n.t('app.audio_tracks_b273b321')}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {audioTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => onAudioTrackChange?.(track.id)}
                      className={pill(currentAudioTrack === track.id)}
                    >
                      {track.label || uiI18n.t('app.track_i18n_value_0_098f1b62', { value0: track.id })} ({track.lang || uiI18n.t('app.und_b03a4348')})
                    </button>
                  ))}
                </div>
              </section>
            )}

            {audioTracks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Music className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{uiI18n.t('app.no_audio_tracks_detected_61309f82')}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {uiI18n.t('app.audio_tracks_are_detected_automatically_for_mkv__8aaf0590')}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Shortcuts Tab ────────────────────────────── */}
        {activeTab === 'shortcuts' && (
          <>
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Keyboard className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{uiI18n.t('app.keyboard_shortcuts_b465751c')}</h3>
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
                        className={`min-w-[96px] px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isListening
                            ? 'bg-primary text-primary-foreground animate-pulse'
                            : 'bg-muted/40 text-foreground hover:bg-muted/60'}`}
                      >
                        {isListening ? uiI18n.t('app.press_a_key_9026d7b5') : formatKeyToken(keybinds[action])}
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
                {uiI18n.t('app.reset_shortcuts_a8c9e9e7')}
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
        {uiI18n.t('app.reset_44c57abd')}
      </button>
    </div>
  );
}

export function VideoSettingsPanel({
  isOpen,
  onClose,
  embedded = false,
  availableSubtitles,
  currentSubtitle,
  onSubtitleChange,
  audioTracks = [],
  currentAudioTrack,
  onAudioTrackChange,
  internalSubtitles = [],
  currentInternalSubtitleTrackId = null,
  onInternalSubtitleChange,
  onSubtitleUpload,
  initialTab = 'playback',
  portalContainer,
}: VideoSettingsPanelProps) {
  useUiTranslation();
  const isMobile = useIsMobile();
  const bodyProps = {
    availableSubtitles,
    currentSubtitle,
    onSubtitleChange,
    audioTracks,
    currentAudioTrack,
    onAudioTrackChange,
    internalSubtitles,
    currentInternalSubtitleTrackId,
    onInternalSubtitleChange,
    onSubtitleUpload,
    initialTab,
  };

  // Settings-page mode: render inline, no sheet, no header.
  if (embedded) {
    return <SettingsPanelBody showHeader={false} {...bodyProps} />;
  }

  // Player mode: right-side sheet on desktop, bottom sheet on mobile.
  // Same full tabbed body (playback / video / subtitles / audio / keys) on
  // both — mobile just gets a thumb-friendly bottom sheet with safe-area pad.
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        data-player-interactive="true"
        side={isMobile ? 'bottom' : 'right'}
        portalContainer={portalContainer}
        className="flex max-w-full flex-col gap-0 overflow-hidden border-white/10 bg-background/95 p-0 backdrop-blur-xl md:w-[400px] md:max-w-[400px] max-md:max-h-[85dvh] max-md:rounded-t-2xl"
      >
        <SheetTitle className="shrink-0 px-4 py-4 pr-14 text-lg font-semibold">{uiI18n.t('app.player_settings_c1823e10')}</SheetTitle>
        <SheetDescription className="sr-only">{uiI18n.t('app.adjust_playback_video_subtitles_and_audio_99dd0126')}</SheetDescription>
        {/* drag handle — mobile only */}
        <div className="shrink-0 pt-2.5 md:hidden" aria-hidden>
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] custom-scrollbar sm:p-6">
          <SettingsPanelBody showHeader={false} {...bodyProps} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
