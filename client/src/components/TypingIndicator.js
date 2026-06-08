import React from "react";

function TypingIndicator({ typingUser }) {
  if (!typingUser) return null;

  return (
    <div className="typing-indicator">
      <span />
      <span />
      <span />
    </div>
  );
}

export default TypingIndicator;