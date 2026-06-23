const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const {
  getCorsOrigins,
  logEnvironmentDiagnostics,
  validateRequiredEnv,
} = require("./config/env");
const { connectDatabase, isDatabaseConnected } = require("./config/database");
const { initFirebase, isFirebaseConfigured } = require("./config/firebase");

console.log("=== Server Starting ===");

logEnvironmentDiagnostics();

if (!validateRequiredEnv()) {
  if (process.env.RENDER === "true") {
    console.error("❌ Refusing to start: required environment variables missing on Render.");
    process.exit(1);
  }
  console.warn("⚠️ Starting with missing env vars (local dev only).");
}

const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const adminRoutes = require("./routes/adminRoutes");
const requestRoutes = require("./routes/requestRoutes");
const initSocket = require("./socket/socket");
const { initPush } = require("./services/pushService");
const PushSubscription = require("./models/PushSubscription");
const Device = require("./models/Device");
const ChatRequest = require("./models/ChatRequest");
const Message = require("./models/Message");
const User = require("./modules/User");

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);

const io = initSocket(server);
app.set("io", io);
console.log("Socket.IO Started ✅");

initPush();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later" },
});

app.use("/api/", globalLimiter);
app.use("/api/admin/send-otp", authLimiter);
app.use("/api/admin/verify-otp", authLimiter);

// Custom mongo sanitization (express-mongo-sanitize v2 is incompatible with Express 5 req.query getter)
const mongoSanitizeCustom = (req, _res, next) => {
  if (req.body) removeMongoKeys(req.body);
  if (req.params) removeMongoKeys(req.params);
  next();
};
const removeMongoKeys = (obj) => {
  for (const key in obj) {
    if (key.startsWith("$") || key.startsWith("__")) {
      delete obj[key];
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      removeMongoKeys(obj[key]);
    }
  }
};

app.use(mongoSanitizeCustom);

app.use(
  cors({
    origin: getCorsOrigins(),
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));

app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/requests", requestRoutes);

// Email test endpoint — POST /api/test-email { "to": "you@gmail.com" }
app.post("/api/test-email", async (req, res) => {
  const { sendNotificationEmail } = require("./services/emailService");
  const to = req.body.to || process.env.ADMIN_EMAIL || "zenderohan2012@gmail.com";
  try {
    const result = await sendNotificationEmail({
      email: to,
      subject: "Connect It — Test Email",
      html: `<div style="font-family:Arial,sans-serif;padding:20px;"><h2 style="color:#16a34a;">Email is working!</h2><p>This is a test email from Connect It server via Resend API.</p><p style="color:#6b7280;font-size:12px;margin-top:20px;">Sent at ${new Date().toLocaleString()}</p></div>`,
    });
    if (result.success) {
      res.json({ success: true, message: `Test email sent to ${to}`, messageId: result.messageId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Push notification subscription endpoint
app.post("/api/save-subscription", async (req, res) => {
  try {
    const { userId, subscription, deviceInfo } = req.body;
    if (!userId || !subscription) {
      return res.status(400).json({ error: "userId and subscription required" });
    }
    await PushSubscription.findOneAndUpdate(
      { userId: userId.toLowerCase().trim() },
      { subscription, deviceInfo: deviceInfo || "", updatedAt: new Date() },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("save-subscription error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get user's active devices
app.get("/api/devices/:userId", async (req, res) => {
  try {
    const userId = req.params.userId.toLowerCase().trim();
    const devices = await Device.find({ userId }).sort({ lastSeen: -1 }).lean();
    res.json({
      active: devices.filter((d) => d.isActive).length,
      total: devices.length,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        browser: d.browser,
        os: d.os,
        isActive: d.isActive,
        lastSeen: d.lastSeen,
      })),
    });
  } catch (err) {
    console.error("devices error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

console.log("Routes Loaded ✅");

app.get("/", (req, res) => {
  res.send("Chat Server Running 🚀");
});

app.get("/api/analytics", async (req, res) => {
  try {
    const [totalUsers, totalMessages, acceptedRequests] = await Promise.all([
      mongoose.connection.readyState === 1 ? User.countDocuments() : 0,
      mongoose.connection.readyState === 1 ? Message.countDocuments() : 0,
      mongoose.connection.readyState === 1 ? ChatRequest.countDocuments({ status: "accepted" }) : 0,
    ]);
    res.json({ success: true, totalUsers, totalMessages, acceptedRequests });
  } catch (err) {
    console.error("Analytics error:", err.message);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: isDatabaseConnected(),
    mongoState: mongoose.connection.readyState,
    mongoStateLabel: ["disconnected", "connected", "connecting", "disconnecting"][
      mongoose.connection.readyState
    ] || "unknown",
    config: {
      MONGO_URI_SET: Boolean(process.env.MONGO_URI),
      JWT_SECRET_SET: Boolean(process.env.JWT_SECRET),
      EMAIL_USER_SET: Boolean(process.env.EMAIL_USER),
      EMAIL_PASSWORD_SET: Boolean(
        process.env.EMAIL_PASS ||
          process.env.EMAIL_PASSWORD ||
          process.env.GMAIL_APP_PASSWORD
      ),
      ADMIN_EMAIL_SET: Boolean(process.env.ADMIN_EMAIL),
      FRONTEND_URL_SET: Boolean(
        process.env.FRONTEND_URL || process.env.CLIENT_URL
      ),
    },
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  console.log("-----------------------------------------");
  console.log("🚀 SERVER INITIALIZATION STARTING");
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Port: ${PORT}`);
  console.log("-----------------------------------------");

  try {
    await connectDatabase();
  } catch (err) {
    console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("❌ CRITICAL: DATABASE CONNECTION FAILED!");
    console.error("Error:", err.message);
    console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    
    if (process.env.RENDER === "true") {
      process.exit(1);
    }
    console.warn("⚠️ Warning: Running in LOCAL MODE without database persistence.");
  }

  // Firebase Admin init — verify at startup once, not on every request
  if (isFirebaseConfigured()) {
    try {
      initFirebase();
      console.log("✅ Firebase Admin initialized at startup");
    } catch (err) {
      console.warn("⚠️ Firebase Admin init failed:", err.message);
      console.warn("⚠️ Firebase token verification disabled — using decoded tokens");
    }
  } else {
    console.warn("⚠️ Firebase Admin not configured — using decoded tokens");
  }

  const serverInstance = server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} 🚀`);
    console.log("=== Startup Complete ===");
  });

  serverInstance.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.error("💡 TIP: Try stopping the other process or use a different port (e.g., PORT=5001 npm start)");
      process.exit(1);
    } else {
      console.error("❌ Server error:", err.message);
    }
  });
};

startServer().catch((err) => {
  console.error("❌ Fatal startup error:", err);
  process.exit(1);
});
