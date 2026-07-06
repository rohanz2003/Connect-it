export const buildMessageNotificationPayload = ({ senderName, preview, unreadCount = 1 }) => {
  const senderLabel = senderName || 'Someone';
  const safePreview = preview || 'You have a new message';

  if (unreadCount > 1) {
    return {
      title: `${unreadCount} unread messages from ${senderLabel}`,
      body: safePreview,
      tag: `message-${senderLabel}`,
    };
  }

  return {
    title: `New message from ${senderLabel}`,
    body: safePreview,
    tag: `message-${senderLabel}`,
  };
};

export const buildRequestNotificationPayload = ({ senderName, status }) => {
  const senderLabel = senderName || 'Someone';
  const title = status === 'accepted'
    ? 'Chat request accepted'
    : status === 'rejected'
      ? 'Chat request update'
      : 'New chat request update';

  return {
    title,
    body: status === 'accepted'
      ? `${senderLabel} accepted your chat request`
      : status === 'rejected'
        ? `${senderLabel} rejected your chat request`
        : `${senderLabel} updated your chat request`,
    tag: `request-${senderLabel}`,
  };
};
