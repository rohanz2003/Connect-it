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

const feedbackTypeMeta = {
  suggestion: { label: "Feature Suggestion", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", icon: "💡" },
  bug:        { label: "Bug Report",        color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "🐛" },
  compliment: { label: "Compliment",        color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "❤️" },
  other:      { label: "General Feedback",  color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe", icon: "💬" },
};

const sendFeedback = async (req, res) => {
  try {
    const { name, email, type, message, rating } = req.body;

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
    const safeType = ["suggestion", "bug", "compliment", "other"].includes(type) ? type : "suggestion";
    const firstName = escapeHtml(name.split(" ")[0]);
    const meta = feedbackTypeMeta[safeType];

    const stars = `${"★".repeat(safeRating)}${"☆".repeat(5 - safeRating)}`;

    // Save to DB
    try {
      await Feedback.create({ name, email, type: safeType, message, rating: safeRating });
      console.log("Feedback saved to DB ✅");
    } catch (dbErr) {
      console.warn("Could not save feedback to DB:", dbErr.message);
    }

    const emailHeader = `
      <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
        <div style="font-size:48px;margin-bottom:10px;">${meta.icon}</div>
        <h1 style="color:#fff;margin:0;font-size:24px;">${meta.label}</h1>
        <p style="color:rgba(255,255,255,0.8);margin:5px 0 0;font-size:14px;">via Connect It Feedback System</p>
      </div>`;

    const emailFooter = `
      <div style="text-align:center;padding:20px;border-top:1px solid #e5e7eb;margin-top:20px;">
        <p style="color:#9ca3af;font-size:12px;margin:0;">Connect It &bull; Enterprise Messaging Platform</p>
        <p style="color:#9ca3af;font-size:11px;margin:5px 0 0;">Submitted ${new Date().toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
      </div>`;

    // Send admin notification email
    const adminResult = await sendNotificationEmail({
      email: adminMailTo,
      subject: `[${meta.label}] ${safeName} - Connect It Feedback`,
      replyTo: email,
      html: `
        <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;padding:30px 20px;">
          <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.08);">
            ${emailHeader}
            <div style="padding:28px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
                <div style="background:#f8fafc;padding:12px 16px;border-radius:8px;">
                  <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Name</p>
                  <p style="color:#0f172a;font-size:15px;font-weight:600;margin:0;">${safeName}</p>
                </div>
                <div style="background:#f8fafc;padding:12px 16px;border-radius:8px;">
                  <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Rating</p>
                  <p style="color:#f59e0b;font-size:15px;font-weight:600;margin:0;">${stars}</p>
                </div>
              </div>
              <div style="background:#f8fafc;padding:12px 16px;border-radius:8px;margin-bottom:20px;">
                <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Email</p>
                <p style="color:#2563eb;font-size:14px;margin:0;"><a href="mailto:${safeEmail}" style="color:#2563eb;text-decoration:none;">${safeEmail}</a></p>
              </div>
              <div style="background:#f8fafc;padding:16px 20px;border-radius:8px;border-left:4px solid ${meta.color};">
                <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Message</p>
                <p style="color:#0f172a;font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;">${safeMessage}</p>
              </div>
            </div>
            ${emailFooter}
          </div>
        </div>
      `,
    });
    console.log("Admin feedback email:", adminResult.success ? "sent ✅" : `failed: ${adminResult.error}`);

    // Confirmation to user
    const userResult = await sendNotificationEmail({
      email,
      subject: `We Received Your ${meta.label} - Connect It`,
      html: `
        <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;padding:30px 20px;">
          <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#065f46 0%,#16a34a 100%);padding:36px 28px;text-align:center;">
              <div style="font-size:52px;margin-bottom:12px;">🎉</div>
              <h1 style="color:#fff;margin:0;font-size:26px;">Thank You, ${firstName}!</h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;line-height:1.5;">
                We've received your ${meta.label.toLowerCase()}
              </p>
            </div>
            <div style="padding:28px;">
              <div style="background:#f0fdf4;padding:16px 20px;border-radius:10px;border:1px solid #bbf7d0;text-align:center;margin-bottom:22px;">
                <p style="color:#16a34a;font-size:14px;font-weight:600;margin:0;">
                  ✓ Successfully Submitted
                </p>
              </div>
              <div style="background:#f8fafc;padding:16px 20px;border-radius:8px;border-left:4px solid ${meta.color};margin-bottom:20px;">
                <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">${meta.icon} ${meta.label}</p>
                <p style="color:#0f172a;font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap;">"${safeMessage}"</p>
              </div>
              <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
                <span style="color:#f59e0b;font-size:18px;">${stars}</span>
              </div>
              <p style="color:#475569;font-size:14px;line-height:1.6;margin:20px 0 0;text-align:center;">
                We review every submission to make Connect It better for you.
                ${safeType === "suggestion" ? "Your feature suggestions help shape our roadmap!" : ""}
                ${safeType === "bug" ? "Our team will investigate and fix this as soon as possible." : ""}
              </p>
            </div>
            <div style="text-align:center;padding:20px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;">
              <p style="color:#64748b;font-size:13px;margin:0;">Best regards</p>
              <p style="color:#0f172a;font-size:15px;font-weight:600;margin:4px 0 0;">The Connect It Team</p>
            </div>
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
