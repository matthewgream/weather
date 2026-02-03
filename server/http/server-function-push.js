// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

class PushNotificationManager {
    constructor(app, route, options = {}) {
        this.app = app;
        this.route = route;
        this.options = Object.assign(
            {
                vapidKeyFile: options.vapidKeyFile || 'vapid-keys.json',
                subscriptionsFile: options.subscriptionsFile || 'push-subscriptions.json',
                dataDir: options.dataDir || process.cwd(),
            },
            options
        );
        this.vapidKeys = this.loadOrGenerateVapidKeys();
        this.subscriptions = this.loadSubscriptions();
        this.notificationHistory = [];
        this.maxHistoryLength = options.maxHistoryLength || 20;
        this.filtersDefault = options.filtersDefault || { weather: true };
        webpush.setVapidDetails(`mailto:${this.options.contactEmail || 'example@example.com'}`, this.vapidKeys.publicKey, this.vapidKeys.privateKey);
        this.setupRoutes();
    }

    loadOrGenerateVapidKeys() {
        const keyPath = path.join(this.options.dataDir, this.options.vapidKeyFile);
        try {
            if (fs.existsSync(keyPath)) return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        } catch (e) {
            console.warn(`push: VAPID keys load error, generating new keys, error:`, e);
        }
        const keys = webpush.generateVAPIDKeys();
        try {
            fs.writeFileSync(keyPath, JSON.stringify(keys, undefined, 2));
            console.log(`push: VAPID keys generated and saved (${keyPath})`);
        } catch (e) {
            console.error(`push: VAPID keys save error:`, e);
        }
        return keys;
    }

    loadSubscriptions() {
        const subscriptionsPath = path.join(this.options.dataDir, this.options.subscriptionsFile);
        try {
            if (fs.existsSync(subscriptionsPath)) {
                const data = JSON.parse(fs.readFileSync(subscriptionsPath, 'utf8'));
                if (Array.isArray(data) && data.length > 0 && data[0].endpoint)
                    return data.map((subscription) => ({ subscription, filters: this.filtersDefault }));
                return data;
            }
        } catch (e) {
            console.warn(`push: subscription load error, starting with empty list, error:`, e);
        }
        return [];
    }

    saveSubscriptions() {
        const subscriptionsPath = path.join(this.options.dataDir, this.options.subscriptionsFile);
        try {
            fs.writeFileSync(subscriptionsPath, JSON.stringify(this.subscriptions, undefined, 2));
        } catch (e) {
            console.error(`push: subscription save error:`, e);
        }
    }

    setupRoutes() {
        this.app.use(require('express').json());

        this.app.get(`${this.route}/vapidPublicKey`, (req, res) => res.json({ publicKey: this.vapidKeys.publicKey }));

        this.app.post(`${this.route}/subscribe`, (req, res) => {
            const { subscription, filters } = req.body;
            const sub = subscription || req.body;
            if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription object' });
            const existingIndex = this.subscriptions.findIndex((s) => s.subscription?.endpoint === sub.endpoint || s.endpoint === sub.endpoint);
            if (existingIndex === -1) {
                this.subscriptions.push({ subscription: sub, filters: filters || this.filtersDefault });
                this.saveSubscriptions();
                console.log(`push: subscription inserted, size=${this.subscriptions.length}`);
            } else if (filters) {
                this.subscriptions[existingIndex].filters = filters;
                this.saveSubscriptions();
                console.log(`push: subscription filters updated: ${JSON.stringify(filters)}`);
            }
            return res.status(201).json({ success: true });
        });

        this.app.post(`${this.route}/preferences`, (req, res) => {
            const { endpoint, filters } = req.body;
            if (!endpoint || !filters) return res.status(400).json({ error: 'Invalid request: need endpoint and filters' });
            const existingIndex = this.subscriptions.findIndex((s) => s.subscription?.endpoint === endpoint);
            if (existingIndex === -1) return res.status(404).json({ error: 'Subscription not found' });
            this.subscriptions[existingIndex].filters = filters;
            this.saveSubscriptions();
            console.log(`push: subscription filters updated: ${JSON.stringify(filters)}`);
            return res.json({ success: true });
        });

        this.app.post(`${this.route}/unsubscribe`, (req, res) => {
            const { endpoint } = req.body;
            if (!endpoint) return res.status(400).json({ error: 'Invalid request' });
            const initialCount = this.subscriptions.length;
            this.subscriptions = this.subscriptions.filter((s) => s.subscription?.endpoint !== endpoint && s.endpoint !== endpoint);
            if (initialCount !== this.subscriptions.length) {
                this.saveSubscriptions();
                console.log(`push: subscription removed, size=${this.subscriptions.length}`);
            }
            return res.json({ success: true });
        });
    }

