import { buildMessageNotificationPayload, buildRequestNotificationPayload } from './browserNotifications';

describe('browser notification payloads', () => {
  it('builds concise message payloads for single unread messages', () => {
    const payload = buildMessageNotificationPayload({
      senderName: 'Ava',
      preview: 'Can we meet at 5?',
      unreadCount: 1,
    });

    expect(payload.title).toBe('New message from Ava');
    expect(payload.body).toBe('Can we meet at 5?');
  });

  it('builds grouped unread-message payloads for multiple messages', () => {
    const payload = buildMessageNotificationPayload({
      senderName: 'Noah',
      unreadCount: 3,
      preview: 'You have 3 unread messages',
    });

    expect(payload.title).toBe('3 unread messages from Noah');
    expect(payload.body).toBe('You have 3 unread messages');
  });

  it('builds request payloads with clear action text', () => {
    const payload = buildRequestNotificationPayload({
      senderName: 'Mina',
      status: 'accepted',
    });

    expect(payload.title).toBe('Chat request accepted');
    expect(payload.body).toBe('Mina accepted your chat request');
  });
});
