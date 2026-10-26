import { MIDNIGHT_LOFI_ROOM } from './config';
import type { ThemeLoadingProps } from '../types';
import './midnight-lofi.css';

export function MidnightLofiLoading({ owner }: ThemeLoadingProps) {
  const name = owner?.display_name || owner?.username || 'user';
  return (
    <div
      className="ml-profile flex flex-col items-center justify-center min-h-screen text-center px-4 relative overflow-hidden"
      role="status"
      aria-live="polite"
    >
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 filter blur-md pointer-events-none"
        style={{ backgroundImage: `url(${MIDNIGHT_LOFI_ROOM})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-slate-950/80 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center">
        <span className="text-xs uppercase tracking-widest text-amber-400 font-bold mb-2">
          {owner?.username ? `@${owner.username}` : 'TATAKAI'}
        </span>
        <h2 className="text-2xl font-bold text-white mb-2">
          Entering {name}&apos;s veranda…
        </h2>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Listening to the summer sea breeze</span>
        </div>
      </div>
    </div>
  );
}
