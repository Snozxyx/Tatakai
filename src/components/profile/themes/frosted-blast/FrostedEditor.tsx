import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Upload, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { StorageUsageBar } from '@/components/media/StorageUsageBar';
import { uploadUserMedia, validateProfileImage } from '@/lib/userMedia';
import { imageSeed } from '../theme-palette';
import type { ThemeEditorProps } from '../types';
import { frostedDefaults, readFrostedConfig } from './config';
export default function FrostedEditor({configuration,onChange}:ThemeEditorProps){
 const c=readFrostedConfig(configuration)||frostedDefaults();const {user}=useAuth();const {t}=useTranslation();const cache=useQueryClient();const input=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false);
 return <div className="flex flex-col gap-5"><div><Label>{t('profileExtras.background')}</Label><p className="mt-2 text-sm text-muted-foreground">{t('profileExtras.backgroundHint')}</p></div><StorageUsageBar />{c.backgroundUrl&&<img src={c.backgroundUrl} alt={t('profileExtras.background')} className="aspect-video w-full rounded-2xl object-cover" />}<div className="flex flex-wrap gap-2"><Button disabled={busy||!user} onClick={()=>input.current?.click()}>{busy?<Loader2 className="animate-spin"/>:<Upload/>}{t('profileExtras.upload')}</Button>{c.backgroundUrl&&<Button variant="outline" disabled={busy} onClick={()=>onChange({...c,backgroundUrl:'',seed:'#668eae'})}>{t('profileExtras.resetBackground')}</Button>}</div>
 <input ref={input} className="hidden" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file||!user)return;setBusy(true);try{validateProfileImage(file);const seed=await imageSeed(file);const uploaded=await uploadUserMedia(file,user.id,'banner');onChange({...c,backgroundUrl:uploaded.url,seed});await Promise.all(['profile-gallery','user-media','storage-usage'].map(key=>cache.invalidateQueries({queryKey:[key,user.id]})));}catch(error){toast.error(error instanceof Error?error.message:t('profileExtras.uploadFailed'));}finally{setBusy(false);}}}/>
 <div className="flex items-center justify-between gap-4"><Label htmlFor="frosted-glass">{t('heaven.glass')}</Label><Switch id="frosted-glass" checked={c.surface==='glass'} onCheckedChange={glass=>onChange({...c,surface:glass?'glass':'solid'})}/></div><div className="flex flex-col gap-3"><Label htmlFor="frosted-shade">{t('heaven.shade')}</Label><Slider id="frosted-shade" value={[c.dim*100]} max={60} step={1} onValueChange={([n])=>onChange({...c,dim:n/100})}/></div><div className="flex flex-col gap-3"><Label htmlFor="frosted-frame">{t('heaven.framing')}</Label><Slider id="frosted-frame" value={[c.scenePosition]} max={100} step={1} onValueChange={([scenePosition])=>onChange({...c,scenePosition})}/></div></div>;
}
