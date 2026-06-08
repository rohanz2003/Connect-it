import { useState, useEffect, useCallback, useRef } from "react";
import useSocket from "./useSocket";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const useLastSeen = (userId, { pollInterval = 60000 } = {}) => {
  const [lastSeen, setLastSeen] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const socket = useSocket();
  const intervalRef = useRef(null);
  const onlineUsersRef = useRef([]);

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

    const handleOnlineUsers = (users) => {
      onlineUsersRef.current = users;
      const normalizedId = (userId || "").toLowerCase().trim();
      setIsOnline(users.some((u) => u.toLowerCase().trim() === normalizedId));
    };

    const handleLastSeen = (data) => {
      if (data.userId === userId) {
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

  return { lastSeen, isOnline, updateLastSeenLocally };
};
