import React, { useMemo, useCallback } from "react";
import { Search, MessageCircle, PlusCircle, Sun, Moon, Trash2 } from "lucide-react";
import SidebarUserItem from "./SidebarUserItem";
import { formatLastSeen } from "../utils/timeFormatter";

const normalizeEmail = (email) => (email || "").toLowerCase().trim();

const Sidebar = React.memo(({ 
  user, 
  searchTerm, 
  setSearchTerm, 
  isDarkMode, 
  setIsDarkMode, 
  selectedUser, 
  handleUserSelect, 
  onlineUsers, 
  chatHistory, 
  userMetadata, 
  lastSeen, 
  unreadMessages, 
  handleClearAllHistory, 
  handleArchiveChat, 
  handleRemoveChatFromRecent, 
  renderAvatar,
  navigate,
  setSelectedUser
}) => {
  const getDisplayName = useCallback((email) => {
    if (!email || typeof email !== 'string') return "User";
    const lowerEmail = email.toLowerCase();
    return userMetadata[lowerEmail]?.displayName || email.split("@")[0];
  }, [userMetadata]);

  const isUserOnline = useCallback((userEmail) =>
    onlineUsers.some((u) => normalizeEmail(u) === normalizeEmail(userEmail)), [onlineUsers]);

  const getUnreadCount = useCallback((otherUser) => {
    if (!user || !otherUser) return 0;
    const key = `${normalizeEmail(otherUser)}_${normalizeEmail(user.email)}`;
    return unreadMessages[key] || 0;
  }, [unreadMessages, user]);

  const recentChats = useMemo(() => Object.keys(chatHistory)
    .filter(u => u !== user?.email)
    .sort((a, b) => {
      const historyA = chatHistory[a] || [];
      const historyB = chatHistory[b] || [];
      const lastA = historyA[historyA.length - 1];
      const lastB = historyB[historyB.length - 1];
      const timeA = new Date(lastA?.timestamp || lastA?.createdAt || 0);
      const timeB = new Date(lastB?.timestamp || lastB?.createdAt || 0);
      return new Date(timeB) - new Date(timeA);
    }), [chatHistory, user]);

  const searchValue = searchTerm.trim().toLowerCase();
  
  const filteredRecentChats = useMemo(() => recentChats.filter((u) => {
    const normalizedEmail = normalizeEmail(u);
    return (
      normalizedEmail.includes(searchValue) ||
      getDisplayName(u).toLowerCase().includes(searchValue)
    );
  }), [recentChats, searchValue, getDisplayName]);

  const otherOnlineUsers = useMemo(() => onlineUsers.filter(u => {
    if (!u || typeof u !== 'string') return false;
    return u.toLowerCase().trim() !== user?.email?.toLowerCase().trim();
  }), [onlineUsers, user]);

  const filteredOnlineUsers = useMemo(() => otherOnlineUsers.filter((u) => {
    const normalizedEmail = normalizeEmail(u);
    return (
      normalizedEmail.includes(searchValue) ||
      getDisplayName(u).toLowerCase().includes(searchValue)
    );
  }), [otherOnlineUsers, searchValue, getDisplayName]);

  return (
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
          {filteredRecentChats.length > 0 ? filteredRecentChats.map((u) => (
            <SidebarUserItem
              key={`recent-${u}`}
              userEmail={u}
              isSelected={normalizeEmail(selectedUser) === normalizeEmail(u)}
              isOnline={isUserOnline(u)}
              displayName={getDisplayName(u)}
              lastSeenText={formatLastSeen(lastSeen[u])}
              unreadCount={getUnreadCount(u)}
              onSelect={handleUserSelect}
              onArchive={handleArchiveChat}
              onRemove={handleRemoveChatFromRecent}
              renderAvatar={renderAvatar}
            />
          )) : (
            <div className="empty-list">Try searching or start a new conversation.</div>
          )}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Online Users</div>
        <div className="sidebar-list">
          {filteredOnlineUsers.length > 0 ? filteredOnlineUsers.map((u) => (
            <SidebarUserItem
              key={`online-${u}`}
              userEmail={u}
              isSelected={normalizeEmail(selectedUser) === normalizeEmail(u)}
              isOnline={true}
              displayName={getDisplayName(u)}
              lastSeenText="Available now"
              unreadCount={getUnreadCount(u)}
              onSelect={handleUserSelect}
              renderAvatar={renderAvatar}
            />
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
  );
});

export default Sidebar;
