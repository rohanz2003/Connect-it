const jwt = require("jsonwebtoken");
const NodeCache = require("node-cache");
const { sendOtpEmail } = require("../services/emailService");

const otpCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Function to generate a random 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @route POST /api/admin/send-otp
// @desc Send an OTP to the admin email
// @access Public
const sendOtp = async (req, res) => {
  console.log("🔐 Admin OTP request received");
  try {
    const { email } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;
    const normalizedRequestEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedAdminEmail = typeof adminEmail === "string" ? adminEmail.trim().toLowerCase() : "";

    if (!adminEmail) {
      console.error("❌ [Admin OTP] ADMIN_EMAIL missing; cannot send OTP.");
      return res
        .status(500)
        .json({ success: false, message: "ADMIN_EMAIL is missing on the server." });
    }

    if (!normalizedRequestEmail || normalizedRequestEmail !== normalizedAdminEmail) {
      return res.status(400).json({ success: false, message: "Invalid admin email address." });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error("❌ [Admin OTP] RESEND_API_KEY missing; cannot send OTP.");
      return res
        .status(500)
        .json({ success: false, message: "Email service is not configured." });
    }

    const otp = generateOtp();
    console.log("🔐 OTP generated for admin login");
    otpCache.set(normalizedAdminEmail, otp);

    const result = await sendOtpEmail({ to: normalizedAdminEmail, otp });

    if (!result.success) {
      console.error("❌ [Admin OTP] Failed to send OTP email:", result.error);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please check server configuration.",
        error: result.error,
      });
    }

    console.log("🔐 OTP email sent successfully");
    res.status(200).json({ success: true, message: "OTP sent to admin email." });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP.", error: error.message });
  }
};

// @route POST /api/admin/verify-otp
// @desc Verify OTP and issue JWT
// @access Public
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;
    const jwtSecret = process.env.JWT_SECRET;
    const normalizedRequestEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedAdminEmail = typeof adminEmail === "string" ? adminEmail.trim().toLowerCase() : "";

    if (!adminEmail) {
      return res
        .status(500)
        .json({ success: false, message: "ADMIN_EMAIL is missing on the server." });
    }

    if (!jwtSecret) {
      return res
        .status(500)
        .json({ success: false, message: "JWT_SECRET is missing on the server." });
    }

    if (!normalizedRequestEmail || normalizedRequestEmail !== normalizedAdminEmail || !otp) {
      return res.status(400).json({ success: false, message: "Invalid request. Email and OTP are required." });
    }

    const storedOtp = otpCache.get(normalizedAdminEmail);

    if (!storedOtp || storedOtp !== otp) {
      return res.status(401).json({ success: false, message: "Invalid or expired OTP." });
    }

    console.log("🔐 OTP verified successfully");
    otpCache.del(normalizedAdminEmail);
    const token = jwt.sign({ email: normalizedAdminEmail }, jwtSecret, { expiresIn: "1h" }); // Token valid for 1 hour

    res.status(200).json({ success: true, message: "Login successful.", token });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "Failed to verify OTP.", error: error.message });
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
};