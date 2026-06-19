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

function NotificationBell({ requests, userProfiles, getDisplayName, onRespond, history }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [tab, setTab] = useState("pending");

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const pendingCount = requests.length;

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className="notification-bell-btn"
        onClick={() => setOpen(!open)}
        title="Notifications"
      >
        <Bell size={18} />
        {pendingCount > 0 && (
          <span className="notification-badge">
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-overlay" onClick={() => setOpen(false)}>
          <div className="notification-sidebar" onClick={(e) => e.stopPropagation()}>
            <div className="notification-sidebar-header">
              <h4>Notifications</h4>
              <button className="notification-close-btn" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="notification-tabs">
              <button
                className={`notification-tab ${tab === "pending" ? "active" : ""}`}
                onClick={() => setTab("pending")}
              >
                Pending {pendingCount > 0 && `(${pendingCount})`}
              </button>
              <button
                className={`notification-tab ${tab === "history" ? "active" : ""}`}
                onClick={() => setTab("history")}
              >
                History
              </button>
            </div>

            <div className="notification-sidebar-body">
              {tab === "pending" && (
                pendingCount === 0 ? (
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
                )
              )}

              {tab === "history" && (
                !history || history.length === 0 ? (
                  <div className="notification-empty">No notification history</div>
                ) : (
                  history.map((item, i) => (
                    <div key={item._id || i} className="notification-item">
                      <Avatar
                        src={userProfiles[item.from]}
                        email={item.from}
                        size={40}
                      />
                      <div className="notification-item-content">
                        <span className="notification-item-name">
                          {getDisplayName(item.from)}
                        </span>
                        <span className="notification-item-msg">
                          {item.respondedWith === "accepted"
                            ? "accepted your chat request"
                            : "rejected your chat request"}
                        </span>
                        <span className="notification-item-time">
                          {formatRelativeTime(item.respondedAt)}
                        </span>
                      </div>
                      <div className="notification-item-icon">
                        {item.respondedWith === "accepted" ? (
                          <Check size={16} className="accepted-icon" />
                        ) : (
                          <X size={16} className="rejected-icon" />
                        )}
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
