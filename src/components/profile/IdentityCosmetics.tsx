import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useIdentityCosmetics } from '@/hooks/user/useIdentityCosmetics';
import { AvatarDecoration } from './AvatarDecoration';
import { ProfileCosmeticEffect, ProfileNameplate } from './ProfileCosmeticEffect';

/** Keeps Radix trigger events/ref on the outer surface and jewelry outside the clipped portrait. */
export const CosmeticAvatar = forwardRef<ElementRef<typeof Avatar>, ComponentPropsWithoutRef<typeof Avatar> & { userId?: string | null }>(
  ({ userId, className, children, ...props }, ref) => {
    const custom = useIdentityCosmetics(userId);
    return <span ref={ref} {...props} className={cn('relative inline-flex h-10 w-10 shrink-0 isolate rounded-full', className)}>
      <Avatar className="h-full w-full rounded-[inherit]">{children}</Avatar>
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"><ProfileCosmeticEffect effect={custom.profileEffect} animated={false} /></span>
      <AvatarDecoration decoration={custom.avatarDecoration} />
    </span>;
  },
);
CosmeticAvatar.displayName = 'CosmeticAvatar';

export function CosmeticName({ userId, children }: { userId?: string | null; children: ReactNode }) {
  const custom = useIdentityCosmetics(userId);
  return <ProfileNameplate nameplate={custom.nameplate}>{children}</ProfileNameplate>;
}
