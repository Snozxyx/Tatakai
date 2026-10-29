import { ArrowUpRight, Heart, X } from 'lucide-react';
import type { ThemePreviewProps } from '../types';
import './reference-worlds.css';
export default function ReferenceWorldPreview(p: ThemePreviewProps) {
  return <section className="rw-preview"><img src={p.avatar || '/assets/profile-themes/sakura-letter/kaoruko-hq.jpg'} alt="" /><button type="button" aria-label="Close preview" onClick={p.onClose}><X size={18} /></button><h2>{p.name}</h2><p>@{p.username}</p><p>{p.privateProfile ? 'Private profile' : p.bio}</p><span>{p.followers ?? 0} followers</span><div><button type="button" onClick={p.onOpen}>View profile <ArrowUpRight size={16} /></button>{p.canFollow && <button type="button" disabled={p.followPending} onClick={p.onFollow}><Heart size={16} />{p.isFollowing ? 'Following' : 'Follow'}</button>}</div>{p.moderation}</section>;
}
