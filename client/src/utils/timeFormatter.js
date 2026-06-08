export const formatLastSeen = (time) => {
  if (!time) return "";
  const date = new Date(time);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "last seen just now";
  if (diffMins < 60) return `last seen ${diffMins}m ago`;
  if (diffHours < 24) return `last seen ${diffHours}h ago`;
  if (diffDays === 1) return "last seen yesterday";
  if (diffDays < 7) return `last seen ${diffDays}d ago`;
  return "last seen " + date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatMessageTime = (time) => {
  if (!time) return "";
  const date = new Date(time);
  if (isNaN(date.getTime())) return ""; // Handle invalid dates
  
  const now = new Date();
  const diffInHours = (now - date) / (1000 * 60 * 60);
  

  if (diffInHours < 24) {
    // Today: show time like "2:30 PM"
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
  } else if (diffInHours < 48) {
    // Yesterday: show "Yesterday 2:30 PM"
    return `Yesterday ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}`;
  } else {
    // Older: show date and time like "Dec 25, 2:30 PM"
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
           ', ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
  }
};