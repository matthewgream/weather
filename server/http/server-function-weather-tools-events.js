// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function addEvent(store, category, eventId, message, durationHours = 24) {
    if (!store.events) {
        store.events = {};
        store.eventsCleanedUp = Date.now();
    }
    if (!store.events[category]) store.events[category] = {};
    const now = Date.now(),
        event = store.events[category][eventId];
    if (!event || now > event.expires) {
        store.events[category][eventId] = {
            message,
            detected: now,
            expires: now + durationHours * 60 * 60 * 1000,
            shown: false,
        };
        return true;
    }
    return false;
}

function getEvents(store, category) {
    if (!store.events || !store.events[category]) return [];
    const now = Date.now(),
        active = [];
    for (const [eventId, event] of Object.entries(store.events[category]))
        if (now <= event.expires) {
            active.push({
                id: eventId,
                ...event,
                isNew: !event.shown,
            });
            event.shown = true;
        }
    return active;
}

function isEventCooldown(store, category, eventId, cooldownDays = 365) {
    if (!store.events || !store.events[category] || !store.events[category][eventId]) return true;
    const now = Date.now(),
        event = store.events[category][eventId];
    return now > event.detected + cooldownDays * helpers.constants.MILLISECONDS_PER_DAY;
}

function pruneEvents(store, daysAgo = 30) {
    const now = Date.now();
    const CLEANUP_INTERVAL = 60 * 60 * 1000;
    if (!store.events || store.eventsCleanedUp > now - CLEANUP_INTERVAL) return;
    const expiry = now - daysAgo * helpers.constants.MILLISECONDS_PER_DAY;
    Object.entries(store.events).forEach(([category, events]) => {
        Object.entries(events)
            .filter(([_, event]) => event.expires < expiry)
            .forEach(([eventId]) => delete store.events[category][eventId]);
    });
    store.eventsCleanedUp = now;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    addEvent,
    getEvents,
    isEventCooldown,
    pruneEvents,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
