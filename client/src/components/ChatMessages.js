import React, { useRef, useEffect } from "react";
import MessageItem from "./MessageItem";

const ChatMessages = React.memo(({ 
  messages, 
  user, 
  handleContextMenu, 
  handleZoomImage, 
  renderAvatar, 
  formatMessageTime, 
  formatDay,
  messagesEndRef,
  isLoadingMore,
  hasMore
}) => {
  return (
    <div className="messages-container">
      {hasMore && (
        <div className="load-more-indicator">
          {isLoadingMore ? "Loading older messages..." : "Scroll up to load more"}
        </div>
      )}
      
      {messages.map((msg, index) => {
        const prevMsg = messages[index - 1];
        const showDay = !prevMsg || 
          new Date(msg.timestamp || msg.createdAt).toDateString() !== 
          new Date(prevMsg.timestamp || prevMsg.createdAt).toDateString();

        return (
          <MessageItem
            key={msg._id || msg.tempId}
            msg={msg}
            userEmail={user.email}
            onContextMenu={handleContextMenu}
            onZoomImage={handleZoomImage}
            renderAvatar={renderAvatar}
            formatMessageTime={formatMessageTime}
            formatDay={formatDay}
            showDay={showDay}
          />
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
});

export default ChatMessages;
