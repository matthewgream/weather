self.addEventListener('install', (_) => {
    self.skipWaiting();
    console.log('push: service-worker installed');
});

self.addEventListener('activate', (_) => {
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
    } catch {
        if (event.data) notification.body = event.data.text();
    }
    const icon = '/static/images/weather-icon.png';
    const badge = '/static/images/weather-badge.png';
    const tag = 'weather-alert';
    const requireInteraction = true;
    event.waitUntil(
        self.registration.showNotification(notification.title, {
            body: notification.body,
            icon,
            badge,
            timestamp: notification.timestamp || Date.now(),
            tag,
            requireInteraction,
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('push: notification clicked');
    event.notification.close();
    event.waitUntil(
        self.clients
            .matchAll({
                type: 'window',
                includeUncontrolled: true,
            })
            .then((windowClients) => {
                for (let i = 0; i < windowClients.length; i++) if ('focus' in windowClients[i]) return windowClients[i].focus();
                if (self.clients.openWindow) return self.clients.openWindow('/');
            })
    );
});
