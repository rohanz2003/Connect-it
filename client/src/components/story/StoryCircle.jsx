import React from "react";
import Avatar from "../Avatar";

export default function StoryCircle({ userEmail, displayName, avatarSrc, hasUnseen, hasStory, onClick }) {
  return (
    <div className="story-circle-wrap" onClick={onClick} style={{ cursor: "pointer" }}>
      <div className="story-circle-ring">
        <div className="story-circle-avatar">
          <Avatar src={avatarSrc} email={userEmail} size={46} />
        </div>
      </div>
      <span className="story-circle-name">{displayName?.split(" ")[0] || userEmail?.split("@")[0]}</span>
    </div>
  );
}
