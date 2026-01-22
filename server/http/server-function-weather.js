// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const helpers = require('./server-function-weather-helpers.js');
const toolsCalculators = require('./server-function-weather-tools-calculators.js');
const toolsEvents = require('./server-function-weather-tools-events.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');

function mergeObjects(defaults, provided) {
    const result = structuredClone(defaults);
    for (const key of Object.keys(provided))
        result[key] = provided[key] && typeof provided[key] === 'object' && !Array.isArray(provided[key]) ? mergeObjects(result[key] ?? {}, provided[key]) : provided[key];
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
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filepath, JSON.stringify(data), 'utf8');
        return true;
    } catch (e) {
        console.error(`weather: storage failed to save to '${filepath}':`, e);
        return false;
    }
}

function __storageFileLoad(filepath) {
    try {
        if (fs.existsSync(filepath)) {
            const data = fs.readFileSync(filepath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error(`weather: storage failed to load from '${filepath}':`, e);
    }
    return undefined;
}

function __storagePerisist(options, storable) {
    if (!options?.persistence) return;
    const now = Date.now();
    const storageContent = {
        timestamp: now,
        storable,
    };
    options.persistence
        .filter((level) => level.enabled && level.path)
        .forEach((level) => {
            const lastKey = `last${level.type}Save`;
            if (options?.forced || !level[lastKey] || now - level[lastKey] > level.interval)
                if (__storageFileSave(level.path, storageContent)) {
                    level[lastKey] = now;
                    if (options.debug) console.error(`weather: storage persisted - to ${level.type}; path=${level.path}, size=${Math.floor(fs.statSync(level.path).size / 1024)}KB${options?.forced ? ', forced=true' : ''}`);
                }
        });
}

function __storageRestore(options) {
    if (options?.persistence)
        for (const level of options.persistence) {
            if (!level.enabled || !level.path) continue;
            const data = __storageFileLoad(level.path);
            if (data && data.storable) {
                const age = Date.now() - data.timestamp,
                    maxAge = level.maxAge || 86400000;
                if (age < maxAge) {
                    if (options.debug) console.error(`weather: storage restored - from ${level.type}; path=${level.path}, age=${Math.round(age / 60000)}m, size=${Math.floor(fs.statSync(level.path).size / 1024)}KB`);
                    return data.storable;
                }
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

function joinand(items) {
    if (!items || items.length === 0) return '';
    else if (items.length === 1) return items[0];
    else if (items.length === 2) return `${items[0]} and ${items[1]}`;
    const lastItem = items.pop();
    return `${items.join(', ')}, and ${lastItem}`;
}

function __weatherDetails(results) {
    let details = '';
    if (results.conditions.length > 0) details = joinand([...new Set(results.conditions)]);
    if (results.phenomena.length > 0) details += (details ? ': ' : '') + joinand([...new Set(results.phenomena)]);
    if (details) {
        details = details.charAt(0).toUpperCase() + details.slice(1);
        if (!details.endsWith('.')) details += '.';
    }
    return details || undefined;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let weatherLocation;
let weatherOptions = {},
    weatherInterpreters = {};
let weatherData = {},
    weatherStore = {};
let weatherDataUpdated = 0;
let weatherStoragePruned = Date.now();
let weatherStorageStatsDisplayed = Date.now();

function weatherStorageStats(options) {
    const stats = [];
    stats.push(`cache: ${Object.keys(weatherData).length} entries, ~${Math.floor(JSON.stringify(weatherData).length / 1024)}KB`);
    stats.push(`store: ${Object.keys(weatherStore).length} entries, ~${Math.floor(JSON.stringify(weatherStore).length / 1024)}KB`);
    stats.push(`astro: ${Math.round((Date.now() - weatherCacheAstronomy.timestampAstronomy.getTime()) / 60000)}min old`);
    if (options.storage?.persistence) stats.push(options.storage.persistence.filter((level) => level.enabled && level.lastSave).map((level) => `persist[${level.type}]: saved ${Math.round((Date.now() - level.lastSave) / 60000)}min ago`));
    console.error(`weather: storage stats - ${stats.flat().join('; ')}`);
}

function weatherStoragePrune(options, now) {
    // evict on time
    let evictedOnTime = 0;
    const limitTime = now - options.storage.evictionTimeDuration;
    Object.keys(weatherData)
        .filter((ts) => Number.parseInt(ts) < limitTime)
        .forEach((ts) => {
            delete weatherData[ts];
            evictedOnTime++;
        });

    // evict on size
    let evictedOnSize = 0;
    if (JSON.stringify(weatherData).length > options.storage.maxCacheSize * options.storage.evictionSizeThreshold) {
        const limitSize = Math.floor(Object.keys(weatherData).length * options.storage.evictionSizePercent);
        Object.keys(weatherData)
            .sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
            .slice(0, limitSize)
            .forEach((ts) => {
                delete weatherData[ts];
                evictedOnSize++;
            });
    }

    if (evictedOnTime + evictedOnSize > 0 && options.debug) console.error(`weather: storage prune - evicted on-time=${evictedOnTime}, on-size=${evictedOnSize}`);

    return evictedOnTime;
}

function weatherStorageManage(options) {
    const now = Date.now();

    // prune periodically
    if (now > weatherStoragePruned + options.storage.pruneInterval) {
        weatherStoragePrune(options, now);
        weatherStoragePruned = now;
        storageSave(options);
    }

    // stats periodically
    if (now > weatherStorageStatsDisplayed + options.storage.statsInterval) {
        weatherStorageStats(options);
        weatherStorageStatsDisplayed = now;
    }
}

function weatherStorageStartup(options) {
    let storage;
    if (options.storage?.persistence) {
        console.error(`weather: storage persistence enabled`);
        storage = storageLoad(options);
        storageBind(options, () => ({ data: weatherData, store: weatherStore }));
        options.storage.persistence.filter((level) => level.enabled && level.interval).forEach((level) => setInterval(() => storageSave(options), level.interval));
        process.once('SIGINT', () => storageExit(options));
        process.once('SIGTERM', () => storageExit(options));
        process.once('beforeExit', () => storageExit(options));
    }
    weatherData = storage?.data || {};
    weatherStore = storage?.store || {};
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
        if (options?.debug) console.error(`weather: cached situation: ${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`);
    }

    // cache astronomy, 5 minutes default
    if (!weatherCacheAstronomy.timestampAstronomy || weatherCacheAstronomy.timestampAstronomy.getTime() < now - (options?.compute?.astronomicalCalculationInterval || 300000)) {
        weatherCacheAstronomy = {
            daylight: toolsAstronomy.getDaylightSituation(date, location.latitude, location.longitude),
            lunar: toolsAstronomy.getLunarSituation(date, location.latitude, location.longitude),
            solar: toolsAstronomy.getSolarSituation(date, location.latitude, location.longitude),
            timestampAstronomy: date,
        };
        if (options?.debug) console.error(`weather: cached astronomy`);
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

function getWeatherInterpretationImpl(interpreters, location, data, data_previous, store, options) {
    const situation = __weatherSituation(location, data, options);
    if (options?.debug) console.error('weather: situation applied:', situation);
    const results = { conditions: [], phenomena: [], alerts: [] };
    Object.entries(interpreters).forEach(([name, func]) => {
        try {
            if (options?.debug) console.error(`weather: interpret '${name}'`);
            const result = { conditions: [], phenomena: [], alerts: [] };
            func(result, situation, data, data_previous, store, options);
            results.conditions = [...results.conditions, ...result.conditions];
            results.phenomena = [...results.phenomena, ...result.phenomena];
            results.alerts = [...results.alerts, ...result.alerts];
            if (options?.debug && (result.conditions.length > 0 || result.phenomena.length > 0 || result.alerts.length > 0)) {
                if (result.conditions.length === 0) delete result.conditions;
                if (result.phenomena.length === 0) delete result.phenomena;
                if (result.alerts.length === 0) delete result.alerts;
                console.error(`weather: response:`, result);
            }
        } catch (e) {
            console.error(`weather: interpret '${name}', error:`, e);
        }
    });
    results.feelsLike = situation.feelsLike;
    results.comfort = situation.comfort;
    results.details = __weatherDetails(results);
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
        if (options.debug) console.error(`weather: data gated - ${now - weatherDataUpdated}ms since last update`);
        return undefined;
    }
    weatherData[timestamp] = data;
    weatherDataUpdated = now;

    // manage data
    weatherStorageManage(options);

    // prune events periodically
    toolsEvents.prune(weatherStore);

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
        //        ...require('./server-function-weather-module-phenology.js')(parameters),
        //        ...require('./server-function-weather-module-calendar.js')(parameters),
        //        ...require('./server-function-weather-module-astronomy.js')(parameters),
        //        ...require('./server-function-weather-module-eclipses.js')(parameters),
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
