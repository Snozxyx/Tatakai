import { useEffect, useState } from 'react';
import { Repeat, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsPrimitives';
import { useReaderSettings } from '@/hooks/media/useReaderSettings';
import { useReaderKeybinds } from '@/hooks/media/useReaderKeybinds';
import {
  READER_KEYBIND_ACTIONS,
  formatKeyToken,
  normalizeKeyToken,
  type ReaderKeybindAction,
} from '@/lib/reader/keybindings';

/**
 * Reader: global manga-reader layout, behavior, interface, performance, and
 * keyboard shortcuts. House-style panel sharing `useReaderSettings` with
 * MangaReaderPage so a change here takes effect in the reader immediately. The
 * shortcuts section rebinds reader keys via `useReaderKeybinds` (mirrors the
 * video Keys tab's capture-listener pattern).
 */
export function ReaderPanel() {
  const { settings, updateSetting, resetSettings } = useReaderSettings();
  const { keybinds, setBinding, reset: resetKeybinds } = useReaderKeybinds();
  const [listeningAction, setListeningAction] = useState<ReaderKeybindAction | null>(null);

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
      if (!token) return;
      setBinding(listeningAction, token);
      setListeningAction(null);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [listeningAction, setBinding]);

  return (
    <div className="space-y-6">
      <SettingsSection title="Reading layout" description="How pages are laid out and sized in the reader.">
        <div className="flex flex-col">
          <SettingRow
            title="Reading mode"
            description="Vertical infinite scroll (webtoon) or one page at a time"
            control={
              <Select value={settings.readingMode} onValueChange={(v) => updateSetting('readingMode', v as 'vertical' | 'paged')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vertical">Vertical scroll</SelectItem>
                  <SelectItem value="paged">Paged</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title="Reading direction"
            description="Page-turn direction (right-to-left for manga)"
            control={
              <Select value={settings.readingDirection} onValueChange={(v) => updateSetting('readingDirection', v as 'ltr' | 'rtl')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltr">Left to right</SelectItem>
                  <SelectItem value="rtl">Right to left</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title="Page width"
            description="Width of pages within the reader column"
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={30} max={100} step={5} value={[settings.widthPercent]} onValueChange={([v]) => updateSetting('widthPercent', v)} />
                <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.widthPercent}%</span>
              </div>
            }
          />
          <SettingRow
            title="Zoom"
            description="Scale pages up or down (Ctrl + wheel / pinch in the reader)"
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={50} max={300} step={5} value={[settings.zoom]} onValueChange={([v]) => updateSetting('zoom', v)} />
                <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{settings.zoom}%</span>
              </div>
            }
          />
          <SettingRow
            title="Max page width"
            description="Cap page width in pixels on large screens (0 = off)"
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={0} max={2000} step={50} value={[settings.maxWidthPx]} onValueChange={([v]) => updateSetting('maxWidthPx', v)} />
                <span className="w-14 text-right text-sm tabular-nums text-muted-foreground">{settings.maxWidthPx === 0 ? 'Off' : `${settings.maxWidthPx}px`}</span>
              </div>
            }
          />
          <SettingRow
            title="Sizing"
            description="Clamp pages to the width above, or render at natural size"
            control={
              <Select value={settings.sizing} onValueChange={(v) => updateSetting('sizing', v as 'clamp' | 'natural')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clamp">Clamp to width</SelectItem>
                  <SelectItem value="natural">Natural size</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title="Page gap"
            description="Vertical spacing between pages"
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={0} max={48} step={2} value={[settings.gap]} onValueChange={([v]) => updateSetting('gap', v)} />
                <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.gap}px</span>
              </div>
            }
          />
          <SettingRow
            title="Page fit"
            description="Paged mode: fit each page to width, height, both, or original size"
            control={
              <Select value={settings.pageFit} onValueChange={(v) => updateSetting('pageFit', v as 'width' | 'height' | 'both' | 'original')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="width">Fit width</SelectItem>
                  <SelectItem value="height">Fit height</SelectItem>
                  <SelectItem value="both">Fit both</SelectItem>
                  <SelectItem value="original">Original size</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow title="Double page" description="Paged mode: show two pages side by side" control={<Switch checked={settings.doublePage} onCheckedChange={(c) => updateSetting('doublePage', c)} />} />
          <SettingRow
            title="Brightness"
            description="Dim the pages for comfortable reading"
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={20} max={100} step={5} value={[settings.brightness]} onValueChange={([v]) => updateSetting('brightness', v)} />
                <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.brightness}%</span>
              </div>
            }
          />
          <SettingRow
            title="Background color"
            description="Reader page background"
            control={
              <div className="flex items-center gap-3">
                <span className="text-sm uppercase tabular-nums text-muted-foreground">{settings.backgroundColor}</span>
                <input
                  type="color"
                  aria-label="Reader background color"
                  value={settings.backgroundColor}
                  onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                />
              </div>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Behavior" description="Navigation and automatic scrolling.">
        <div className="flex flex-col">
          <SettingRow title="Continuous scroll" description="Load the next chapter at the end and the previous chapter at the top, so reading never stops (vertical mode)" control={<Switch checked={settings.continuousScroll} onCheckedChange={(c) => updateSetting('continuousScroll', c)} />} />
          <SettingRow title="Click to turn pages" description="Tap the left/right edge of a page to turn (paged mode)" control={<Switch checked={settings.clickToTurn} onCheckedChange={(c) => updateSetting('clickToTurn', c)} />} />
          <SettingRow title="Auto scroll" description="Automatically scroll through pages (vertical mode)" control={<Switch checked={settings.autoScroll} onCheckedChange={(c) => updateSetting('autoScroll', c)} />} />
          {settings.autoScroll && (
            <SettingRow
              title="Auto-scroll speed"
              control={
                <div className="flex items-center gap-3">
                  <Slider className="w-40" min={1} max={10} step={1} value={[settings.autoScrollSpeed]} onValueChange={([v]) => updateSetting('autoScrollSpeed', v)} />
                  <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.autoScrollSpeed}</span>
                </div>
              }
            />
          )}
          <SettingRow title="Enter fullscreen on open" description="Open the reader in fullscreen" control={<Switch checked={settings.autoFullscreen} onCheckedChange={(c) => updateSetting('autoFullscreen', c)} />} />
          <SettingRow title="Hide chrome in fullscreen" description="Auto-hide the nav, toolbar, app header and tray in fullscreen" control={<Switch checked={settings.hideChromeInFullscreen} onCheckedChange={(c) => updateSetting('hideChromeInFullscreen', c)} />} />
          <SettingRow title="Zoom with wheel / pinch" description="Ctrl + mouse wheel or a trackpad pinch zooms the pages" control={<Switch checked={settings.zoomWithWheel} onCheckedChange={(c) => updateSetting('zoomWithWheel', c)} />} />
          <SettingRow title="Keep screen awake" description="Prevent the screen from sleeping while reading" control={<Switch checked={settings.keepScreenAwake} onCheckedChange={(c) => updateSetting('keepScreenAwake', c)} />} />
        </div>
      </SettingsSection>

      <SettingsSection title="Interface" description="On-screen indicators and toolbar buttons.">
        <div className="flex flex-col">
          <SettingRow
            title="Progress indicator"
            description="Show page count or chapter progress"
            control={
              <Select value={settings.progressIndicator} onValueChange={(v) => updateSetting('progressIndicator', v as 'page' | 'chapter')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">Page (n / total)</SelectItem>
                  <SelectItem value="chapter">Chapter</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow title="Progress bar" description="Show a progress bar along the reader" control={<Switch checked={settings.showProgressBar} onCheckedChange={(c) => updateSetting('showProgressBar', c)} />} />
          <SettingRow title="Comments" description="Show the comments button and threads in the reader" control={<Switch checked={settings.showComments} onCheckedChange={(c) => updateSetting('showComments', c)} />} />
          <SettingRow title="Notifications" description="Show reader toasts for chapter changes and actions" control={<Switch checked={settings.showNotifications} onCheckedChange={(c) => updateSetting('showNotifications', c)} />} />
          <SettingRow title="Capture button" description="Show the screenshot button in the toolbar" control={<Switch checked={settings.showCaptureButton} onCheckedChange={(c) => updateSetting('showCaptureButton', c)} />} />
          <SettingRow title="Reload button" description="Show the reload button in the toolbar" control={<Switch checked={settings.showReloadButton} onCheckedChange={(c) => updateSetting('showReloadButton', c)} />} />
        </div>
      </SettingsSection>

      <SettingsSection title="Loading & performance" description="How chapter pages are fetched and preloaded.">
        <div className="flex flex-col">
          <SettingRow
            title="Preloading"
            description="How many upcoming pages to load ahead"
            control={
              <Select value={settings.preloading} onValueChange={(v) => updateSetting('preloading', v as 'none' | 'partial' | 'full')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title="Loading method"
            description="Native <img> or blob fetch (blob replays image headers)"
            control={
              <Select value={settings.loadingMethod} onValueChange={(v) => updateSetting('loadingMethod', v as 'native' | 'blob')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">Native</SelectItem>
                  <SelectItem value="blob">Blob</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title="Loading strategy"
            description="Eagerly load all pages or lazily as you scroll"
            control={
              <Select value={settings.loadingStrategy} onValueChange={(v) => updateSetting('loadingStrategy', v as 'eager' | 'lazy')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eager">Eager</SelectItem>
                  <SelectItem value="lazy">Lazy</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Keyboard shortcuts" description="Rebind the reader keys. Click a shortcut, then press a key. Esc cancels.">
        <div className="flex flex-col gap-2">
          {READER_KEYBIND_ACTIONS.map(({ action, label, hint }) => {
            const isListening = listeningAction === action;
            return (
              <div key={action} className="flex items-center justify-between gap-3 rounded-lg bg-muted/20 p-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setListeningAction(isListening ? null : action)}
                  className={`min-w-[96px] rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${isListening ? 'animate-pulse bg-primary text-primary-foreground' : 'bg-muted/40 text-foreground hover:bg-muted/60'}`}
                >
                  {isListening ? 'Press a key…' : formatKeyToken(keybinds[action])}
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={resetKeybinds}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted/30 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Repeat className="h-4 w-4" />
            Reset shortcuts
          </button>
        </div>
      </SettingsSection>

      <button
        type="button"
        onClick={resetSettings}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted/30 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <RotateCcw className="h-4 w-4" />
        Reset reader settings
      </button>
    </div>
  );
}
