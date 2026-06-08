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
        setUser(mappedUser);
        const storedUserPayload = JSON.stringify({
          email: mappedUser.email,
          uid: mappedUser.uid
        });

        if (!safeLocalStorageSet("user", storedUserPayload)) {
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('chatHistory_') || key.startsWith('unread_') || key.startsWith('userProfiles_')) {
              localStorage.removeItem(key);
            }
          });
          if (!safeLocalStorageSet("user", storedUserPayload)) {
            console.warn("Storage quota exceeded: falling back to sessionStorage for user session.");
            try {
              sessionStorage.setItem("user", storedUserPayload);
            } catch (sessionError) {
              console.error("Session storage also failed", sessionError);
            }
          }
        }
      } else {
        setUser(null);
        localStorage.removeItem("user");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      
      <Route path="/login" element={<Login />} />

      <Route
        path="/chat"
        element={
          <PrivateRoute loading={loading} user={user}>
            <ErrorBoundary>
              <Chat user={user} />
            </ErrorBoundary>
          </PrivateRoute>
        }
      />

      <Route path="/feedback" element={<Feedback />} />
      
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}

export default App;                                                            