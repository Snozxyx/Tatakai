import { useEffect, useState, type MouseEvent } from 'react';
import { BookOpen, Download, FolderOpen, MoreHorizontal, Play, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function OfflineMediaCard({ title, poster, count, kind = 'anime', onOpen, onRepair, onReveal, onDelete }: {
  title: string; poster?: string | null; count: number; kind?: string;
  onOpen: () => void; onRepair?: (event: MouseEvent) => void; onReveal?: (event: MouseEvent) => void; onDelete: (event: MouseEvent) => void;
}) {
  const [failedPoster, setFailedPoster] = useState(false);
  useEffect(() => { setFailedPoster(false); }, [poster]);
  const comic = kind !== 'anime';
  const ActionIcon = comic ? BookOpen : Play;
  return <article className="group min-w-0 space-y-2.5">
    <button type="button" onClick={onOpen} aria-label={`${comic ? 'Read' : 'Watch'} ${title}`} className="relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-muted text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
      {poster && !failedPoster ? <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailedPoster(true)} /> : <div className="flex h-full items-center justify-center text-muted-foreground"><Download className="h-8 w-8" /></div>}
      <span className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><ActionIcon className="h-4 w-4" /></span>
    </button>
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1"><h3 className="line-clamp-2 text-sm font-semibold leading-snug">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{count} {comic ? count === 1 ? 'chapter' : 'chapters' : count === 1 ? 'episode' : 'episodes'}{comic ? ` · ${kind}` : ' · Offline'}</p></div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Options for ${title}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onRepair && <DropdownMenuItem onClick={onRepair}><Wrench className="mr-2 h-4 w-4" />Repair poster and subtitles</DropdownMenuItem>}
          {onReveal && <DropdownMenuItem onClick={onReveal}><FolderOpen className="mr-2 h-4 w-4" />Open folder</DropdownMenuItem>}
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Delete downloads</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </article>;
}
