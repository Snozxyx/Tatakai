import { useMobileConfig } from '@/hooks/ui/useMobileConfig';
import { cn } from '@/lib/utils';

export function MobileAppearanceSelector() {
  const { config, updateConfig } = useMobileConfig();
  return (
    <fieldset className="mb-8 space-y-3">
      <legend className="text-base font-semibold">Mobile appearance</legend>
      <p className="text-sm text-muted-foreground">Choose the look of Tatakai on phones and tablets, in the app and browser.</p>
      <div className="grid grid-cols-2 gap-3">
        {([
          ['refreshed', 'Refreshed', 'Cinematic spotlight, glass header, and consistent posters.'],
          ['classic', 'Classic', 'The original hero, header, and poster layout.'],
        ] as const).map(([value, title, description]) => (
          <label key={value} className={cn('relative cursor-pointer rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring', config.mobileLayout === value ? 'border-primary bg-primary/10' : 'border-border bg-muted/30')}>
            <input type="radio" name="mobile-appearance" value={value} checked={config.mobileLayout === value}
              onChange={() => updateConfig({ mobileLayout: value })} className="sr-only" />
            <span className="block text-sm font-semibold">{title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
