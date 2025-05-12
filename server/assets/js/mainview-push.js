const weatherPushNotifications = (function () {
    let isSubscribed = false;
    let swRegistration = null;
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
            swRegistration = await navigator.serviceWorker.register('/static/js/service-worker.js');
            console.log('push: service-worker registered:', swRegistration);
            const subscription = await swRegistration.pushManager.getSubscription();
            isSubscribed = subscription !== null;
            setupDomObserver();
            return true;
        } catch (error) {
            console.error('push: error initializing:', error);
            return false;
        }
    }

    function setupDomObserver() {
        if (observerActive) return;
        const observer = new MutationObserver((mutations) =>
            mutations
                .filter((mutation) => mutation.type === 'childList')
                .forEach((mutation) => document.querySelectorAll('.mode-switch')?.forEach(enhanceModeSwitchElement))
        );
        const dashboard = document.getElementById('weather-dashboard');
        if (dashboard) {
            observer.observe(dashboard, { childList: true, subtree: true });
            observerActive = true;
            const modeSwitchElements = document.querySelectorAll('.mode-switch');
            modeSwitchElements.forEach(enhanceModeSwitchElement);
        }
    }

    function enhanceModeSwitchElement(modeSwitchElement) {
        if (modeSwitchElement.querySelector('.alerts-toggle')) return;
        const alertsToggle = document.createElement('a');
        alertsToggle.className = 'alerts-toggle';
        alertsToggle.style.marginLeft = '10px';
        alertsToggle.style.cursor = 'pointer';
        updateAlertToggleState(alertsToggle);
        alertsToggle.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (isSubscribed) await unsubscribeUser();
            else await subscribeUser();
            document.querySelectorAll('.alerts-toggle').forEach(updateAlertToggleState);
        });
        modeSwitchElement.appendChild(alertsToggle);
    }

    function updateAlertToggleState(element) {
        if (!element) return;
        if (Notification.permission === 'denied') {
            element.textContent = '[alerts blocked]';
            element.style.color = '#999';
            return;
        }
        element.textContent = isSubscribed ? '[alerts are on]' : '[alerts are off]';
        element.style.color = isSubscribed ? 'var(--primary-color)' : '#666';
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
        return outputArray;
    }

    async function subscribeUser() {
        try {
            const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
            const subscription = await swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey,
            });
            console.log('push: user subscription enabled:', subscription);
            await fetch('/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(subscription),
            });
            isSubscribed = true;
            document.querySelectorAll('.alerts-toggle').forEach(updateAlertToggleState);
            return true;
        } catch (error) {
            console.error('push: user subscription failed:', error);
            return false;
        }
    }

    async function unsubscribeUser() {
        try {
            const subscription = await swRegistration.pushManager.getSubscription();
            if (!subscription) {
                console.log('push: user subscripotion not found (for unsubscribe)');
                isSubscribed = false;
                document.querySelectorAll('.alerts-toggle').forEach(updateAlertToggleState);
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
            document.querySelectorAll('.alerts-toggle').forEach(updateAlertToggleState);
            console.log('push: user subscription disabled');
            return true;
        } catch (error) {
            console.error('push: error unsubscribing', error);
            return false;
        }
    }
    return {
        init: init,
        isSubscribed: () => isSubscribed,
        subscribe: subscribeUser,
        unsubscribe: unsubscribeUser,
    };
})();

document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        weatherPushNotifications.init();
    }, 1000);
});
