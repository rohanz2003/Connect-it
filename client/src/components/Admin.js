import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  LogOut, Mail, ShieldCheck, ArrowLeft, Users, Star, TrendingUp, Send,
  Loader2, Trash2, Search, Radio, Activity, Download, UserCheck, MessageSquare, X, ChevronRight
} from "lucide-react";
import "../styles/Admin.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

function AdminDashboard() {
  const [authStep, setAuthStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [adminToken, setAdminToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [users, setUsers] = useState([]);
  const [messageStats, setMessageStats] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null);

  // New feature states
  const [health, setHealth] = useState(null);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");

  const navigate = useNavigate();
  const otpRefs = useRef([]);

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
      const [statsRes, feedbackRes, usersRes, messageStatsRes, healthRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/stats`, { headers }),
        fetch(`${API_URL}/api/admin/feedback`, { headers }),
        fetch(`${API_URL}/api/admin/users`, { headers }),
        fetch(`${API_URL}/api/admin/message-stats`, { headers }),
        fetch(`${API_URL}/api/admin/health`, { headers }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (feedbackRes.ok) setFeedback(await feedbackRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (messageStatsRes.ok) setMessageStats(await messageStatsRes.json());
      if (healthRes.ok) setHealth(await healthRes.json());
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

  useEffect(() => {
    const storedToken = localStorage.getItem("adminToken");
    if (storedToken) verifyExistingToken(storedToken);
  }, [verifyExistingToken]);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    if (!email.trim()) { setError("Please enter your admin email"); setLoading(false); return; }
    try {
      const response = await fetch(`${API_URL}/api/admin/send-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSuccess("Verification code sent! Check your email.");
        setAuthStep("otp"); setResendTimer(60);
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      } else { setError(data.message || "Failed to send verification code."); }
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  };

  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 6);
      const newOtp = [...otp];
      digits.split("").forEach((d, i) => { if (index + i < 6) newOtp[index + i] = d; });
      setOtp(newOtp);
      otpRefs.current[Math.min(index + digits.length, 5)]?.focus();
      return;
    }
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp]; newOtp[index] = value; setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    const otpCode = otp.join("");
    if (otpCode.length !== 6) { setError("Please enter the complete 6-digit code"); setLoading(false); return; }
    try {
      const response = await fetch(`${API_URL}/api/admin/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: otpCode }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setAdminToken(data.token);
        localStorage.setItem("adminToken", data.token);
        setAuthStep("dashboard"); setSuccess("");
        await fetchDashboardData(data.token);
      } else { setError(data.message || "Invalid or expired code."); }
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setError(""); setSuccess(""); setLoading(true); setOtp(["", "", "", "", "", ""]);
    try {
      const response = await fetch(`${API_URL}/api/admin/send-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (response.ok && data.success) { setSuccess("New code sent!"); setResendTimer(60); otpRefs.current[0]?.focus(); }
      else { setError(data.message || "Failed to resend code."); }
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (authStep !== "dashboard" || !adminToken) return;
    const id = setInterval(() => fetchDashboardData(adminToken), 15000);
    return () => clearInterval(id);
  }, [authStep, adminToken, fetchDashboardData]);

  const handleLogout = () => {
    setAuthStep("email"); setAdminToken(""); setEmail(""); setOtp(["", "", "", "", "", ""]);
    setError(""); setSuccess(""); setStats(null); setFeedback([]); setUsers([]); setHealth(null);
    localStorage.removeItem("adminToken"); navigate("/admin");
  };

  // === Feature: Delete User ===
  const handleDeleteUser = async (userEmail) => {
    if (!window.confirm(`Delete ${userEmail}? This removes all data + Firebase account permanently.`)) return;
    setDeletingUser(userEmail);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(userEmail)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(`User ${userEmail} deleted`);
        setUsers((prev) => prev.filter((u) => u.email !== userEmail));
      } else { setError(data.error || "Failed to delete user"); }
    } catch { setError("Network error. Failed to delete user."); }
    finally { setDeletingUser(null); }
  };

  // === Feature: User Detail ===
  const handleViewUser = async (userEmail) => {
    setSelectedUser(userEmail);
    setUserDetailLoading(true);
    setUserDetail(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(userEmail)}/detail`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) setUserDetail(await res.json());
    } catch {} finally { setUserDetailLoading(false); }
  };

  // === Feature: Broadcast ===
  const [broadcastResult, setBroadcastResult] = useState(null);
  const handleBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMsg.trim()) { setError("Enter title and message"); return; }
    if (!window.confirm("Send broadcast to ALL users?")) return;
    setBroadcastSending(true); setBroadcastResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/broadcast`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: broadcastTitle, message: broadcastMsg }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBroadcastResult(data.details);
        setSuccess("Broadcast sent!");
        setBroadcastTitle(""); setBroadcastMsg("");
      } else { setError(data.error || "Failed to send broadcast"); }
    } catch { setError("Network error."); }
    finally { setBroadcastSending(false); }
  };

  // === Feature: Reply to Feedback ===
  const handleReplyFeedback = async (feedbackId) => {
    if (!replyText.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/feedback/${feedbackId}/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reply: replyText }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback((prev) => prev.map((f) => f._id === feedbackId ? { ...f, reply: replyText, repliedAt: new Date().toISOString() } : f));
        setReplyingTo(null); setReplyText(""); setSuccess("Reply sent!");
      }
    } catch { setError("Failed to send reply"); }
  };

  // === Feature: Export CSV ===
  const exportCSV = (data, filename) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(",")];
    data.forEach((row) => {
      csv.push(headers.map((h) => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered users
  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  // === LOGIN STEPS ===
  if (authStep === "email") {
    return (
      <div className="admin-login-container">
        <div className="admin-login-wrapper">
          <div className="admin-login-header">
            <div className="admin-logo"><Mail size={48} /></div>
            <h1>Admin Dashboard</h1>
            <p>Enter your admin email to receive a verification code</p>
          </div>
          <form onSubmit={handleSendOtp} className="admin-login-form">
            <div className="form-group">
              <label htmlFor="admin-email">Admin Email Address</label>
              <div className="email-input-group">
                <Mail size={18} className="input-icon" />
                <input type="email" id="admin-email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="your-admin@gmail.com" className="form-input form-input-with-icon" disabled={loading} autoFocus />
              </div>
            </div>
            {error && <div className="error-message">❌ {error}</div>}
            {success && <div className="success-message">✅ {success}</div>}
            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? <><Loader2 size={18} className="spinner" /> Sending Code...</> : <><Send size={18} /> Send Verification Code</>}
            </button>
            <div className="admin-login-footer"><Link to="/">← Back to Home</Link></div>
          </form>
        </div>
      </div>
    );
  }

  if (authStep === "otp") {
    return (
      <div className="admin-login-container">
        <div className="admin-login-wrapper">
          <div className="admin-login-header">
            <div className="admin-logo"><ShieldCheck size={48} /></div>
            <h1>Verify Your Identity</h1>
            <p>We sent a 6-digit code to <strong>{email}</strong></p>
          </div>
          <form onSubmit={handleVerifyOtp} className="admin-login-form">
            <div className="form-group">
              <label>Enter Verification Code</label>
              <div className="otp-input-group">
                {otp.map((digit, index) => (
                  <input key={index} ref={(el) => (otpRefs.current[index] = el)} type="text" inputMode="numeric"
                    maxLength={index === 0 ? 6 : 1} value={digit} onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)} className="otp-input" disabled={loading} autoFocus={index === 0} />
                ))}
              </div>
            </div>
            {error && <div className="error-message">❌ {error}</div>}
            {success && <div className="success-message">✅ {success}</div>}
            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? <><Loader2 size={18} className="spinner" /> Verifying...</> : <><ShieldCheck size={18} /> Verify & Login</>}
            </button>
            <div className="otp-actions">
              <button type="button" className="resend-btn" onClick={handleResendOtp} disabled={resendTimer > 0 || loading}>
                {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Resend Code"}
              </button>
              <button type="button" className="back-btn" onClick={() => { setAuthStep("email"); setOtp(["", "", "", "", "", ""]); setError(""); setSuccess(""); }}>
                <ArrowLeft size={14} /> Change Email
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // === DASHBOARD ===
  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-header-content">
          <div className="admin-title"><h1>📊 Admin Dashboard</h1><p>Manage Chat System</p></div>
          <button onClick={handleLogout} className="logout-btn"><LogOut size={20} /> Logout</button>
        </div>
      </header>

      <nav className="admin-tabs">
        <button className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}><TrendingUp size={18} /> Dashboard</button>
        <button className={`tab-btn ${activeTab === "feedback" ? "active" : ""}`} onClick={() => setActiveTab("feedback")}><Star size={18} /> Feedback</button>
        <button className={`tab-btn ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")}><Users size={18} /> Users</button>
        <button className={`tab-btn ${activeTab === "broadcast" ? "active" : ""}`} onClick={() => setActiveTab("broadcast")}><Radio size={18} /> Broadcast</button>
      </nav>

      <div className="admin-content">
        {/* DASHBOARD TAB */}
        {activeTab === "dashboard" && (
          <div className="tab-content dashboard-tab">
            <h2>Dashboard Overview</h2>
            {stats && (
              <div className="stats-grid">
                <div className="stat-card"><div className="stat-icon messages-icon"><MessageSquare size={32} /></div><div className="stat-info"><p className="stat-label">Total Messages</p><p className="stat-value">{stats.totalMessages}</p></div></div>
                <div className="stat-card"><div className="stat-icon feedback-icon"><Star size={32} /></div><div className="stat-info"><p className="stat-label">Total Feedback</p><p className="stat-value">{stats.totalFeedback}</p></div></div>
                <div className="stat-card"><div className="stat-icon users-icon"><Users size={32} /></div><div className="stat-info"><p className="stat-label">Total Users</p><p className="stat-value">{stats.totalUsers}</p></div></div>
                <div className="stat-card"><div className="stat-icon rating-icon"><Star size={32} /></div><div className="stat-info"><p className="stat-label">Average Rating</p><p className="stat-value">{stats.averageRating} ⭐</p></div></div>
              </div>
            )}

            {health && (
              <>
                {/* Online Now */}
                <div className="online-section">
                  <h3>🟢 Online Now</h3>
                  <div className="online-grid">
                    <div className="online-stat big">{health.online.usersOnline}</div>
                    <div className="online-stat-label">Users Online</div>
                    <div className="online-stat big">{health.online.devicesOnline}</div>
                    <div className="online-stat-label">Devices Active</div>
                  </div>
                  {health.online.onlineUserEmails.length > 0 && (
                    <div className="online-users-list">
                      {health.online.onlineUserEmails.map((e, i) => <span key={i} className="online-badge">{e}</span>)}
                    </div>
                  )}
                </div>

                {/* System Health */}
                <div className="health-section">
                  <h3><Activity size={20} /> System Health</h3>
                  <div className="health-grid">
                    <div className="health-item"><span className="health-label">Server Uptime</span><span className="health-value">{health.server.uptimeFormatted}</span></div>
                    <div className="health-item"><span className="health-label">Memory Heap</span><span className="health-value">{health.server.memory.heapUsed} / {health.server.memory.heapTotal} MB</span></div>
                    <div className="health-item"><span className="health-label">Memory RSS</span><span className="health-value">{health.server.memory.rss} MB</span></div>
                    <div className="health-item"><span className="health-label">Node.js</span><span className="health-value">{health.server.nodeVersion}</span></div>
                    <div className="health-item"><span className="health-label">Environment</span><span className="health-value">{health.server.environment}</span></div>
                    <div className="health-item"><span className="health-label">Database</span><span className={`health-value ${health.database.connected ? "health-ok" : "health-bad"}`}>{health.database.status}</span></div>
                    <div className="health-item"><span className="health-label">Firebase</span><span className={`health-value ${health.services.firebase ? "health-ok" : "health-warn"}`}>{health.services.firebase ? "Configured" : "Off"}</span></div>
                    <div className="health-item"><span className="health-label">Email Service</span><span className={`health-value ${health.services.email ? "health-ok" : "health-bad"}`}>{health.services.email ? "Resend" : "Off"}</span></div>
                  </div>
                </div>

                {/* Activity Stats */}
                <div className="health-section">
                  <h3>📈 Activity</h3>
                  <div className="health-grid">
                    <div className="health-item"><span className="health-label">Active (1h)</span><span className="health-value">{health.stats.activeLastHour} users</span></div>
                    <div className="health-item"><span className="health-label">Active (24h)</span><span className="health-value">{health.stats.activeLastDay} users</span></div>
                    <div className="health-item"><span className="health-label">Messages (1h)</span><span className="health-value">{health.stats.messagesLastHour}</span></div>
                    <div className="health-item"><span className="health-label">Messages (24h)</span><span className="health-value">{health.stats.messagesLastDay}</span></div>
                    <div className="health-item"><span className="health-label">Messages (7d)</span><span className="health-value">{health.stats.messagesLastWeek}</span></div>
                    <div className="health-item"><span className="health-label">Pending Requests</span><span className="health-value">{health.stats.pendingRequests}</span></div>
                    <div className="health-item"><span className="health-label">Accepted Requests</span><span className="health-value">{health.stats.acceptedRequests}</span></div>
                    <div className="health-item"><span className="health-label">Avg Rating</span><span className="health-value">{health.stats.avgRating} ⭐ ({health.stats.totalRatings} ratings)</span></div>
                    <div className="health-item"><span className="health-label">Replied Feedback</span><span className="health-value">{health.stats.repliedFeedback}</span></div>
                    <div className="health-item"><span className="health-label">Unreplied Feedback</span><span className={`health-value ${health.stats.unrepliedFeedback > 0 ? "health-warn" : "health-ok"}`}>{health.stats.unrepliedFeedback}</span></div>
                  </div>
                </div>

                {/* Platforms */}
                {health.platforms && (
                  <div className="health-section">
                    <h3>💻 Platforms</h3>
                    <div className="platform-row">
                      <div className="platform-col">
                        <h4>Devices</h4>
                        {health.platforms.deviceTypes.map((d, i) => <div key={i} className="platform-item"><span>{d._id || "Unknown"}</span><span className="platform-count">{d.count}</span></div>)}
                      </div>
                      <div className="platform-col">
                        <h4>Browsers</h4>
                        {health.platforms.browsers.map((d, i) => <div key={i} className="platform-item"><span>{d._id || "Unknown"}</span><span className="platform-count">{d.count}</span></div>)}
                      </div>
                      <div className="platform-col">
                        <h4>Operating Systems</h4>
                        {health.platforms.operatingSystems.map((d, i) => <div key={i} className="platform-item"><span>{d._id || "Unknown"}</span><span className="platform-count">{d.count}</span></div>)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Message Trends */}
                {health.trends && health.trends.messageTrends.length > 0 && (
                  <div className="health-section">
                    <h3>📊 Messages (Last 7 Days)</h3>
                    <div className="trend-chart">
                      {health.trends.messageTrends.map((d, i) => {
                        const max = Math.max(...health.trends.messageTrends.map(x => x.count));
                        const pct = max > 0 ? (d.count / max) * 100 : 0;
                        return (
                          <div key={i} className="trend-bar-wrapper">
                            <div className="trend-bar" style={{ height: `${pct}%` }} title={`${d.count} messages`}></div>
                            <span className="trend-label">{d._id.slice(5)}</span>
                            <span className="trend-count">{d.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

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

        {/* FEEDBACK TAB */}
        {activeTab === "feedback" && (
          <div className="tab-content feedback-tab">
            <div className="tab-header-row">
              <h2>User Feedback ({feedback.length})</h2>
              <button className="export-btn" onClick={() => exportCSV(feedback.map(f => ({ name: f.name, email: f.email, message: f.message, rating: f.rating, date: f.createdAt, reply: f.reply || "" })), "feedback.csv")}><Download size={16} /> Export CSV</button>
            </div>
            {dataLoading ? <p className="loading-text">Loading feedback...</p> : feedback.length > 0 ? (
              <div className="feedback-grid">
                {feedback.map((item) => (
                  <div key={item._id} className="feedback-card">
                    <div className="feedback-header">
                      <div className="feedback-name-row">
                        <h4>{item.name}</h4>
                        <span className={`feedback-type-badge type-${item.type || "suggestion"}`}>
                          {item.type === "suggestion" ? "💡" : item.type === "bug" ? "🐛" : item.type === "compliment" ? "❤️" : "💬"} {item.type || "suggestion"}
                        </span>
                      </div>
                      <div className="feedback-rating">{"⭐".repeat(item.rating)}</div>
                    </div>
                    <p className="feedback-email">{item.email}</p>
                    <p className="feedback-message">{item.message}</p>
                    <p className="feedback-date">{new Date(item.createdAt).toLocaleString()}</p>
                    {item.reply && (
                      <div className="feedback-reply-box">
                        <p className="reply-label">📤 Admin Reply:</p>
                        <p className="reply-text">{item.reply}</p>
                      </div>
                    )}
                    {replyingTo === item._id ? (
                      <div className="reply-input-row">
                        <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type your reply..." className="reply-input"
                          onKeyDown={(e) => { if (e.key === "Enter") handleReplyFeedback(item._id); }} autoFocus />
                        <button className="reply-send-btn" onClick={() => handleReplyFeedback(item._id)}><Send size={16} /></button>
                        <button className="reply-cancel-btn" onClick={() => { setReplyingTo(null); setReplyText(""); }}><X size={16} /></button>
                      </div>
                    ) : (
                      <button className="reply-btn" onClick={() => { setReplyingTo(item._id); setReplyText(""); }}>
                        <Send size={14} /> Reply
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="no-data">No feedback found</p>}
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === "users" && (
          <div className="tab-content users-tab">
            <div className="tab-header-row">
              <h2>Registered Users ({filteredUsers.length})</h2>
              <div className="tab-actions">
                <div className="search-box">
                  <Search size={16} /> <input type="text" placeholder="Search by email..." value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)} className="search-input" />
                </div>
                <button className="export-btn" onClick={() => exportCSV(users.map(u => ({ email: u.email, displayName: u.displayName || "", lastSeen: u.lastSeen || "" })), "users.csv")}><Download size={16} /> Export CSV</button>
              </div>
            </div>
            {error && <div className="error-message">❌ {error}</div>}
            {success && <div className="success-message">✅ {success}</div>}
            {dataLoading ? <p className="loading-text">Loading users...</p> : filteredUsers.length > 0 ? (
              <div className="users-grid">
                {filteredUsers.map((user, index) => (
                  <div key={index} className="user-card">
                    <div className="user-avatar">
                      {user.avatarUrl ? <img src={user.avatarUrl} alt={user.email} /> : <div className="avatar-placeholder">{user.email.charAt(0).toUpperCase()}</div>}
                    </div>
                    <h4 className="user-email">{user.email}</h4>
                    <p className="user-last-seen">Last seen: {user.lastSeen ? new Date(user.lastSeen).toLocaleString() : "Never"}</p>
                    <div className="user-card-actions">
                      <button className="view-user-btn" onClick={() => handleViewUser(user.email)}><ChevronRight size={16} /> View</button>
                      <button className="delete-user-btn" onClick={() => handleDeleteUser(user.email)} disabled={deletingUser === user.email}>
                        {deletingUser === user.email ? <Loader2 size={16} className="spinner" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="no-data">{userSearch ? "No users match your search" : "No users found"}</p>}

            {/* User Detail Modal */}
            {selectedUser && (
              <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3><UserCheck size={20} /> User Detail</h3>
                    <button className="modal-close" onClick={() => setSelectedUser(null)}><X size={20} /></button>
                  </div>
                  {userDetailLoading ? <p className="loading-text">Loading...</p> : userDetail ? (
                    <div className="user-detail">
                      <div className="detail-header">
                        {userDetail.user.avatarUrl ? <img src={userDetail.user.avatarUrl} alt="" className="detail-avatar" /> : <div className="avatar-placeholder large">{userDetail.user.email.charAt(0).toUpperCase()}</div>}
                        <div><h4>{userDetail.user.email}</h4><p>{userDetail.user.displayName || "No display name"}</p><p className="detail-bio">{userDetail.user.bio || "No bio"}</p></div>
                      </div>
                      <div className="detail-stats">
                        <div className="detail-stat"><span>{userDetail.activity.messageCount}</span><p>Messages</p></div>
                        <div className="detail-stat"><span>{userDetail.activity.feedbackCount}</span><p>Feedback</p></div>
                        <div className="detail-stat"><span>{userDetail.activity.chatRequests}</span><p>Chat Requests</p></div>
                        <div className="detail-stat"><span>{userDetail.activity.deviceCount}</span><p>Devices</p></div>
                      </div>
                      <p className="detail-last-seen">Last seen: {userDetail.user.lastSeen ? new Date(userDetail.user.lastSeen).toLocaleString() : "Never"}</p>
                    </div>
                  ) : <p className="no-data">Failed to load user detail</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BROADCAST TAB */}
        {activeTab === "broadcast" && (
          <div className="tab-content broadcast-tab">
            <h2><Radio size={20} /> Broadcast Message</h2>
            <p className="broadcast-desc">Send a notification to all registered users (push + email + live socket)</p>
            <div className="broadcast-form">
              <div className="form-group">
                <label>Title</label>
                <input type="text" value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="e.g. New feature update" className="form-input" />
              </div>
              <div className="form-group">
                <label>Message</label>
                <textarea value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="Write your announcement..." className="form-input broadcast-textarea" rows={5} />
              </div>
              {error && <div className="error-message">❌ {error}</div>}
              {success && <div className="success-message">✅ {success}</div>}
              {broadcastResult && (
                <div className="broadcast-results">
                  <h4>📤 Delivery Results</h4>
                  <div className="health-grid">
                    <div className="health-item"><span className="health-label">Push Sent</span><span className="health-value health-ok">{broadcastResult.push.sent}</span></div>
                    <div className="health-item"><span className="health-label">Push Failed</span><span className={`health-value ${broadcastResult.push.failed > 0 ? "health-bad" : "health-ok"}`}>{broadcastResult.push.failed}</span></div>
                    <div className="health-item"><span className="health-label">Push Total</span><span className="health-value">{broadcastResult.push.total}</span></div>
                    <div className="health-item"><span className="health-label">Emails Sent</span><span className="health-value health-ok">{broadcastResult.email.sent}</span></div>
                    <div className="health-item"><span className="health-label">Email Failed</span><span className={`health-value ${broadcastResult.email.failed > 0 ? "health-bad" : "health-ok"}`}>{broadcastResult.email.failed}</span></div>
                    <div className="health-item"><span className="health-label">Socket Connected</span><span className="health-value">{broadcastResult.socket.connected}</span></div>
                  </div>
                </div>
              )}
              <button className="admin-login-btn" onClick={handleBroadcast} disabled={broadcastSending}>
                {broadcastSending ? <><Loader2 size={18} className="spinner" /> Sending...</> : <><Radio size={18} /> Broadcast to All Users</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
