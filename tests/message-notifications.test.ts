import { describe, expect, test } from 'bun:test';
import { isMessageNotification, messageNotificationConversation } from '../src/lib/messageNotifications';
const id = '00000000-0000-4000-8000-000000000001';
describe('message notification popup routing', () => {
  test('messages and requests share the inbox category', () => {
    expect(isMessageNotification('direct_message')).toBe(true);
    expect(isMessageNotification('message_request')).toBe(true);
    expect(isMessageNotification('mention')).toBe(false);
  });
  test('structured and legacy notifications open the same conversation', () => {
    for (const type of ['direct_message', 'message_request']) {
      expect(messageNotificationConversation({ type, conversation_id: id })).toBe(id);
      expect(messageNotificationConversation({ type, link: `/messages/${id}` })).toBe(id);
    }
  });
  test('invalid and external conversation targets are rejected', () => {
    for (const data of [null, {}, { conversation_id: id }, { type: 'message_request', conversation_id: 'bad' }, { link: `https://evil.example/messages/${id}` }, { link: `/messages/${id}/extra` }]) {
      expect(messageNotificationConversation(data)).toBeNull();
    }
  });
});
