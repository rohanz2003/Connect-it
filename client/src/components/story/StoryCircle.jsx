import React from "react";
import Avatar from "../Avatar";

export default function StoryCircle({ userEmail, displayName, avatarSrc, hasUnseen, hasStory, onClick, size = 56 }) {
  return (
    <div className="story-circle-wrap" onClick={onClick} style={{ cursor: hasStory ? "pointer" : "default" }}>
      <div className={`story-circle-ring ${hasUnseen ? "unseen" : hasStory ? "seen" : ""}`}>
        <div className="story-circle-avatar">
          <Avatar
            src={avatarSrc}
            email={userEmail}
            size={size - 4}
          />
        </div>
      </div>
      <span className="story-circle-name">{displayName?.split(" ")[0] || userEmail?.split("@")[0]}</span>
    </div>
  );
}
