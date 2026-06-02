export const formatLastSeen = (time) => {
  if (!time) return "";
  const date = new Date(time);
  return "Last seen at " + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
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