const admin = require("firebase-admin");

let firebaseApp = null;
let initFailed = false;

function cleanPrivateKey(raw) {
  if (!raw) return null;
  let key = raw.trim();
  // Strip wrapping quotes (Render sometimes includes them)
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  // Replace literal \n with real newlines
  key = key.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  // Ensure proper PEM structure
  if (!key.includes("-----BEGIN PRIVATE KEY-----")) return null;
  return key;
}

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;
  if (initFailed) return null;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = cleanPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    if (projectId && (!clientEmail || !privateKey)) {
      console.warn("⚠️ Firebase: partial config — missing FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY. Token verification disabled.");
    }
    return null;
  }

  if (!admin.apps.length) {
    try {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      console.log("✅ Firebase Admin initialized with service account for project:", projectId);
    } catch (err) {
      console.error("❌ Firebase Admin init error:", err.message);
      firebaseApp = null;
      initFailed = true;
    }
  } else {
    firebaseApp = admin.apps[0];
  }

  return firebaseApp;
};

const isFirebaseConfigured = () => {
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
};

const verifyFirebaseToken = async (idToken) => {
  const app = initFirebase();
  if (!app) {
    throw new Error("Firebase Admin not configured");
  }
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Invalid token: not a string");
  }
  return admin.auth().verifyIdToken(idToken);
};

module.exports = { initFirebase, verifyFirebaseToken, isFirebaseConfigured };
