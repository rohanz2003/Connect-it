const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

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
      "https://connect-it-frontend.vercel.app"
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

// 🔌 MONGODB CONNECTION
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("Missing MONGO_URI. Set environment variable MONGO_URI to your MongoDB connection string.");
  if (process.env.NODE_ENV === 'production') process.exit(1);
} else {
  // Log a masked version of the URI to verify it's being injected without exposing passwords
  const maskedUri = mongoUri.replace(/\/\/.*@/, "//***:***@");
  console.log(`Connecting to MongoDB: ${maskedUri}`);
}

mongoose.connect(mongoUri)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.error("MongoDB Error ❌", err));

// 🚀 START SERVER
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});