import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { ArrowUpRight, Lock, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CachedProfileImage } from '@/components/ui/cached-profile-image';
import { cn } from '@/lib/utils';
import type { ThemeMediaItem } from '../types';

/**
 * Ultra-translucent Frosted Glass Card (inspired by Image 2 - Animanga Heaven)
 * High diffusion blur, crisp hairline reflection, deep ambient shadow.
 */
export const FrostedCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative isolate overflow-hidden rounded-[28px] border border-white/15 bg-slate-950/45 backdrop-blur-2xl shadow-2xl shadow-black/40',
        'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
FrostedCard.displayName = 'FrostedCard';

export interface PillStatProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  arrow?: boolean;
  icon?: ReactNode;
  sub?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Translucent frosted pill stat chip
 */
export function PillStat({
  label,
  value,
  highlight = false,
  arrow = false,
  icon,
  sub,
  onClick,
  className,
}: PillStatProps) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative flex items-center justify-between gap-3 rounded-full border border-white/10 px-4 py-2.5 transition-all duration-200 backdrop-blur-xl',
        highlight
          ? 'bg-amber-400/15 border-amber-400/30 text-amber-100 hover:bg-amber-400/25'
          : 'bg-white/[0.06] text-slate-200 hover:bg-white/[0.12] hover:border-white/20',
        onClick && 'cursor-pointer active:scale-95',
        className
      )}
    >
      <div className="flex flex-col items-start leading-tight">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
          {label}
        </span>
        <div className="flex items-baseline gap-1.5 font-bold">
          <span className="text-base font-semibold tracking-tight text-white">{value}</span>
          {sub && <span className="text-[11px] text-slate-300 font-normal">{sub}</span>}
        </div>
      </div>
      {arrow && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-950 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shadow-sm">
          <ArrowUpRight size={13} strokeWidth={2.5} />
        </span>
      )}
      {icon && !arrow && (
        <span className="text-slate-300 transition-colors group-hover:text-white">
          {icon}
        </span>
      )}
    </Component>
  );
}

/**
 * Tactile White Pill Button (Directly from Image 2 - Animanga Heaven)
 */
export function WhitePillButton({
  label,
  onClick,
  disabled = false,
  className,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-full bg-white px-5 py-2.5 text-slate-950 font-bold text-xs tracking-tight shadow-xl shadow-black/25 transition-all duration-200 hover:bg-slate-50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      <span>{label}</span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-950 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
        <ArrowUpRight size={13} strokeWidth={2.5} />
      </span>
    </button>
  );
}

export function LofiPortrait({
  userId,
  avatar,
  name,
  size = 'md',
  className,
}: {
  userId?: string;
  avatar?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-12 w-12',
    md: 'h-20 w-20 ring-2 ring-white/25 shadow-xl shadow-black/40',
    lg: 'h-28 w-28 ring-2 ring-white/30 shadow-2xl shadow-black/50',
  }[size];

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <CosmeticAvatar userId={userId} className={cn('rounded-full bg-slate-900', sizeClasses)}>
        <AvatarImage src={avatar} alt={name} className="object-cover" />
        <AvatarFallback className="bg-slate-800 text-lg font-bold text-slate-200">
          {name.slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </CosmeticAvatar>
    </div>
  );
}

export function LofiNameDisplay({ userId, name, className }: { userId?: string; name: string; className?: string }) {
  return (
    <span className={cn('font-bold tracking-tight text-white', className)}>
      <CosmeticName userId={userId}>{name}</CosmeticName>
    </span>
  );
}

export function LofiMediaCard({ item }: { item: ThemeMediaItem }) {
  return (
    <Link
      to={item.href}
      className="group relative flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/40 p-2.5 backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:border-white/25 hover:bg-slate-950/60 hover:shadow-xl hover:shadow-black/50"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[15px] bg-slate-900/60">
        {item.image ? (
          <CachedProfileImage
            src={item.image}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-900 text-slate-600">
            <Sparkles size={24} />
          </div>
        )}
        {item.status && (
          <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/75 px-2.5 py-0.5 text-[10px] font-medium text-amber-200 backdrop-blur-md border border-white/15">
            {item.status}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex flex-col px-1 pb-1">
        <h4 className="line-clamp-1 text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">
          {item.title}
        </h4>
        {item.detail && (
          <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
            {item.detail}
          </span>
        )}
      </div>
    </Link>
  );
}

export function LofiEmpty({ children, privateState = false }: { children: ReactNode; privateState?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[28px] border border-dashed border-white/15 bg-white/[0.03] backdrop-blur-xl py-14 px-6 text-center text-slate-300">
      {privateState ? <Lock size={20} className="text-slate-400" /> : <Sparkles size={20} className="text-amber-400/70" />}
      <p className="text-sm max-w-sm">{children}</p>
    </div>
  );
}
