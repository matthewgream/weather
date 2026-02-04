// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Satellites Module - Live satellite pass predictions
// -----------------------------------------------------------------------------------------------------------------------------------------
//
//   - N2YO API (https://www.n2yo.com/api/) - requires free API key
//
//   - Geostationary satellite flares
//   - ISS (NORAD 25544) - International Space Station
//   - Tiangong (NORAD 54216) - Chinese Space Station
//   - HST (NORAD 20580) - Hubble Space Telescope
//
// -----------------------------------------------------------------------------------------------------------------------------------------

const { FormatHelper } = require('./server-function-weather-tools-format.js');
const { DataSlot, DataScheduler, fetchJson, fetchText, createTimestampTracker } = require('./server-function-weather-tools-live.js');

let satellite;
try {
    satellite = require('satellite.js');
} catch {
    //
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const ENDPOINTS = {
    n2yoBase: 'https://api.n2yo.com/rest/v1/satellite',
    celestrakStarlink: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
};

const SATELLITES = {
    iss: { id: 25544, name: 'ISS', minMag: -4 },
    tiangong: { id: 54216, name: 'Tiangong', minMag: -3 },
    hst: { id: 20580, name: 'Hubble', minMag: 1.5 },
};

const INTERVALS = {
    active: 30 * 60 * 1000, // 30 min when passes expected soon
    evening: 60 * 60 * 1000, // 1 hour during evening viewing window
    background: 4 * 60 * 60 * 1000, // 4 hours background refresh
    daytime: 6 * 60 * 60 * 1000, // 6 hours during day (just cache for later)
};

const STALENESS = {
    passes: 2 * 60 * 60 * 1000, // 2 hours - passes don't change rapidly
};

const PASS_QUALITY = {
    excellent: -2, // Brighter than mag -2
    good: 0, // Brighter than mag 0
    visible: 2, // Brighter than mag 2
};

const STARLINK = {
    minTrainMeanMotion: 15.5, // rev/day - satellites still raising orbit
    operationalMeanMotion: 15.2, // above this they're at operational altitude
    minTrainSize: 15, // minimum satellites to be a "train"
    raanTolerance: 2, // degrees - same orbital plane
    inclinationTolerance: 0.5, // degrees
};

const INTERVALS_STARLINK = {
    recentLaunch: 2 * 60 * 60 * 1000, // 2 hours when train detected
    normal: 12 * 60 * 60 * 1000, // 12 hours normally
};

const STALENESS_STARLINK = {
    tle: 6 * 60 * 60 * 1000, // 6 hours - TLEs don't change fast
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isViewingWindow(hour, month) {
    // Satellites visible in twilight - roughly 1-2 hours after sunset / before sunrise
    const summerOffset = month >= 4 && month <= 8 ? 1 : 0;
    const eveningStart = 18 + summerOffset;
    const eveningEnd = 23 + summerOffset;
    const morningStart = 4;
    const morningEnd = 7;
    return (hour >= eveningStart && hour <= eveningEnd) || (hour >= morningStart && hour <= morningEnd);
}

function isViewingWindowApproaching(hour, month) {
    // 2 hours before viewing window - good time to fetch
    const summerOffset = month >= 4 && month <= 8 ? 1 : 0;
    return (hour >= 16 + summerOffset && hour < 18 + summerOffset) || (hour >= 2 && hour < 4);
}

function getPassQuality(magnitude) {
    if (magnitude <= PASS_QUALITY.excellent) return 'excellent';
    if (magnitude <= PASS_QUALITY.good) return 'good';
    if (magnitude <= PASS_QUALITY.visible) return 'visible';
    return 'faint';
}

function minutesUntilPass(timestamp) {
    return Math.round((timestamp - Date.now()) / 60000);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function parseTLEEpochFromLine(epochStr) {
    // TLE epoch format: YYDDD.DDDDDDDD (2-digit year + day of year + fractional day)
    // e.g., "24356.25" = 2024, day 356, 0.25 of day
    const year = Number.parseInt(epochStr.slice(0, 2));
    const dayOfYear = Number.parseFloat(epochStr.slice(2));
    const date = new Date(Date.UTC(year > 57 ? 1900 + year : 2000 + year, 0, 1));
    date.setUTCDate(Math.floor(dayOfYear));
    date.setUTCMilliseconds((dayOfYear % 1) * 24 * 60 * 60 * 1000);
    return date;
}

function identifyTrains(satellites) {
    // Filter for satellites still in low orbit (high mean motion = low altitude)
    const lowOrbitSats = satellites.filter((sat) => sat.meanMotion >= STARLINK.minTrainMeanMotion);
    if (lowOrbitSats.length === 0) return [];

    // Group by orbital plane (similar inclination + RAAN)
    const planes = [];
    for (const sat of lowOrbitSats) {
        let foundPlane = false;
        for (const plane of planes) {
            const inclDiff = Math.abs(sat.inclination - plane.inclination);
            const raanDiff = Math.abs(sat.raan - plane.raan);
            // Handle RAAN wraparound at 360°
            if (inclDiff < STARLINK.inclinationTolerance && Math.min(raanDiff, 360 - raanDiff) < STARLINK.raanTolerance) {
                plane.satellites.push(sat);
                foundPlane = true;
                break;
            }
        }
        if (!foundPlane) planes.push({ inclination: sat.inclination, raan: sat.raan, satellites: [sat] });
    }

    // Filter for planes with enough satellites to be a visible train
    return planes
        .filter((plane) => plane.satellites.length >= STARLINK.minTrainSize)
        .map((plane) => {
            // Estimate how "fresh" the train is by mean motion (higher = lower = fresher)
            const { satellites, inclination, raan } = plane;
            const avgMeanMotion = satellites.reduce((sum, s) => sum + s.meanMotion, 0) / satellites.length;
            return {
                satelliteCount: satellites.length,
                inclination,
                raan,
                avgMeanMotion,
                // eslint-disable-next-line unicorn/no-nested-ternary, sonarjs/no-nested-conditional
                spectacularity: avgMeanMotion >= 15.9 ? 'spectacular' : avgMeanMotion >= 15.6 ? 'impressive' : 'visible',
                satellites,
            };
        })
        .sort((a, b) => b.avgMeanMotion - a.avgMeanMotion); // Most recent (lowest orbit) first
}

function predictTrainPass(train, location, targetTime) {
    if (!satellite) return undefined;

    try {
        // Use first satellite in train as reference
        const [sat] = train.satellites;
        // Create satrec from TLE lines
        const satrec = satellite.twoline2satrec(sat.line1, sat.line2);
        if (!satrec?.error) {
            console.error('satellites: Starlink satrec error:', satrec?.error);
            return undefined;
        }
        const date = new Date(targetTime);
        const positionAndVelocity = satellite.propagate(satrec, date);
        if (!positionAndVelocity.position) return undefined;
        const observerGd = {
            longitude: satellite.degreesToRadians(location.longitude),
            latitude: satellite.degreesToRadians(location.latitude),
            height: (location.elevation || 0) / 1000,
        };
        const positionEci = positionAndVelocity.position;
        const positionEcf = satellite.eciToEcf(positionEci, satellite.gstime(date));
        const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
        const elevation = satellite.radiansToDegrees(lookAngles.elevation);
        const azimuth = satellite.radiansToDegrees(lookAngles.azimuth);
        return {
            elevation: Math.round(elevation * 10) / 10,
            azimuth: Math.round(((azimuth + 360) % 360) * 10) / 10, // Normalize to 0-360
            isVisible: elevation > 10,
            isHighPass: elevation > 45,
        };
    } catch (e) {
        console.error('satellites: Starlink propagation error:', e.message);
        return undefined;
    }
}

function findNextTrainPass(train, location, maxHoursAhead = 24) {
    if (!satellite) return undefined;

    const now = Date.now();
    const stepMinutes = 5; // Check every 5 minutes
    let passStart, passEnd;
    let elevationMax = 0,
        elevationMaxTime;
    for (let i = 0; i < (maxHoursAhead * 60) / stepMinutes; i++) {
        const checkTime = now + i * stepMinutes * 60 * 1000;
        const position = predictTrainPass(train, location, checkTime);
        if (!position) continue;
        if (position.isVisible) {
            if (!passStart) passStart = checkTime;
            if (position.elevation > elevationMax) {
                elevationMax = position.elevation;
                elevationMaxTime = checkTime;
            }
            passEnd = checkTime;
        } else if (passStart && passEnd) {
            // Pass ended
            break;
        }
    }
    if (!passStart) return undefined;

    const startPosition = predictTrainPass(train, location, passStart);
    const maxPosition = predictTrainPass(train, location, elevationMaxTime);
    const endPosition = predictTrainPass(train, location, passEnd);
    return {
        train: {
            satelliteCount: train.satelliteCount,
            spectacularity: train.spectacularity,
        },
        start: {
            time: passStart,
            azimuth: startPosition?.azimuth,
        },
        max: {
            time: elevationMaxTime,
            elevation: elevationMax,
            azimuth: maxPosition?.azimuth,
        },
        end: {
            time: passEnd,
            azimuth: endPosition?.azimuth,
        },
        duration: Math.round((passEnd - passStart) / 60000),
        minutesUntil: Math.round((passStart - now) / 60000),
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const liveSlotCombined = new DataSlot('combined', STALENESS.passes);
const liveSlotStarlink = new DataSlot('starlink', STALENESS_STARLINK.tle);
const liveSlotStarlinkPasses = new DataSlot('starlinkPasses', STALENESS.passes);

const liveSchedulerPasses = new DataScheduler('satellites');
const liveSchedulerStarlink = new DataScheduler('satellites');

async function liveCombinedVisualPassesFetchAndProcess(satelliteInfo, location, apiKey) {
    if (!apiKey) return undefined;

    const { id, name } = satelliteInfo;

    try {
        const days = 3; // Look ahead 3 days
        const minVisibility = 120; // Minimum 2 minutes visible
        const data = await fetchJson(`${ENDPOINTS.n2yoBase}/visualpasses/${id}/${location.latitude}/${location.longitude}/${location.elevation || 0}/${days}/${minVisibility}&apiKey=${apiKey}`);
        if (data.error) throw new Error(data.error);
        const _fetched = Date.now();

        // Sort by brightness (best first)
        const passes = (data.passes || [])
            .map((pass) => ({
                satellite: name,
                noradId: id,
                start: {
                    time: pass.startUTC * 1000,
                    azimuth: pass.startAz,
                    elevation: pass.startEl,
                },
                max: {
                    time: pass.maxUTC * 1000,
                    azimuth: pass.maxAz,
                    elevation: pass.maxEl,
                },
                end: {
                    time: pass.endUTC * 1000,
                    azimuth: pass.endAz,
                    elevation: pass.endEl,
                },
                magnitude: pass.mag,
                duration: pass.duration,
                quality: getPassQuality(pass.mag),
            }))
            .sort((a, b) => a.magnitude - b.magnitude);

        console.error(`satellites: update ${name} success`);
        return {
            _fetched,
            satellite: name,
            noradId: id,
            passes,
            passCount: passes.length,
            nextPass: passes.length > 0 ? passes[0] : undefined,
            bestPass: passes.length > 0 ? passes.reduce((best, p) => (p.magnitude < best.magnitude ? p : best)) : undefined,
        };
    } catch (e) {
        console.error(`satellites: update ${name} failure:`, e.message);
        return undefined;
    }
}

async function liveCombinedSatellitesFetchAndProcess(state, situation) {
    const { apiKey, location } = situation;

    if (!apiKey) return;

    if (!state.combined) state.combined = {};

    const results = await Promise.all(Object.entries(SATELLITES).map(async ([key, sat]) => ({ key, data: await liveCombinedVisualPassesFetchAndProcess(sat, location, apiKey) })));
    for (const { key, data } of results) if (data) state[key] = { data, lastUpdate: data._fetched };

    const allPasses = results.flatMap(({ data }) => data?.passes || []).sort((a, b) => a.start.time - b.start.time);
    const _fetched = results
        .filter(({ data }) => data?._fetched)
        .map(({ data }) => data._fetched)
        .reduce((a, b) => Math.max(a, b), 0);

    state.combined.data = {
        _fetched,
        allPasses,
        tonight: allPasses.filter((p) => {
            const hours = (p.start.time - _fetched) / 3600000;
            return hours >= 0 && hours < 12;
        }),
        upcoming: allPasses.filter((p) => minutesUntilPass(p.start.time) > 0 && minutesUntilPass(p.start.time) < 180),
    };
    state.combined.lastUpdate = _fetched;

    console.error(`satellites: update passes success (${allPasses.length} total, ${state.combined.data.tonight.length} tonight)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

async function liveStarlinkTLEsFetchAndProcess(state) {
    return liveSlotStarlink.fetch(
        state,
        'satellites',
        async () => {
            const text = await fetchText(ENDPOINTS.celestrakStarlink);

            // Parse TLE text format (3 lines per satellite: name, line1, line2)
            const lines = text.trim().split('\n');
            const satellites = [];
            for (let i = 0; i < lines.length - 2; i += 3) {
                const name = lines[i].trim();
                const line1 = lines[i + 1].trim();
                const line2 = lines[i + 2].trim();
                // Validate TLE lines
                if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue;
                // Extract epoch from line 1 (columns 19-32)
                const epoch = parseTLEEpochFromLine(line1.slice(18, 32).trim());
                satellites.push({
                    name,
                    line1,
                    line2,
                    epoch,
                    noradId: Number.parseInt(line1.slice(2, 7)),
                });
            }
            if (satellites.length === 0) throw new Error('No TLE data parsed');

            const trains = identifyTrains(satellites);
            return {
                totalSatellites: satellites.length,
                recentTrains: trains,
                hasActiveTrain: trains.length > 0,
                mostRecentTrain: trains.length > 0 ? trains[0] : undefined,
            };
        },
        `${liveSlotStarlink.get(state)?.totalSatellites || 0} sats, ${liveSlotStarlink.get(state)?.recentTrains?.length || 0} trains`
    );
}

async function liveStarlinkPassesUpdate(state, location) {
    const starlinkData = liveSlotStarlink.get(state);
    if (!starlinkData?.recentTrains) return;

    const _fetched = Date.now();
    // Only report decent passes, sort by time
    const passes = starlinkData.recentTrains
        .map((train) => findNextTrainPass(train, location, 24))
        .filter((nextPass) => nextPass?.max?.elevation > 15)
        .sort((a, b) => a.start.time - b.start.time);

    if (!state.starlinkPasses) state.starlinkPasses = {};
    state.starlinkPasses.data = {
        _fetched,
        passes,
        nextPass: passes.length > 0 ? passes[0] : undefined,
        tonight: passes.filter((p) => p.minutesUntil >= 0 && p.minutesUntil < 720),
    };
    state.starlinkPasses.lastUpdate = _fetched;
    console.error(`satellites: update Starlink passes (${passes.length} visible)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function liveCombinedCalculateUpdateInterval(state, _situation) {
    const month = new Date().getMonth(),
        hour = new Date().getHours();
    const upcoming = getUpcomingPasses(state, 60);
    // Pass coming up within 60 minutes - frequent updates
    if (upcoming.length > 0) {
        if (upcoming.map((p) => minutesUntilPass(p.start.time)).reduce((a, b) => Math.min(a, b)) < 30) return [INTERVALS.active, 'pass-imminent'];
        return [INTERVALS.active, 'pass-soon'];
    }
    // In viewing window - check regularly
    if (isViewingWindow(hour, month)) return [INTERVALS.evening, 'viewing-window'];
    // Approaching viewing window - start fetching
    if (isViewingWindowApproaching(hour, month)) return [INTERVALS.evening, 'pre-viewing'];
    // Daytime - infrequent background updates
    return [INTERVALS.daytime, 'daytime'];
}

function liveCombinedSchedulerStart(state, situation) {
    liveSchedulerPasses.run(
        () => liveCombinedSatellitesFetchAndProcess(state, situation),
        () => liveCombinedCalculateUpdateInterval(state, situation)
    );
}

function liveStarlinkCalculateUpdateInterval(state, _situation) {
    const hasActiveTrain = liveSlotStarlink.get(state)?.hasActiveTrain;
    return [hasActiveTrain ? INTERVALS_STARLINK.recentLaunch : INTERVALS_STARLINK.normal, hasActiveTrain ? 'train-active' : 'no-train'];
}

function liveStarlinkSchedulerStart(state, situation) {
    liveSchedulerStarlink.run(
        async () => {
            await liveStarlinkTLEsFetchAndProcess(state);
            if (liveSlotStarlink.get(state)?.hasActiveTrain) await liveStarlinkPassesUpdate(state, situation.location);
        },
        () => liveStarlinkCalculateUpdateInterval(state, situation)
    );
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getCombinedPasses(state) {
    return liveSlotCombined.get(state);
}

function getUpcomingPasses(state, withinMinutes = 120) {
    const combined = getCombinedPasses(state);
    if (!combined) return [];
    return combined.allPasses.filter((pass) => {
        const mins = minutesUntilPass(pass.start.time);
        return mins > -5 && mins < withinMinutes; // Include passes that started up to 5 min ago
    });
}

function getStarlinkData(state) {
    return liveSlotStarlink.get(state);
}

function getStarlinkPasses(state) {
    return liveSlotStarlinkPasses.get(state);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSatellitePasses({ results, situation, store }) {
    const { hour, month, daylight, location, now } = situation;

    if (daylight?.isDaytime && hour > 8 && hour < 16) return;

    // Only report during/near viewing windows
    if (!isViewingWindow(hour, month) && !isViewingWindowApproaching(hour, month)) return;

    const combined = getCombinedPasses(store.astronomy_satellites);
    const upcoming = getUpcomingPasses(store.astronomy_satellites, 180); // Next 3 hours

    const ts = createTimestampTracker(now, location.timezone);

    if (upcoming.length === 0) {
        // Check if we have any passes tonight at all
        if (combined?.tonight?.length) {
            const [nextPass] = combined.tonight;
            const minsUntil = minutesUntilPass(nextPass.start.time);
            if (minsUntil > 0 && minsUntil < 360)
                results.phenomena.push(
                    `satellites: ${ts.get('passes', combined?._fetched)}next ${nextPass.satellite} pass at ${FormatHelper.timeLocalToString(nextPass.start.time)} (${FormatHelper.magnitudeToString(nextPass.magnitude)}, ${FormatHelper.secondsToString(minsUntil * 60)} away)`
                );
        }
    } else
        // Max 3 passes
        for (const pass of upcoming.slice(0, 3)) {
            const minsUntil = minutesUntilPass(pass.start.time);

            // eslint-disable-next-line unicorn/no-nested-ternary, sonarjs/no-nested-conditional
            let text = `satellites: ${ts.get('passes', combined?._fetched)}${pass.satellite} ` + (minsUntil < 0 ? 'NOW' : minsUntil < 2 ? 'STARTING' : `in ${FormatHelper.secondsToString(minsUntil * 60)}`);
            if (minsUntil < 30) {
                text += ` ${FormatHelper.timeLocalToString(pass.start.time)} to ${FormatHelper.timeLocalToString(pass.end.time)} (rises ${FormatHelper.azimuthToString(pass.start.azimuth)}, max ${FormatHelper.degreesToString(pass.max.elevation)} ${FormatHelper.azimuthToString(pass.max.azimuth)}, ${FormatHelper.magnitudeToString(pass.magnitude)})`;
                if (pass.quality === 'excellent') text += ' - VERY BRIGHT';
                else if (pass.quality === 'good') text += ' - bright';
            } else {
                text += ` at ${FormatHelper.timeLocalToString(pass.start.time)} (${FormatHelper.magnitudeToString(pass.magnitude)})`;
            }

            if (minsUntil <= 10 && minsUntil >= -2 && pass.magnitude < PASS_QUALITY.good) results.alerts.push(text);
            else results.phenomena.push(text);
        }
}

function interpretBestPassTonight({ results, situation, store }) {
    const { hour, location, now } = situation;

    // Only in early evening, mention the best pass of the night
    if (hour < 17 || hour > 20) return;

    const combined = getCombinedPasses(store.astronomy_satellites);
    if (!combined?.tonight?.length) return;

    // Find best (brightest) pass tonight
    const best = combined.tonight.reduce((b, p) => (!b || p.magnitude < b.magnitude ? p : b), undefined);
    if (!best || best.magnitude > PASS_QUALITY.visible) return;

    const minsUntil = minutesUntilPass(best.start.time);
    if (minsUntil < 60) return; // Will be reported by interpretSatellitePasses

    const ts = createTimestampTracker(now, location.timezone);

    results.phenomena.push(
        `satellites: ${ts.get('passes', combined?._fetched)}best pass tonight - ${best.satellite} at ${FormatHelper.timeLocalToString(best.start.time)} (${FormatHelper.magnitudeToString(best.magnitude)}, max ${FormatHelper.degreesToString(best.max.elevation)})`
    );
}

function interpretStarlinkTrain({ results, situation, store }) {
    const { hour, month, daylight, now, location } = situation;

    // Only during viewing windows
    if (!isViewingWindow(hour, month) && !isViewingWindowApproaching(hour, month)) return;
    if (daylight?.isDaytime && hour > 8 && hour < 16) return;

    const starlinkData = getStarlinkData(store.astronomy_satellites);
    if (!starlinkData?.hasActiveTrain) return;

    const ts = createTimestampTracker(now, location.timezone);

    // Alert about active train
    const train = starlinkData.mostRecentTrain;
    if (train.isVeryRecent) results.alerts.push(`satellites: ${ts.get('starlink', starlinkData._fetched)}STARLINK TRAIN active (${FormatHelper.countToString(train.satelliteCount)} satellites) - ${train.spectacularity} viewing`);
    else results.phenomena.push(`satellites: ${ts.get('starlink', starlinkData._fetched)}Starlink train visible (${FormatHelper.countToString(train.satelliteCount)} satellites)`);

    // Report upcoming passes
    const passesData = getStarlinkPasses(store.astronomy_satellites);
    if (passesData?.nextPass) {
        const pass = passesData.nextPass;

        if (pass.minutesUntil < 0)
            results.alerts.push(`satellites: ${ts.get('starlinkPass', passesData._fetched)}Starlink train PASSING NOW - look ${FormatHelper.azimuthToString(pass.max.azimuth)} at ${FormatHelper.degreesToString(pass.max.elevation)}`);
        else if (pass.minutesUntil < 30)
            results.alerts.push(
                `satellites: ${ts.get('starlinkPass', passesData._fetched)}Starlink train in ${pass.minutesUntil} min, ${FormatHelper.timeLocalToString(pass.start.time)} from ${FormatHelper.azimuthToString(pass.start.azimuth)} (max ${FormatHelper.degreesToString(pass.max.elevation)} ${FormatHelper.azimuthToString(pass.max.azimuth)})`
            );
        else if (pass.minutesUntil < 180)
            results.phenomena.push(
                `satellites: ${ts.get('starlinkPass', passesData._fetched)}Starlink train at ${FormatHelper.timeLocalToString(pass.start.time)} (${FormatHelper.secondsToString(pass.minutesUntil * 60)}, max ${FormatHelper.degreesToString(pass.max.elevation)} ${FormatHelper.azimuthToString(pass.max.azimuth)})`
            );
    }

    // Multiple trains?
    if (starlinkData?.recentTrains?.length > 1)
        results.phenomena.push(`satellites: ${ts.get('starlinkPass', passesData?._fetched)}Starlink has ${FormatHelper.countToString(starlinkData.recentTrains.length)} trains currently visible (multiple recent launches)`);
}

function interpretStarlinkStats({ results, situation, store }) {
    const { now, location } = situation;

    // Optional: report on Starlink constellation stats
    const starlinkData = getStarlinkData(store.astronomy_satellites);
    if (!starlinkData) return;

    const ts = createTimestampTracker(now, location.timezone);

    // Only occasionally mention constellation size, 10% chance
    if (Math.random() < 0.1) results.phenomena.push(`satellites: ${ts.get('starlinkPass', starlinkData._fetched)}Starlink now ${FormatHelper.countToString(starlinkData.totalSatellites)} satellites`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const GEOSTATIONARY = {
    MAX_LATITUDE: 70,
    SPRING_MONTHS: [2, 3, 4],
    AUTUMN_MONTHS: [8, 9, 10],
};

function isGeostatinaryFlareTime(month, hour) {
    const isSpring = GEOSTATIONARY.SPRING_MONTHS.includes(month);
    const isAutumn = GEOSTATIONARY.AUTUMN_MONTHS.includes(month);
    if (isSpring && hour >= 22) return 'pre-dawn';
    if (isSpring && hour <= 2) return 'pre-dawn';
    if (isAutumn && hour >= 22) return 'post-sunset';
    if (isAutumn && hour <= 2) return 'post-sunset';
    return undefined;
}

function interpretGeostationaryFlares({ results, situation }) {
    const { location, hour, month } = situation;

    if (Math.abs(location.latitude) >= GEOSTATIONARY.MAX_LATITUDE) return;

    const flareTime = isGeostatinaryFlareTime(month, hour);
    if (flareTime) results.phenomena.push(`satellites: geostationary flares possible ${flareTime} near celestial equator`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ location, store, options }) {
    if (!store.astronomy_satellites) store.astronomy_satellites = {};

    const apiKey = options?.n2yoApiKey;
    if (apiKey) liveCombinedSchedulerStart(store.astronomy_satellites, { location, apiKey });
    else console.error('satellites: no N2YO API key, ISS/satellite tracking disabled');

    if (satellite) liveStarlinkSchedulerStart(store.astronomy_satellites, { location });
    else console.error('satellites: no satellite.js, Starlink tracking disabled');

    return {
        interpretGeostationaryFlares,
        interpretSatellitePasses: apiKey ? interpretSatellitePasses : () => {},
        interpretBestPassTonight: apiKey ? interpretBestPassTonight : () => {},
        interpretStarlinkTrain: satellite ? interpretStarlinkTrain : () => {},
        interpretStarlinkStats: satellite ? interpretStarlinkStats : () => {},
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
