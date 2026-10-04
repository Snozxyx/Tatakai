import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { cn } from '@/lib/utils';

/**
 * "Open in app" — fires the `tatakai://` deep link so the desktop app opens the
 * same route the user is viewing on the web. The desktop main process
 * (desktop/window/deep-link.cjs) strips the scheme, sanitizes the path, and
 * sends a `navigate` event the renderer's DeepLinkHandler routes to — so
 * `tatakai://watch/<id>?...` lands on the exact same page.
 *
 * Hidden inside the app itself (native/desktop). If the protocol isn't
 * registered (app not installed), the page stays visible after the click, so
 * after a short grace period we send the user to the download page.
 *
 * `path`/`search` default to the current location; pass explicit values to link
 * to a different route than the one being viewed.
 */
export function OpenInAppButton({
  path,
  search,
  label = 'Open in app',
  variant = 'outline',
  size = 'sm',
  className,
}: {
  path?: string;
  search?: string;
  label?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  className?: string;
}) {
  const isNative = useIsNativeApp();
  const location = useLocation();
  const [launching, setLaunching] = useState(false);

  const openInApp = useCallback(() => {
    const rawPath = (path ?? location.pathname).replace(/^\/+/, '');
    const rawSearch = search ?? location.search ?? '';
    const deepLink = `tatakai://${rawPath}${rawSearch}`;

    setLaunching(true);

    // If the protocol handler exists, the browser blurs/hides this tab when the
    // app takes focus. If we're still visible after the grace period, assume the
    // app isn't installed and route to the download page.
    let handled = false;
    const onBlur = () => { handled = true; };
    window.addEventListener('blur', onBlur, { once: true });
    document.addEventListener('visibilitychange', onBlur, { once: true });

    try {
      window.location.href = deepLink;
    } catch {
      /* protocol not registered — fall through to the download redirect */
    }

    window.setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
      setLaunching(false);
      if (!handled && document.visibilityState === 'visible') {
        window.location.href = '/download';
      }
    }, 1500);
  }, [path, search, location.pathname, location.search]);

  if (isNative) return null;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={openInApp}
      disabled={launching}
      className={cn('gap-2', className)}
      title="Open this page in the Tatakai desktop app"
    >
      <ExternalLink className="h-4 w-4" />
      {label}
    </Button>
  );
}

export default OpenInAppButton;
