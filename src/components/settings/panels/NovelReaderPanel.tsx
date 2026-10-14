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
  const { settings, customFonts } = useNovelReaderSettings();
  const stack = resolveFontStack(settings.font, customFonts);
  return (
    <div
      className="overflow-hidden rounded-xl border border-border"
      style={{ background: settings.background }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-3">
        <span className="text-sm font-medium text-foreground">
          Reading preview
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {settings.textSize}px · {settings.lineSpacing.toFixed(2)} · {settings.textWidth}px
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
          <p className="text-sm font-semibold">Hear this voice</p>
          <p className="text-[11px] text-muted-foreground">
            Engine: <span className="font-bold text-foreground">{narratorEngineLabel(settings.narratorEngine)}</span>
            {spokenBy ? <span> · <span className="font-bold text-primary">{spokenBy}</span></span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={preview}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110"
        >
          {busy ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {busy ? 'Stop preview' : 'Preview voice'}
        </button>
      </div>
      <p className="mt-1.5 text-xs italic text-muted-foreground line-clamp-2">
        “{PREVIEW_VOICE_SAMPLE[1]}”
      </p>
      {working && !playing && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Preparing voice…
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}
      {buffering && <p role="status" className="mt-2 text-xs text-muted-foreground">Generating the next passage…</p>}
    </div>
  );
}

function SystemVoicePicker() {
  const { settings, updateSetting } = useNovelReaderSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => setVoices(synth.getVoices()); refresh();
    synth.addEventListener('voiceschanged', refresh);
    return () => synth.removeEventListener('voiceschanged', refresh);
  }, []);
  return <SettingRow title="System voice" description={voices.length ? 'Voices installed on this device' : 'Your device loads its voice list automatically'} control={({ labelId }) => <Select value={settings.narratorVoice === 'kitten-default' ? 'system-default' : settings.narratorVoice} onValueChange={v => updateSetting('narratorVoice', v)}><SelectTrigger aria-labelledby={labelId} className="h-10 w-56 max-w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system-default">Default system voice</SelectItem><SelectItem value="system-female">Prefer feminine voice</SelectItem><SelectItem value="system-male">Prefer masculine voice</SelectItem>{voices.map((voice, i) => <SelectItem key={voice.voiceURI + i} value={voice.voiceURI}>{voice.name} · {voice.lang}</SelectItem>)}</SelectContent></Select>} />;
}

