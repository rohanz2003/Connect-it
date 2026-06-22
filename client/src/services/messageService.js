import authAxios from "./authAxios";

export const fetchMessages = async (user1, user2, before) => {
  const params = { user1, user2 };
  if (before) params.before = before;
  const res = await authAxios.get("/api/messages", { params });
  return res.data;
};

export const fetchRecentChats = async (userEmail) => {
  try {
    const res = await authAxios.get("/api/messages/recent", {
      params: { userEmail },
    });
    return res.data || [];
  } catch (error) {
    console.error("Failed to fetch recent chats:", error);
    return [];
  }
};