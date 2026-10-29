import { Link } from 'react-router-dom';
import { BookOpen, MonitorPlay } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useSocialPresence } from '@/hooks/community/useSocialActivity';
import { safeActivityHref } from '@/lib/socialActivity';

/** One shared status component for full profiles and profile widgets, across themes. */
export function ProfilePresence({ userId, enabled = true }: { userId?: string | null; enabled?: boolean }) {
  const { data } = useSocialPresence(userId ? [userId] : [], false, enabled);
  const presence = data?.[0];
  if (!presence) return null;
  const href = safeActivityHref(presence.href);
  const Icon = presence.kind === 'watching' ? MonitorPlay : BookOpen;
  const seen = presence.last_seen ? Date.parse(presence.last_seen) : NaN;
  return <div className="profile-presence min-w-0 space-y-1 text-xs text-muted-foreground" aria-live="polite">
    {presence.online ? <p className="presence-status flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />Online</p>
      : Number.isFinite(seen) ? <p>Last online {formatDistanceToNow(new Date(seen), { addSuffix: true })}</p> : null}
    {presence.online && presence.kind && presence.title && href && <Link to={href} className="flex max-w-full items-center gap-1.5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{presence.kind === 'watching' ? 'Watching' : 'Reading'} {presence.title}{presence.detail ? ` · ${presence.detail}` : ''}</span>
    </Link>}
  </div>;
}
