import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithPopup, GoogleAuthProvider, signInWithPhoneNumber, RecaptchaVerifier } from "firebase/auth";
import { auth } from "../firebase";
import apiClient, { getOrCreateDeviceId } from "../services/apiClient";
import { generateKeyPair } from "../utils/cryptoEngine";
import Header from "./Header";
import Footer from "./Footer";
import "./Login.css";

function Login() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Clear any leftover invisible recaptcha nodes on component mount
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      } catch (e) {
        console.warn("Recaptcha cleanup minor issue", e);
      }
    }
  }, []);

  /**
   * Browser IndexedDB or state fallback storage routine for Private Cryptographic parameters
   */
  const persistPrivateKeyLocally = async (email, privateKeyCryptoKey) => {
    try {
      const exportedRawPrivate = await window.crypto.subtle.exportKey("pkcs8", privateKeyCryptoKey);
      const b64Private = btoa(String.fromCharCode(...new Uint8Array(exportedRawPrivate)));
      localStorage.setItem(`e2ee_priv_${email.toLowerCase().trim()}`, b64Private);
    } catch (err) {
      console.error("Local cryptographic persistence failed:", err.message);
    }
  };

  /**
   * Universal Post Firebase Security Verification Synchronizer Handler
   */
  const handleBackendVerificationSync = async (firebaseUser) => {
    try {
      const idToken = await firebaseUser.getIdToken();
      const deviceId = getOrCreateDeviceId();

      const userAgent = navigator.userAgent;
      let browser = "Chrome";
      let platform = "Windows";
      if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) browser = "Safari";
      if (userAgent.includes("Firefox")) browser = "Firefox";
      if (userAgent.includes("Mac")) platform = "MacOS";
      if (userAgent.includes("Linux")) platform = "Linux";

      const response = await apiClient.post("/users/verify-login", {
        firebaseToken: idToken,
        deviceId,
        platform,
        browser,
        displayName: firebaseUser.displayName || "Secure Node",
        profilePic: firebaseUser.photoURL || ""
      });

      const { accessToken, user } = response.data;
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("user", JSON.stringify(user));

      let localPrivateKeyExists = localStorage.getItem(`e2ee_priv_${user.email.toLowerCase().trim()}`);
      if (!user.publicKeyBase64 || !localPrivateKeyExists) {
        console.log("🛠️ Establishing enterprise cryptographic key pairs for E2EE layers...");
        const keyPairs = await generateKeyPair();
        await persistPrivateKeyLocally(user.email, keyPairs.privateKey);
        
        await apiClient.post("/users/keys/register", {
          publicKeyBase64: keyPairs.publicKeyBase64
        });
        
        user.publicKeyBase64 = keyPairs.publicKeyBase64;
        localStorage.setItem("user", JSON.stringify(user));
      }

      console.log("Session verified and hardened. Transitioning to active dashboard loop.");
      navigate("/chat");
    } catch (err) {
      console.error("Login authorization flow interrupted:", err);
      setErrorMessage(err.response?.data?.error || "Security authentication failed mapping profile records.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Firebase Google Single-Sign-On Entry Channel Hook
   */
  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage("");
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await handleBackendVerificationSync(result.user);
    } catch (err) {
      console.error("Google authentication channel failure:", err.message);
      setErrorMessage("Google SSO auth cancelled or rejected.");
      setLoading(false);
    }
  };

  /**
   * Phone OTP Recaptcha Handler Initializer
   */
  const setupRecaptchaVerifier = () => {
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container-node", {
          size: "invisible",
          callback: (response) => {
            console.log("reCAPTCHA solved implicitly.");
          },
          "expired-callback": () => {
            console.warn("reCAPTCHA session expired.");
          }
        });
      }
    } catch (err) {
      console.error("Failed to construct RecaptchaVerifier:", err);
    }
  };

  /**
   * Trigger Phone Verification OTP dispatch
   */
  const dispatchPhoneOtpCode = async (e) => {
    e.preventDefault();
    if (!phoneNumber) return setErrorMessage("Provide your full international phone number format.");
    
    setLoading(true);
    setErrorMessage("");
    setupRecaptchaVerifier();

    const appVerifier = window.recaptchaVerifier;
    if (!appVerifier) {
      setErrorMessage("Internal Recaptcha module fails initialization.");
      setLoading(false);
      return;
    }

    // Ensure user number has international code formatting
    let formattedNumber = phoneNumber.trim();
    if (!formattedNumber.startsWith("+")) {
      console.log("Auto-prepending default country indicator reference code.");
      formattedNumber = "+1" + formattedNumber; // Fallback default or instruct format
    }

    try {
      console.log(`Attempting OTP dispatch via Firebase to: ${formattedNumber}`);
      const confirmation = await signInWithPhoneNumber(auth, formattedNumber, appVerifier);
      setConfirmationResult(confirmation);
      setIsOtpSent(true);
      console.log("OTP code successfully dispatched to handset.");
    } catch (err) {
      console.error("Firebase phone OTP delivery channel failed:", err);
      setErrorMessage(`OTP Delivery Rejected: ${err.message}. Please verify phone format includes country code (e.g. +14155552671).`);
      
      // Clear recaptcha in case of instant error to allow clean reset click
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        } catch (clearErr) {
          console.error(clearErr);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Confirm submitted verification OTP characters
   */
  const confirmHandsetOtp = async (e) => {
    e.preventDefault();
    if (!otpCode) return setErrorMessage("Input the complete 6-digit OTP sequence digits.");
    
    setLoading(true);
    setErrorMessage("");
    try {
      console.log("Challenging Firebase confirmation payload with OTP token...");
      const result = await confirmationResult.confirm(otpCode.trim());
      await handleBackendVerificationSync(result.user);
    } catch (err) {
      console.error("OTP confirmation rejected:", err);
      setErrorMessage(`Invalid OTP verification challenge code: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="login-page-layout">
      <Header />
      
      <main className="login-workspace-container">
        <div className="login-glass-card">
          <div className="login-card-header">
            <span className="login-vault-icon">🔒</span>
            <h1 className="login-title">Secure Authentication</h1>
            <p className="login-subtitle">
              Enterprise-grade end-to-end encrypted messaging gateway access
            </p>
          </div>

          {errorMessage && <div className="login-error-alert-banner">{errorMessage}</div>}

          {!isOtpSent ? (
            <form onSubmit={dispatchPhoneOtpCode} className="login-form-block">
              <div className="login-input-wrapper">
                <label className="login-input-label">Phone Identification</label>
                <input
                  type="tel"
                  className="login-text-input"
                  placeholder="+14155552671"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={loading}
                />
                <small className="login-input-hint">
                  Always provide international prefix code (e.g. +91, +1, +44)
                </small>
              </div>
              <button type="submit" className="login-primary-submit-btn" disabled={loading}>
                {loading ? "Requesting Signature Token..." : "Send Secure OTP"}
              </button>
            </form>
          ) : (
            <form onSubmit={confirmHandsetOtp} className="login-form-block">
              <div className="login-input-wrapper">
                <label className="login-input-label">Input Handy Verification Code</label>
                <input
                  type="text"
                  className="login-text-input digit-spacing"
                  placeholder="123456"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  disabled={loading}
                />
              </div>
              <button type="submit" className="login-primary-submit-btn verification-theme" disabled={loading}>
                {loading ? "Authorizing Identity Session..." : "Verify & Unlock Vault"}
              </button>
            </form>
          )}

          <div className="login-social-divider">
            <span className="divider-line"></span>
            <span className="divider-label">OR SECURE SINGLE SIGN-ON</span>
            <span className="divider-line"></span>
          </div>

          <button onClick={handleGoogleLogin} className="login-google-sso-btn" disabled={loading}>
            <span className="google-glyph">🌐</span> Continue with Google Account
          </button>

          {/* Explicit reCAPTCHA anchoring tag */}
          <div id="recaptcha-container-node"></div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default Login;
