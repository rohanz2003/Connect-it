const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");

const {
  getCorsOrigins,
  logEnvironmentDiagnostics,
  validateRequiredEnv,
} = require("./config/env");
const { connectDatabase, isDatabaseConnected } = require("./config/database");

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
const securityRoutes = require("./routes/securityRoutes");
const initSocket = require("./socket/socket");
const { initPush } = require("./services/pushService");
const PushSubscription = require("./models/PushSubscription");
const Device = require("./models/Device");
const { authenticateUser, optionalAuth } = require("./middleware/authenticateUser");

const app = express();
const server = http.createServer(app);

const io = initSocket(server);
console.log("Socket.IO Started ✅");

initPush();

// ============================================================
// SECURITY MIDDLEWARE
// ============================================================

// 1. Helmet - Security headers
app.use(helmet());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "wss://*", "https://*.firebaseio.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'self'", "https://*.firebaseapp.com"],
    },
  })
);

// 2. CORS
app.use(
  cors({
    origin: getCorsOrigins(),
    credentials: true,
  })
);

// 3. Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use(globalLimiter);

// 4. Body parsing with size limit
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

// 5. XSS Clean - Sanitize request body/query/params
app.use(xss());

// 6. MongoDB Sanitize - Prevent NoSQL operator injection
app.use(mongoSanitize());

// 7. HPP - HTTP Parameter Pollution protection
app.use(hpp());

// 8. API-specific rate limiters
const limiter = {
  login: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please try again later." },
  }),
  messages: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Message rate limit exceeded." },
  }),
};

// ============================================================
// ROUTES
// ============================================================

// Health check (no auth required, not rate limited)
app.get("/", (req, res) => {
  res.send("Chat Server Running 🚀");
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
      HELMET_ENABLED: true,
      RATE_LIMITING_ENABLED: true,
    },
  });
});

// User routes
app.use("/api/users", limiter.messages, userRoutes);

// Message routes (with rate limiting per minute)
app.use("/api/messages", limiter.messages, messageRoutes);

// Feedback routes
app.use("/api/feedback", feedbackRoutes);

// Admin routes (already has auth)
app.use("/api/admin", adminRoutes);

// Security routes (block, report, privacy, devices)
app.use("/api/security", securityRoutes);

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
