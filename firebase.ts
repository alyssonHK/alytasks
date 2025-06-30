/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Config
const firebaseConfig = {
    apiKey: "AIzaSyA-9arO3bMG1IK9PoJP93LEiMCAPwyT6pg",
    authDomain: "agenda-9bc62.firebaseapp.com",
    projectId: "agenda-9bc62",
    storageBucket: "agenda-9bc62.appspot.com",
    messagingSenderId: "340413052561",
    appId: "1:340413052561:web:69c04c0a640050f3f7f130",
    measurementId: "G-X0VPQGJVGG"
};

export const appId = 'default-task-manager';
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const initializeOfflinePersistence = async (showToast: (message: string, duration?: number) => void) => {
    try {
        await enableIndexedDbPersistence(db);
    } catch (err: any) {
        if (err.code == 'failed-precondition') {
            console.warn('Firestore persistence failed: multiple tabs open.');
            showToast('Os dados não serão salvos offline. Mantenha apenas uma aba do app aberta.', 5000);
        } else if (err.code == 'unimplemented') {
            console.error('Firestore persistence not supported in this browser.');
            showToast('Seu navegador não suporta modo offline.', 5000);
        }
    }
};
