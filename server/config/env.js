const path = require("path");

// Load server/.env in local dev. On Render, variables come from the dashboard (not .env file).
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: Boolean(process.env.RENDER),
});

const getEmailPassword = () =>
  process.env.SMTP_PASS ||
  process.env.EMAIL_PASS ||
  process.env.EMAIL_PASSWORD ||
  process.env.GMAIL_APP_PASSWORD;

const hasAnyEmailConfig = () => {
  return Boolean(
    process.env.SENDGRID_API_KEY ||
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
    (process.env.EMAIL_USER && getEmailPassword())
  );
};

const getFrontendUrl = () =>
  process.env.FRONTEND_URL || process.env.CLIENT_URL || "";

const getCorsOrigins = () => {
  const origins = new Set([
    "http://localhost:3000",
    "https://connect-it-frontend.vercel.app",
    "https://connect-it.vercel.app",
  ]);

  const frontend = getFrontendUrl();
  if (frontend) origins.add(frontend.replace(/\/$/, ""));

  return Array.from(origins).filter(Boolean);
};

const logEnvironmentDiagnostics = () => {
  console.log("=== Environment Loaded ===");
  console.log("Mongo URI Exists:", Boolean(process.env.MONGODB_URI || process.env.MONGO_URI));
  console.log("JWT Secret Exists:", Boolean(process.env.JWT_SECRET));
  console.log("JWT Refresh Secret Exists:", Boolean(process.env.JWT_REFRESH_SECRET));
  console.log("Encryption Key Exists:", Boolean(process.env.MESSAGE_ENCRYPTION_KEY));
  console.log("Email Provider:", hasAnyEmailConfig() ? "configured ✅" : "NONE (log-only)");
  if (process.env.SENDGRID_API_KEY) console.log("  → SendGrid API");
  else if (process.env.SMTP_HOST) console.log(`  → SMTP (${process.env.SMTP_HOST})`);
  else if (process.env.EMAIL_USER) console.log("  → Gmail SMTP");
  console.log("Admin Email Exists:", Boolean(process.env.ADMIN_EMAIL));
  console.log("Frontend URL Exists:", Boolean(getFrontendUrl()));
  console.log("Render Deploy:", process.env.RENDER === "true");
  console.log("Port:", process.env.PORT || "(default 5000)");

  if (process.env.RENDER === "true") {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
    if (!mongoUri) {
      console.error("❌ FATAL: MONGO_URI missing on Render. Set it in Environment tab.");
    } else if (mongoUri.includes("localhost") || mongoUri.includes("127.0.0.1")) {
      console.error("❌ FATAL: MONGO_URI cannot be localhost on Render. Use MongoDB Atlas.");
    }
  }
};

const validateRequiredEnv = () => {
  const missing = [];
  if (!process.env.MONGODB_URI && !process.env.MONGO_URI) missing.push("MONGODB_URI");
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!process.env.JWT_REFRESH_SECRET) missing.push("JWT_REFRESH_SECRET");
  if (!process.env.MESSAGE_ENCRYPTION_KEY) missing.push("MESSAGE_ENCRYPTION_KEY");
  if (!hasAnyEmailConfig()) missing.push("EMAIL config (set SMTP_HOST/SMTP_USER/SMTP_PASS or SENDGRID_API_KEY or EMAIL_USER)");
  if (!process.env.ADMIN_EMAIL) missing.push("ADMIN_EMAIL");

  if (missing.length > 0) {
    console.error("❌ CRITICAL: Missing environment variables:", missing.join(", "));
    console.warn("💡 TIP: Add these in your Render Dashboard -> Environment tab!");
    return false;
  }
  console.log("✅ All required environment variables are present.");
  return true;
};

module.exports = {
  getEmailPassword,
  getFrontendUrl,
  getCorsOrigins,
  logEnvironmentDiagnostics,
  validateRequiredEnv,
};
