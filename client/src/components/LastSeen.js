import React, { useState, useEffect } from "react";
import { useLastSeen } from "../hooks/useLastSeen";
import { formatLastSeen } from "../utils/timeFormatter";

const LastSeen = ({ userId, className = "" }) => {
  const { lastSeen, isOnline } = useLastSeen(userId, { pollInterval: 60000 });
  const [, setTick] = useState(0);

  // Re-render every 60 seconds so the displayed time stays current
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  if (isOnline) {
    return (
      <span className={`last-seen online ${className}`}>
        <span className="online-dot" /> Online
      </span>
    );
  }

  return (
    <span className={`last-seen ${className}`}>
      {formatLastSeen(lastSeen)}
    </span>
  );
};

export default LastSeen;