    async sendNotification(payload, options = {}) {
        const category = typeof payload === 'object' ? payload.category : undefined;
        console.log(
            `push: subscriptions notify request, title='${typeof payload === 'object' && payload.title ? payload.title : '-'}', body='${typeof payload === 'object' && payload.body ? payload.body : '-'}', category='${category || '-'}'`
        );
        const startTime = Date.now();
        const eligibleSubscriptions = this.subscriptions.filter((s) => !category || (s.filters || this.filtersDefault)[category] !== false);
        const promises = eligibleSubscriptions.map(async (s, index) => {
            const subscription = s.subscription || s;
            try {
                await webpush.sendNotification(subscription, typeof payload === 'string' ? payload : JSON.stringify(payload), options);
                return { success: true, index };
            } catch (e) {
                return { success: false, index, invalid: e.statusCode === 404 || e.statusCode === 410, endpoint: subscription.endpoint };
            }
        });
        const results = await Promise.all(promises);
        const invalidEndpoints = results.filter((r) => r.invalid).map((r) => r.endpoint);
        if (invalidEndpoints.length > 0) {
            this.subscriptions = this.subscriptions.filter((s) => !invalidEndpoints.includes(s.subscription?.endpoint));
            this.saveSubscriptions();
        }
        console.log(`push: subscriptions notify complete, eligible=${eligibleSubscriptions.length}, invalid=${invalidEndpoints.length}, size=${this.subscriptions.length}`);
        const endTime = Date.now();
        const stats = {
            timestamp: new Date().toISOString(),
            duration: endTime - startTime,
            total: this.subscriptions.length,
            eligible: eligibleSubscriptions.length,
            sent: eligibleSubscriptions.length - invalidEndpoints.length,
            failed: invalidEndpoints.length,
            category: category || 'all',
            type: typeof payload === 'object' && payload.title ? payload.title : 'Notification',
        };
        this.notificationHistory.unshift(stats);
        if (this.notificationHistory.length > this.maxHistoryLength) this.notificationHistory = this.notificationHistory.slice(0, this.maxHistoryLength);
        return stats;
    }

    async notify({ title, message: body, category }) {
        const payload = {
            title: 'Weather Notification' + (title ? `: ${title}` : ''),
            body,
            category,
            timestamp: new Date().toISOString(),
        };
        const options = {
            TTL: 5 * 60, // seconds
            topic: category,
        };
        return this.sendNotification(payload, options);
    }

    getDiagnostics() {
        return {
            subscriptions: {
                count: this.subscriptions.length,
                lastUpdated: fs.existsSync(path.join(this.options.dataDir, this.options.subscriptionsFile)) ? fs.statSync(path.join(this.options.dataDir, this.options.subscriptionsFile)).mtime.toISOString() : undefined,
            },
            vapidKeys: {
                exists: Boolean(this.vapidKeys),
                lastUpdated: fs.existsSync(path.join(this.options.dataDir, this.options.vapidKeyFile)) ? fs.statSync(path.join(this.options.dataDir, this.options.vapidKeyFile)).mtime.toISOString() : undefined,
            },
            status: {
                enabled: true,
                route: this.route,
            },
            history: this.notificationHistory,
            performance: {
                averageSendTime: this.notificationHistory.length > 0 ? this.notificationHistory.reduce((sum, item) => sum + item.duration, 0) / this.notificationHistory.length : 0,
            },
        };
    }
}

module.exports = function (app, route, options) {
    return new PushNotificationManager(app, route, options);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