export function NovelReaderPanel() {
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
        <TabsList className="grid h-11 w-full grid-cols-3"><TabsTrigger value="appearance">Appearance</TabsTrigger><TabsTrigger value="narration">Narration</TabsTrigger><TabsTrigger value="flow">Reading flow</TabsTrigger></TabsList>
      <TabsContent value="appearance" className="space-y-6">
      <SettingsSection title="Typography" description="Choose a comfortable typeface and spacing. Changes save automatically.">
        <div className="flex flex-col">
          <SettingRow
            title="Font"
            description="Aa — Default / Sans / Georgia / Lora / Dyslexic, or a custom font"
            control={
              <Select value={fontValue} onValueChange={(v) => updateSetting('font', v)}>
                <SelectTrigger className="h-9 w-44 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOVEL_FONT_PRESETS.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      <span style={{ fontFamily: f.stack }}>Aa</span> {f.label}
                    </SelectItem>
                  ))}
                  {customFonts.map((f) => (
                    <SelectItem key={`custom:${f.name}`} value={`custom:${f.name}`}>
                      <span style={{ fontFamily: `"${f.family}"` }}>Aa</span> {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">Custom fonts</summary>
          <div className="mt-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Upload a font file
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              TTF, OTF, WOFF or WOFF2 (max 12 MB). It registers instantly and the preview above updates live.
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
                {uploading ? 'Loading…' : 'Choose font file'}
              </button>
              {customFonts.length > 0 && (
                <span className="self-center text-xs text-muted-foreground">
                  {customFonts.length} custom
                </span>
              )}
            </div>
            {uploadError && <p className="mt-2 text-xs text-destructive">{uploadError}</p>}
            {customFonts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {customFonts.map((f) => (
                  <span key={f.name} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
                    <span style={{ fontFamily: `"${f.family}"` }}>Aa</span> {f.name}
                    <button onClick={() => removeCustomFont(f.name)} aria-label={`Remove ${f.name}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="mt-5">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add installed font by name
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Use any font installed on this device (e.g. “Merriweather”, “Atkinson Hyperlegible”).
            </p>
            <div className="flex flex-col gap-2">
              <input
                value={customName}
                aria-label="Custom font display name"
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Display name (e.g. Merriweather)"
                className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              />
              <div className="flex gap-2">
                <input
                  value={customFamily}
                  aria-label="Installed font family"
                  onChange={(e) => setCustomFamily(e.target.value)}
                  placeholder="Font family (defaults to name)"
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
                  Add
                </button>
              </div>
            </div>
          </div>
          </details>
          <SettingRow
            title="Text size"
            description="19px default · 15px compact · 26px large"
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
                <Slider aria-label="Text size" className="w-28" min={12} max={32} step={1} value={[settings.textSize]} onValueChange={([v]) => updateSetting('textSize', v)} />
                <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{settings.textSize}px</span>
              </div>
            }
          />
          <SettingRow
            title="Line spacing"
            description="1.65 relaxed · 1.30 tight · 2.20 airy"
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
                <Slider aria-label="Reading layout adjustment" className="w-24" min={1} max={2.6} step={0.05} value={[settings.lineSpacing]} onValueChange={([v]) => updateSetting('lineSpacing', Math.round(v * 100) / 100)} />
              </div>
            }
          />
          <SettingRow
            title="Paragraph spacing"
            description="0.90 default · 0.00 seamless · 3.00 wide"
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
                <Slider aria-label="Reading layout adjustment" className="w-24" min={0} max={4} step={0.1} value={[settings.paragraphSpacing]} onValueChange={([v]) => updateSetting('paragraphSpacing', Math.round(v * 10) / 10)} />
              </div>
            }
          />
          <SettingRow
            title="Text width"
            description="627px book · 456px narrow · 874px wide"
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
                <Slider aria-label="Reading layout adjustment" className="w-24" min={320} max={1100} step={1} value={[settings.textWidth]} onValueChange={([v]) => updateSetting('textWidth', v)} />
              </div>
            }
          />
          <SettingRow
            title="Background"
            description="Reader page background"
            control={
              <div className="flex max-w-full flex-wrap items-center gap-2">
                {['#0a0a0f', '#f5f1e8', '#1a1611', '#0f1a14'].map((c) => (
                  <button
                    key={c}
                    onClick={() => updateSetting('background', c)}
                    aria-label={`Background ${c}`}
                    className={`h-7 w-7 rounded-full border-2 ${settings.background === c ? 'border-primary' : 'border-white/20'}`}
                    style={{ background: c }}
                  />
                ))}
                <input type="color" aria-label="Custom background" value={settings.background}
                  onChange={(e) => updateSetting('background', e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
              </div>
            }
          />
          <SettingRow
            title="Text colour"
            description="Chapter body colour"
            control={
              <div className="flex max-w-full flex-wrap items-center gap-2">
                <span className="text-xs uppercase tabular-nums text-muted-foreground">{settings.textColour}</span>
                <input type="color" aria-label="Text colour" value={settings.textColour}
                  onChange={(e) => updateSetting('textColour', e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
              </div>
            }
          />
        </div>
      </SettingsSection>

      </TabsContent>
      <TabsContent value="narration" className="space-y-6">
      <SettingsSection title="Narration" description="Choose a device voice, KittenTTS, OpenAI, ElevenLabs or your local model server.">
        <div className="flex flex-col">
          <SettingRow title="Narrator" description="System voice is the default" control={({ labelId }) => <Select value={settings.narratorEngine} onValueChange={value => updateSetting('narratorEngine', value as NovelNarratorEngine)}><SelectTrigger aria-labelledby={labelId} className="h-10 w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system">System voice (default)</SelectItem><SelectItem value="kitten-local">KittenTTS · Experimental</SelectItem><SelectItem value="openai">OpenAI</SelectItem><SelectItem value="elevenlabs">ElevenLabs</SelectItem><SelectItem value="local-server">Local model server</SelectItem></SelectContent></Select>} />
          {settings.narratorEngine === 'kitten-local' && <ExperimentalKittenSettings />}
          {(settings.narratorEngine === 'openai' || settings.narratorEngine === 'elevenlabs' || settings.narratorEngine === 'local-server') && <TtsIntegrationSettings engine={settings.narratorEngine} />}
          <SettingRow title="Text to speech" description="Read the chapter aloud" control={<Switch checked={settings.textToSpeech} onCheckedChange={(c) => updateSetting('textToSpeech', c)} />} />
          {settings.narratorEngine === 'system' && <SystemVoicePicker />}
          <div className="my-4"><VoicePreview /></div>
          <SettingRow
            title="Narration rate"
            control={
              <div className="flex items-center gap-3">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <Slider aria-label="Narration speed" className="w-40" min={0.5} max={2} step={0.05} value={[settings.narratorRate]} onValueChange={([v]) => updateSetting('narratorRate', Math.round(v * 100) / 100)} />
                <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.narratorRate.toFixed(2)}×</span>
              </div>
            }
          />
        </div>
      </SettingsSection>

      </TabsContent>
      <TabsContent value="flow">
      <SettingsSection title="Reading flow" description="Chapter loading, progress, and reader controls.">
        <div className="flex flex-col">
          <SettingRow title="Continuous scroll" description="Load the next chapter as you reach the end" control={<Switch checked={settings.continuousScroll} onCheckedChange={(c) => updateSetting('continuousScroll', c)} />} />
          <SettingRow title="Progress bar" description="Show a progress bar along the reader" control={<Switch checked={settings.showProgressBar} onCheckedChange={(c) => updateSetting('showProgressBar', c)} />} />
          <SettingRow title="Show percent read" description="Percent indicator in the header" control={<Switch checked={settings.showPercentRead} onCheckedChange={(c) => updateSetting('showPercentRead', c)} />} />
          <SettingRow title="Show chapter number" description="Chapter number in the header" control={<Switch checked={settings.showChapterNumber} onCheckedChange={(c) => updateSetting('showChapterNumber', c)} />} />
          <SettingRow title="Enter fullscreen" description="Open the reader in fullscreen" control={<Switch checked={settings.enterFullscreen} onCheckedChange={(c) => updateSetting('enterFullscreen', c)} />} />
          <SettingRow title="Keep screen awake" description="Prevent sleep while reading" control={<Switch checked={settings.keepScreenAwake} onCheckedChange={(c) => updateSetting('keepScreenAwake', c)} />} />
          <SettingRow title="Paragraph comments" description="WebNovel-style per-paragraph threads" control={<Switch checked={settings.showParagraphComments} onCheckedChange={(c) => updateSetting('showParagraphComments', c)} />} />
        </div>
      </SettingsSection>
      </TabsContent>
      </Tabs>

      <button type="button" onClick={resetSettings}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted/30 px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground">
        <RotateCcw className="h-4 w-4" /> Reset novel reader settings
      </button>
    </div>
  );
}
