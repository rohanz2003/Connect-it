import React from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Lock, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";
import Header from "./Header";
import Footer from "./Footer";
import "../styles/Landing.css";

const Landing = () => {
  const features = [
    {
      icon: MessageCircle,
      title: "Real-time Messaging",
      description:
        "Send and receive messages instantly with users online. Experience seamless communication like never before.",
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
        "Get notified immediately when you receive new messages. Never miss an important conversation.",
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
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <div className="chat-bubble bubble-1">Hi there! 👋</div>
          <div className="chat-bubble bubble-2">Let's chat! 💬</div>
          <div className="chat-bubble bubble-3">Awesome! 🎉</div>
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
