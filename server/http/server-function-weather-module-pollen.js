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

const https = require('https');

/* eslint-disable sonarjs/cognitive-complexity */

// -----------------------------------------------------------------------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------------------------------------------------------------------

const API_BASE = 'https://api.pollenrapporten.se/v1';

// Cache durations
const STATIC_CACHE_DURATION_MS = 28 * 24 * 60 * 60 * 1000; // 28 days for regions/types/levels
const FORECAST_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours default
const FORECAST_CACHE_HIGH_SEASON_MS = 6 * 60 * 60 * 1000; // 6 hours during high season

// High pollen season (approximately March-September in Sweden)
const HIGH_SEASON_START_MONTH = 3;
const HIGH_SEASON_END_MONTH = 9;

// Pollen type metadata (English translations and allergy info)
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

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Request timeout')), 30000);
        https
            .get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    clearTimeout(timeout);
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON: ${e.message}`));
                    }
                });
            })
            .on('error', (e) => {
                clearTimeout(timeout);
                reject(e);
            });
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestRegion(latitude, longitude, regions) {
    let nearest = undefined;
    let minDistance = Infinity;
    for (const region of regions) {
        if (!region.latitude || !region.longitude) continue;
        const distance = haversineDistance(latitude, longitude, Number.parseFloat(region.latitude), Number.parseFloat(region.longitude));
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { ...region, distance };
        }
    }
    return nearest;
}

function getForecastCacheDuration() {
    const month = new Date().getMonth() + 1;
    const highSeason = month >= HIGH_SEASON_START_MONTH && month <= HIGH_SEASON_END_MONTH;
    return highSeason ? FORECAST_CACHE_HIGH_SEASON_MS : FORECAST_CACHE_DURATION_MS;
}

function isCacheValid(lastUpdate, durationMs) {
    return lastUpdate ? Date.now() - lastUpdate < durationMs : false;
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
    const matches = [];
    for (const p of patterns) if (p.match.test(text)) matches.push(p.english);
    if (matches.length > 0) return matches.slice(0, 2).join('; ');
    return text.length > 100 ? text.slice(0, 97) + '...' : text;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

async function fetchRegions() {
    return (await fetchJSON(`${API_BASE}/regions`)).items || [];
}

async function fetchPollenTypes() {
    return (await fetchJSON(`${API_BASE}/pollen-types`)).items || [];
}

async function fetchForecast(regionId) {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);
    const [startStr] = today.toISOString().split('T');
    const [endStr] = endDate.toISOString().split('T');
    return (await fetchJSON(`${API_BASE}/forecasts?region_id=${regionId}&start_date=${startStr}&end_date=${endStr}&current=true`)).items || [];
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function updateForecast(state) {
    fetchForecast(state.selectedRegion.id)
        .then((forecasts) => {
            state.forecast.data = forecasts.find((f) => f.regionId === state.selectedRegion.id) || forecasts[0] || undefined;
            state.forecast.lastUpdate = Date.now();
            state.forecast.lastError = undefined;
            console.log(`pollen: update forecast success for ${state.selectedRegion.name}`);
        })
        .catch((e) => {
            state.forecast.lastError = e.message;
            console.error('pollen: update forecast failure:', e.message);
        });
}

function updateStaticData(state) {
    Promise.all([fetchRegions(), fetchPollenTypes()])
        .then(([regions, pollenTypes]) => {
            state.staticData.regions = regions;
            state.staticData.pollenTypes = pollenTypes;
            state.staticData.lastUpdate = Date.now();
            state.staticData.lastError = undefined;
            // Select nearest region
            if (location.latitude && location.longitude) {
                state.selectedRegion = findNearestRegion(location.latitude, location.longitude, regions);
                if (state.selectedRegion) {
                    console.log(`pollen: selected region: ${state.selectedRegion.name} (${state.selectedRegion.distance.toFixed(0)} km)`);
                    if (!isCacheValid(state.forecast.lastUpdate, getForecastCacheDuration())) updateForecast(state);
                }
            }
            console.log(`pollen: load static data success: ${regions.length} regions, ${pollenTypes.length} pollen types`);
        })
        .catch((e) => {
            state.staticData.lastError = e.message;
            console.error('pollen: load static data failure:', e.message);
        });
}

const _updateSchedule = { intervalId: undefined, currentInterval: undefined };
function updateSchedule(state, location) {
    const interval = getForecastCacheDuration();
    if (_updateSchedule.currentInterval !== interval) {
        if (_updateSchedule.intervalId) clearInterval(_updateSchedule.intervalId);
        _updateSchedule.currentInterval = interval;
        _updateSchedule.intervalId = setInterval(() => updateSchedule(state, location), interval);
    }
    if (!isCacheValid(state.staticData.lastUpdate, STATIC_CACHE_DURATION_MS)) updateStaticData(state);
    else if (state.selectedRegion && !isCacheValid(state.forecast.lastUpdate, getForecastCacheDuration())) updateForecast(state);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretPollen({ results, situation, dataCurrent, store }) {
    if (!store.pollen || !store.pollen.selectedRegion || !store.pollen.forecast.data) return; // Not ready yet

    const { date } = situation;
    const { cloudCover, precipitation, humidity, windSpeed } = dataCurrent;
    const forecast = store.pollen.forecast.data;
    const regionName = store.pollen.selectedRegion.name;
    const { pollenTypes } = store.pollen.staticData;
    const [todayStr] = new Date(date).toISOString().split('T');

    if (forecast.isEndOfSeason) {
        const month = new Date(date).getMonth() + 1;
        if (month >= 1 && month <= 2) {
            results.phenomena.push(`pollen: season not yet started in ${regionName}`);
            results.phenomena.push('pollen: hazel and alder may release on dry sunny days in mild winters');
        } else if (month >= 10 && month <= 12) {
            results.phenomena.push(`pollen: season ended for ${regionName}`);
        }
        return;
    }

    // Active season - interpret levelSeries
    if (!forecast.levelSeries || forecast.levelSeries.length === 0) {
        if (forecast.text) results.phenomena.push(`pollen: ${summarizeSwedishText(forecast.text)}`);
        return;
    }

    const levelsByDate = {};
    for (const entry of forecast.levelSeries) {
        const entryDate = entry.date || entry.startDate;
        if (!levelsByDate[entryDate]) levelsByDate[entryDate] = [];
        levelsByDate[entryDate].push(entry);
    }

    const todayLevels = levelsByDate[todayStr] || [];
    if (todayLevels.length === 0) return;

    // Categorize by severity
    const high = [],
        moderate = [],
        low = [];
    for (const entry of todayLevels) {
        const pollenType = getPollenTypeById(entry.pollenId, pollenTypes);
        const meta = pollenType ? getPollenMetadata(pollenType.name) : undefined;
        const name = pollenType ? pollenType.name : 'Unknown';
        const englishName = meta ? meta.english : name;
        const item = { name, englishName, level: entry.level, meta };
        if (entry.level >= 5) high.push(item);
        else if (entry.level >= 3) moderate.push(item);
        else if (entry.level >= 1) low.push(item);
    }

    if (high.length > 0) {
        results.alerts.push(`pollen: HIGH levels of ${high.map((h) => h.englishName).join(', ')}`);
        for (const h of high) {
            if (h.meta?.severity === 'very high') {
                results.alerts.push(`pollen: ${h.englishName} is major allergen - stay indoors during peak hours`);
            }
            if (h.meta?.foodCrossReaction) {
                results.phenomena.push(`pollen: ${h.englishName} may cross-react with ${h.meta.foodCrossReaction.slice(0, 3).join(', ')}`);
            }
        }
    }

    // Report moderate levels
    if (moderate.length > 0) {
        results.phenomena.push(`pollen: moderate levels of ${moderate.map((m) => m.englishName).join(', ')}`);
    }

    // Report low levels (only if nothing higher)
    if (low.length > 0 && high.length === 0 && moderate.length === 0) {
        results.phenomena.push(`pollen: low levels of ${low.map((l) => l.englishName).join(', ')}`);
    }

    // No significant pollen
    if (high.length === 0 && moderate.length === 0 && low.length === 0) {
        results.phenomena.push(`pollen: no significant levels in ${regionName}`);
    }

    // Weather context for pollen dispersal
    if (high.length > 0 || moderate.length > 0) {
        if (precipitation && precipitation > 0) {
            results.conditions.push('pollen: rain washing pollen from air - temporary relief');
        } else if (humidity && humidity > 80) {
            results.conditions.push('pollen: high humidity reducing airborne levels');
        } else if (windSpeed && windSpeed > 15 && (!cloudCover || cloudCover < 50)) {
            results.conditions.push('pollen: dry windy conditions increasing dispersal - keep windows closed');
        } else if (cloudCover !== undefined && cloudCover < 30 && (!humidity || humidity < 60)) {
            results.conditions.push('pollen: clear dry weather ideal for pollen release');
        }
    }

    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [tomorrowStr] = tomorrow.toISOString().split('T');
    const tomorrowLevels = levelsByDate[tomorrowStr];

    if (tomorrowLevels) {
        const tomorrowHigh = tomorrowLevels.filter((e) => e.level >= 5);
        if (tomorrowHigh.length > 0 && high.length === 0) {
            const names = tomorrowHigh
                .map((e) => {
                    const pollenType = getPollenTypeById(e.pollenId, pollenTypes);
                    const meta = pollenType ? getPollenMetadata(pollenType.name) : undefined;
                    const name = pollenType ? pollenType.name : 'Unknown';
                    return meta ? meta.english : name;
                })
                .join(', ');
            results.phenomena.push(`pollen: high levels of ${names} expected tomorrow`);
        }
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

    updateSchedule(store.pollen, location);

    return {
        interpretPollen,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
