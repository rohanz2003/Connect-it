import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker from "emoji-picker-react";
import {
  Search,
  MessageCircle,
  PlusCircle,
  BellRing,
  Settings,
  Smile,
  Paperclip,
  Home,
  Send,
  Trash2,
  Users,
  Layers,
  Sun,
  Moon,
  ChevronDown,
  X,
  Minus,
  LogOut,
} from "lucide-react";
import { auth } from "../firebase";
import useSocket from "../hooks/useSocket";
import { formatLastSeen, formatMessageTime } from "../utils/timeFormatter";
import { fetchMessages, fetchRecentChats } from "../services/messageService";
import { useNavigate } from "react-router-dom";
import "./Chat.css";

const normalizeEmail = (email) => (email || "").toLowerCase().trim();

const getOtherParty = (msg, currentUserEmail) => {
  const senderEmail = normalizeEmail(msg.sender);
  const receiverEmail = normalizeEmail(msg.receiver);
  const me = normalizeEmail(currentUserEmail);
  return senderEmail === me ? receiverEmail : senderEmail;
};

const isSameMessage = (a, b) => {
  if (!a || !b) return false;
  if (a._id && b._id && String(a._id) === String(b._id)) return true;
  if (a.tempId && b.tempId && a.tempId === b.tempId) return true;
  return false;
};

