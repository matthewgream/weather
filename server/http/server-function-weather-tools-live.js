// -----------------------------------------------------------------------------------------------------------------------------------------
// Weather Tools - Live Data Fetching and Scheduling Utilities
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// Common patterns extracted from data-fetching modules:
//   - DataSlot: manages a single data source with staleness tracking
//   - DataScheduler: manages dynamic interval scheduling
//   - fetchJson: HTTP fetch with error handling
//   - createTimestampTracker: tracks which timestamps have been shown
//
// -----------------------------------------------------------------------------------------------------------------------------------------

const { FormatHelper } = require('./server-function-weather-tools-format.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// Usage:
//   const kpSlot = new DataSlot('kpIndex', STALENESS.kpIndex);
//
//   // In fetch function:
//   return kpSlot.fetch(state, 'heliophysics', async () => {
//       const data = await fetchJson(ENDPOINTS.kpIndex1m);
//       return { current: data.kp, ... };  // processed data (without _fetched)
//   });
//
//   // In getter:
//   return kpSlot.get(state);
//
// -----------------------------------------------------------------------------------------------------------------------------------------

class DataSlot {
    constructor(name, staleness) {
        this.name = name;
        this.staleness = staleness;
    }
    _init(state) {
        if (!state[this.name]) state[this.name] = { data: undefined, lastUpdate: 0, lastError: undefined };
        return state[this.name];
    }
    isStale(state) {
        return !state[this.name]?.lastUpdate || Date.now() - state[this.name].lastUpdate > this.staleness;
    }
    isValid(state) {
        return state[this.name]?.data && !this.isStale(state);
    }
    get(state) {
        return this.isValid(state) ? state[this.name].data : undefined;
    }
    getSlot(state) {
        return state[this.name];
    }
    getLastError(state) {
        return state[this.name]?.lastError;
    }
    async fetch(state, moduleName, fetcher, successInfo) {
        const slot = this._init(state);
        try {
            const result = await fetcher();
            const _fetched = Date.now();
            slot.data = { _fetched, ...result };
            slot.lastUpdate = _fetched;
            slot.lastError = undefined;
            const info = successInfo ? ` (${successInfo})` : '';
            console.error(`${moduleName}: update ${this.name} success${info}`);
            return slot.data;
        } catch (e) {
            slot.lastError = e.message;
            console.error(`${moduleName}: update ${this.name} failure:`, e.message);
            return undefined;
        }
    }
    async fetchIfStale(state, moduleName, fetcher, successInfo) {
        if (!this.isStale(state)) return this.get(state);
        return this.fetch(state, moduleName, fetcher, successInfo);
    }
    clear(state) {
        if (state[this.name]) {
            state[this.name].data = undefined;
            state[this.name].lastUpdate = 0;
            state[this.name].lastError = undefined;
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// Usage:
//   const scheduler = new DataScheduler('heliophysics');
//
//   function updateSchedule(state, situation) {
//       scheduler.run(
//           () => updateAll(state, situation),
//           () => calculateInterval(state, situation)
//       );
//   }
//
// -----------------------------------------------------------------------------------------------------------------------------------------

class DataScheduler {
    constructor(moduleName) {
        this.moduleName = moduleName;
        this.intervalId = undefined;
        this.currentInterval = undefined;
    }
    run(updateFn, intervalCalculator) {
        Promise.resolve(updateFn()).then(() => {
            const [interval, reason] = intervalCalculator();
            if (this.currentInterval !== interval) {
                if (this.intervalId) clearInterval(this.intervalId);
                this.currentInterval = interval;
                this.intervalId = setInterval(() => this.run(updateFn, intervalCalculator), interval);
                console.error(`${this.moduleName}: interval set to ${FormatHelper.millisToString(interval)} ('${reason}')`);
            }
        });
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            this.currentInterval = undefined;
        }
    }
    isRunning() {
        return this.intervalId !== undefined;
    }
    getCurrentInterval() {
        return this.currentInterval;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function fetchText(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// Usage:
//   const ts = createTimestampTracker(now, timezone);
//   results.phenomena.push(`space: ${ts.get('kp', kpData._fetched)}storm active`);
//   // First use of 'kp' shows: "space: [14:32] storm active"
//   // Subsequent uses show: "space: storm active"
//
// -----------------------------------------------------------------------------------------------------------------------------------------

function createTimestampTracker(now, timezone) {
    const shown = new Set();
    return {
        get(source, fetched) {
            if (shown.has(source) || !fetched) return '';
            shown.add(source);
            return FormatHelper.timestampBracket(fetched, now, timezone) + ' ';
        },
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isCacheValid(lastUpdate, maxAge) {
    return lastUpdate && Date.now() - lastUpdate < maxAge;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    DataSlot,
    DataScheduler,
    fetchJson,
    fetchText,
    createTimestampTracker,
    isCacheValid,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
