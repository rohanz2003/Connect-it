const jwt = require("jsonwebtoken");
const NodeCache = require("node-cache");
const { sendNotificationEmail } = require("../services/emailService");

const otpCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const adminEmail = process.env.ADMIN_EMAIL;

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOtp = async (req, res) => {
  console.log("🔐 Admin OTP request received");
  try {
    const { email } = req.body;
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

    const otp = generateOtp();
    console.log("🔐 OTP generated for admin login");
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

    if (result.logOnly) {
      console.log("🔐 OTP logged to console (no email provider configured):", otp);
    } else {
      console.log("🔐 OTP email sent successfully");
    }

    res.status(200).json({ success: true, message: "OTP sent to admin email." });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP.", error: error.message });
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

    console.log("🔐 OTP verified successfully");
    otpCache.del(normalizedAdminEmail);
    const token = jwt.sign({ email: normalizedAdminEmail }, jwtSecret, { expiresIn: "1h" });

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