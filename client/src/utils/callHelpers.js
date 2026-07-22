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

const getCallHistoryKey = (userEmail) => {
  const suffix = userEmail ? `_${normalizeForStorage(userEmail)}` : "";
  return `call_history${suffix}`;
};

const VALID_STATUSES = new Set(["missed", "incoming", "outgoing"]);

const normalizeCallEntry = (entry, index = 0) => {
  const timestamp = entry.timestamp || Date.now();
  const status = VALID_STATUSES.has(entry.status)
    ? entry.status
    : entry.status === "completed"
      ? "outgoing"
      : "missed";

  return {
    id: entry.id || `${timestamp}-${index}-${entry.with || "unknown"}-${entry.type || "audio"}-${entry.status || "outgoing"}`,
    with: entry.with,
    type: entry.type || "audio",
    duration: Number(entry.duration) || 0,
    status,
    timestamp,
  };
};

export const saveCallToHistory = (entry, userEmail) => {
  try {
    const key = getCallHistoryKey(userEmail);
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    existing.unshift(normalizeCallEntry({
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    }));
    if (existing.length > 200) existing.length = 200;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    console.warn("Failed to save call history", e);
  }
};

export const getCallHistory = (userEmail) => {
  try {
    const key = getCallHistoryKey(userEmail);
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    return existing.map(normalizeCallEntry);
  } catch (e) {
    return [];
  }
};

export const clearCallHistory = (userEmail) => {
  try {
    const key = getCallHistoryKey(userEmail);
    localStorage.removeItem(key);
  } catch (e) {}
};

export const deleteCallHistoryEntry = (id, userEmail) => {
  try {
    const key = getCallHistoryKey(userEmail);
    const existing = getCallHistory(userEmail).filter((entry) => entry.id !== id);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    console.warn("Failed to delete call history entry", e);
  }
};

const CALL_EVENTS_KEY = "call_events";

export const saveCallEvent = (myEmail, otherEmail, event) => {
  try {
    const key = `${CALL_EVENTS_KEY}_${normalizeForStorage(myEmail)}_${normalizeForStorage(otherEmail)}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    existing.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "call_event",
      callType: event.callType || "audio",
      status: event.status || "outgoing",
      duration: event.duration || 0,
      timestamp: event.timestamp || new Date().toISOString(),
      sender: event.status === "incoming" ? otherEmail : myEmail,
      receiver: event.status === "incoming" ? myEmail : otherEmail,
    });
    if (existing.length > 100) existing.length = 100;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    console.warn("Failed to save call event", e);
  }
};

export const getCallEvents = (myEmail, otherEmail) => {
  try {
    const key = `${CALL_EVENTS_KEY}_${normalizeForStorage(myEmail)}_${normalizeForStorage(otherEmail)}`;
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch (e) {
    return [];
  }
};

const normalizeForStorage = (email) => (email || "").toLowerCase().replace(/[^a-z0-9]/g, "_");
