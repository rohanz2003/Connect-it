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

export const sendRequest = async (from, to) => {
  const res = await axios.post(`${API_URL}/api/requests/send`, { from, to });
  return res.data;
};

export const respondToRequest = async (requestId, action) => {
  const res = await axios.post(`${API_URL}/api/requests/respond`, { requestId, action });
  return res.data;
};
