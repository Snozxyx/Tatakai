import uiI18n from '@/lib/uiI18n';
import { SettingRow } from '@/components/settings/SettingsPrimitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { ReaderSettings } from '@/lib/reader/settings';

export function ReaderInteractionControls({ settings, update }: {
  settings: ReaderSettings; update: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void;
}) {
  const t = (key: string) => uiI18n.t(`readerSmooth.${key}`);
  return <>
    <SettingRow title={t('tapBehavior')} description={t('tapDescription')} control={
      <Select value={settings.tapBehavior} onValueChange={value => update('tapBehavior', value as ReaderSettings['tapBehavior'])}>
        <SelectTrigger aria-label={t('tapBehavior')} className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t('tapNone')}</SelectItem>
          <SelectItem value="settings">{t('tapSettings')}</SelectItem>
          <SelectItem value="scroll">{t('tapScroll')}</SelectItem>
        </SelectContent>
      </Select>
    } />
    <SettingRow title={t('hideCursor')} description={t('cursorDescription')} control={<Switch aria-label={t('hideCursor')} checked={settings.hideCursorWhileReading} onCheckedChange={value => update('hideCursorWhileReading', value)} />} />
    {settings.hideCursorWhileReading && <SettingRow title={t('wakeDistance')} control={
      <div className="flex items-center gap-3">
        <Slider aria-label={t('wakeDistance')} className="w-40" min={0} max={50} step={1} value={[settings.cursorWakeDistance]} onValueChange={([value]) => update('cursorWakeDistance', value)} />
        <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{settings.cursorWakeDistance}px</span>
      </div>
    } />}
    <SettingRow title={t('autoMode')} control={
      <Select value={settings.autoScrollMode} onValueChange={value => update('autoScrollMode', value as ReaderSettings['autoScrollMode'])}>
        <SelectTrigger aria-label={t('autoMode')} className="h-9 w-40 rounded-lg text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="creep">{t('creep')}</SelectItem>
          <SelectItem value="jump">{t('jump')}</SelectItem>
        </SelectContent>
      </Select>
    } />
    {settings.autoScrollMode === 'jump' && <SettingRow title={t('jumpInterval')} control={
      <div className="flex items-center gap-3">
        <Slider aria-label={t('jumpInterval')} className="w-40" min={0.5} max={10} step={0.5} value={[settings.autoScrollInterval]} onValueChange={([value]) => update('autoScrollInterval', value)} />
        <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{settings.autoScrollInterval}s</span>
      </div>
    } />}
  </>;
}
