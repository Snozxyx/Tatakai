import JSZip from 'jszip';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { db } from '@/core/db';
import { supabase } from '@/integrations/supabase/client';
import { recentDiagnosticErrors } from './recent-errors';

import { redactDiagnostics } from './redaction';
export { redactDiagnostics } from './redaction';

export async function buildDiagnostics(): Promise<Blob> {
  const zip = new JSZip();
  const secrets: string[] = [];
  const findSecrets = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (/token|secret|api.?key|password/i.test(key) && typeof item === 'string') secrets.push(item);
      else findSecrets(item);
    }
  };
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)!;
      if (/debrid_accounts|auth-token|api.?key|secret|password/i.test(key)) {
        const value = localStorage.getItem(key)!;
        try { findSecrets(JSON.parse(value)); } catch { secrets.push(value); }
      }
    }
  } catch { /* Storage unavailable; structural and text redaction still apply. */ }
  const failures: Record<string, string> = {};
  const collect = async (name: string, operation: () => Promise<unknown>) => {
    try { zip.file(`${name}.json`, JSON.stringify(redactDiagnostics(await operation(), secrets), null, 2)); }
    catch (error) { failures[name] = String(error instanceof Error ? error.message : error); }
  };
  await Promise.all([
    collect('environment', async () => ({ version: __APP_VERSION__, platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : (window as any).electron?.platform || 'web', exportedAt: new Date().toISOString() })),
    collect('extensions', async () => (await db.extensions.toArray()).map(e => ({ id: e.id, name: e.name, version: e.version, enabled: e.enabled }))),
    collect('recent-errors', async () => recentDiagnosticErrors()),
    collect('logs', async () => (window as any).electron?.logTail ? await (window as any).electron.logTail(500) : recentDiagnosticErrors()),
    collect('download-errors', async () => (await db.downloadHistory.orderBy('startedAt').reverse().limit(50).toArray()).map(d => ({ status: d.status, error: d.errorMessage }))),
    collect('provider-health', async () => {
      const result = await supabase.from('provider_health').select('provider,success,latency_ms,recorded_at').order('recorded_at', { ascending: false }).limit(50).abortSignal(AbortSignal.timeout(5000));
      if (result.error) throw result.error;
      return result.data;
    }),
  ]);
  zip.file('collection-status.json', JSON.stringify(redactDiagnostics(failures, secrets), null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function exportDiagnostics(): Promise<string> {
  const blob = await buildDiagnostics();
  const name = `tatakai-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  if (Capacitor.isNativePlatform()) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob);
    });
    await Filesystem.writeFile({ path: `Tatakai/Diagnostics/${name}`, directory: Directory.Documents, data, recursive: true });
  } else {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return name;
}