const upsertMessageInList = (list, msg) => {
  const idx = list.findIndex((m) => isSameMessage(m, msg));
  if (idx === -1) {
    return [...list, msg].sort(
      (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
    );
  }
  const updated = [...list];
  updated[idx] = { ...updated[idx], ...msg };
  return updated.sort(
    (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
  );
};

function Chat({ user: currentUser }) {
  const socket = useSocket();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [chatHistory, setChatHistory] = useState({}); // Store all chats by user
  const [typingUser, setTypingUser] = useState(null);
  const [lastSeen, setLastSeen] = useState({});
  const [messages, setMessages] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState({}); // Track unread counts
  const [userProfiles, setUserProfiles] = useState({}); // Store user profile pictures
  const [isMediaSending, setIsMediaSending] = useState(false); // Track media upload state
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [isChatMinimized, setIsChatMinimized] = useState(false); // Track if chat is minimized
  const [zoomedImage, setZoomedImage] = useState(null); // State for image zoom feature
  const [isZoomMinimized, setIsZoomMinimized] = useState(false); // Track zoom bubble state
  const [contextMenu, setContextMenu] = useState(null); // { x, y, message }
  const [replyTo, setReplyTo] = useState(null); // Message being replied to
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newBio, setNewBio] = useState("");
  const [userMetadata, setUserMetadata] = useState({}); // { email: { displayName, bio, profilePic } }
  const emojiPickerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Use Ref to track selectedUser for the socket listener to avoid stale closures
  const selectedUserRef = useRef(selectedUser);
  const previousSelectedUserRef = useRef(null);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const handleZoomImage = (src) => {
    setZoomedImage(src);
    setIsZoomMinimized(false);
  };

  useEffect(() => {
    if (!zoomedImage) {
      setIsZoomMinimized(false);
    }
  }, [zoomedImage]);

  // Auto-scroll to bottom whenever messages or typing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

  // Close context menu on outside click
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Close emoji picker on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  const formatDay = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric"
    });
  };

  const getDisplayName = (email) => (email || "").split("@")[0];

  const chatHistoryRef = useRef({});
  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  const safeLocalStorageSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.warn(`Failed to persist ${key} to localStorage`, err);
      return false;
    }
  };

  // Helper to safely persist limited chat history without large media blobs or bloat
  const persistHistory = (historyObj, currentUserEmail) => {
    if (!currentUserEmail) return;
    try {
      const sanitized = {};
      Object.keys(historyObj).forEach(key => {
        // Cap to last 30 messages and strip heavy base64 media content for storage
        sanitized[key] = historyObj[key].slice(-30).map(m => ({
          ...m,
          text: m.type === 'media' ? { ...m.text, data: null, persisted: false } : m.text
        }));
      });
      try {
        localStorage.setItem(`chatHistory_${currentUserEmail}`, JSON.stringify(sanitized));
      } catch (quotaError) {
        console.warn("Chat history quota exceeded, skipping local persistence.");
      }
    } catch (e) {
      console.error("Failed to persist chat history", e);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      navigate("/");
      return;
    }

    const userData = {
      email: currentUser.email.toLowerCase(),
      profilePic: currentUser.profilePic,
      uid: currentUser.uid
    };
    setUser(userData);
    safeLocalStorageSet("user", JSON.stringify({
      email: userData.email,
      uid: userData.uid
    }));

    if (userData.profilePic) {
      setUserProfiles((prev) => ({
        ...prev,
        [userData.email.toLowerCase()]: userData.profilePic
      }));
    }

    const savedPicFromReg = localStorage.getItem(`profilePic_${userData.email.toLowerCase()}`);
    if (savedPicFromReg && !userData.profilePic) {
      setUser(prev => ({ ...prev, profilePic: savedPicFromReg }));
    }
  }, [currentUser, navigate]);

  // Load chat history from localStorage and fetch recent chats on mount
  useEffect(() => {
    if (!user) return;

    const loadChatHistory = async () => {
      try {
        // 1. Load from localStorage first (for offline access)
        const savedHistory = localStorage.getItem(`chatHistory_${user.email}`);
        if (savedHistory) {
          try {
            const parsed = JSON.parse(savedHistory);
            setChatHistory(parsed);
            console.log("✅ Loaded chat history from localStorage:", Object.keys(parsed).length, "conversations");
          } catch (e) {
            console.error("Failed to parse saved chat history", e);
          }
        }

        // 2. Fetch recent chats from server (to get the most up-to-date list)
        const recentChats = await fetchRecentChats(user.email);
        if (recentChats && recentChats.length > 0) {
          // Build chat history structure from recent chats for display purposes
          const historyFromServer = {};
          recentChats.forEach(chat => {
            if (chat.userEmail) {
              const emailKey = chat.userEmail.toLowerCase();
              historyFromServer[emailKey] = [{
                _id: chat.messageId,
                sender: user.email,
                receiver: chat.userEmail,
                text: chat.lastMessage,
                type: chat.type,
                timestamp: chat.timestamp,
                seen: false
              }];
            }
          });

          // Merge with existing localStorage data, preferring localStorage for full histories
          setChatHistory(prev => {
            const merged = { ...historyFromServer, ...prev };
            persistHistory(merged, user.email);
            return merged;
          });
          console.log("✅ Loaded", recentChats.length, "recent chats from server");
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
      }
    };

    loadChatHistory();
  }, [user]);

  useEffect(() => {
    if (!user || !socket) return;

    const handleJoin = () => {
      socket.emit("join", {
        email: user.email,
        profilePic: user.profilePic || null
      });
    };

    // Join immediately and on every reconnection
    handleJoin();
    socket.on("connect", handleJoin);

    // Restore unread counts
    const storedUnread = localStorage.getItem(`unread_${user.email.toLowerCase()}`);
    if (storedUnread) {
      try { setUnreadMessages(JSON.parse(storedUnread)); } catch (e) { console.error('Failed to parse stored unread counts', e); }
    }

    socket.on("online-users", setOnlineUsers);

    socket.on("typing", ({ from }) => {
      const activeChat = selectedUserRef.current;
      const normalizedFrom = normalizeEmail(from);
      const normalizedActiveChat = normalizeEmail(activeChat);
      console.log(`📨 Typing listener triggered: from=${normalizedFrom}, activeChat=${normalizedActiveChat}, match=${normalizedFrom === normalizedActiveChat}`);
      
      if (normalizedFrom && normalizedActiveChat && normalizedFrom === normalizedActiveChat) {
        console.log(`✅ Typing indicator set for ${normalizedFrom}`);
        setTypingUser(normalizedFrom);
      } else {
        console.warn(`❌ Typing mismatch or empty: normalizedFrom=[${normalizedFrom}], normalizedActiveChat=[${normalizedActiveChat}]`);
      }
    });

    socket.on("stop-typing", ({ from }) => {
      const activeChat = selectedUserRef.current;
      const normalizedFrom = normalizeEmail(from);
      const normalizedActiveChat = normalizeEmail(activeChat);
      console.log(`📨 Stop-typing listener triggered: from=${normalizedFrom}, activeChat=${normalizedActiveChat}, match=${normalizedFrom === normalizedActiveChat}`);
      
      if (normalizedFrom && normalizedActiveChat && normalizedFrom === normalizedActiveChat) {
        console.log(`✅ Typing indicator cleared`);
        setTypingUser(null);
        return;
      }
      setTypingUser((currentTypingUser) => {
        if (currentTypingUser && normalizeEmail(currentTypingUser) === normalizedFrom) {
          console.log(`✅ Fallback stop-typing cleared for ${normalizedFrom}`);
          return null;
        }
        return currentTypingUser;
      });
    });

    socket.on("last-seen", (data) => {
      setLastSeen((prev) => ({
        ...prev,
        [data.userId]: data.time,
      }));
    });

    // Listen for unread message updates from server
    socket.on("unread-update", (unreadData) => {
      console.log("📬 Unread messages updated:", unreadData);
      setUnreadMessages(unreadData);
    });

    // Listen for profile picture and display name updates
    socket.on("user-profile-update", (data) => {
      console.log("👤 Profile update:", data);
      setUserMetadata((prev) => ({
        ...prev,
        [data.email.toLowerCase()]: {
          displayName: data.displayName || prev[data.email.toLowerCase()]?.displayName || data.email.split('@')[0],
          profilePic: data.profilePic || prev[data.email.toLowerCase()]?.profilePic || null,
          bio: data.bio !== undefined ? data.bio : prev[data.email.toLowerCase()]?.bio || ""
        }
      }));
      
      setUserProfiles((prev) => {
        const updated = {
          ...prev,
          [data.email.toLowerCase()]: data.profilePic
        };
        // Save profiles to localStorage
        if (user) {
          localStorage.setItem(`userProfiles_${user.email.toLowerCase()}`, JSON.stringify(updated));
        }
        return updated;
      });
    });

    const handleChatCleared = ({ user1, user2, scope }) => {
      const clearedFor = normalizeEmail(user1);
      const partner = normalizeEmail(user2);
      if (clearedFor !== normalizeEmail(user.email)) return;

      setChatHistory((prev) => {
        const updated = { ...prev };
        delete updated[partner];
        persistHistory(updated, user.email);
        return updated;
      });

      setUnreadMessages((prev) => {
        const key = `${partner}_${normalizeEmail(user.email)}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        try {
          localStorage.setItem(`unread_${user.email}`, JSON.stringify(next));
        } catch (e) {
          console.error("Failed to persist unread counts", e);
        }
        return next;
      });

      if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === partner) {
        setMessages([]);
      }
    };

    socket.on("chat-cleared", handleChatCleared);

    const handleMessageSaved = ({ tempId, _id, timestamp }) => {
      const applySaved = (list) =>
        list.map((m) =>
          m.tempId === tempId
            ? { ...m, _id, timestamp: timestamp || m.timestamp, pending: false }
            : m
        );

      setChatHistory((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((key) => {
          updated[key] = applySaved(updated[key] || []);
        });
        persistHistory(updated, user.email);
        return updated;
      });

      if (selectedUserRef.current) {
        setMessages((prev) => applySaved(prev));
      }
    };

    socket.on("message-saved", handleMessageSaved);

    const handleMessageError = ({ tempId }) => {
      const markFailed = (list) =>
        list.map((m) => (m.tempId === tempId ? { ...m, failed: true, pending: false } : m));

      setMessages((prev) => markFailed(prev));
      setChatHistory((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((key) => {
          updated[key] = markFailed(updated[key] || []);
        });
        return updated;
      });
    };

    socket.on("message-error", handleMessageError);

    // Listen for message deletion
    socket.on("message-deleted", ({ messageId, sender, receiver }) => {
      const senderEmail = sender.toLowerCase();
      const receiverEmail = receiver.toLowerCase();
      const currentUserEmail = user.email.toLowerCase();
      const otherParty = senderEmail === currentUserEmail ? receiverEmail : senderEmail;

      setChatHistory((prev) => {
        const currentHistory = prev[otherParty] || [];
        const updated = {
          ...prev,
          [otherParty]: currentHistory.filter(m => (m._id !== messageId && m.tempId !== messageId))
        };
        persistHistory(updated, user?.email);
        return updated;
      });

      if (selectedUserRef.current && selectedUserRef.current.toLowerCase() === otherParty) {
        setMessages((prev) => prev.filter(m => (m._id !== messageId && m.tempId !== messageId)));
      }
    });

    // Listen for incoming messages globally (even when not in the room)
    const handleIncomingMessage = (msg) => {
      const otherParty = getOtherParty(msg, user.email);
      const isActiveChat =
        selectedUserRef.current &&
        normalizeEmail(selectedUserRef.current) === otherParty;

      setChatHistory((prev) => {
        const currentHistory = prev[otherParty] || [];
        const updated = {
          ...prev,
          [otherParty]: upsertMessageInList(currentHistory, msg),
        };
        persistHistory(updated, user.email);
        return updated;
      });

      if (isActiveChat) {
        setMessages((prev) => upsertMessageInList(prev, msg));
        socket.emit("mark-as-read", {
          user1: normalizeEmail(user.email),
          user2: otherParty,
        });
      } else if (normalizeEmail(msg.sender) !== normalizeEmail(user.email)) {
        setUnreadMessages((prev) => {
          const key = `${otherParty}_${normalizeEmail(user.email)}`;
          const newCounts = { ...prev, [key]: (prev[key] || 0) + 1 };
          try {
            localStorage.setItem(`unread_${user.email}`, JSON.stringify(newCounts));
          } catch (e) {
            console.error("Failed to persist unread counts", e);
          }
          return newCounts;
        });
      }
    };

    socket.on("receive-message", handleIncomingMessage);

    return () => {
      socket.off("connect", handleJoin);
      socket.off("online-users");
      socket.off("typing");
      socket.off("stop-typing");
      socket.off("last-seen");
      socket.off("unread-update");
      socket.off("user-profile-update");
      socket.off("chat-cleared", handleChatCleared);
      socket.off("message-saved", handleMessageSaved);
      socket.off("message-error", handleMessageError);
      socket.off("message-deleted");
      socket.off("receive-message", handleIncomingMessage);
    };
  }, [socket, user]);

  useEffect(() => {
    if (!socket || !user) return;

    const emitVisiblePresence = () => {
      if (document.hidden) {
        socket.emit("leave", { email: user.email.toLowerCase() });
      } else {
        socket.emit("join", { email: user.email.toLowerCase(), profilePic: user.profilePic || null });
      }
    };

    const handleBlur = () => {
      socket.emit("leave", { email: user.email.toLowerCase() });
    };

    const handleFocus = () => {
      socket.emit("join", { email: user.email.toLowerCase(), profilePic: user.profilePic || null });
    };

    const handleBeforeUnload = () => {
      socket.emit("leave", { email: user.email.toLowerCase() });
    };

    document.addEventListener("visibilitychange", emitVisiblePresence);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", emitVisiblePresence);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [socket, user]);

  useEffect(() => {
    const syncChat = async () => {
      if (!user || !selectedUser || !socket) return;

      console.log(`📍 Joining room and fetching history: ${user.email} ↔ ${selectedUser}`);

      // 1. Join room
      socket.emit("join-room", { user1: user.email, user2: selectedUser });
      
      // 2. Mark messages as read on server
      socket.emit("mark-as-read", { user1: user.email, user2: selectedUser });
      
      // 3. Fetch full history from Database (Fixes the "no msg show" issue)
      try {
        const history = await fetchMessages(user.email, selectedUser) || [];
        
        setChatHistory(prev => ({ ...prev, [selectedUser]: history }));
        setMessages(prev => {
          // Merge history with any new messages that arrived via socket while fetching
          const historyIds = new Set(history.map(m => m._id).filter(Boolean));
          const historyTempIds = new Set(history.map(m => m.tempId).filter(Boolean));
          const uniqueLiveMessages = prev.filter(m => !historyIds.has(m._id) && !historyTempIds.has(m.tempId));
          const merged = [...history, ...uniqueLiveMessages];
          // Always sort to ensure chronological order regardless of fetch timing
          return merged.sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));
        });
      } catch (err) {
        console.error("Failed to fetch messages:", err);
        const partner = normalizeEmail(selectedUser);
        const cached = chatHistoryRef.current[partner];
        if (cached?.length) {
          setMessages(
            cached.sort(
              (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
            )
          );
        }
      }
    };

    syncChat();
  }, [selectedUser, user, socket]);

  const stopTyping = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (user && selectedUser && socket && socket.connected) {
      const normalizedUser = normalizeEmail(user.email);
      const normalizedSelected = normalizeEmail(selectedUser);
      
      if (!normalizedUser || !normalizedSelected) {
        console.warn("❌ Stop-typing aborted: invalid email normalization");
        return;
      }
      
      const stopPayload = { from: normalizedUser, to: normalizedSelected };
      console.log("📤 Emitting stop-typing:", stopPayload);
      socket.emit("stop-typing", stopPayload);
    } else {
      console.debug("⚠️ Stop-typing not sent: missing user, selectedUser, socket, or not connected");
    }
  };

  useEffect(() => {
    setTypingUser(null);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (user && socket && socket.connected && previousSelectedUserRef.current) {
      const stopPayload = {
        from: normalizeEmail(user.email),
        to: normalizeEmail(previousSelectedUserRef.current),
      };
      socket.emit("stop-typing", stopPayload);
    }

    previousSelectedUserRef.current = selectedUser;
  }, [selectedUser, user, socket]);

  const handleTyping = (e) => {
    const val = e.target.value;
    setMessage(val);

    if (!user || !selectedUser || !socket) {
      console.warn("❌ Typing aborted: missing user, selectedUser, or socket");
      return;
    }

    if (!socket.connected) {
      console.warn("❌ Socket not connected, typing not sent");
      return;
    }

    const normalizedUser = normalizeEmail(user.email);
    const normalizedSelected = normalizeEmail(selectedUser);

    if (!normalizedUser || !normalizedSelected) {
      console.warn("❌ Typing aborted: invalid email normalization", { user: user.email, selected: selectedUser });
      return;
    }

    if (val.trim() === "") {
      stopTyping();
      return;
    }

    const typingPayload = { from: normalizedUser, to: normalizedSelected };
    console.log("📤 Emitting typing:", typingPayload);
    socket.emit("typing", typingPayload);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      console.log("⏱️ Typing timeout reached - auto stopping typing");
      stopTyping();
    }, 3000); // Timeout for better UX
  };

  const sendMessage = () => {
    if (!user || !selectedUser || !message.trim() || !socket) return;

    // Check if socket is connected
    if (!socket.connected) {
      alert("❌ You are offline. Please check your connection.");
      return;
    }

    ensureSocketJoined();

    const msgText = message;
    const tempId = `${Date.now()}-${Math.random()}`;
    console.log(`📤 Sending message from ${user.email} to ${selectedUser}: "${msgText}"`);

    // Create message object
    const newMsg = {
      sender: user.email,
      receiver: selectedUser,
      text: msgText,
      type: "text",
      tempId: tempId,
      timestamp: new Date().toISOString() // Ensure current time is captured precisely
    };

    // Add reply metadata if replying
    if (replyTo) {
      newMsg.replyTo = {
        id: replyTo._id || replyTo.tempId,
        text: replyTo.type === 'media' ? 'Media file' : replyTo.text,
        sender: replyTo.sender
      };
    }

    const optimisticMsg = { ...newMsg, pending: true, _id: tempId };
    const partner = normalizeEmail(selectedUser);

    setChatHistory((prev) => ({
      ...prev,
      [partner]: upsertMessageInList(prev[partner] || [], optimisticMsg),
    }));
    setMessages((prev) => upsertMessageInList(prev, optimisticMsg));

    socket.emit("send-message", newMsg, (ack) => {
      if (ack && ack.ok === false) {
        setMessages((prev) =>
          prev.map((m) => (m.tempId === tempId ? { ...m, failed: true, pending: false } : m))
        );
      }
    });

    stopTyping();
    setMessage("");
    setReplyTo(null);
  };

  const handleMediaShare = (e) => {
    const file = e.target.files[0];
    if (!file || !user || !selectedUser || !socket) return;

    // Check if socket is connected
    if (!socket.connected) {
      alert("❌ You are offline. Please check your connection.");
      e.target.value = null;
      return;
    }

    ensureSocketJoined();

    // Prevent multiple sends
    if (isMediaSending) {
      alert("⏳ File is already being sent. Please wait...");
      e.target.value = null;
      return;
    }

    // Validate file size - REDUCED to prevent socket timeout
    const isImage = file.type.startsWith('image/');
    const maxSize = isImage ? 3 * 1024 * 1024 : 10 * 1024 * 1024; // 3MB images, 10MB others
    
    if (file.size > maxSize) {
      alert(`File size must be less than ${isImage ? '3MB' : '10MB'}. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      e.target.value = null;
      return;
    }

    setIsMediaSending(true);
    const tempId = `${Date.now()}-${Math.random()}`;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        // Don't send huge base64 strings - compress image if possible
        let fileData = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: reader.result
        };

        console.log(`📎 Sending file: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`);

        // Create message object
        const newMsg = {
          sender: user.email,
          receiver: selectedUser,
          text: fileData,
          type: "media",
          mediaType: file.type.split('/')[0],
          tempId: tempId,
          timestamp: new Date().toISOString()
        };

        const optimisticMsg = { ...newMsg, pending: true, _id: tempId };
        const partner = normalizeEmail(selectedUser);

        setChatHistory((prev) => ({
          ...prev,
          [partner]: upsertMessageInList(prev[partner] || [], optimisticMsg),
        }));
        setMessages((prev) => upsertMessageInList(prev, optimisticMsg));

        socket.emit("send-message", newMsg, (ack) => {
          if (!ack || ack.ok === false) {
            setMessages((prev) =>
              prev.map((m) => (m.tempId === tempId ? { ...m, failed: true, pending: false } : m))
            );
          }
        });
        
      } catch (err) {
        console.error("❌ Error processing file:", err);
        alert("❌ Error sending file. Please try again.");
      } finally {
        setIsMediaSending(false);
        e.target.value = null;
      }
    };

    reader.onerror = () => {
      console.error("❌ Error reading file");
      alert("❌ Error reading file. Please try again.");
      setIsMediaSending(false);
      e.target.value = null;
    };

    // Read file as base64 but with a safety check
    try {
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("❌ Cannot read file:", err);
      alert("❌ Cannot read this file. Please try another.");
      setIsMediaSending(false);
      e.target.value = null;
    }
  };

  const clearChatForPartner = (partnerEmail) => {
    if (!user || !socket?.connected || !partnerEmail) return;

    socket.emit(
      "clear-chat",
      { user1: normalizeEmail(user.email), user2: normalizeEmail(partnerEmail) },
      (ack) => {
        if (!ack?.ok) {
          alert("Failed to clear chat. Please try again.");
        }
      }
    );

    const partner = normalizeEmail(partnerEmail);
    setChatHistory((prev) => {
      const updated = { ...prev };
      delete updated[partner];
      persistHistory(updated, user.email);
      return updated;
    });

    setUnreadMessages((prev) => {
      const key = `${partner}_${normalizeEmail(user.email)}`;
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      try {
        localStorage.setItem(`unread_${user.email}`, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to persist unread counts", e);
      }
      return next;
    });

    if (selectedUser && normalizeEmail(selectedUser) === partner) {
      setMessages([]);
    }
  };

  const handleClearCurrentChat = () => {
    if (!selectedUser) return;
    if (
      window.confirm(
        "Clear this chat for you only? The other person will still see all messages."
      )
    ) {
      clearChatForPartner(selectedUser);
    }
  };

  const handleClearAllHistory = () => {
    if (!user) return;
    if (
      window.confirm(
        "Clear all recent chats from your list? This will not delete the messages from the server."
      )
    ) {
      localStorage.removeItem(`chatHistory_${user.email}`);
      localStorage.removeItem(`unread_${user.email}`);
      setChatHistory({});
      setMessages([]);
      setUnreadMessages({});
      setSelectedUser(null);
    }
  };

  const handleRemoveChatFromRecent = (e, partnerEmail) => {
    e.stopPropagation(); // Prevent selecting the user
    if (!user || !partnerEmail) return;

    if (window.confirm(`Remove ${partnerEmail} from your recent chats?`)) {
      const partner = normalizeEmail(partnerEmail);
      
      setChatHistory((prev) => {
        const updated = { ...prev };
        delete updated[partner];
        persistHistory(updated, user.email);
        return updated;
      });

      if (selectedUser && normalizeEmail(selectedUser) === partner) {
        setMessages([]);
        setSelectedUser(null);
      }
    }
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({
      x: e.pageX,
      y: e.pageY,
      message: msg
    });
  };

  const handleDeleteMessage = (msg) => {
    if (window.confirm("Are you sure you want to delete this message?")) {
      socket.emit("delete-message", { 
        messageId: msg._id || msg.tempId, 
        sender: msg.sender, 
        receiver: msg.receiver 
      });
    }
  };

  const handleUpdateProfilePic = (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress image to 150px max dimension
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 150;
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const newPic = canvas.toDataURL("image/jpeg", 0.7);

        const updatedUser = { ...user, profilePic: newPic };
        setUser(updatedUser);

        safeLocalStorageSet("user", JSON.stringify({
          email: updatedUser.email,
          uid: updatedUser.uid,
          displayName: updatedUser.displayName || user.email.split('@')[0],
          profilePic: newPic
        }));
        safeLocalStorageSet(`profilePic_${user.email.toLowerCase()}`, newPic);

        // 3. Update the profiles map immediately
        setUserProfiles(prev => ({
          ...prev,
          [user.email.toLowerCase()]: newPic
        }));

        // 4. Inform the server
        if (socket) {
          socket.emit("update-profile", { 
            email: user.email, 
            profilePic: newPic,
            displayName: user.displayName || user.email.split('@')[0]
          });
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateDisplayName = () => {
    if (!newDisplayName.trim() || !user || !socket) return;
    
    const updatedUser = { ...user, displayName: newDisplayName.trim() };
    setUser(updatedUser);
    
    socket.emit("update-profile", {
      email: user.email,
      displayName: newDisplayName.trim(),
      bio: newBio
    });
    
    safeLocalStorageSet("user", JSON.stringify({
      email: updatedUser.email,
      uid: updatedUser.uid,
      displayName: updatedUser.displayName,
      profilePic: updatedUser.profilePic
    }));
    
    alert("Profile updated successfully!");
  };

  const ensureSocketJoined = () => {
    if (!socket || !user) return;
    socket.emit("join", {
      email: normalizeEmail(user.email),
      profilePic: user.profilePic || null,
    });
  };

  const performLogout = () => {
    if (socket && user) {
      socket.emit("leave", { email: normalizeEmail(user.email) });
    }
    setShowLogoutConfirm(false);
    navigate("/feedback");
    auth.signOut().then(() => {
      localStorage.removeItem("user");
    });
  };

  const handleUserSelect = (u) => {
    console.log(`👤 Selected user: ${u}`);
    setSelectedUser(u);
    
    // Update messages when user is selected, ensuring chronological order
    if (chatHistory[u]) {
      setMessages(chatHistory[u].sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)));
    }

    // Clear unread badge for this chat
    if (user) {
      setUnreadMessages(prev => {
        const key = `${u.toLowerCase()}_${user.email.toLowerCase()}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        try { localStorage.setItem(`unread_${user.email}`, JSON.stringify(next)); } catch (e) { console.error('Failed to persist unread counts', e); }
        return next;
      });
    }
  };

  // Filter out current user from the user list
  const otherOnlineUsers = onlineUsers.filter(u => 
    u.toLowerCase().trim() !== user?.email?.toLowerCase().trim()
  );
  
  // Get recent chats sorted by latest message
  const recentChats = Object.keys(chatHistory)
    .filter(u => u !== user?.email)
    .sort((a, b) => {
      const historyA = chatHistory[a] || [];
      const historyB = chatHistory[b] || [];
      const lastA = historyA[historyA.length - 1];
      const lastB = historyB[historyB.length - 1];
      const timeA = new Date(lastA?.timestamp || lastA?.createdAt || 0);
      const timeB = new Date(lastB?.timestamp || lastB?.createdAt || 0);
      return new Date(timeB) - new Date(timeA);
    });

  const isUserOnline = (userEmail) =>
    onlineUsers.some((u) => normalizeEmail(u) === normalizeEmail(userEmail));

  // Get unread count for a user
  const getUnreadCount = (otherUser) => {
    if (!user || !otherUser) return 0;
    const key = `${otherUser.toLowerCase()}_${user.email.toLowerCase()}`;
    return unreadMessages[key] || 0;
  };

  const searchValue = searchTerm.trim().toLowerCase();
  const filteredRecentChats = recentChats.filter((u) => {
    const normalizedEmail = normalizeEmail(u);
    return (
      normalizedEmail.includes(searchValue) ||
      getDisplayName(u).includes(searchValue) ||
      (userProfiles[u] || "").toLowerCase().includes(searchValue)
    );
  });
  const filteredOnlineUsers = otherOnlineUsers.filter((u) => {
    const normalizedEmail = normalizeEmail(u);
    return (
      normalizedEmail.includes(searchValue) ||
      getDisplayName(u).includes(searchValue) ||
      (userProfiles[u] || "").toLowerCase().includes(searchValue)
    );
  });

  if (!user) return <h2>Loading...</h2>;

  return (
    <div className={`chat-layout ${isDarkMode ? "dark" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-head">
            <div className="brand-mark">C</div>
            <div className="brand-copy">
              <strong>Connect</strong>
              <span>Enterprise messenger</span>
            </div>
          </div>
          <button
            className="theme-toggle"
            onClick={() => setIsDarkMode((prev) => !prev)}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="sidebar-tabs">
          <button className="tab active">
            <MessageCircle size={16} /> Chats
          </button>
        </div>

        <div className="sidebar-search">
          <Search size={16} />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search conversations"
          />
        </div>

        <div className="profile-card">
          <div className="profile-card-main">
            <img
              src={userProfiles[user.email.toLowerCase()] || user.profilePic || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80"}
              alt={user.email}
              className="profile-card-avatar"
              onClick={() => handleZoomImage(userProfiles[user.email.toLowerCase()] || user.profilePic || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80")}
            />
            <div>
              <span className="profile-name">
                {user.displayName || user.email.split("@")[0]}
              </span>
              <span className="profile-meta">
                {isUserOnline(user.email) ? "Online" : "Offline"}
              </span>
            </div>
          </div>
          <button
            className="primary-btn"
            onClick={() => setSelectedUser(null)}
          >
            <PlusCircle size={16} /> New Message
          </button>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Recent Chats</div>
          <div className="sidebar-list">
            {filteredRecentChats.length > 0 ? filteredRecentChats.map((u, i) => {
              const unreadCount = getUnreadCount(u);
              return (
                <div
                  key={`recent-${i}`}
                  className={`user-item ${selectedUser === u ? "active" : ""}`}
                  onClick={() => handleUserSelect(u)}
                >
                  <div className="avatar-wrap">
                    <img
                      src={userProfiles[u] || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"}
                      alt={u}
                      className="user-avatar"
                      onClick={(e) => { e.stopPropagation(); handleZoomImage(userProfiles[u] || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"); }}
                    />
                    {isUserOnline(u) && <span className="status-dot" />}
                  </div>
                  <div className="user-item-copy">
                    <span className="user-name">
                      {userMetadata[u.toLowerCase()]?.displayName || u.split('@')[0]}
                    </span>
                    <span className="user-last">{isUserOnline(u) ? "Online" : "Last active"}</span>
                  </div>
                  <div className="user-item-actions">
                    {unreadCount > 0 && (
                      <span className="unread-badge">{unreadCount}</span>
                    )}
                    <button 
                      className="remove-recent-btn" 
                      onClick={(e) => handleRemoveChatFromRecent(e, u)}
                      title="Remove from list"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            }) : (
              <div className="empty-list">Try searching or start a new conversation.</div>
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Online Users</div>
          <div className="sidebar-list">
            {filteredOnlineUsers.length > 0 ? filteredOnlineUsers.map((u, i) => (
              <div
                key={`online-${i}`}
                className={`user-item ${selectedUser === u ? "active" : ""}`}
                onClick={() => handleUserSelect(u)}
              >
                <div className="avatar-wrap">
                  <img
                    src={userProfiles[u] || "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80"}
                    alt={u}
                    className="user-avatar"
                    onClick={(e) => { e.stopPropagation(); handleZoomImage(userProfiles[u] || "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80"); }}
                  />
                  <span className="status-dot online" />
                </div>
                <div className="user-item-copy">
                  <span className="user-name">
                    {userMetadata[u.toLowerCase()]?.displayName || u.split('@')[0]}
                  </span>
                  <span className="user-last">Available now</span>
                </div>
                {getUnreadCount(u) > 0 && (
                  <span className="unread-badge">{getUnreadCount(u)}</span>
                )}
              </div>
            )) : (
              <div className="empty-list">No contacts are available right now.</div>
            )}
          </div>
        </div>

        <div className="sidebar-actions">
          <button className="secondary-btn" onClick={handleClearAllHistory}>
            <Trash2 size={16} /> Archive
          </button>
          <button className="secondary-btn">
            <BellRing size={16} /> Help
          </button>
        </div>
      </aside>

      <main className="chat-panel">
        <div className="chat-panel-header">
          <div className="chat-panel-title">
            <div className="header-avatar-wrap">
              <img
                src={selectedUser ? userProfiles[selectedUser] || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80" : "https://images.unsplash.com/photo-1503416997304-3cc562acfdc5?auto=format&fit=crop&w=200&q=80"}
                alt={selectedUser || "Start"}
                className="header-avatar"
                onClick={() => selectedUser && handleZoomImage(userProfiles[selectedUser] || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80")}
              />
            </div>
            <div>
              <h3>
                {selectedUser 
                  ? (userMetadata[selectedUser.toLowerCase()]?.displayName || selectedUser.split('@')[0]) 
                  : "Welcome to Connect"}
              </h3>
              <p>{selectedUser ? (isUserOnline(selectedUser) ? "Online" : formatLastSeen(lastSeen[selectedUser])) : "Choose a conversation or create a new one."}</p>
            </div>
          </div>
          <div className="chat-header-actions">
            {selectedUser && (
              <>
                <button
                  className="secondary-btn clear-chat-btn"
                  title="Clear chat for you only"
                  onClick={handleClearCurrentChat}
                >
                  <Trash2 size={16} /> Clear Chat
                </button>
                <button 
                  className="icon-btn minimize-btn" 
                  title={isChatMinimized ? "Expand chat" : "Minimize chat"}
                  onClick={() => setIsChatMinimized(!isChatMinimized)}
                >
                  {isChatMinimized ? <ChevronDown size={18} /> : <ChevronDown size={18} style={{ transform: 'rotate(180deg)' }} />}
                </button>
                <button 
                  className="icon-btn close-btn" 
                  title="Close chat"
                  onClick={() => {
                    setSelectedUser(null);
                    setIsChatMinimized(false);
                  }}
                >
                  <X size={18} />
                </button>
              </>
            )}
            <button 
              className="icon-btn" 
              title="Settings" 
              style={{ cursor: 'pointer' }}
              onClick={() => {
                setNewDisplayName(user?.displayName || user?.email?.split('@')[0] || "");
                setNewBio(user?.bio || "");
                setShowSettings(true);
              }}
            >
              <Settings size={18} />
            </button>
            <button
              className="logout-btn"
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="logout-modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="logout-modal settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="settings-header">
                <h3>Settings</h3>
                <button className="close-btn" onClick={() => setShowSettings(false)}><X size={20} /></button>
              </div>
              
              <div className="settings-body">
                <div className="settings-section">
                  <label>Profile Picture</label>
                  <div className="settings-avatar-edit">
                    <img 
                      src={user?.profilePic || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80"} 
                      alt="Profile" 
                      className="settings-large-avatar"
                    />
                    <label htmlFor="update-profile-pic-settings" className="change-dp-btn">Change Photo</label>
                    <input
                      id="update-profile-pic-settings"
                      type="file"
                      accept="image/*"
                      onChange={handleUpdateProfilePic}
                      style={{ display: "none" }}
                    />
                  </div>
                </div>

                <div className="settings-section">
                  <label>Display Name</label>
                  <input 
                    type="text" 
                    value={newDisplayName} 
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="settings-input"
                  />
                  <p className="settings-hint">This name will be visible to everyone on the server.</p>
                </div>

                <div className="settings-section">
                  <label>Bio / About</label>
                  <textarea 
                    value={newBio} 
                    onChange={(e) => setNewBio(e.target.value)}
                    placeholder="Tell others about yourself..."
                    className="settings-input settings-textarea"
                  />
                </div>

                <div className="settings-info-box">
                  <label>Account Information</label>
                  <div className="info-row">
                    <span>Email:</span>
                    <strong>{user?.email}</strong>
                  </div>
                  <div className="info-row">
                    <span>User ID:</span>
                    <code>{user?.uid?.slice(0, 8)}...</code>
                  </div>
                </div>
              </div>

              <div className="settings-footer">
                <button className="logout-cancel-btn" onClick={() => setShowSettings(false)}>Cancel</button>
                <button className="logout-confirm-btn save-profile-btn" onClick={() => {
                  handleUpdateDisplayName();
                  setShowSettings(false);
                }}>Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {showLogoutConfirm && (
          <div className="logout-modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
            <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Log out?</h3>
              <p>You will be signed out of Connect It.</p>
              <div className="logout-modal-actions">
                <button type="button" className="logout-cancel-btn" onClick={() => setShowLogoutConfirm(false)}>
                  Cancel
                </button>
                <button type="button" className="logout-confirm-btn" onClick={performLogout}>
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {!isChatMinimized && (
        <div className="chat-panel-body">
          {selectedUser ? (
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="empty-chat-state">
                  <MessageCircle size={32} />
                  <h4>No messages yet</h4>
                  <p>Send the first message to start the conversation.</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const previousMsg = messages[i - 1];
                  const showDay = !previousMsg || new Date(msg.timestamp || msg.createdAt).toDateString() !== new Date(previousMsg.timestamp || previousMsg.createdAt).toDateString();
                  return (
                    <React.Fragment key={msg._id || msg.tempId || `msg-${i}`}>
                      {showDay && (
                        <div className="day-separator">
                          <span>{formatDay(msg.timestamp || msg.createdAt)}</span>
                        </div>
                      )}
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className={`message ${msg.sender === user.email ? "sent" : "received"}`}
                        onContextMenu={(e) => handleContextMenu(e, msg)}
                      >
                        <div className="message-content">
                          {msg.replyTo && (
                            <div className="reply-quote">
                              <small>{msg.replyTo.sender === user.email ? "You" : msg.replyTo.sender.split('@')[0]}</small>
                              <p>{msg.replyTo.text}</p>
                            </div>
                          )}
                          {msg.type === "media" ? (
                            <div className="media-message">
                              {msg.mediaType === "image" && msg.text?.data?.startsWith("data:image/") && (
                                <img src={msg.text.data} alt="Shared" className="media-image" onClick={() => handleZoomImage(msg.text.data)} />
                              )}
                              {msg.mediaType === "video" && msg.text?.data?.startsWith("data:video/") && (
                                <video controls className="media-video">
                                  <source src={msg.text.data} type={msg.text.type} />
                                  Your browser does not support video playback
                                </video>
                              )}
                              {msg.mediaType === "application" && msg.text?.data?.startsWith("data:application/") && (
                                <div className="media-file">
                                  <span>📎 {msg.text.name}</span>
                                  <a href={msg.text.data} download={msg.text.name} className="download-btn">Download</a>
                                </div>
                              )}
                              {msg.text?.data && msg.mediaType !== "image" && msg.mediaType !== "video" && msg.mediaType !== "application" && (
                                <div className="media-file">
                                  <span>📎 {msg.text?.name || "Attachment"}</span>
                                  {msg.text?.data && (
                                    <a href={msg.text.data} download={msg.text?.name} className="download-btn">Download</a>
                                  )}
                                </div>
                              )}
                              {!msg.text?.data && msg.type === "media" && (
                                <span className="media-unavailable">Media unavailable (reload chat)</span>
                              )}
                            </div>
                          ) : (
                            msg.text
                          )}
                        </div>
                        <div className="message-meta">
                          <span>{formatMessageTime(msg.timestamp || msg.createdAt)}</span>
                          {msg.pending && <span className="message-status pending">Sending…</span>}
                          {msg.failed && <span className="message-status failed">Failed</span>}
                          {msg.sender === user.email && !msg.pending && !msg.failed && (
                            <span className="read-receipt">✓✓</span>
                          )}
                        </div>
                      </motion.div>
                    </React.Fragment>
                  );
                })
              )}

              <AnimatePresence>
                {typingUser && typingUser !== user.email && (
                  <motion.div
                    className="typing-indicator"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    title="Someone is typing..."
                  >
                    <span />
                    <span />
                    <span />
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <div className="welcome-panel">
                <h2>Welcome back, {user.email.split("@")[0]} 👋</h2>
                <p>Pick a chat or start messaging a colleague from the sidebar.</p>
              </div>
            </div>
          )}
        </div>
        )}

        {!isChatMinimized && (
        <div className="chat-panel-footer">
          {showEmojiPicker && (
            <div ref={emojiPickerRef} style={{ position: 'absolute', bottom: '100%', left: '0', zIndex: 1000, marginBottom: '10px' }}>
              <EmojiPicker 
                onEmojiClick={(emojiData) => setMessage(prev => prev + emojiData.emoji)}
                theme={isDarkMode ? "dark" : "light"}
              />
            </div>
          )}
          {replyTo && (
            <div className="reply-preview">
              <div className="reply-preview-content">
                <small>Replying to {replyTo.sender === user.email ? "yourself" : replyTo.sender.split('@')[0]}</small>
                <p>{replyTo.type === 'media' ? 'Media file' : replyTo.text}</p>
              </div>
              <button className="close-reply" onClick={() => setReplyTo(null)}><X size={14} /></button>
            </div>
          )}
          <button 
            className="secondary-icon-btn" 
            title="Emoji"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile size={18} />
          </button>
          <button className="secondary-icon-btn" title="Attach file">
            <Paperclip size={18} />
          </button>
          <input
            type="text"
            placeholder={selectedUser ? "Write a message..." : "Select a conversation to send a message"}
            value={message}
            onChange={handleTyping}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            onBlur={() => {
              // ensure typing state is cleared when input loses focus
              stopTyping();
            }}
            disabled={!selectedUser}
          />
          <label htmlFor="media-input" className="secondary-icon-btn" title="Upload media">
            <PlusCircle size={18} />
          </label>
          <input
            id="media-input"
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            onChange={handleMediaShare}
            disabled={!selectedUser}
            style={{ display: "none" }}
          />
          <button className="send-btn" onClick={sendMessage} disabled={!selectedUser}>
            <Send size={18} />
          </button>
        </div>
        )}
      </main>

      <aside className="dashboard-panel">
        <div className="dashboard-card welcome-card">
          <div className="dashboard-card-head">
            <div>
              <span className="eyebrow">Good day</span>
              <h4>Ready to connect?</h4>
            </div>
            <Home size={20} />
          </div>
          <p>Start a new chat, review mentions, and stay updated with your team activity.</p>
        </div>

        <div className="dashboard-card stats-card">
          <div className="dashboard-card-head">
            <span className="eyebrow">Analytics</span>
            <span>Live insights</span>
          </div>
          <div className="stats-grid">
            <div className="stat-item">
              <span>24</span>
              <small>Active chats</small>
            </div>
            <div className="stat-item">
              <span>8</span>
              <small>Unread</small>
            </div>
            <div className="stat-item">
              <span>3</span>
              <small>New contacts</small>
            </div>
          </div>
          <div className="bar-chart" />
        </div>

        <div className="dashboard-card actions-card">
          <div className="dashboard-card-head">
            <span className="eyebrow">Quick actions</span>
            <span>Faster workflow</span>
          </div>
          <div className="action-list">
            <button className="action-pill"><PlusCircle size={16} /> Start new chat</button>
            <button className="action-pill"><Users size={16} /> Invite team member</button>
            <button className="action-pill"><Layers size={16} /> View activity</button>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {isMediaSending && (
          <motion.div
            className="toast-notice"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            Uploading file...
          </motion.div>
        )}
      </AnimatePresence>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null); }}>
            <MessageCircle size={14} /> Reply
          </button>
          {contextMenu.message.sender === user.email && (
            <button className="delete-option" onClick={() => { handleDeleteMessage(contextMenu.message); setContextMenu(null); }}>
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      )}

      {zoomedImage && isZoomMinimized && (
        <div className="zoom-minimized-bubble">
          <img src={zoomedImage} alt="Minimized preview" />
          <div className="zoom-minimized-copy">
            <strong>Profile preview minimized</strong>
            <span>Tap to expand</span>
          </div>
          <button
            className="zoom-minimized-close"
            onClick={() => {
              setZoomedImage(null);
              setIsZoomMinimized(false);
            }}
            aria-label="Close preview"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {zoomedImage && !isZoomMinimized && (
        <div className="image-zoom-overlay" onClick={() => { setZoomedImage(null); setIsZoomMinimized(false); }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="zoom-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="zoom-header">
              <div className="zoom-title">Profile picture preview</div>
              <button className="close-zoom" onClick={() => { setZoomedImage(null); setIsZoomMinimized(false); }} aria-label="Close preview">
                <X size={24} />
              </button>
            </div>
            <div className="zoom-image-circle">
              <img src={zoomedImage} alt="Zoomed DP" />
            </div>
            <div className="zoom-controls">
              <button className="zoom-control-btn min" onClick={() => setIsZoomMinimized(true)} title="Minimize preview">
                <Minus size={20} />
              </button>
              <button className="zoom-control-btn close" onClick={() => { setZoomedImage(null); setIsZoomMinimized(false); }} title="Close preview">
                <X size={20} />
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <button
        className="mobile-logout-fab"
        type="button"
        aria-label="Logout"
        onClick={() => setShowLogoutConfirm(true)}
      >
        <LogOut size={22} />
      </button>

      <nav className="bottom-nav">
        <button className="bottom-nav-btn active"><MessageCircle size={18} /><span>Chat</span></button>
        <button className="bottom-nav-btn"><Users size={18} /><span>Contacts</span></button>
        <button className="bottom-nav-btn"><BellRing size={18} /><span>Alerts</span></button>
        <button className="bottom-nav-btn"><Settings size={18} /><span>More</span></button>
      </nav>
    </div>
  );
}

export default Chat;
