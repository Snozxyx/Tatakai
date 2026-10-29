import { useTranslation } from 'react-i18next';
import { useMangaReadlist } from '@/hooks/user/useMangaReadlist';
import { useNovelReadlist } from '@/hooks/user/useNovelReadlist';
import { ThemeCollection } from './themes/ProfileThemeDetails';
import type { ThemeMediaItem } from './themes/types';
export function ReadingCollections(){
 const {t}=useTranslation();const manga=useMangaReadlist();const novels=useNovelReadlist();
 const items:ThemeMediaItem[]=[...(manga.data??[]).filter(item=>item.format!=='novel').map(item=>({id:item.id,title:item.manga_title,image:item.manga_poster||'',href:`/manga/${encodeURIComponent(item.manga_id)}`,kind:'manga',status:item.status})),...(novels.data??[]).map(item=>({id:item.id,title:item.manga_title,image:item.manga_poster||'',href:`/novel/${encodeURIComponent(item.manga_id)}`,kind:'novels',status:item.status}))];
 return <section className="mt-14 rounded-3xl border border-border bg-card p-5 sm:p-7" style={{'--pt-ink':'hsl(var(--foreground))','--pt-muted':'hsl(var(--muted-foreground))','--pt-primary':'hsl(var(--primary))','--pt-tonal':'hsl(var(--muted))','--pt-panel':'hsl(var(--card))','--pt-border':'hsl(var(--border))'} as React.CSSProperties}><h2 className="text-2xl font-bold">{t('profileExtras.savedManga')} & {t('profileExtras.savedNovels')}</h2>{manga.isError||novels.isError?<p role="alert" className="mt-3 text-sm text-muted-foreground">{t('profileExtras.loadError')}</p>:<ThemeCollection items={items} loading={manga.isLoading||novels.isLoading}/>}</section>;
}
