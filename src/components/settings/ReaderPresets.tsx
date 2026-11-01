import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReaderPresets } from '@/hooks/media/useReaderPresets';
import { useReaderSettings } from '@/hooks/media/useReaderSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/themed-select';

export function ReaderPresets() {
  const { t } = useTranslation();
  const { settings, replaceSettings } = useReaderSettings();
  const presets = useReaderPresets(replaceSettings);
  const [name, setName] = useState('');
  const active = presets.presets.find(p => p.id === presets.active)!;
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
    <h3 className="font-semibold">{t('readerPresets.title')}</h3>
    <ThemedSelect value={presets.active} onChange={e => presets.select(e.target.value)} aria-label={t('readerPresets.title')}>{presets.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</ThemedSelect>
    <div className="flex flex-wrap gap-2">
      <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('readerPresets.name')} aria-label={t('readerPresets.name')} maxLength={80} />
      <Button disabled={!name.trim()} onClick={() => { presets.save(name, settings); setName(''); }}>{t('readerPresets.create')}</Button>
      <Button variant="outline" disabled={active.id === 'default'} onClick={() => presets.save(active.name, settings, active.id)}>{t('readerPresets.overwrite')}</Button>
      <Button variant="outline" disabled={active.id === 'default' || !name.trim()} onClick={() => { presets.save(name, active.settings, active.id); setName(''); }}>{t('readerPresets.rename')}</Button>
      <Button variant="outline" disabled={active.id === 'default'} onClick={() => presets.remove(active.id)}>{t('readerPresets.delete')}</Button>
      <Button variant="ghost" onClick={() => presets.select('default')}>{t('readerPresets.reset')}</Button>
    </div>
  </section>;
}
