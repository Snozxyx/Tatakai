import { ArrowUpRight, Heart, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmpressName, EmpressPortrait } from './EmpressComponents';
import { EmpressScene } from './EmpressScene';
import { defaultEmpressConfig, readEmpressConfig } from './config';
import type { ThemePreviewProps } from '../types';
import './empress.css';
import './empress-cinematic.css';

export default function EmpressProfilePreview(props: ThemePreviewProps) {
  const config = readEmpressConfig(props.configuration) ?? defaultEmpressConfig();
  return <article className="ge-preview" aria-label={`${props.name}'s profile card`}>
    <div className="ge-preview-banner"><EmpressScene compact paused={!config.motion} /><span>@{props.username || 'wanderer'}</span></div><div className="ge-preview-top">{props.moderation}<Button variant="ghost" size="icon" aria-label="Close profile card" onClick={props.onClose}><X /></Button></div>
    <div className="ge-preview-content"><EmpressPortrait userId={props.userId} avatar={props.avatar} name={props.name} /><h2><EmpressName userId={props.userId} name={props.name} /></h2><p className="ge-handle">@{props.username || 'wanderer'}</p><div className="ge-badges">{props.badges.slice(0, 6).map(b => <img key={b.key} src={b.image} alt={b.label} title={b.label} />)}</div>{props.privateProfile ? <p className="ge-preview-bio"><Lock size={14} />This profile is private.</p> : props.bio && <p className="ge-preview-bio">{props.bio}</p>}
    <dl className="ge-preview-stats"><div><dd>{props.followers ?? '—'}</dd><dt>Followers</dt></div><div><dd>{props.following ?? '—'}</dd><dt>Following</dt></div><div><dd>{!props.privateProfile && props.canViewHistory && props.watchTimeSeconds !== undefined ? `${Math.floor(props.watchTimeSeconds / 3600)}h` : '—'}</dd><dt>Devotion</dt></div></dl><div className="ge-preview-actions">{props.canFollow && <Button variant="outline" disabled={props.followPending} onClick={props.onFollow}><Heart data-icon="inline-start" />{props.followPending ? 'Updating…' : props.isFollowing ? 'Following' : 'Follow'}</Button>}<Button className="ge-follow" disabled={!props.username} onClick={props.onOpen}>Enter the court<ArrowUpRight data-icon="inline-end" /></Button></div></div>
  </article>;
}

