const mongoose = require("mongoose");

/**
 * Fixes MONGO_URI if it contains unencoded special characters in the password.
 * Specifically handles the '@' character which is common in passwords and breaks parsing.
 */
const formatMongoUri = (uri) => {
  if (!uri || !uri.startsWith("mongodb+srv://")) return uri;

  try {
    // Check if there are multiple '@' symbols
    const parts = uri.split("@");
    if (parts.length <= 2) return uri; // Only one '@' or none, standard parsing should work

    console.log("⚠️ Detected multiple '@' symbols in MONGO_URI. Attempting to auto-fix encoding...");

    // The last part is always the host/options
    const hostAndOptions = parts.pop();
    // The first part contains 'mongodb+srv://user:pass'
    const credentialsPart = parts.join("@"); // Join the rest back with '@'

    // Separate 'mongodb+srv://' from the actual credentials
    const protocolPrefix = "mongodb+srv://";
    const withoutPrefix = credentialsPart.slice(protocolPrefix.length);

    // Split user and password
    const lastColonIndex = withoutPrefix.lastIndexOf(":");
    if (lastColonIndex === -1) return uri; // Something is wrong, return original

    const username = withoutPrefix.slice(0, lastColonIndex);
    const password = withoutPrefix.slice(lastColonIndex + 1);

    // Reconstruct with encoded password
    const encodedPassword = encodeURIComponent(password);
    const fixedUri = `${protocolPrefix}${username}:${encodedPassword}@${hostAndOptions}`;

    return fixedUri;
  } catch (err) {
    console.error("Failed to auto-fix MONGO_URI:", err.message);
    return uri;
  }
};

const connectDatabase = async () => {
  let mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined");
  }

  // Auto-fix URI if it has unencoded @ in password (common issue on Render)
  mongoUri = formatMongoUri(mongoUri);

  if (mongoUri.includes("mongodb+srv")) {
    const maskedUri = mongoUri.replace(/\/\/.*@/, "//***:***@");
    console.log(`Connecting to MongoDB: ${maskedUri}`);
  }

  mongoose.connection.on("connected", () => {
    console.log("MongoDB event: connected");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB event: error", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB event: disconnected");
  });

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4 to avoid DNS issues on some hosting providers
    });
    console.log("MongoDB Connected Successfully ✅");
  } catch (err) {
    console.error("❌ MongoDB Connection Error Details:", {
      message: err.message,
      code: err.code,
      hostname: err.hostname,
      syscall: err.syscall
    });
    throw err;
  }

  return mongoose.connection;
};

const isDatabaseConnected = () => mongoose.connection.readyState === 1;

module.exports = {
  connectDatabase,
  isDatabaseConnected,
};
