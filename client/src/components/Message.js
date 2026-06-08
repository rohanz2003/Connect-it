import React from "react";

function Message({ msg, currentUser }) {
  const timeToFormat = msg.timestamp || msg.createdAt;
  const messageTime = timeToFormat
    ? new Date(timeToFormat).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()
    : "";

  const renderContent = () => {
    if (msg.type === "media") {
      const fileData = msg.text?.data;
      const mediaType = msg.mediaType;

      if (mediaType === "image" && fileData?.startsWith("data:image/")) {
        return <img src={fileData} alt="Shared" className="media-image" />;
      }
      if (mediaType === "video" && fileData?.startsWith("data:video/")) {
        return (
          <video controls className="media-video">
            <source src={fileData} type={msg.text?.type} />
          </video>
        );
      }
      if (mediaType === "audio" || msg.text?.name?.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
        return <audio controls className="media-audio" src={fileData} />;
      }
      if (fileData) {
        return (
          <div className="media-file">
            <span>📎 {msg.text?.name || "Attachment"}</span>
            <a href={fileData} download={msg.text?.name} className="download-btn">Download</a>
          </div>
        );
      }
      return <span className="media-unavailable">Media unavailable</span>;
    }
    return msg.text;
  };

  return (
    <div className={`message ${msg.sender === currentUser ? "sent" : "received"}`}>
      <div className="message-content">{renderContent()}</div>
      <div className="message-details">
        <span className="message-time">{messageTime}</span>
        {msg.sender === currentUser && (
          <span className="message-status">
            {msg.pending ? "⏳" : msg.failed ? "⚠️" : msg.seen ? "✓✓" : "✓"}
          </span>
        )}
      </div>
    </div>
  );
}

export default Message;