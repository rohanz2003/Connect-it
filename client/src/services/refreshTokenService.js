import { getAuthToken } from "./authToken";
import { auth } from "../firebase";

const REFRESH_TOKEN_KEY = "connect_it_refresh_token";
const ACCESS_TOKEN_KEY = "connect_it_access_token";
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

let isRefreshing = false;
let refreshSubscribers = [];

let cachedAccessToken = null;

const onRefreshed = (token) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

const addRefreshSubscriber = (cb) => {
  refreshSubscribers.push(cb);
};

export const storeAccessToken = (token) => {
  cachedAccessToken = token;
  try {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token || "");
  } catch (e) {
    console.warn("Failed to store access token", e);
  }
};

export const getAccessToken = () => {
  if (cachedAccessToken) return cachedAccessToken;
  try {
    cachedAccessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    return cachedAccessToken;
  } catch (e) {
    return null;
  }
};

export const clearAccessToken = () => {
  cachedAccessToken = null;
  try {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch (e) {
    console.warn("Failed to clear access token", e);
  }
};

export const storeRefreshToken = (token) => {
  try {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch (e) {
    console.warn("Failed to store refresh token", e);
  }
};

export const getStoredRefreshToken = () => {
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (e) {
    return null;
  }
};

export const clearRefreshToken = () => {
  try {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch (e) {
    console.warn("Failed to clear refresh token", e);
  }
};

export const refreshAccessToken = async () => {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  if (isRefreshing) {
    return new Promise((resolve) => {
      addRefreshSubscriber((token) => resolve(token));
    });
  }

  isRefreshing = true;
  try {
    const firebaseToken = await getAuthToken(true);
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseToken}`,
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearRefreshToken();
      throw new Error("Token refresh failed");
    }

    const data = await response.json();
    storeRefreshToken(data.refreshToken);
    storeAccessToken(data.token);
    onRefreshed(data.token);
    return data.token;
  } catch (err) {
    clearAccessToken();
    clearRefreshToken();
    throw err;
  } finally {
    isRefreshing = false;
  }
};
