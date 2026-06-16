import React, { useState } from "react";
import { Phone, Video, PhoneIncoming, PhoneMissed, PhoneOutgoing, PhoneCall, Trash2, X } from "lucide-react";
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

export default function CallHistory({ callHistory, userProfiles, getDisplayName, onCallBack, onItemClick, onClearAll, onDeleteItem }) {
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
      <div className="call-history-filters" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
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
        {callHistory && callHistory.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm("Clear all call history?")) {
                onClearAll && onClearAll();
              }
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--danger-color, #ef4444)",
              cursor: "pointer",
              padding: "6px 8px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: "inherit",
              flexShrink: 0
            }}
            title="Clear all call history"
          >
            <Trash2 size={12} /> Clear all
          </button>
        )}
      </div>

      <div className="call-history-list">
        {filtered.length === 0 ? (
          <div className="call-history-empty">
            <Phone size={28} className="call-history-empty-icon" />
            <p>No {filter !== "All" ? filter.toLowerCase() + " " : ""}calls yet</p>
          </div>
        ) : (
          filtered.map((call, i) => (
            <div key={i} className="call-hist-item" onClick={() => onItemClick && onItemClick(call.with)}>
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
              <div className="call-hist-actions" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {call.type === "video" ? (
                  <button
                    className="call-hist-callback-btn"
                    onClick={(e) => { e.stopPropagation(); onCallBack && onCallBack(call.with, "video"); }}
                    title="Video call back"
                  >
                    <Video size={16} />
                  </button>
                ) : (
                  <button
                    className="call-hist-callback-btn"
                    onClick={(e) => { e.stopPropagation(); onCallBack && onCallBack(call.with, "audio"); }}
                    title="Call back"
                  >
                    <Phone size={16} />
                  </button>
                )}
                <button
                  className="call-hist-callback-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete this call record?`)) {
                      onDeleteItem && onDeleteItem(i);
                    }
                  }}
                  title="Delete from history"
                  style={{ background: "transparent", color: "var(--text-light, #9ca3af)" }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
