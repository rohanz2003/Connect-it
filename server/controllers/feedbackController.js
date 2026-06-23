const Feedback = require("../models/Feedback");
const { sendNotificationEmail } = require("../services/emailService");

const escapeHtml = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const adminMailTo =
  process.env.ADMIN_FEEDBACK_EMAIL || process.env.ADMIN_EMAIL || "zenderohan2012@gmail.com";

const sendFeedback = async (req, res) => {
  try {
    const { name, email, message, rating } = req.body;

    if (!name || !email || !message || !rating) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message);
    const safeRating = Math.min(5, Math.max(1, parseInt(rating) || 5));
    const firstName = escapeHtml(name.split(" ")[0]);

    // Save to DB
    try {
      await Feedback.create({ name, email, message, rating: safeRating });
      console.log("Feedback saved to DB ✅");
    } catch (dbErr) {
      console.warn("Could not save feedback to DB:", dbErr.message);
    }

    // Send admin + user emails, then respond
    const adminResult = await sendNotificationEmail({
      email: adminMailTo,
      subject: `New Feedback from ${name} - Connect It`,
      replyTo: email,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f9fafb;padding:20px;">
          <div style="max-width:600px;margin:0 auto;background:#fff;padding:30px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
            <h2 style="color:#1f2937;margin-bottom:20px;border-bottom:2px solid #3b82f6;padding-bottom:10px;">
              New Feedback Received
            </h2>
            <p style="color:#6b7280;margin:10px 0;"><strong style="color:#374151;">Name:</strong> ${safeName}</p>
            <p style="color:#6b7280;margin:10px 0;"><strong style="color:#374151;">Email:</strong> ${safeEmail}</p>
            <p style="color:#6b7280;margin:10px 0;">
              <strong style="color:#374151;">Rating:</strong>
              <span style="color:#fbbf24;">${"★".repeat(safeRating)}${"☆".repeat(5 - safeRating)} (${safeRating}/5)</span>
            </p>
            <div style="background:#eff6ff;padding:15px;border-radius:8px;border-left:4px solid #3b82f6;margin-top:15px;">
              <h3 style="color:#1d4ed8;margin-top:0;margin-bottom:10px;">Message:</h3>
              <p style="color:#374151;line-height:1.6;margin:0;white-space:pre-wrap;">${safeMessage}</p>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin-top:20px;">Submitted ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `,
    });
    console.log("Admin feedback email:", adminResult.success ? "sent ✅" : `failed: ${adminResult.error}`);

    // Confirmation to user
    const userResult = await sendNotificationEmail({
      email,
      subject: "Thank You for Your Feedback - Connect It",
      html: `
        <div style="font-family:Arial,sans-serif;background:#f9fafb;padding:20px;">
          <div style="max-width:600px;margin:0 auto;background:#fff;padding:30px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
            <h2 style="color:#1f2937;">Thank You, ${firstName}!</h2>
            <p style="color:#6b7280;line-height:1.6;">We appreciate your feedback. It helps us improve Connect It.</p>
            <div style="background:#dcfce7;padding:15px;border-radius:8px;border-left:4px solid #16a34a;margin:20px 0;">
              <p style="color:#16a34a;margin:0;"><strong>Your feedback has been received</strong></p>
            </div>
            <p style="color:#6b7280;">Your Rating: <span style="color:#fbbf24;">${"★".repeat(safeRating)}</span></p>
            <p style="color:#6b7280;margin-top:20px;">Best regards,<br/><strong>The Connect It Team</strong></p>
          </div>
        </div>
      `,
    });
    console.log("User confirmation email:", userResult.success ? "sent ✅" : `failed: ${userResult.error}`);

    return res.status(200).json({
      success: true,
      message: "Thank you! Your feedback has been received.",
      emailSent: adminResult.success,
    });
  } catch (error) {
    console.error("Error sending feedback:", error);
    return res.status(500).json({ success: false, message: "Failed to send feedback." });
  }
};

module.exports = { sendFeedback };
