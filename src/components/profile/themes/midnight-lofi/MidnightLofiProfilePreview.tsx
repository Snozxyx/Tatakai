import { ArrowUpRight, Lock, UserCheck, UserPlus, X } from 'lucide-react';
import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MidnightLofiScene } from './MidnightLofiScene';
import { defaultMidnightLofiConfig, readMidnightLofiConfig } from './config';
import type { ThemePreviewProps } from '../types';
import './midnight-lofi.css';
import './midnight-lofi-preview.css';

export default function MidnightLofiProfilePreview(props: ThemePreviewProps) {
  const config = readMidnightLofiConfig(props.configuration) ?? defaultMidnightLofiConfig();

  const watchHours = props.canViewHistory && props.watchTimeSeconds !== undefined
    ? `${Math.floor(props.watchTimeSeconds / 3600)}h`
    : undefined;

  return (
    <article className="mlp-preview" aria-label={`${props.name}'s Midnight Lo-Fi profile card`}>
      {/* Cinematic Lo-Fi Room Header */}
      <div className="mlp-scene-header">
        <MidnightLofiScene
          compact
          paused={!config.motion}
          scanlines={config.scanlines}
          japaneseAccents={config.japaneseAccents}
        />
        <div className="mlp-top-actions">
          <button
            type="button"
            aria-label="Close profile card"
            onClick={props.onClose}
            className="mlp-icon-btn"
          >
            <X size={15} />
          </button>
          {props.moderation && (
            <div className="mlp-moderation">
              {props.moderation}
            </div>
          )}
        </div>
      </div>

      {/* Profile Card Body */}
      <div className="mlp-content">
        <div className="mlp-identity">
          <button
            type="button"
            className="mlp-avatar-btn"
            aria-label={`Open ${props.name}'s profile`}
            onClick={props.onOpen}
          >
            <CosmeticAvatar userId={props.userId} className="h-full w-full rounded-full">
              <AvatarImage src={props.avatar} alt={props.name} className="object-cover" />
              <AvatarFallback className="bg-slate-900 text-lg font-bold text-slate-200">
                {props.name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </CosmeticAvatar>
          </button>
          <div className="mlp-identity-info">
            <button
              type="button"
              className="mlp-name-btn"
              disabled={!props.username}
              onClick={props.onOpen}
            >
              <CosmeticName userId={props.userId}>{props.name}</CosmeticName>
            </button>
            <p className="mlp-handle">@{props.username || 'user'}</p>
          </div>
        </div>

        {/* Badges */}
        {props.badges.length > 0 && (
          <div className="mlp-badges" aria-label="Badges">
            {props.badges.slice(0, 6).map(badge => (
              <img
                key={badge.key}
                src={badge.image}
                alt={badge.label}
                title={badge.label}
                loading="lazy"
              />
            ))}
          </div>
        )}

        {/* Bio / Private status */}
        {props.privateProfile ? (
          <p className="mlp-private">
            <Lock size={13} />
            <span>This profile is private.</span>
          </p>
        ) : (
          props.bio && <p className="mlp-bio">{props.bio}</p>
        )}

        {/* Frosted Pill Stats Grid (Animanga style) */}
        <div className="mlp-stats-grid">
          <div className="mlp-pill-chip">
            <div className="mlp-pill-data">
              <span className="mlp-pill-label">Followers</span>
              <span className="mlp-pill-val">{props.followers ?? '—'}</span>
            </div>
          </div>
          <div className="mlp-pill-chip">
            <div className="mlp-pill-data">
              <span className="mlp-pill-label">Following</span>
              <span className="mlp-pill-val">{props.following ?? '—'}</span>
            </div>
          </div>
          {props.canViewHistory && (
            <>
              <div className="mlp-pill-chip">
                <div className="mlp-pill-data">
                  <span className="mlp-pill-label">Episodes</span>
                  <span className="mlp-pill-val">{props.episodes ?? '—'}</span>
                </div>
                <span className="mlp-pill-arrow">
                  <ArrowUpRight size={12} strokeWidth={2.5} />
                </span>
              </div>
              <div className="mlp-pill-chip">
                <div className="mlp-pill-data">
                  <span className="mlp-pill-label">Watch Time</span>
                  <span className="mlp-pill-val">{watchHours ?? '—'}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons (Image 2 style solid white pill & frosted secondary) */}
        <div className="mlp-actions">
          {props.canFollow && (
            <button
              type="button"
              className="mlp-btn-secondary"
              disabled={props.followPending}
              onClick={props.onFollow}
            >
              {props.isFollowing ? (
                <>
                  <UserCheck size={14} />
                  <span>Following</span>
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  <span>Follow</span>
                </>
              )}
            </button>
          )}
          <button
            type="button"
            className="mlp-btn-white-pill"
            disabled={!props.username}
            onClick={props.onOpen}
          >
            <span>Enter Room</span>
            <span className="mlp-arrow-circle">
              <ArrowUpRight size={14} strokeWidth={2.5} />
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}
