const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");
const { getCorsOrigins } = require("../config/env");

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (getCorsOrigins().includes(origin.replace(/\/$/, ""))) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in one minute." },
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Message rate limit exceeded. Try again shortly." },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const feedbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Feedback rate limit exceeded. Try again later." },
});

const applySecurityMiddleware = (app) => {
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "https://apis.google.com",
            "https://www.gstatic.com",
            "https://www.googleapis.com",
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https://*.firebasestorage.app",
            "https://firebasestorage.googleapis.com",
            "https://lh3.googleusercontent.com",
          ],
          connectSrc: [
            "'self'",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://firestore.googleapis.com",
            "wss://*.render.com",
            "https://*.render.com",
          ],
          frameSrc: [
            "'self'",
            "https://apis.google.com",
          ],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", "blob:"],
          workerSrc: ["'self'", "blob:"],
          upgradeInsecureRequests: [],
        },
      },
    })
  );
  app.use(cors(corsOptions));
  app.use(globalLimiter);
  app.use(hpp());
  app.use(mongoSanitize({ replaceWith: "_" }));
  app.use(xss());
};

module.exports = {
  apiLimiter,
  applySecurityMiddleware,
  corsOptions,
  feedbackLimiter,
  loginLimiter,
  messageLimiter,
};
