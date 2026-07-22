const CHANNEL_NAME = "connect-it-notifications";

let channel = null;

export const getBroadcastChannel = () => {
  if (channel) return channel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch (e) {
    return null;
  }
  return channel;
};

export const broadcastEvent = (event) => {
  try {
    const ch = getBroadcastChannel();
    if (ch) {
      ch.postMessage({ ...event, _tabId: getTabId() });
    }
  } catch (e) {
  }
};

export const onBroadcastEvent = (handler) => {
  try {
    const ch = getBroadcastChannel();
    if (ch) {
      ch.onmessage = (e) => {
        if (e.data._tabId === getTabId()) return;
        handler(e.data);
      };
    }
    return () => {
      if (channel) {
        channel.onmessage = null;
      }
    };
  } catch (e) {
    return () => {};
  }
};

const getTabId = () => {
  let id = sessionStorage.getItem("_tabId");
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("_tabId", id);
  }
  return id;
};
