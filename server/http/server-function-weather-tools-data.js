// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

class RecentData {
    constructor(data_previous, timestamp, hoursBack) {
        this.timestamp = timestamp;
        this.hoursBack = hoursBack;
        this.cutoffTime = timestamp - hoursBack * 60 * 60 * 1000;
        this._entries = undefined;
        this._data_previous = data_previous;
    }
    get entries() {
        if (!this._entries) {
            this._entries = Object.entries(this._data_previous)
                .filter(([ts]) => Number.parseInt(ts) > this.cutoffTime)
                .sort(([a], [b]) => Number.parseInt(a) - Number.parseInt(b))
                .map(([ts, entry]) => ({ ...entry, _timestamp: Number.parseInt(ts) }));
        }
        return this._entries;
    }
    get length() {
        return this.entries.length;
    }
    min(field) {
        const values = this.entries.map((e) => e[field]).filter((v) => v !== undefined);
        return values.length > 0 ? Math.min(...values) : undefined;
    }
    max(field) {
        const values = this.entries.map((e) => e[field]).filter((v) => v !== undefined);
        return values.length > 0 ? Math.max(...values) : undefined;
    }
    avg(field) {
        const values = this.entries.map((e) => e[field]).filter((v) => v !== undefined);
        return values.length > 0 ? values.reduce((a, b) => a + b) / values.length : undefined;
    }
    any(predicate) {
        return this.entries.some((entry) => predicate(entry));
    }
    all(predicate) {
        return this.entries.every((entry) => predicate(entry));
    }
    oldest(field) {
        if (this.entries.length === 0) return undefined;
        return field ? this.entries[0][field] : this.entries[0];
    }
    newest(field) {
        if (this.entries.length === 0) return undefined;
        const lastEntry = this.entries[this.entries.length - 1];
        return field ? lastEntry[field] : lastEntry;
    }
    back(field, secondsAgo, toleranceSeconds = 300) {
        const targetTime = this.timestamp - secondsAgo * 1000,
            minTime = targetTime - toleranceSeconds * 1000,
            maxTime = targetTime + toleranceSeconds * 1000;
        const candidates = this.entries.filter((e) => e._timestamp >= minTime && e._timestamp <= maxTime);
        if (candidates.length === 0) return undefined;
        let [closest] = candidates,
            minDiff = Math.abs(closest._timestamp - targetTime);
        for (const entry of candidates) {
            const diff = Math.abs(entry._timestamp - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closest = entry;
            }
        }
        return field ? closest[field] : closest;
    }
    isReasonablyDistributed(options = {}) {
        const {
            minEntriesPerHour = 1,
            minCoverage = 0.7, // 70% of expected entries
            maxGapRatio = 0.2, // Max gap as ratio of total time range
            checkUniformity = true,
        } = options;
        if (this.entries.length === 0) return false;
        const expectedEntries = this.hoursBack * minEntriesPerHour;
        if (this.entries.length < expectedEntries * minCoverage) return false;
        // Check for large gaps (adaptive to time range)
        const totalTimeMs = this.hoursBack * 60 * 60 * 1000,
            maxGapMs = totalTimeMs * maxGapRatio;
        for (let i = 1; i < this.entries.length; i++) if (this.entries[i]._timestamp - this.entries[i - 1]._timestamp > maxGapMs) return false;
        // Check temporal coverage (first to last entry should cover most of range)
        if (this.entries.length > 1) if (this.entries[this.entries.length - 1]._timestamp - this.entries[0]._timestamp < totalTimeMs * 0.8) return false;
        // Optional: Check for uniform distribution
        if (checkUniformity && this.entries.length > 10) {
            // Divide into quarters and check each has some data
            const quarterMs = totalTimeMs / 4,
                now = this.timestamp;
            for (let q = 0; q < 4; q++) {
                const qStart = now - (q + 1) * quarterMs,
                    qEnd = now - q * quarterMs;
                const entriesInQuarter = this.entries.filter((e) => e._timestamp >= qStart && e._timestamp < qEnd).length;
                // Each quarter should have at least 15% of entries
                if (entriesInQuarter < this.entries.length * 0.15) return false;
            }
        }
        return true;
    }
    between(startSecondsAgo, endSecondsAgo) {
        const startTime = this.timestamp - startSecondsAgo * 1000,
            endTime = this.timestamp - endSecondsAgo * 1000;
        return this.entries.filter((e) => e._timestamp >= Math.min(startTime, endTime) && e._timestamp <= Math.max(startTime, endTime));
    }
    sum(field) {
        const values = this.entries.map((e) => e[field]).filter((v) => v !== undefined && v !== null);
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
    }
    count(predicate) {
        return predicate ? this.entries.filter(predicate).length : this.entries.length;
    }
    delta(field) {
        const first = this.oldest(field),
            last = this.newest(field);
        return first !== undefined && last !== undefined ? last - first : undefined;
    }
    rateOfChange(field) {
        if (this.entries.length < 2) return undefined;
        const d = this.delta(field);
        if (d === undefined) return undefined;
        const hours = (this.entries[this.entries.length - 1]._timestamp - this.entries[0]._timestamp) / (60 * 60 * 1000);
        return hours > 0 ? d / hours : undefined;
    }
    trend(field, threshold = 0.1) {
        const rate = this.rateOfChange(field);
        if (rate === undefined) return undefined;
        if (rate > threshold) return 'rising';
        if (rate < -threshold) return 'falling';
        return 'stable';
    }
}

function getRecentData(data_previous, timestamp, hoursBack) {
    return new RecentData(data_previous, timestamp, hoursBack);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    getRecentData,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
