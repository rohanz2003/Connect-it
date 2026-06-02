const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const NodeCache = require("node-cache");

// Initialize OTP cache with a 5-minute (300 seconds) TTL
// Each OTP will expire after 5 minutes
const otpCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const emailUser = process.env.EMAIL_USER;
// Allow both env var names since different hosts often set different ones
const emailPass = process.env.EMAIL_PASSWORD || process.env.GMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: emailUser,
    pass: emailPass,
  },
});

let transporterReady = false;
if (!emailUser || !emailPass) {
  console.warn("⚠️ Admin Email credentials missing. OTP login will not work.");
} else {
  // Verify transporter configuration once at startup to surface auth/connectivity errors
  transporter
    .verify()
    .then(() => {
      transporterReady = true;
      console.log("Admin Email transporter is ready ✅");
    })
    .catch((err) => {
      transporterReady = false;
      console.warn(
        "Admin Email transporter verification failed ⚠️",
        err && err.message ? err.message : err
      );
    });
}

// Function to generate a random 6-digit OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @route POST /api/admin/send-otp
// @desc Send an OTP to the admin email
// @access Public
const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!emailUser || !emailPass) {
      return res
        .status(500)
        .json({ success: false, message: "Email credentials are missing on the server." });
    }

    if (!adminEmail) {
      return res
        .status(500)
        .json({ success: false, message: "ADMIN_EMAIL is missing on the server." });
    }

    if (!email || email.toLowerCase() !== adminEmail.toLowerCase()) {
      return res.status(400).json({ success: false, message: "Invalid admin email address." });
    }

    if (!transporterReady) {
      return res
        .status(500)
        .json({ success: false, message: "Email transporter is not ready. Check Gmail configuration." });
    }

    const otp = generateOtp();
    // Store OTP in cache with admin email as key, set to expire in 5 minutes
    otpCache.set(adminEmail.toLowerCase(), otp);

    const mailOptions = {
      from: emailUser,
      to: adminEmail,
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

    await transporter.sendMail(mailOptions);
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

    if (!email || email.toLowerCase() !== adminEmail.toLowerCase() || !otp) {
      return res.status(400).json({ success: false, message: "Invalid request. Email and OTP are required." });
    }

    const storedOtp = otpCache.get(adminEmail.toLowerCase());

    if (!storedOtp || storedOtp !== otp) {
      return res.status(401).json({ success: false, message: "Invalid or expired OTP." });
    }

    // OTP is valid, remove from cache and issue JWT
    otpCache.del(adminEmail.toLowerCase());
    const token = jwt.sign({ email: adminEmail }, jwtSecret, { expiresIn: "1h" }); // Token valid for 1 hour

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