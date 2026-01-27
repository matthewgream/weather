// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function __urlBase64ToUint8Array(base64String) {
    const rawData = window.atob((base64String + '='.repeat((4 - (base64String.length % 4)) % 4)).replaceAll('-', '+').replaceAll('_', '/'));
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.codePointAt(i);
    return outputArray;
}

// XXX should be a class
const weatherPushNotifications = (function () {
    let vapidPublicKey;
    let serviceWorker;
    let isSubscribed = false;
    let currentEndpoint = null;

    async function subscribe(filters) {
        try {
            const subscription = await serviceWorker.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: __urlBase64ToUint8Array(vapidPublicKey),
            });
            currentEndpoint = subscription.endpoint;
            await fetch('/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription, filters }),
            });
            isSubscribed = true;
            console.log('push: user subscription enable success:', subscription);
            return true;
        } catch (e) {
            console.error('push: user subscription enable error:', e);
            return false;
        }
    }

    async function unsubscribe() {
        try {
            const subscription = await serviceWorker.pushManager.getSubscription();
            if (subscription) {
                const { endpoint } = subscription;
                await subscription.unsubscribe();
                await fetch('/push/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint }),
                });
            }
            isSubscribed = false;
            currentEndpoint = null;
            console.log('push: user subscription disable success' + (subscription ? '' : ' (was not active)'));
            return true;
        } catch (e) {
            console.error('push: user subscription disable error:', e);
            return false;
        }
    }

    async function updatePreferences(filters) {
        if (!isSubscribed || !currentEndpoint) {
            console.warn('push: cannot update preferences - not subscribed');
            return false;
        }
        try {
            const response = await fetch('/push/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: currentEndpoint, filters }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            console.log('push: preferences updated on server');
            return true;
        } catch (e) {
            console.error('push: preferences update error:', e);
            return false;
        }
    }

    async function init() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('push: notifications not supported by this browser');
            return false;
        }
        try {
            vapidPublicKey = (await (await fetch('/push/vapidPublicKey'))?.json())?.publicKey;
            serviceWorker = await navigator.serviceWorker.register('/static/js/mainview-worker.js');
            const subscription = await serviceWorker.pushManager.getSubscription();
            isSubscribed = Boolean(subscription);
            currentEndpoint = subscription?.endpoint || null;
            console.log(`push: initialised with service-worker (isSubscribed=${isSubscribed}):`, serviceWorker);
            return true;
        } catch (e) {
            console.error('push: error initialising:', e);
            return false;
        }
    }

    return {
        init,
        subscribe,
        unsubscribe,
        updatePreferences,
        isSubscribed: () => isSubscribed,
    };
})();

async function notificationsInit() {
    await weatherPushNotifications.init();
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
