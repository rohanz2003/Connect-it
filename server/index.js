require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const xss = require("xss-clean");
const hpp = require("hpp");

const { connectDatabase } = require("./config/database");
const initSocket = require("./socket/socket");

console.log("=== Transforming Server to Enterprise-Grade Security Baseline ===");

// Connect authoritative database cluster
connectDatabase();

const app = express();
const server = http.createServer(app);

// 1. Rigorous Security Headers via Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://*"],
      connectSrc: ["'self'", "https://*", "wss://*"]
    }
  }
}));

// 2. Cross-Origin Resource Sharing Constraints
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : ["http://localhost:3000", "http://localhost:3001"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Blocked by Cross-Origin Resource Sharing validation."));
    }
  },
  credentials: true,
  exposedHeaders: ["x-new-access-token"]
}));

// 3. Request Parsers and Content Capacity Threshold limits
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());

// 4. Stored/Reflected XSS Sanitizer Interceptor & Parameter Pollution Filter
app.use(xss());
app.use(hpp());

// 5. Route Router Scope Wireups
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const adminRoutes = require("./routes/adminRoutes");

app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin", adminRoutes);

// Global Uncaught Exception Security Filter Middleware Handler
app.use((err, req, res, next) => {
  console.error("⛔ [Uncaught Security/System Exception]:", err.message);
  res.status(err.status || 500).json({
    error: "An unexpected processing error occurred inside the gateway context."
  });
});

// Initialize hardened Realtime core
const io = initSocket(server);
console.log("Socket.IO Engine Online and Hardened ✅");

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Production Server listening securely on port node: ${PORT}`);
});
