import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogOut, Mail, ShieldCheck, ArrowLeft, MessageSquare, MessageCircle, Users, Star, TrendingUp, Send, Loader2 } from "lucide-react";
import Avatar from "./Avatar";
import "../styles/Admin.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

function AdminDashboard() {
  // Auth states
  const [authStep, setAuthStep] = useState("email"); // "email" | "otp" | "dashboard"
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [adminToken, setAdminToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Dashboard states
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [messages, setMessages] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [users, setUsers] = useState([]);
  const [messageStats, setMessageStats] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  const navigate = useNavigate();
  const otpRefs = useRef([]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const fetchDashboardData = useCallback(async (token) => {
    setDataLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, messagesRes, feedbackRes, usersRes, messageStatsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/stats`, { headers }),
        fetch(`${API_URL}/api/admin/messages`, { headers }),
        fetch(`${API_URL}/api/admin/feedback`, { headers }),
        fetch(`${API_URL}/api/admin/users`, { headers }),
        fetch(`${API_URL}/api/admin/message-stats`, { headers }),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (messagesRes.ok) setMessages(await messagesRes.json());
      if (feedbackRes.ok) setFeedback(await feedbackRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (messageStatsRes.ok) setMessageStats(await messageStatsRes.json());
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to load dashboard data");
    } finally {
      setDataLoading(false);
    }
  }, [API_URL]);

  const verifyExistingToken = useCallback(async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setAdminToken(token);
        setAuthStep("dashboard");
        fetchDashboardData(token);
      } else {
        localStorage.removeItem("adminToken");
      }
    } catch {
      localStorage.removeItem("adminToken");
    }
  }, [API_URL, fetchDashboardData]);

  // Check for existing valid session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem("adminToken");
    if (storedToken) {
      verifyExistingToken(storedToken);
    }
  }, [verifyExistingToken]);

  // STEP 1: Send OTP to email
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!email.trim()) {
      setError("Please enter your admin email");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/admin/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess("Verification code sent! Check your email inbox.");
        setAuthStep("otp");
        setResendTimer(60);
        // Focus first OTP input
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      } else {
        setError(data.message || "Failed to send verification code. Check your email address.");
      }
    } catch (err) {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP input
  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, "").slice(0, 6);
      const newOtp = [...otp];
      digits.split("").forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      otpRefs.current[nextIndex]?.focus();
      return;
    }

    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // STEP 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const otpCode = otp.join("");
    if (otpCode.length !== 6) {
      setError("Please enter the complete 6-digit code");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/admin/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: otpCode }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setAdminToken(data.token);
        localStorage.setItem("adminToken", data.token);
        setAuthStep("dashboard");
        setSuccess("");
        await fetchDashboardData(data.token);
      } else {
        setError(data.message || "Invalid or expired code. Please try again.");
      }
    } catch (err) {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setError("");
    setSuccess("");
    setLoading(true);
    setOtp(["", "", "", "", "", ""]);

    try {
      const response = await fetch(`${API_URL}/api/admin/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setSuccess("New code sent! Check your email.");
        setResendTimer(60);
        otpRefs.current[0]?.focus();
      } else {
        setError(data.message || "Failed to resend code.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  // Poll dashboard data while logged in so new feedback/messages appear automatically
  useEffect(() => {
    if (authStep !== "dashboard" || !adminToken) return;
    const id = setInterval(() => fetchDashboardData(adminToken), 15000);
    return () => clearInterval(id);
  }, [authStep, adminToken, fetchDashboardData]);

  const handleLogout = () => {
    setAuthStep("email");
    setAdminToken("");
    setEmail("");
    setOtp(["", "", "", "", "", ""]);
    setError("");
    setSuccess("");
    setStats(null);
    setMessages([]);
    setFeedback([]);
    setUsers([]);
    localStorage.removeItem("adminToken");
    navigate("/admin");
  };

  // =====================
  // STEP 1: EMAIL INPUT
  // =====================
  if (authStep === "email") {
    return (
      <div className="admin-login-container">
        <div className="admin-login-wrapper">
          <div className="admin-login-header">
            <div className="admin-logo">
              <Mail size={48} />
            </div>
            <h1>Admin Dashboard</h1>
            <p>Enter your admin email to receive a verification code</p>
          </div>

          <form onSubmit={handleSendOtp} className="admin-login-form">
            <div className="form-group">
              <label htmlFor="admin-email">Admin Email Address</label>
              <div className="email-input-group">
                <Mail size={18} className="input-icon" />
                <input
                  type="email"
                  id="admin-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your-admin@gmail.com"
                  className="form-input form-input-with-icon"
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            {error && <div className="error-message">❌ {error}</div>}
            {success && <div className="success-message">✅ {success}</div>}

            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  Sending Code...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Send Verification Code
                </>
              )}
            </button>

            <div className="admin-login-footer">
              <Link to="/">← Back to Home</Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // =====================
  // STEP 2: OTP VERIFY
  // =====================
  if (authStep === "otp") {
    return (
      <div className="admin-login-container">
        <div className="admin-login-wrapper">
          <div className="admin-login-header">
            <div className="admin-logo">
              <ShieldCheck size={48} />
            </div>
            <h1>Verify Your Identity</h1>
            <p>We sent a 6-digit code to <strong>{email}</strong></p>
          </div>

          <form onSubmit={handleVerifyOtp} className="admin-login-form">
            <div className="form-group">
              <label>Enter Verification Code</label>
              <div className="otp-input-group">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (otpRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={index === 0 ? 6 : 1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="otp-input"
                    disabled={loading}
                    autoFocus={index === 0}
                  />
                ))}
              </div>
            </div>

            {error && <div className="error-message">❌ {error}</div>}
            {success && <div className="success-message">✅ {success}</div>}

            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  Verify & Login
                </>
              )}
            </button>

            <div className="otp-actions">
              <button
                type="button"
                className="resend-btn"
                onClick={handleResendOtp}
                disabled={resendTimer > 0 || loading}
              >
                {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Resend Code"}
              </button>

              <button
                type="button"
                className="back-btn"
                onClick={() => {
                  setAuthStep("email");
                  setOtp(["", "", "", "", "", ""]);
                  setError("");
                  setSuccess("");
                }}
              >
                <ArrowLeft size={14} />
                Change Email
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // =====================
  // DASHBOARD VIEW
  // =====================
  return (
    <div className="admin-dashboard">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-content">
          <div className="admin-title">
            <h1>📊 Admin Dashboard</h1>
            <p>Manage Chat System Data</p>
          </div>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          <TrendingUp size={18} /> Dashboard
        </button>
        <button
          className={`tab-btn ${activeTab === "messages" ? "active" : ""}`}
          onClick={() => setActiveTab("messages")}
        >
          <MessageCircle size={18} /> Messages
        </button>
        <button
          className={`tab-btn ${activeTab === "feedback" ? "active" : ""}`}
          onClick={() => setActiveTab("feedback")}
        >
          <Star size={18} /> Feedback
        </button>
        <button
          className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <Users size={18} /> Users
        </button>
      </nav>

      <div className="admin-content">
        {/* DASHBOARD TAB */}
        {activeTab === "dashboard" && (
          <div className="tab-content dashboard-tab">
            <h2>Dashboard Overview</h2>

            {stats && (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon messages-icon">
                    <MessageSquare size={32} />
                  </div>
                  <div className="stat-info">
                    <p className="stat-label">Total Messages</p>
                    <p className="stat-value">{stats.totalMessages}</p>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon feedback-icon">
                    <Star size={32} />
                  </div>
                  <div className="stat-info">
                    <p className="stat-label">Total Feedback</p>
                    <p className="stat-value">{stats.totalFeedback}</p>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon users-icon">
                    <Users size={32} />
                  </div>
                  <div className="stat-info">
                    <p className="stat-label">Total Users</p>
                    <p className="stat-value">{stats.totalUsers}</p>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon rating-icon">
                    <Star size={32} />
                  </div>
                  <div className="stat-info">
                    <p className="stat-label">Average Rating</p>
                    <p className="stat-value">{stats.averageRating} ⭐</p>
                  </div>
                </div>
              </div>
            )}

            {/* Top Message Senders */}
            {messageStats.length > 0 && (
              <div className="message-stats-section">
                <h3>Top Message Senders</h3>
                <div className="message-stats-list">
                  {messageStats.map((stat, index) => (
                    <div key={index} className="message-stat-item">
                      <span className="stat-rank">#{index + 1}</span>
                      <span className="stat-sender">{stat._id}</span>
                      <span className="stat-count">{stat.messageCount} messages</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MESSAGES TAB */}
        {activeTab === "messages" && (
          <div className="tab-content messages-tab">
            <h2>All Messages ({messages.length})</h2>
            {dataLoading ? (
              <p className="loading-text">Loading messages...</p>
            ) : messages.length > 0 ? (
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>Message</th>
                      <th>Type</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.slice(0, 100).map((msg, index) => (
                      <tr key={index}>
                        <td className="sender-email">{msg.sender}</td>
                        <td className="receiver-email">{msg.receiver}</td>
                        <td className="message-text">
                          {typeof msg.text === "string"
                            ? msg.text.substring(0, 50) + (msg.text.length > 50 ? "..." : "")
                            : "[Media]"}
                        </td>
                        <td className="message-type">{msg.type || "text"}</td>
                        <td className="message-time">
                          {new Date(msg.timestamp || msg.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="no-data">No messages found</p>
            )}
          </div>
        )}

        {/* FEEDBACK TAB */}
        {activeTab === "feedback" && (
          <div className="tab-content feedback-tab">
            <h2>User Feedback ({feedback.length})</h2>
            {dataLoading ? (
              <p className="loading-text">Loading feedback...</p>
            ) : feedback.length > 0 ? (
              <div className="feedback-grid">
                {feedback.map((item, index) => (
                  <div key={index} className="feedback-card">
                    <div className="feedback-header">
                      <h4>{item.name}</h4>
                      <div className="feedback-rating">
                        {"⭐".repeat(item.rating)}
                      </div>
                    </div>
                    <p className="feedback-email">{item.email}</p>
                    <p className="feedback-message">{item.message}</p>
                    <p className="feedback-date">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">No feedback found</p>
            )}
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === "users" && (
          <div className="tab-content users-tab">
            <h2>Registered Users ({users.length})</h2>
            {dataLoading ? (
              <p className="loading-text">Loading users...</p>
            ) : users.length > 0 ? (
              <div className="users-grid">
                {users.map((user, index) => (
                  <div key={index} className="user-card">
                    <div className="user-avatar-container">
                      <Avatar 
                        email={user.email}
                        name={user.displayName}
                        src={user.profilePic}
                        size="lg"
                      />
                    </div>
                    <h4 className="user-email">{user.email}</h4>
                    <p className="user-last-seen">
                      Last seen: {user.lastSeen ? new Date(user.lastSeen).toLocaleString() : "Never"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">No users found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
