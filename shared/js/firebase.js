import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAnWuEtZHejl-DMZ9n4wr-Rmy4WsDhLgYE",
  authDomain: "qcommute-88bf5.firebaseapp.com",
  projectId: "qcommute-88bf5",
  storageBucket: "qcommute-88bf5.firebasestorage.app",
  messagingSenderId: "1049903713277",
  appId: "1:1049903713277:web:b7f223099a21b346da6794",
  measurementId: "G-XXNZQL7Y0G"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;