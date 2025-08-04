// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDkXMy012UVG3l8A9CFUYNXwi50ieGO2y8",
  authDomain: "iep-harmony-account-creation.firebaseapp.com",
  projectId: "iep-harmony-account-creation",
  storageBucket: "iep-harmony-account-creation.firebasestorage.app",
  messagingSenderId: "760453042706",
  appId: "1:760453042706:web:2043a1e0b54fe97e4c7ecb",
  measurementId: "G-7JH2SLTYSD"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
