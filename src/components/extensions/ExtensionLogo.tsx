import { useState } from 'react';
import { cn } from '@/lib/utils';
import { lettermark } from './store/extensionVisuals';
import type { CompatibilityPackage } from '@/core/extensions/compatibility/client';

const failures = new Map<string, number>();
function imageAddress(value?: string) {
  if (!value) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(value)) return value;
  try { const url = new URL(value); return (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) || (url.protocol === 'blob:' && url.origin === location.origin) ? url.href : undefined; } catch { return undefined; }
}
export function compatibilityPackageIcon(pkg: CompatibilityPackage) {
  if (pkg.icon) return pkg.icon;
  if ((pkg.ecosystem === 'aniyomi' || pkg.ecosystem === 'mihon') && /^[\w.]+$/.test(pkg.pkgName || pkg.id)) {
    try { const repo = new URL(pkg.repository); if (repo.protocol === 'https:') return new URL(`icon/${pkg.pkgName || pkg.id}.png`, repo).href; } catch { }
  }
}
/** Failed remote artwork is shared across cards so rerenders do not retry it. */
export function ExtensionLogo({ name, src, className }: { name: string; src?: string; className?: string }) {
  const address = imageAddress(src);
  const [failed, setFailed] = useState<string>();
  const cachedFailure = address && Date.now() - (failures.get(address) || 0) < 10 * 60 * 1000;
  return <div className={cn('relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted font-semibold text-muted-foreground', className)} aria-hidden="true">
    <span>{lettermark(name)}</span>
    {address && failed !== address && !cachedFailure && <img src={address} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-contain" onError={() => { if (failures.size >= 512) failures.delete(failures.keys().next().value!); failures.set(address, Date.now()); setFailed(address); }} />}
  </div>;
}
