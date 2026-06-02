import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBQxTF0Xs2XewA7K1MVlPNvSOPtBcEQ88U",
  authDomain: "chat-app-1f9c3.firebaseapp.com",
  projectId: "chat-app-1f9c3",
  storageBucket: "chat-app-1f9c3.firebasestorage.app",
  messagingSenderId: "535968986106",
  appId: "1:535968986106:web:b14203e7b0b5498c656a43",
  measurementId: "G-51DCTJ8TPB"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);