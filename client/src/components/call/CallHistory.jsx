import React, { useState } from "react";
import { Phone, Video, PhoneIncoming, PhoneMissed, PhoneOutgoing, PhoneCall } from "lucide-react";
import Avatar from "../Avatar";
import { formatCallDuration } from "../../utils/callHelpers";

const FILTERS = ["All", "Missed", "Incoming", "Outgoing"];

const formatCallDate = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const getCallIcon = (status, type) => {
  if (status === "missed") return <PhoneMissed size={15} className="call-hist-icon missed" />;
  if (status === "incoming") return <PhoneIncoming size={15} className="call-hist-icon incoming" />;
  if (status === "outgoing") return <PhoneOutgoing size={15} className="call-hist-icon outgoing" />;
  if (type === "video") return <Video size={15} className="call-hist-icon completed" />;
  return <PhoneCall size={15} className="call-hist-icon completed" />;
};

export default function CallHistory({ callHistory, userProfiles, getDisplayName, onCallBack }) {
  const [filter, setFilter] = useState("All");

  const filtered = (callHistory || []).filter((c) => {
    if (filter === "All") return true;
    if (filter === "Missed") return c.status === "missed";
    if (filter === "Incoming") return c.status === "incoming";
    if (filter === "Outgoing") return c.status === "outgoing" || c.status === "completed";
    return true;
  });

  return (
    <div className="call-history-panel">
      <div className="call-history-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`call-hist-filter-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="call-history-list">
        {filtered.length === 0 ? (
          <div className="call-history-empty">
            <Phone size={28} className="call-history-empty-icon" />
            <p>No {filter !== "All" ? filter.toLowerCase() + " " : ""}calls yet</p>
          </div>
        ) : (
          filtered.map((call, i) => (
            <div key={i} className="call-hist-item">
              <div className="call-hist-avatar">
                <Avatar
                  src={userProfiles?.[call.with]}
                  email={call.with}
                  size={40}
                  className="call-hist-avatar-img"
                />
              </div>
              <div className="call-hist-info">
                <span className="call-hist-name">
                  {getDisplayName ? getDisplayName(call.with) : call.with?.split("@")[0]}
                </span>
                <div className="call-hist-meta">
                  {getCallIcon(call.status, call.type)}
                  <span className={`call-hist-status ${call.status}`}>
                    {call.status === "missed" ? "Missed" : call.status === "incoming" ? "Incoming" : "Outgoing"}
                  </span>
                  <span className="call-hist-dot">·</span>
                  <span className="call-hist-date">{formatCallDate(call.timestamp)}</span>
                  {call.duration > 0 && (
                    <>
                      <span className="call-hist-dot">·</span>
                      <span className="call-hist-duration">{formatCallDuration(call.duration)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="call-hist-actions">
                {call.type === "video" ? (
                  <button
                    className="call-hist-callback-btn"
                    onClick={() => onCallBack && onCallBack(call.with, "video")}
                    title="Video call back"
                  >
                    <Video size={16} />
                  </button>
                ) : (
                  <button
                    className="call-hist-callback-btn"
                    onClick={() => onCallBack && onCallBack(call.with, "audio")}
                    title="Call back"
                  >
                    <Phone size={16} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
