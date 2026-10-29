import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, MonitorPlay, SlidersHorizontal, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSocialPresence } from '@/hooks/community/useSocialActivity';
import { ProfileWidgetCard } from '@/components/profile/ProfileWidgetCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CachedProfileImage } from '@/components/ui/cached-profile-image';
import { Button } from '@/components/ui/button';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { Skeleton } from '@/components/ui/skeleton';
import { safeActivityHref, type SocialPresence } from '@/lib/socialActivity';
import './friends-activity.css';

function ActivityList({ people, reading }: { people: SocialPresence[]; reading?: boolean }) {
  const Icon = reading ? BookOpen : MonitorPlay;
  return <div className="friends-activity-column">
    <div className="friends-activity-column-heading"><h3><Icon size={16} />{reading ? 'Reading' : 'Watching'}</h3><span>{people.length}</span></div>
    {people.length ? <ul>{people.slice(0, 6).map(person => <li key={person.user_id} className="friends-activity-item">
      <Link to={safeActivityHref(person.href) || '/community'} className="friends-activity-cover" aria-label={`${person.kind === 'watching' ? 'Watching' : 'Reading'} ${person.title}`}>
        {person.image ? <CachedProfileImage src={person.image} alt="" loading="lazy" /> : <Icon size={21} />}
      </Link>
      <div className="friends-activity-item-copy"><Link to={safeActivityHref(person.href) || '/community'} className="friends-activity-title">{person.title}</Link>
        <ProfileWidgetCard userId={person.user_id} username={person.username} displayName={person.display_name} avatarUrl={person.avatar_url}>
          <button type="button" className="friends-activity-person"><Avatar className="h-5 w-5"><AvatarImage src={person.avatar_url || undefined} /><AvatarFallback>{(person.display_name || person.username || '?')[0]}</AvatarFallback></Avatar><span>{person.display_name || person.username || 'Member'}</span><i aria-hidden="true" /></button>
        </ProfileWidgetCard>
        <p className="friends-activity-detail">{reading ? person.kind === 'novel' ? 'Novel' : 'Manga' : 'Anime'}{person.detail ? ` · ${person.detail}` : ''}</p>
      </div><ChevronRight size={15} className="friends-activity-item-arrow" aria-hidden="true" />
    </li>)}</ul> : <div className="friends-activity-empty"><span className="friends-activity-empty-symbol"><Icon size={20} /></span><div><p>Nothing shared yet</p><span>{reading ? 'Manga and novels your friends share will appear here.' : 'Anime your friends share will appear here.'}</span></div></div>}
  </div>;
}

export function FriendsActivity() {
  const { user } = useAuth();
  const { openSettings } = useSettingsModal();
  const { data = [], isLoading, isError, refetch } = useSocialPresence([], true);
  if (!user) return null;
  const active = data.filter(person => person.online && person.title && safeActivityHref(person.href));
  return <section className="friends-activity" aria-labelledby="friends-activity-title">
    <div className="friends-activity-heading"><div><h2 id="friends-activity-title"><Users size={21} />Friends activity{active.length > 0 && <span className="friends-activity-live"><i />{active.length} sharing now</span>}</h2><p>A little closer to what your people love.</p></div><Button variant="ghost" size="sm" onClick={() => openSettings('privacy', 'social-activity')}><SlidersHorizontal size={14} /><span>Activity privacy</span></Button></div>
    <div className="friends-activity-panel">
      {isLoading ? <div className="friends-activity-loading" aria-label="Loading friends activity"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
        : isError ? <div className="friends-activity-error"><p>Friends activity couldn’t load.</p><Button size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button></div>
          : <div className="friends-activity-columns"><ActivityList people={active.filter(person => person.kind === 'watching')} /><ActivityList reading people={active.filter(person => person.kind === 'manga' || person.kind === 'novel')} /></div>}
      <footer className="friends-activity-footer"><p>From your followers and people you follow. Only shared activity appears.</p><Link to="/community">Find your people<ChevronRight size={13} /></Link></footer>
    </div>
  </section>;
}
