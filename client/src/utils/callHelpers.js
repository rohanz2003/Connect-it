export const formatCallDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export const getCallStatusLabel = (status) => {
  switch (status) {
    case "missed": return "Missed call";
    case "incoming": return "Incoming call";
    case "outgoing": return "Outgoing call";
    default: return status;
  }
};

export const getCallStatusColor = (status) => {
  switch (status) {
    case "missed": return "#ef4444";
    case "incoming": return "#22c55e";
    case "outgoing": return "#3b82f6";
    default: return "#6b7280";
  }
};

const CALL_HISTORY_KEY = "call_history";
const VALID_STATUSES = new Set(["missed", "incoming", "outgoing"]);

const normalizeCallEntry = (entry, index = 0) => {
  const timestamp = entry.timestamp || Date.now();
  const status = VALID_STATUSES.has(entry.status)
    ? entry.status
    : entry.status === "completed"
      ? "outgoing"
      : "outgoing";

  return {
    id: entry.id || `${timestamp}-${index}-${entry.with || "unknown"}-${entry.type || "audio"}-${entry.status || "outgoing"}`,
    with: entry.with,
    type: entry.type || "audio",
    duration: Number(entry.duration) || 0,
    status,
    timestamp,
    seen: entry.seen === true,
  };
};

export const saveCallToHistory = (entry) => {
  try {
    const existing = JSON.parse(localStorage.getItem(CALL_HISTORY_KEY) || "[]");
    existing.unshift(normalizeCallEntry({
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    }));
    if (existing.length > 200) existing.length = 200;
    localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn("Failed to save call history", e);
  }
};

export const getCallHistory = () => {
  try {
    const existing = JSON.parse(localStorage.getItem(CALL_HISTORY_KEY) || "[]");
    return existing.map(normalizeCallEntry);
  } catch (e) {
    return [];
  }
};

export const markMissedCallsAsRead = () => {
  try {
    const existing = getCallHistory();
    let changed = false;
    const updated = existing.map((entry) => {
      if (entry.status === "missed" && !entry.seen) {
        changed = true;
        return { ...entry, seen: true };
      }
      return entry;
    });
    if (changed) {
      localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(updated));
    }
  } catch (e) {
    console.warn("Failed to mark missed calls as read", e);
  }
};

export const clearCallHistory = () => {
  try {
    localStorage.removeItem(CALL_HISTORY_KEY);
  } catch (e) {}
};

export const deleteCallHistoryEntry = (id) => {
  try {
    const existing = getCallHistory().filter((entry) => entry.id !== id);
    localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn("Failed to delete call history entry", e);
  }
};
