import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBIrefCZKHNUXK3ncJ600etG8ckzYU3yP8",
  authDomain: "saqcay.firebaseapp.com",
  projectId: "saqcay",
  storageBucket: "saqcay.firebasestorage.app",
  messagingSenderId: "706382791709",
  appId: "1:706382791709:web:42c1f958a988d80804b2f4"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;