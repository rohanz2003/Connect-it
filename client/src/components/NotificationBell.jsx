import React, { useState, useRef, useEffect } from "react";
import { Bell, Check, X } from "lucide-react";
import Avatar from "./Avatar";

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
                    size={36}
                  />
                  <div className="notification-item-content">
                    <span className="notification-item-name">
                      {getDisplayName(req.from)}
                    </span>
                    <span className="notification-item-msg">
                      wants to chat with you
                    </span>
                  </div>
                  <div className="notification-item-actions">
                    <button
                      className="notification-accept-btn"
                      onClick={() => onRespond(req._id, "accepted")}
                      title="Accept"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      className="notification-reject-btn"
                      onClick={() => onRespond(req._id, "rejected")}
                      title="Reject"
                    >
                      <X size={16} />
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
