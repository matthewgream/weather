// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// eslint-disable-next-line unicorn/no-static-only-class
class StatisticalAlgorithms {
    static _filter(object, keys) {
        return keys?.length ? Object.fromEntries(Object.entries(object).filter(([key]) => keys.includes(key))) : object;
    }

    static basicStatistics(data, options = {}) {
        if (data.length === 0) return { count: 0 };
        const min = data.reduce((a, b) => Math.min(a, b));
        const max = data.reduce((a, b) => Math.max(a, b));
        const sum = data.reduce((a, b) => a + b, 0);
        const avg = sum / data.length;
        const variance = data.length > 1 ? data.reduce((sum, r) => sum + (r - avg) ** 2, 0) / (data.length - 1) : 0;
        const result = {
            count: data.length,
            sum,
            avg,
            min,
            max,
            range: max - min,
            current: data[data.length - 1],
            variance,
            stdDev: Math.sqrt(variance),
            median: this.percentile(data, 50),
        };
        if (!options || !options.filter) return result;
        return this._filter(result, Array.isArray(options) ? options : options.filter);
    }

    static linearRegression(data, xField = 'timestamp', yField = 'value') {
        if (data.length < 2) return { slope: 0, intercept: 0, r2: 0 };
        const points = data.map((d) => ({ x: d[xField] - data[0][xField], y: d[yField] }));
        const n = points.length;
        const sumX = points.reduce((sum, p) => sum + p.x, 0);
        const sumY = points.reduce((sum, p) => sum + p.y, 0);
        const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
        const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);
        const sumY2 = points.reduce((sum, p) => sum + p.y * p.y, 0);
        const denominator = n * sumX2 - sumX * sumX;
        if (Math.abs(denominator) < 1e-10) return { slope: 0, intercept: sumY / n, r2: 0, predictions: [] };
        if (Math.abs(denominator) < 0.0001) return { slope: 0, intercept: sumY / n, r2: 0 };
        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;
        const yAvg = sumY / n;
        const ssTotal = points.reduce((sum, p) => sum + (p.y - yAvg) ** 2, 0);
        const ssResidual = points.reduce((sum, p) => sum + (p.y - (intercept + slope * p.x)) ** 2, 0);
        const r2 = ssTotal > 0 ? Math.max(0, 1 - ssResidual / ssTotal) : 0;
        const predictions = points.map((p) => ({ x: p.x, y: p.y, predicted: intercept + slope * p.x, residual: p.y - (intercept + slope * p.x) }));
        const r = (n * sumXY - sumX * sumY) / Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        return {
            slope,
            intercept,
            r2,
            r,
            predictions,
            rmse: Math.sqrt(ssResidual / n),
        };
    }

    static exponentialMovingAverage(data, alpha = 0.3, field = 'value') {
        if (data.length === 0) return [];
        let ema;
        return data.map((d, i) => {
            ema = i == 0 ? d[field] : alpha * d[field] + (1 - alpha) * ema;
            return { ...d, ema };
        });
    }

    static simpleMovingAverage(data, period = 5, field = 'value') {
        if (data.length === 0) return [];
        return data.map((d, i) => {
            if (i < period - 1) return { ...d, sma: undefined };
            const window = data.slice(i - period + 1, i + 1);
            const avg = window.reduce((sum, item) => sum + item[field], 0) / period;
            return { ...d, sma: avg };
        });
    }

    static weightedMovingAverage(data, weights = [1, 2, 3, 4, 5], field = 'value') {
        if (data.length === 0) return [];
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const period = weights.length;
        return data.map((d, i) => {
            if (i < period - 1) return { ...d, wma: undefined };
            const window = data.slice(i - period + 1, i + 1);
            const weightedSum = window.reduce((sum, item, idx) => sum + item[field] * weights[idx], 0);
            return { ...d, wma: weightedSum / totalWeight };
        });
    }

    static confidenceInterval(data, confidence = 0.95) {
        if (data.length === 0) return { count: 0 };
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const variance = data.length > 1 ? data.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (data.length - 1) : 0;
        const stdDev = Math.sqrt(variance);
        const stdError = stdDev / Math.sqrt(data.length);
        const zScores = { 0.9: 1.645, 0.95: 1.96, 0.99: 2.576 };
        const zScore = zScores[confidence] || 1.96;
        const marginOfError = zScore * stdError;
        return {
            count: data.length,
            avg,
            min: data.reduce((a, b) => Math.min(a, b)),
            max: data.reduce((a, b) => Math.max(a, b)),
            current: data[data.length - 1],
            lower: avg - marginOfError,
            upper: avg + marginOfError,
            stdDev,
            stdError,
            marginOfError,
            confidence,
        };
    }

    static percentile(data, percentile) {
        if (data.length === 0) return 0;
        if (percentile <= 0) return data.reduce((a, b) => Math.min(a, b));
        if (percentile >= 100) return data.reduce((a, b) => Math.max(a, b));
        const sorted = [...data].sort((a, b) => a - b);
        const index = (percentile / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        if (lower === upper) return sorted[lower];
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }

    static movingStandardDeviation(data, period = 5, field = 'value') {
        if (data.length === 0) return [];
        return data.map((d, i) => {
            if (i < period - 1) return { ...d, movingStdDev: undefined };
            const window = data.slice(i - period + 1, i + 1).map((item) => item[field]);
            const avg = window.reduce((sum, val) => sum + val, 0) / period;
            const variance = window.reduce((sum, val) => sum + (val - avg) ** 2, 0) / period;
            return { ...d, movingStdDev: Math.sqrt(variance) };
        });
    }

    static detectOutliers(data, multiplier = 1.5) {
        if (data.length === 0) return { outliers: [], normal: [] };
        const q1 = this.percentile(data, 25);
        const q3 = this.percentile(data, 75);
        const iqr = q3 - q1;
        const lowerBound = q1 - multiplier * iqr;
        const upperBound = q3 + multiplier * iqr;
        const outliers = [];
        const normal = [];
        data.forEach((value, index) => {
            if (value < lowerBound || value > upperBound) outliers.push({ value, index });
            else normal.push({ value, index });
        });
        return { outliers, normal, lowerBound, upperBound };
    }

    static autocorrelation(data, lag = 1, field = 'value') {
        if (data.length <= lag) return 0;
        const values = data.map((d) => d[field] || d);
        const n = values.length;
        const avg = values.reduce((a, b) => a + b, 0) / n;
        let numerator = 0;
        let denominator = 0;
        for (let i = 0; i < n - lag; i++) numerator += (values[i] - avg) * (values[i + lag] - avg);
        for (let i = 0; i < n; i++) denominator += (values[i] - avg) ** 2;
        return denominator === 0 ? 0 : numerator / denominator;
    }

    static histogram(data, bins = 10) {
        if (data.length === 0) return [];
        const min = data.reduce((a, b) => Math.min(a, b));
        const max = data.reduce((a, b) => Math.max(a, b));
        const binWidth = (max - min) / bins;
        const histogram = Array.from({ length: bins }, (_, i) => ({
            min: min + i * binWidth,
            max: min + (i + 1) * binWidth,
            count: 0,
            percentage: 0,
        }));
        for (const value of data) histogram[Math.min(Math.floor((value - min) / binWidth), bins - 1)].count++;
        for (const bin of histogram) bin.percentage = (bin.count / data.length) * 100;
        return histogram;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// eslint-disable-next-line unicorn/no-static-only-class
class StatisticalAlgorithmsHelper {
    static exponentialMovingAverageFinal(data, alpha = 0.3, field = 'value') {
        const result = StatisticalAlgorithms.exponentialMovingAverage(data, alpha, field);
        return result?.length > 0 ? result[result.length - 1].ema : undefined;
    }

    static linearRegressionWithFallback(data, xField, yField, criteria) {
        if (!data?.length) return undefined;
        // eslint-disable-next-line prefer-destructuring
        const first = data[0],
            final = data[data.length - 1];
        let start = first[yField],
            end = final[yField],
            slope,
            r2;
        if (data.length >= (criteria.minSamples || 3)) {
            const regression = StatisticalAlgorithms.linearRegression(data, xField, yField);
            if (regression.r2 > (criteria.minR2 || 0.5)) {
                start = regression.intercept;
                end = regression.intercept + regression.slope * (final[xField] - first[xField]);
                // eslint-disable-next-line prefer-destructuring
                slope = regression.slope;
                // eslint-disable-next-line prefer-destructuring
                r2 = regression.r2;
            }
        }
        return { start, end, slope, r2 };
    }

    static fitModel(data, xField, yField) {
        // Fit rate(T) = a + b*T using linear regression
        // For heat: expect b <= 0 (rate decreases as T increases)
        // For loss: expect b >= 0 (rate increases as T increases)
        if (data.length < 2) return { valid: false, reason: 'insufficient-points', points: data.length };

        const regression = StatisticalAlgorithms.linearRegression(data, xField, yField);
        // Regression normalises x to start at 0, so adjust:
        // rate = intercept + slope * (T - T0)
        // rate = (intercept - slope * T0) + slope * T
        // So: a = intercept - slope * T0, b = slope
        const x = data[0][xField];
        const a = regression.intercept - regression.slope * x;
        const b = regression.slope;

        return {
            valid: true,
            a,
            b,
            r2: regression.r2,
            length: data.length,
            range: {
                min: data.map((p) => p[xField]).reduce((a, b) => Math.min(a, b)),
                max: data.map((p) => p[xField]).reduce((a, b) => Math.max(a, b)),
            },
        };
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// eslint-disable-next-line unicorn/no-static-only-class
class MathematicalAlgorithms {
    static integrateTime(model, from, to) {
        // rate(T) = a + b*T
        // time = ∫ dT / rate(T) from 'from' to 'to'
        const { a, b } = model;
        const lower = Math.min(from, to);
        const upper = Math.max(from, to);

        // Check rates are positive throughout range
        const rateLower = a + b * lower;
        const rateUpper = a + b * upper;
        if (rateLower <= 0 || rateUpper <= 0) return Infinity;

        // Near-constant rate: time = ΔT / rate
        if (Math.abs(b) < 1e-6) return (upper - lower) / a;

        // ∫ dT / (a + b*T) = (1/b) * ln(a + b*T)
        // Evaluated from lower to upper:
        // = (1/b) * [ln(a + b*upper) - ln(a + b*lower)]
        // = (1/b) * ln((a + b*upper) / (a + b*lower))
        return Math.abs((1 / b) * Math.log(rateUpper / rateLower));
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// eslint-disable-next-line unicorn/no-static-only-class
class TimeSeriesHelper {
    static aggregateObjects(data, fieldTimestamp = 'timestamp') {
        if (!data?.length) return { count: 0, data: {} };
        data.sort((a, b) => a[fieldTimestamp] - b[fieldTimestamp]);
        const numericFields = [],
            arrayFields = {};
        for (const entry of data)
            for (const [field, value] of Object.entries(entry)) {
                if (field === fieldTimestamp) continue;
                if (typeof value === 'number') {
                    numericFields.push(field);
                    if (!arrayFields[field]) arrayFields[field] = [];
                    arrayFields[field].push(value);
                }
            }
        return {
            count: data.length,
            timeStart: data[0].timestamp,
            timeEnd: data[data.length - 1].timestamp,
            data: Object.fromEntries(numericFields.filter((field) => arrayFields[field]?.length > 0).map((field) => [field, StatisticalAlgorithms.basicStatistics(arrayFields[field])])),
        };
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// eslint-disable-next-line unicorn/no-static-only-class
class PeriodHelper {
    static parse(duration) {
        if (!duration || typeof duration !== 'string') return undefined;
        // eslint-disable-next-line sonarjs/regex-complexity
        const match = duration.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
        if (!match) return undefined;
        return {
            years: Number.parseInt(match[1] || 0),
            months: Number.parseInt(match[2] || 0),
            days: Number.parseInt(match[3] || 0),
            hours: Number.parseInt(match[4] || 0),
            minutes: Number.parseInt(match[5] || 0),
            seconds: Number.parseFloat(match[6] || 0),
        };
    }

    static toMillis(duration) {
        const parsed = this.parse(duration);
        if (!parsed) return 0;
        return parsed.years * 365 * 24 * 60 * 60 * 1000 + parsed.months * 30 * 24 * 60 * 60 * 1000 + parsed.days * 24 * 60 * 60 * 1000 + parsed.hours * 60 * 60 * 1000 + parsed.minutes * 60 * 1000 + parsed.seconds * 1000;
    }

    static fromMillis(millis) {
        if (!millis || millis < 0) return 'PT0S';
        const days = Math.floor(millis / (24 * 60 * 60 * 1000));
        millis %= 24 * 60 * 60 * 1000;
        const hours = Math.floor(millis / (60 * 60 * 1000));
        millis %= 60 * 60 * 1000;
        const minutes = Math.floor(millis / (60 * 1000));
        millis %= 60 * 1000;
        const seconds = millis / 1000;
        let duration = 'P';
        if (days) duration += `${days}D`;
        const parts = [];
        if (hours) parts.push(`${hours}H`);
        if (minutes) parts.push(`${minutes}M`);
        if (seconds) parts.push(`${seconds}S`);
        if (parts.length > 0) duration += 'T' + parts.join('');
        else if (!days) duration += 'T0S';
        return duration;
    }

    static isWithin(timestamp, period) {
        return Date.now() - timestamp <= this.toMillis(period);
    }

    static getBucket(timestamp, bucketSize) {
        const bucketMillis = this.toMillis(bucketSize);
        return Math.floor(timestamp / bucketMillis) * bucketMillis;
    }

    static getBuckets(period, bucketSize) {
        const bucketMillis = this.toMillis(bucketSize);
        const now = Date.now();
        const buckets = [];
        for (let time = this.getBucket(now - this.toMillis(period), bucketSize); time <= now; time += bucketMillis) buckets.push(time);
        return buckets;
    }

    static add(duration1, duration2) {
        return this.fromMillis(this.toMillis(duration1) + this.toMillis(duration2));
    }

    static format(duration) {
        const parsed = this.parse(duration);
        if (!parsed) return 'invalid';
        const parts = [];
        if (parsed.years) parts.push(`${parsed.years}y`);
        if (parsed.months) parts.push(`${parsed.months}mo`);
        if (parsed.days) parts.push(`${parsed.days}d`);
        if (parsed.hours) parts.push(`${parsed.hours}h`);
        if (parsed.minutes) parts.push(`${parsed.minutes}m`);
        if (parsed.seconds) parts.push(`${parsed.seconds}s`);
        return parts.length > 0 ? parts.join(' ') : '0s';
    }
}

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
        return values.length > 0 ? values.reduce((a, b) => Math.min(a, b)) : undefined;
    }
    max(field) {
        const values = this.entries.map((e) => e[field]).filter((v) => v !== undefined);
        return values.length > 0 ? values.reduce((a, b) => Math.max(a, b)) : undefined;
    }
    minWithTime(field) {
        const validEntries = this.entries.filter((e) => e[field] !== undefined);
        if (validEntries.length === 0) return { value: undefined, time: undefined };
        let [minEntry] = validEntries;
        for (const entry of validEntries) if (entry[field] < minEntry[field]) minEntry = entry;
        return { value: minEntry[field], time: minEntry._timestamp };
    }
    maxWithTime(field) {
        const validEntries = this.entries.filter((e) => e[field] !== undefined);
        if (validEntries.length === 0) return { value: undefined, time: undefined };
        let [maxEntry] = validEntries;
        for (const entry of validEntries) if (entry[field] > maxEntry[field]) maxEntry = entry;
        return { value: maxEntry[field], time: maxEntry._timestamp };
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
        return predicate ? this.entries.filter((x) => predicate(x)).length : this.entries.length;
    }
    _estimatePeriod(period, predicate) {
        if (this.entries.length === 0) return 0;
        const buckets = new Set();
        for (const entry of this.entries) if (!predicate || predicate(entry)) buckets.add(Math.floor(entry._timestamp / period));
        return buckets.size;
    }
    estimateHours(predicate) {
        return this._estimatePeriod(60 * 60 * 1000, predicate);
    }
    estimateDays(predicate) {
        return this._estimatePeriod(24 * 60 * 60 * 1000, predicate);
    }
    _consecutivePeriodsFromRecent(period, predicate) {
        if (this.entries.length === 0) return 0;
        let currentBucket = Math.floor(this.timestamp / period);
        let currentMatches = 0;
        let count = 0;
        for (let i = this.entries.length - 1; i >= 0; i--) {
            const entryBucket = Math.floor(this.entries[i]._timestamp / period);
            if (entryBucket !== currentBucket) {
                if (currentMatches === 0) return count;
                count++;
                if (entryBucket < currentBucket - 1) return count;
                currentBucket = entryBucket;
                currentMatches = 0;
            }
            if (predicate(this.entries[i])) currentMatches++;
        }
        return currentMatches > 0 ? count + 1 : count;
    }
    consecutiveHoursFromRecent(predicate) {
        return this._consecutivePeriodsFromRecent(60 * 60 * 1000, predicate);
    }
    consecutiveDaysFromRecent(predicate) {
        return this._consecutivePeriodsFromRecent(24 * 60 * 60 * 1000, predicate);
    }
    timeSpanMs(predicate) {
        const matching = predicate ? this.entries.filter((x) => predicate(x)) : this.entries;
        if (matching.length < 2) return 0;
        return matching[matching.length - 1]._timestamp - matching[0]._timestamp;
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

class WeatherData {
    // Standard periods: key -> { hours, recomputeMs }
    // recomputeMs: 0 = always fresh, >0 = cache for this duration
    static PERIODS = {
        '1h': { hours: 1, recomputeMs: 0 },
        '3h': { hours: 3, recomputeMs: 0 },
        '6h': { hours: 6, recomputeMs: 0 },
        '12h': { hours: 12, recomputeMs: 15 * 60 * 1000 }, // 15 minutes
        '24h': { hours: 24, recomputeMs: 30 * 60 * 1000 }, // 30 minutes
        '3d': { hours: 3 * 24, recomputeMs: 60 * 60 * 1000 }, // 1 hour
        '7d': { hours: 7 * 24, recomputeMs: 60 * 60 * 1000 }, // 1 hour
        '14d': { hours: 14 * 24, recomputeMs: 60 * 60 * 1000 }, // 1 hour
        '28d': { hours: 28 * 24, recomputeMs: 60 * 60 * 1000 }, // 1 hour
    };
    constructor(initialData = {}) {
        this._raw = { ...initialData };
        this._periods = {};
        this._lastPrepared = {};
        this._timestamp = 0;
    }
    add(timestamp, data) {
        this._raw[timestamp] = data;
    }
    prepare(timestamp) {
        this._timestamp = timestamp;
        const now = Date.now();

        for (const [key, config] of Object.entries(WeatherData.PERIODS)) {
            const lastPrepared = this._lastPrepared[key] || 0;
            const isStale = config.recomputeMs === 0 || now - lastPrepared > config.recomputeMs;

            if (isStale) {
                this._periods[key] = new RecentData(this._raw, timestamp, config.hours);
                this._lastPrepared[key] = now;
            }
        }
    }
    getPeriod(key) {
        return this._periods[key];
    }
    getPeriodKeys() {
        return Object.keys(WeatherData.PERIODS);
    }
    getPeriodHours(key) {
        return WeatherData.PERIODS[key]?.hours;
    }
    prune(maxAgeMs) {
        const cutoff = Date.now() - maxAgeMs;
        const before = Object.keys(this._raw).length;
        for (const ts of Object.keys(this._raw)) {
            if (Number.parseInt(ts) < cutoff) {
                delete this._raw[ts];
            }
        }
        return before - Object.keys(this._raw).length;
    }
    get raw() {
        return this._raw;
    }
    get timestamp() {
        return this._timestamp;
    }
    get size() {
        return Object.keys(this._raw).length;
    }
    static fromRaw(rawData) {
        return new WeatherData(rawData || {});
    }
    toJSON() {
        return this._raw;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    StatisticalAlgorithms,
    StatisticalAlgorithmsHelper,
    MathematicalAlgorithms,
    TimeSeriesHelper,
    PeriodHelper,
    RecentData,
    WeatherData,
    getRecentData,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
