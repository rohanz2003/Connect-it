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
  Archive,
  Download,
} from "lucide-react";
import { auth } from "../firebase";
import useSocket from "../hooks/useSocket";
import { formatLastSeen, formatMessageTime } from "../utils/timeFormatter";
import { fetchMessages, fetchRecentChats, archiveChat as archiveChatService, clearAllChats as clearAllChatsService } from "../services/messageService";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import ErrorBoundary from "./ErrorBoundary";
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

  const [user, setUser] = useState(() => {
    if (currentUser) return currentUser;
    const saved = localStorage.getItem("user");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });
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
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0); // Track progress percentage
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
  const [tempProfilePic, setTempProfilePic] = useState(null);
  const [userMetadata, setUserMetadata] = useState({}); // { email: { displayName, bio, profilePic } }
  const emojiPickerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingEmitRef = useRef(0);
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

  const handleDownloadImage = (e) => {
    e.stopPropagation();
    if (!zoomedImage) return;
    const link = document.createElement("a");
    link.href = zoomedImage;
    link.download = `profile-picture-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (!zoomedImage) {
      setIsZoomMinimized(false);
    }
  }, [zoomedImage]);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const prevMessagesLengthRef = useRef(0);
  const scrollContainerRef = useRef(null);

  // Scroll event handler to detect if user is near bottom
  const handleScrollEvent = () => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // If within 100px of bottom, consider "pinned"
    const nearBottom = distanceFromBottom < 100;
    setIsNearBottom(nearBottom);
  };

  useEffect(() => {
    if (!messagesEndRef.current) return;
    const container = messagesEndRef.current.parentElement;
    scrollContainerRef.current = container;
    container.addEventListener("scroll", handleScrollEvent);
    return () => container.removeEventListener("scroll", handleScrollEvent);
  }, []);

  // Intelligent Auto-Scroll Logic
  useEffect(() => {
    if (!messagesEndRef.current) return;

    const isNewMessageAdded = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    const lastMsg = messages[messages.length - 1];
    const isMyMessage = lastMsg?.sender?.toLowerCase() === user?.email?.toLowerCase();

    // 🚩 CRITICAL SCROLL CONDITIONS:
    // 1. We only auto-scroll if a NEW message was actually added to the list
    // 2. AND (we were already near the bottom OR it's a message WE just sent)
    if (isNewMessageAdded && (isNearBottom || isMyMessage)) {
      // Use requestAnimationFrame for smoother, more reliable scrolling than setTimeout
      requestAnimationFrame(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      });
    }
  }, [messages, user?.email]); // Dependencies are strictly messages and current user

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

  const getDisplayName = (email) => {
    if (!email || typeof email !== 'string') return "User";
    const lowerEmail = email.toLowerCase();
    return userMetadata[lowerEmail]?.displayName || user?.displayName || email.split("@")[0];
  };

  const renderAvatar = (email, size = "md", customSrc = null) => {
    if (!email) return null;
    const lowerEmail = email.toLowerCase();
    
    // Check if this is the current user
    const isMe = user && lowerEmail === user.email.toLowerCase();
    
    // Get the most up-to-date data from userMetadata or the current user state
    const metadata = userMetadata[lowerEmail];
    const src = customSrc || (isMe ? user?.profilePic : metadata?.profilePic) || userProfiles[lowerEmail];
    const name = (isMe ? user?.displayName : metadata?.displayName) || email.split('@')[0];

    return (
      <Avatar 
        email={lowerEmail}
        name={name}
        src={src}
        size={size}
        onClick={src ? (e) => {
          e.stopPropagation();
          handleZoomImage(src);
        } : undefined}
      />
    );
  };

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

  useEffect(() => {
    if (!currentUser) {
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setUser(parsed);
          setNewDisplayName(parsed.displayName || (parsed.email ? parsed.email.split('@')[0] : "User"));
          return;
        } catch (e) {
          console.error("Failed to parse saved user", e);
        }
      }
      navigate("/");
      return;
    }

    const email = currentUser.email ? currentUser.email.toLowerCase() : "";
    const userData = {
      email: email,
      profilePic: currentUser.profilePic || (email ? localStorage.getItem(`profilePic_${email}`) : null),
      uid: currentUser.uid,
      displayName: currentUser.displayName || (email ? email.split('@')[0] : "User")
    };
    
    setUser(userData);
    setNewDisplayName(userData.displayName);
    
    safeLocalStorageSet("user", JSON.stringify(userData));

    if (userData.profilePic) {
      setUserProfiles((prev) => ({
        ...prev,
        [userData.email.toLowerCase()]: userData.profilePic
      }));
    }
  }, [currentUser, navigate]);

  // Load recent chats from server on mount
  useEffect(() => {
    if (!user) return;

    const loadChatHistory = async () => {
      try {
        const userKey = normalizeEmail(user.email);
        
        // Fetch recent chats from server (source of truth)
        const recentChats = await fetchRecentChats(userKey);
        if (recentChats && recentChats.length > 0) {
          // Build chat history structure from recent chats for display purposes
          const historyFromServer = {};
          recentChats.forEach(chat => {
            if (chat.userEmail) {
              const emailKey = normalizeEmail(chat.userEmail);
              // Initialize with the last message so the sidebar shows something
              historyFromServer[emailKey] = [{
                _id: chat.messageId,
                sender: userKey,
                receiver: chat.userEmail,
                text: chat.lastMessage,
                type: chat.type,
                timestamp: chat.timestamp,
                seen: false
              }];
            }
          });

          setChatHistory(historyFromServer);
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
        profilePic: user.profilePic || null,
        displayName: user.displayName || user.email.split('@')[0]
      });
    };

    // Join immediately and on every reconnection
    handleJoin();
    socket.on("connect", handleJoin);

    socket.on("online-users", setOnlineUsers);

    socket.on("all-user-metadata", (metadata) => {
      console.log("📊 Received all user metadata:", Object.keys(metadata).length, "profiles");
      setUserMetadata(prev => ({ ...prev, ...metadata }));
      
      // Update lastSeen and userProfiles map
      const initialLastSeen = {};
      const profiles = {};
      Object.keys(metadata).forEach(email => {
        if (metadata[email].lastSeen) {
          initialLastSeen[email] = metadata[email].lastSeen;
        }
        if (metadata[email].profilePic) {
          profiles[email] = metadata[email].profilePic;
        }
      });
      setLastSeen(prev => ({ ...initialLastSeen, ...prev }));
      setUserProfiles(prev => ({ ...prev, ...profiles }));
    });

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

    socket.on("user-status-change", ({ userId, isOnline, lastSeen: time }) => {
      console.log(`🌐 Status change for ${userId}: ${isOnline ? 'Online' : 'Offline'}`);
      
      if (isOnline) {
        setOnlineUsers(prev => [...new Set([...prev, userId])]);
      } else {
        setOnlineUsers(prev => prev.filter(u => normalizeEmail(u) !== normalizeEmail(userId)));
        if (time) {
          setLastSeen(prev => ({ ...prev, [userId]: time }));
        }
      }
    });

    // Listen for unread message updates from server
    socket.on("unread-update", (unreadData) => {
      console.log("📬 Unread messages updated:", unreadData);
      setUnreadMessages(unreadData);
    });

    // Listen for profile picture and display name updates
    socket.on("user-profile-update", (data) => {
      console.log("👤 Profile update received for:", data.email);
      const normalizedUpdateEmail = data.email.toLowerCase();
      const isMe = user && normalizedUpdateEmail === user.email.toLowerCase();
      
      const updatedInfo = {
        displayName: data.displayName,
        profilePic: data.profilePic || null,
        bio: data.bio || ""
      };

      if (isMe) {
        setUser(prev => ({
          ...prev,
          ...updatedInfo
        }));
        
        // Persist to local storage
        localStorage.setItem("user", JSON.stringify({
          ...user,
          ...updatedInfo
        }));
      }

      setUserMetadata((prev) => ({
        ...prev,
        [normalizedUpdateEmail]: updatedInfo
      }));
      
      setUserProfiles((prev) => ({
        ...prev,
        [normalizedUpdateEmail]: data.profilePic || null
      }));
    });

    const handleChatCleared = ({ user1, user2, scope }) => {
      const clearedFor = normalizeEmail(user1);
      const partner = normalizeEmail(user2);
      if (clearedFor !== normalizeEmail(user.email)) return;

      setChatHistory((prev) => {
        const updated = { ...prev };
        delete updated[partner];
        return updated;
      });

      setUnreadMessages((prev) => {
        const key = `${partner}_${normalizeEmail(user.email)}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
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

      // Only update the selectedUser's messages and the corresponding entry in chatHistory
      if (selectedUserRef.current) {
        const partner = normalizeEmail(selectedUserRef.current);
        setChatHistory((prev) => {
          if (!prev[partner]) return prev;
          return {
            ...prev,
            [partner]: applySaved(prev[partner])
          };
        });
        setMessages((prev) => applySaved(prev));
      } else {
        // Fallback for when no user is selected but a message was saved in background
        setChatHistory((prev) => {
          const updated = { ...prev };
          Object.keys(updated).forEach((key) => {
            if (updated[key].some(m => m.tempId === tempId)) {
              updated[key] = applySaved(updated[key]);
            }
          });
          return updated;
        });
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
      socket.off("user-status-change");
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

    const handleBeforeUnload = () => {
      socket.emit("leave", { email: user.email.toLowerCase() });
    };

    document.addEventListener("visibilitychange", emitVisiblePresence);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", emitVisiblePresence);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [socket, user]);

  useEffect(() => {
    let isCancelled = false;
    const syncChat = async () => {
      if (!user || !selectedUser || !socket) return;

      const currentSelectedUser = normalizeEmail(selectedUser);
      console.log(`📍 Joining room and fetching history: ${user.email} ↔ ${currentSelectedUser}`);

      // 1. Join room
      socket.emit("join-room", { user1: user.email, user2: currentSelectedUser });
      
      // 2. Mark messages as read on server
      socket.emit("mark-as-read", { user1: user.email, user2: currentSelectedUser });
      
      // 3. Fetch full history from Database
      try {
        const response = await fetchMessages(user.email, currentSelectedUser);
        const history = Array.isArray(response) ? response : (response?.messages || []);
        
        if (isCancelled) return;

        setChatHistory(prev => {
          const partner = currentSelectedUser;
          // IMPORTANT: If we have cached messages, we show them, but we MUST merge with fresh data
          const currentInHistory = prev[partner] || [];
          
          // Deduplicate
          const historyIds = new Set(history.map(m => m._id).filter(Boolean));
          const historyTempIds = new Set(history.map(m => m.tempId).filter(Boolean));
          
          const uniqueLiveMessages = currentInHistory.filter(m => 
            !historyIds.has(m._id) && !historyTempIds.has(m.tempId)
          );
          
          const merged = [...history, ...uniqueLiveMessages].sort(
            (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
          );
          
          return { ...prev, [partner]: merged };
        });

        // Set the active messages list immediately
        setMessages(() => {
          const partner = currentSelectedUser;
          const currentLiveForPartner = chatHistoryRef.current[partner] || [];
          
          const historyIds = new Set(history.map(m => m._id).filter(Boolean));
          const historyTempIds = new Set(history.map(m => m.tempId).filter(Boolean));
          
          const uniqueLiveMessages = currentLiveForPartner.filter(m => 
            !historyIds.has(m._id) && !historyTempIds.has(m.tempId)
          );
          
          const merged = [...history, ...uniqueLiveMessages];
          return merged.sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));
        });

      } catch (err) {
        console.error("Failed to fetch messages:", err);
        if (isCancelled) return;
        
        const partner = currentSelectedUser;
        const cached = chatHistoryRef.current[partner];
        if (cached?.length) {
          setMessages(
            [...cached].sort(
              (a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
            )
          );
        }
      }
    };

    syncChat();
    return () => {
      isCancelled = true;
    };
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

    if (!user || !selectedUser || !socket) return;

    if (val.trim() === "") {
      stopTyping();
      return;
    }

    const now = Date.now();
    // Only emit "typing" every 2 seconds to avoid spamming the server
    if (now - lastTypingEmitRef.current > 2000) {
      const normalizedUser = normalizeEmail(user.email);
      const normalizedSelected = normalizeEmail(selectedUser);

      if (normalizedUser && normalizedSelected) {
        const typingPayload = { from: normalizedUser, to: normalizedSelected };
        socket.emit("typing", typingPayload);
        lastTypingEmitRef.current = now;
      }
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 3000);
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

    // Prevent multiple sends
    if (isMediaSending) {
      alert("⏳ File is already being sent. Please wait...");
      e.target.value = null;
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    
    // Validate file size - 3MB for images, 15MB for others
    const maxSize = isImage ? 3 * 1024 * 1024 : 15 * 1024 * 1024;
    
    if (file.size > maxSize) {
      alert(`File size must be less than ${isImage ? '3MB' : '15MB'}. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      e.target.value = null;
      return;
    }

    setIsMediaSending(true);
    const tempId = `${Date.now()}-${Math.random()}`;

    const reader = new FileReader();
    
    // Progress tracking for reader
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        setMediaUploadProgress(progress);
      }
    };

    reader.onload = () => {
      try {
        setMediaUploadProgress(100); // Reader finished
        
        if (isImage) {
          // Compress image before sending
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
            sendFinalMedia(compressedDataUrl, file.name, file.type, file.size);
          };
          img.src = reader.result;
        } else {
          // For Video/Audio, we show "processing" briefly then send
          sendFinalMedia(reader.result, file.name, file.type, file.size);
        }
      } catch (err) {
        console.error("❌ Error processing file:", err);
        alert("❌ Error sending file. Please try again.");
        setIsMediaSending(false);
        setMediaUploadProgress(0);
      }
    };

    const sendFinalMedia = (dataUrl, name, type, size) => {
      const newMsg = {
        sender: user.email,
        receiver: selectedUser,
        text: { name, type, size, data: dataUrl },
        type: "media",
        mediaType: type.split('/')[0],
        tempId: tempId,
        timestamp: new Date().toISOString()
      };

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
        if (!ack || ack.ok === false) {
          setMessages((prev) =>
            prev.map((m) => (m.tempId === tempId ? { ...m, failed: true, pending: false } : m))
          );
        }
      });
      setIsMediaSending(false);
      setMediaUploadProgress(0);
      e.target.value = null;
      setReplyTo(null);
    };

    reader.onerror = () => {
      console.error("❌ Error reading file");
      alert("❌ Error reading file. Please try again.");
      setIsMediaSending(false);
      e.target.value = null;
    };

    reader.readAsDataURL(file);
  };

  const clearChatForPartner = (partnerEmail, keepInRecent = false) => {
    if (!user || !socket?.connected || !partnerEmail) return;

    const partner = normalizeEmail(partnerEmail);
    const userKey = normalizeEmail(user.email);

    socket.emit(
      "clear-chat",
      { user1: userKey, user2: partner, keepInRecent },
      (ack) => {
        if (!ack?.ok) {
          alert("Failed to clear chat. Please try again.");
        }
      }
    );

    if (!keepInRecent) {
      setChatHistory((prev) => {
        const updated = { ...prev };
        delete updated[partner];
        return updated;
      });

      setUnreadMessages((prev) => {
        const key = `${partner}_${userKey}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }

    if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === partner) {
      setMessages([]);
    }
  };

  const handleClearCurrentChat = () => {
    if (!selectedUser) return;
    if (
      window.confirm(
        "Clear all messages in this chat? The conversation will stay in your list."
      )
    ) {
      clearChatForPartner(selectedUser, true);
    }
  };

  const handleArchiveChat = async (e, partnerEmail) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!user || !partnerEmail) return;

    try {
      await archiveChatService(user.email, partnerEmail);
      const partner = normalizeEmail(partnerEmail);
      
      setChatHistory((prev) => {
        const updated = { ...prev };
        delete updated[partner];
        return updated;
      });

      if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === partner) {
        setSelectedUser(null);
        setMessages([]);
      }
      alert("Chat archived successfully.");
    } catch (err) {
      console.error("Failed to archive chat:", err);
      alert("Failed to archive chat. Please try again.");
    }
  };

  const handleClearAllHistory = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!user) return;
    
    if (
      window.confirm(
        "Clear all recent chats from your list? This will hide them until a new message is sent."
      )
    ) {
      try {
        await clearAllChatsService(user.email);
        
        setChatHistory({});
        setMessages([]);
        setUnreadMessages({});
        setSelectedUser(null);
        
        // Clear local storage
        const userKey = normalizeEmail(user.email);
        localStorage.removeItem(`chatHistory_${userKey}`);
        localStorage.removeItem(`unread_${userKey}`);
      } catch (err) {
        console.error("Failed to clear all chats:", err);
        alert("Failed to clear all chats. Please try again.");
      }
    }
  };

  const handleRemoveChatFromRecent = (e, partnerEmail) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation(); // CRITICAL: Stop the click from selecting the user
    }
    
    if (!user || !partnerEmail) return;

    if (window.confirm(`Remove ${getDisplayName(partnerEmail)} from your recent chats?`)) {
      const partner = normalizeEmail(partnerEmail);
      const userKey = normalizeEmail(user.email);
      
      // Inform server to hide this chat
      socket.emit("clear-chat", { user1: userKey, user2: partner });

      setChatHistory((prev) => {
        const updated = { ...prev };
        delete updated[partner];
        return updated;
      });

      setUnreadMessages((prev) => {
        const key = `${partner}_${userKey}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });

      // If we are currently viewing this chat, clear it
      if (selectedUserRef.current && normalizeEmail(selectedUserRef.current) === partner) {
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
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 400;
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        const newPic = canvas.toDataURL("image/jpeg", 0.9);
        setTempProfilePic(newPic);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProfilePic = () => {
    setTempProfilePic(""); // Empty string means removed
  };

  const handleSaveSettings = () => {
    if (!user || !socket) return;
    
    const displayName = newDisplayName.trim() || user.email.split('@')[0];
    const profilePic = tempProfilePic !== null ? tempProfilePic : user.profilePic;
    const bio = newBio;

    // 1. Update local user state
    const updatedUser = { ...user, displayName, profilePic, bio };
    setUser(updatedUser);

    // 2. Persist to local storage
    safeLocalStorageSet("user", JSON.stringify({
      email: updatedUser.email,
      uid: updatedUser.uid,
      displayName: updatedUser.displayName,
      profilePic: updatedUser.profilePic,
      bio: updatedUser.bio
    }));

    if (updatedUser.profilePic) {
      safeLocalStorageSet(`profilePic_${user.email.toLowerCase()}`, updatedUser.profilePic);
    } else {
      localStorage.removeItem(`profilePic_${user.email.toLowerCase()}`);
    }

    // 3. Update the profiles map and metadata immediately
    setUserProfiles(prev => ({
      ...prev,
      [user.email.toLowerCase()]: updatedUser.profilePic || null
    }));
    
    setUserMetadata(prev => ({
      ...prev,
      [user.email.toLowerCase()]: { displayName, profilePic: updatedUser.profilePic, bio }
    }));

    // 4. Inform the server
    socket.emit("update-profile", { 
      email: user.email, 
      profilePic: updatedUser.profilePic,
      displayName: updatedUser.displayName,
      bio: updatedUser.bio
    });

    setShowSettings(false);
    alert("Profile updated successfully!");
  };

  const handleCancelSettings = () => {
    setShowSettings(false);
    // Values will be reset when modal is reopened
  };

  const ensureSocketJoined = () => {
    if (!socket || !user) return;
    socket.emit("join", {
      email: normalizeEmail(user.email),
      profilePic: user.profilePic || null,
      displayName: user.displayName || user.email.split('@')[0]
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
    const partner = normalizeEmail(u);
    console.log(`👤 Selecting user: ${partner}`);
    
    // 1. Immediately update ref to prevent race conditions in socket listeners
    selectedUserRef.current = partner;
    
    // 2. Immediately update messages state from history
    if (chatHistoryRef.current[partner]) {
      setMessages([...chatHistoryRef.current[partner]].sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)));
    } else {
      setMessages([]);
    }
    
    // 3. Update state
    setSelectedUser(partner);

    // 4. Clear unread badge for this chat
    if (user) {
      const userKey = normalizeEmail(user.email);
      setUnreadMessages(prev => {
        const key = `${partner}_${userKey}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Filter out current user from the user list
  const otherOnlineUsers = onlineUsers.filter(u => {
    if (!u || typeof u !== 'string') return false;
    return u.toLowerCase().trim() !== user?.email?.toLowerCase().trim();
  });
  
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
    const key = `${normalizeEmail(otherUser)}_${normalizeEmail(user.email)}`;
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

  if (!user) return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><h2>Loading Connect Messenger...</h2></div>;

  return (
    <ErrorBoundary>
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
            {renderAvatar(user.email, "md")}
            <div>
              <span className="profile-name">
                {user.displayName || (user.email ? user.email.split("@")[0] : "User")}
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
                  className={`user-item ${normalizeEmail(selectedUser) === normalizeEmail(u) ? "active" : ""}`}
                  onClick={() => handleUserSelect(u)}
                >
                  <div className="avatar-wrap">
                    {renderAvatar(u, "md")}
                    {isUserOnline(u) && <span className="status-dot online" />}
                  </div>
                  <div className="user-item-copy">
                    <span className="user-name">
                      {getDisplayName(u)}
                    </span>
                    <span className="user-last">
                      {isUserOnline(u) ? "Online" : formatLastSeen(lastSeen[u])}
                    </span>
                  </div>
                  <div className="user-item-actions">
                    {unreadCount > 0 && (
                      <span className="unread-badge">{unreadCount}</span>
                    )}
                    <button 
                      className="remove-recent-btn" 
                      onClick={(e) => handleArchiveChat(e, u)}
                      title="Archive chat"
                    >
                      <Archive size={14} />
                    </button>
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
                className={`user-item ${normalizeEmail(selectedUser) === normalizeEmail(u) ? "active" : ""}`}
                onClick={() => handleUserSelect(u)}
              >
                <div className="avatar-wrap">
                  {renderAvatar(u, "md")}
                  <span className="status-dot online" />
                </div>
                <div className="user-item-copy">
                  <span className="user-name">
                    {getDisplayName(u)}
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
          <button className="secondary-btn" onClick={handleClearAllHistory} title="Clear all recent chats from sidebar">
            <Trash2 size={16} /> Clear All
          </button>
          <button className="secondary-btn" onClick={() => navigate("/feedback")}>
            <MessageCircle size={16} /> Feedback
          </button>
        </div>
      </aside>

      <main className="chat-panel">
        <div className="chat-panel-header">
          <div className="chat-panel-title">
            <div className="header-avatar-wrap">
              {renderAvatar(selectedUser, "md")}
            </div>
            <div>
              <h3>
                {selectedUser 
                  ? getDisplayName(selectedUser) 
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
                setNewDisplayName(user?.displayName || (user?.email ? user.email.split('@')[0] : ""));
                setNewBio(user?.bio || "");
                setTempProfilePic(null); // Reset temp pic
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
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="settings-header">
                <h3>Settings</h3>
                <button className="settings-close-btn" onClick={() => setShowSettings(false)}><X size={20} /></button>
              </div>
              
              <div className="settings-body">
                <div className="settings-section">
                  <label className="settings-label">Profile Picture</label>
                  <div className="settings-avatar-card">
                    {renderAvatar(user.email, "lg", tempProfilePic !== null ? tempProfilePic : undefined)}
                    <div className="avatar-actions-row">
                      <label htmlFor="update-profile-pic-settings" className="change-dp-btn">
                        Change Photo
                      </label>
                      {(tempProfilePic || (tempProfilePic === null && user.profilePic)) && (
                        <button className="remove-dp-btn" onClick={handleRemoveProfilePic}>
                          Remove Photo
                        </button>
                      )}
                    </div>
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
                  <label className="settings-label">Display Name</label>
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
                  <label className="settings-label">Bio / About</label>
                  <textarea 
                    value={newBio} 
                    onChange={(e) => setNewBio(e.target.value)}
                    placeholder="Tell others about yourself..."
                    className="settings-input settings-textarea"
                  />
                </div>

                <div className="settings-section">
                  <label className="settings-label">Account Information</label>
                  <div className="settings-info-card">
                    <div className="info-row">
                      <span className="info-label">Email Address</span>
                      <span className="info-value">{user?.email}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Username</span>
                      <span className="info-value">{user?.email?.split('@')[0]}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-footer">
                <button className="remove-dp-btn" style={{ borderColor: 'var(--text-light)', color: 'var(--text-secondary)' }} onClick={handleCancelSettings}>Cancel</button>
                <button className="save-profile-btn" onClick={handleSaveSettings}>Save Changes</button>
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
                        className={`message-wrapper ${msg.sender === user.email ? "sent" : "received"}`}
                      >
                        {msg.sender !== user.email && (
                          <div className="message-avatar">
                            {renderAvatar(msg.sender, "sm")}
                          </div>
                        )}
                        <div
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
                              {msg.mediaType === "audio" && msg.text?.data?.startsWith("data:audio/") && (
                                <audio controls className="media-audio">
                                  <source src={msg.text.data} type={msg.text.type} />
                                  Your browser does not support audio playback
                                </audio>
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
                      </div>
                    </motion.div>
                    </React.Fragment>
                  );
                })
              )}

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
          
          <AnimatePresence>
            {typingUser && typingUser !== user.email && (
              <motion.div
                className="typing-indicator-floating"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <span>{getDisplayName(typingUser)} is typing...</span>
              </motion.div>
            )}
          </AnimatePresence>
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
          <label htmlFor="media-upload" className="secondary-icon-btn" title="Send Media">
            <Paperclip size={18} />
          </label>
          <input
            id="media-upload"
            type="file"
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt"
            onChange={handleMediaShare}
            style={{ display: "none" }}
            disabled={!selectedUser || isMediaSending}
          />
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
            style={{
              position: 'fixed',
              bottom: '80px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--primary-color)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '30px',
              fontSize: '14px',
              fontWeight: '600',
              zIndex: 2000,
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              minWidth: '200px'
            }}
          >
            <div className="progress-circle-mini" style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: '3px solid rgba(255,255,255,0.2)',
              borderTopColor: 'white',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: '2px' }}>Sending media... {mediaUploadProgress}%</div>
              <div style={{ 
                width: '100%', 
                height: '4px', 
                background: 'rgba(255,255,255,0.2)', 
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: `${mediaUploadProgress}%`, 
                  height: '100%', 
                  background: 'white',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
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

      {zoomedImage && (
        <div className="image-zoom-overlay" onClick={() => setZoomedImage(null)}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="whatsapp-zoom-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="zoom-top-bar">
              <div className="zoom-info">
                <span className="zoom-user-name">Profile Picture</span>
              </div>
              <div className="zoom-actions">
                <button 
                  className="zoom-action-btn" 
                  onClick={handleDownloadImage}
                  title="Save to device"
                >
                  <Download size={20} />
                </button>
                <button 
                  className="zoom-action-btn close" 
                  onClick={() => setZoomedImage(null)}
                  title="Close"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            
            <div className="zoom-image-container">
              <img src={zoomedImage} alt="Profile Full View" />
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
    </ErrorBoundary>
  );
}

export default Chat;
