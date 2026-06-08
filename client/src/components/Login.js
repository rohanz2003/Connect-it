import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth } from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  Eye,
  EyeOff,
  ArrowLeft,
  Mail,
  Lock,
  User,
  CheckCircle,
  XCircle,
  Shield,
  Zap,
  Cloud,
  Camera,
} from "lucide-react";
import "./Login.css";

const validatePassword = (pwd) => {
  const errors = [];
  if (pwd.length < 8) errors.push("At least 8 characters");
  if (!/[A-Z]/.test(pwd)) errors.push("At least 1 uppercase letter");
  if (!/[a-z]/.test(pwd)) errors.push("At least 1 lowercase letter");
  if (!/[0-9]/.test(pwd)) errors.push("At least 1 number");
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd)) errors.push("At least 1 special character");
  return errors;
};

const PasswordStrength = ({ password }) => {
  if (!password) return null;
  const checks = [
    { label: "8+ Characters", met: password.length >= 8 },
    { label: "Uppercase", met: /[A-Z]/.test(password) },
    { label: "Lowercase", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special Character", met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password) },
  ];
  const score = checks.filter((c) => c.met).length;

  return (
    <div className="pwd-strength">
      <div className="pwd-strength-bar">
        <div className={`pwd-strength-fill pwd-strength-${score}`} style={{ width: `${(score / 5) * 100}%` }} />
      </div>
      <div className="pwd-strength-checks">
        {checks.map((c, i) => (
          <span key={i} className={`pwd-strength-check ${c.met ? "met" : ""}`}>
            {c.met ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
};

function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profilePic, setProfilePic] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const handleProfilePicChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 150;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
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

    if (isRegistering && !displayName.trim()) {
      setError("Please enter your display name.");
      return;
    }

    if (isRegistering) {
      const pwdErrors = validatePassword(password);
      if (pwdErrors.length > 0) {
        setError("Password requirements: " + pwdErrors.join(", "));
        return;
      }
    }

    setLoading(true);
    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        if (profilePreview) {
          try {
            localStorage.setItem(`profilePic_${email.toLowerCase()}`, profilePreview);
          } catch (e) {
            console.warn("Profile picture storage quota exceeded");
          }
        }

        try {
          const stored = JSON.parse(localStorage.getItem("user") || "{}");
          localStorage.setItem("user", JSON.stringify({ ...stored, displayName: displayName.trim() }));
        } catch (e) {}

        await sendPasswordResetEmail(auth, email).catch(() => {});
        setMessage("Account created! Please sign in to continue.");
        setIsRegistering(false);
        setProfilePic(null);
        setProfilePreview(null);
        setDisplayName("");
        setEmail("");
        setPassword("");
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        if (!userCredential.user.emailVerified) {
          setError("Please verify your email before logging in. Check your Gmail inbox.");
          await signOut(auth);
          setLoading(false);
          return;
        }

        const storedProfilePic = localStorage.getItem(`profilePic_${userCredential.user.email.toLowerCase()}`);
        const profilePicUrl = userCredential.user.photoURL || storedProfilePic || null;
        const signedInUser = {
          email: userCredential.user.email,
          uid: userCredential.user.uid,
          profilePic: profilePicUrl,
        };

        try {
          localStorage.setItem(
            "user",
            JSON.stringify({
              email: signedInUser.email,
              uid: signedInUser.uid,
            })
          );
        } catch (storageError) {
          Object.keys(localStorage).forEach((key) => {
            if (key.startsWith("chatHistory_") || key.startsWith("unread_") || key.startsWith("userProfiles_")) {
              localStorage.removeItem(key);
            }
          });
          try {
            localStorage.setItem(
              "user",
              JSON.stringify({
                email: signedInUser.email,
                uid: signedInUser.uid,
              })
            );
          } catch (f) {
            try {
              sessionStorage.setItem(
                "user",
                JSON.stringify({
                  email: signedInUser.email,
                  uid: signedInUser.uid,
                })
              );
            } catch (sessionError) {}
          }
        }

        if (profilePicUrl && !userCredential.user.photoURL) {
          try {
            localStorage.setItem(`profilePic_${signedInUser.email.toLowerCase()}`, profilePicUrl);
          } catch (e) {}
        }

        navigate("/chat");
      }
    } catch (err) {
      const errorMap = {
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-credential": "Invalid email or password.",
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/weak-password": "Password is too weak.",
        "auth/too-many-requests": "Too many attempts. Please try again later.",
        "auth/network-request-failed": "Network error. Check your connection.",
      };
      setError(errorMap[err.code] || err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError("");
    if (!resetEmail || !validateGmail(resetEmail)) {
      setError("Please enter a valid Gmail address.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
      setMessage("Password reset email sent! Check your Gmail inbox.");
    } catch (err) {
      const errorMap = {
        "auth/user-not-found": "No account found with this email.",
        "auth/too-many-requests": "Too many requests. Please try again later.",
      };
      setError(errorMap[err.code] || err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError("");
    setMessage("");
    setEmail("");
    setPassword("");
    setDisplayName("");
    setProfilePic(null);
    setProfilePreview(null);
  };

  return (
    <div className="login-split">
      <Link to="/" className="login-back-home">
        <ArrowLeft size={18} /> Back to Home
      </Link>

      {/* Left branding panel */}
      <div className="login-left-panel">
        <h1>Connect with the world</h1>
        <p className="login-left-subtitle">
          Secure, fast, and enterprise-ready messaging for modern teams.
        </p>
        <ul className="login-features">
          <li>
            <Shield size={18} />
            <span>End-to-End Encrypted</span>
          </li>
          <li>
            <Zap size={18} />
            <span>Real-time Sync</span>
          </li>
          <li>
            <Cloud size={18} />
            <span>Cloud Storage</span>
          </li>
        </ul>
      </div>

      {/* Right form panel */}
      <div className="login-right-panel">
        {showForgotPassword ? (
          <div className="login-form-wrap">
            <div className="login-logo-icon">
              <span>C</span>
            </div>
            <h2>Reset Password</h2>
            <p className="login-form-subtitle">Enter your email to receive a reset link</p>

            {error && <div className="login-error">{error}</div>}
            {message && <div className="login-success">{message}</div>}

            {!resetSent ? (
              <form onSubmit={handleForgotPassword}>
                <div className="login-input-group">
                  <Mail size={18} className="login-input-icon" />
                  <input
                    type="email"
                    placeholder="Gmail Address"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="login-submit-btn" disabled={loading}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            ) : (
              <div className="login-reset-success">
                <CheckCircle size={48} className="login-success-icon" />
                <p>Check your email for the password reset link.</p>
                <button
                  className="login-submit-btn"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetSent(false);
                    setResetEmail("");
                    setMessage("");
                  }}
                >
                  Back to Login
                </button>
              </div>
            )}

            <p className="login-toggle">
              <span
                onClick={() => {
                  setShowForgotPassword(false);
                  setError("");
                  setMessage("");
                }}
              >
                Back to Login
              </span>
            </p>
          </div>
        ) : (
          <div className="login-form-wrap">
            <div className="login-logo-icon">
              <span>C</span>
            </div>
            <h2>{isRegistering ? "Create Account" : "Welcome Back"}</h2>
            <p className="login-form-subtitle">
              {isRegistering ? "Join our secure network today" : "Sign in to your secure workspace"}
            </p>

            {error && <div className="login-error">{error}</div>}
            {message && <div className="login-success">{message}</div>}

            <form onSubmit={handleAuth}>
              {isRegistering && (
                <>
                  <div className="login-profile-section">
                    <div className="login-profile-circle" onClick={() => fileInputRef.current?.click()}>
                      {profilePreview ? (
                        <img src={profilePreview} alt="Profile" className="login-profile-img" />
                      ) : (
                        <div className="login-profile-placeholder">
                          <Camera size={24} />
                        </div>
                      )}
                      <div className="login-profile-badge">+</div>
                    </div>
                    <span className="login-profile-text">Choose Profile Picture</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePicChange}
                      style={{ display: "none" }}
                    />
                  </div>

                  <div className="login-input-group">
                    <User size={18} className="login-input-icon" />
                    <input
                      type="text"
                      placeholder="Display Name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <div className="login-input-group">
                <Mail size={18} className="login-input-icon" />
                <input
                  type="email"
                  placeholder="Gmail Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="login-input-group">
                <Lock size={18} className="login-input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-pwd-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {isRegistering && <PasswordStrength password={password} />}

              {!isRegistering && (
                <div className="login-forgot">
                  <span
                    onClick={() => {
                      setShowForgotPassword(true);
                      setError("");
                      setMessage("");
                      setResetEmail(email);
                    }}
                  >
                    Forgot Password?
                  </span>
                </div>
              )}

              <button type="submit" className="login-submit-btn" disabled={loading}>
                {loading ? (
                  <span className="login-btn-loading">Loading...</span>
                ) : (
                  <>
                    {isRegistering ? "Register Now" : "Sign In"}
                    <span className="login-btn-arrow">→</span>
                  </>
                )}
              </button>
            </form>

            <p className="login-toggle">
              {isRegistering ? (
                <>
                  Already have an account?{" "}
                  <span onClick={toggleMode}>Sign In</span>
                </>
              ) : (
                <>
                  New to Connect?{" "}
                  <span onClick={toggleMode}>Create Account</span>
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Login;
