import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Puzzle, ArrowRight } from 'lucide-react';
import { resolveExtensionApiBase } from '@/hooks/media/useExtensionSourceStream';
import { listRemoteExtensions } from '@/core/extensions/remote/installed';
import {
  supportsContent,
  type ContentExtensionKind,
} from '@/lib/extensionCapability';
import { Button } from '@/components/ui/button';

export function ExtensionRequired({
  kind,
  hasContent = false,
}: {
  kind: ContentExtensionKind;
  hasContent?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['compatible-extension', kind],
    enabled: !hasContent,
    staleTime: 30_000,
    queryFn: async () => {
      const runtime = window as any;
      const [env, desktop, remote] = await Promise.all([
        resolveExtensionApiBase(true),
        runtime.electron?.listInstalledExtensions?.() || [],
        listRemoteExtensions(),
      ]);
      if (env.namespaces.some((ns) => supportsContent(ns, kind))) return true;
      if (desktop.some((manifest: any) => supportsContent(manifest, kind)))
        return true;
      if (
        remote.some(
          (row) =>
            row.enabled &&
            (supportsContent(row.manifest, kind) ||
              (kind === 'anime' && row.ecosystem === 'stremio'))
        )
      )
        return true;
      const installed = JSON.parse(
        localStorage.getItem('tatakai_installed_extensions') || '[]'
      ) as string[];
      const manifests = JSON.parse(
        localStorage.getItem('tatakai_extension_manifests') || '[]'
      ) as any[];
      return manifests.some(
        (manifest) =>
          installed.includes(manifest.id) && supportsContent(manifest, kind)
      );
    },
  });
  useEffect(() => {
    const refresh = () =>
      void client.invalidateQueries({ queryKey: ['compatible-extension'] });
    const events = [
      'tatakai:extension-installed',
      'tatakai:extensions-changed',
      'storage',
    ];
    events.forEach((event) => window.addEventListener(event, refresh));
    return () =>
      events.forEach((event) => window.removeEventListener(event, refresh));
  }, [client]);
  if (hasContent || !query.isSuccess || query.data) return null;
  return (
    <div className="my-4 rounded-xl border border-border bg-muted/20 p-5 text-left">
      <div className="flex items-center gap-2">
        <Puzzle className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">{t('extensionRequired.title')}</h3>
      </div>
      <p className="mb-4 mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
        {t(`extensionRequired.${kind}`)}
      </p>
      <Button asChild variant="outline">
        <Link to="/extensions">
          {t('extensionRequired.hub')}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
