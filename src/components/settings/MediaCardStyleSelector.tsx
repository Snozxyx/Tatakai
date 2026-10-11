import { useMediaCardStyle } from '@/hooks/ui/useMediaCardStyle';
import { cn } from '@/lib/utils';

export function MediaCardStyleSelector() {
  const { style, setStyle } = useMediaCardStyle();
  return <fieldset className="mb-8 space-y-3">
    <legend className="text-base font-semibold">Media cards</legend>
    <p className="text-sm text-muted-foreground">One style for anime and manga across the app. Spotlight, anime rankings, and progress cards keep their own layouts.</p>
    <div className="grid grid-cols-2 gap-3">
      {(['poster', 'overlay'] as const).map(value => <label key={value}
        className={cn('cursor-pointer rounded-2xl border p-3 transition-[border-color,background-color] duration-150 focus-within:ring-2 focus-within:ring-ring', style === value ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/60')}>
        <input type="radio" name="media-card-style" value={value} checked={style === value} onChange={() => setStyle(value)} className="sr-only" />
        <div aria-hidden className="relative mx-auto mb-3 h-28 w-20 overflow-hidden rounded-xl bg-muted border border-border">
          <div className="absolute inset-x-0 top-0 h-20 bg-primary/20" />
          <div className={cn('absolute inset-x-2 bottom-2 space-y-1', value === 'overlay' && 'rounded bg-background/90 p-1')}>
            <div className="h-1.5 w-full rounded bg-foreground/60" /><div className="h-1 w-2/3 rounded bg-muted-foreground/40" />
          </div>
        </div>
        <span className="block text-sm font-semibold">{value === 'poster' ? 'Clean poster' : 'Cinematic overlay'}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{value === 'poster' ? 'Title and details below the artwork.' : 'Title and details over a dark gradient.'}</span>
      </label>)}
    </div>
  </fieldset>;
}
