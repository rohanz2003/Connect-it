import authAxios from "./authAxios";

export const fetchAllUsers = async () => {
  const res = await authAxios.get("/api/users/all");
  return res.data;
};

export const fetchPendingRequests = async (email) => {
  const res = await authAxios.get(`/api/requests/pending/${encodeURIComponent(email)}`);
  return res.data;
};

export const fetchSentRequests = async (email) => {
  const res = await authAxios.get(`/api/requests/sent/${encodeURIComponent(email)}`);
  return res.data;
};

export const fetchAcceptedChats = async (email) => {
  const res = await authAxios.get(`/api/requests/accepted/${encodeURIComponent(email)}`);
  return res.data;
};

export const fetchRequestStatuses = async (email) => {
  const res = await authAxios.get(`/api/requests/statuses/${encodeURIComponent(email)}`);
  return res.data;
};

export const sendRequest = async (from, to) => {
  const res = await authAxios.post("/api/requests/send", { from, to });
  return res.data;
};

export const unsendRequest = async (requestId) => {
  const res = await authAxios.delete(`/api/requests/${requestId}`);
  return res.data;
};

export const respondToRequest = async (requestId, action) => {
  const res = await authAxios.post("/api/requests/respond", { requestId, action });
  return res.data;
};

export const removeFriend = async (user, friend) => {
  const res = await authAxios.post("/api/requests/remove-friend", { user, friend });
  return res.data;
};

export const fetchAcceptedChatsWithMessages = async (userEmail) => {
  const res = await authAxios.get("/api/messages/accepted", {
    params: { userEmail },
  });
  return res.data;
};
