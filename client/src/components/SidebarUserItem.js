import React from "react";
import { Archive, X } from "lucide-react";

const SidebarUserItem = React.memo(({ 
  userEmail, 
  isSelected, 
  isOnline, 
  displayName, 
  lastSeenText, 
  unreadCount, 
  onSelect, 
  onArchive, 
  onRemove, 
  renderAvatar 
}) => {
  return (
    <div
      className={`user-item ${isSelected ? "active" : ""}`}
      onClick={() => onSelect(userEmail)}
    >
      <div className="avatar-wrap">
        {renderAvatar(userEmail, "md")}
        {isOnline && <span className="status-dot online" />}
      </div>
      <div className="user-item-copy">
        <span className="user-name">{displayName}</span>
        <span className="user-last">
          {isOnline ? "Online" : lastSeenText}
        </span>
      </div>
      <div className="user-item-actions">
        {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
        {onArchive && (
          <button 
            className="remove-recent-btn" 
            onClick={(e) => onArchive(e, userEmail)}
            title="Archive chat"
          >
            <Archive size={14} />
          </button>
        )}
        {onRemove && (
          <button 
            className="remove-recent-btn" 
            onClick={(e) => onRemove(e, userEmail)}
            title="Remove from list"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.isSelected === nextProps.isSelected &&
         prevProps.isOnline === nextProps.isOnline &&
         prevProps.displayName === nextProps.displayName &&
         prevProps.lastSeenText === nextProps.lastSeenText &&
         prevProps.unreadCount === nextProps.unreadCount;
});

export default SidebarUserItem;
