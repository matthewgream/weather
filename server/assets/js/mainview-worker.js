// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const FILTER_CATEGORIES_DISPLAY = ['aircraft', 'astronomy'];
const FILTER_CATEGORIES_ALERTS = ['weather', ...FILTER_CATEGORIES_DISPLAY];
const STORAGE_KEY_FILTERS_ALERTS = 'weather-prefs-filter-alerts';

function preferencesLoadFilters(key, categories) {
    try {
        const stored = localStorage.getItem(key);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error(`prefs: failed to load, key=${key}:`, e);
    }
    return Object.fromEntries(categories.map((category) => [category, true]));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

self.addEventListener('install', (_) => {
    self.skipWaiting();
    console.log('push: service-worker installed');
});

self.addEventListener('activate', (_) => {
    console.log('push: service-worker activated');
    return self.clients.claim();
});

self.addEventListener('push', (event) => {
    console.log('push: service-worker notification received:', event);
    let notification = {
        title: 'Weather Alert',
        body: 'New weather alert',
        category: 'general', // default category
    };
    try {
        if (event.data) {
            const data = event.data.json();
            console.log('push: service-worker notification data:', data);
            notification = data;
        }
    } catch (e) {
        console.error('push: service-worker notification data parse error:', e);
        if (event.data) {
            notification.body = event.data.text();
            console.log('push: notification data fallback text:', notification.body);
        }
    }
    const filters = preferencesLoadFilters(STORAGE_KEY_FILTERS_ALERTS, FILTER_CATEGORIES_ALERTS);
    if (notification.category && filters[notification.category] !== undefined && !filters[notification.category]) {
        console.log('push: notification filtered out for category:', notification.category);
        return;
    }
    const icon = '/static/images/weather-icon.png';
    const badge = '/static/images/weather-badge.png';
    const tag = 'weather-alert';
    const requireInteraction = true;
    event.waitUntil(
        self.registration
            .showNotification(notification.title, {
                body: notification.body,
                icon,
                badge,
                timestamp: notification.timestamp || Date.now(),
                tag,
                requireInteraction,
                data: { url: '/' },
                vibrate: [200, 100, 200],
                renotify: true,
            })
            .then(() => {
                console.log('push: service-worker notification display success');
            })
            .catch((e) => {
                console.error('push: service-worker notification display error:', e);
            })
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('push: notification acknowledged');
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
                return undefined;
            })
    );
});

self.addEventListener('error', (event) => {
    console.error('push: service-worker error:', event);
});

self.addEventListener('message', (event) => {
    console.log('push: service-worker message:', event.data);
    if (event.data.type === 'test-notification')
        self.registration.showNotification('Test Notification', {
            body: 'This is a test notification',
            icon: '/static/images/weather-icon.png',
            badge: '/static/images/weather-badge.png',
            requireInteraction: true,
        });
});

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
