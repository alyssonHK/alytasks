/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence, Firestore } from "firebase/firestore";

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

let dbInstance: Firestore | null = null;

export const getDb = async () => {
    if (!dbInstance) {
        const db = getFirestore(app);
        try {
            // A persistência é ativada na primeira vez que o DB é solicitado
            await enableIndexedDbPersistence(db);
        } catch (err: any) {
            if (err.code == 'failed-precondition') {
                console.warn('Firestore persistence failed: multiple tabs open.');
            } else if (err.code == 'unimplemented') {
                console.error('Firestore persistence not supported in this browser.');
            }
        }
        dbInstance = db;
    }
    return dbInstance;
};

// A exportação direta de 'db' e a inicialização com .then() foram removidas para evitar condições de corrida.

export const initializeOfflinePersistence = async (showToast: (message: string, duration?: number) => void) => {
    // Esta função agora apenas garante a inicialização e mostra toasts específicos.
    try {
        await getDb();
    } catch (err: any) {
         if (err.code == 'failed-precondition') {
            showToast('Os dados não serão salvos offline. Mantenha apenas uma aba do app aberta.', 5000);
        } else if (err.code == 'unimplemented') {
            showToast('Seu navegador não suporta modo offline.', 5000);
        }
    }
};
