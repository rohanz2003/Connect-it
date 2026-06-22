const admin = require("firebase-admin");

let firebaseApp = null;
let firebaseAvailable = false;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID_CLEAN;

  if (!projectId) {
    if (!firebaseAvailable) {
      console.warn("⚠️ FIREBASE_PROJECT_ID not set — Firebase Admin disabled. Set it in Render dashboard for full auth.");
      firebaseAvailable = false;
    }
    return null;
  }

  if (!admin.apps.length) {
    try {
      firebaseApp = admin.initializeApp({
        projectId: projectId,
      });
      firebaseAvailable = true;
      console.log("✅ Firebase Admin initialized with project ID:", projectId);
    } catch (err) {
      console.error("Firebase Admin init error:", err.message);
    }
  } else {
    firebaseApp = admin.apps[0];
    firebaseAvailable = true;
  }

  return firebaseApp;
};

const isFirebaseConfigured = () => {
  return firebaseAvailable || !!process.env.FIREBASE_PROJECT_ID || !!process.env.FIREBASE_PROJECT_ID_CLEAN;
};

const verifyFirebaseToken = async (idToken) => {
  const app = initFirebase();
  if (!app) {
    throw new Error("Firebase Admin not configured — set FIREBASE_PROJECT_ID env var");
  }
  return admin.auth().verifyIdToken(idToken);
};

module.exports = { initFirebase, verifyFirebaseToken, isFirebaseConfigured };
