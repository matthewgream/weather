
const weatherPushNotifications = (function () {
    let isSubscribed = false;
    let serviceWorker = null;
    let vapidPublicKey = null;
    let observerActive = false;

    async function init() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('push: notifications not supported by this browser');
            return false;
        }
        try {
            const response = await fetch('/push/vapidPublicKey');
            const keyData = await response.json();
            vapidPublicKey = keyData.publicKey;
            serviceWorker = await navigator.serviceWorker.register('/static/js/service-worker.js');
            const subscription = await serviceWorker.pushManager.getSubscription();
            isSubscribed = subscription !== null;
			pushToggleListener();
			console.log('push: initialised with service-worker:', serviceWorker);
            return true;
        } catch (error) {
            console.error('push: error initialising:', error);
            return false;
        }
    }

    function pushToggleListener() {
        if (observerActive) return;
        const observer = new MutationObserver((mutations) =>
            mutations
                .filter((mutation) => mutation.type === 'childList')
                .forEach((mutation) => document.querySelectorAll('.mode-switch')?.forEach(pushToggleSetup))
        );
        const dashboard = document.getElementById('weather-dashboard');
        if (dashboard) {
            observer.observe(dashboard, { childList: true, subtree: true });
            observerActive = true;
            document.querySelectorAll('.mode-switch').forEach(pushToggleSetup);
        }
    }
    function pushToggleSetup(element) {
        if (element.querySelector('.alerts-toggle')) return;
        const toggle = document.createElement('a');
        toggle.className = 'alerts-toggle';
        pushToggleUpdate(toggle);
        toggle.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (isSubscribed) await unsubscribe();
            else await subscribe();
            document.querySelectorAll('.alerts-toggle').forEach(pushToggleUpdate);
        });
        element.appendChild(toggle);
    }
    function pushToggleUpdate(element) {
        if (!element) return;
        if (Notification.permission === 'denied') {
            element.textContent = '[alerts blocked]';
            element.style.color = '#999';
            return;
        }
        element.textContent = isSubscribed ? '[alerts are on]' : '[alerts are off]';
        element.style.color = isSubscribed ? 'var(--primary-color)' : '#666';
    }

    function __urlBase64ToUint8Array(base64String) {
        const rawData = window.atob((base64String + '='.repeat((4 - (base64String.length % 4)) % 4)).replace(/\-/g, '+').replace(/_/g, '/'));
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
        return outputArray;
    }

    async function subscribe() {
        try {
            const subscription = await serviceWorker.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: __urlBase64ToUint8Array(vapidPublicKey)
            });
            await fetch('/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(subscription),
            });
            isSubscribed = true;
            document.querySelectorAll('.push-toggle').forEach(pushToggleUpdate);
            console.log('push: user subscription enabled:', subscription);
            return true;
        } catch (error) {
            console.error('push: user subscription failed:', error);
            return false;
        }
    }
    async function unsubscribe() {
        try {
            const subscription = await serviceWorker.pushManager.getSubscription();
            if (!subscription) {
                isSubscribed = false;
                document.querySelectorAll('.push-toggle').forEach(pushToggleUpdate);
                console.log('push: user subscripotion not found (for unsubscribe)');
                return true;
            }
            const endpoint = subscription.endpoint;
            await subscription.unsubscribe();
            await fetch('/push/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ endpoint }),
            });
            isSubscribed = false;
            document.querySelectorAll('.push-toggle').forEach(pushToggleUpdate);
            console.log('push: user subscription disabled');
            return true;
        } catch (error) {
            console.error('push: error unsubscribing', error);
            return false;
        }
    }

    return {
        init,
        isSubscribed: () => isSubscribed,
        subscribe,
        unsubscribe,
    };
})();

document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        weatherPushNotifications.init();
    }, 1000);
});
