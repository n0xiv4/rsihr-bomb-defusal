import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

// TODO: REPLACE WITH YOUR FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyCyzdvP_9f230mUTPas35oNb8C_jyCPVFM",
  authDomain: "hri-group1.firebaseapp.com",
  projectId: "hri-group1",
  storageBucket: "hri-group1.firebasestorage.app",
  messagingSenderId: "799612097558",
  appId: "1:799612097558:web:68d740ae08491ae4f69137",
  measurementId: "G-9GEPES5ZYW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Generate or retrieve a persistent Participant ID
const urlParams = new URLSearchParams(window.location.search);
let participantId = urlParams.get('participantId');

if (participantId) {
    // If ID is provided in URL, use it and update localStorage
    localStorage.setItem('participantId', participantId);
} else {
    // Fallback: Check localStorage or generate new
    participantId = localStorage.getItem('participantId');
    if (!participantId) {
        participantId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('participantId', participantId);
    }
}

export async function logRoundData(data) {
    const payload = {
        ...data,
        participantId: participantId,
        timestamp: serverTimestamp(),
        clientTime: new Date().toISOString()
    };

    console.log("📝 Logging Round Data:", payload);

    try {
        const docRef = await addDoc(collection(db, "experiment_logs"), payload);
        console.log("✅ Data logged with ID: ", docRef.id);
    } catch (e) {
        console.error("❌ Error adding document: ", e);
        // Fallback: Store locally if offline/error? (Optional)
    }
}
