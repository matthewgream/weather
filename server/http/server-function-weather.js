// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

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

let __weatherSituationCache = {};

function __weatherSituation(location, data, options) {
    const { temp, humidity, windSpeed, solarRad } = data;
    const date = new Date();

    if (!__weatherSituationCache.cached || __weatherSituationCache.cached.getDate() !== date.getDate()) {
        __weatherSituationCache = {
            location,
            year: date.getFullYear(),
            month: date.getMonth(),
            day: date.getDate(),
            daysIntoYear: helpers.daysIntoYear(date),
            season: helpers.getSeason(date, location.hemisphere),
            lunar: helpers.getLunarSituation(date, location.latitude, location.longitude),
            solar: helpers.getSolarSituation(date, location.latitude, location.longitude),
            cached: date,
        };
        if (options?.debug) console.error(`weather: situation cached: ${date.getFullYear()}/${date.getMonth().toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`);
    }

    return {
        ...__weatherSituationCache,
        //
        date,
        minute: date.getMinutes(),
        hour: date.getHours(),
        hourDecimal: date.getHours() + date.getMinutes() / 60,
        //
        daylight: helpers.getDaylight(date, location.latitude, location.longitude),
        //
        dewPoint: helpers.calculateDewPoint(temp, humidity),
        windChill: helpers.calculateWindChill(temp, windSpeed),
        heatIndex: helpers.calculateHeatIndex(temp, humidity),
        feelsLike: helpers.calculateFeelsLike(temp, humidity, windSpeed),
        comfort: helpers.calculateComfortLevel(temp, humidity, windSpeed, solarRad),
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

let weatherLocation;
let weatherOptions = {},
    weatherInterpreters = {};
const weatherCache = {},
    weatherStore = {};
const CACHE_DURATION = (24 + 1) * 60 * 60 * 1000; // 25 hours, for now
let weatherCachePrunned = Date.now();
const PRUNE_INTERVAL = 5 * 60 * 1000;

function getWeatherInterpretation(data, options = {}) {
    // XXX should persist the cache and reload it ... maybe also the store ...
    if (weatherCachePrunned + PRUNE_INTERVAL < Date.now()) {
        const expiration = data.timestamp - CACHE_DURATION;
        Object.keys(weatherCache)
            .filter((timestamp) => timestamp < expiration)
            .forEach((timestamp) => delete weatherCache[timestamp]);
        weatherCachePrunned = Date.now();
        console.error(
            `weather: cache: count=${Object.keys(weatherCache).length}, size~=${Math.floor(JSON.stringify(weatherCache).length / 1024)}Kb; ` +
                `store: count=${Object.keys(weatherStore).length}, size~=${Math.floor(JSON.stringify(weatherStore).length / 1024)}Kb`
        );
    }
    weatherCache[data.timestamp] = data;
    helpers.pruneEvents(weatherStore);
    return getWeatherInterpretationImpl(weatherInterpreters, weatherLocation, data, weatherCache, weatherStore, { ...weatherOptions, ...options });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialise(location, options) {
    weatherLocation = location;
    weatherOptions = options;
    const parameters = { location: weatherLocation, store: weatherStore, options: weatherOptions };
    weatherInterpreters = {
        ...require('./server-function-weather-conditions.js')(parameters),
        ...require('./server-function-weather-combination.js')(parameters),
        ...require('./server-function-weather-phenology.js')(parameters),
        ...require('./server-function-weather-calendar.js')(parameters),
        ...require('./server-function-weather-astronomy.js')(parameters),
        ...require('./server-function-weather-eclipses.js')(parameters),
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
