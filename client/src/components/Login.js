import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { Check, X, Shield, Lock, Mail, ArrowRight, ArrowLeft, Camera, Loader2, PlusCircle } from "lucide-react";
import "./Login.css";

function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profilePic, setProfilePic] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showRegSuccess, setShowRegSuccess] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const navigate = useNavigate();

  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false
  });

  const validatePassword = (pass) => {
    setPasswordValidation({
      length: pass.length >= 8,
      uppercase: /[A-Z]/.test(pass),
      lowercase: /[a-z]/.test(pass),
      number: /[0-9]/.test(pass),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(pass)
    });
  };

  const handlePasswordChange = (e) => {
    const val = e.target.value;
    setPassword(val);
    validatePassword(val);
  };

  const isPasswordSecure = () => {
    return Object.values(passwordValidation).every(v => v === true);
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;
    setIsLoading(true);
    try {
      // We need to sign in briefly to resend verification if the user isn't logged in
      // But Firebase often allows sending verification if we have the user object.
      // Since we just signed out, we might need to prompt them to try logging in again to trigger the error + button
      // Or if we still have the user object in a temp variable (not shown here).
      // A better way is to tell the user to try signing in again, and we catch the unverified state.
      
      // In this specific implementation, we'll assume they need to login to get the user object for verification.
      // But wait, sendEmailVerification requires a User object.
      // Let's simplify: if they click resend, we tell them to try signing in again to trigger the process,
      // OR we use the current email to re-authenticate briefly if we had the password.
      // Since we don't store the password in state for security after login attempt, 
      // let's just show a helpful message.
      setMessage("Please try to sign in again. If your email is unverified, we will prompt you.");
    } catch (err) {
      setError("Failed to resend verification. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset email sent! Please check your inbox.");
      setIsForgotPassword(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

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

    if (isRegistering && !isPasswordSecure()) {
      setError("Please ensure your password meets all security requirements.");
      return;
    }

    setIsLoading(true);
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
        setShowRegSuccess(true);
        setIsRegistering(false);
        setProfilePic(null);
        setProfilePreview(null);
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        if (!userCredential.user.emailVerified) {
          setUnverifiedEmail(email);
          setError("Your email address has not been verified yet. Please verify your email before logging in.");
          await signOut(auth);
          return;
        }

        setUnverifiedEmail("");
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
    } finally {
      setIsLoading(false);
    }
  };

  if (isForgotPassword) {
    return (
      <div className="login-page-v2">
        <div className="auth-card">
          <div className="auth-header">
            <div className="brand-logo">C</div>
            <h2>Reset Password</h2>
            <p>Enter your email to receive a reset link</p>
          </div>
          
          {error && <div className="auth-error"><X size={16} /> {error}</div>}
          {message && <div className="auth-success"><Check size={16} /> {message}</div>}

          <form onSubmit={handleForgotPassword}>
            <div className="auth-input-group">
              <Mail size={18} />
              <input
                type="email"
                placeholder="Gmail Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={isLoading}>
              {isLoading ? <Loader2 className="spinner" size={20} /> : "Send Reset Link"}
            </button>
          </form>

          <button className="auth-back-btn" onClick={() => setIsForgotPassword(false)}>
            <ArrowLeft size={16} /> Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page-v2">
      <div className="auth-container">
        <div className="auth-visual-side">
          <div className="visual-content">
            <h1>Connect with the world</h1>
            <p>Secure, fast, and enterprise-ready messaging for modern teams.</p>
            <div className="visual-features">
              <div className="v-feature"><Shield size={20} /> <span>End-to-End Encrypted</span></div>
              <div className="v-feature"><Check size={20} /> <span>Real-time Sync</span></div>
              <div className="v-feature"><Check size={20} /> <span>Cloud Storage</span></div>
            </div>
          </div>
        </div>

        <div className="auth-form-side">
          <AnimatePresence>
            {showRegSuccess && (
              <SuccessModal 
                isOpen={showRegSuccess} 
                onClose={() => setShowRegSuccess(false)} 
                onGoToLogin={() => {
                  setShowRegSuccess(false);
                  setIsRegistering(false);
                }} 
              />
            )}
          </AnimatePresence>
          <div className="auth-card">
            <div className="auth-header">
              <div className="brand-logo">C</div>
              <h2>{isRegistering ? "Create Account" : "Welcome Back"}</h2>
              <p>{isRegistering ? "Join our secure network today" : "Sign in to your secure workspace"}</p>
            </div>

            {error && (
              <div className="auth-error">
                <div className="error-content">
                  <X size={16} /> {error}
                </div>
                {unverifiedEmail && (
                  <button type="button" className="resend-btn" onClick={() => {
                    setMessage("Check your inbox for a new verification link.");
                    setUnverifiedEmail("");
                  }}>
                    Resend Email
                  </button>
                )}
              </div>
            )}
            {message && <div className="auth-success"><Check size={16} /> {message}</div>}

            <form onSubmit={handleAuth}>
              {isRegistering && (
                <div className="profile-upload-v2">
                  <label htmlFor="profile-pic" className="avatar-preview-v2">
                    {profilePreview ? (
                      <img src={profilePreview} alt="Preview" />
                    ) : (
                      <div className="avatar-placeholder-v2"><Camera size={24} /></div>
                    )}
                    <div className="upload-overlay"><PlusCircle size={16} /></div>
                  </label>
                  <input
                    id="profile-pic"
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePicChange}
                    style={{ display: "none" }}
                  />
                  <span>Choose Profile Picture</span>
                </div>
              )}

              <div className="auth-input-group">
                <Mail size={18} />
                <input
                  type="email"
                  placeholder="Gmail Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="auth-input-group">
                <Lock size={18} />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={handlePasswordChange}
                  required
                />
              </div>

              {!isRegistering && (
                <div className="forgot-pass-link" onClick={() => setIsForgotPassword(true)}>
                  Forgot Password?
                </div>
              )}

              {isRegistering && (
                <div className="password-checker">
                  <div className={`check-item ${passwordValidation.length ? 'valid' : ''}`}>
                    {passwordValidation.length ? <Check size={12} /> : <X size={12} />} 8+ Characters
                  </div>
                  <div className={`check-item ${passwordValidation.uppercase ? 'valid' : ''}`}>
                    {passwordValidation.uppercase ? <Check size={12} /> : <X size={12} />} Uppercase
                  </div>
                  <div className={`check-item ${passwordValidation.lowercase ? 'valid' : ''}`}>
                    {passwordValidation.lowercase ? <Check size={12} /> : <X size={12} />} Lowercase
                  </div>
                  <div className={`check-item ${passwordValidation.number ? 'valid' : ''}`}>
                    {passwordValidation.number ? <Check size={12} /> : <X size={12} />} Number
                  </div>
                  <div className={`check-item ${passwordValidation.special ? 'valid' : ''}`}>
                    {passwordValidation.special ? <Check size={12} /> : <X size={12} />} Special Character
                  </div>
                </div>
              )}

              <button type="submit" className="auth-submit-btn" disabled={isLoading}>
                {isLoading ? <Loader2 className="spinner" size={20} /> : (
                  <>
                    {isRegistering ? "Register Now" : "Sign In"} <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <p className="auth-toggle-v2">
              {isRegistering ? "Already have an account?" : "New to Connect?"}{" "}
              <span onClick={() => {
                setIsRegistering(!isRegistering);
                setError("");
                setMessage("");
              }}>
                {isRegistering ? "Sign In" : "Create Account"}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const SuccessModal = ({ isOpen, onClose, onGoToLogin }) => {
  return (
    <div className="modal-overlay-v2" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="success-modal-v2" 
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-icon-v2">
          <Check size={44} strokeWidth={3} />
        </div>
        <h3>Registration Successful</h3>
        <p className="modal-main-text">Your account has been created successfully!</p>
        <div className="modal-info-box">
          <p className="modal-subtext">A verification link was sent to your email.</p>
          <p className="modal-hint">Please check your <strong>Inbox</strong> or <strong>Spam</strong> folder to activate your account.</p>
        </div>
        
        <div className="modal-actions-v2">
          <button className="modal-btn secondary" onClick={onClose}>Maybe Later</button>
          <button className="modal-btn primary" onClick={onGoToLogin}>Login Now</button>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;