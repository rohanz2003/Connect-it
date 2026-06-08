import React from "react";
import { useLastSeen } from "../hooks/useLastSeen";

const LastSeen = ({ userId, className = "" }) => {
  const { display, isOnline } = useLastSeen(userId, { pollInterval: 60000 });

  if (isOnline) {
    return (
      <span className={`last-seen online ${className}`}>
        <span className="online-dot" /> Online
      </span>
    );
  }

  return (
    <span className={`last-seen ${className}`}>
      {display}
    </span>
  );
};

export default LastSeen;
