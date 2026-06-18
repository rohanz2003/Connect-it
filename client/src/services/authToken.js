import { auth } from "../firebase";
import {
  storeRefreshToken,
  clearRefreshToken,
  refreshAccessToken,
  getStoredRefreshToken,
} from "./refreshTokenService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const getAuthToken = async (forceRefresh = false) => {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  return currentUser.getIdToken(forceRefresh);
};

export const authHeaders = async (extraHeaders = {}) => {
  const token = await getAuthToken();
  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const tryRefreshOn401 = async (url, options, retries = 0) => {
  const response = await fetch(url, options);
  if (response.status === 401 && retries < 1) {
    const refreshToken = getStoredRefreshToken();
    if (refreshToken) {
      try {
        const newToken = await refreshAccessToken();
        const firebaseToken = await getAuthToken();
        options.headers = {
          ...options.headers,
          Authorization: `Bearer ${firebaseToken}`,
        };
        const retryResponse = await fetch(url, options);
        if (retryResponse.ok) {
          return retryResponse;
        }
      } catch (err) {
        clearRefreshToken();
        throw err;
      }
    }
  }
  return response;
};

export const createSession = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("Not authenticated");

  const response = await fetch(`${API_URL}/api/auth/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Session creation failed");
  }

  const data = await response.json();
  if (data.refreshToken) {
    storeRefreshToken(data.refreshToken);
  }
  return data;
};

export const logoutSession = async () => {
  const refreshToken = getStoredRefreshToken();
  const token = await getAuthToken();
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ refreshToken }),
    });
  } finally {
    clearRefreshToken();
  }
};

export const logoutAllDevices = async () => {
  const token = await getAuthToken();
  try {
    await fetch(`${API_URL}/api/auth/logout-all`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } finally {
    clearRefreshToken();
  }
};

export const authFetch = async (url, options = {}) => {
  const token = await getAuthToken();
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return tryRefreshOn401(url, { ...options, headers });
};
