import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ThemeEditorProps } from '../types';
import { heavenDefaults, readHeavenConfig } from './config';
export default function HeavenEditor({ configuration,onChange }: ThemeEditorProps) {
  const c = readHeavenConfig(configuration) ?? heavenDefaults(); const { t } = useTranslation();
  return <div className="flex flex-col gap-6"><div className="flex items-center justify-between gap-4"><div><Label htmlFor="heaven-motion">{t('heaven.liveScene')}</Label><p className="mt-1 text-xs text-muted-foreground">{t('heaven.motionHint')}</p></div><Switch id="heaven-motion" checked={c.motion} onCheckedChange={motion => onChange({...c,motion})} /></div>
    <div className="flex flex-col gap-3"><Label>{t('heaven.palette')}</Label><ToggleGroup type="single" value={c.palette} onValueChange={palette => {if(palette) onChange({...c,palette});}}>{['sky','lavender','sage'].map(p => <ToggleGroupItem key={p} value={p}>{t(`heaven.${p}`)}</ToggleGroupItem>)}</ToggleGroup></div>
    <div className="flex flex-col gap-3"><Label>{t('heaven.surface')}</Label><ToggleGroup type="single" value={c.surface} onValueChange={surface => {if(surface) onChange({...c,surface});}}><ToggleGroupItem value="glass">{t('heaven.glass')}</ToggleGroupItem><ToggleGroupItem value="solid">{t('heaven.solid')}</ToggleGroupItem></ToggleGroup></div>
    <div className="flex flex-col gap-3"><Label htmlFor="heaven-dim">{t('heaven.shade')}</Label><Slider id="heaven-dim" value={[c.dim*100]} min={0} max={60} step={1} onValueChange={([n]) => onChange({...c,dim:n/100})} /></div>
    <div className="flex flex-col gap-3"><Label htmlFor="heaven-position">{t('heaven.framing')}</Label><Slider id="heaven-position" value={[c.scenePosition]} min={0} max={100} step={1} onValueChange={([scenePosition]) => onChange({...c,scenePosition})} /></div>
  </div>;
}
