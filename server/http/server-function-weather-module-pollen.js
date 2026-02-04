// -----------------------------------------------------------------------------------------------------------------------------------------
// Pollen Module - Swedish Pollen Forecasts from Pollenrapporten.se
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// Data source: https://api.pollenrapporten.se/
// Operated by: Naturhistoriska riksmuseet (Swedish Museum of Natural History)
//
// Swedish pollen types:
// - Trees: Hassel (Hazel), Al (Alder), Sälg och viden (Willow), Alm (Elm), Björk (Birch), Bok (Beech), Ek (Oak)
// - Grasses: Gräs (Grass)
// - Weeds: Gråbo (Mugwort), Malörtsambrosia (Ragweed)
//
// -----------------------------------------------------------------------------------------------------------------------------------------

const { calculateHaversineDistance } = require('./server-function-weather-tools-calculators.js');
const formatter = require('./server-function-weather-tools-format.js');
const { DataSlot, DataScheduler, fetchJson, createTimestampTracker, isCacheValid } = require('./server-function-weather-tools-live.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const API_BASE = 'https://api.pollenrapporten.se/v1';

const STATIC_CACHE_DURATION_MS = 28 * 24 * 60 * 60 * 1000; // 28 days for regions/types/levels
const FORECAST_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours default
const FORECAST_CACHE_HIGH_SEASON_MS = 6 * 60 * 60 * 1000; // 6 hours during high season

const HIGH_SEASON_START_MONTH = 3;
const HIGH_SEASON_END_MONTH = 9;

const POLLEN_METADATA = {
    'Hassel': {
        english: 'Hazel',
        type: 'tree',
        season: { start: 2, end: 4 },
        crossReaction: ['Al', 'Björk'],
        severity: 'high',
    },
    'Al': {
        english: 'Alder',
        type: 'tree',
        season: { start: 2, end: 4 },
        crossReaction: ['Hassel', 'Björk'],
        severity: 'high',
    },
    'Sälg och viden': {
        english: 'Willow',
        type: 'tree',
        season: { start: 3, end: 5 },
        crossReaction: [],
        severity: 'low',
    },
    'Alm': {
        english: 'Elm',
        type: 'tree',
        season: { start: 3, end: 5 },
        crossReaction: [],
        severity: 'moderate',
    },
    'Björk': {
        english: 'Birch',
        type: 'tree',
        season: { start: 4, end: 5 },
        crossReaction: ['Al', 'Hassel', 'Ek'],
        foodCrossReaction: ['apple', 'pear', 'cherry', 'hazelnut', 'almond', 'carrot', 'celery'],
        severity: 'very high',
    },
    'Bok': {
        english: 'Beech',
        type: 'tree',
        season: { start: 4, end: 5 },
        crossReaction: ['Björk'],
        severity: 'moderate',
    },
    'Ek': {
        english: 'Oak',
        type: 'tree',
        season: { start: 4, end: 6 },
        crossReaction: ['Björk'],
        severity: 'moderate',
    },
    'Gräs': {
        english: 'Grass',
        type: 'grass',
        season: { start: 5, end: 8 },
        crossReaction: [],
        foodCrossReaction: ['wheat', 'rye', 'oats'],
        severity: 'very high',
    },
    'Gråbo': {
        english: 'Mugwort',
        type: 'weed',
        season: { start: 7, end: 9 },
        crossReaction: ['Malörtsambrosia'],
        foodCrossReaction: ['celery', 'carrot', 'fennel', 'parsley', 'coriander', 'sunflower seeds'],
        severity: 'moderate',
    },
    'Malörtsambrosia': {
        english: 'Ragweed',
        type: 'weed',
        season: { start: 8, end: 10 },
        crossReaction: ['Gråbo'],
        severity: 'very high',
        note: 'Increasing in Sweden due to climate change',
    },
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function findNearestRegion(latitude, longitude, regions) {
    let nearest;
    let minDistance = Infinity;
    for (const region of regions) {
        if (!region.latitude || !region.longitude) continue;
        const distance = calculateHaversineDistance(latitude, longitude, Number.parseFloat(region.latitude), Number.parseFloat(region.longitude));
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { ...region, distance };
        }
    }
    return nearest;
}

function getPollenTypeById(pollenId, pollenTypes) {
    return pollenTypes?.find((pt) => pt.id === pollenId);
}

function getPollenMetadata(pollenName) {
    return POLLEN_METADATA[pollenName];
}

function summarizeSwedishText(text) {
    if (!text) return undefined;
    const patterns = [
        { match: /höga halter/i, english: 'high levels expected' },
        { match: /mycket höga/i, english: 'very high levels' },
        { match: /måttliga halter/i, english: 'moderate levels' },
        { match: /låga halter/i, english: 'low levels' },
        { match: /blommar/i, english: 'in bloom' },
        { match: /säsongen (är|har) avslutad/i, english: 'season ended' },
    ];
    const matches = patterns.filter((p) => p.match.test(text)).map((p) => p.english);
    if (matches.length > 0) return matches.slice(0, 2).join('; ');
    return text.length > 100 ? text.slice(0, 97) + '...' : text;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const liveSlotPollenForecast = new DataSlot('forecast', FORECAST_CACHE_DURATION_MS); // Note: staleness varies by season, handled in updateSchedule
const liveScheduler = new DataScheduler('pollen');

async function livePollenFetchRegions() {
    return (await fetchJson(`${API_BASE}/regions`)).items || [];
}

async function livePollenFetchTypes() {
    return (await fetchJson(`${API_BASE}/pollen-types`)).items || [];
}

async function livePollenFetchForecastData(regionId) {
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    const params = new URLSearchParams({ region_id: regionId, start_date: startDate.toISOString().split('T')[0], end_date: endDate.toISOString().split('T')[0], current: true });
    return (await fetchJson(`${API_BASE}/forecasts?${params}`)).items || [];
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getForecastCacheDuration() {
    const month = new Date().getMonth() + 1;
    return month >= HIGH_SEASON_START_MONTH && month <= HIGH_SEASON_END_MONTH ? [FORECAST_CACHE_HIGH_SEASON_MS, 'high-season'] : [FORECAST_CACHE_DURATION_MS, 'low-season'];
}

async function livePollenForecastFetchAndProcess(state) {
    if (!state.selectedRegion) return undefined;

    return liveSlotPollenForecast.fetch(
        state,
        'pollen',
        async () => {
            const forecasts = await livePollenFetchForecastData(state.selectedRegion.id);
            const data = forecasts.find((f) => f.regionId === state.selectedRegion.id) || forecasts[0] || undefined;
            if (!data) throw new Error('No forecast data');
            return data;
        },
        state.selectedRegion.name
    );
}

async function livePollenStaticDataFetchAndProcess(state, situation) {
    const { location } = situation;

    try {
        const [regions, pollenTypes] = await Promise.all([livePollenFetchRegions(), livePollenFetchTypes()]);
        state.staticData.regions = regions;
        state.staticData.pollenTypes = pollenTypes;
        state.staticData.lastUpdate = Date.now();
        state.staticData.lastError = undefined;
        state.selectedRegion = findNearestRegion(location.latitude, location.longitude, regions);
        if (state.selectedRegion) {
            console.error(`pollen: selected region: ${state.selectedRegion.name} (${formatter.distanceKmToString(state.selectedRegion.distance)})`);
            if (!isCacheValid(state.forecast?.lastUpdate, getForecastCacheDuration()[0])) await livePollenForecastFetchAndProcess(state);
        }
        console.error(`pollen: update staticData success (${regions.length} regions, ${pollenTypes.length} pollen types)`);
    } catch (e) {
        state.staticData.lastError = e.message;
        console.error('pollen: update staticData failure:', e.message);
    }
}

function liveSchedulerStart(state, situation) {
    liveScheduler.run(
        async () => {
            if (!isCacheValid(state.staticData.lastUpdate, STATIC_CACHE_DURATION_MS)) await livePollenStaticDataFetchAndProcess(state, situation);
            else if (state.selectedRegion) if (!isCacheValid(state.forecast?.lastUpdate, getForecastCacheDuration()[0])) await livePollenForecastFetchAndProcess(state);
        },
        () => getForecastCacheDuration()
    );
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getForecast(state) {
    const [forecastCacheDuration] = getForecastCacheDuration();
    if (!state.forecast?.data) return undefined;
    if (!isCacheValid(state.forecast.lastUpdate, forecastCacheDuration)) return undefined;
    return state.forecast.data;
}

function getLevelsForDate(date, levelsByDate, pollenTypes) {
    const high = [],
        moderate = [],
        low = [];
    for (const entry of levelsByDate[new Date(date).toISOString().split('T')[0]] || []) {
        const pollenType = getPollenTypeById(entry.pollenId, pollenTypes);
        const meta = pollenType ? getPollenMetadata(pollenType.name) : undefined;
        const name = pollenType ? pollenType.name : 'Unknown';
        const englishName = meta ? meta.english : name;
        const item = { name, englishName, level: entry.level, meta };
        if (entry.level >= 5) high.push(item);
        else if (entry.level >= 3) moderate.push(item);
        else if (entry.level >= 1) low.push(item);
    }
    return { high, moderate, low };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretPollen({ temporal, results, situation, dataCurrent, store }) {
    if (!store.pollen || !store.pollen.selectedRegion) return; // Not ready yet

    const { date, month } = situation;
    const { cloudCover, precipitation, humidity, windSpeed } = dataCurrent;

    const forecast = getForecast(store.pollen);
    if (!forecast) return;

    const regionName = store.pollen.selectedRegion.name;
    const { pollenTypes } = store.pollen.staticData;

    const ts = createTimestampTracker(temporal, situation);

    if (forecast.isEndOfSeason) {
        if (month + 1 >= 1 && month + 1 <= 2) {
            results.phenomena.push(`pollen: ${ts.get('pollen', forecast._fetched)}season not yet started in ${regionName}`);
            results.phenomena.push('pollen: hazel and alder may release on dry sunny days in mild winters');
        } else if (month + 1 >= 10 && month + 1 <= 12) results.phenomena.push(`pollen: ${ts.get('pollen', forecast._fetched)}season ended for ${regionName}`);
        return;
    }

    // Active season - interpret levelSeries
    if (!forecast.levelSeries || forecast.levelSeries.length === 0) {
        if (forecast.text) results.phenomena.push(`pollen: ${ts.get('pollen', forecast._fetched)}${summarizeSwedishText(forecast.text)}`);
        return;
    }

    const levelsByDate = {};
    for (const entry of forecast.levelSeries) {
        const entryDate = entry.date || entry.startDate;
        if (!levelsByDate[entryDate]) levelsByDate[entryDate] = [];
        levelsByDate[entryDate].push(entry);
    }

    const { high, moderate, low } = getLevelsForDate(date, levelsByDate, pollenTypes);

    if (high.length > 0) {
        results.alerts.push(`pollen: ${ts.get('pollen', forecast._fetched)}HIGH levels of ${high.map((h) => h.englishName).join(', ')}`);
        for (const h of high) {
            if (h.meta?.severity === 'very high') results.alerts.push(`pollen: ${h.englishName} is major allergen - stay indoors during peak hours`);
            if (h.meta?.foodCrossReaction) results.phenomena.push(`pollen: ${h.englishName} may cross-react with ${h.meta.foodCrossReaction.slice(0, 3).join(', ')}`);
        }
    }

    // Report moderate levels
    if (moderate.length > 0) results.phenomena.push(`pollen: ${ts.get('pollen', forecast._fetched)}moderate levels of ${moderate.map((m) => m.englishName).join(', ')}`);

    // Report low levels (only if nothing higher)
    if (low.length > 0 && high.length === 0 && moderate.length === 0) results.phenomena.push(`pollen: ${ts.get('pollen', forecast._fetched)}low levels of ${low.map((l) => l.englishName).join(', ')}`);

    // No significant pollen
    if (high.length === 0 && moderate.length === 0 && low.length === 0) results.phenomena.push(`pollen: ${ts.get('pollen', forecast._fetched)}no significant levels in ${regionName}`);

    // Weather context for pollen dispersal
    if (high.length > 0 || moderate.length > 0) {
        if (precipitation && precipitation > 0) results.conditions.push(`pollen: ${ts.get('pollen', forecast._fetched)}rain washing pollen from air - temporary relief`);
        else if (humidity && humidity > 80) results.conditions.push(`pollen: ${ts.get('pollen', forecast._fetched)}high humidity (${formatter.humidityToString(humidity)}) reducing airborne levels`);
        else if (windSpeed && windSpeed > 15 && (!cloudCover || cloudCover < 50))
            results.conditions.push(`pollen: ${ts.get('pollen', forecast._fetched)}dry windy conditions (${formatter.windspeedToString(windSpeed)}) increasing dispersal - keep windows closed`);
        else if (cloudCover !== undefined && cloudCover < 30 && (!humidity || humidity < 60)) results.conditions.push(`pollen: ${ts.get('pollen', forecast._fetched)}clear dry weather ideal for pollen release`);
    }

    if (high.length === 0) {
        const tomorrow = new Date(date);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowHigh = getLevelsForDate(date, levelsByDate, pollenTypes).high;
        if (tomorrowHigh.length > 0) results.phenomena.push(`pollen: ${ts.get('pollen', forecast._fetched)}high levels of ${tomorrowHigh.map((h) => h.englishName).join(', ')} expected tomorrow`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ location, store }) {
    if (!store.pollen)
        store.pollen = {
            staticData: {
                regions: undefined,
                pollenTypes: undefined,
                lastUpdate: 0,
                lastError: undefined,
            },
            selectedRegion: undefined,
            forecast: {
                data: undefined,
                lastUpdate: 0,
                lastError: undefined,
            },
        };

    liveSchedulerStart(store.pollen, { location });

    return {
        interpretPollen,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
