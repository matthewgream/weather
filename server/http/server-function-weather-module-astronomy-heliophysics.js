// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Heliophysics Module - Solar-terrestrial interactions and space weather
// -----------------------------------------------------------------------------------------------------------------------------------------
//
//   - Aurora predictions and real-time monitoring
//   - Geomagnetic activity (Kp, Dst indices)
//   - Solar wind conditions
//   - CME/flare monitoring and alerts
//
//   - NOAA SWPC (Space Weather Prediction Center)
//   - All endpoints at: https://services.swpc.noaa.gov/
//
// -----------------------------------------------------------------------------------------------------------------------------------------

/* eslint-disable sonarjs/cognitive-complexity */

const { FormatHelper } = require('./server-function-weather-tools-format.js');

const ENDPOINTS = {
    kpIndex1m: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    kpForecast: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
    solarWind: 'https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json',
    solarWindMag: 'https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json',
    alerts: 'https://services.swpc.noaa.gov/products/alerts.json',
    auroraOvation: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
};

const INTERVALS = {
    storm: 5 * 60 * 1000, // 5 min during storms
    active: 10 * 60 * 1000, // 10 min when activity rising
    elevated: 15 * 60 * 1000, // 15 min when Kp elevated
    normal: 30 * 60 * 1000, // 30 min normal conditions
    quiet: 60 * 60 * 1000, // 1 hour quiet conditions
    dormant: 2 * 60 * 60 * 1000, // 2 hours summer/daytime
};

const KP_THRESHOLDS = {
    quiet: 2,
    unsettled: 3,
    active: 4,
    minorStorm: 5, // G1
    moderateStorm: 6, // G2
    strongStorm: 7, // G3
    severeStorm: 8, // G4
    extremeStorm: 9, // G5
};

const BZ_THRESHOLDS = {
    slightlySouth: -2, // Slight enhancement possible
    moderatelySouth: -5, // Good aurora chance
    stronglySouth: -10, // Strong aurora likely
    extremelySouth: -20, // Major storm conditions
};

const BT_THRESHOLDS = {
    elevated: 10, // Notable total field
    strong: 20, // Strong field - activity likely approaching
    extreme: 30, // Extreme field
};

const STALENESS = {
    kpIndex: 2 * 60 * 60 * 1000, // 2 hours
    solarWind: 30 * 60 * 1000, // 30 min
    solarWindMag: 15 * 60 * 1000, // 15 min - Bz changes rapidly
    alerts: 60 * 60 * 1000, // 1 hour
    forecast: 6 * 60 * 60 * 1000, // 6 hours
    ovation: 30 * 60 * 1000, // 30 min - model updates ~30min
};

const KP_MONTHLY_BASELINE = {
    0: 1.5,
    1: 2,
    2: 2.5,
    3: 2.8,
    4: 1.8,
    5: 1.5,
    6: 1.2,
    7: 1.5,
    8: 2.8,
    9: 3,
    10: 2.5,
    11: 2,
};

// Latitude thresholds for aurora visibility at different Kp levels
const AURORA_VISIBILITY_THRESHOLDS = [
    { kp: 0, geomagLat: 66 },
    { kp: 1, geomagLat: 64 },
    { kp: 2, geomagLat: 62 },
    { kp: 3, geomagLat: 60 },
    { kp: 4, geomagLat: 58 },
    { kp: 5, geomagLat: 56 },
    { kp: 6, geomagLat: 54 },
    { kp: 7, geomagLat: 52 },
    { kp: 8, geomagLat: 50 },
    { kp: 9, geomagLat: 48 },
];

