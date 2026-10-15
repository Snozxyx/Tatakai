import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
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
      <SettingsSection title={uiI18n.t('app.reading_layout_cfae87b0')} description={uiI18n.t('app.how_pages_are_laid_out_and_sized_in_the_reader_c2e71668')}>
        <div className="flex flex-col">
          <SettingRow
            title={uiI18n.t('app.reading_mode_d75871a6')}
            description={uiI18n.t('app.vertical_infinite_scroll_webtoon_or_one_page_at__22dc020f')}
            control={
              <Select value={settings.readingMode} onValueChange={(v) => updateSetting('readingMode', v as 'vertical' | 'paged')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vertical">{uiI18n.t('app.vertical_scroll_9d96cf39')}</SelectItem>
                  <SelectItem value="paged">{uiI18n.t('app.paged_c1ac80e8')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={uiI18n.t('app.reading_direction_9fc93357')}
            description={uiI18n.t('app.page_turn_direction_right_to_left_for_manga_a42390a7')}
            control={
              <Select value={settings.readingDirection} onValueChange={(v) => updateSetting('readingDirection', v as 'ltr' | 'rtl')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltr">{uiI18n.t('app.left_to_right_34ce1477')}</SelectItem>
                  <SelectItem value="rtl">{uiI18n.t('app.right_to_left_da502a64')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={uiI18n.t('app.page_width_6c4b9d75')}
            description={uiI18n.t('app.width_of_pages_within_the_reader_column_d8a64094')}
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={30} max={100} step={5} value={[settings.widthPercent]} onValueChange={([v]) => updateSetting('widthPercent', v)} />
                <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.widthPercent}%</span>
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.zoom_9b3cbed5')}
            description={uiI18n.t('app.scale_pages_up_or_down_ctrl_wheel_pinch_in_the_r_4e65244b')}
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={50} max={300} step={5} value={[settings.zoom]} onValueChange={([v]) => updateSetting('zoom', v)} />
                <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{settings.zoom}%</span>
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.max_page_width_75674192')}
            description={uiI18n.t('app.cap_page_width_in_pixels_on_large_screens_0_off_06ee18fd')}
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={0} max={2000} step={50} value={[settings.maxWidthPx]} onValueChange={([v]) => updateSetting('maxWidthPx', v)} />
                <span className="w-14 text-right text-sm tabular-nums text-muted-foreground">{settings.maxWidthPx === 0 ? uiI18n.t('app.off_e3de5ab0') : uiI18n.t('app.i18n_value_0px_137eb557', { value0: settings.maxWidthPx })}</span>
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.sizing_de7805a2')}
            description={uiI18n.t('app.clamp_pages_to_the_width_above_or_render_at_natu_563d8601')}
            control={
              <Select value={settings.sizing} onValueChange={(v) => updateSetting('sizing', v as 'clamp' | 'natural')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clamp">{uiI18n.t('app.clamp_to_width_29bfa2ee')}</SelectItem>
                  <SelectItem value="natural">{uiI18n.t('app.natural_size_c81bceb1')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={uiI18n.t('app.page_gap_8a0ed8af')}
            description={uiI18n.t('app.vertical_spacing_between_pages_ed85bcf0')}
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={0} max={48} step={2} value={[settings.gap]} onValueChange={([v]) => updateSetting('gap', v)} />
                <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.gap}{uiI18n.t('app.px_07a65dd6')}</span>
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.page_fit_cbbeab57')}
            description={uiI18n.t('app.paged_mode_fit_each_page_to_width_height_both_or_d2a3b2db')}
            control={
              <Select value={settings.pageFit} onValueChange={(v) => updateSetting('pageFit', v as 'width' | 'height' | 'both' | 'original')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="width">{uiI18n.t('app.fit_width_0071b9d8')}</SelectItem>
                  <SelectItem value="height">{uiI18n.t('app.fit_height_e33d6802')}</SelectItem>
                  <SelectItem value="both">{uiI18n.t('app.fit_both_fb676b9f')}</SelectItem>
                  <SelectItem value="original">{uiI18n.t('app.original_size_983bb440')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow title={uiI18n.t('app.double_page_ceea11de')} description={uiI18n.t('app.paged_mode_show_two_pages_side_by_side_c9b25830')} control={<Switch checked={settings.doublePage} onCheckedChange={(c) => updateSetting('doublePage', c)} />} />
          <SettingRow title={uiI18n.t('app.panel_crop_63246145')} description={uiI18n.t('app.small_phones_full_bleed_pages_in_vertical_mode_h_ec4065c0')} control={<Switch checked={settings.panelCrop} onCheckedChange={(c) => updateSetting('panelCrop', c)} />} />
          <SettingRow
            title={uiI18n.t('app.brightness_e1a2b65d')}
            description={uiI18n.t('app.dim_the_pages_for_comfortable_reading_099f7a28')}
            control={
              <div className="flex items-center gap-3">
                <Slider className="w-40" min={20} max={100} step={5} value={[settings.brightness]} onValueChange={([v]) => updateSetting('brightness', v)} />
                <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.brightness}%</span>
              </div>
            }
          />
          <SettingRow
            title={uiI18n.t('app.background_color_1a0371e3')}
            description={uiI18n.t('app.reader_page_background_3b63dd97')}
            control={
              <div className="flex items-center gap-3">
                <span className="text-sm uppercase tabular-nums text-muted-foreground">{settings.backgroundColor}</span>
                <input
                  type="color"
                  aria-label={uiI18n.t('app.reader_background_color_91617a88')}
                  value={settings.backgroundColor}
                  onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                />
              </div>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title={uiI18n.t('app.behavior_70cb647a')} description={uiI18n.t('app.navigation_and_automatic_scrolling_524082f8')}>
        <div className="flex flex-col">
          <SettingRow title={uiI18n.t('app.continuous_scroll_bf2bf036')} description={uiI18n.t('app.load_the_next_chapter_at_the_end_and_the_previou_1702ff09')} control={<Switch checked={settings.continuousScroll} onCheckedChange={(c) => updateSetting('continuousScroll', c)} />} />
          <SettingRow title={uiI18n.t('app.click_to_turn_pages_73343530')} description={uiI18n.t('app.tap_the_left_right_edge_of_a_page_to_turn_paged__2fa7e749')} control={<Switch checked={settings.clickToTurn} onCheckedChange={(c) => updateSetting('clickToTurn', c)} />} />
          <SettingRow title={uiI18n.t('app.auto_scroll_d4617dac')} description={uiI18n.t('app.automatically_scroll_through_pages_vertical_mode_83e0273f')} control={<Switch checked={settings.autoScroll} onCheckedChange={(c) => updateSetting('autoScroll', c)} />} />
          {settings.autoScroll && (
            <SettingRow
              title={uiI18n.t('app.auto_scroll_speed_1b63a4e6')}
              control={
                <div className="flex items-center gap-3">
                  <Slider className="w-40" min={1} max={10} step={1} value={[settings.autoScrollSpeed]} onValueChange={([v]) => updateSetting('autoScrollSpeed', v)} />
                  <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{settings.autoScrollSpeed}</span>
                </div>
              }
            />
          )}
          <SettingRow title={uiI18n.t('app.enter_fullscreen_on_open_42b7c660')} description={uiI18n.t('app.open_the_reader_in_fullscreen_ab5caf1c')} control={<Switch checked={settings.autoFullscreen} onCheckedChange={(c) => updateSetting('autoFullscreen', c)} />} />
          <SettingRow title={uiI18n.t('app.hide_chrome_in_fullscreen_0083db82')} description={uiI18n.t('app.auto_hide_the_nav_toolbar_app_header_and_tray_in_a59e2819')} control={<Switch checked={settings.hideChromeInFullscreen} onCheckedChange={(c) => updateSetting('hideChromeInFullscreen', c)} />} />
          <SettingRow title={uiI18n.t('app.zoom_with_wheel_pinch_42eb0c34')} description={uiI18n.t('app.ctrl_mouse_wheel_or_a_trackpad_pinch_zooms_the_p_45c983eb')} control={<Switch checked={settings.zoomWithWheel} onCheckedChange={(c) => updateSetting('zoomWithWheel', c)} />} />
          <SettingRow title={uiI18n.t('app.keep_screen_awake_e4656630')} description={uiI18n.t('app.prevent_the_screen_from_sleeping_while_reading_4fe89d44')} control={<Switch checked={settings.keepScreenAwake} onCheckedChange={(c) => updateSetting('keepScreenAwake', c)} />} />
        </div>
      </SettingsSection>

      <SettingsSection title={uiI18n.t('app.interface_7b4db7ef')} description={uiI18n.t('app.on_screen_indicators_and_toolbar_buttons_475f7477')}>
        <div className="flex flex-col">
          <SettingRow
            title={uiI18n.t('app.progress_indicator_f8660a3b')}
            description={uiI18n.t('app.show_page_count_or_chapter_progress_b133dff6')}
            control={
              <Select value={settings.progressIndicator} onValueChange={(v) => updateSetting('progressIndicator', v as 'page' | 'chapter')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">{uiI18n.t('app.page_n_total_87b5bb94')}</SelectItem>
                  <SelectItem value="chapter">{uiI18n.t('app.chapter_46b00590')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow title={uiI18n.t('app.progress_bar_b1d7cb67')} description={uiI18n.t('app.show_a_progress_bar_along_the_reader_d7332542')} control={<Switch checked={settings.showProgressBar} onCheckedChange={(c) => updateSetting('showProgressBar', c)} />} />
          <SettingRow title={uiI18n.t('app.comments_fce06e20')} description={uiI18n.t('app.show_the_comments_button_and_threads_in_the_read_cb4e9a96')} control={<Switch checked={settings.showComments} onCheckedChange={(c) => updateSetting('showComments', c)} />} />
          <SettingRow title={uiI18n.t('app.notifications_753a22b2')} description={uiI18n.t('app.show_reader_toasts_for_chapter_changes_and_actio_a365d473')} control={<Switch checked={settings.showNotifications} onCheckedChange={(c) => updateSetting('showNotifications', c)} />} />
          <SettingRow title={uiI18n.t('app.capture_button_6c323e5e')} description={uiI18n.t('app.show_the_screenshot_button_in_the_toolbar_081332a8')} control={<Switch checked={settings.showCaptureButton} onCheckedChange={(c) => updateSetting('showCaptureButton', c)} />} />
          <SettingRow title={uiI18n.t('app.reload_button_74ef34d4')} description={uiI18n.t('app.show_the_reload_button_in_the_toolbar_55d536d0')} control={<Switch checked={settings.showReloadButton} onCheckedChange={(c) => updateSetting('showReloadButton', c)} />} />
        </div>
      </SettingsSection>

      <SettingsSection title={uiI18n.t('app.loading_performance_756c2d22')} description={uiI18n.t('app.how_chapter_pages_are_fetched_and_preloaded_ed50e04d')}>
        <div className="flex flex-col">
          <SettingRow
            title={uiI18n.t('app.preloading_f2684504')}
            description={uiI18n.t('app.how_many_upcoming_pages_to_load_ahead_68fb1ab8')}
            control={
              <Select value={settings.preloading} onValueChange={(v) => updateSetting('preloading', v as 'none' | 'partial' | 'full')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{uiI18n.t('app.none_6eef6648')}</SelectItem>
                  <SelectItem value="partial">{uiI18n.t('app.partial_65de2e2a')}</SelectItem>
                  <SelectItem value="full">{uiI18n.t('app.full_10b28a8c')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={uiI18n.t('app.loading_method_5a01057f')}
            description="Native <img> or blob fetch (blob replays image headers)"
            control={
              <Select value={settings.loadingMethod} onValueChange={(v) => updateSetting('loadingMethod', v as 'native' | 'blob')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">{uiI18n.t('app.native_4fc6e7f7')}</SelectItem>
                  <SelectItem value="blob">{uiI18n.t('app.blob_c24315eb')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={uiI18n.t('app.loading_strategy_3e58550e')}
            description={uiI18n.t('app.eagerly_load_all_pages_or_lazily_as_you_scroll_76aab349')}
            control={
              <Select value={settings.loadingStrategy} onValueChange={(v) => updateSetting('loadingStrategy', v as 'eager' | 'lazy')}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eager">{uiI18n.t('app.eager_07a32b8e')}</SelectItem>
                  <SelectItem value="lazy">{uiI18n.t('app.lazy_84e98cf9')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title={uiI18n.t('app.keyboard_shortcuts_26669547')} description={uiI18n.t('app.rebind_the_reader_keys_click_a_shortcut_then_pre_e97bf516')}>
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
                  {isListening ? uiI18n.t('app.press_a_key_9026d7b5') : formatKeyToken(keybinds[action])}
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
            {uiI18n.t('app.reset_shortcuts_a8c9e9e7')}
          </button>
        </div>
      </SettingsSection>

      <button
        type="button"
        onClick={resetSettings}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted/30 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <RotateCcw className="h-4 w-4" />
        {uiI18n.t('app.reset_reader_settings_6872dad7')}
      </button>
    </div>
  );
}
