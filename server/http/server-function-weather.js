// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const helpers = require('./server-function-weather-helpers.js');
const { FormatHelper } = require('./server-function-weather-tools-format.js');
const toolsCalculators = require('./server-function-weather-tools-calculators.js');
const toolsEvents = require('./server-function-weather-tools-events.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');
const { WeatherData } = require('./server-function-weather-tools-data.js');

function mergeObjects(defaults, provided) {
    const result = structuredClone(defaults);
    for (const key of Object.keys(provided)) result[key] = provided[key] && typeof provided[key] === 'object' && !Array.isArray(provided[key]) ? mergeObjects(result[key] ?? {}, provided[key]) : provided[key];
    return result;
}
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const DEFAULT_OPTIONS = {
    data: {
        gateInterval: 5 * helpers.constants.MILLISECONDS_PER_SECOND, // 5 seconds - minimum time between cache updates
    },
    storage: {
        pruneInterval: 5 * helpers.constants.MILLISECONDS_PER_MINUTE, // 5 minutes
        evictionTimeDuration: 31 * helpers.constants.MILLISECONDS_PER_DAY, // 31 days
        evictionSizeThreshold: 0.8, // evict when cache is 80% of max size
        evictionSizePercent: 0.2, // evict 20% of cache
        maxCacheSize: 10 * 1024 * 1024, // 10MB default
        statsInterval: 15 * helpers.constants.MILLISECONDS_PER_MINUTE, // 15 minutes
        persistence: [
            {
                type: 'shm',
                enabled: true,
                path: '/dev/shm/persist/weather-storage.json',
                interval: 5 * helpers.constants.MILLISECONDS_PER_MINUTE, // 5 minutes
                maxAge: 2 * helpers.constants.MILLISECONDS_PER_HOUR, // 2 hours
            },
            {
                type: 'file',
                enabled: true,
                path: '/opt/weather/server/data/persist/weather-storage.json',
                interval: 30 * helpers.constants.MILLISECONDS_PER_MINUTE, // 30 minutes
                maxAge: 7 * helpers.constants.MILLISECONDS_PER_DAY, // 7 days
            },
        ],
    },
    compute: {
        astronomicalCalculationInterval: 5 * helpers.constants.MILLISECONDS_PER_MINUTE, // 5 minutes
    },
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function __storageFileSave(filepath, data) {
    try {
        if (!fs.existsSync(path.dirname(filepath))) fs.mkdirSync(path.dirname(filepath), { recursive: true });
        fs.writeFileSync(filepath, JSON.stringify(data), 'utf8');
        return true;
    } catch (e) {
        console.error(`weather: storage failed to save to '${filepath}':`, e);
        return false;
    }
}

function __storageFileLoad(filepath) {
    try {
        if (fs.existsSync(filepath)) return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (e) {
        console.error(`weather: storage failed to load from '${filepath}':`, e);
    }
    return undefined;
}

function __storagePerisist(options, storable) {
    if (!options?.persistence) return;
    const timestamp = Date.now();
    options.persistence
        .filter((level) => level.enabled && level.path)
        .forEach((level) => {
            const lastKey = `last${level.type}Save`;
            if (options?.forced || !level[lastKey] || timestamp - level[lastKey] > level.interval)
                if (__storageFileSave(level.path, { timestamp, storable })) {
                    level[lastKey] = timestamp;
                    if (options.debug) console.error(`weather: storage persisted - to ${level.type}; path=${level.path}, size=${FormatHelper.bytesToString(fs.statSync(level.path).size)}${options?.forced ? ', forced=true' : ''}`);
                }
        });
}

function __storageRestore(options) {
    if (!options?.persistence) return {};
    const timestamp = Date.now();
    for (const level of options.persistence) {
        if (!level.enabled || !level.path) continue;
        const data = __storageFileLoad(level.path);
        if (data?.storable && timestamp - data.timestamp < (level.maxAge || 86400000)) {
            if (options.debug)
                console.error(`weather: storage restored - from ${level.type}; path=${level.path}, age=${FormatHelper.millisToString(timestamp - data.timestamp, '')}, size=${FormatHelper.bytesToString(fs.statSync(level.path).size)}`);
            return data.storable;
        }
    }
    return {};
}

let storageCallback;
function storageSave(options) {
    if (storageCallback) __storagePerisist(options.storage, storageCallback());
}
function storageLoad(options) {
    if (options.debug) options.storage.debug = options.debug;
    return __storageRestore(options.storage);
}
function storageBind(_options, callback) {
    storageCallback = callback;
}
let storageExited = false;
function storageExit(options) {
    if (!storageExited) {
        storageExited = true;
        if (storageCallback) __storagePerisist({ ...options.storage, forced: true }, storageCallback());
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let weatherLocation;
let weatherOptions = {},
    weatherInterpreters = {};
let weatherData,
    weatherStore = {};
let weatherDataUpdated = 0;
let weatherStoragePruneTimestamp = Date.now();
let weatherStorageStatsTimestamp = Date.now();

function weatherStorageStats(options) {
    const stats = [];
    stats.push(`cache: ${weatherData.size} entries, ~${FormatHelper.bytesToString(JSON.stringify(weatherData.raw).length)}`);
    stats.push(`store: ${Object.keys(weatherStore).length} entries, ~${FormatHelper.bytesToString(JSON.stringify(weatherStore).length)}`);
    stats.push(`astro: ${FormatHelper.millisToString(Date.now() - weatherCacheAstronomy.timestampAstronomy.getTime(), '')} old`);
    if (options.storage?.persistence)
        stats.push(options.storage.persistence.filter((level) => level.enabled && level.lastSave).map((level) => `persist[${level.type}]: saved ${FormatHelper.millisToString(Date.now() - level.lastSave, '')} ago`));
    console.error(`weather: storage stats - ${stats.flat().join('; ')}`);
}

function weatherStoragePrune(options) {
    // evict on time - use WeatherData.prune()
    const evictedOnTime = weatherData.prune(options.storage.evictionTimeDuration);

    // evict on size
    let evictedOnSize = 0;
    const rawData = weatherData.raw;
    const rawSize = JSON.stringify(rawData).length;
    if (rawSize > options.storage.maxCacheSize * options.storage.evictionSizeThreshold) {
        const timestamps = Object.keys(rawData).sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
        const limitSize = Math.floor(timestamps.length * options.storage.evictionSizePercent);
        timestamps.slice(0, limitSize).forEach((ts) => {
            delete rawData[ts];
            evictedOnSize++;
        });
    }

    if (options.debug && evictedOnTime + evictedOnSize > 0) console.error(`weather: storage prune - evicted on-time=${evictedOnTime}, on-size=${evictedOnSize}`);

    return evictedOnTime;
}

function weatherStorageManage(options) {
    const now = Date.now();

    // prune periodically
    if (now > weatherStoragePruneTimestamp + options.storage.pruneInterval) {
        weatherStoragePrune(options);
        weatherStoragePruneTimestamp = now;
        storageSave(options);
    }

    // stats periodically
    if (now > weatherStorageStatsTimestamp + options.storage.statsInterval) {
        weatherStorageStats(options);
        weatherStorageStatsTimestamp = now;
    }
}

function weatherStorageStartup(options) {
    let storage;
    if (options.storage?.persistence) {
        console.error(`weather: storage persistence enabled`);
        storage = storageLoad(options);
        storageBind(options, () => ({ data: weatherData.raw, store: weatherStore }));
        options.storage.persistence.filter((level) => level.enabled && level.interval).forEach((level) => setInterval(() => storageSave(options), level.interval));
        process.once('SIGINT', () => storageExit(options));
        process.once('SIGTERM', () => storageExit(options));
        process.once('beforeExit', () => storageExit(options));
    }
    weatherData = WeatherData.fromRaw(storage?.data || {});
    weatherStore = storage?.store || {};
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function __weatherTrendPeriod(weatherData, field, periodKey) {
    const period = weatherData.getPeriod(periodKey);
    if (!period) return { valid: false };
    const trend = {
        back: period.back(field, weatherData.getPeriodHours(periodKey) * 3600),
        min: period.min(field),
        max: period.max(field),
        avg: period.avg(field),
        delta: period.delta(field),
        rate: period.rateOfChange(field),
        trend: period.trend(field),
        count: period.count(),
        valid: period.isReasonablyDistributed(),
    };
    if (periodKey === '24h' || periodKey === '7d') {
        trend.minTime = period.minWithTime(field).time;
        trend.maxTime = period.maxWithTime(field).time;
    }
    return trend;
}

function __weatherTrend(weatherData, field) {
    return Object.fromEntries(Object.keys(WeatherData.PERIODS).map((periodKey) => [periodKey, __weatherTrendPeriod(weatherData, field, periodKey)]));
}

function __weatherTrends(weatherData, fields) {
    return Object.fromEntries(fields.map((field) => [field, __weatherTrend(weatherData, field)]));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let weatherCacheSituation = {};
let weatherCacheAstronomy = {};

function __weatherSituation(location, data, options) {
    const { temp, humidity, windSpeed, solarRad } = data;
    const date = new Date(),
        now = Date.now();

    // cache situation, daily
    if (!weatherCacheSituation.timestampSituation || weatherCacheSituation.timestampSituation.getDate() !== date.getDate()) {
        weatherCacheSituation = {
            location,
            year: date.getFullYear(),
            month: date.getMonth(),
            day: date.getDate(),
            daysIntoYear: helpers.daysIntoYear(date),
            season: helpers.getSeason(date, location.hemisphere),
            timestampSituation: date,
        };
        if (options?.debug) console.error(`weather: cached situation (daily, ${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')})`); // XXX FormatHelper
    }

    // cache astronomy, 5 minutes default
    if (!weatherCacheAstronomy.timestampAstronomy || weatherCacheAstronomy.timestampAstronomy.getTime() < now - (options?.compute?.astronomicalCalculationInterval || 300000)) {
        weatherCacheAstronomy = {
            daylight: toolsAstronomy.getDaylightSituation(date, location.latitude, location.longitude),
            lunar: toolsAstronomy.getLunarSituation(date, location.latitude, location.longitude),
            solar: toolsAstronomy.getSolarSituation(date, location.latitude, location.longitude),
            timestampAstronomy: date,
        };
        if (options?.debug) console.error(`weather: cached astronomy (interval ${FormatHelper.millisToString(options?.compute?.astronomicalCalculationInterval || 300000, '')})`);
    }

    return {
        ...weatherCacheSituation,
        ...weatherCacheAstronomy,
        //
        date,
        minute: date.getMinutes(),
        hour: date.getHours(),
        hourDecimal: date.getHours() + date.getMinutes() / 60,
        jd: helpers.dateToJulianDateUTC(date),
        //
        dewPoint: toolsCalculators.calculateDewPoint(temp, humidity),
        windChill: toolsCalculators.calculateWindChill(temp, windSpeed),
        heatIndex: toolsCalculators.calculateHeatIndex(temp, humidity),
        feelsLike: toolsCalculators.calculateFeelsLike(temp, humidity, windSpeed),
        comfort: toolsCalculators.calculateComfortLevel(temp, humidity, windSpeed, solarRad),
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getWeatherInterpretationImpl(interpreters, location, dataCurrent, weatherData, store, options) {
    const situation = __weatherSituation(location, dataCurrent, options);
    if (options?.debug) console.error('weather: situation/data:', situation, dataCurrent);
    const results = { conditions: [], phenomena: [], alerts: [] };
    const context = { results, situation, dataCurrent, weatherData, store, options, location };
    Object.entries(interpreters).forEach(([name, func]) => {
        try {
            if (options?.debug) console.error(`weather: interpret '${name}'`);
            const result = { conditions: [], phenomena: [], alerts: [] };
            func({ ...context, results: result });
            results.conditions = [...results.conditions, ...result.conditions];
            results.phenomena = [...results.phenomena, ...result.phenomena];
            results.alerts = [...results.alerts, ...result.alerts];
            if (options?.debug && result.conditions.length + result.phenomena.length + result.alerts.length > 0) {
                if (result.conditions.length === 0) delete result.conditions;
                if (result.phenomena.length === 0) delete result.phenomena;
                if (result.alerts.length === 0) delete result.alerts;
                console.error(`weather: response:`, result);
            }
        } catch (e) {
            console.error(`weather: interpret '${name}', error:`, e);
        }
    });
    Object.entries(toolsEvents.new(store)).forEach(([category, events]) => events.forEach((event) => results.phenomena.push(`${category}: ${event.message}`)));
    results.feelsLike = situation.feelsLike;
    results.comfort = situation.comfort;
    return results;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getWeatherInterpretation(data, options = {}) {
    options = mergeObjects(weatherOptions, options);

    // require minimal variables
    const { timestamp, temp, humidity, pressure } = data;
    if (timestamp === undefined || temp === undefined || humidity === undefined || pressure === undefined) return undefined;

    // require minimal period
    const now = Date.now();
    if (now < weatherDataUpdated + options.data.gateInterval) {
        if (options.debug) console.error(`weather: data gated - ${FormatHelper.millisToString(now - weatherDataUpdated)} since last update`);
        return undefined;
    }

    // Add data and prepare period buckets
    weatherData.add(timestamp, data);
    weatherData.prepare(timestamp);
    weatherDataUpdated = now;

    // manage data
    weatherStorageManage(options);

    // prune events periodically
    toolsEvents.prune(weatherStore);

    // generate/update trends
    if (!weatherStore.conditions) weatherStore.conditions = {};
    weatherStore.conditions.trends = __weatherTrends(weatherData, Object.keys(data));

    return getWeatherInterpretationImpl(weatherInterpreters, weatherLocation, data, weatherData, weatherStore, options);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialise(location, options) {
    weatherLocation = location;
    weatherOptions = mergeObjects(DEFAULT_OPTIONS, options || {});
    if (weatherOptions.debug) console.error(`weather: DEBUG ENABLED`);
    weatherStorageStartup(weatherOptions);
    const parameters = { location: weatherLocation, store: weatherStore, options: weatherOptions };
    weatherInterpreters = {
        ...require('./server-function-weather-module-conditions.js')(parameters),
        ...require('./server-function-weather-module-astronomy-calendar.js')(parameters),
        ...require('./server-function-weather-module-astronomy-solar.js')(parameters),
        ...require('./server-function-weather-module-astronomy-lunar.js')(parameters),
        ...require('./server-function-weather-module-astronomy-atmospheric.js')(parameters),
        ...require('./server-function-weather-module-astronomy-heliophysics.js')(parameters),
        ...require('./server-function-weather-module-astronomy-celestial.js')(parameters),
        ...require('./server-function-weather-module-astronomy-planets-and-stars.js')(parameters),
        ...require('./server-function-weather-module-astronomy-meteors.js')(parameters),
        ...require('./server-function-weather-module-astronomy-satellites.js')(parameters),
        ...require('./server-function-weather-module-eclipses.js')(parameters),
        ...require('./server-function-weather-module-phenology.js')(parameters),
        ...require('./server-function-weather-module-calendar.js')(parameters),
        ...require('./server-function-weather-module-pollen.js')(parameters),
    };
    console.error(
        `weather: loaded ${Object.keys(weatherInterpreters).length} interpreters: '${Object.keys(weatherInterpreters)
            .map((name) => name.replaceAll('interpret', '').replaceAll('check', '').replaceAll('predict', '').replaceAll('process', ''))
            .join(', ')}', with location: '${JSON.stringify(weatherLocation)}', options: '${JSON.stringify(weatherOptions)}'`
    );
    return { getWeatherInterpretation };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (location, options = {}) {
    return initialise(location, options);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
