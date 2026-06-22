const admin = require("firebase-admin");

let firebaseApp = null;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    if (!admin.apps.length) {
      try {
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
        console.log("✅ Firebase Admin initialized with service account");
      } catch (err) {
        console.error("Firebase Admin init error:", err.message);
      }
    } else {
      firebaseApp = admin.apps[0];
    }
    return firebaseApp;
  }

  if (projectId && !clientEmail && !privateKey) {
    console.warn("⚠️ FIREBASE_PROJECT_ID set but missing FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY");
  }

  return null;
};

const isFirebaseConfigured = () => {
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
};

const verifyFirebaseToken = async (idToken) => {
  const app = initFirebase();
  if (!app) {
    throw new Error("Firebase Admin not configured");
  }
  return admin.auth().verifyIdToken(idToken);
};

module.exports = { initFirebase, verifyFirebaseToken, isFirebaseConfigured };
