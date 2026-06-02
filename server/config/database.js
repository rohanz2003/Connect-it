const mongoose = require("mongoose");

const connectDatabase = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined");
  }

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

  await mongoose.connect(mongoUri, { family: 4 });

  console.log("MongoDB Connected Successfully ✅");
  return mongoose.connection;
};

const isDatabaseConnected = () => mongoose.connection.readyState === 1;

module.exports = {
  connectDatabase,
  isDatabaseConnected,
};
