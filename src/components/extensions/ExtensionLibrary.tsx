import { Link } from 'react-router-dom';
import { useExtensionLibrary } from '@/hooks/media/useExtensionLibrary';
import { extensionTitleRoute, removeExtensionLibrary } from '@/core/extensions/compatibility/library';
import { Button } from '@/components/ui/button';

export function ExtensionLibrary() {
  const { data = [], profile } = useExtensionLibrary();
  if (!data.length) return null;
  return <section className="my-8 flex flex-col gap-4" aria-labelledby="extension-library-heading"><div><h2 id="extension-library-heading" className="text-xl font-semibold">Extension library</h2><p className="text-sm text-muted-foreground">Saved titles and progress on this device.</p></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.map(item => {
      const progress = item.latest ? item.entries[item.latest] : undefined;
      return <div key={JSON.stringify([item.namespace, item.sourceId, item.id])} className="flex items-center gap-3 rounded-lg border p-3"><div className="flex min-w-0 flex-1 flex-col gap-1"><Link className="truncate font-medium hover:underline" to={extensionTitleRoute(item)}>{item.title}</Link><p className="truncate text-xs text-muted-foreground">{item.sourceName} · {item.kind === 'read' ? 'Read' : 'Watch'}{item.saved ? ' · Saved' : ''}</p>{progress && <p className="truncate text-xs text-muted-foreground">{progress.label} · {progress.completed ? 'Completed' : item.kind === 'read' ? `Page ${Math.floor(progress.position) + 1}` : `${Math.floor(progress.position / 60)} min`}</p>}</div><Button size="sm" variant="ghost" aria-label={`Remove ${item.title} from extension library`} onClick={() => void removeExtensionLibrary(profile, item)}>Remove</Button></div>;
    })}</div>
  </section>;
}
