import React, { useEffect, useState, useRef } from "react";
import { AnimatePresence } from "framer-motion";
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
  ArchiveRestore,
  User,
  Info,
  Image,
  Film,
  Music,
  FileText,
  FolderOpen,
  Download,
  ZoomIn,
  ZoomOut,
  Camera,
  Palette,
  Save,
  Loader2,
} from "lucide-react";
import Avatar from "./Avatar";
import LastSeen from "./LastSeen";
import { auth } from "../firebase";
import useSocket from "../hooks/useSocket";
import { formatLastSeen, formatMessageTime } from "../utils/timeFormatter";
import { validateImageFile, compressImage } from "../utils/imageUtils";
import { subscribeToPush } from "../utils/pushHelper";
import { fetchMessages, fetchRecentChats } from "../services/messageService";
import { useNavigate } from "react-router-dom";
import "./Chat.css";

const normalizeEmail = (email) => (email || "").toLowerCase().trim();

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

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

const ImageCropModal = ({ src, onCrop, onCancel }) => {
  const canvasRef = React.useRef(null);
  const imgRef = React.useRef(null);
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const [imgError, setImgError] = React.useState(false);
  const lastTouchRef = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    setImgError(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  React.useEffect(() => {
    if (!src || !canvasRef.current || imgError) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 280;
    canvas.width = size;
    canvas.height = size;

    const img = new Image();
    imgRef.current = img;
    img.onload = () => {
      try {
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();

        const baseW = Math.min(size, img.width);
        const baseH = (baseW / img.width) * img.height;
        const drawW = baseW * scale;
        const drawH = baseH * scale;
        const x = (size - drawW) / 2 + offset.x;
        const y = (size - drawH) / 2 + offset.y;
        ctx.drawImage(img, x, y, drawW, drawH);
        ctx.restore();
      } catch (err) {
        console.error("Canvas rendering error:", err);
        setImgError(true);
      }
    };
    img.onerror = () => setImgError(true);
    img.src = src;
  }, [src, scale, offset, imgError]);

  const getPointerPos = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const handleDragStart = (e) => {
    e.preventDefault();
    const pos = getPointerPos(e);
    setDragging(true);
    setDragStart({ x: pos.x - offset.x, y: pos.y - offset.y });
    lastTouchRef.current = pos;
  };

  const handleDragMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    setOffset({ x: pos.x - dragStart.x, y: pos.y - dragStart.y });
    lastTouchRef.current = pos;
  };

  const handleDragEnd = () => setDragging(false);

  const handleCrop = () => {
    if (!canvasRef.current || imgError) return;
    try {
      const croppedData = canvasRef.current.toDataURL("image/jpeg", 0.8);
      onCrop(croppedData);
    } catch (err) {
      console.error("Failed to crop image:", err);
      alert("Failed to crop image. Please try again.");
    }
  };

  return (
    <div className="crop-overlay" onClick={onCancel}>
      <div className="crop-modal crop-modal-animate" onClick={(e) => e.stopPropagation()}>
        <div className="crop-header">
          <h3>Crop Profile Picture</h3>
          <button onClick={onCancel}><X size={18} /></button>
        </div>
        <div
          className="crop-canvas-wrap"
          onMouseDown={handleDragStart}
          onMouseMove={handleDragMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onTouchCancel={handleDragEnd}
        >
          <canvas ref={canvasRef} className="crop-canvas" />
        </div>
        <div className="crop-zoom-row">
          <ZoomOut size={16} />
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={scale}
            onChange={(e) => { setScale(parseFloat(e.target.value)); setOffset({ x: 0, y: 0 }); }}
          />
          <ZoomIn size={16} />
        </div>
        <div className="crop-actions">
          <button className="crop-cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="crop-save-btn" onClick={handleCrop}>Crop & Save</button>
        </div>
      </div>
    </div>
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
  const [userProfiles, setUserProfiles] = useState(() => {
    try {
      const email = JSON.parse(localStorage.getItem("user") || "{}").email;
      if (email) {
        const stored = localStorage.getItem(`userProfiles_${email.toLowerCase()}`);
        return stored ? JSON.parse(stored) : {};
      }
    } catch {}
    return {};
  });
  const [isMediaSending, setIsMediaSending] = useState(false); // Track media upload state
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [isChatMinimized, setIsChatMinimized] = useState(false); // Track if chat is minimized
  const [contextMenu, setContextMenu] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef(null);
  const [userNames, setUserNames] = useState(() => {
    try {
      const email = JSON.parse(localStorage.getItem("user") || "{}").email;
      if (email) {
        const stored = localStorage.getItem(`userNames_${email.toLowerCase()}`);
        return stored ? JSON.parse(stored) : {};
      }
    } catch {}
    return {};
  });
  const [profilePreviewUser, setProfilePreviewUser] = useState(null);
  const [imageViewerState, setImageViewerState] = useState({ open: false, src: null, type: "media", name: "", isOwn: false });
  const [cropState, setCropState] = useState({ open: false, src: null, file: null });
  const [imageZoom, setImageZoom] = useState(1);
  const archivedChatsRef = useRef(null);
  const [archivedChats, setArchivedChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`archivedChats_${localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")).email : ""}`) || "[]"); } catch { return []; }
  });
  const [showArchivedChats, setShowArchivedChats] = useState(false);
  const [displayName, setDisplayName] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}").displayName || ""; } catch { return ""; }
  });
  const [bio, setBio] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}").bio || ""; } catch { return ""; }
  });
  const [isSaving, setIsSaving] = useState(false);
  const emojiPickerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [, setLastSeenTick] = useState(0);

  // Auto-refresh last seen display every 1 second
  useEffect(() => {
    const interval = setInterval(() => setLastSeenTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Use Ref to track selectedUser for the socket listener to avoid stale closures
  const selectedUserRef = useRef(selectedUser);
  const previousSelectedUserRef = useRef(null);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const handleAvatarClick = (e, email, isOwn = false) => {
    e.stopPropagation();
    setProfilePreviewUser({ email, isOwn });
  };

  const handleViewFullImage = (src, type = "media", name = "", isOwn = false) => {
    setProfilePreviewUser(null);
    setImageZoom(1);
    setImageViewerState({ open: true, src, type, name, isOwn });
  };

  const handleDownloadImage = (src, name) => {
    if (!src) return;
    const link = document.createElement("a");
    link.href = src;
    link.download = name || "image.jpg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowEmojiPicker(false);
        setShowAttachMenu(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showEmojiPicker]);

  // Close attach menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAttachMenu]);

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
    const normalized = normalizeEmail(email);
    return userNames[normalized] || (email || "").split("@")[0];
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

  // Load profiles from server on mount
  useEffect(() => {
    if (!user) return;
    const loadProfiles = async () => {
      try {
        const res = await fetch(`${API_URL}/api/users/profiles?emails=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (data.success && data.profiles) {
          const newLastSeen = {};
          Object.entries(data.profiles).forEach(([email, profile]) => {
            if (profile.avatarUrl) {
              setUserProfiles(prev => ({ ...prev, [email]: profile.avatarUrl }));
              try { localStorage.setItem(`profilePic_${email}`, profile.avatarUrl); } catch {}
            }
            if (profile.displayName) {
              setUserNames(prev => ({ ...prev, [email]: profile.displayName }));
            }
            if (profile.lastSeen) {
              newLastSeen[email] = profile.lastSeen;
            }
          });
          if (Object.keys(newLastSeen).length > 0) {
            setLastSeen(prev => ({ ...prev, ...newLastSeen }));
          }
        }
      } catch (e) {
        console.warn("Failed to load profiles from server");
      }
    };
    loadProfiles();
  }, [user]);

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

          // Fetch profiles (including lastSeen) for recent chat partners
          const partnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);
          if (partnerEmails.length > 0) {
            try {
              const profilesRes = await fetch(`${API_URL}/api/users/profiles?emails=${encodeURIComponent(partnerEmails.join(","))}`);
              const profilesData = await profilesRes.json();
              if (profilesData.success && profilesData.profiles) {
                const newLastSeen = {};
                Object.entries(profilesData.profiles).forEach(([email, profile]) => {
                  if (profile.avatarUrl) {
                    setUserProfiles(prev => ({ ...prev, [email]: profile.avatarUrl }));
                  }
                  if (profile.displayName) {
                    setUserNames(prev => ({ ...prev, [email]: profile.displayName }));
                  }
                  if (profile.lastSeen) {
                    newLastSeen[email] = profile.lastSeen;
                  }
                });
                if (Object.keys(newLastSeen).length > 0) {
                  setLastSeen(prev => ({ ...prev, ...newLastSeen }));
                }
              }
            } catch (e) {
              console.warn("Failed to load recent chat profiles");
            }
          }
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
      const joinData = { email: user.email };
      if (user.profilePic) {
        joinData.profilePic = user.profilePic;
      }
      socket.emit("join", joinData);
    };

    // Join immediately and on every reconnection
    handleJoin();
    socket.on("connect", handleJoin);

    // Subscribe to push notifications
    subscribeToPush(user.email.toLowerCase());

    // Restore unread counts
    const storedUnread = localStorage.getItem(`unread_${user.email.toLowerCase()}`);
    if (storedUnread) {
      try { setUnreadMessages(JSON.parse(storedUnread)); } catch (e) { console.error('Failed to parse stored unread counts', e); }
    }

    const handleOnlineUsers = (users) => {
      setOnlineUsers(users);
    };
    socket.on("online-users", handleOnlineUsers);

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

    // Listen for profile picture updates
    socket.on("user-profile-update", (data) => {
      console.log("👤 Profile update:", data);
      if (data.profilePic) {
        setUserProfiles((prev) => {
          const updated = {
            ...prev,
            [data.email.toLowerCase()]: data.profilePic
          };
          try {
            if (user) {
              const toStore = {};
              Object.entries(updated).forEach(([k, v]) => {
                if (v && typeof v === "string" && v.length < 500000) {
                  toStore[k] = v;
                }
              });
              localStorage.setItem(`userProfiles_${user.email.toLowerCase()}`, JSON.stringify(toStore));
            }
          } catch (e) {
            console.warn("Failed to persist user profiles to localStorage");
          }
          return updated;
        });
      }
      if (data.displayName || data.bio) {
        setUserNames((prev) => {
          const updated = {
            ...prev,
            [data.email.toLowerCase()]: data.displayName || null,
          };
          try {
            if (user) {
              localStorage.setItem(`userNames_${user.email.toLowerCase()}`, JSON.stringify(updated));
            }
          } catch (e) {
            console.warn("Failed to persist user names to localStorage");
          }
          return updated;
        });
      }
    });

    const handleChatCleared = ({ user1, user2, scope }) => {
      const clearedFor = normalizeEmail(user1);
      const partner = normalizeEmail(user2);
      if (clearedFor !== normalizeEmail(user.email)) return;

      setChatHistory((prev) => {
        const updated = { ...prev };
        // Keep the entry with an empty array so conversation stays visible
        updated[partner] = [];
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

    const handleMessageSaved = ({ tempId, _id, timestamp, status }) => {
      const applySaved = (list) =>
        list.map((m) =>
          m.tempId === tempId
            ? { ...m, _id, timestamp: timestamp || m.timestamp, pending: false, status: status || m.status }
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

    // Listen for undelivered messages (status: sent) sent while user was offline
    socket.on("undelivered-messages", (msgs) => {
      console.log("🔴 Undelivered messages received:", msgs.length);
      const myEmail = normalizeEmail(user.email);

      msgs.forEach((msg) => {
        const otherParty = getOtherParty(msg, myEmail);
        setChatHistory((prev) => {
          const currentHistory = prev[otherParty] || [];
          return {
            ...prev,
            [otherParty]: upsertMessageInList(currentHistory, { ...msg, status: "sent" }),
          };
        });

        if (
          selectedUserRef.current &&
          normalizeEmail(selectedUserRef.current) === otherParty
        ) {
          setMessages((prev) => upsertMessageInList(prev, { ...msg, status: "sent" }));
        }
      });
    });

    // Listen for message-status-update (sent ✓, delivered ✓✓)
    socket.on("message-status-update", ({ messageId, tempId, status }) => {
      const applyStatus = (list) =>
        list.map((m) =>
          (m._id === messageId || m.tempId === tempId)
            ? { ...m, status, pending: false }
            : m
        );

      setChatHistory((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((key) => {
          updated[key] = applyStatus(updated[key] || []);
        });
        return updated;
      });

      if (selectedUserRef.current) {
        setMessages((prev) => applyStatus(prev));
      }
    });

    // Listen for messages-read (receiver read our messages → ✓✓ blue)
    socket.on("messages-read", ({ sender, receiver }) => {
      const myEmail = normalizeEmail(user.email);
      if (normalizeEmail(receiver) === myEmail) {
        const otherParty = normalizeEmail(sender);
        setChatHistory((prev) => {
          const updated = { ...prev };
          if (updated[otherParty]) {
            updated[otherParty] = updated[otherParty].map((m) =>
              m.sender === myEmail ? { ...m, status: "read" } : m
            );
          }
          return updated;
        });
        if (
          selectedUserRef.current &&
          normalizeEmail(selectedUserRef.current) === otherParty
        ) {
          setMessages((prev) =>
            prev.map((m) =>
              m.sender === myEmail ? { ...m, status: "read" } : m
            )
          );
        }
      }
    });

    return () => {
      socket.off("connect", handleJoin);
      socket.off("online-users", handleOnlineUsers);
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
      socket.off("undelivered-messages");
      socket.off("message-status-update");
      socket.off("messages-read");
    };
  }, [socket, user]);

  // Visibility and offline handlers
  useEffect(() => {
    if (!socket || !user) return;

    const emitVisiblePresence = () => {
      if (document.hidden) {
        socket.emit("leave", { email: user.email.toLowerCase() });
      } else {
        const joinData = { email: user.email.toLowerCase() };
        if (user.profilePic) {
          joinData.profilePic = user.profilePic;
        }
        socket.emit("join", joinData);
      }
    };

    const handleBlur = () => {
      socket.emit("leave", { email: user.email.toLowerCase() });
    };

    const handleFocus = () => {
      const joinData = { email: user.email.toLowerCase() };
      if (user.profilePic) {
        joinData.profilePic = user.profilePic;
      }
      socket.emit("join", joinData);
    };

    const handleBeforeUnload = () => {
      socket.disconnect();
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

  // Fetch profiles for online users when list changes
  useEffect(() => {
    if (!user) return;
    const unknown = onlineUsers.filter(u => !userNames[u.toLowerCase().trim()] && u.toLowerCase().trim() !== user.email.toLowerCase());
    if (unknown.length === 0) return;
    const fetchProfiles = async () => {
      try {
        const res = await fetch(`${API_URL}/api/users/profiles?emails=${encodeURIComponent(unknown.join(","))}`);
        const data = await res.json();
        if (data.success && data.profiles) {
          Object.entries(data.profiles).forEach(([email, profile]) => {
            if (profile.avatarUrl) {
              setUserProfiles(p => ({ ...p, [email]: profile.avatarUrl }));
            }
            if (profile.displayName) {
              setUserNames(p => ({ ...p, [email]: profile.displayName }));
            }
          });
        }
      } catch {}
    };
    fetchProfiles();
  }, [onlineUsers, user]);

  // Socket heartbeat every 25 seconds
  useEffect(() => {
    if (!socket || !user) return;
    const sendHeartbeat = () => {
      if (socket.connected) {
        socket.emit("heartbeat", user.email);
      }
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 25000);
    return () => clearInterval(interval);
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
      timestamp: new Date().toISOString(),
      senderDisplayName: getDisplayName(user.email),
      textPreview: msgText.substring(0, 100),
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
      // Keep the entry with an empty array so the conversation stays in Recent Chats
      updated[partner] = [];
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
      } catch (e) {}
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
    e.stopPropagation();
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

  const handleArchiveChat = (e, partnerEmail) => {
    e.stopPropagation();
    if (!user || !partnerEmail) return;
    const partner = normalizeEmail(partnerEmail);
    const newArchived = [...archivedChats.filter(a => normalizeEmail(a) !== partner), partner];
    setArchivedChats(newArchived);
    try {
      localStorage.setItem(`archivedChats_${user.email}`, JSON.stringify(newArchived));
    } catch (e) {}
    if (selectedUser && normalizeEmail(selectedUser) === partner) {
      setMessages([]);
      setSelectedUser(null);
    }
  };

  const handleUnarchiveChat = (e, partnerEmail) => {
    e.stopPropagation();
    if (!user || !partnerEmail) return;
    const partner = normalizeEmail(partnerEmail);
    const newArchived = archivedChats.filter(a => normalizeEmail(a) !== partner);
    setArchivedChats(newArchived);
    try {
      localStorage.setItem(`archivedChats_${user.email}`, JSON.stringify(newArchived));
    } catch (e) {}
    // Ensure the conversation appears in chatHistory if we have data for it
    if (!chatHistory[partner]) {
      // Fetch from server if not in local history
      fetchMessages(user.email, partnerEmail).then(msgs => {
        if (msgs && msgs.length > 0) {
          setChatHistory(prev => ({ ...prev, [partner]: msgs }));
        } else {
          // Keep an empty entry so it shows in the list
          setChatHistory(prev => ({ ...prev, [partner]: prev[partner] || [] }));
        }
      }).catch(() => {
        setChatHistory(prev => ({ ...prev, [partner]: prev[partner] || [] }));
      });
    }
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
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

  const handleUpdateProfilePic = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    e.target.value = null;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    try {
      const compressed = await compressImage(file, 500, 0.8);
      setShowSettings(false);
      setProfilePreviewUser(null);
      setCropState({ open: true, src: compressed, file });
    } catch (err) {
      console.error("Failed to process image:", err);
      alert("Failed to process image. Please try a different file.");
    }
  };

  const handleCropSave = (croppedDataUrl) => {
    if (!user || !user.email) return;
    const email = user.email.toLowerCase();
    const updatedUser = { ...user, profilePic: croppedDataUrl };
    setUser(updatedUser);
    safeLocalStorageSet("user", JSON.stringify({ email: updatedUser.email, uid: updatedUser.uid }));
    safeLocalStorageSet(`profilePic_${email}`, croppedDataUrl);
    setUserProfiles(prev => ({ ...prev, [email]: croppedDataUrl }));

    fetch(`${API_URL}/api/users/avatar`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, avatarUrl: croppedDataUrl }),
    }).catch(() => {});

    if (socket) {
      socket.emit("update-profile", { email: user.email, profilePic: croppedDataUrl });
    }

    setCropState({ open: false, src: null, file: null });
  };

  const handleSaveSettings = async () => {
    if (!user || !user.email) return;
    setIsSaving(true);
    try {
      const email = user.email.toLowerCase();
      const updatedUser = { ...user, displayName, bio };
      setUser(updatedUser);
      
      // Update local state immediately for real-time feel
      setUserNames(prev => ({ ...prev, [email]: displayName }));
      
      // Update localStorage
      try {
        const stored = JSON.parse(localStorage.getItem("user") || "{}");
        localStorage.setItem("user", JSON.stringify({ ...stored, displayName, bio }));
      } catch (e) {}

      // Persist to database
      const res = await fetch(`${API_URL}/api/users/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, displayName, bio }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error("Failed to save profile");
      }

      // Broadcast to all connected users via socket
      if (socket) {
        socket.emit("update-profile", { email: user.email, displayName, bio });
      }

      setShowSettings(false);
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveProfilePic = () => {
    if (!user) return;
    const updatedUser = { ...user, profilePic: null };
    setUser(updatedUser);
    localStorage.removeItem(`profilePic_${user.email.toLowerCase()}`);
    safeLocalStorageSet("user", JSON.stringify({
      email: updatedUser.email,
      uid: updatedUser.uid
    }));
    setUserProfiles(prev => {
      const updated = { ...prev };
      delete updated[user.email.toLowerCase()];
      return updated;
    });

    fetch(`${API_URL}/api/users/avatar`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, avatarUrl: null }),
    }).catch(() => {});

    if (socket) {
      socket.emit("remove-profile-pic", { email: user.email });
    }
  };

  const ensureSocketJoined = () => {
    if (!socket || !user) return;
    const joinData = { email: normalizeEmail(user.email) };
    if (user.profilePic) {
      joinData.profilePic = user.profilePic;
    }
    socket.emit("join", joinData);
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
    setSelectedUser(u);
    
    // Update messages when user is selected, ensuring chronological order
    if (chatHistory[u]) {
      setMessages([...chatHistory[u]].sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)));
    }

    // Clear unread badge for this chat immediately
    if (user) {
      setUnreadMessages(prev => {
        const key = `${u.toLowerCase()}_${user.email.toLowerCase()}`;
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        try { localStorage.setItem(`unread_${user.email}`, JSON.stringify(next)); } catch (e) {}
        return next;
      });
      // Mark messages as read on server
      if (socket && socket.connected) {
        socket.emit("mark-as-read", { user1: user.email, user2: u });
        socket.emit("seen-message", { sender: u, receiver: user.email });
      }
    }
  };

  // Filter out current user from the user list
  const otherOnlineUsers = onlineUsers.filter(u => 
    u.toLowerCase().trim() !== user?.email?.toLowerCase().trim()
  );
  
  // Get recent chats sorted by latest message (exclude archived)
  const archivedSet = new Set(archivedChats.map(a => normalizeEmail(a)));
  const recentChats = Object.keys(chatHistory)
    .filter(u => u !== user?.email && !archivedSet.has(normalizeEmail(u)))
    .sort((a, b) => {
      const historyA = chatHistory[a] || [];
      const historyB = chatHistory[b] || [];
      const lastA = historyA[historyA.length - 1];
      const lastB = historyB[historyB.length - 1];
      const timeA = new Date(lastA?.timestamp || lastA?.createdAt || 0);
      const timeB = new Date(lastB?.timestamp || lastB?.createdAt || 0);
      return new Date(timeB) - new Date(timeA);
    });

  // Archived chats list
  const archivedChatsList = archivedChats.filter(a => {
    return chatHistory[normalizeEmail(a)] || true;
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
      getDisplayName(u).includes(searchValue)
    );
  });
  const filteredOnlineUsers = otherOnlineUsers.filter((u) => {
    const normalizedEmail = normalizeEmail(u);
    return (
      normalizedEmail.includes(searchValue) ||
      getDisplayName(u).includes(searchValue)
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
            <Avatar
              src={userProfiles[user.email.toLowerCase()] || user.profilePic}
              email={user.email}
              size={40}
              className="profile-card-avatar"
              onClick={(e) => handleAvatarClick(e, user.email, true)}
            />
            <div>
              <span className="profile-name">{getDisplayName(user.email)}</span>
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
                    <Avatar
                      src={userProfiles[u]}
                      email={u}
                      size={40}
                      className="user-avatar"
                      onClick={(e) => handleAvatarClick(e, u, false)}
                    />
                    {isUserOnline(u) && <span className="status-dot online" />}
                  </div>
                  <div className="user-item-copy">
                    <span className="user-name">{getDisplayName(u)}</span>
                    <span className="user-last">
                      {isUserOnline(u) ? "Online" : formatLastSeen(lastSeen[u])}
                    </span>
                  </div>
                  <div className="user-item-actions">
                    {unreadCount > 0 && (
                      <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
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
                className={`user-item ${selectedUser === u ? "active" : ""}`}
                onClick={() => handleUserSelect(u)}
              >
                <div className="avatar-wrap">
                    <Avatar
                      src={userProfiles[u]}
                      email={u}
                      size={40}
                      className="user-avatar"
                      onClick={(e) => handleAvatarClick(e, u, false)}
                    />
                  <span className="status-dot online" />
                </div>
                <div className="user-item-copy">
                  <span className="user-name">{getDisplayName(u)}</span>
                  <span className="user-last">Available now</span>
                </div>
                {getUnreadCount(u) > 0 && (
                  <span className="unread-badge">{getUnreadCount(u) > 99 ? "99+" : getUnreadCount(u)}</span>
                )}
              </div>
            )) : (
              <div className="empty-list">No contacts are available right now.</div>
            )}
          </div>
        </div>

        {showArchivedChats && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Archived Chats</div>
            <div className="sidebar-list">
              {archivedChatsList.length > 0 ? archivedChatsList.map((u, i) => (
                <div
                  key={`archived-${i}`}
                  className={`user-item ${selectedUser === u ? "active" : ""}`}
                  onClick={() => { handleUserSelect(u); setShowArchivedChats(false); }}
                >
                  <div className="avatar-wrap">
                    <Avatar
                      src={userProfiles[u]}
                      email={u}
                      size={40}
                      className="user-avatar"
                    />
                  </div>
                  <div className="user-item-copy">
                    <span className="user-name">{getDisplayName(u)}</span>
                    <span className="user-last">Archived</span>
                  </div>
                  <div className="user-item-actions">
                    <button
                      className="remove-recent-btn"
                      onClick={(e) => { e.stopPropagation(); handleUnarchiveChat(e, u); }}
                      title="Unarchive chat"
                    >
                      <ArchiveRestore size={14} />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="empty-list">No archived chats.</div>
              )}
            </div>
          </div>
        )}

        <div className="sidebar-actions">
          <button className="secondary-btn" onClick={() => setShowArchivedChats(!showArchivedChats)}>
            <Archive size={16} /> {showArchivedChats ? "Back to Chats" : "Archived Chats"}
          </button>
          <button className="secondary-btn" onClick={() => setShowSettings(true)}>
            <Settings size={16} /> Settings
          </button>
        </div>
      </aside>

      <main className="chat-panel">
        <div className="chat-panel-header">
          <div className="chat-panel-title">
            <div className="header-avatar-wrap">
              <Avatar
                src={selectedUser ? userProfiles[selectedUser] : null}
                email={selectedUser || "default"}
                size={40}
                className="header-avatar"
                onClick={() => selectedUser && handleAvatarClick({ stopPropagation: () => {} }, selectedUser, false)}
              />
            </div>
            <div>
              <h3>{selectedUser ? getDisplayName(selectedUser) : "Welcome to Connect"}</h3>
              <p>{selectedUser ? <LastSeen userId={selectedUser} /> : "Choose a conversation or create a new one."}</p>
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
            <button className="icon-btn" title="Settings" onClick={() => setShowSettings(true)}>
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
                <>
                {messages.filter(m => m.status === "sent" && m.sender !== user.email).length > 0 && (
                  <div className="unread-banner">
                    🔴 {messages.filter(m => m.status === "sent" && m.sender !== user.email).length} unread message{messages.filter(m => m.status === "sent" && m.sender !== user.email).length > 1 ? 's' : ''}
                  </div>
                )}
                {messages.map((msg, i) => {
                  const previousMsg = messages[i - 1];
                  const showDay = !previousMsg || new Date(msg.timestamp || msg.createdAt).toDateString() !== new Date(previousMsg.timestamp || previousMsg.createdAt).toDateString();
                  return (
                    <React.Fragment key={msg._id || msg.tempId || `msg-${i}`}>
                      {showDay && (
                        <div className="day-separator">
                          <span>{formatDay(msg.timestamp || msg.createdAt)}</span>
                        </div>
                      )}
                      <div className={`message ${msg.sender === user.email ? "sent" : "received"} message-animate${msg.status === "sent" && msg.sender !== user.email ? " undelivered" : ""}`} onContextMenu={(e) => handleContextMenu(e, msg)}>
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
                                <img src={msg.text.data} alt="Shared" className="media-image" onClick={() => handleViewFullImage(msg.text.data, "media")} />
                              )}
                              {msg.mediaType === "video" && msg.text?.data?.startsWith("data:video/") && (
                                <video controls className="media-video">
                                  <source src={msg.text.data} type={msg.text.type} />
                                  Your browser does not support video playback
                                </video>
                              )}
                              {msg.mediaType === "audio" && (
                                <div className="media-file">
                                  <div className="media-audio-wrap">
                                    <div className="media-audio-player">
                                      <audio controls>
                                        <source src={msg.text?.data} type={msg.text?.type || "audio/mpeg"} />
                                        Your browser does not support audio playback
                                      </audio>
                                    </div>
                                    <span className="media-audio-label">🎵 {msg.text?.name || "Audio file"}</span>
                                  </div>
                                </div>
                              )}
                              {msg.mediaType === "application" && (
                                <div className="media-file">
                                  <div className="media-file-header">
                                    <div className={`media-file-icon ${msg.text?.name?.endsWith('.pdf') ? 'pdf' : msg.text?.name?.endsWith('.doc') || msg.text?.name?.endsWith('.docx') ? 'doc' : 'other'}`}>
                                      {msg.text?.name?.endsWith('.pdf') ? '📄' : msg.text?.name?.endsWith('.doc') || msg.text?.name?.endsWith('.docx') ? '📝' : '📎'}
                                    </div>
                                    <div className="media-file-info">
                                      <span className="media-file-name">{msg.text?.name || "Document"}</span>
                                      <span className="media-file-size">{msg.text?.size ? `${(msg.text.size / 1024).toFixed(1)} KB` : "File"}</span>
                                    </div>
                                  </div>
                                  {msg.text?.data?.startsWith("data:application/pdf") && (
                                    <iframe src={msg.text.data} className="pdf-preview" title={msg.text.name} />
                                  )}
                                  <a href={msg.text.data} download={msg.text.name} className="download-btn">Download</a>
                                </div>
                              )}
                              {msg.text?.data && msg.mediaType !== "image" && msg.mediaType !== "video" && msg.mediaType !== "audio" && msg.mediaType !== "application" && (
                                <div className="media-file">
                                  <div className="media-file-header">
                                    <div className="media-file-icon other">📎</div>
                                    <div className="media-file-info">
                                      <span className="media-file-name">{msg.text?.name || "Attachment"}</span>
                                      <span className="media-file-size">{msg.text?.size ? `${(msg.text.size / 1024).toFixed(1)} KB` : "File"}</span>
                                    </div>
                                  </div>
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
                          {msg.pending && <span className="message-status pending">⏰ Sending…</span>}
                          {msg.failed && <span className="message-status failed">Failed</span>}
                          {msg.status === "sent" && msg.sender !== user.email && (
                            <span className="message-status undelivered-status">🔴 New</span>
                          )}
                          {msg.sender === user.email && !msg.pending && !msg.failed && (
                            <span className={`read-receipt${msg.status === "read" ? " read" : ""}`}>
                              {msg.status === "read" ? "✓✓" : msg.status === "delivered" ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              }
              </>
              )}

              <AnimatePresence>
                {typingUser && typingUser !== user.email && (
                  <div className="typing-indicator typing-animate" title="Someone is typing...">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <div className="welcome-panel">
                <h2>Welcome back, {getDisplayName(user.email)} 👋</h2>
                <p>Pick a chat or start messaging a colleague from the sidebar.</p>
              </div>
            </div>
          )}
        </div>
        )}

        {!isChatMinimized && (
        <div className="chat-panel-footer">
          {showEmojiPicker && (
            <div ref={emojiPickerRef} className="emoji-picker-wrapper">
              <EmojiPicker 
                onEmojiClick={(emojiData) => setMessage(prev => prev + emojiData.emoji)}
                theme={isDarkMode ? "dark" : "light"}
                width={320}
                height={400}
                searchPlaceholder="Search emoji..."
              />
            </div>
          )}
          {showAttachMenu && (
            <div className="attach-menu-overlay" onClick={() => setShowAttachMenu(false)}>
              <div className="attach-menu" ref={attachMenuRef} onClick={(e) => e.stopPropagation()}>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-image').click(); }}>
                  <div className="attach-icon"><Image size={20} /></div>
                  <span>Image</span>
                </button>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-video').click(); }}>
                  <div className="attach-icon"><Film size={20} /></div>
                  <span>Video</span>
                </button>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-audio').click(); }}>
                  <div className="attach-icon"><Music size={20} /></div>
                  <span>Audio</span>
                </button>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-document').click(); }}>
                  <div className="attach-icon"><FileText size={20} /></div>
                  <span>Document</span>
                </button>
                <button className="attach-menu-item" onClick={() => { setShowAttachMenu(false); document.getElementById('attach-file').click(); }}>
                  <div className="attach-icon"><FolderOpen size={20} /></div>
                  <span>File</span>
                </button>
              </div>
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
          <div style={{ position: 'relative' }}>
            <button 
              className="secondary-icon-btn" 
              title="Attach file"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              disabled={!selectedUser}
            >
              <Paperclip size={18} />
            </button>
          </div>
          <input
            type="text"
            placeholder={selectedUser ? "Write a message..." : "Select a conversation to send a message"}
            value={message}
            onChange={handleTyping}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            onBlur={() => stopTyping()}
            disabled={!selectedUser}
          />
          <button className="send-btn" onClick={sendMessage} disabled={!selectedUser}>
            <Send size={18} />
          </button>
        </div>
        )}

        {/* Hidden file inputs for attachment menu */}
        <input id="attach-image" type="file" accept="image/*" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
        <input id="attach-video" type="file" accept="video/*" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
        <input id="attach-audio" type="file" accept="audio/*" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
        <input id="attach-document" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
        <input id="attach-file" type="file" accept="*/*" onChange={handleMediaShare} disabled={!selectedUser} style={{ display: "none" }} />
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
            <div className="toast-notice toast-animate">
              Uploading file...
            </div>
          )}
        </AnimatePresence>

      {contextMenu && (
        <div className="context-menu" style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x }}>
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

      {/* Profile Preview Modal */}
      {profilePreviewUser && (
        <div className="profile-preview-overlay" onClick={() => setProfilePreviewUser(null)}>
          <div className="profile-preview-card profile-card-animate" onClick={(e) => e.stopPropagation()}>
            <button className="profile-preview-close" onClick={() => setProfilePreviewUser(null)}>
              <X size={20} />
            </button>
            <div className="profile-preview-avatar">
              <Avatar
                src={userProfiles[normalizeEmail(profilePreviewUser.email)] || null}
                email={profilePreviewUser.email}
                size={120}
              />
            </div>
            <h3 className="profile-preview-name">{getDisplayName(profilePreviewUser.email)}</h3>
            <p className="profile-preview-email">{profilePreviewUser.email}</p>
            <p className="profile-preview-status">
              {isUserOnline(profilePreviewUser.email) ? (
                <span className="last-seen online"><span className="online-dot" /> Online</span>
              ) : (
                <LastSeen userId={profilePreviewUser.email} />
              )}
            </p>
            <div className="profile-preview-actions">
              {userProfiles[normalizeEmail(profilePreviewUser.email)] && (
                <button
                  className="profile-preview-action-btn"
                  onClick={() => handleViewFullImage(
                    userProfiles[normalizeEmail(profilePreviewUser.email)],
                    "profile",
                    getDisplayName(profilePreviewUser.email),
                    profilePreviewUser.isOwn
                  )}
                >
                  View Full Image
                </button>
              )}
              {profilePreviewUser.isOwn && (
                <>
                  <label htmlFor="preview-change-photo" className="profile-preview-action-btn primary">
                    Change Photo
                  </label>
                  <input
                    id="preview-change-photo"
                    type="file"
                    accept="image/*"
                    onChange={handleUpdateProfilePic}
                    style={{ display: "none" }}
                  />
                  {userProfiles[normalizeEmail(profilePreviewUser.email)] && (
                    <button
                      className="profile-preview-action-btn danger"
                      onClick={() => { handleRemoveProfilePic(); setProfilePreviewUser(null); }}
                    >
                      Remove Photo
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Image Viewer */}
      {imageViewerState.open && (
        <div className="fullscreen-viewer-overlay" onClick={() => { setImageViewerState({ open: false, src: null, type: "media", name: "", isOwn: false }); setImageZoom(1); }}>
          <div className="fullscreen-viewer-toolbar" onClick={(e) => e.stopPropagation()}>
            <span className="fullscreen-viewer-title">{imageViewerState.name || "Image"}</span>
            <div className="fullscreen-viewer-controls">
              <button onClick={() => setImageZoom(z => Math.max(0.5, z - 0.25))} title="Zoom out"><ZoomOut size={20} /></button>
              <span className="fullscreen-zoom-level">{Math.round(imageZoom * 100)}%</span>
              <button onClick={() => setImageZoom(z => Math.min(3, z + 0.25))} title="Zoom in"><ZoomIn size={20} /></button>
              <button onClick={() => handleDownloadImage(imageViewerState.src, imageViewerState.name)} title="Download"><Download size={20} /></button>
              {imageViewerState.isOwn && (
                <>
                  <label htmlFor="viewer-change-photo" className="fullscreen-toolbar-btn" title="Change photo">
                    <Camera size={20} />
                  </label>
                  <input
                    id="viewer-change-photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => { handleUpdateProfilePic(e); setImageViewerState({ open: false, src: null, type: "media", name: "", isOwn: false }); }}
                    style={{ display: "none" }}
                  />
                  <button
                    className="fullscreen-toolbar-btn danger"
                    onClick={() => { handleRemoveProfilePic(); setImageViewerState({ open: false, src: null, type: "media", name: "", isOwn: false }); }}
                    title="Remove photo"
                  >
                    <Trash2 size={20} />
                  </button>
                </>
              )}
              <button onClick={() => { setImageViewerState({ open: false, src: null, type: "media", name: "", isOwn: false }); setImageZoom(1); }} title="Close"><X size={20} /></button>
            </div>
          </div>
          <div
            className="fullscreen-viewer-content"
            onClick={(e) => e.stopPropagation()}
            style={{ transform: `scale(${imageZoom})` }}
          >
            <img src={imageViewerState.src} alt={imageViewerState.name || "Full image"} />
          </div>
        </div>
      )}

      {/* Image Crop Modal */}
      {cropState.open && (
        <ImageCropModal
          src={cropState.src}
          onCrop={handleCropSave}
          onCancel={() => setCropState({ open: false, src: null, file: null })}
        />
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
        <button className="bottom-nav-btn" onClick={() => setSelectedUser(null)}><Users size={18} /><span>Contacts</span></button>
        <button className="bottom-nav-btn" onClick={() => setShowArchivedChats(!showArchivedChats)}><Archive size={18} /><span>Archive</span></button>
        <button className="bottom-nav-btn" onClick={() => setShowSettings(true)}><Settings size={18} /><span>More</span></button>
      </nav>

      {showSettings && (
        <div className="settings-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h3>Settings</h3>
              <button className="settings-close-btn" onClick={() => setShowSettings(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="settings-body">
              <div className="settings-section settings-profile">
                <div className="settings-avatar-wrapper">
                  <Avatar
                    src={userProfiles[user?.email?.toLowerCase()] || user?.profilePic}
                    email={user?.email}
                    size={96}
                    className="settings-avatar"
                  />
                  <div className="avatar-actions">
                    <label htmlFor="update-profile-pic-settings" className="avatar-action-btn primary">
                      <Camera size={16} />
                      <span>Change Photo</span>
                    </label>
                    {(userProfiles[user?.email?.toLowerCase()] || user?.profilePic) && (
                      <button className="avatar-action-btn danger" onClick={handleRemoveProfilePic}>
                        <Trash2 size={16} />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  <input
                    id="update-profile-pic-settings"
                    type="file"
                    accept="image/*"
                    onChange={handleUpdateProfilePic}
                    className="avatar-file-input"
                  />
                </div>
                
                <div className="settings-form-grid">
                  <div className="settings-field">
                    <label htmlFor="display-name">Display Name</label>
                    <input
                      id="display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your display name"
                      maxLength={30}
                    />
                    <span className="field-hint">{displayName.length}/30</span>
                  </div>
                  <div className="settings-field">
                    <label htmlFor="bio">Bio</label>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Write something about yourself..."
                      rows={3}
                      maxLength={160}
                    />
                    <span className="field-hint">{bio.length}/160</span>
                  </div>
                </div>
              </div>

              <div className="settings-section settings-appearance">
                <h4 className="settings-section-title">
                  <Palette size={18} />
                  <span>Appearance</span>
                </h4>
                <div className="settings-toggle-row">
                  <div className="toggle-info">
                    <span className="toggle-icon">{isDarkMode ? <Sun size={20} /> : <Moon size={20} />}</span>
                    <div className="toggle-text">
                      <strong>Dark Mode</strong>
                      <small>{isDarkMode ? "Enabled" : "Disabled"}</small>
                    </div>
                  </div>
                  <button
                    className={`settings-toggle ${isDarkMode ? "active" : ""}`}
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>
              </div>

              <div className="settings-section settings-account">
                <h4 className="settings-section-title">
                  <User size={18} />
                  <span>Account</span>
                </h4>
                <div className="settings-info-list">
                  <div className="settings-info-item">
                    <span className="info-label">Email</span>
                    <span className="info-value">{user?.email}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="settings-footer">
              <button className="settings-btn secondary" onClick={() => setShowSettings(false)} disabled={isSaving}>
                Cancel
              </button>
              <button
                className="settings-btn primary"
                onClick={handleSaveSettings}
                disabled={isSaving || (!displayName.trim() && !bio.trim())}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="btn-spinner" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat;
