import React from "react";

function TypingIndicator({ typingUser }) {
  if (!typingUser) return null;

  return (
    <p style={{ color: "gray", fontStyle: "italic" }}>
      {typingUser} is typing...
    </p>
  );
}

export default TypingIndicator;