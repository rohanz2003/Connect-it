import React, { useState } from "react";
import { motion } from "framer-motion";
import { Star, Home, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "../styles/Feedback.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const Feedback = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
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
          message: "",
          rating: 0,
        });
        setTimeout(() => {
          navigate("/");
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

  return (
    <div className="feedback-page">
      {/* Header with Home Icon */}
      <div className="feedback-header">
        <motion.button
          className="home-button"
          onClick={() => navigate("/")}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          title="Go back to home"
        >
          <Home size={24} />
        </motion.button>
        <h1 className="feedback-page-title">Connect It</h1>
      </div>

      {/* Main Content */}
      <div className="feedback-container">
        <motion.div
          className="feedback-form-wrapper"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Title Section */}
          <motion.div className="feedback-title-section" variants={itemVariants}>
            <div className="feedback-badge">We Value Your Feedback</div>
            <h2 className="feedback-main-title">Tell Us Your Experience</h2>
            <p className="feedback-subtitle">
              Your feedback helps us improve Connect It and provide you with better service.
              We'd love to hear from you!
            </p>
          </motion.div>

          {/* Form Section */}
          <motion.form onSubmit={handleSubmit} className="feedback-form" variants={itemVariants}>
            {/* Name Field */}
            <div className="form-group">
              <label htmlFor="name" className="form-label">
                Your Name
              </label>
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

            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
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

            {/* Feedback Message */}
            <div className="form-group">
              <label htmlFor="message" className="form-label">
                Your Feedback
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                placeholder="Tell us what you think about Connect It..."
                className="form-textarea"
                rows="5"
              ></textarea>
            </div>

            {/* Rating Section */}
            <div className="form-group">
              <label className="form-label">How would you rate your experience?</label>
              <div className="rating-container">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.button
                    key={star}
                    type="button"
                    className={`star-button ${
                      star <= (hoveredRating || formData.rating) ? "active" : ""
                    }`}
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
                  Your rating: <strong>{formData.rating} out of 5 stars</strong>
                </p>
              )}
            </div>

            {/* Messages */}
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

            {/* Submit Button */}
            <motion.button
              type="submit"
              className="submit-button"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              variants={itemVariants}
            >
              <Send size={20} />
              {loading ? "Sending..." : "Submit Feedback"}
            </motion.button>
          </motion.form>

          {/* Optional Message */}
          <motion.p className="optional-message" variants={itemVariants}>
            Thank you for helping us improve Connect It! 💙
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
};

export default Feedback;
