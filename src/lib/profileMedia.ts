import { randomUUID } from './uuid';
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
  const path = `${userId}/${category}/${randomUUID()}.${ext}`;
  const bucket = 'user-media';
  const storage = client.storage.from(bucket);
  // Send image bytes directly. File/FormData uploads can fail in native WebViews
  // and at multipart gateways before Storage can return a useful error.
  const body = await file.arrayBuffer();
  const { error } = await storage.upload(path, body, {
    cacheControl: '3600', upsert: false, contentType: file.type,
  });
  if (error) {
    if (/failed to fetch|network|load failed/i.test(error.message)) {
      throw new Error('The image upload could not reach storage. Check your connection and retry, or use an HTTPS image link instead.');
    }
    throw error;
  }
  return { url: storage.getPublicUrl(path).data.publicUrl, path, bucket };
}
