import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useRef, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RotateCcw, Plus, X, Volume2, Upload, Square, Play } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsPrimitives';
import { useNovelReaderSettings, NOVEL_FONT_PRESETS, resolveFontStack, type NovelNarratorEngine } from '@/hooks/media/useNovelReaderSettings';
import { NovelNarrator, narratorEngineLabel } from '@/lib/novel/narrator';
import { TtsIntegrationSettings } from '@/components/novel/TtsIntegrationSettings';
import { loadTtsIntegrations } from '@/lib/novel/ttsIntegrations';
import { useAuth } from '@/contexts/AuthContext';
import { ExperimentalKittenSettings } from '@/components/novel/ExperimentalKittenSettings';

/**
 * NovelReaderPanel — typography-first settings for the novel reader.
 * House-style panel sharing `useNovelReaderSettings` with NovelReaderPage so a
 * change here takes effect in the reader immediately.
 *
 * Covers: font presets (Default/Sans/Georgia/Lora/Dyslexic) + typed custom
 * fonts + real font-file upload, text size, line spacing, paragraph spacing,
 * text width, background/text colour, text-to-speech (narrator voice + rate
 * with a live voice preview), continuous scroll, progress bar (percent +
 * chapter number), fullscreen — plus a live preview pane that renders every
 * change instantly.
 */

const PREVIEW_VOICE_SAMPLE = [
  'Chapter 1: The Inkbound Door',
  '"Wait!" she called, breathless... The corridor bent — then fell silent.',
  'Beyond the door, a thousand unread stories waited in the dark, patient as winter.',
];

const PREVIEW_BODY = PREVIEW_VOICE_SAMPLE.slice(1);

