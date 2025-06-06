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

function __weatherSituation(location, data) {
    const { temp, humidity, windSpeed, solarRad } = data;
    const date = new Date();
    return {
        location,
        date,
        minute: date.getMinutes(),
        hour: date.getHours(),
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
        season: helpers.getSeason(location.hemisphere),
        daylight: helpers.getDaylightHours(location.latitude, location.longitude),
        dewPoint: helpers.calculateDewPoint(temp, humidity),
        windChill: helpers.calculateWindChill(temp, windSpeed),
        heatIndex: helpers.calculateHeatIndex(temp, humidity),
        feelsLike: helpers.calculateFeelsLike(temp, humidity, windSpeed),
        comfort: helpers.calculateComfortLevel(temp, humidity, windSpeed, solarRad),
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getWeatherInterpretationImpl(interpreters, location, data, data_previous, store, options) {
    const situation = __weatherSituation(location, data);
    const results = { conditions: [], phenomena: [], alerts: [] };
    Object.entries(interpreters).forEach(([name, func]) => {
        try {
            if (options?.debug) console.error('--> ' + name);
            func(results, situation, data, data_previous, store, options);
        } catch (e) {
            console.error(`weather: interpreter '${name}' error:`, e);
        }
    });
    results.feelsLike = situation.feelsLike;
    results.comfort = situation.comfort;
    results.details = __weatherDetails(results);
    return results;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let weatherOptions = {},
    weatherInterpreters = {};
const weatherCache = {},
    weatherStore = {};
const CACHE_DURATION = (24 + 1) * 60 * 60 * 1000; // 25 hours, for now
let weatherCachePrunned = Date.now();
const PRUNE_INTERVAL = 5 * 60 * 1000;

function getWeatherInterpretation(location_data, data, options = {}) {
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
    return getWeatherInterpretationImpl(weatherInterpreters, location_data, data, weatherCache, weatherStore, { ...weatherOptions, ...options });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initialise(options) {
    weatherOptions = options;
    weatherInterpreters = {
        ...require('./server-function-weather-conditions.js')(options),
        ...require('./server-function-weather-combination.js')(options),
        ...require('./server-function-weather-phenology.js')(options),
        ...require('./server-function-weather-calendar.js')(options),
        ...require('./server-function-weather-astronomy.js')(options),
        ...require('./server-function-weather-eclipses.js')(options),
    };
    console.error(
        `weather: loaded ${Object.keys(weatherInterpreters).length} interpreters: '${Object.keys(weatherInterpreters)
            .map((name) => name.replaceAll('interpret', '').replaceAll('check', '').replaceAll('predict', '').replaceAll('process', ''))
            .join(', ')}', with options: '${JSON.stringify(options)}'`
    );
    return { getWeatherInterpretation };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (options = {}) {
    return initialise(options);
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
