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

const app = express();
const server = http.createServer(app);

const io = initSocket(server);
console.log("Socket.IO Started ✅");

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
  try {
    await connectDatabase();
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    if (process.env.RENDER === "true") {
      process.exit(1);
    }
    console.warn("⚠️ Continuing without MongoDB (local dev only).");
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} 🚀`);
    console.log("=== Startup Complete ===");
  });
};

startServer().catch((err) => {
  console.error("❌ Fatal startup error:", err);
  process.exit(1);
});
