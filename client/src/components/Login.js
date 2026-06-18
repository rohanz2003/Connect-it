import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithPopup, GoogleAuthProvider, signInWithPhoneNumber, RecaptchaVerifier } from "firebase/auth";
import { auth } from "../firebase";
import apiClient, { getOrCreateDeviceId } from "../services/apiClient";
import { generateKeyPair } from "../utils/cryptoEngine";
import "../components/Login.css";

function Login() {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  /**
   * Browser IndexedDB or state fallback storage routine for Private Cryptographic parameters
   */
  const persistPrivateKeyLocally = async (email, privateKeyCryptoKey) => {
    try {
      // In production platforms, store keys inside secure browser sandboxes like IndexedDB. 
      // For cross-platform alignment, we cache public export references.
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

      // Extract client browser platform details
      const userAgent = navigator.userAgent;
      let browser = "Unknown Browser";
      let platform = "Unknown Platform";
      if (userAgent.includes("Chrome")) browser = "Chrome";
      else if (userAgent.includes("Safari")) browser = "Safari";
      else if (userAgent.includes("Firefox")) browser = "Firefox";
      
      if (userAgent.includes("Win")) platform = "Windows";
      else if (userAgent.includes("Mac")) platform = "MacOS";
      else if (userAgent.includes("Linux")) platform = "Linux";

      // 1. Submit for verification signature and secure session token allocation
      const response = await apiClient.post("/users/verify-login", {
        firebaseToken: idToken,
        deviceId,
        platform,
        browser,
        displayName: firebaseUser.displayName,
        profilePic: firebaseUser.photoURL
      });

      const { accessToken, user } = response.data;
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("user", JSON.stringify(user));

      // 2. Continuous End-to-End Cryptographic Identity Safeguarding
      let localPrivateKeyExists = localStorage.getItem(`e2ee_priv_${user.email.toLowerCase().trim()}`);
      if (!user.publicKeyBase64 || !localPrivateKeyExists) {
        console.log("🛠️ Establishing enterprise cryptographic key pairs for E2EE layers...");
        const keyPairs = await generateKeyPair();
        
        // Cache private credential layer inside sandboxed browser storage
        await persistPrivateKeyLocally(user.email, keyPairs.privateKey);
        
        // Broadcast public tracking key directly to corporate identity layer directory
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
      setErrorMessage(err.response?.data?.error || "Security authentication failed.");
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
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-anchor-node", {
        size: "invisible",
        callback: (response) => {}
      });
    }
  };

  /**
   * Trigger Phone Verification OTP dispatch
   */
  const dispatchPhoneOtpCode = async (e) => {
    e.preventDefault();
    if (!phoneNumber) return setErrorMessage("Provide phone input format.");
    
    setLoading(true);
    setErrorMessage("");
    try {
      setupRecaptchaVerifier();
      const appVerifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      setConfirmationResult(confirmation);
      setIsOtpSent(true);
      console.log("OTP code safely dispatched to handset.");
    } catch (err) {
      console.error("OTP delivery failed:", err.message);
      setErrorMessage("Handset OTP dispatch rejected. Format: +11234567890");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Confirm submitted verification OTP characters
   */
  const confirmHandsetOtp = async (e) => {
    e.preventDefault();
    if (!otpCode) return setErrorMessage("Input OTP sequence digits.");
    
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await confirmationResult.confirm(otpCode);
      await handleBackendVerificationSync(result.user);
    } catch (err) {
      console.error("OTP confirmation rejected:", err.message);
      setErrorMessage("Invalid OTP challenge token supplied.");
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">🔒 Enterprise Secure Messaging</h1>
        <p className="login-subtitle">Military-Grade End-to-End Encrypted Platform Base</p>

        {errorMessage && <div className="login-error-toast">{errorMessage}</div>}

        {!isOtpSent ? (
          <form onSubmit={dispatchPhoneOtpCode} className="login-form">
            <label className="form-label">Phone Identity Authentication</label>
            <input
              type="tel"
              className="form-input"
              placeholder="+1234567890"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="login-btn phone-btn" disabled={loading}>
              {loading ? "Processing..." : "Send Secure OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmHandsetOtp} className="login-form">
            <label className="form-label">Input Handy Verification Token</label>
            <input
              type="text"
              className="form-input"
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="login-btn verify-btn" disabled={loading}>
              {loading ? "Verifying Token..." : "Authorize Workspace"}
            </button>
          </form>
        )}

        <div className="divider-node">OR</div>

        <button onClick={handleGoogleLogin} className="login-btn google-btn" disabled={loading}>
          {loading ? "Authorizing Security Node..." : "Continue with Google SSO"}
        </button>

        <div id="recaptcha-anchor-node"></div>
      </div>
    </div>
  );
}

export default Login;
