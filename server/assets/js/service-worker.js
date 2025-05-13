
self.addEventListener('install', (event) => {
    self.skipWaiting();
    console.log('push: service-worker installed');
});

self.addEventListener('activate', (event) => {
    console.log('push: service-worker activated');
    return self.clients.claim();
});

self.addEventListener('push', (event) => {
    console.log('push: service-worker notification received');
    let notification = {
        title: 'Weather Alert',
        body: 'New weather alert',
    };
    try {
        if (event.data) notification = event.data.json();
    } catch (e) {
        if (event.data) notification.body = event.data.text();
    }
    const options = {
        body: notification.body,
        icon: '/static/images/weather-icon.png',
        badge: '/static/images/weather-badge.png',
        timestamp: notification.timestamp || Date.now(),
        tag: 'weather-alert',
        requireInteraction: true,
    };
    event.waitUntil(self.registration.showNotification(notification.title, options));
});

self.addEventListener('notificationclick', (event) => {
    console.log('push: notification clicked');
    event.notification.close();
    event.waitUntil(
        clients
            .matchAll({
                type: 'window',
                includeUncontrolled: true,
            })
            .then((windowClients) => {
                for (let i = 0; i < windowClients.length; i++)
                    if ('focus' in windowClients[i]) return windowClients[i].focus();
                if (clients.openWindow) return clients.openWindow('/');
            })
    );
});
