const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");

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
const initSocket = require("./socket/socket");
const { initPush } = require("./services/pushService");
const PushSubscription = require("./models/PushSubscription");
const Device = require("./models/Device");

const app = express();
const server = http.createServer(app);

const io = initSocket(server);
console.log("Socket.IO Started ✅");

initPush();

app.use(
  cors({
    origin: getCorsOrigins(),
    credentials: true,
  })
);

app.use(express.json({ limit: "12mb" }));

app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin", adminRoutes);

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
