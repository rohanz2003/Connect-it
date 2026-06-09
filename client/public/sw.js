self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'New message', body: event.data.text() };
  }
  const { title, body, icon, badge, data: msgData } = data;
  const senderKey = 'chat-' + (msgData?.senderId || 'unknown');
  event.waitUntil(
    self.registration.getNotifications({ tag: senderKey }).then(existing => {
      const count = existing.length + 1;
      const titleText = count > 1
        ? (msgData?.senderName || 'Someone') + ' (' + count + ' new messages)'
        : (title || msgData?.senderName || 'New message');
      return self.registration.showNotification(titleText, {
        body: count > 1 ? count + ' unread messages' : (body || 'You have a new message'),
        icon: icon || '/logo192.png',
        badge: badge || '/favicon.ico',
        tag: senderKey,
        renotify: true,
        vibrate: [200, 100, 200],
        data: msgData || {},
        actions: [
          { action: 'open', title: 'Open Chat' },
          { action: 'close', title: 'Close' }
        ]
      });
    })
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    const url = event.notification.data?.url || '/';
    event.waitUntil(clients.openWindow(url));
  }
});
