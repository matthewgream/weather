/* eslint-disable unicorn/no-keyword-prefix */
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const { constants } = require('./server-function-weather-helpers.js');

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
    for (const [eventId, event] of Object.entries(store.events[category])) if (now <= event.expires) active.push({ id: eventId, ...event });
    return active;
}

// Note: marks events as shown (mutates store) - intentional for "show once" semantics
function newEvents(store) {
    if (!store.events) return {};
    const now = Date.now(),
        active = {};
    for (const category of Object.keys(store.events))
        for (const [eventId, event] of Object.entries(store.events[category]))
            if (!event.shown && now <= event.expires) {
                if (!active[category]) active[category] = [];
                active[category].push({ id: eventId, ...event });
                event.shown = true;
            }
    return active;
}

// Returns true if event can be triggered (no recent event or cooldown expired)
function canTrigger(store, category, eventId, cooldownDays = 365) {
    if (!store.events || !store.events[category] || !store.events[category][eventId]) return true;
    const now = Date.now(),
        event = store.events[category][eventId];
    return now > event.detected + cooldownDays * constants.MILLISECONDS_PER_DAY;
}

function pruneEvents(store, daysAgo = 30) {
    const now = Date.now();
    const CLEANUP_INTERVAL = 60 * 60 * 1000;
    if (!store.events || store.eventsCleanedUp > now - CLEANUP_INTERVAL) return;
    const expiry = now - daysAgo * constants.MILLISECONDS_PER_DAY;
    Object.entries(store.events).forEach(([category, events]) =>
        Object.entries(events)
            .filter(([_, event]) => event.expires < expiry)
            .forEach(([eventId]) => delete store.events[category][eventId])
    );
    store.eventsCleanedUp = now;
}

function hasEvent(store, category, eventId) {
    return Boolean(store.events && store.events[category] && store.events[category][eventId]);
}

function removeEvent(store, category, eventId) {
    if (store.events && store.events[category] && store.events[category][eventId]) {
        delete store.events[category][eventId];
        return true;
    }
    return false;
}

function countEvents(store) {
    if (!store.events) return 0;
    return Object.keys(store.events).reduce((count, category) => count + Object.keys(store.events[category]).length, 0);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    add: addEvent,
    get: getEvents,
    new: newEvents,
    has: hasEvent,
    remove: removeEvent,
    canTrigger,
    isCooldown: canTrigger, // deprecated alias - use canTrigger
    prune: pruneEvents,
    count: countEvents,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
