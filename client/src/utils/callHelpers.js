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
    case "completed": return `Call ended`;
    default: return status;
  }
};

export const getCallStatusColor = (status) => {
  switch (status) {
    case "missed": return "#ef4444";
    case "incoming": return "#22c55e";
    case "outgoing": return "#3b82f6";
    case "completed": return "#6b7280";
    default: return "#6b7280";
  }
};

const CALL_HISTORY_KEY = "call_history";

export const saveCallToHistory = (entry) => {
  try {
    const existing = JSON.parse(localStorage.getItem(CALL_HISTORY_KEY) || "[]");
    existing.unshift({ ...entry, timestamp: Date.now() });
    if (existing.length > 200) existing.length = 200;
    localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn("Failed to save call history", e);
  }
};

export const getCallHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(CALL_HISTORY_KEY) || "[]");
  } catch (e) {
    return [];
  }
};

export const clearCallHistory = () => {
  try {
    localStorage.removeItem(CALL_HISTORY_KEY);
  } catch (e) {}
};

export const deleteCallHistoryEntry = (index) => {
  try {
    const existing = JSON.parse(localStorage.getItem(CALL_HISTORY_KEY) || "[]");
    if (index >= 0 && index < existing.length) {
      existing.splice(index, 1);
      localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(existing));
    }
  } catch (e) {
    console.warn("Failed to delete call history entry", e);
  }
};
