import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  auth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "../firebase";
import { Phone, ArrowLeft, Loader2, Shield } from "lucide-react";

const PhoneAuth = ({ onBack }) => {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("phone");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const navigate = useNavigate();
  const recaptchaRef = useRef(null);

  useEffect(() => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
        callback: () => {},
        "expired-callback": () => {},
      });
    }
    return () => {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {}
        window.recaptchaVerifier = null;
      }
    };
  }, []);

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 0) return "";
    if (digits.startsWith("+")) return "+" + digits.slice(1);
    if (!digits.startsWith("1") && digits.length <= 10) {
      return "+1" + digits;
    }
    return "+" + digits;
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const formattedPhone = formatPhone(phone);
      if (formattedPhone.length < 10) {
        throw new Error("Please enter a valid phone number with country code");
      }
      const recaptchaVerifier = window.recaptchaVerifier;
      if (!recaptchaVerifier) {
        throw new Error("reCAPTCHA not initialized. Please refresh.");
      }
      const result = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        recaptchaVerifier
      );
      setConfirmationResult(result);
      setStep("otp");
    } catch (err) {
      const msg =
        err.code === "auth/too-many-requests"
          ? "Too many requests. Please try again later."
          : err.code === "auth/invalid-phone-number"
          ? "Invalid phone number format."
          : err.message || "Failed to send OTP";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!confirmationResult) {
        throw new Error("No OTP request found. Please go back and try again.");
      }
      const userCredential = await confirmationResult.confirm(otp);
      if (userCredential.user) {
        navigate("/chat");
      }
    } catch (err) {
      const msg =
        err.code === "auth/invalid-verification-code"
          ? "Invalid OTP code. Please try again."
          : err.message || "OTP verification failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = () => {
    setStep("phone");
    setOtp("");
    setError("");
  };

  return (
    <div className="phone-auth-container">
      <button
        type="button"
        className="phone-auth-back"
        onClick={step === "phone" ? onBack : () => setStep("phone")}
      >
        <ArrowLeft size={18} />
      </button>

      <div className="phone-auth-icon">
        <Shield size={32} />
      </div>

      {step === "phone" ? (
        <>
          <h3>Phone Authentication</h3>
          <p className="phone-auth-subtitle">
            Enter your phone number to receive a verification code
          </p>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={handleSendOTP}>
            <div className="login-input-group">
              <Phone size={18} className="login-input-icon" />
              <input
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading || phone.length < 5}
            >
              {loading ? (
                <Loader2 size={18} className="phone-auth-spinner" />
              ) : (
                "Send OTP"
              )}
            </button>
          </form>
        </>
      ) : (
        <>
          <h3>Verify OTP</h3>
          <p className="phone-auth-subtitle">
            Enter the verification code sent to your phone
          </p>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={handleVerifyOTP}>
            <div className="login-input-group">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Enter 6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                disabled={loading}
                maxLength={6}
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading || otp.length < 6}
            >
              {loading ? (
                <Loader2 size={18} className="phone-auth-spinner" />
              ) : (
                "Verify & Sign In"
              )}
            </button>
          </form>

          <p className="phone-auth-resend">
            Didn't receive the code?{" "}
            <span onClick={handleResendOTP}>Resend</span>
          </p>
        </>
      )}

      <div id="recaptcha-container"></div>
    </div>
  );
};

export default PhoneAuth;
