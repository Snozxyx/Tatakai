import { Crown, Lock } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AvatarDecoration } from './AvatarDecoration';
import { ProfileBackgroundEffects } from './ProfileBackgroundEffects';
import { ProfileCosmeticEffect, ProfileNameplate } from './ProfileCosmeticEffect';
import { AVATAR_DECORATIONS, PROFILE_COSMETIC_EFFECTS, PROFILE_NAMEPLATES, type AvatarDecorationKey, type ProfileCosmeticEffectKey, type ProfileNameplateKey } from '@/lib/profileCosmetics';
import { profileSurfaceStyle, type ProfileCustomization } from '@/lib/profileSettings';
import { cn } from '@/lib/utils';

interface ProfileCosmeticsPickerProps {
  custom: ProfileCustomization;
  name: string;
  avatarUrl?: string | null;
  entitled: boolean;
  loading: boolean;
  onDecoration: (key: AvatarDecorationKey) => void;
  onEffect: (key: ProfileCosmeticEffectKey) => void;
  onNameplate: (key: ProfileNameplateKey) => void;
}

export function ProfileCosmeticsPicker({ custom, name, avatarUrl, entitled, loading, onDecoration, onEffect, onNameplate }: ProfileCosmeticsPickerProps) {
  const portrait = <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-primary/20 text-lg font-semibold text-foreground">{avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : name[0] || 'U'}</span>;
  const tile = (active: boolean) => cn('relative flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-xl border px-2 py-4 text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed', active ? 'border-primary bg-primary/10' : 'border-white/[0.08] bg-white/[0.02] enabled:hover:bg-white/[0.05]');
  return (
    <section className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground"><Crown className="h-4 w-4 text-amber-200" /> Profile Cosmetics</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{loading ? 'Checking your badge access…' : entitled ? 'Your premium collection is unlocked. Mix frames, effects, and nameplates.' : 'Preview the collection. Equip with a Premium Go, Pro, or Ultra badge, or admin access.'}</p>
      <div className="profile-cosmetics-preview relative isolate overflow-hidden rounded-2xl border p-6" style={profileSurfaceStyle(custom)}>
        <ProfileBackgroundEffects effect={custom.backgroundEffect} variant="widget" />
        <ProfileCosmeticEffect effect={custom.profileEffect} />
        <div className="relative z-10 flex items-center gap-5">
          <span className="relative block h-20 w-20 shrink-0">{portrait}<AvatarDecoration decoration={custom.avatarDecoration} /></span>
          <div className="min-w-0">
            <ProfileNameplate nameplate={custom.nameplate}><span className="font-semibold">{name}</span></ProfileNameplate>
            <p className="mt-2 text-xs text-muted-foreground">Your profile preview</p>
          </div>
        </div>
      </div>
      <Tabs defaultValue="decorations" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-3 bg-black/15 p-1">
          <TabsTrigger value="decorations" className="px-1 py-2 text-[11px]">Avatar Frames</TabsTrigger>
          <TabsTrigger value="effects" className="px-1 py-2 text-[11px]">Profile Effects</TabsTrigger>
          <TabsTrigger value="nameplates" className="px-1 py-2 text-[11px]">Nameplates</TabsTrigger>
        </TabsList>
        <TabsContent value="decorations" className="mt-4 grid grid-cols-3 gap-2.5">
          {AVATAR_DECORATIONS.map(decoration => <button key={decoration.key} type="button" aria-label={decoration.label} disabled={decoration.key !== 'none' && !entitled} aria-pressed={custom.avatarDecoration === decoration.key} title={decoration.description} onClick={()=>onDecoration(decoration.key)} className={tile(custom.avatarDecoration === decoration.key)}>
            {decoration.key !== 'none' && !entitled && <Lock className="absolute right-2 top-2 h-3 w-3 text-amber-200" />}
            <span className="relative block h-14 w-14 shrink-0">{portrait}<AvatarDecoration decoration={decoration.key} /></span>
            <span className="text-[11px] font-semibold">{decoration.label}</span>
          </button>)}
        </TabsContent>
        <TabsContent value="effects" className="mt-4 grid grid-cols-2 gap-2.5">
          {PROFILE_COSMETIC_EFFECTS.map(effect => <button key={effect.key} type="button" aria-label={effect.label} disabled={effect.key !== 'none' && !entitled} aria-pressed={custom.profileEffect === effect.key} title={effect.description} onClick={()=>onEffect(effect.key)} className={tile(custom.profileEffect === effect.key)}>
            <span className="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-lg bg-black/20"><ProfileCosmeticEffect effect={effect.key} animated={false} /><Crown className="h-5 w-5 text-muted-foreground" /></span>
            {effect.key !== 'none' && !entitled && <Lock className="absolute right-2 top-2 z-30 h-3 w-3 text-amber-200" />}
            <span className="text-[11px] font-semibold">{effect.label}</span>
          </button>)}
        </TabsContent>
        <TabsContent value="nameplates" className="mt-4 grid grid-cols-2 gap-2.5">
          {PROFILE_NAMEPLATES.map(plate => <button key={plate.key} type="button" aria-label={plate.label} disabled={plate.key !== 'none' && !entitled} aria-pressed={custom.nameplate === plate.key} onClick={()=>onNameplate(plate.key)} className={tile(custom.nameplate === plate.key)}>
            {plate.key !== 'none' && !entitled && <Lock className="absolute right-2 top-2 h-3 w-3 text-amber-200" />}
            <ProfileNameplate nameplate={plate.key}><span className="text-xs">{name}</span></ProfileNameplate>
            <span className="text-[11px] font-semibold">{plate.label}</span>
          </button>)}
        </TabsContent>
      </Tabs>
    </section>
  );
}
