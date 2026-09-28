import { supabase } from '@/integrations/supabase/client';

/**
 * Central helper for user-uploaded media.
 *
 * The canonical home is the `user-media` bucket, one folder per user keyed by
 * their auth id and sub-foldered by category:
 *
 *     user-media/<uid>/<category>/<file>
 *
 * Until the `20260923120000_user_media_bucket` migration is applied that bucket
 * does not exist, so we transparently fall back to the two legacy layouts the
 * app shipped with. `resolveBucket()` probes once per session and caches the
 * answer, so there is no failed-upload round-trip on the hot path.
 */

export const USER_MEDIA_BUCKET = 'user-media';

/** Where a given category used to live before the unified bucket. */
const LEGACY: Record<UserMediaCategory, { bucket: string; prefix: (uid: string) => string }> = {
  comment: { bucket: 'comment-media', prefix: (uid) => `comments/${uid}` },
  forum_image: { bucket: 'forum', prefix: () => 'forum_images' },
};

export type UserMediaCategory = 'comment' | 'forum_image';

export interface UploadedMedia {
  url: string;
  path: string;
  bucket: string;
}

export interface UserMediaFile {
  name: string;
  url: string;
  path: string;
  bucket: string;
  category: UserMediaCategory | 'other';
  size: number | null;
  createdAt: string | null;
}

let bucketReady: Promise<boolean> | null = null;

/** Is the unified `user-media` bucket present? Cached for the session. */
export function resolveUserMediaBucket(): Promise<boolean> {
  if (!bucketReady) {
    // Probe by listing rather than getBucket(): storage.buckets is usually not
    // client-readable, but the public SELECT policy on objects lets `list` run.
    // A "bucket not found" error means the migration has not been applied yet.
    bucketReady = supabase.storage
      .from(USER_MEDIA_BUCKET)
      .list('', { limit: 1 })
      .then(({ error }) => {
        if (!error) return true;
        const msg = String((error as any)?.message || '').toLowerCase();
        return !(msg.includes('not found') || msg.includes('does not exist'));
      })
      .catch(() => false);
  }
  return bucketReady;
}

function safeExt(file: File): string {
  return (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
}

function randomName(file: File): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${rand}.${safeExt(file)}`;
}

/**
 * Upload one file for `userId` under `category`. Prefers the unified
 * `user-media/<uid>/<category>/...` layout; falls back to the legacy bucket for
 * that category when the unified bucket has not been provisioned yet.
 */
export async function uploadUserMedia(
  file: File,
  userId: string,
  category: UserMediaCategory,
): Promise<UploadedMedia> {
  const filename = randomName(file);

  if (await resolveUserMediaBucket()) {
    const path = `${userId}/${category}/${filename}`;
    const { error } = await supabase.storage
      .from(USER_MEDIA_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (!error) {
      const { data } = supabase.storage.from(USER_MEDIA_BUCKET).getPublicUrl(path);
      return { url: data.publicUrl, path, bucket: USER_MEDIA_BUCKET };
    }
    // Bucket vanished between probe and write, or a transient error — fall back.
  }

  const legacy = LEGACY[category];
  // Legacy comment attachments are foldered per-user; legacy forum art is a flat
  // prefix, so it embeds the uid in the filename the way the old code did.
  const path =
    category === 'comment'
      ? `${legacy.prefix(userId)}/${filename}`
      : `${legacy.prefix(userId)}/${userId}-${filename}`;
  const { error } = await supabase.storage
    .from(legacy.bucket)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from(legacy.bucket).getPublicUrl(path);
  return { url: data.publicUrl, path, bucket: legacy.bucket };
}

async function listFolder(
  bucket: string,
  folder: string,
  category: UserMediaFile['category'],
): Promise<UserMediaFile[]> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error || !data) return [];
  return data
    // Sub-folders come back with a null id; keep files only.
    .filter((entry) => entry.id && !entry.name.startsWith('.'))
    .map((entry) => {
      const path = `${folder}/${entry.name}`;
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      return {
        name: entry.name,
        url: pub.publicUrl,
        path,
        bucket,
        category,
        size: (entry.metadata as any)?.size ?? null,
        createdAt: entry.created_at ?? entry.updated_at ?? null,
      };
    });
}

/**
 * Every media file `userId` has uploaded, newest first, across the unified
 * bucket and the legacy comment-media layout. Forum art in the legacy `forum`
 * bucket is a flat, non-per-user prefix so it cannot be listed per user; only
 * new-bucket forum uploads surface here.
 */
export async function listUserMedia(userId: string): Promise<UserMediaFile[]> {
  const groups = await Promise.all([
    listFolder(USER_MEDIA_BUCKET, `${userId}/comment`, 'comment'),
    listFolder(USER_MEDIA_BUCKET, `${userId}/forum_image`, 'forum_image'),
    listFolder('comment-media', `comments/${userId}`, 'comment'),
  ]);
  const seen = new Set<string>();
  return groups
    .flat()
    .filter((f) => {
      const key = `${f.bucket}:${f.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/** Remove one uploaded file. RLS still enforces that it is the caller's own. */
export async function deleteUserMedia(file: Pick<UserMediaFile, 'bucket' | 'path'>): Promise<void> {
  const { error } = await supabase.storage.from(file.bucket).remove([file.path]);
  if (error) throw error;
}
