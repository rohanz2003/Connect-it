const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const NodeCache = require("node-cache");
const { sendNotificationEmail } = require("../services/emailService");

const otpCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const otpAttempts = new NodeCache({ stdTTL: 600, checkperiod: 60 });

const adminEmail = process.env.ADMIN_EMAIL;

const generateOtp = () => crypto.randomInt(100000, 999999).toString();

const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedRequestEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedAdminEmail = typeof adminEmail === "string" ? adminEmail.trim().toLowerCase() : "";

    if (!adminEmail) {
      return res.status(500).json({ success: false, message: "ADMIN_EMAIL is missing on the server." });
    }

    if (!normalizedRequestEmail || normalizedRequestEmail !== normalizedAdminEmail) {
      return res.status(400).json({ success: false, message: "Invalid admin email address." });
    }

    const attempts = otpAttempts.get(normalizedAdminEmail) || 0;
    if (attempts >= 5) {
      return res.status(429).json({ success: false, message: "Too many OTP requests. Try again later." });
    }
    otpAttempts.set(normalizedAdminEmail, attempts + 1);

    const otp = generateOtp();
    otpCache.set(normalizedAdminEmail, otp);

    // Send OTP email first, then respond
    try {
      const result = await sendNotificationEmail({
        email: normalizedAdminEmail,
        subject: "Connect It Admin Login OTP",
        html: `
          <div style="font-family:Arial,sans-serif;padding:20px;background:#f4f4f4;">
            <div style="max-width:600px;margin:0 auto;background:#fff;padding:30px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
              <h2 style="color:#333;">Admin Login OTP</h2>
              <p style="color:#555;font-size:16px;">Your One-Time Password for Connect It admin login:</p>
              <p style="font-size:28px;font-weight:bold;color:#007bff;text-align:center;background:#e9f5ff;padding:15px;border-radius:5px;margin:20px 0;">
                ${otp}
              </p>
              <p style="color:#555;font-size:14px;">Valid for 5 minutes. Do not share this code.</p>
              <p style="color:#777;font-size:12px;margin-top:20px;">If you did not request this, ignore this email.</p>
            </div>
          </div>
        `,
      });
      console.log(`📧 OTP sent to ${normalizedAdminEmail}:`, result.success ? "✅" : `❌ ${result.error}`);
      res.status(200).json({ success: true, message: "OTP sent to admin email." });
    } catch (err) {
      console.error("OTP email error:", err.message);
      res.status(500).json({ success: false, message: "Failed to send OTP email." });
    }
  } catch (error) {
    console.error("Error sending OTP:", error.message);
    res.status(500).json({ success: false, message: "Failed to send OTP." });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const jwtSecret = process.env.JWT_SECRET;
    const normalizedRequestEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedAdminEmail = typeof adminEmail === "string" ? adminEmail.trim().toLowerCase() : "";

    if (!adminEmail) {
      return res.status(500).json({ success: false, message: "ADMIN_EMAIL is missing on the server." });
    }

    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: "JWT_SECRET is missing on the server." });
    }

    if (!normalizedRequestEmail || normalizedRequestEmail !== normalizedAdminEmail || !otp) {
      return res.status(400).json({ success: false, message: "Invalid request. Email and OTP are required." });
    }

    const storedOtp = otpCache.get(normalizedAdminEmail);

    if (!storedOtp || storedOtp !== otp) {
      return res.status(401).json({ success: false, message: "Invalid or expired OTP." });
    }

    otpCache.del(normalizedAdminEmail);
    const token = jwt.sign({ email: normalizedAdminEmail, role: "admin" }, jwtSecret, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    res.status(200).json({ success: true, message: "Login successful.", token });
  } catch (error) {
    console.error("Error verifying OTP:", error.message);
    res.status(500).json({ success: false, message: "Failed to verify OTP." });
  }
};

module.exports = { sendOtp, verifyOtp };
