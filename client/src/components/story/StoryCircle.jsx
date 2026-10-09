import React from "react";
import Avatar from "../Avatar";

export default function StoryCircle({ userEmail, displayName, avatarSrc, hasUnseen, onClick }) {
  const ringClass = hasUnseen ? "story-circle-ring unseen" : "story-circle-ring seen";
  return (
    <button type="button" className="story-circle-wrap" onClick={onClick} aria-label={`View ${displayName || userEmail}'s story${hasUnseen ? " (unseen)" : ""}`}>
      <div className={ringClass}>
        <div className="story-circle-avatar">
          <Avatar src={avatarSrc} email={userEmail} size={46} />
        </div>
      </div>
      <span className="story-circle-name">{displayName?.split(" ")[0] || userEmail?.split("@")[0]}</span>
    </button>
  );
}
