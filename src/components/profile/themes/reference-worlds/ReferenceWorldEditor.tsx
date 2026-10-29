import type { ThemeEditorProps } from '../types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { defaultReferenceWorld, readReferenceWorld } from './config';
export default function ReferenceWorldEditor({ configuration, onChange }: ThemeEditorProps) {
  const config = readReferenceWorld(configuration) ?? defaultReferenceWorld();
  return <div className="flex flex-col gap-4">{(['headline','note','personality','role','birthday','musicUrl','musicTitle','musicArtist'] as const).map(key => <div key={key} className="flex flex-col gap-2">
    <Label htmlFor={`world-${key}`}>{({ headline: 'Hero headline', note: 'About this world', personality: 'Personality', role: 'Profile role', birthday: 'Birthday (optional, public)', musicUrl: 'Soundtrack HTTPS audio URL', musicTitle: 'Track title', musicArtist: 'Artist' })[key]}</Label>
    {key === 'note' ? <Textarea id={`world-${key}`} value={config[key]} maxLength={1000} onChange={e => onChange({ ...config, [key]: e.target.value })} /> : <Input id={`world-${key}`} type={key === 'birthday' ? 'date' : key === 'musicUrl' ? 'url' : 'text'} value={config[key]} maxLength={key === 'musicUrl' ? 2048 : 150} onChange={e => onChange({ ...config, [key]: e.target.value })} />}
  </div>)}</div>;
}
