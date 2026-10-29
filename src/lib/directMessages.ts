import { supabase } from '@/integrations/supabase/client';
import { randomUUID } from '@/lib/uuid';
import type { CommentAttachment } from '@/lib/commentMedia';
import type { CommentEmbed } from '@/lib/commentEmbeds';

export interface DirectConversation {
  id: string; user_a: string; user_b: string; requested_by: string;
  status: 'pending' | 'accepted' | 'declined'; updated_at: string;
  read_a: number; read_b: number; typing_a_until: string | null; typing_b_until: string | null;
}
export interface DirectMessage {
  id: string; seq: number; conversation_id: string; sender_id: string; content: string;
  attachments: CommentAttachment[]; embeds: CommentEmbed[]; created_at: string;
}
export async function uploadDirectMedia(file: File, userId: string, conversationId: string): Promise<CommentAttachment> {
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a PNG, JPEG, GIF, or WebP image up to 8 MB.');
  const path = `${userId}/${conversationId}/${randomUUID()}.${file.type.split('/')[1]}`;
  const { error } = await supabase.storage.from('direct-media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data, error: signingError } = await supabase.storage.from('direct-media').createSignedUrl(path, 3600);
  if (signingError) { await supabase.storage.from('direct-media').remove([path]); throw signingError; }
  return { type: file.type === 'image/gif' ? 'gif' : 'image', url: data.signedUrl, storagePath: path, title: file.name };
}
/** Strip expiring bearer URLs before storing a private attachment. */
export function serializeDirectAttachments(attachments: CommentAttachment[]) {
  return attachments.map(a => a.storagePath ? { ...a, url: '', preview: undefined } : a);
}
export async function resolveDirectAttachments(attachments: CommentAttachment[]): Promise<CommentAttachment[]> {
  return Promise.all(attachments.map(async a => {
    if (!a.storagePath) return a;
    const { data, error } = await supabase.storage.from('direct-media').createSignedUrl(a.storagePath, 3600);
    return { ...a, url: error ? '' : data.signedUrl };
  }));
}
