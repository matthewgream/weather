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

const { calculateGeomagneticLatitude } = require('./server-function-weather-tools-calculators.js');
const { FormatHelper } = require('./server-function-weather-tools-format.js');
const { DataSlot, DataScheduler, fetchJson, createTimestampTracker } = require('./server-function-weather-tools-live.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

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

function getAuroraVisibilityAtKp(kp) {
    return AURORA_VISIBILITY_THRESHOLDS.find((t) => t.kp >= kp)?.geomagLat || 66;
}

function predictAuroraVisibility(location, kp) {
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

const liveSlotHelioKpIndex = new DataSlot('kpIndex', STALENESS.kpIndex);
const liveSlotHelioKpForecast = new DataSlot('kpForecast', STALENESS.forecast);
const liveSlotHelioSolarWind = new DataSlot('solarWind', STALENESS.solarWind);
const liveSlotHelioSolarWindMag = new DataSlot('solarWindMag', STALENESS.solarWindMag);
const liveSlotHelioAuroraOvation = new DataSlot('ovation', STALENESS.ovation);
const liveSlotHelioAlerts = new DataSlot('alerts', STALENESS.alerts);
const liveScheduler = new DataScheduler('heliophysics');

async function liveHelioFetchKpIndex(state) {
    return liveSlotHelioKpIndex.fetch(
        state,
        'heliophysics',
        async () => {
            const data = await fetchJson(ENDPOINTS.kpIndex1m);
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
            return {
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
        },
        `Kp=${liveSlotHelioKpIndex.get(state)?.current || '?'}`
    );
}

async function liveHelioFetchKpForecast(state) {
    return liveSlotHelioKpForecast.fetch(
        state,
        'heliophysics',
        async () => {
            const data = await fetchJson(ENDPOINTS.kpForecast);
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
            return {
                forecasts,
                next24h,
                max24h,
                peakTiming,
                stormExpected: max24h !== undefined && max24h >= KP_THRESHOLDS.minorStorm,
            };
        },
        `max24h=${liveSlotHelioKpForecast.get(state)?.max24h || '?'}`
    );
}

async function liveHelioFetchSolarWind(state) {
    return liveSlotHelioSolarWind.fetch(
        state,
        'heliophysics',
        async () => {
            const data = await fetchJson(ENDPOINTS.solarWind);
            const recent = data.slice(-60);
            const latest = recent[recent.length - 1];
            if (!latest) throw new Error('No data');
            const speeds = recent.map((d) => Number.parseFloat(d[2])).filter((v) => !Number.isNaN(v));
            const densities = recent.map((d) => Number.parseFloat(d[1])).filter((v) => !Number.isNaN(v));
            return {
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
        },
        `${liveSlotHelioSolarWind.get(state)?.speed || '?'} km/s`
    );
}

async function liveHelioFetchSolarWindMag(state) {
    return liveSlotHelioSolarWindMag.fetch(
        state,
        'heliophysics',
        async () => {
            const data = await fetchJson(ENDPOINTS.solarWindMag);
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
            return {
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
        },
        `Bz=${liveSlotHelioSolarWindMag.get(state)?.bz?.toFixed(1) || '?'} nT`
    );
}

async function liveHelioFetchAuroraOvation(state, situation) {
    const { location } = situation;

    return liveSlotHelioAuroraOvation.fetch(
        state,
        'heliophysics',
        async () => {
            const data = await fetchJson(ENDPOINTS.auroraOvation);
            // Ovation data is a grid of aurora probabilities
            // Format: { "Observation Time": "...", "Forecast Time": "...", "coordinates": [[lon, lat, prob], ...] }
            const { coordinates } = data;
            if (!coordinates?.length) throw new Error('No coordinate data');
            // Find nearest grid point to our location
            // Ovation uses longitude 0-360, we need to convert
            const targetLon = location.longitude < 0 ? location.longitude + 360 : location.longitude;
            const targetLat = location.latitude;
            let nearest;
            for (const point of coordinates) {
                const [lon, lat, probability] = point;
                // eslint-disable-next-line
                const dist = Math.sqrt((lon - targetLon) ** 2 + (lat - targetLat) ** 2);
                if (nearest && dist < nearest.dist) nearest = { lon, lat, dist, probability };
            }
            // Also find max probability in northern region for context
            const northernPoints = coordinates.filter(([, lat]) => lat > 50);
            const maxNorthern = northernPoints.length > 0 ? northernPoints.map(([_a, _b, prob]) => prob).reduce((a, b) => Math.max(a, b)) : undefined;
            // Find the aurora oval boundary (where probability > 10%)
            const ovalPoints = coordinates.filter(([_a, _b, prob]) => prob > 10);
            const southernmostOval = ovalPoints.length > 0 ? ovalPoints.map(([, lat]) => lat).reduce((a, b) => Math.min(a, b)) : undefined;
            return {
                observationTime: data['Observation Time'],
                forecastTime: data['Forecast Time'],
                location: {
                    probability: nearest?.probability ?? 0,
                    gridLat: nearest?.lat,
                    gridLon: nearest?.lon,
                    distanceToGrid: nearest?.dist ? Math.round(nearest.dist * 10) / 10 : undefined,
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
        },
        `prob=${liveSlotHelioAuroraOvation.get(state)?.location?.probability || '?'}%`
    );
}

async function liveHelioFetchAlerts(state) {
    return liveSlotHelioAlerts.fetch(
        state,
        'heliophysics',
        async () => {
            const data = await fetchJson(ENDPOINTS.alerts);
            const recent = data.filter((alert) => new Date(alert.issue_datetime).getTime() > Date.now() - 24 * 60 * 60 * 1000);
            return {
                all: recent,
                geomagnetic: recent.filter((a) => a.message?.includes('Geomagnetic') || a.message?.includes('K-index')),
                solar: recent.filter((a) => a.message?.includes('Solar') || a.message?.includes('Flare') || a.message?.includes('CME')),
                hasActiveWarning: recent.some((a) => a.message?.includes('Warning') || a.message?.includes('Watch')),
                hasActiveAlert: recent.some((a) => a.message?.includes('Alert')),
            };
        },
        `${liveSlotHelioAlerts.get(state)?.all?.length || 0} active`
    );
}

// -----------------------------------------------------------------------------------------------------------------------------------------

async function liveHelioFetchAndProcess(state, situation) {
    await Promise.all([liveHelioFetchKpIndex(state), liveHelioFetchSolarWind(state), liveHelioFetchSolarWindMag(state), liveHelioFetchAlerts(state)]);
    if (liveSlotHelioKpForecast.isStale(state)) await liveHelioFetchKpForecast(state);
    if (liveSlotHelioAuroraOvation.isStale(state)) await liveHelioFetchAuroraOvation(state, situation);
}

function liveHelioCalculateUpdateInterval(state, situation) {
    const { location } = situation;
    const kpData = getKpIndex(state);
    const currentKp = kpData?.current ?? 0;
    if ((kpData?.derived?.isStorm ?? false) || currentKp >= KP_THRESHOLDS.minorStorm) return [INTERVALS.storm, 'storm'];
    if ((kpData?.derived?.isRising ?? false) && currentKp >= KP_THRESHOLDS.unsettled) return [INTERVALS.active, 'rising'];
    const month = new Date().getMonth(),
        hour = new Date().getHours();
    if (location.latitude > 55) {
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

function liveSchedulerStart(state, situation) {
    liveScheduler.run(
        () => liveHelioFetchAndProcess(state, situation),
        () => liveHelioCalculateUpdateInterval(state, situation)
    );
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getKpIndex(state) {
    return liveSlotHelioKpIndex.get(state);
}

function getKpForecast(state) {
    return liveSlotHelioKpForecast.get(state);
}

function getSolarWind(state) {
    return liveSlotHelioSolarWind.get(state);
}

function getSolarWindMag(state) {
    return liveSlotHelioSolarWindMag.get(state);
}

function getAuroraOvation(state) {
    return liveSlotHelioAuroraOvation.get(state);
}

function getAlerts(state) {
    return liveSlotHelioAlerts.get(state);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSpaceWeather({ results, situation, store }) {
    const { now, location } = situation;

    const ts = createTimestampTracker(now, location.timezone);

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

    const solarWindMag = getSolarWindMag(store.astronomy_heliophysics);
    if (solarWindMag) {
        if (solarWindMag.bz < BZ_THRESHOLDS.extremelySouth) results.alerts.push(`space: ${ts.get('bz', solarWindMag._fetched)}IMF extremely southward (${FormatHelper.magneticFieldToString(solarWindMag.bz)}) - major storm driver`);
        else if (solarWindMag.bz < BZ_THRESHOLDS.stronglySouth) results.alerts.push(`space: ${ts.get('bz', solarWindMag._fetched)}IMF strongly southward (${FormatHelper.magneticFieldToString(solarWindMag.bz)})`);
        else if (solarWindMag.derived.sustainedSouth) results.phenomena.push(`space: ${ts.get('bz', solarWindMag._fetched)}IMF sustained southward (${FormatHelper.magneticFieldToString(solarWindMag.stats.avgBz)} avg)`);
        if (solarWindMag.derived.isBtStrong && solarWindMag.bz > BZ_THRESHOLDS.slightlySouth)
            results.phenomena.push(`space: ${ts.get('bz', solarWindMag._fetched)}strong total field (${FormatHelper.magneticFieldToString(solarWindMag.bt)}) with neutral Bz - activity may increase if Bz turns south`);
        else if (solarWindMag.derived.isBtElevated && !solarWindMag.derived.isSouth)
            results.phenomena.push(`space: ${ts.get('bz', solarWindMag._fetched)}elevated total field (${FormatHelper.magneticFieldToString(solarWindMag.bt)}) - watch for Bz changes`);
    }

    const alerts = getAlerts(store.astronomy_heliophysics);
    if (alerts) {
        if (alerts.hasActiveAlert) results.alerts.push(`space: ${ts.get('alerts', alerts._fetched)}NOAA alert active`);
        else if (alerts.hasActiveWarning) results.phenomena.push(`space: ${ts.get('alerts', alerts._fetched)}NOAA warning active`);
    }

    const forecast = getKpForecast(store.astronomy_heliophysics);
    if (forecast?.stormExpected) results.phenomena.push(`space: ${ts.get('forecast', forecast._fetched)}storm conditions expected ${forecast.peakTiming || 'within 24h'} (max ${FormatHelper.kpToString(forecast.max24h)})`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAurora({ results, situation, dataCurrent, store }) {
    const { location, month, hour, daylight, year, lunar, now } = situation;
    const { cloudCover, snowDepth, temp, humidity } = dataCurrent;

    if (location.latitude <= 45) return;
    if (cloudCover !== undefined && cloudCover >= 70) return;
    if (daylight?.isDaytime) return;
    if (hour >= 6 && hour <= 16) return;
    if (month >= 5 && month <= 7 && location.latitude < 65) return;

    const kpData = getKpIndex(store.astronomy_heliophysics);
    const currentKp = kpData?.current ?? getStatisticalKp(month, year);
    const isRealtime = kpData !== undefined;
    const visibility = predictAuroraVisibility(location, currentKp);
    if (!visibility) return;

    const solarWindMag = getSolarWindMag(store.astronomy_heliophysics);
    const auroraOvation = getAuroraOvation(store.astronomy_heliophysics);

    const ts = createTimestampTracker(now, location.timezone);

    // *** Primary aurora prediction using Ovation model (most accurate) ***
    if (auroraOvation?.location) {
        const prob = auroraOvation.location.probability;
        if (prob > 50) results.alerts.push(`aurora: ${ts.get('ovation', auroraOvation._fetched)}high probability at your location (${FormatHelper.probabilityToString(prob)})`);
        else if (prob > 30) results.phenomena.push(`aurora: ${ts.get('ovation', auroraOvation._fetched)}likely visible (${FormatHelper.probabilityToString(prob)})`);
        else if (prob > 10) results.phenomena.push(`aurora: ${ts.get('ovation', auroraOvation._fetched)}possible (${FormatHelper.probabilityToString(prob)}) - ${visibility.position}`);
        else if (auroraOvation.oval.southernBoundary && location.latitude > auroraOvation.oval.southernBoundary - 5)
            results.phenomena.push(`aurora: ${ts.get('ovation', auroraOvation._fetched)}oval ${Math.round(location.latitude - auroraOvation.oval.southernBoundary)}° north - watch for expansion`);
    }
    // *** Fallback to Kp-based prediction ***
    else if (isRealtime) {
        if (visibility.isVisible) results.phenomena.push(`aurora: ${ts.get('kp_aurora', kpData._fetched)}${currentKp >= KP_THRESHOLDS.minorStorm ? 'active' : 'possible'} (${FormatHelper.kpToString(currentKp)}) - ${visibility.position}`);
        else if (visibility.margin > -3)
            results.phenomena.push(`aurora: ${ts.get('kp_aurora', kpData._fetched)}watch northern horizon if Kp rises (currently ${FormatHelper.kpToString(currentKp)}, need ${Math.ceil(currentKp - visibility.margin)}+)`);
    }
    // *** Statistical fallback ***
    else {
        if (visibility.isVisible) results.phenomena.push(`aurora: possible tonight (statistical ${FormatHelper.kpToString(currentKp)})`);
        results.phenomena.push('aurora: real-time data unavailable - using seasonal estimates');
    }

    // *** Bz component - crucial aurora driver ***
    if (solarWindMag) {
        if (solarWindMag.derived.isStronglySouth) results.alerts.push(`aurora: ${ts.get('bz_aurora', solarWindMag._fetched)}Bz strongly southward (${FormatHelper.magneticFieldToString(solarWindMag.bz)}) - activity imminent`);
        else if (solarWindMag.derived.sustainedSouth)
            results.phenomena.push(`aurora: ${ts.get('bz_aurora', solarWindMag._fetched)}Bz sustained southward (${FormatHelper.magneticFieldToString(solarWindMag.stats.avgBz)} avg) - favorable conditions`);
        else if (solarWindMag.derived.isSouth) results.phenomena.push(`aurora: ${ts.get('bz_aurora', solarWindMag._fetched)}Bz southward (${FormatHelper.magneticFieldToString(solarWindMag.bz)}) - enhanced activity possible`);
        else if (solarWindMag.bz > 5) results.phenomena.push(`aurora: ${ts.get('bz_aurora', solarWindMag._fetched)}Bz northward - quiet conditions expected`);
    }

    // *** Storm alerts from Kp ***
    if (kpData?.derived?.isStorm) results.alerts.push(`aurora: ${ts.get('kp_aurora', kpData._fetched)}${kpData.derived.stormLevel} geomagnetic storm in progress`);

    // *** Activity trend ***
    if (kpData?.trend?.delta1h > 1) results.phenomena.push(`aurora: ${ts.get('kp_aurora', kpData._fetched)}activity increasing - keep watching`);

    // *** Seasonal enhancement ***
    if ((month >= 2 && month <= 3) || (month >= 8 && month <= 10)) results.phenomena.push('aurora: equinoctial enhancement period');

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

    liveSchedulerStart(store.astronomy_heliophysics, { location });

    return {
        interpretSpaceWeather,
        interpretAurora,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
