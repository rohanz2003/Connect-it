import axios from "axios";
import { auth } from "../firebase";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const authAxios = axios.create({
  baseURL: API_URL,
});

authAxios.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const idToken = await user.getIdToken();
      config.headers.Authorization = `Bearer ${idToken}`;
    } catch (err) {
      console.warn("Failed to get ID token:", err.message);
    }
  }
  return config;
});

authAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn("Unauthorized - token may be expired");
    }
    return Promise.reject(error);
  }
);

export default authAxios;
