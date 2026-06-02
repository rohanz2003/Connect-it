const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");

// Local dev: load server/.env. On Render, vars come from Dashboard (not from .env file).
require("dotenv").config({ quiet: Boolean(process.env.RENDER) });

const logConfigurationStatus = () => {
  const mongoUri = process.env.MONGO_URI || "";
  const status = {
    RENDER: process.env.RENDER === "true",
    MONGO_URI_SET: Boolean(mongoUri),
    MONGO_URI_USES_LOCALHOST: mongoUri.includes("localhost") || mongoUri.includes("127.0.0.1"),
    EMAIL_USER_SET: Boolean(process.env.EMAIL_USER),
    EMAIL_PASSWORD_SET: Boolean(process.env.EMAIL_PASSWORD),
    GMAIL_APP_PASSWORD_SET: Boolean(process.env.GMAIL_APP_PASSWORD),
    ADMIN_EMAIL_SET: Boolean(process.env.ADMIN_EMAIL),
    JWT_SECRET_SET: Boolean(process.env.JWT_SECRET),
    FRONTEND_URL_SET: Boolean(process.env.FRONTEND_URL),
  };
  console.log("📋 Server configuration:", status);

  if (process.env.RENDER === "true") {
    if (!status.MONGO_URI_SET) {
      console.error("❌ Render: MONGO_URI is missing. Add it in Render → Environment.");
    } else if (status.MONGO_URI_USES_LOCALHOST) {
      console.error(
        "❌ Render: MONGO_URI uses localhost. Use a MongoDB Atlas connection string instead."
      );
    }
    if (!status.EMAIL_USER_SET || (!status.EMAIL_PASSWORD_SET && !status.GMAIL_APP_PASSWORD_SET)) {
      console.error("❌ Render: EMAIL_USER and GMAIL_APP_PASSWORD (or EMAIL_PASSWORD) are required for OTP/feedback email.");
    }
    if (!status.ADMIN_EMAIL_SET || !status.JWT_SECRET_SET) {
      console.error("❌ Render: ADMIN_EMAIL and JWT_SECRET are required for admin OTP login.");
    }
  }
};

logConfigurationStatus();

// ROUTES
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const adminRoutes = require("./routes/adminRoutes");

// SOCKET
const initSocket = require("./socket/socket");

const app = express();
const server = http.createServer(app);

// 🔗 CONNECT SOCKET.IO
initSocket(server);

// 🧠 MIDDLEWARE

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      process.env.FRONTEND_URL,
      "https://connect-it-frontend.vercel.app",
      "https://connect-it.vercel.app"
    ].filter(Boolean),
    credentials: true
  })
);

app.use(express.json());

// 📡 API ROUTES
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin", adminRoutes);

// 🏠 ROOT ROUTE
app.get("/", (req, res) => {
  res.send("Chat Server Running 🚀");
});

// Health check for deployment debugging (no secrets)
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mongoState: mongoose.connection.readyState,
    config: {
      MONGO_URI_SET: Boolean(process.env.MONGO_URI),
      EMAIL_USER_SET: Boolean(process.env.EMAIL_USER),
      GMAIL_APP_PASSWORD_SET: Boolean(process.env.GMAIL_APP_PASSWORD),
      EMAIL_PASSWORD_SET: Boolean(process.env.EMAIL_PASSWORD),
      ADMIN_EMAIL_SET: Boolean(process.env.ADMIN_EMAIL),
      JWT_SECRET_SET: Boolean(process.env.JWT_SECRET),
      FRONTEND_URL_SET: Boolean(process.env.FRONTEND_URL),
    },
  });
});

// 🔌 MONGODB CONNECTION
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("❌ FATAL ERROR: MONGO_URI is not defined in environment variables.");
  process.exit(1);
} else if (mongoUri.includes("mongodb+srv")) {
  // Log a masked version of the URI to verify it's being injected without exposing passwords
  const maskedUri = mongoUri.replace(/\/\/.*@/, "//***:***@");
  console.log(`Connecting to MongoDB: ${maskedUri}`);
}

mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.error("MongoDB Error ❌", err));

// 🚀 START SERVER
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});