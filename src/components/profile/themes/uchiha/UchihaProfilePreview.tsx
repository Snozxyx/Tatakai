import { ArrowUpRight, Lock, UserCheck, UserPlus, X } from 'lucide-react';
import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UchihaCrows } from './UchihaCrows';
import { UchihaBannerMark } from './UchihaBannerMark';
import { UchihaScene } from './UchihaScene';
import type { ThemePreviewProps } from '../types';
import './uchiha-preview.css';

export default function UchihaProfilePreview(props: ThemePreviewProps) {
  return <article className="uchiha-preview" aria-label={`${props.name}'s Uchiha profile card`}>
    <div className="up-scene" aria-hidden="true"><UchihaScene compact /><UchihaBannerMark /></div>
    <UchihaCrows variant="widget" />
    <div className="up-top-actions"><button type="button" aria-label="Close profile card" onClick={props.onClose}><X size={16} /></button><span>{props.moderation}</span></div>
    <div className="up-content">
      <div className="up-identity"><button className="up-avatar" type="button" aria-label={`Open ${props.name}'s profile`} onClick={props.onOpen}><CosmeticAvatar userId={props.userId} className="h-full w-full rounded-[inherit]"><AvatarImage src={props.avatar} className="object-cover" /><AvatarFallback className="up-avatar-initial rounded-[inherit]">{props.name.slice(0, 1).toUpperCase()}</AvatarFallback></CosmeticAvatar></button><div><button type="button" className="up-name" disabled={!props.username} onClick={props.onOpen}><CosmeticName userId={props.userId}>{props.name}</CosmeticName></button><p>@{props.username || 'user'}</p></div></div>
      {props.badges.length > 0 && <div className="up-badges">{props.badges.map(badge => <img key={badge.key} src={badge.image} alt={badge.label} title={badge.label} />)}</div>}
      {props.privateProfile ? <p className="up-private"><Lock size={14} />This profile is private.</p> : props.bio && <p className="up-bio">{props.bio}</p>}
      <dl className="up-stats"><div><dt>Followers</dt><dd>{props.followers ?? '—'}</dd></div><div><dt>Following</dt><dd>{props.following ?? '—'}</dd></div>{props.canViewHistory && <div><dt>Watch time</dt><dd>{props.watchTimeSeconds === undefined ? '—' : `${Math.floor(props.watchTimeSeconds / 3600)}h`}</dd></div>}</dl>
      <div className="up-actions">{props.canFollow && <button type="button" className="up-follow" disabled={props.followPending} onClick={props.onFollow}>{props.isFollowing ? <UserCheck size={15} /> : <UserPlus size={15} />}{props.isFollowing ? 'Following' : 'Follow'}</button>}<button type="button" disabled={!props.username} onClick={props.onOpen}>View profile<ArrowUpRight size={15} /></button></div>
    </div>
  </article>;
}
