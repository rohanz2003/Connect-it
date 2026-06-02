import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import "./Login.css";

function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profilePic, setProfilePic] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const navigate = useNavigate();

  const handleProfilePicChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 150;
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", 0.7);
        setProfilePreview(compressed);
        setProfilePic(file);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const validateGmail = (email) => {
    return email.toLowerCase().endsWith("@gmail.com");
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!validateGmail(email)) {
      setError("Only valid Gmail addresses are allowed.");
      return;
    }

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Save profile picture to localStorage if provided
        if (profilePic || profilePreview) {
          try {
            localStorage.setItem(`profilePic_${email.toLowerCase()}`, profilePreview || "");
          } catch (e) {
            console.warn("Profile picture storage quota exceeded, skipping preview save.");
          }
        }
        
        await sendEmailVerification(userCredential.user);
        setMessage("Verification email sent! Please check your Gmail to verify your account before logging in. Your profile picture will be ready after verification.");
        setIsRegistering(false);
        setProfilePic(null);
        setProfilePreview(null);
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        if (!userCredential.user.emailVerified) {
          setError("Please verify your email before logging in. Check your Gmail inbox.");
          await signOut(auth);
          return;
        }

        const storedProfilePic = localStorage.getItem(`profilePic_${userCredential.user.email.toLowerCase()}`);
        const profilePic = userCredential.user.photoURL || storedProfilePic || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80";
        const signedInUser = {
          email: userCredential.user.email,
          uid: userCredential.user.uid,
          profilePic
        };
        const storedUserPayload = JSON.stringify({
          email: signedInUser.email,
          uid: signedInUser.uid
        });

        if (profilePic && !userCredential.user.photoURL) {
          try {
            localStorage.setItem(`profilePic_${signedInUser.email.toLowerCase()}`, profilePic);
          } catch (e) {
            console.warn("Profile picture storage quota exceeded, preserving login session without persisted profile pic.");
          }
        }

        try {
          localStorage.setItem("user", storedUserPayload);
        } catch (storageError) {
          console.warn("Quota exceeded during login. Clearing old storage keys to make room...");
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('chatHistory_') || key.startsWith('unread_') || key.startsWith('userProfiles_')) {
              localStorage.removeItem(key);
            }
          });
          try {
            localStorage.setItem("user", storedUserPayload);
          } catch (f) {
            console.error("Critical storage failure, falling back to sessionStorage");
            try {
              sessionStorage.setItem("user", storedUserPayload);
            } catch (sessionError) {
              console.error("Session storage also failed", sessionError);
            }
          }
        }
        
        navigate("/chat");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login">
      <Link to="/" className="back-to-home">
        ← Back to Home
      </Link>
      <div className="login-container">
        <h2>{isRegistering ? "Create Account" : "Connect Login"}</h2>
        <p className="subtitle">Secure enterprise messaging for Gmail users</p>
        
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}

        <form onSubmit={handleAuth}>
          {isRegistering && (
            <div className="profile-pic-section">
              <label htmlFor="profile-pic" className="profile-pic-label">
                {profilePreview ? (
                  <img src={profilePreview} alt="Profile" className="profile-pic-preview" />
                ) : (
                  <div className="profile-pic-placeholder">📷 Click to add profile picture</div>
                )}
              </label>
              <input
                id="profile-pic"
                type="file"
                accept="image/*"
                onChange={handleProfilePicChange}
                style={{ display: "none" }}
              />
              <p className="profile-pic-hint">Optional - Personalize your account with a profile picture</p>
            </div>
          )}
          <input
            type="email"
            placeholder="Gmail Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">
            {isRegistering ? "Register with Gmail" : "Sign In"}
          </button>
        </form>

        <p className="toggle-text">
          {isRegistering ? "Already have a verified account?" : "Need a secure account?"}{" "}
          <span onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? "Login here" : "Register now"}
          </span>
        </p>
      </div>
    </div>
  );
}

export default Login;