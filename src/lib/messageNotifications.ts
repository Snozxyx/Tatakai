/** Shared notification routing for the bell and full notification history. */
export function isMessageNotification(type: unknown): boolean {
  return type === 'direct_message' || type === 'message_request';
}

export function messageNotificationConversation(data: { type?: unknown; conversation_id?: unknown; link?: unknown } | null | undefined): string | null {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (isMessageNotification(data?.type) && typeof data?.conversation_id === 'string' && uuid.test(data.conversation_id)) return data.conversation_id;
  // Notifications created before structured conversation metadata was introduced.
  const match = typeof data?.link === 'string' ? /^\/messages\/([^/]+)$/.exec(data.link) : null;
  return match && uuid.test(match[1]) ? match[1] : null;
}
