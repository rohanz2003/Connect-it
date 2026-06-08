import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBQxTF0Xs2XewA7K1MVlPNvSOPtBcEQ88U",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "chat-app-1f9c3.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "chat-app-1f9c3",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "chat-app-1f9c3.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "535968986106",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:535968986106:web:b14203e7b0b5498c656a43",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-51DCTJ8TPB"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();