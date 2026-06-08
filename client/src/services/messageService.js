import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const fetchMessages = async (user1, user2, page = 1, limit = 50) => {
  const res = await axios.get(`${API_URL}/api/messages`, {
    params: { user1, user2, page, limit },
  });
  return res.data;
};

export const fetchRecentChats = async (userEmail) => {
  try {
    const res = await axios.get(`${API_URL}/api/messages/recent`, {
      params: { userEmail },
    });
    return res.data || [];
  } catch (error) {
    console.error("Failed to fetch recent chats:", error);
    return [];
  }
};

export const archiveChat = async (user, partner) => {
  const res = await axios.post(`${API_URL}/api/messages/archive`, { user, partner });
  return res.data;
};

export const unarchiveChat = async (user, partner) => {
  const res = await axios.post(`${API_URL}/api/messages/unarchive`, { user, partner });
  return res.data;
};

export const clearAllChats = async (userEmail) => {
  const res = await axios.post(`${API_URL}/api/messages/clear-all`, { userEmail });
  return res.data;
};