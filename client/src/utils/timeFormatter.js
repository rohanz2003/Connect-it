export const formatLastSeen = (date) => {
  if (!date) return "last seen a long time ago";
  const lastSeen = new Date(date);
  if (isNaN(lastSeen.getTime())) return "last seen a long time ago";

  const now = new Date();
  const diffMs = now - lastSeen;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 1) return "online";

  if (diffSec < 60) {
    return `last seen ${diffSec} second${diffSec !== 1 ? "s" : ""} ago`;
  }

  const diffMin = Math.floor(diffSec / 60);

  if (diffMin < 60) return `last seen ${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;

  const time = lastSeen.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const isToday = lastSeen.toDateString() === now.toDateString();
  if (isToday) return `last seen today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (lastSeen.toDateString() === yesterday.toDateString()) {
    return `last seen yesterday at ${time}`;
  }

  if (diffMin < 60 * 24 * 7) {
    const day = lastSeen.toLocaleDateString("en-US", { weekday: "long" });
    return `last seen ${day} at ${time}`;
  }

  const dateStr = `${lastSeen.getMonth() + 1}/${lastSeen.getDate()}/${lastSeen.getFullYear()}`;
  return `last seen ${dateStr}`;
};

export const formatMessageTime = (time) => {
  if (!time) return "";
  const date = new Date(time);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffInHours = (now - date) / (1000 * 60 * 60);

  if (diffInHours < 24) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).toLowerCase();
  } else if (diffInHours < 48) {
    return `Yesterday ${date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).toLowerCase()}`;
  } else {
    return (
      date.toLocaleDateString([], { month: "short", day: "numeric" }) +
      ", " +
      date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).toLowerCase()
    );
  }
};
