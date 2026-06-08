const jwt = require("jsonwebtoken");
const NodeCache = require("node-cache");
const { getEmailPassword } = require("../config/env");
const { createTransporter, verifyTransporter } = require("../config/mail");

const otpCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const emailUser = process.env.EMAIL_USER;
const emailPass = getEmailPassword();

const transporter = createTransporter();
let transporterReady = false;

verifyTransporter(transporter, "Admin OTP").then((ready) => {
  transporterReady = ready;
});

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

    if (!emailUser || !emailPass) {
      console.error("❌ [Admin OTP] Email credentials missing; cannot send OTP.");
      return res
        .status(500)
        .json({ success: false, message: "Email credentials are missing on the server." });
    }

    if (!adminEmail) {
      console.error("❌ [Admin OTP] ADMIN_EMAIL missing; cannot send OTP.");
      return res
        .status(500)
        .json({ success: false, message: "ADMIN_EMAIL is missing on the server." });
    }

    if (!normalizedRequestEmail || normalizedRequestEmail !== normalizedAdminEmail) {
      return res.status(400).json({ success: false, message: "Invalid admin email address." });
    }

    if (!transporterReady) {
      // Avoid a race during startup: if verify() hasn't completed yet, try once here.
      try {
        await transporter.verify();
        transporterReady = true;
        console.log("Admin Email transporter is ready ✅ (lazy verify)");
      } catch (err) {
        console.error("❌ [Admin OTP] Nodemailer transporter verification failed:", {
          message: err?.message || err,
          code: err?.code,
          stack: err?.stack
        });
        return res.status(500).json({
          success: false,
          message: "Email transporter is not ready. Check Gmail configuration.",
        });
      }
    }

    const otp = generateOtp();
    console.log("🔐 OTP generated for admin login");
    otpCache.set(normalizedAdminEmail, otp);

    const mailOptions = {
      from: emailUser,
      to: normalizedAdminEmail,
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
    };

    console.log("🔐 OTP email sending started");
    await transporter.sendMail(mailOptions);
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