import { useState, useEffect, useCallback, useRef } from "react";
import useSocket from "./useSocket";
import { formatLastSeen } from "../utils/timeFormatter";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const useLastSeen = (userId, { pollInterval = 60000 } = {}) => {
  const [lastSeen, setLastSeen] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const socket = useSocket();
  const intervalRef = useRef(null);
  const [display, setDisplay] = useState("last seen a long time ago");
  const onlineUsersRef = useRef([]);

  // Reset state immediately when userId changes
  useEffect(() => {
    setLastSeen(null);
    setIsOnline(false);
    setDisplay("last seen a long time ago");
  }, [userId]);

  const fetchLastSeen = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(
        `${API_URL}/api/users/${encodeURIComponent(userId)}/lastseen`
      );
      const data = await res.json();
      if (data.success && data.lastSeen) {
        setLastSeen(data.lastSeen);
      }
    } catch (err) {
      // silently fail
    }
  }, [userId]);

  useEffect(() => {
    fetchLastSeen();
    intervalRef.current = setInterval(fetchLastSeen, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchLastSeen, pollInterval]);

  useEffect(() => {
    if (!socket) return;

    const normalizedId = (userId || "").toLowerCase().trim();

    // Immediately check current online list on userId change using the cached list on the socket instance
    const initialOnline = (socket.currentOnlineUsers || []).some(
      (u) => u.toLowerCase().trim() === normalizedId
    );
    setIsOnline(initialOnline);

    const handleOnlineUsers = (users) => {
      socket.currentOnlineUsers = users; // Keep cache updated
      onlineUsersRef.current = users;
      setIsOnline(users.some((u) => u.toLowerCase().trim() === normalizedId));
    };

    const handleLastSeen = (data) => {
      if (data.userId && userId && data.userId.toLowerCase().trim() === normalizedId) {
        setLastSeen(data.time);
      }
    };

    socket.on("online-users", handleOnlineUsers);
    socket.on("last-seen", handleLastSeen);

    return () => {
      socket.off("online-users", handleOnlineUsers);
      socket.off("last-seen", handleLastSeen);
    };
  }, [socket, userId]);

  const updateLastSeenLocally = useCallback((time) => {
    setLastSeen(time);
  }, []);

  // Tick every 1 second to update the display text in real-time
  useEffect(() => {
    const tick = () => {
      setDisplay(isOnline ? "online" : formatLastSeen(lastSeen));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lastSeen, isOnline]);

  return { lastSeen, isOnline, display, updateLastSeenLocally };
};
