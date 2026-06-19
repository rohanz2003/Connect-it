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

function NotificationBell({ requests, userProfiles, getDisplayName, onRespond, history, recentAlerts = [], unreadCount = 0, onRead }) {
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
  const totalBadge = pendingCount + unreadCount;

  const handleOpen = () => {
    setOpen(true);
    if (onRead && unreadCount > 0) onRead();
  };

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button
        className="notification-bell-btn"
        onClick={handleOpen}
        title="Notifications"
      >
        <Bell size={18} />
        {totalBadge > 0 && (
          <span className="notification-badge">
            {totalBadge > 99 ? "99+" : totalBadge}
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
                className={`notification-tab ${tab === "alerts" ? "active" : ""}`}
                onClick={() => setTab("alerts")}
              >
                Alerts {recentAlerts.length > 0 && `(${recentAlerts.length})`}
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

              {tab === "alerts" && (
                recentAlerts.length === 0 ? (
                  <div className="notification-empty">No recent alerts</div>
                ) : (
                  recentAlerts.map((alert) => (
                    <div key={alert.id} className="notification-item">
                      <Avatar
                        src={userProfiles[alert.from]}
                        email={alert.from}
                        size={40}
                      />
                      <div className="notification-item-content">
                        <span className="notification-item-name">
                          {getDisplayName(alert.from)}
                        </span>
                        <span className="notification-item-msg">
                          {alert.msg}
                        </span>
                        <span className="notification-item-time">
                          {formatRelativeTime(alert.time)}
                        </span>
                      </div>
                      <div className="notification-item-icon">
                        {alert.type === "accepted" ? (
                          <Check size={16} className="accepted-icon" />
                        ) : alert.type === "cancelled" ? (
                          <X size={16} className="rejected-icon" />
                        ) : (
                          <X size={16} className="rejected-icon" />
                        )}
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
                            : item.respondedWith === "removed"
                            ? "removed you as a friend"
                            : "rejected your chat request"}
                        </span>
                        <span className="notification-item-time">
                          {formatRelativeTime(item.respondedAt)}
                        </span>
                      </div>
                      <div className="notification-item-icon">
                        {item.respondedWith === "accepted" ? (
                          <Check size={16} className="accepted-icon" />
                        ) : item.respondedWith === "removed" ? (
                          <X size={16} className="rejected-icon" />
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
