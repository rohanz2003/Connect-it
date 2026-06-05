import React, { useRef, Suspense } from "react";
import { Smile, Paperclip, Send, X } from "lucide-react";

const EmojiPicker = React.lazy(() => import("emoji-picker-react"));

const ChatInput = React.memo(({ 
  message, 
  handleTyping, 
  sendMessage, 
  showEmojiPicker, 
  setShowEmojiPicker, 
  emojiPickerRef, 
  onEmojiClick, 
  handleMediaShare, 
  replyTo, 
  setReplyTo, 
  isMediaSending,
  userMetadata
}) => {
  const fileInputRef = useRef(null);

  const getDisplayName = (email) => {
    if (!email) return "User";
    return userMetadata[email.toLowerCase()]?.displayName || email.split('@')[0];
  };

  return (
    <div className="chat-panel-input">
      {replyTo && (
        <div className="reply-preview">
          <div className="reply-content">
            <small>Replying to {getDisplayName(replyTo.sender)}</small>
            <p>{replyTo.type === 'media' ? 'Media file' : replyTo.text}</p>
          </div>
          <button className="close-reply" onClick={() => setReplyTo(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="input-actions">
        <div className="emoji-picker-wrapper" ref={emojiPickerRef}>
          <button 
            className="icon-btn" 
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Emoji"
          >
            <Smile size={22} />
          </button>
          {showEmojiPicker && (
            <div className="emoji-picker-container">
              <Suspense fallback={<div className="emoji-loading">Loading...</div>}>
                <EmojiPicker onEmojiClick={onEmojiClick} />
              </Suspense>
            </div>
          )}
        </div>
        
        <button 
          className="icon-btn" 
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
          disabled={isMediaSending}
        >
          <Paperclip size={22} />
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleMediaShare}
        />
      </div>

      <input
        type="text"
        value={message}
        onChange={handleTyping}
        onKeyPress={(e) => e.key === "Enter" && sendMessage()}
        placeholder="Type a message..."
      />

      <button 
        className="send-btn" 
        onClick={sendMessage}
        disabled={!message.trim() || isMediaSending}
      >
        <Send size={20} />
      </button>
    </div>
  );
});

export default ChatInput;
