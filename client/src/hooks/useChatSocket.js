import { useState, useEffect, useRef, useCallback } from "react";
import useSocket from "./useSocket";
import { fetchMessages, fetchRecentChats } from "../services/messageService";

const normalizeEmail = (email) => (email || "").toLowerCase().trim();

const isSameMessage = (a, b) => {
  if (!a || !b) return false;
  if (a._id && b._id && String(a._id) === String(b._id)) return true;
  if (a.tempId && b.tempId && a.tempId === b.tempId) return true;
  return false;
};

const upsertMessageInList = (list, msg) => {
  const idx = list.findIndex((m) => isSameMessage(m, msg));
  if (idx === -1) {
    if (list.length === 0 || new Date(msg.timestamp || msg.createdAt) >= new Date(list[list.length - 1].timestamp || list[list.length - 1].createdAt)) {
      return [...list, msg];
    }
    return [...list, msg].sort(
      (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
    );
  }
  const updated = [...list];
  updated[idx] = { ...updated[idx], ...msg };
  const timestampChanged = (msg.timestamp || msg.createdAt) && 
                           (new Date(msg.timestamp || msg.createdAt).getTime() !== new Date(list[idx].timestamp || list[idx].createdAt).getTime());
  
  if (timestampChanged) {
    return updated.sort(
      (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
    );
  }
  return updated;
};

export const useChatSocket = (user, selectedUser, setSelectedUser) => {
  const socket = useSocket();
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [chatHistory, setChatHistory] = useState({});
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [lastSeen, setLastSeen] = useState({});
  const [unreadMessages, setUnreadMessages] = useState({});
  const [userMetadata, setUserMetadata] = useState({});
  const [userProfiles, setUserProfiles] = useState({});
  
  const selectedUserRef = useRef(selectedUser);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

  const getOtherParty = useCallback((msg, currentUserEmail) => {
    const senderEmail = normalizeEmail(msg.sender);
    const receiverEmail = normalizeEmail(msg.receiver);
    const me = normalizeEmail(currentUserEmail);
    return senderEmail === me ? receiverEmail : senderEmail;
  }, []);

  // Socket Listeners
  useEffect(() => {
    if (!user || !socket) return;

    const handleJoin = () => {
      socket.emit("join", {
        email: user.email,
        profilePic: user.profilePic || null,
        displayName: user.displayName || user.email.split('@')[0]
      });
    };

    handleJoin();
    socket.on("connect", handleJoin);
    socket.on("online-users", setOnlineUsers);

    socket.on("all-user-metadata", (metadata) => {
      setUserMetadata(prev => ({ ...prev, ...metadata }));
      const initialLastSeen = {};
      const profiles = {};
      Object.keys(metadata).forEach(email => {
        if (metadata[email].lastSeen) initialLastSeen[email] = metadata[email].lastSeen;
        if (metadata[email].profilePic) profiles[email] = metadata[email].profilePic;
      });
      setLastSeen(prev => ({ ...initialLastSeen, ...prev }));
      setUserProfiles(prev => ({ ...prev, ...profiles }));
    });

    socket.on("typing", ({ from }) => {
      if (normalizeEmail(from) === normalizeEmail(selectedUserRef.current)) {
        setTypingUser(normalizeEmail(from));
      }
    });

    socket.on("stop-typing", ({ from }) => {
      if (normalizeEmail(from) === normalizeEmail(selectedUserRef.current)) {
        setTypingUser(null);
      }
    });

    socket.on("last-seen", (data) => {
      setLastSeen(prev => ({ ...prev, [data.userId]: data.time }));
    });

    socket.on("user-status-change", ({ userId, isOnline, lastSeen: time }) => {
      if (isOnline) {
        setOnlineUsers(prev => [...new Set([...prev, userId])]);
      } else {
        setOnlineUsers(prev => prev.filter(u => normalizeEmail(u) !== normalizeEmail(userId)));
        if (time) setLastSeen(prev => ({ ...prev, [userId]: time }));
      }
    });

    socket.on("unread-update", setUnreadMessages);

    socket.on("unread-update-single", ({ key, count }) => {
      setUnreadMessages(prev => ({ ...prev, [key]: count }));
    });

    socket.on("message-saved", ({ tempId, _id, timestamp }) => {
      const applySaved = (list) =>
        list.map((m) => m.tempId === tempId ? { ...m, _id, timestamp: timestamp || m.timestamp, pending: false } : m);

      if (selectedUserRef.current) {
        const partner = normalizeEmail(selectedUserRef.current);
        setChatHistory(prev => prev[partner] ? { ...prev, [partner]: applySaved(prev[partner]) } : prev);
        setMessages(prev => applySaved(prev));
      }
    });

    socket.on("receive-message", (msg) => {
      const otherParty = getOtherParty(msg, user.email);
      const isActiveChat = selectedUserRef.current && normalizeEmail(selectedUserRef.current) === otherParty;

      setChatHistory(prev => ({
        ...prev,
        [otherParty]: upsertMessageInList(prev[otherParty] || [], msg),
      }));

      if (isActiveChat) {
        setMessages(prev => upsertMessageInList(prev, msg));
        socket.emit("mark-as-read", { user1: normalizeEmail(user.email), user2: otherParty });
      } else if (normalizeEmail(msg.sender) !== normalizeEmail(user.email)) {
        setUnreadMessages(prev => {
          const key = `${otherParty}_${normalizeEmail(user.email)}`;
          return { ...prev, [key]: (prev[key] || 0) + 1 };
        });
      }
    });

    return () => {
      socket.off("connect", handleJoin);
      socket.off("online-users");
      socket.off("typing");
      socket.off("stop-typing");
      socket.off("last-seen");
      socket.off("user-status-change");
      socket.off("unread-update");
      socket.off("message-saved");
      socket.off("receive-message");
    };
  }, [socket, user, getOtherParty]);

  // Fetch initial history when selectedUser changes
  useEffect(() => {
    const syncChat = async () => {
      if (!user || !selectedUser || !socket) return;

      socket.emit("join-room", { user1: user.email, user2: selectedUser });
      socket.emit("mark-as-read", { user1: user.email, user2: selectedUser });
      
      try {
        const response = await fetchMessages(user.email, selectedUser);
        const history = response.messages || [];
        setChatHistory(prev => ({ ...prev, [selectedUser]: history }));
        setMessages(history);
      } catch (err) {
        console.error("Failed to fetch messages:", err);
      }
    };

    syncChat();
  }, [selectedUser, user, socket]);

  return {
    onlineUsers,
    chatHistory,
    setChatHistory,
    messages,
    setMessages,
    typingUser,
    lastSeen,
    unreadMessages,
    setUnreadMessages,
    userMetadata,
    setUserMetadata,
    userProfiles,
    setUserProfiles,
    socket
  };
};
