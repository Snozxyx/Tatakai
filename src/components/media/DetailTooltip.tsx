import { useState, type ReactElement, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMangaTagOptions } from '@/core/content/manga-tag-search';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import uiI18n from '@/lib/uiI18n';
import { decodeHtmlEntities } from '@/lib/commentMarkup';
import './detail-tooltip.css';

export function DetailTooltip({ children, content, onOpenChange }: { children: ReactElement; content: ReactNode; onOpenChange?: (open: boolean) => void }) {
  return <Tooltip delayDuration={80} onOpenChange={onOpenChange}>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent sideOffset={8} collisionPadding={16} className="t-tt detail-tooltip" data-show="true">
      {content}
    </TooltipContent>
  </Tooltip>;
}

type DetailTagData = {
  name: string; description?: string | null; category?: string | null; rank?: number; source?: 'anilist' | 'mangabaka';
};

export function DetailTag({ tag, mediaType, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tag: DetailTagData; mediaType: 'anime' | 'manga' | 'novel';
}) {
  const [open, setOpen] = useState(false);
  const source = tag.source ?? 'anilist';
  const { data: taxonomy } = useQuery({
    queryKey: [source === 'anilist' ? 'anilist-media-tags' : 'mangabaka-tags'],
    queryFn: () => getMangaTagOptions(source),
    enabled: open && !tag.description,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const entry = taxonomy?.find(item => item.name.toLowerCase() === tag.name.toLowerCase());
  const rawDescription = tag.description || entry?.description;
  const description = rawDescription ? decodeHtmlEntities(rawDescription.replace(/<[^>]*>/g, '')) : '';
  const category = tag.category || entry?.category;
  return <DetailTooltip onOpenChange={setOpen} content={<div className="flex flex-col gap-1.5">
    <span className="font-medium">{tag.name}</span>
    {category && <span className="text-xs text-muted-foreground">{category}</span>}
    {description && <span className="text-xs leading-relaxed">{description}</span>}
    {typeof tag.rank === 'number' && <span className="text-xs text-muted-foreground">{uiI18n.t('detailUi.tagRelevance', { rank: tag.rank })}</span>}
    <span className="border-t border-border pt-1.5 text-xs text-muted-foreground">{uiI18n.t(`detailUi.browseTag.${mediaType}`)}</span>
  </div>}>
    <button {...props} type="button" className={cn('detail-hint-trigger', className)}>{children ?? tag.name}</button>
  </DetailTooltip>;
}
