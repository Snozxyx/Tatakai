/**
 * Custom reader fonts — real font-file upload (TTF/OTF/WOFF/WOFF2), not just
 * family names. Files persist in IndexedDB (localStorage is too small for
 * font binaries) and are registered with the FontFace API on boot, so an
 * uploaded font survives restarts and applies instantly in the reader.
 *
 * Raw IndexedDB (no extra dependency — Dexie owns the app tables and this
 * tiny blob store isn't worth a schema bump there).
 */
export interface StoredFont {
  name: string;
  family: string;
  format: string;
  blob: Blob;
  addedAt: number;
}

const DB_NAME = 'tatakai-novel-fonts';
const STORE = 'fonts';
const META_KEY = 'novel-custom-font-names';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

function readNameList(): string[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

function writeNameList(names: string[]) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(names.slice(0, 24)));
  } catch { /* ignore */ }
}

/** Legacy name-only entries (typed family names, no file). */
function readLegacyFamilies(): Record<string, string> {
  try {
    const raw = localStorage.getItem('novel-custom-fonts');
    const parsed = raw ? JSON.parse(raw) : [];
    const out: Record<string, string> = {};
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (entry && typeof entry.name === 'string') {
          out[entry.name] = typeof entry.family === 'string' ? entry.family : entry.name;
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function listCustomFonts(): Promise<Array<{ name: string; family: string }>> {
  const names = readNameList();
  const legacy = readLegacyFamilies();
  const all = [...names, ...Object.keys(legacy).filter((n) => !names.includes(n))];
  if (all.length === 0) return [];
  const out: Array<{ name: string; family: string }> = [];
  for (const name of all) {
    let family = legacy[name] || name;
    try {
      const row = await tx<StoredFont | undefined>('readonly', (store) => store.get(name));
      if (row?.family) family = row.family;
    } catch { /* file row missing — legacy family still works */ }
    out.push({ name, family });
  }
  return out;
}

function formatFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff') return 'woff';
  if (ext === 'otf') return 'opentype';
  return 'truetype';
}

function sanitizeFamily(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'Custom';
}

/** Store an uploaded font file and register it immediately. Returns the display name. */
export async function uploadCustomFont(file: File): Promise<{ name: string; family: string }> {
  const base = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').trim() || 'Custom';
  const family = `TatakaiCustom-${sanitizeFamily(base).replace(/\s+/g, '')}`;
  const format = formatFromFileName(file.name);
  const record: StoredFont = {
    name: base.slice(0, 60),
    family,
    format,
    blob: file,
    addedAt: Date.now(),
  };
  await tx('readwrite', (store) => store.put(record));
  const names = readNameList().filter((n) => n !== record.name);
  writeNameList([record.name, ...names]);
  await registerFont(record);
  return { name: record.name, family };
}

async function registerFont(row: StoredFont): Promise<boolean> {
  try {
    if (!('FontFace' in window) || !document.fonts) return false;
    for (const existing of document.fonts) {
      if (existing.family === row.family) return true;
    }
    const url = URL.createObjectURL(row.blob);
    const face = new FontFace(row.family, `url(${url}) format('${row.format}')`, {
      style: 'normal',
      weight: '400',
    });
    const loaded = await face.load();
    document.fonts.add(loaded);
    return true;
  } catch {
    return false;
  }
}

/** Register every stored font (call once on app/reader boot). */
export async function loadStoredFonts(): Promise<number> {
  try {
    const names = readNameList();
    let count = 0;
    for (const name of names) {
      try {
        const row = await tx<StoredFont | undefined>('readonly', (store) => store.get(name));
        if (row && (await registerFont(row))) count += 1;
      } catch { /* skip unreadable rows */ }
    }
    return count;
  } catch {
    return 0;
  }
}

export async function deleteCustomFont(name: string): Promise<void> {
  try {
    await tx('readwrite', (store) => store.delete(name));
  } catch { /* ignore */ }
  writeNameList(readNameList().filter((n) => n !== name));
}