const STORM_LEVELS = {
    5: 'G1 (minor)',
    6: 'G2 (moderate)',
    7: 'G3 (strong)',
    8: 'G4 (severe)',
    9: 'G5 (extreme)',
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getStatisticalKp(month, year) {
    const solarCyclePhase = (((year - 2025) % 11) + 11) % 11;
    const solarMultiplier = 1 + 0.5 * Math.cos((solarCyclePhase * 2 * Math.PI) / 11);
    return KP_MONTHLY_BASELINE[month] * solarMultiplier;
}

function calculateGeomagneticLatitude(geoLat, geoLon) {
    // Simplified dipole model - geomagnetic north pole ~80.5°N, 72.8°W
    const poleLat = (80.5 * Math.PI) / 180;
    const poleLon = (-72.8 * Math.PI) / 180;
    const lat = (geoLat * Math.PI) / 180;
    const lon = (geoLon * Math.PI) / 180;
    return (Math.asin(Math.sin(lat) * Math.sin(poleLat) + Math.cos(lat) * Math.cos(poleLat) * Math.cos(lon - poleLon)) * 180) / Math.PI;
}

function getAuroraVisibilityAtKp(kp) {
    return AURORA_VISIBILITY_THRESHOLDS.find((t) => t.kp >= kp)?.geomagLat || 66;
}

function predictAuroraVisibility(location, kp) {
    if (!location?.latitude || !location?.longitude) return undefined;
    const geomagLat = calculateGeomagneticLatitude(location.latitude, location.longitude);
    const visibilityThreshold = getAuroraVisibilityAtKp(Math.floor(kp));
    const margin = geomagLat - visibilityThreshold;
    let position;
    if (margin > 10) position = 'overhead';
    else if (margin > 5) position = 'high';
    else if (margin > 0) position = 'northern horizon';
    else if (margin > -5) position = 'below horizon marginal';
    else position = 'not visible';
    return {
        geomagneticLatitude: Math.round(geomagLat * 10) / 10,
        visibilityThreshold,
        isVisible: geomagLat >= visibilityThreshold,
        margin: Math.round(margin * 10) / 10,
        position,
    };
}

function getStormLevelString(kp) {
    const level = Math.min(Math.floor(kp), 9);
    return STORM_LEVELS[level] || `${level} Kp`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

async function fetchKpIndex(state) {
    if (!state.kpIndex) state.kpIndex = {};
    try {
        const response = await fetch(ENDPOINTS.kpIndex1m);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const _fetched = Date.now();
        //
        const recent = data.slice(-180);
        const latest = data[data.length - 1];
        const latestFinalized = [...recent].reverse().find((d) => d.kp && d.kp.endsWith('o'));
        const kpValues = recent.map((d) => d.kp_index).filter((k) => k !== null && k !== undefined);
        const max3h = kpValues.length > 0 ? kpValues.reduce((a, b) => Math.max(a, b)) : undefined;
        const avg3h = kpValues.length > 0 ? kpValues.reduce((a, b) => a + b, 0) / kpValues.length : undefined;
        const ago15m = data[data.length - 15];
        const ago1h = data[data.length - 60];
        const ago3h = data[data.length - 180] ?? data[0];
        const current = latestFinalized?.kp_index ?? latest?.kp_index;
        state.kpIndex.data = {
            _fetched,
            current,
            estimated: latest?.estimated_kp,
            kpString: latestFinalized?.kp ?? latest?.kp,
            timestamp: latest?.time_tag,
            stats: { max3h, avg3h: avg3h === undefined ? undefined : Math.round(avg3h * 100) / 100 },
            trend: {
                delta15m: ago15m ? current - ago15m.kp_index : undefined,
                delta1h: ago1h ? current - ago1h.kp_index : undefined,
                delta3h: ago3h ? current - ago3h.kp_index : undefined,
            },
            derived: {
                isRising: ago1h ? current > ago1h.kp_index : false,
                isStorm: max3h !== undefined && max3h >= KP_THRESHOLDS.minorStorm,
                stormLevel: max3h !== undefined && max3h >= KP_THRESHOLDS.minorStorm ? getStormLevelString(max3h) : undefined,
            },
        };
        state.kpIndex.lastUpdate = _fetched;
        state.kpIndex.lastError = undefined;
        console.error(`heliophysics: update Kp success (Kp=${current})`);
        return state.kpIndex.data;
    } catch (e) {
        state.kpIndex.lastError = e.message;
        console.error('heliophysics: update Kp failure:', e.message);
        return undefined;
    }
}

async function fetchKpForecast(state) {
    if (!state.kpForecast) state.kpForecast = {};
    try {
        const response = await fetch(ENDPOINTS.kpForecast);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const _fetched = Date.now();
        //
        const forecasts = data
            .slice(1)
            .map((row) => ({ time: row[0], kp: Number.parseFloat(row[1]) }))
            .filter((f) => !Number.isNaN(f.kp));
        const next24h = forecasts.slice(0, 8);
        const max24h = next24h.length > 0 ? next24h.map((f) => f.kp).reduce((a, b) => Math.max(a, b)) : undefined;
        // Find when peak occurs for timing info
        const peakBinIndex = next24h?.findIndex((f) => f.kp === max24h);
        // Each bin is 3 hours, so bin 0-1 = within 6h, 2-3 = within 12h, 4-7 = within 24h
        let peakTiming;
        if (peakBinIndex !== undefined && peakBinIndex >= 0) {
            if (peakBinIndex <= 1) peakTiming = 'within 6h';
            else if (peakBinIndex <= 3) peakTiming = 'within 12h';
            else peakTiming = 'within 24h';
        }
        state.kpForecast.data = {
            _fetched,
            forecasts,
            next24h,
            max24h,
            peakTiming,
            stormExpected: max24h !== undefined && max24h >= KP_THRESHOLDS.minorStorm,
        };
        state.kpForecast.lastUpdate = _fetched;
        state.kpForecast.lastError = undefined;
        console.error(`heliophysics: update Kp forecast success (max24h=${max24h})`);
        return state.kpForecast.data;
    } catch (e) {
        state.kpForecast.lastError = e.message;
        console.error('heliophysics: update Kp forecast failure:', e.message);
        return undefined;
    }
}

async function fetchSolarWind(state) {
    if (!state.solarWind) state.solarWind = {};
    try {
        const response = await fetch(ENDPOINTS.solarWind);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const _fetched = Date.now();
        //
        const recent = data.slice(-60);
        const latest = recent[recent.length - 1];
        if (!latest) throw new Error('No data');
        const speeds = recent.map((d) => Number.parseFloat(d[2])).filter((v) => !Number.isNaN(v));
        const densities = recent.map((d) => Number.parseFloat(d[1])).filter((v) => !Number.isNaN(v));
        state.solarWind.data = {
            _fetched,
            timestamp: latest[0],
            density: Number.parseFloat(latest[1]),
            speed: Number.parseFloat(latest[2]),
            temperature: Number.parseFloat(latest[3]),
            stats: {
                avgSpeed: speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : undefined,
                maxSpeed: speeds.length > 0 ? speeds.reduce((a, b) => Math.max(a, b)) : undefined,
                avgDensity: densities.length > 0 ? Math.round((densities.reduce((a, b) => a + b, 0) / densities.length) * 10) / 10 : undefined,
            },
            derived: {
                isHighSpeed: Number.parseFloat(latest[2]) > 500,
                isVeryHighSpeed: Number.parseFloat(latest[2]) > 700,
                isDense: Number.parseFloat(latest[1]) > 10,
            },
        };
        state.solarWind.lastUpdate = _fetched;
        state.solarWind.lastError = undefined;
        console.error(`heliophysics: update solarWind success (${state.solarWind.data.speed} km/s)`);
        return state.solarWind.data;
    } catch (e) {
        state.solarWind.lastError = e.message;
        console.error('heliophysics: update solarWind failure:', e.message);
        return undefined;
    }
}

async function fetchSolarWindMag(state) {
    if (!state.solarWindMag) state.solarWindMag = {};
    try {
        const response = await fetch(ENDPOINTS.solarWindMag);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const _fetched = Date.now();
        //
        // Data format: [time_tag, bx_gsm, by_gsm, bz_gsm, lon_gsm, lat_gsm, bt]
        const recent = data.slice(-60); // Last hour
        const latest = recent[recent.length - 1];
        if (!latest) throw new Error('No data');
        const bzValues = recent.map((d) => Number.parseFloat(d[3])).filter((v) => !Number.isNaN(v));
        const btValues = recent.map((d) => Number.parseFloat(d[6])).filter((v) => !Number.isNaN(v));
        const bzCurrent = Number.parseFloat(latest[3]);
        const btCurrent = Number.parseFloat(latest[6]);
        const bzAvg = bzValues.length > 0 ? bzValues.reduce((a, b) => a + b, 0) / bzValues.length : undefined;
        const bzMin = bzValues.length > 0 ? bzValues.reduce((a, b) => Math.min(a, b)) : undefined;
        const btMax = btValues.length > 0 ? bzValues.reduce((a, b) => Math.max(a, b)) : undefined;
        // Check for sustained southward Bz (important for aurora)
        const bzRecent = bzValues.slice(-15); // Last 15 minutes
        const sustainedSouth = bzRecent.length > 10 && bzRecent.every((bz) => bz < BZ_THRESHOLDS.slightlySouth);
        state.solarWindMag.data = {
            _fetched,
            timestamp: latest[0],
            bx: Number.parseFloat(latest[1]),
            by: Number.parseFloat(latest[2]),
            bz: bzCurrent,
            bt: btCurrent,
            stats: {
                avgBz: bzAvg === undefined ? undefined : Math.round(bzAvg * 10) / 10,
                minBz: bzMin === undefined ? undefined : Math.round(bzMin * 10) / 10,
                maxBt: btMax === undefined ? undefined : Math.round(btMax * 10) / 10,
            },
            derived: {
                isSouth: bzCurrent < BZ_THRESHOLDS.slightlySouth,
                isStronglySouth: bzCurrent < BZ_THRESHOLDS.stronglySouth,
                sustainedSouth,
                auroraFavorable: bzCurrent < BZ_THRESHOLDS.moderatelySouth || sustainedSouth,
                isBtStrong: btCurrent > BT_THRESHOLDS.strong,
                isBtElevated: btCurrent > BT_THRESHOLDS.elevated,
            },
        };
        state.solarWindMag.lastUpdate = _fetched;
        state.solarWindMag.lastError = undefined;
        console.error(`heliophysics: update Bz success (Bz=${bzCurrent.toFixed(1)} nT, Bt=${btCurrent.toFixed(1)} nT)`);
        return state.solarWindMag.data;
    } catch (e) {
        state.solarWindMag.lastError = e.message;
        console.error('heliophysics: update Bz failure:', e.message);
        return undefined;
    }
}

async function fetchOvation(state, location) {
    if (!location?.latitude || !location?.longitude) return undefined;
    if (!state.ovation) state.ovation = {};
    try {
        const response = await fetch(ENDPOINTS.auroraOvation);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const _fetched = Date.now();
        //
        // Ovation data is a grid of aurora probabilities
        // Format: { "Observation Time": "...", "Forecast Time": "...", "coordinates": [[lon, lat, prob], ...] }
        const { coordinates } = data;
        if (!coordinates?.length) throw new Error('No coordinate data');
        // Find nearest grid point to our location
        // Ovation uses longitude 0-360, we need to convert
        const targetLon = location.longitude < 0 ? location.longitude + 360 : location.longitude;
        const targetLat = location.latitude;
        let nearest;
        let nearestDist = Infinity;
        for (const point of coordinates) {
            const [lon, lat, prob] = point;
            // eslint-disable-next-line
            const dist = Math.sqrt((lon - targetLon) ** 2 + (lat - targetLat) ** 2);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = { lon, lat, probability: prob };
            }
        }
        // Also find max probability in northern region for context
        const northernPoints = coordinates.filter(([, lat]) => lat > 50);
        const maxNorthern = northernPoints.length > 0 ? northernPoints.map(([_a, _b, prob]) => prob).reduce((a, b) => Math.max(a, b)) : undefined;
        // Find the aurora oval boundary (where probability > 10%)
        const ovalPoints = coordinates.filter(([_a, _b, prob]) => prob > 10);
        const southernmostOval = ovalPoints.length > 0 ? ovalPoints.map(([, lat]) => lat).reduce((a, b) => Math.min(a, b)) : undefined;
        state.ovation.data = {
            _fetched,
            observationTime: data['Observation Time'],
            forecastTime: data['Forecast Time'],
            location: {
                probability: nearest?.probability ?? 0,
                gridLat: nearest?.lat,
                gridLon: nearest?.lon,
                distanceToGrid: Math.round(nearestDist * 10) / 10,
            },
            oval: {
                maxProbability: maxNorthern,
                southernBoundary: southernmostOval,
            },
            derived: {
                isInOval: nearest?.probability > 10,
                isLikely: nearest?.probability > 30,
                isHighProbability: nearest?.probability > 50,
            },
        };
        state.ovation.lastUpdate = _fetched;
        state.ovation.lastError = undefined;
        console.error(`heliophysics: update Ovation success (prob=${nearest?.probability}% at ${targetLat.toFixed(1)}°N)`);
        return state.ovation.data;
    } catch (e) {
        state.ovation.lastError = e.message;
        console.error('heliophysics: update Ovation failure:', e.message);
        return undefined;
    }
}

async function fetchAlerts(state) {
    if (!state.alerts) state.alerts = {};
    try {
        const response = await fetch(ENDPOINTS.alerts);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const _fetched = Date.now();
        //
        const recent = data.filter((alert) => new Date(alert.issue_datetime).getTime() > Date.now() - 24 * 60 * 60 * 1000);
        state.alerts.data = {
            _fetched,
            all: recent,
            geomagnetic: recent.filter((a) => a.message?.includes('Geomagnetic') || a.message?.includes('K-index')),
            solar: recent.filter((a) => a.message?.includes('Solar') || a.message?.includes('Flare') || a.message?.includes('CME')),
            hasActiveWarning: recent.some((a) => a.message?.includes('Warning') || a.message?.includes('Watch')),
            hasActiveAlert: recent.some((a) => a.message?.includes('Alert')),
        };
        state.alerts.lastUpdate = _fetched;
        state.alerts.lastError = undefined;
        console.error(`heliophysics: update alerts success (${recent.length} active)`);
        return state.alerts.data;
    } catch (e) {
        state.alerts.lastError = e.message;
        console.error('heliophysics: update alerts failure:', e.message);
        return undefined;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getKpIndex(state) {
    if (!state.kpIndex?.data) return undefined;
    if (Date.now() - state.kpIndex.lastUpdate > STALENESS.kpIndex) return undefined;
    return state.kpIndex.data;
}

function getKpForecast(state) {
    if (!state.kpForecast?.data) return undefined;
    if (Date.now() - state.kpForecast.lastUpdate > STALENESS.forecast) return undefined;
    return state.kpForecast.data;
}

function getSolarWind(state) {
    if (!state.solarWind?.data) return undefined;
    if (Date.now() - state.solarWind.lastUpdate > STALENESS.solarWind) return undefined;
    return state.solarWind.data;
}

function getSolarWindMag(state) {
    if (!state.solarWindMag?.data) return undefined;
    if (Date.now() - state.solarWindMag.lastUpdate > STALENESS.solarWindMag) return undefined;
    return state.solarWindMag.data;
}

function getOvation(state) {
    if (!state.ovation?.data) return undefined;
    if (Date.now() - state.ovation.lastUpdate > STALENESS.ovation) return undefined;
    return state.ovation.data;
}

function getAlerts(state) {
    if (!state.alerts?.data) return undefined;
    if (Date.now() - state.alerts.lastUpdate > STALENESS.alerts) return undefined;
    return state.alerts.data;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

async function updateAll(state, situation) {
    await Promise.all([fetchKpIndex(state), fetchSolarWind(state), fetchSolarWindMag(state), fetchAlerts(state)]);
    if (!state?.kpForecast || Date.now() - state.kpForecast.lastUpdate > STALENESS.forecast) await fetchKpForecast(state);
    if (situation?.location && (!state.ovation || Date.now() - state.ovation.lastUpdate > STALENESS.ovation)) await fetchOvation(state, situation.location);
}

function updateIntervalCalculator(state, situation) {
    const kpData = getKpIndex(state);
    const currentKp = kpData?.current ?? 0;
    if ((kpData?.derived?.isStorm ?? false) || currentKp >= KP_THRESHOLDS.minorStorm) return [INTERVALS.storm, 'storm'];
    if ((kpData?.derived?.isRising ?? false) && currentKp >= KP_THRESHOLDS.unsettled) return [INTERVALS.active, 'rising'];
    const month = new Date().getMonth(),
        hour = new Date().getHours();
    if (situation.location?.latitude > 55) {
        if ((month >= 9 || month <= 3) && (hour >= 18 || hour <= 6)) {
            if (currentKp >= KP_THRESHOLDS.unsettled) return [INTERVALS.active, 'winter-active'];
            if (currentKp >= KP_THRESHOLDS.quiet) return [INTERVALS.elevated, 'winter-possible'];
            return [INTERVALS.normal, 'winter-quiet'];
        } else if ((month >= 2 && month <= 3) || (month >= 8 && month <= 9)) return hour >= 20 || hour <= 4 ? [INTERVALS.elevated, 'equinox-night'] : [INTERVALS.normal, 'equinox-day'];
        else if (month >= 5 && month <= 7) return [INTERVALS.dormant, 'summer'];
    }
    if (hour >= 6 && hour <= 18) return [INTERVALS.quiet, 'daytime'];
    return [INTERVALS.quiet, 'default'];
}
const _updateSchedule = { intervalId: undefined, currentInterval: undefined };
function updateSchedule(state, situation) {
    updateAll(state, situation).then(() => {
        const [interval, reason] = updateIntervalCalculator(state, situation);
        if (_updateSchedule.currentInterval !== interval) {
            if (_updateSchedule.intervalId) clearInterval(_updateSchedule.intervalId);
            _updateSchedule.currentInterval = interval;
            _updateSchedule.intervalId = setInterval(() => updateSchedule(state, situation), interval);
            console.error(`heliophysics: update interval set to ${FormatHelper.millisToString(interval)} ('${reason}')`);
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
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

function interpretSpaceWeather({ results, situation, store }) {
    const ts = createTimestampTracker(situation.now, situation.location.timezone);

    const kpData = getKpIndex(store.astronomy_heliophysics);
    if (kpData) {
        const kp = kpData.current;
        if (kp >= KP_THRESHOLDS.extremeStorm) results.alerts.push(`space: ${ts.get('kp', kpData._fetched)}G5 extreme geomagnetic storm (${FormatHelper.kpToString(kp)})`);
        else if (kp >= KP_THRESHOLDS.severeStorm) results.alerts.push(`space: ${ts.get('kp', kpData._fetched)}G4 severe geomagnetic storm (${FormatHelper.kpToString(kp)})`);
        else if (kp >= KP_THRESHOLDS.strongStorm) results.alerts.push(`space: ${ts.get('kp', kpData._fetched)}G3 strong geomagnetic storm (${FormatHelper.kpToString(kp)})`);
        else if (kp >= KP_THRESHOLDS.moderateStorm) results.alerts.push(`space: ${ts.get('kp', kpData._fetched)}G2 moderate geomagnetic storm (${FormatHelper.kpToString(kp)})`);
        else if (kp >= KP_THRESHOLDS.minorStorm) results.alerts.push(`space: ${ts.get('kp', kpData._fetched)}G1 minor geomagnetic storm (${FormatHelper.kpToString(kp)})`);
        else if (kp >= KP_THRESHOLDS.active) results.phenomena.push(`space: ${ts.get('kp', kpData._fetched)}active geomagnetic conditions (${FormatHelper.kpToString(kp)})`);
        else if (kp >= KP_THRESHOLDS.unsettled) results.phenomena.push(`space: ${ts.get('kp', kpData._fetched)}unsettled geomagnetic conditions (${FormatHelper.kpToString(kp)})`);
        if (kpData.trend.delta1h > 2) results.alerts.push(`space: ${ts.get('kp', kpData._fetched)}activity rapidly increasing - monitor conditions`);
        else if (kpData.trend.delta1h > 1) results.phenomena.push(`space: ${ts.get('kp', kpData._fetched)}activity increasing`);
        else if (kpData.trend.delta1h < -2) results.phenomena.push(`space: ${ts.get('kp', kpData._fetched)}activity decreasing`);
    }

    const solarWind = getSolarWind(store.astronomy_heliophysics);
    if (solarWind) {
        if (solarWind.derived.isVeryHighSpeed) results.phenomena.push(`space: ${ts.get('wind', solarWind._fetched)}very high speed solar wind stream (${FormatHelper.distanceKmToString(solarWind.speed)}/s)`);
        else if (solarWind.derived.isHighSpeed) results.phenomena.push(`space: ${ts.get('wind', solarWind._fetched)}high speed solar wind stream (${FormatHelper.distanceKmToString(solarWind.speed)}/s)`);
        if (solarWind.derived.isDense) results.phenomena.push(`space: ${ts.get('wind', solarWind._fetched)}solar wind density enhancement (${FormatHelper.densityToString(solarWind.density)}) - possible CME arrival`);
    }

    const bzData = getSolarWindMag(store.astronomy_heliophysics);
    if (bzData) {
        if (bzData.bz < BZ_THRESHOLDS.extremelySouth) results.alerts.push(`space: ${ts.get('bz', bzData._fetched)}IMF extremely southward (${FormatHelper.magneticFieldToString(bzData.bz)}) - major storm driver`);
        else if (bzData.bz < BZ_THRESHOLDS.stronglySouth) results.alerts.push(`space: ${ts.get('bz', bzData._fetched)}IMF strongly southward (${FormatHelper.magneticFieldToString(bzData.bz)})`);
        else if (bzData.derived.sustainedSouth) results.phenomena.push(`space: ${ts.get('bz', bzData._fetched)}IMF sustained southward (${FormatHelper.magneticFieldToString(bzData.stats.avgBz)} avg)`);
        if (bzData.derived.isBtStrong && bzData.bz > BZ_THRESHOLDS.slightlySouth)
            results.phenomena.push(`space: ${ts.get('bz', bzData._fetched)}strong total field (${FormatHelper.magneticFieldToString(bzData.bt)}) with neutral Bz - activity may increase if Bz turns south`);
        else if (bzData.derived.isBtElevated && !bzData.derived.isSouth) results.phenomena.push(`space: ${ts.get('bz', bzData._fetched)}elevated total field (${FormatHelper.magneticFieldToString(bzData.bt)}) - watch for Bz changes`);
    }

    const alerts = getAlerts(store.astronomy_heliophysics);
    if (alerts) {
        if (alerts.hasActiveAlert) results.alerts.push(`space: ${ts.get('alerts', alerts._fetched)}NOAA alert active`);
        else if (alerts.hasActiveWarning) results.phenomena.push(`space: ${ts.get('alerts', alerts._fetched)}NOAA warning active`);
    }

    const forecast = getKpForecast(store.astronomy_heliophysics);
    if (forecast?.stormExpected) {
        results.phenomena.push(`space: ${ts.get('forecast', forecast._fetched)}storm conditions expected ${forecast.peakTiming || 'within 24h'} (max ${FormatHelper.kpToString(forecast.max24h)})`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAurora({ results, situation, dataCurrent, store }) {
    const { location, month, hour, daylight, year, lunar, now } = situation;
    const { cloudCover, snowDepth, temp, humidity } = dataCurrent;
    const ts = createTimestampTracker(now, location.timezone);

    if (!location?.latitude || location.latitude <= 45) return;
    if (cloudCover !== undefined && cloudCover >= 70) return;
    if (daylight?.isDaytime) return;
    if (hour >= 6 && hour <= 16) return;
    if (month >= 5 && month <= 7 && location.latitude < 65) return;

    const kpData = getKpIndex(store.astronomy_heliophysics);
    const currentKp = kpData?.current ?? getStatisticalKp(month, year);
    const isRealtime = kpData !== undefined;
    const visibility = predictAuroraVisibility(location, currentKp);
    if (!visibility) return;

    const bzData = getSolarWindMag(store.astronomy_heliophysics);
    const ovationData = getOvation(store.astronomy_heliophysics);

    // *** Primary aurora prediction using Ovation model (most accurate) ***
    if (ovationData?.location) {
        const ovTs = ts.get('ovation', ovationData._fetched);
        const prob = ovationData.location.probability;
        if (prob > 50) results.alerts.push(`aurora: ${ovTs}high probability at your location (${FormatHelper.probabilityToString(prob)})`);
        else if (prob > 30) results.phenomena.push(`aurora: ${ovTs}likely visible (${FormatHelper.probabilityToString(prob)})`);
        else if (prob > 10) results.phenomena.push(`aurora: ${ovTs}possible (${FormatHelper.probabilityToString(prob)}) - ${visibility.position}`);
        else if (ovationData.oval.southernBoundary && location.latitude > ovationData.oval.southernBoundary - 5)
            results.phenomena.push(`aurora: ${ovTs}oval ${Math.round(location.latitude - ovationData.oval.southernBoundary)}° north - watch for expansion`);
    }
    // *** Fallback to Kp-based prediction ***
    else if (isRealtime) {
        const kpTs = ts.get('kp_aurora', kpData._fetched);
        if (visibility.isVisible) results.phenomena.push(`aurora: ${kpTs}${currentKp >= KP_THRESHOLDS.minorStorm ? 'active' : 'possible'} (${FormatHelper.kpToString(currentKp)}) - ${visibility.position}`);
        else if (visibility.margin > -3) results.phenomena.push(`aurora: ${kpTs}watch northern horizon if Kp rises (currently ${FormatHelper.kpToString(currentKp)}, need ${Math.ceil(currentKp - visibility.margin)}+)`);
    }
    // *** Statistical fallback ***
    else {
        if (visibility.isVisible) results.phenomena.push(`aurora: possible tonight (statistical ${FormatHelper.kpToString(currentKp)})`);
        results.phenomena.push('aurora: real-time data unavailable - using seasonal estimates');
    }

    // *** Bz component - crucial aurora driver ***
    if (bzData) {
        const bzTs = ts.get('bz_aurora', bzData._fetched);
        if (bzData.derived.isStronglySouth) results.alerts.push(`aurora: ${bzTs}Bz strongly southward (${FormatHelper.magneticFieldToString(bzData.bz)}) - activity imminent`);
        else if (bzData.derived.sustainedSouth) results.phenomena.push(`aurora: ${bzTs}Bz sustained southward (${FormatHelper.magneticFieldToString(bzData.stats.avgBz)} avg) - favorable conditions`);
        else if (bzData.derived.isSouth) results.phenomena.push(`aurora: ${bzTs}Bz southward (${FormatHelper.magneticFieldToString(bzData.bz)}) - enhanced activity possible`);
        else if (bzData.bz > 5) results.phenomena.push(`aurora: ${bzTs}Bz northward - quiet conditions expected`);
    }

    // *** Storm alerts from Kp ***
    if (kpData?.derived?.isStorm) {
        const kpTs = ts.get('kp_aurora', kpData._fetched);
        results.alerts.push(`aurora: ${kpTs}${kpData.derived.stormLevel} geomagnetic storm in progress`);
    }

    // *** Activity trend ***
    if (kpData?.trend?.delta1h > 1) {
        const kpTs = ts.get('kp_aurora', kpData._fetched);
        results.phenomena.push(`aurora: ${kpTs}activity increasing - keep watching`);
    }

    // *** Seasonal enhancement ***
    if ((month >= 2 && month <= 3) || (month >= 8 && month <= 10)) {
        results.phenomena.push('aurora: equinoctial enhancement period');
    }

    // *** Viewing conditions (only if aurora mentioned) ***
    const hasAuroraContent = results.phenomena.some((p) => p.includes('aurora')) || results.alerts.some((a) => a.includes('aurora'));
    if (hasAuroraContent) {
        if (cloudCover !== undefined) {
            if (cloudCover < 20) results.phenomena.push('aurora: excellent sky conditions');
            else if (cloudCover < 40) results.phenomena.push('aurora: good sky conditions');
            else results.phenomena.push('aurora: partial cloud - gaps may allow viewing');
        }
        if (lunar?.brightness !== undefined && lunar.brightness < 20) results.phenomena.push('aurora: dark skies - excellent for photography');
        else if (lunar?.brightness > 70 && lunar.position?.altitude > 20) results.phenomena.push('aurora: moonlight may wash out faint displays');
        if (snowDepth !== undefined && snowDepth > 20) results.phenomena.push('aurora: snow reflection may enhance perceived brightness');
        if (temp !== undefined && temp < -20 && humidity !== undefined && humidity < 50) results.phenomena.push('aurora: excellent definition expected (cold dry air)');
        if (temp !== undefined && temp < -30 && humidity !== undefined && humidity < 30 && location.elevation > 200) results.phenomena.push('aurora: audible sounds possible in these conditions (rare)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ location, store }) {
    if (!store.astronomy_heliophysics) store.astronomy_heliophysics = {};

    updateSchedule(store.astronomy_heliophysics, { location });

    return {
        interpretSpaceWeather,
        interpretAurora,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
