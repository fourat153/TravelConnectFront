import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getMessaging } from "firebase/messaging";
import { firebaseConfig } from "./firebase-config";

const app = initializeApp(firebaseConfig);
const analyticsSupported =
    typeof window !== 'undefined' && 'indexedDB' in window;
const analytics = analyticsSupported ? getAnalytics(app) : null;
const messagingSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

export const messaging = messagingSupported ? getMessaging(app) : null;