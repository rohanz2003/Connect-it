const Feedback = require("../models/Feedback");
const {
  sendFeedbackAdminEmail,
  sendFeedbackUserEmail,
} = require("../services/emailService");

// Admin receiving address can be configured on hosts; fallback to ADMIN_EMAIL or a default
const adminMailTo =
  process.env.ADMIN_FEEDBACK_EMAIL || process.env.ADMIN_EMAIL || "zenderohan2012@gmail.com";

// Send feedback email
const sendFeedback = async (req, res) => {
  console.log("📩 Feedback email request received");
  try {
    const { name, email, message, rating } = req.body;

    // Validate input
    if (!name || !email || !message || !rating) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Save feedback to DB (best-effort) and send emails
    try {
      await Feedback.create({ name, email, message, rating });
    } catch (dbErr) {
      console.warn("⚠️ Could not save feedback to DB:", dbErr.message);
    }

    // Send emails
    let adminSent = false;
    let userSent = false;

    try {
      console.log("📩 Sending feedback admin email...");
      await sendFeedbackAdminEmail({ name, email, message, rating });
      adminSent = true;
      console.log("📩 Feedback admin email sent successfully");
    } catch (mailErr) {
      console.error("Failed to send admin feedback email:", mailErr && mailErr.message ? mailErr.message : mailErr);
    }

    try {
      console.log("📩 Sending feedback user confirmation email...");
      await sendFeedbackUserEmail({ to: email, name, rating });
      userSent = true;
      console.log("📩 Feedback user confirmation email sent successfully");
    } catch (mailErr) {
      console.error("Failed to send user confirmation email:", mailErr && mailErr.message ? mailErr.message : mailErr);
    }

    if (!adminSent && !userSent) {
      // both failed
      return res.status(500).json({
        success: false,
        message: "Failed to send feedback emails. Please check server email configuration.",
      });
    }

    // At least one email was sent
    return res.status(200).json({
      success: true,
      message: "Feedback received." + (adminSent && userSent ? " Emails sent successfully." : adminSent ? " Admin notified; user email failed." : " User notified; admin email failed."),
    });
  } catch (error) {
    console.error("Error sending feedback email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send feedback. Please try again later.",
      error: error.message,
    });
  }
};

module.exports = {
  sendFeedback,
};