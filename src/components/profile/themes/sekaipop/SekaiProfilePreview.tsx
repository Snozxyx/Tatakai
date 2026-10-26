import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import type { CSSProperties } from 'react';
import { ArrowUpRight, Diamond, Lock, UserCheck, UserPlus, X } from 'lucide-react';
import { CachedProfileImage } from '@/components/ui/cached-profile-image';
import { defaultSekaiConfig, readSekaiConfig } from '@/lib/profileThemes';
import type { ThemePreviewProps } from '../types';
import './sekaipop-preview.css';

export default function SekaiProfilePreview(props: ThemePreviewProps) {
  const config = readSekaiConfig(props.configuration) ?? defaultSekaiConfig();
  const dark = config.mode !== 'light';
  const style = { '--pv-ink': dark ? '#f0e9fa' : config.colors.ink, '--pv-outline': config.colors.ink,
    '--pv-a': config.colors.primary, '--pv-b': config.colors.secondary,
    '--pv-paper': dark ? '#30243d' : config.colors.paper, '--pv-ring': dark ? '#736080' : '#fffdf5' } as CSSProperties;
  return <article className="sp-preview" style={style} aria-label={`${props.name}'s profile card`}>
    <div className="sp-preview-paper">
      <div className="sp-preview-banner">{props.banner ? <CachedProfileImage src={props.banner} alt="" /> : <div className="sp-preview-banner-marks"><Diamond /><Diamond /><Diamond /></div>}<span>SekaiPop</span></div>
      <div className="sp-preview-top-actions">{props.moderation}<button type="button" aria-label="Close profile card" onClick={props.onClose}><X size={15} /></button></div>
      <div className="sp-preview-identity"><button type="button" className="sp-preview-avatar" aria-label={`Open ${props.name}'s profile`} onClick={props.onOpen}><CosmeticAvatar userId={props.userId} className="h-full w-full rounded-[inherit]">{props.avatar ? <CachedProfileImage src={props.avatar} alt="" /> : <span>{props.name.slice(0,1).toUpperCase()}</span>}</CosmeticAvatar></button><div><button type="button" className="sp-preview-name" disabled={!props.username} onClick={props.onOpen}><CosmeticName userId={props.userId}>{props.name}</CosmeticName></button><p>@{props.username || 'player'}</p></div></div>
      {props.badges.length > 0 && <div className="sp-preview-badges">{props.badges.slice(0,6).map(badge => <img key={badge.key} src={badge.image} alt={badge.label} title={badge.label} />)}</div>}
      {props.privateProfile ? <p className="sp-preview-private"><Lock size={13} />This profile is private.</p> : props.bio && <p className="sp-preview-bio">{props.bio}</p>}
      <dl className="sp-preview-keys"><div><dt>Followers</dt><dd>{props.followers ?? '—'}</dd></div><div><dt>Following</dt><dd>{props.following ?? '—'}</dd></div><div><dt>Watched</dt><dd>{props.canViewHistory && props.watchTimeSeconds !== undefined ? `${Math.floor(props.watchTimeSeconds / 3600)}h` : '—'}</dd></div></dl>
      {props.canViewHistory && <div className="sp-preview-lane"><span>{props.episodes ?? '—'} episodes</span><i /><Diamond size={11} /></div>}
      <div className="sp-preview-actions">{props.canFollow && <button type="button" disabled={props.followPending} onClick={props.onFollow}>{props.isFollowing ? <UserCheck size={15} /> : <UserPlus size={15} />}{props.isFollowing ? 'Following' : 'Follow'}</button>}<button type="button" className="sp-preview-enter" disabled={!props.username} onClick={props.onOpen}>Enter their world<ArrowUpRight size={15} /></button></div>
    </div>
  </article>;
}
