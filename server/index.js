const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const compression = require("compression");

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
    console.error("Refusing to start: required environment variables missing on Render.");
    process.exit(1);
  }
  console.warn("Starting with missing env vars (local dev only).");
}

const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const adminRoutes = require("./routes/adminRoutes");

const initSocket = require("./socket/socket");

const app = express();
const server = http.createServer(app);

const io = initSocket(server);
console.log("Socket.IO Started");

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: getCorsOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many authentication attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/admin/send-otp", authLimiter);
app.use("/api/admin/verify-otp", authLimiter);

app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin", adminRoutes);

console.log("Routes Loaded");

app.get("/", (req, res) => {
  res.send("Chat Server Running");
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: isDatabaseConnected(),
    mongoState: mongoose.connection.readyState,
    mongoStateLabel: ["disconnected", "connected", "connecting", "disconnecting"][
      mongoose.connection.readyState
    ] || "unknown",
    uptime: process.uptime(),
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
  console.log("SERVER INITIALIZATION STARTING");
  console.log("Environment:", process.env.NODE_ENV || 'development');
  console.log("Port:", PORT);
  console.log("-----------------------------------------");

  try {
    await connectDatabase();
  } catch (err) {
    console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("CRITICAL: DATABASE CONNECTION FAILED!");
    console.error("Error:", err.message);
    console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    
    if (process.env.RENDER === "true") {
      process.exit(1);
    }
    console.warn("Warning: Running in LOCAL MODE without database persistence.");
  }

  const serverInstance = server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("=== Startup Complete ===");
  });

  serverInstance.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use.`);
      console.error("TIP: Try stopping the other process or use a different port (e.g., PORT=5001 npm start)");
      process.exit(1);
    } else {
      console.error("Server error:", err.message);
    }
  });
};

startServer().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});