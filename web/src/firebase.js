import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

// TODO: REPLACE WITH YOUR FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "BPSI6dihRj4suW2aBtKhfgAl5VI_M7ohxAeR55MxjLLHYF6gy_Lg8ss8j2ftazOZO_xPxVnZ5B3R3YYNPUxiMqc",
    authDomain: "hri-group1.firebaseapp.com",
    projectId: "hri-group1",
    storageBucket: "hri-group1.appspot.com",
    messagingSenderId: "799612097558",
    appId: "799612097558"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Generate or retrieve a persistent Participant ID
let participantId = localStorage.getItem('participantId');
if (!participantId) {
    participantId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('participantId', participantId);
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
