import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const fetchAllUsers = async () => {
  const res = await axios.get(`${API_URL}/api/users/all`);
  return res.data;
};

export const fetchPendingRequests = async (email) => {
  const res = await axios.get(`${API_URL}/api/requests/pending/${encodeURIComponent(email)}`);
  return res.data;
};

export const fetchSentRequests = async (email) => {
  const res = await axios.get(`${API_URL}/api/requests/sent/${encodeURIComponent(email)}`);
  return res.data;
};

export const fetchAcceptedChats = async (email) => {
  const res = await axios.get(`${API_URL}/api/requests/accepted/${encodeURIComponent(email)}`);
  return res.data;
};

export const fetchRequestStatuses = async (email) => {
  const res = await axios.get(`${API_URL}/api/requests/statuses/${encodeURIComponent(email)}`);
  return res.data;
};

export const sendRequest = async (from, to) => {
  const res = await axios.post(`${API_URL}/api/requests/send`, { from, to });
  return res.data;
};

export const unsendRequest = async (requestId) => {
  const res = await axios.delete(`${API_URL}/api/requests/${requestId}`);
  return res.data;
};

export const respondToRequest = async (requestId, action) => {
  const res = await axios.post(`${API_URL}/api/requests/respond`, { requestId, action });
  return res.data;
};

export const removeFriend = async (user, friend) => {
  const res = await axios.post(`${API_URL}/api/requests/remove-friend`, { user, friend });
  return res.data;
};

export const fetchAcceptedChatsWithMessages = async (userEmail) => {
  const res = await axios.get(`${API_URL}/api/messages/accepted`, {
    params: { userEmail },
  });
  return res.data;
};
