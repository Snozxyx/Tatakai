import type { SupabaseClient } from '@supabase/supabase-js';

export const PROFILE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export function validateProfileImage(file: Pick<File, 'type' | 'size'>): void {
  if (!PROFILE_IMAGE_TYPES.includes(file.type)) throw new Error('Choose a PNG, JPEG, GIF, or WebP image');
  if (file.size > 8 * 1024 * 1024) throw new Error('Image must be 8MB or smaller');
}

export async function uploadProfileImage(
  client: Pick<SupabaseClient, 'storage'>,
  file: File,
  userId: string,
  category: 'avatar' | 'banner',
) {
  validateProfileImage(file);
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.slice('image/'.length);
  const path = `${userId}/${category}/${crypto.randomUUID()}.${ext}`;
  const bucket = 'user-media';
  const storage = client.storage.from(bucket);
  const { error } = await storage.upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type,
  });
  if (error) throw error;
  return { url: storage.getPublicUrl(path).data.publicUrl, path, bucket };
}
