import React, { useState } from "react";
import { motion } from "framer-motion";
import { Star, ArrowLeft, Send, Lightbulb, Bug, Heart, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "../styles/Feedback.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const feedbackTypes = [
  { value: "suggestion", label: "Feature Suggestion", icon: Lightbulb, color: "#3b82f6", bg: "#eff6ff", desc: "Suggest an improvement or new feature" },
  { value: "bug",        label: "Bug Report",        icon: Bug,        color: "#dc2626", bg: "#fef2f2", desc: "Report something that isn't working" },
  { value: "compliment", label: "Compliment",         icon: Heart,      color: "#16a34a", bg: "#f0fdf4", desc: "Share something you love" },
  { value: "other",      label: "General Feedback",   icon: MessageSquare, color: "#8b5cf6", bg: "#f5f3ff", desc: "Anything else you want to share" },
];

const Feedback = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    type: "suggestion",
    message: "",
    rating: 0,
  });
  const [hoveredRating, setHoveredRating] = useState(0);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setErrorMessage("");
  };

  const handleRating = (rating) => {
    setFormData((prev) => ({
      ...prev,
      rating,
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setErrorMessage("Please enter your name");
      return false;
    }
    if (!formData.email.trim()) {
      setErrorMessage("Please enter your email");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setErrorMessage("Please enter a valid email address");
      return false;
    }
    if (!formData.message.trim()) {
      setErrorMessage("Please enter your feedback message");
      return false;
    }
    if (formData.rating === 0) {
      setErrorMessage("Please select a rating");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`${API_URL}/api/feedback/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        data = { message: "Server returned an invalid response" };
      }

      if (response.ok) {
        setSuccessMessage("Thank you! Your feedback has been sent successfully.");
        setFormData({
          name: "",
          email: "",
          type: "suggestion",
          message: "",
          rating: 0,
        });
        setTimeout(() => {
          navigate("/chat");
        }, 2000);
      } else {
        setErrorMessage(data.message || "Failed to send feedback. Please try again.");
      }
    } catch (error) {
      console.error("Feedback submission error:", error);
      setErrorMessage(`Connection Error: ${error.message}. Please ensure the backend server is reachable.`);
    } finally {
      setLoading(false);
    }
  };

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

  const selectedType = feedbackTypes.find(t => t.value === formData.type) || feedbackTypes[0];
  const SelectedIcon = selectedType.icon;

  return (
    <div className="feedback-page">
      <div className="feedback-header">
        <motion.button
          className="home-button"
          onClick={() => navigate("/chat")}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          title="Back to chat"
        >
          <ArrowLeft size={24} />
        </motion.button>
        <h1 className="feedback-page-title">Connect It</h1>
      </div>

      <div className="feedback-container">
        <motion.div
          className="feedback-form-wrapper"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div className="feedback-title-section" variants={itemVariants}>
            <div className="feedback-badge">We Value Your Feedback</div>
            <h2 className="feedback-main-title">Help Us Improve</h2>
            <p className="feedback-subtitle">
              Your input shapes the future of Connect It. Share a suggestion, report a bug,
              or just tell us what you think.
            </p>
          </motion.div>

          <motion.form onSubmit={handleSubmit} className="feedback-form" variants={itemVariants}>
            <div className="form-group">
              <label className="form-label">Feedback Type</label>
              <div className="feedback-type-grid">
                {feedbackTypes.map(({ value, label, icon: Icon, color, bg, desc }) => (
                  <motion.button
                    key={value}
                    type="button"
                    className={`feedback-type-card ${formData.type === value ? "active" : ""}`}
                    onClick={() => setFormData(prev => ({ ...prev, type: value }))}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      borderColor: formData.type === value ? color : "#e5e7eb",
                      background: formData.type === value ? bg : "#fff",
                    }}
                  >
                    <Icon size={22} style={{ color }} />
                    <span className="feedback-type-label">{label}</span>
                    <span className="feedback-type-desc">{desc}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group form-group-half">
                <label htmlFor="name" className="form-label">Your Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter your full name"
                  className="form-input"
                />
              </div>
              <div className="form-group form-group-half">
                <label htmlFor="email" className="form-label">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email"
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="message" className="form-label">
                <SelectedIcon size={16} style={{ color: selectedType.color, marginRight: 6, verticalAlign: "middle" }} />
                Your {selectedType.label}
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                placeholder={
                  formData.type === "suggestion" ? "Describe your idea for a new feature or improvement..." :
                  formData.type === "bug" ? "What went wrong? Steps to reproduce, expected vs actual behavior..." :
                  formData.type === "compliment" ? "What do you love about Connect It? We'd love to hear it!" :
                  "Share your thoughts, questions, or anything else..."
                }
                className="form-textarea"
                rows="5"
              ></textarea>
            </div>

            <div className="form-group">
              <label className="form-label">How would you rate your experience?</label>
              <div className="rating-container">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.button
                    key={star}
                    type="button"
                    className={`star-button ${star <= (hoveredRating || formData.rating) ? "active" : ""}`}
                    onClick={() => handleRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Star
                      size={32}
                      fill={star <= (hoveredRating || formData.rating) ? "currentColor" : "none"}
                    />
                  </motion.button>
                ))}
              </div>
              {formData.rating > 0 && (
                <p className="rating-text">
                  {formData.rating === 1 ? "Needs improvement" :
                   formData.rating === 2 ? "Fair" :
                   formData.rating === 3 ? "Good" :
                   formData.rating === 4 ? "Great" :
                   "Excellent!"} — <strong>{formData.rating}/5</strong>
                </p>
              )}
            </div>

            {errorMessage && (
              <motion.div
                className="error-message"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errorMessage}
              </motion.div>
            )}

            {successMessage && (
              <motion.div
                className="success-message"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {successMessage}
              </motion.div>
            )}

            <motion.button
              type="submit"
              className="submit-button"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              variants={itemVariants}
            >
              <Send size={20} />
              {loading ? "Sending..." : `Submit ${selectedType.label}`}
            </motion.button>
          </motion.form>

          <motion.p className="optional-message" variants={itemVariants}>
            Every submission is read by our team. Thank you for helping us improve! 💙
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
};

export default Feedback;
