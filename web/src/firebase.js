import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

// TODO: REPLACE WITH YOUR FIREBASE CONFIGURATION
const firebaseConfig = {
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
    }
}
