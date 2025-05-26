function __urlBase64ToUint8Array(base64String) {
    const rawData = window.atob((base64String + '='.repeat((4 - (base64String.length % 4)) % 4)).replaceAll('-', '+').replaceAll('_', '/'));
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.codePointAt(i);
    return outputArray;
}

const weatherPushNotifications = (function () {
    let vapidPublicKey;
    let serviceWorker;
    let isSubscribed = false;
    let isObserved = false;

    async function init() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('push: notifications not supported by this browser');
            return false;
        }
        try {
            vapidPublicKey = (await (await fetch('/push/vapidPublicKey'))?.json())?.publicKey;
            serviceWorker = await navigator.serviceWorker.register('/static/js/mainview-worker.js');
            isSubscribed = !!(await serviceWorker.pushManager.getSubscription());
            pushToggleListen();
            console.log(`push: initialised with service-worker (isSubscribed=${isSubscribed}):`, serviceWorker);
            return true;
        } catch (e) {
            console.error('push: error initialising:', e);
            return false;
        }
    }

    function pushToggleListen() {
        if (isObserved) return;
        const observer = new MutationObserver((mutations) => {
            if (mutations.some((mutation) => mutation.type === 'childList')) pushToggleSetup();
        });
        const element = document.querySelector('#weather-dashboard');
        if (element) {
            observer.observe(element, { childList: true, subtree: true });
            isObserved = true;
            pushToggleSetup();
        }
    }
    function __pushToggleSet(element) {
        if (Notification.permission === 'denied') {
            element.textContent = '[alerts blocked]';
            element.style.color = '#999';
        } else {
            element.textContent = isSubscribed ? '[alerts are on]' : '[alerts are off]';
            element.style.color = isSubscribed ? 'var(--primary-color)' : '#666';
        }
    }
    function pushToggleSetup() {
        document.querySelectorAll('.alerts-switch').forEach((element) => {
            if (!element.querySelector('.alerts-toggle')) {
                const toggle = document.createElement('a');
                toggle.setAttribute('class', 'alerts-toggle');
                __pushToggleSet(toggle);
                toggle.addEventListener('click', async function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    await (isSubscribed ? unsubscribe() : subscribe());
                    pushToggleUpdate();
                });
                element.innerHTML = '';
                element.append(toggle);
            }
        });
    }
    function pushToggleUpdate() {
        document.querySelectorAll('.alerts-toggle').forEach((element) => element && __pushToggleSet(element));
    }

    async function subscribe() {
        try {
            const subscription = await serviceWorker.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: __urlBase64ToUint8Array(vapidPublicKey),
            });
            await fetch('/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(subscription),
            });
            isSubscribed = true;
            pushToggleUpdate();
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
                const endpoint = subscription.endpoint;
                await subscription.unsubscribe();
                await fetch('/push/unsubscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ endpoint }),
                });
            }
            isSubscribed = false;
            pushToggleUpdate();
            console.log('push: user subscription disable success' + (subscription ? '' : ' (was not active)'));
            return true;
        } catch (e) {
            console.error('push: user subscription disable error:', e);
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
