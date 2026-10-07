// Give the service worker access to Firebase Messaging.
// Note: ES modules (import) are not supported by default in service workers.
// We define the config directly here.

const firebaseConfig = {
  apiKey: "AIzaSyC6XPl8MxVd6b-igmwEZoXJKUA-Dpwt8RA",
  authDomain: "travelconnect-caf0c.firebaseapp.com",
  projectId: "travelconnect-caf0c",
  storageBucket: "travelconnect-caf0c.firebasestorage.app",
  messagingSenderId: "902141343799",
  appId: "1:902141343799:web:036f2584d35928734fe7b2",
  measurementId: "G-MDHF77N4SZ"
};

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle data-only background messages
messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || 'New Notification';
  const options = {
    body: payload.data?.body || '',
    icon: '/favicon.ico',
    data: payload.data
  };

  return self.registration.showNotification(title, options);
});

// Handle click on background notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const type = String(data.type || data.notification_type || '').toLowerCase();
  let urlToOpen = data.url || '/';

  if (type.includes('friend') && type.includes('request')) {
    urlToOpen = '/friend-requests';
  } else if (type.includes('friend') && type.includes('accept')) {
    const actorId = data.actor_id || data.actorId;
    if (actorId) {
      urlToOpen = `/profile/${actorId}`;
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
