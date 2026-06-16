import React from "react";

function Message({ msg, currentUser }) {
  // Using a consistent 12-hour lowercase format
  const timeToFormat = msg.timestamp || msg.createdAt;
  const messageTime = timeToFormat 
    ? new Date(timeToFormat).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()
    : "";
    
  return (
    <div className={`message ${msg.sender === currentUser ? "sent" : "received"}`}>
      <div className="message-content">{msg.text}</div>
      <div className="message-details">
        <span className="message-time">{messageTime}</span>
        {msg.sender === currentUser && (
          <span className={`message-status-tick ${msg.status || 'sent'}`}>
            {msg.status === "read" ? (
              <span className="double-tick read">✓✓</span>
            ) : msg.status === "delivered" ? (
              <span className="double-tick delivered">✓✓</span>
            ) : (
              <span className="single-tick sent">✓</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export default Message;