import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Link2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  return <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-muted/30 text-foreground">
    <a href={embed.url} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 p-3 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <Link2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{invite.data?.guild?.name || embed.provider}</span>
        <span className="block truncate text-xs text-muted-foreground">{embed.url}</span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
    </a>
    {(embed.src || embed.inviteCode) && !loaded && <button type="button" onClick={() => setLoaded(true)} className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-border px-3 py-2 text-sm font-medium text-primary hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <Play className="h-4 w-4" aria-hidden="true" />{t('community.embeds.load', { provider: embed.provider, defaultValue: 'Load {{provider}} preview' })}
    </button>}
    {loaded && embed.src && <iframe src={embed.src} title={`${embed.provider} embed`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" className={embed.height ? 'block w-full border-0' : 'block aspect-video w-full border-0'} height={embed.height} />}
    {loaded && embed.inviteCode && <p className="border-t border-border p-3 text-sm text-muted-foreground" role="status">
      {invite.isPending ? t('community.embeds.loading', { defaultValue: 'Loading invite…' }) : invite.isError ? t('community.embeds.unavailable', { defaultValue: 'Preview unavailable. Open the link to view this invite.' }) : t('community.embeds.discordInvite', { count: invite.data?.approximate_member_count || 0, defaultValue: '{{count}} members · Open the invite to join on Discord.' })}
    </p>}
  </div>;
}
