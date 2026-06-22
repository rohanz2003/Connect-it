const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const NodeCache = require("node-cache");
const { sendNotificationEmail } = require("../services/emailService");

const otpCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const otpAttempts = new NodeCache({ stdTTL: 600, checkperiod: 60 });

const adminEmail = process.env.ADMIN_EMAIL;

const generateOtp = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedRequestEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedAdminEmail = typeof adminEmail === "string" ? adminEmail.trim().toLowerCase() : "";

    if (!adminEmail) {
      return res
        .status(500)
        .json({ success: false, message: "ADMIN_EMAIL is missing on the server." });
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

    const result = await sendNotificationEmail({
      email: normalizedAdminEmail,
      subject: "Connect It Admin Login OTP",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333333;">Admin Login OTP for Connect It</h2>
            <p style="color: #555555; font-size: 16px;">
              You've requested a One-Time Password (OTP) to log in to the Connect It admin panel.
            </p>
            <p style="font-size: 24px; font-weight: bold; color: #007bff; text-align: center; background-color: #e9f5ff; padding: 15px; border-radius: 5px;">
              ${otp}
            </p>
            <p style="color: #555555; font-size: 14px;">
              This OTP is valid for 5 minutes. Do not share this code with anyone.
            </p>
            <p style="color: #777777; font-size: 12px; margin-top: 20px;">
              If you did not request this, please ignore this email.
            </p>
          </div>
        </div>
      `,
    });

    res.status(200).json({ success: true, message: "OTP sent to admin email." });
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

module.exports = {
  sendOtp,
  verifyOtp,
};