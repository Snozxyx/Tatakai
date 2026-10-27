import { Eye } from 'lucide-react';
import { useReadingViewCount } from '@/hooks/user/useReadingViews';
import { readingViewId,type ReadingMediaKind } from '@/lib/readingViewId';
import { formatViewCount } from '@/hooks/user/useViews';
import { cn } from '@/lib/utils';
export function TatakaiReadingViews({kind,id,anilistId,detail=false,className}:{kind:ReadingMediaKind;id?:string|number;anilistId?:string|number;detail?:boolean;className?:string}){
  const {data}=useReadingViewCount(kind,readingViewId(id,anilistId));
  if(data==null)return null;
  return <span aria-label={`${data} Tatakai views`} title={`${data.toLocaleString()} Tatakai views`} className={cn('inline-flex items-center gap-1 tabular-nums',detail&&'gap-2 whitespace-nowrap rounded-full bg-muted px-3 py-1.5 text-sm font-medium',className)}><Eye aria-hidden className={detail?'size-4 shrink-0':'size-3 shrink-0'}/><span>{formatViewCount(data)}</span><span>{detail?'Tatakai views':'views'}</span></span>;
}
