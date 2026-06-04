export const formatLastSeen = (time) => {
  if (!time) return "";
  const date = new Date(time);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  
  if (isToday) {
    return `Last seen today at ${timeStr}`;
  } else if (isYesterday) {
    return `Last seen yesterday at ${timeStr}`;
  } else {
    const month = date.toLocaleString('en-US', { month: 'long' });
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `Last seen on ${day} ${month} ${year} at ${timeStr}`;
  }
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