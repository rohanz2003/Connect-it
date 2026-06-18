const admin = require("firebase-admin");

let initialized = false;

const getPrivateKey = () => {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  return key ? key.replace(/\\n/g, "\n") : undefined;
};

const initFirebaseAdmin = () => {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return admin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      "Firebase Admin credentials are not fully configured. Firebase ID token verification is disabled."
    );
    return null;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
  initialized = true;
  return admin;
};

const getFirebaseAdmin = () => initFirebaseAdmin();

module.exports = {
  getFirebaseAdmin,
};
