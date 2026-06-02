import axios from "axios";

// Use production backend URL or localhost
const API_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

export const fetchMessages = async (user1, user2) => {
  const res = await axios.get(`${API_URL}/api/messages`, {
    params: { user1, user2 },
  });
  return res.data;
};

// Fetch recent chats for a user
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