function LivePreview() {
  useUiTranslation();
  const { settings, customFonts } = useNovelReaderSettings();
  const stack = resolveFontStack(settings.font, customFonts);
  return (
    <div
      className="overflow-hidden rounded-xl border border-border"
      style={{ background: settings.background }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-3">
        <span className="text-sm font-medium text-foreground">
          {uiI18n.t('app.reading_preview_6b61477b')}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {settings.textSize}{uiI18n.t('app.px_98bb7667')} {settings.lineSpacing.toFixed(2)} · {settings.textWidth}{uiI18n.t('app.px_07a65dd6')}
        </span>
      </div>
      <div className="mx-auto px-5 py-5" style={{ maxWidth: Math.min(settings.textWidth, 560) }}>
        <p
          className="font-black tracking-tight"
          style={{ fontFamily: stack, fontSize: settings.textSize + 4, color: settings.textColour }}
        >
          {PREVIEW_VOICE_SAMPLE[0]}
        </p>
        {PREVIEW_BODY.map((text, i) => (
          <p
            key={i}
            style={{
              fontFamily: stack,
              fontSize: settings.textSize,
              lineHeight: settings.lineSpacing,
              color: settings.textColour,
              marginBottom: `${settings.paragraphSpacing}em`,
              marginTop: i === 0 ? '0.6em' : 0,
            }}
          >
            {text}
          </p>
        ))}
        {settings.showProgressBar && (
          <div className="mt-2 h-1 w-full rounded bg-white/10">
            <div className="h-full w-[38%] rounded bg-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

function VoicePreview() {
  useUiTranslation();
  const { settings } = useNovelReaderSettings();
  const { user } = useAuth();
  const narratorRef = useRef<NovelNarrator | null>(null);
  const [playing, setPlaying] = useState(false);
  const [working, setWorking] = useState(false);
  const [spokenBy, setSpokenBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(false);
  useEffect(() => () => narratorRef.current?.stop(), []);

  const stop = () => {
    narratorRef.current?.stop();
    narratorRef.current = null;
    setPlaying(false);
    setWorking(false);
  };

  const preview = () => {
    if (playing || working) {
      stop();
      return;
    }
    setError(null);
    setSpokenBy('');
    setWorking(true);
    const narrator = new NovelNarrator({
      onBuffering: setBuffering,
      onStatus: (s) => {
        setPlaying(s === 'playing' || s === 'paused');
        if (s === 'playing') {
          setWorking(false);
          // The engine is chosen async — read back what actually spoke.
          window.setTimeout(() => {
            const label = narratorEngineLabel(narrator.getBackend());
            if (label) setSpokenBy(label);
          }, 600);
        }
        if (s === 'ended' || s === 'error') {
          narratorRef.current = null;
          setPlaying(false);
          setWorking(false);
        }
      },
      onError: (message) => {
        if (message) {
          setError(message);
          setWorking(false);
        }
      },
    });
    narratorRef.current = narrator;
    void narrator.speak(PREVIEW_VOICE_SAMPLE, {
      voice: settings.narratorVoice,
      kittenVoice: settings.kittenVoice,
      kittenBufferUnits: settings.kittenBufferUnits,
      localModel: settings.kittenLocalModel,
      engine: settings.narratorEngine,
      integration: loadTtsIntegrations(user?.id),
      rate: settings.narratorRate,
    });
  };

  const busy = playing || working;

  return (
    <div className="rounded-xl bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{uiI18n.t('app.hear_this_voice_487ffc3b')}</p>
          <p className="text-[11px] text-muted-foreground">
            {uiI18n.t('app.engine_0642f228')} <span className="font-bold text-foreground">{narratorEngineLabel(settings.narratorEngine)}</span>
            {spokenBy ? <span> · <span className="font-bold text-primary">{spokenBy}</span></span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={preview}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110"
        >
          {busy ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {busy ? uiI18n.t('app.stop_preview_598779ee') : uiI18n.t('app.preview_voice_560a6fec')}
        </button>
      </div>
      <p className="mt-1.5 text-xs italic text-muted-foreground line-clamp-2">
        “{PREVIEW_VOICE_SAMPLE[1]}”
      </p>
      {working && !playing && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {uiI18n.t('app.preparing_voice_4fdefa89')}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}
      {buffering && <p role="status" className="mt-2 text-xs text-muted-foreground">{uiI18n.t('app.generating_the_next_passage_f6d25c35')}</p>}
    </div>
  );
}

function SystemVoicePicker() {
  useUiTranslation();
  const { settings, updateSetting } = useNovelReaderSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => setVoices(synth.getVoices()); refresh();
    synth.addEventListener('voiceschanged', refresh);
    return () => synth.removeEventListener('voiceschanged', refresh);
  }, []);
  return <SettingRow title={uiI18n.t('app.system_voice_6fee05d3')} description={voices.length ? uiI18n.t('app.voices_installed_on_this_device_5fc5b4d8') : uiI18n.t('app.your_device_loads_its_voice_list_automatically_cc6480ff')} control={({ labelId }) => <Select value={settings.narratorVoice === 'kitten-default' ? 'system-default' : settings.narratorVoice} onValueChange={v => updateSetting('narratorVoice', v)}><SelectTrigger aria-labelledby={labelId} className="h-10 w-56 max-w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system-default">{uiI18n.t('app.default_system_voice_2d521c55')}</SelectItem><SelectItem value="system-female">{uiI18n.t('app.prefer_feminine_voice_21d7c733')}</SelectItem><SelectItem value="system-male">{uiI18n.t('app.prefer_masculine_voice_686ed7c2')}</SelectItem>{voices.map((voice, i) => <SelectItem key={voice.voiceURI + i} value={voice.voiceURI}>{voice.name} · {voice.lang}</SelectItem>)}</SelectContent></Select>} />;
}

export function NovelReaderPanel() {
  useUiTranslation();
  const {
    settings, updateSetting, resetSettings, customFonts, addCustomFont, addCustomFontFile, removeCustomFont,
  } = useNovelReaderSettings();
  const [customName, setCustomName] = useState('');
  const [customFamily, setCustomFamily] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fontValue = settings.font;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) {
      setUploadError('Use a .ttf, .otf, .woff or .woff2 font file.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setUploadError('Font files must be under 12 MB.');
      return;
    }
    setUploading(true);
    const name = await addCustomFontFile(file);
    setUploading(false);
    if (!name) setUploadError('Could not load that font file.');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <LivePreview />

      <Tabs defaultValue="appearance" className="space-y-6">
        <TabsList className="grid h-11 w-full grid-cols-3"><TabsTrigger value="appearance">{uiI18n.t('app.appearance_41def7a0')}</TabsTrigger><TabsTrigger value="narration">{uiI18n.t('app.narration_8ca62683')}</TabsTrigger><TabsTrigger value="flow">{uiI18n.t('app.reading_flow_e281c1ac')}</TabsTrigger></TabsList>
      <TabsContent value="appearance" className="space-y-6">
      <SettingsSection title={uiI18n.t('app.typography_f4beb9af')} description={uiI18n.t('app.choose_a_comfortable_typeface_and_spacing_change_e4d657e5')}>
        <div className="flex flex-col">
          <SettingRow
            title={uiI18n.t('app.font_b97c4d4c')}
            description={uiI18n.t('app.aa_default_sans_georgia_lora_dyslexic_or_a_custo_6af56ade')}
            control={
              <Select value={fontValue} onValueChange={(v) => updateSetting('font', v)}>
                <SelectTrigger className="h-9 w-44 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOVEL_FONT_PRESETS.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      <span style={{ fontFamily: f.stack }}>{uiI18n.t('app.aa_2c419ecc')}</span> {f.label}
                    </SelectItem>
                  ))}
                  {customFonts.map((f) => (
                    <SelectItem key={`custom:${f.name}`} value={`custom:${f.name}`}>
                      <span style={{ fontFamily: `"${f.family}"` }}>{uiI18n.t('app.aa_2c419ecc')}</span> {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">{uiI18n.t('app.custom_fonts_4d33ea02')}</summary>
          <div className="mt-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> {uiI18n.t('app.upload_a_font_file_ab1e2694')}
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              {uiI18n.t('app.ttf_otf_woff_or_woff2_max_12_mb_it_registers_ins_b77deebb')}
            </p>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="h-9 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {uploading ? uiI18n.t('app.loading_33ce4174') : uiI18n.t('app.choose_font_file_d9fc1bdc')}
              </button>
              {customFonts.length > 0 && (
                <span className="self-center text-xs text-muted-foreground">
                  {customFonts.length} {uiI18n.t('app.custom_f9ac14b6')}
                </span>
              )}
            </div>
            {uploadError && <p className="mt-2 text-xs text-destructive">{uploadError}</p>}
            {customFonts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {customFonts.map((f) => (
                  <span key={f.name} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
                    <span style={{ fontFamily: `"${f.family}"` }}>{uiI18n.t('app.aa_2c419ecc')}</span> {f.name}
                    <button onClick={() => removeCustomFont(f.name)} aria-label={uiI18n.t('app.remove_i18n_value_0_89e2cb36', { value0: f.name })}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="mt-5">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> {uiI18n.t('app.add_installed_font_by_name_e79c121f')}
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              {uiI18n.t('app.use_any_font_installed_on_this_device_e_g_merriw_1f60cf90')}
            </p>
            <div className="flex flex-col gap-2">
              <input
                value={customName}
                aria-label={uiI18n.t('app.custom_font_display_name_67fc0b22')}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={uiI18n.t('app.display_name_e_g_merriweather_611c9b70')}
                className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              />
              <div className="flex gap-2">
                <input
                  value={customFamily}
                  aria-label={uiI18n.t('app.installed_font_family_54e1f7e3')}
                  onChange={(e) => setCustomFamily(e.target.value)}
                  placeholder={uiI18n.t('app.font_family_defaults_to_name_c6381f31')}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                />
                <button
                  onClick={() => {
                    if (!customName.trim()) return;
                    addCustomFont(customName, customFamily || customName);
                    setCustomName('');
                    setCustomFamily('');
                  }}
                  className="h-9 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
                >
                  {uiI18n.t('app.add_61cc55aa')}
                </button>
              </div>
            </div>
          </div>
          </details>
          <SettingRow
            title={uiI18n.t('app.text_size_3cc6e124')}
            description={uiI18n.t('app.19px_default_15px_compact_26px_large_82bc2ce2')}
            control={
              <div className="flex max-w-full flex-wrap items-center gap-2">
                {[15, 19, 26].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateSetting('textSize', s)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${settings.textSize === s ? 'bg-primary text-primary-foreground' : 'bg-muted/40 hover:bg-muted/60'}`}
                  >
                    {s}
                  </button>
                ))}
                <Slider aria-label={uiI18n.t('app.text_size_3cc6e124')} className="w-28" min={12} max={32} step={1} value={[settings.textSize]} onValueChange={([v]) => updateSetting('textSize', v)} />
                <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{settings.textSize}{uiI18n.t('app.px_07a65dd6')}</span>
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.line_spacing_18f550e3')}
            description={uiI18n.t('app.1_65_relaxed_1_30_tight_2_20_airy_26ee4193')}
            control={
              <div className="flex max-w-full flex-wrap items-center gap-2">
                {[1.3, 1.65, 2.2].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateSetting('lineSpacing', s)}
                    className={`rounded-lg px-2 py-1 text-xs font-bold ${Math.abs(settings.lineSpacing - s) < 0.01 ? 'bg-primary text-primary-foreground' : 'bg-muted/40 hover:bg-muted/60'}`}
                  >
                    {s.toFixed(2)}
                  </button>
                ))}
                <Slider aria-label={uiI18n.t('app.reading_layout_adjustment_72a86bcc')} className="w-24" min={1} max={2.6} step={0.05} value={[settings.lineSpacing]} onValueChange={([v]) => updateSetting('lineSpacing', Math.round(v * 100) / 100)} />
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.paragraph_spacing_edc5a492')}
            description={uiI18n.t('app.0_90_default_0_00_seamless_3_00_wide_b443a1fe')}
            control={
              <div className="flex max-w-full flex-wrap items-center gap-2">
                {[0, 0.9, 3].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateSetting('paragraphSpacing', s)}
                    className={`rounded-lg px-2 py-1 text-xs font-bold ${Math.abs(settings.paragraphSpacing - s) < 0.01 ? 'bg-primary text-primary-foreground' : 'bg-muted/40 hover:bg-muted/60'}`}
                  >
                    {s.toFixed(s === 0 || s === 3 ? 1 : 2)}
                  </button>
                ))}
                <Slider aria-label={uiI18n.t('app.reading_layout_adjustment_72a86bcc')} className="w-24" min={0} max={4} step={0.1} value={[settings.paragraphSpacing]} onValueChange={([v]) => updateSetting('paragraphSpacing', Math.round(v * 10) / 10)} />
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.text_width_c22e1e4e')}
            description={uiI18n.t('app.627px_book_456px_narrow_874px_wide_4370c1e3')}
            control={
              <div className="flex max-w-full flex-wrap items-center gap-2">
                {[456, 627, 874].map((s) => (
                  <button
                    key={s}
                    onClick={() => updateSetting('textWidth', s)}
                    className={`rounded-lg px-2 py-1 text-xs font-bold ${settings.textWidth === s ? 'bg-primary text-primary-foreground' : 'bg-muted/40 hover:bg-muted/60'}`}
                  >
                    {s}
                  </button>
                ))}
                <Slider aria-label={uiI18n.t('app.reading_layout_adjustment_72a86bcc')} className="w-24" min={320} max={1100} step={1} value={[settings.textWidth]} onValueChange={([v]) => updateSetting('textWidth', v)} />
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.background_64dd60fe')}
            description={uiI18n.t('app.reader_page_background_3b63dd97')}
            control={
              <div className="flex max-w-full flex-wrap items-center gap-2">
                {['#0a0a0f', '#f5f1e8', '#1a1611', '#0f1a14'].map((c) => (
                  <button
                    key={c}
                    onClick={() => updateSetting('background', c)}
                    aria-label={uiI18n.t('app.background_i18n_value_0_eceb56b7', { value0: c })}
                    className={`h-7 w-7 rounded-full border-2 ${settings.background === c ? 'border-primary' : 'border-white/20'}`}
                    style={{ background: c }}
                  />
                ))}
                <input type="color" aria-label={uiI18n.t('app.custom_background_a4109e17')} value={settings.background}
                  onChange={(e) => updateSetting('background', e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.text_colour_d160595f')}
            description={uiI18n.t('app.chapter_body_colour_b0915603')}
            control={
              <div className="flex max-w-full flex-wrap items-center gap-2">
                <span className="text-xs uppercase tabular-nums text-muted-foreground">{settings.textColour}</span>
                <input type="color" aria-label={uiI18n.t('app.text_colour_d160595f')} value={settings.textColour}
                  onChange={(e) => updateSetting('textColour', e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
              </div>
            }
          />
        </div>
      </SettingsSection>

      </TabsContent>
      <TabsContent value="narration" className="space-y-6">
      <SettingsSection title={uiI18n.t('app.narration_8ca62683')} description={uiI18n.t('app.choose_a_device_voice_kittentts_openai_elevenlab_5bfdc726')}>
        <div className="flex flex-col">
          <SettingRow title={uiI18n.t('app.narrator_7de19cb6')} description={uiI18n.t('app.system_voice_is_the_default_876cc45e')} control={({ labelId }) => <Select value={settings.narratorEngine} onValueChange={value => updateSetting('narratorEngine', value as NovelNarratorEngine)}><SelectTrigger aria-labelledby={labelId} className="h-10 w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system">{uiI18n.t('app.system_voice_default_6225c8cf')}</SelectItem><SelectItem value="kitten-local">{uiI18n.t('app.kittentts_experimental_6593f0a7')}</SelectItem><SelectItem value="openai">{uiI18n.t('app.openai_a19ee5a9')}</SelectItem><SelectItem value="elevenlabs">{uiI18n.t('app.elevenlabs_fc64b48c')}</SelectItem><SelectItem value="local-server">{uiI18n.t('app.local_model_server_141b0724')}</SelectItem></SelectContent></Select>} />
          {settings.narratorEngine === 'kitten-local' && <ExperimentalKittenSettings />}
          {(settings.narratorEngine === 'openai' || settings.narratorEngine === 'elevenlabs' || settings.narratorEngine === 'local-server') && <TtsIntegrationSettings engine={settings.narratorEngine} />}
          <SettingRow title={uiI18n.t('app.text_to_speech_d0f1029e')} description={uiI18n.t('app.read_the_chapter_aloud_5884cb9e')} control={<Switch checked={settings.textToSpeech} onCheckedChange={(c) => updateSetting('textToSpeech', c)} />} />
          {settings.narratorEngine === 'system' && <SystemVoicePicker />}
          <div className="my-4"><VoicePreview /></div>
          <SettingRow
            title={uiI18n.t('app.narration_rate_7243ad2a')}
            control={
              <div className="flex items-center gap-3">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <Slider aria-label={uiI18n.t('app.narration_speed_8c88e215')} className="w-40" min={0.5} max={2} step={0.05} value={[settings.narratorRate]} onValueChange={([v]) => updateSetting('narratorRate', Math.round(v * 100) / 100)} />
                <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.narratorRate.toFixed(2)}×</span>
              </div>
            }
          />
        </div>
      </SettingsSection>

      </TabsContent>
      <TabsContent value="flow">
      <SettingsSection title={uiI18n.t('app.reading_flow_e281c1ac')} description={uiI18n.t('app.chapter_loading_progress_and_reader_controls_cdc4b7d3')}>
        <div className="flex flex-col">
          <SettingRow title={uiI18n.t('app.continuous_scroll_bf2bf036')} description={uiI18n.t('app.load_the_next_chapter_as_you_reach_the_end_5922f59d')} control={<Switch checked={settings.continuousScroll} onCheckedChange={(c) => updateSetting('continuousScroll', c)} />} />
          <SettingRow title={uiI18n.t('app.progress_bar_b1d7cb67')} description={uiI18n.t('app.show_a_progress_bar_along_the_reader_d7332542')} control={<Switch checked={settings.showProgressBar} onCheckedChange={(c) => updateSetting('showProgressBar', c)} />} />
          <SettingRow title={uiI18n.t('app.show_percent_read_e4c19f7a')} description={uiI18n.t('app.percent_indicator_in_the_header_427a0c33')} control={<Switch checked={settings.showPercentRead} onCheckedChange={(c) => updateSetting('showPercentRead', c)} />} />
          <SettingRow title={uiI18n.t('app.show_chapter_number_8fcbd936')} description={uiI18n.t('app.chapter_number_in_the_header_9f835a85')} control={<Switch checked={settings.showChapterNumber} onCheckedChange={(c) => updateSetting('showChapterNumber', c)} />} />
          <SettingRow title={uiI18n.t('app.enter_fullscreen_4c968203')} description={uiI18n.t('app.open_the_reader_in_fullscreen_ab5caf1c')} control={<Switch checked={settings.enterFullscreen} onCheckedChange={(c) => updateSetting('enterFullscreen', c)} />} />
          <SettingRow title={uiI18n.t('app.keep_screen_awake_e4656630')} description={uiI18n.t('app.prevent_sleep_while_reading_c2c91123')} control={<Switch checked={settings.keepScreenAwake} onCheckedChange={(c) => updateSetting('keepScreenAwake', c)} />} />
          <SettingRow title={uiI18n.t('app.paragraph_comments_2f82405d')} description={uiI18n.t('app.webnovel_style_per_paragraph_threads_e94b3b2a')} control={<Switch checked={settings.showParagraphComments} onCheckedChange={(c) => updateSetting('showParagraphComments', c)} />} />
        </div>
      </SettingsSection>
      </TabsContent>
      </Tabs>

      <button type="button" onClick={resetSettings}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted/30 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground">
        <RotateCcw className="h-4 w-4" /> {uiI18n.t('app.reset_novel_reader_settings_0bc09bfc')}
      </button>
    </div>
  );
}
