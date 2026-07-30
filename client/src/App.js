import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./components/Login";
import Chat from "./components/Chat";
import Landing from "./components/Landing";
import Feedback from "./components/Feedback";
import Admin from "./components/Admin";
import ErrorBoundary from "./components/ErrorBoundary";
import { CallProvider } from "./context/CallContext";
import { SocketProvider } from "./context/SocketContext";
import { StoryProvider } from "./context/StoryContext";
import GlobalCallOverlay from "./components/call/GlobalCallOverlay";
import authAxios from "./services/authAxios";

// ✅ Protected Route
const PrivateRoute = ({ children, loading, user }) => {
  if (loading) return <div>Loading Security Session...</div>;
  return user ? children : <Navigate to="/login" />;
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const safeLocalStorageSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.warn(`Failed to persist ${key} to localStorage`, err);
      return false;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const mappedUser = {
          email: currentUser.email,
          profilePic: currentUser.photoURL || localStorage.getItem(`profilePic_${currentUser.email.toLowerCase()}`),
          uid: currentUser.uid
        };

        // Fetch displayName from MongoDB so it persists across sessions
        authAxios.get(`/api/users/profile?email=${encodeURIComponent(currentUser.email)}`)
          .then(r => r.data)
          .then(profileData => {
            const displayName = profileData?.success && profileData?.user?.displayName ? profileData.user.displayName : "";
            const bio = profileData?.success && profileData?.user?.bio ? profileData.user.bio : "";

            mappedUser.displayName = displayName;
            mappedUser.bio = bio;
            setUser(mappedUser);

            const storedUserPayload = JSON.stringify({
              email: mappedUser.email,
              uid: mappedUser.uid,
              displayName,
              bio,
            });

            if (!safeLocalStorageSet("user", storedUserPayload)) {
              Object.keys(localStorage).forEach(key => {
                if (key.startsWith('chatHistory_') || key.startsWith('unread_') || key.startsWith('userProfiles_')) {
                  localStorage.removeItem(key);
                }
              });
              safeLocalStorageSet("user", storedUserPayload);
            }

            setLoading(false);
          })
          .catch(() => {
            // Even if fetch fails, set user without displayName (will be fetched in Chat.js)
            setUser(mappedUser);
            const storedUserPayload = JSON.stringify({
              email: mappedUser.email,
              uid: mappedUser.uid,
              displayName: "",
              bio: "",
            });
            if (!safeLocalStorageSet("user", storedUserPayload)) {
              Object.keys(localStorage).forEach(key => {
                if (key.startsWith('chatHistory_') || key.startsWith('unread_') || key.startsWith('userProfiles_')) {
                  localStorage.removeItem(key);
                }
              });
              safeLocalStorageSet("user", storedUserPayload);
            }

            setLoading(false);
          });
      } else {
        setUser(null);
        localStorage.removeItem("user");
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <SocketProvider>
    <CallProvider user={user}>
      <GlobalCallOverlay />
      <Routes>
        <Route path="/" element={<Landing />} />
        
        <Route path="/login" element={<Login />} />

        <Route
          path="/chat/*"
          element={
            <PrivateRoute loading={loading} user={user}>
              <ErrorBoundary>
                <StoryProvider user={user}>
                  <Chat user={user} />
                </StoryProvider>
              </ErrorBoundary>
            </PrivateRoute>
          }
        />

        <Route path="/feedback" element={<Feedback />} />
        
        <Route path="/admin" element={<Admin />} />
        <Route path="/chat/admin" element={<Admin />} />
      </Routes>
    </CallProvider>
    </SocketProvider>
  );
}

export default App;                                                            