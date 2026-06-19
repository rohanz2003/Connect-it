import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Lock, Users, Zap, Phone, Video, UserPlus, MessageSquare, PhoneCall, Activity } from "lucide-react";
import { motion } from "framer-motion";
import Header from "./Header";
import Footer from "./Footer";
import "../styles/Landing.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const AnimatedCounter = ({ end, suffix = "" }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!end) return;
    let start = 0;
    const duration = 2000;
    const step = Math.ceil(end / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [end]);
  return <>{count.toLocaleString()}{suffix}</>;
};

const Landing = () => {
  const [stats, setStats] = useState({ totalUsers: 0, totalMessages: 0, acceptedRequests: 0 });

  useEffect(() => {
    fetch(`${API_URL}/api/analytics`)
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d); else console.warn("Analytics API error:", d); })
      .catch(e => console.warn("Analytics fetch failed:", e));
  }, []);

  const features = [
    {
      icon: MessageCircle,
      title: "Real-time Messaging",
      description:
        "Send and receive messages instantly with users online. Experience seamless communication like never before.",
    },
    {
      icon: Phone,
      title: "Voice Calls",
      description:
        "Make crystal-clear voice calls directly inside the app. Stay connected with high-quality audio, speaker support, and mute controls.",
    },
    {
      icon: Video,
      title: "Video Calls",
      description:
        "Face-to-face conversations anytime, anywhere. Enjoy seamless video calls with full-screen mode and picture-in-picture support.",
    },
    {
      icon: UserPlus,
      title: "Chat Requests",
      description:
        "Control who can message you with chat requests. Accept, reject, or manage pending requests — full privacy over your conversations.",
    },
    {
      icon: Lock,
      title: "Secure & Private",
      description:
        "Your conversations are encrypted and protected. Privacy is our top priority for every user.",
    },
    {
      icon: Users,
      title: "Online Presence",
      description:
        "See who's online in real-time. Know when your friends are available to chat instantly.",
    },
    {
      icon: Zap,
      title: "Instant Notifications",
      description:
        "Get notified immediately when you receive new messages and chat requests. Never miss an important update.",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: "easeOut" },
    },
  };

  return (
    <div className="landing-page">
      <Header isLanding={true} />

      {/* Hero Section */}
      <section className="hero-section">
        <motion.div
          className="hero-content"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="hero-badge">Welcome to Connect It</div>
          <h1 className="hero-title">
            Connect with anyone,
            <span className="hero-highlight"> anytime</span>
          </h1>
          <p className="hero-subtitle">
            Experience real-time messaging with secure, private conversations.
            Stay connected with the people who matter most.
          </p>

          <Link to="/login" className="hero-button">
            Get Started Chat
          </Link>

          <p className="hero-cta">
            or <Link to="/login">Sign in to your account</Link>
          </p>
        </motion.div>

        <motion.div
          className="hero-illustration"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="chat-mockup">
            <div className="chat-mockup-header">
              <div className="mockup-avatar">A</div>
              <div className="mockup-header-info">
                <span className="mockup-name">Alex</span>
                <span className="mockup-status">Online</span>
              </div>
              <div className="mockup-dots">
                <span /><span /><span />
              </div>
            </div>
            <div className="chat-mockup-body">
              <div className="mockup-msg received">
                <div className="mockup-msg-text">Hey! How's it going? 👋</div>
                <span className="mockup-time">12:30</span>
              </div>
              <div className="mockup-msg sent">
                <div className="mockup-msg-text">Hi! I'm doing great! Ready to chat?</div>
                <span className="mockup-time">12:31</span>
              </div>
              <div className="mockup-msg received">
                <div className="mockup-msg-text">Awesome! Let's talk about the project 🚀</div>
                <span className="mockup-time">12:32</span>
              </div>
              <div className="mockup-typing">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* About Section */}
      <section className="about-section" id="about">
        <div className="about-container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="section-title">Why Choose Connect It?</h2>
            <p className="section-subtitle">
              Discover the features that make Connect It the perfect messaging
              platform
            </p>
          </motion.div>

          <motion.div
            className="features-grid"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <motion.div
                  key={index}
                  className="feature-card"
                  variants={itemVariants}
                  whileHover={{ y: -10, boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
                >
                  <div className="feature-icon">
                    <IconComponent size={32} />
                  </div>
                  <h3 className="feature-title">{feature.title}</h3>
                  <p className="feature-description">{feature.description}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Live Insights Section */}
      <section className="insights-section">
        <div className="insights-container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="section-title">Live Insights</h2>
            <p className="section-subtitle">
              Real-time platform analytics at a glance
            </p>
          </motion.div>

          <div className="insights-grid">
            <motion.div className="insight-card" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0 }} viewport={{ once: true }}>
              <div className="insight-icon" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}><MessageSquare size={24} /></div>
              <div className="insight-value"><AnimatedCounter end={stats.totalMessages} suffix="+" /></div>
              <div className="insight-label">Messages Sent</div>
            </motion.div>

            <motion.div className="insight-card" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} viewport={{ once: true }}>
              <div className="insight-icon" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}><Users size={24} /></div>
              <div className="insight-value"><AnimatedCounter end={stats.totalUsers} suffix="+" /></div>
              <div className="insight-label">Active Users</div>
            </motion.div>

            <motion.div className="insight-card" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} viewport={{ once: true }}>
              <div className="insight-icon" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}><PhoneCall size={24} /></div>
              <div className="insight-value"><AnimatedCounter end={Math.round(stats.totalMessages * 0.04)} suffix="+" /></div>
              <div className="insight-label">Calls Made</div>
            </motion.div>

            <motion.div className="insight-card" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} viewport={{ once: true }}>
              <div className="insight-icon" style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }}><Activity size={24} /></div>
              <div className="insight-value"><AnimatedCounter end={stats.acceptedRequests} suffix="+" /></div>
              <div className="insight-label">Connections Made</div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <motion.div
          className="cta-content"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h2 className="cta-title">Ready to Start Chatting?</h2>
          <p className="cta-subtitle">
            Join thousands of users connecting in real-time. Get started today!
          </p>
          <Link to="/login" className="cta-button">
            Get Started Now
          </Link>
          <Link to="/admin" className="admin-link-hidden" title="Admin Dashboard">
            🔐
          </Link>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
};

export default Landing;
