import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { extensionLibrary, updateExtensionLibrary, type ExtensionTitle } from '@/core/extensions/compatibility/library';

export function useExtensionLibrary() {
  const { user } = useAuth();
  const profile = user?.id || 'guest';
  const client = useQueryClient();
  useEffect(() => {
    const refresh = () => { void client.invalidateQueries({ queryKey: ['extension-library', profile] }); };
    window.addEventListener('tatakai-extension-library-changed', refresh);
    return () => window.removeEventListener('tatakai-extension-library-changed', refresh);
  }, [client, profile]);
  return { ...useQuery({ queryKey: ['extension-library', profile], queryFn: () => extensionLibrary(profile) }), profile };
}
export function useExtensionTitleProgress(title: ExtensionTitle | undefined, entryId?: string, entryLabel?: string) {
  const library = useExtensionLibrary();
  const row = library.data?.find(r => r.namespace === title?.namespace && r.sourceId === title?.sourceId && r.id === title?.id);
  const key = JSON.stringify([library.profile, title?.namespace, title?.sourceId, title?.id, entryId]);
  const initial = useRef<{ key: string; position?: number }>({ key });
  if (initial.current.key !== key) initial.current = { key };
  if (initial.current.position === undefined && library.isSuccess) initial.current.position = entryId && !(title?.kind === 'watch' && row?.entries[entryId]?.completed) ? row?.entries[entryId]?.position || 0 : 0;
  const lastSaved = useRef({ key, at: 0, position: -1 });
  const save = useCallback((position: number, duration = 0, completed = false, flush = false) => {
    if (!title || !entryId || !library.isSuccess || !Number.isFinite(position) || position < 0) return;
    const now = Date.now(), previous = lastSaved.current;
    if (!flush && !completed && previous.key === key && (now - previous.at < 5000 || previous.position === position)) return;
    lastSaved.current = { key, at: now, position };
    void updateExtensionLibrary(library.profile, title, { progress: { id: entryId, label: entryLabel || entryId, position, duration: Number.isFinite(duration) ? duration : 0, completed, updatedAt: new Date().toISOString() } }).catch(error => console.error('Could not save extension progress', error));
  }, [key, library.profile, library.isSuccess, title?.title, title?.image, entryLabel]);
  return { row, initialPosition: initial.current.position || 0, ready: library.isSuccess, save, profile: library.profile };
}
