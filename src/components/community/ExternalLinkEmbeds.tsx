import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Link2, Play, Music2, Video, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RichEmbedFrame } from './RichEmbedFrame';
import { extractExternalEmbeds, type ExternalEmbed } from '@/lib/community/externalLinks';

export function ExternalLinkEmbeds({ content, html = false }: { content: string; html?: boolean }) {
  const embeds = extractExternalEmbeds(content, html);
  if (!embeds.length) return null;
  return <div className="mt-3 space-y-3 whitespace-normal" onClick={event => event.stopPropagation()}>
    {embeds.map(embed => <ExternalLinkCard key={embed.src || embed.url} embed={embed} />)}
  </div>;
}

function ExternalLinkCard({ embed }: { embed: ExternalEmbed }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const invite = useQuery({
    queryKey: ['discord-invite-preview', embed.inviteCode],
    enabled: loaded && !!embed.inviteCode,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(embed.inviteCode!)}?with_counts=true`, { signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Invite unavailable');
      return response.json() as Promise<{ guild?: { name?: string }; approximate_member_count?: number }>;
    },
  });
  const playable = !!embed.src || !!embed.inviteCode;
  const Icon = embed.provider === 'Spotify' ? Music2 : embed.provider === 'YouTube' || embed.provider === 'Vimeo' ? Video : Link2;
  const url = new URL(embed.url);
  const displayUrl = url.hostname.replace(/^www\./, '') + (url.pathname === '/' ? '' : url.pathname);
  const youtubeId = embed.provider === 'YouTube' && embed.src ? new URL(embed.src).pathname.split('/').pop() : null;
  return <RichEmbedFrame>
    <div className="p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{embed.provider}</span>
        {loaded && playable && <button type="button" onClick={() => setLoaded(false)} aria-label={t('community.embeds.collapse', { defaultValue: 'Collapse preview' })} className="ml-auto -my-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><ChevronUp className="h-4 w-4" /></button>}
      </div>
      <a href={embed.url} target="_blank" rel="noopener noreferrer" className="group block rounded text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <span className="flex items-start gap-3 text-base font-semibold leading-snug">
          <span className="min-w-0 flex-1 break-words underline-offset-4 group-hover:underline">{invite.data?.guild?.name || t('community.embeds.providerLink', { provider: embed.provider, defaultValue: '{{provider}} link' })}</span>
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="mt-1.5 block truncate text-xs text-muted-foreground">{displayUrl}</span>
      </a>
    </div>
    {playable && !loaded && <button type="button" onClick={() => setLoaded(true)} className={youtubeId ? 'group relative flex aspect-video w-full items-center justify-center overflow-hidden border-t border-border/50 bg-background/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring' : 'flex min-h-24 w-full flex-col items-center justify-center gap-3 border-t border-border/50 bg-background/30 p-5 text-sm font-medium text-primary hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'}>
      {youtubeId && <img src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
      <span className="relative flex items-center gap-2 rounded-full bg-background/90 px-5 py-3 text-sm font-semibold text-foreground">
        <Play className="h-4 w-4" aria-hidden="true" />{t('community.embeds.load', { provider: embed.provider, defaultValue: 'Load {{provider}} preview' })}
      </span>
    </button>}
    {loaded && embed.src && <iframe src={embed.src} title={`${embed.provider} embed`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" className={embed.height ? 'block w-full border-0 border-t border-border/50' : 'block aspect-video w-full border-0 border-t border-border/50'} height={embed.height} />}
    {loaded && embed.inviteCode && <p className="flex items-center gap-2 border-t border-border/50 p-4 text-sm text-muted-foreground" role="status">
      {invite.isPending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
      {invite.isPending ? t('community.embeds.loading', { defaultValue: 'Loading invite…' }) : invite.isError ? t('community.embeds.unavailable', { defaultValue: 'Preview unavailable. Open the link to view this invite.' }) : t('community.embeds.discordInvite', { count: invite.data?.approximate_member_count || 0, defaultValue: '{{count}} members · Open the invite to join on Discord.' })}
    </p>}
  </RichEmbedFrame>;
}
