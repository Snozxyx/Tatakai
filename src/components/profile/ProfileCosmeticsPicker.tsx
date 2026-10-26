import { useState } from 'react';
import { Check, Crown, Lock, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { CosmeticAccessBadges } from './CosmeticAccessBadges';
import { AvatarDecoration } from './AvatarDecoration';
import { ProfileBackgroundEffects } from './ProfileBackgroundEffects';
import { ProfileCosmeticEffect, ProfileNameplate } from './ProfileCosmeticEffect';
import { isFreeCosmetic, PREMIUM_BADGE_KEYS, AVATAR_DECORATIONS, PROFILE_COSMETIC_EFFECTS, PROFILE_NAMEPLATES, type AvatarDecorationKey, type ProfileCosmeticEffectKey, type ProfileNameplateKey } from '@/lib/profileCosmetics';
import { profileSurfaceStyle, type ProfileCustomization } from '@/lib/profileSettings';
import { cn } from '@/lib/utils';
import './profile-cosmetics-shop.css';

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
type Selection = { kind: 'avatarDecoration'; key: AvatarDecorationKey } | { kind: 'profileEffect'; key: ProfileCosmeticEffectKey } | { kind: 'nameplate'; key: ProfileNameplateKey };

export function ProfileCosmeticsPicker({ custom, name, avatarUrl, entitled, loading, onDecoration, onEffect, onNameplate }: ProfileCosmeticsPickerProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const preview = selection ? { ...custom, [selection.kind]: selection.key } : custom;
  const equipped = !selection || custom[selection.kind] === selection.key;
  const locked = !!selection && !isFreeCosmetic(selection.kind, selection.key) && !entitled;
  const chosen = selection ? [...AVATAR_DECORATIONS, ...PROFILE_COSMETIC_EFFECTS, ...PROFILE_NAMEPLATES].find(item => item.key === selection.key)?.label : 'Your equipped look';
  const portrait = <span className="cosmetics-portrait">{avatarUrl ? <img src={avatarUrl} alt="" /> : name[0] || 'U'}</span>;
  const apply = () => {
    if (!selection) return;
    if (selection.kind === 'avatarDecoration') onDecoration(selection.key);
    if (selection.kind === 'profileEffect') onEffect(selection.key);
    if (selection.kind === 'nameplate') onNameplate(selection.key);
  };
  const state = (kind: Selection['kind'], key: string) => <span className="cosmetics-item-state">{custom[kind] === key ? <><Check size={12} />Equipped</> : !isFreeCosmetic(kind, key) && !entitled ? <><Lock size={12} />Premium</> : 'Free for everyone'}</span>;
  const tile = (kind: Selection['kind'], key: string) => cn('cosmetics-product', selection?.kind === kind && selection.key === key && 'is-previewing');
  return <section className="cosmetics-shop">
    <div className="cosmetics-section-heading"><div><span className="cosmetics-eyebrow">THE FINISHING TOUCHES</span><h3>Made to stand out</h3><p>Try on a look. Take it everywhere you show up.</p></div><span className="cosmetics-access"><Crown size={14} />{loading ? 'Checking access…' : entitled ? 'Collection unlocked' : 'Free & premium collection'}</span></div>
    <div className="cosmetics-fitting-room">
      <div className="cosmetics-live-preview" style={profileSurfaceStyle(preview)}>
        <ProfileBackgroundEffects effect={preview.backgroundEffect} variant="widget" />
        <ProfileCosmeticEffect effect={preview.profileEffect} />
        <span className="cosmetics-preview-label"><Sparkles size={12} />LIVE PREVIEW</span>
        <div className="cosmetics-preview-identity"><span className="cosmetics-preview-avatar">{portrait}<AvatarDecoration decoration={preview.avatarDecoration} /></span><div><ProfileNameplate nameplate={preview.nameplate}><strong>{name}</strong></ProfileNameplate><p>This is how the world sees you.</p></div></div>
      </div>
      <div className="cosmetics-preview-action"><div><span className="cosmetics-eyebrow">{equipped ? 'YOUR CURRENT LOOK' : 'TRYING ON'}</span><h4>{chosen}</h4><p>{locked ? 'Equip with Premium Go, Pro, Ultra, or Admin access.' : 'Visible in your profile, navigation, posts, and comments.'}</p></div><Button disabled={loading || equipped || locked} onClick={apply}>{loading ? 'Please wait…' : equipped ? <><Check size={15} />Equipped</> : locked ? <><Lock size={15} />Premium required</> : 'Equip look'}</Button></div>
    </div>
    <Tabs defaultValue="decorations" className="cosmetics-catalog">
      <TabsList className="cosmetics-categories"><TabsTrigger value="decorations">Avatar frames <span>{AVATAR_DECORATIONS.length - 1}</span></TabsTrigger><TabsTrigger value="effects">Profile effects <span>{PROFILE_COSMETIC_EFFECTS.length - 1}</span></TabsTrigger><TabsTrigger value="nameplates">Nameplates <span>{PROFILE_NAMEPLATES.length - 1}</span></TabsTrigger></TabsList>
      <TabsContent value="decorations" className="cosmetics-product-grid">{AVATAR_DECORATIONS.map(item => <button key={item.key} type="button" className={tile('avatarDecoration', item.key)} aria-pressed={selection?.kind === 'avatarDecoration' && selection.key === item.key} onClick={() => setSelection({ kind: 'avatarDecoration', key: item.key })}><div className="cosmetics-product-art" style={{ '--cosmetic-color': item.colors[0] } as React.CSSProperties}><span className="cosmetics-product-avatar">{portrait}<AvatarDecoration decoration={item.key} /></span></div><div className="cosmetics-product-copy"><strong>{item.label}</strong><p>{item.description}</p></div><div className="cosmetics-product-footer">{state('avatarDecoration', item.key)}<CosmeticAccessBadges badgeKeys={isFreeCosmetic('avatarDecoration', item.key) ? [] : [...PREMIUM_BADGE_KEYS, 'admin']} /></div></button>)}</TabsContent>
      <TabsContent value="effects" className="cosmetics-product-grid">{PROFILE_COSMETIC_EFFECTS.map(item => <button key={item.key} type="button" className={tile('profileEffect', item.key)} aria-pressed={selection?.kind === 'profileEffect' && selection.key === item.key} onClick={() => setSelection({ kind: 'profileEffect', key: item.key })}><div className="cosmetics-product-art cosmetics-effect-art"><span className="cosmetics-effect-demo"><ProfileCosmeticEffect effect={item.key} animated={false} /><span className="cosmetics-demo-line" /><span className="cosmetics-product-avatar">{portrait}</span><span className="cosmetics-demo-line" /></span></div><div className="cosmetics-product-copy"><strong>{item.label}</strong><p>{item.description}</p></div><div className="cosmetics-product-footer">{state('profileEffect', item.key)}<CosmeticAccessBadges badgeKeys={isFreeCosmetic('profileEffect', item.key) ? [] : [...PREMIUM_BADGE_KEYS, 'admin']} /></div></button>)}</TabsContent>
      <TabsContent value="nameplates" className="cosmetics-product-grid">{PROFILE_NAMEPLATES.map(item => <button key={item.key} type="button" className={tile('nameplate', item.key)} aria-pressed={selection?.kind === 'nameplate' && selection.key === item.key} onClick={() => setSelection({ kind: 'nameplate', key: item.key })}><div className="cosmetics-product-art" style={{ '--cosmetic-color': item.accent } as React.CSSProperties}><ProfileNameplate nameplate={item.key}><strong>{name}</strong></ProfileNameplate></div><div className="cosmetics-product-copy"><strong>{item.label}</strong><p>A signature for every conversation.</p></div><div className="cosmetics-product-footer">{state('nameplate', item.key)}<CosmeticAccessBadges badgeKeys={isFreeCosmetic('nameplate', item.key) ? [] : [...PREMIUM_BADGE_KEYS, 'admin']} /></div></button>)}</TabsContent>
    </Tabs>
  </section>;
}
