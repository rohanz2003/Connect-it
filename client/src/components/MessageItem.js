import React from "react";
import { motion } from "framer-motion";
import Avatar from "./Avatar";

const MessageItem = React.memo(({ 
  msg, 
  userEmail, 
  onContextMenu, 
  onZoomImage, 
  renderAvatar, 
  formatMessageTime, 
  formatDay, 
  showDay 
}) => {
  return (
    <React.Fragment>
      {showDay && (
        <div className="day-separator">
          <span>{formatDay(msg.timestamp || msg.createdAt)}</span>
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`message-wrapper ${msg.sender === userEmail ? "sent" : "received"}`}
      >
        {msg.sender !== userEmail && (
          <div className="message-avatar">
            {renderAvatar(msg.sender, "sm")}
          </div>
        )}
        <div
          className={`message ${msg.sender === userEmail ? "sent" : "received"}`}
          onContextMenu={(e) => onContextMenu(e, msg)}
        >
          <div className="message-content">
            {msg.replyTo && (
              <div className="reply-quote">
                <small>{msg.replyTo.sender === userEmail ? "You" : msg.replyTo.sender.split('@')[0]}</small>
                <p>{msg.replyTo.text}</p>
              </div>
            )}
            {msg.type === "media" ? (
              <div className="media-message">
                {msg.mediaType === "image" && msg.text?.data?.startsWith("data:image/") && (
                  <img src={msg.text.data} alt="Shared" className="media-image" onClick={() => onZoomImage(msg.text.data)} />
                )}
                {msg.mediaType === "video" && msg.text?.data?.startsWith("data:video/") && (
                  <video controls className="media-video">
                    <source src={msg.text.data} type={msg.text.type} />
                    Your browser does not support video playback
                  </video>
                )}
                {msg.mediaType === "application" && msg.text?.data?.startsWith("data:application/") && (
                  <div className="media-file">
                    <span>📎 {msg.text.name}</span>
                    <a href={msg.text.data} download={msg.text.name} className="download-btn">Download</a>
                  </div>
                )}
                {msg.text?.data && msg.mediaType !== "image" && msg.mediaType !== "video" && msg.mediaType !== "application" && (
                  <div className="media-file">
                    <span>📎 {msg.text?.name || "Attachment"}</span>
                    {msg.text?.data && (
                      <a href={msg.text.data} download={msg.text?.name} className="download-btn">Download</a>
                    )}
                  </div>
                )}
                {!msg.text?.data && msg.type === "media" && (
                  <span className="media-unavailable">Media unavailable (reload chat)</span>
                )}
              </div>
            ) : (
              msg.text
            )}
          </div>
          <div className="message-meta">
            <span>{formatMessageTime(msg.timestamp || msg.createdAt)}</span>
            {msg.pending && <span className="message-status pending">Sending…</span>}
            {msg.failed && <span className="message-status failed">Failed</span>}
            {msg.sender === userEmail && !msg.pending && !msg.failed && (
              <span className="read-receipt">✓✓</span>
            )}
          </div>
        </div>
      </motion.div>
    </React.Fragment>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the message object itself changed (e.g. status update) or showDay changed
  return prevProps.msg === nextProps.msg && 
         prevProps.showDay === nextProps.showDay &&
         prevProps.userEmail === nextProps.userEmail;
});

export default MessageItem;
