import React, { useState, useRef, useEffect } from "react";
import { Bell, Check, X } from "lucide-react";
import Avatar from "./Avatar";

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return "";
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

function NotificationBell({ requests, userProfiles, getDisplayName, onRespond }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className="notification-bell-btn"
        onClick={() => setOpen(!open)}
        title="Notifications"
      >
        <Bell size={18} />
        {requests.length > 0 && (
          <span className="notification-badge">
            {requests.length > 99 ? "99+" : requests.length}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <h4>Chat Requests</h4>
          </div>
          <div className="notification-dropdown-body">
            {requests.length === 0 ? (
              <div className="notification-empty">No pending requests</div>
            ) : (
              requests.map((req) => (
                <div key={req._id} className="notification-item">
                  <Avatar
                    src={userProfiles[req.from]}
                    email={req.from}
                    size={40}
                  />
                  <div className="notification-item-content">
                    <span className="notification-item-name">
                      {getDisplayName(req.from)}
                    </span>
                    <span className="notification-item-msg">
                      wants to chat with you
                    </span>
                    <span className="notification-item-time">
                      {formatRelativeTime(req.createdAt)}
                    </span>
                  </div>
                  <div className="notification-item-actions">
                    <button
                      className="notification-accept-btn"
                      onClick={() => onRespond(req._id, "accepted")}
                      title="Confirm"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      className="notification-reject-btn"
                      onClick={() => onRespond(req._id, "rejected")}
                      title="Delete"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
