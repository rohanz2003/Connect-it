const admin = require("firebase-admin");

let firebaseApp = null;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID_CLEAN;

  if (projectId && !admin.apps.length) {
    try {
      firebaseApp = admin.initializeApp({
        projectId: projectId,
      });
      console.log("Firebase Admin initialized with project ID");
    } catch (err) {
      console.error("Firebase Admin init error:", err.message);
    }
  } else if (admin.apps.length) {
    firebaseApp = admin.apps[0];
  }

  return firebaseApp;
};

const verifyFirebaseToken = async (idToken) => {
  const app = initFirebase();
  if (!app) {
    throw new Error("Firebase Admin not initialized");
  }
  return admin.auth().verifyIdToken(idToken);
};

module.exports = { initFirebase, verifyFirebaseToken };
