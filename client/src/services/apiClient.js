import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

/**
 * Unique Device ID Provisioning / Retrieval Fingerprint utility
 */
export function getOrCreateDeviceId() {
  let devId = localStorage.getItem("enterprise_device_id");
  if (!devId) {
    devId = "device_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem("enterprise_device_id", devId);
  }
  return devId;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Crucial for receiving HttpOnly secure cookies
  headers: {
    "Content-Type": "application/json"
  }
});

/**
 * Automated Outbound Authorization Interceptor Header Injection
 */
apiClient.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("accessToken");
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Outbound Silent Token Refresh Catchment Interceptor
 */
apiClient.interceptors.response.use(
  (response) => {
    // Intercept and extract silent tokens updated on the fly by backend middleware
    const freshlyMintedToken = response.headers["x-new-access-token"];
    if (freshlyMintedToken) {
      localStorage.setItem("accessToken", freshlyMintedToken);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Catch session revocation or clear unauthenticated logs
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      console.warn("🔒 Security Session expired or challenged. Forcing logout redirection.");
      
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
