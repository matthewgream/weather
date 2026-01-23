// -----------------------------------------------------------------------------------------------------------------------------------------
// Astronomy Satellites Realtime Module - Live satellite pass predictions
// -----------------------------------------------------------------------------------------------------------------------------------------
//
// External data sources:
//   - N2YO API (https://www.n2yo.com/api/) - requires free API key
//
// Tracked satellites:
//   - ISS (NORAD 25544) - International Space Station
//   - Tiangong (NORAD 54216) - Chinese Space Station
//   - HST (NORAD 20580) - Hubble Space Telescope
//
// -----------------------------------------------------------------------------------------------------------------------------------------

let satellite;
try {
    satellite = require('satellite.js');
} catch {
    console.error('satellites-realtime: satellite.js not installed, Starlink tracking disabled');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const ENDPOINTS = {
    n2yoBase: 'https://api.n2yo.com/rest/v1/satellite',
    celestrakStarlink: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
};

const SATELLITES = {
    ISS: { id: 25544, name: 'ISS', minMag: -4 },
    TIANGONG: { id: 54216, name: 'Tiangong', minMag: -3 },
    HST: { id: 20580, name: 'Hubble', minMag: 1.5 },
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
    recentLaunchDays: 14, // Consider "train" visible for 2 weeks
    veryRecentDays: 5, // Most spectacular in first 5 days
    minTrainSize: 20, // Minimum satellites to call it a "train"
    typicalLaunchSize: 22, // SpaceX typically launches ~22 at once
    trainSpreadMinutes: 15, // Train passes over in ~15 minutes
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

function isApproachingViewingWindow(hour, month) {
    // 2 hours before viewing window - good time to fetch
    const summerOffset = month >= 4 && month <= 8 ? 1 : 0;
    return (hour >= 16 + summerOffset && hour < 18 + summerOffset) || (hour >= 2 && hour < 4);
}

function formatPassTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDirection(azimuth) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(azimuth / 22.5) % 16;
    return directions[index];
}

function getPassQuality(magnitude) {
    if (magnitude <= PASS_QUALITY.excellent) return 'excellent';
    if (magnitude <= PASS_QUALITY.good) return 'good';
    if (magnitude <= PASS_QUALITY.visible) return 'visible';
    return 'faint';
}

function minutesUntilPass(passStartUtc) {
    return Math.round((passStartUtc * 1000 - Date.now()) / 60000);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function parseTLEEpochFromLine(epochStr) {
    // TLE epoch format: YYDDD.DDDDDDDD (2-digit year + day of year + fractional day)
    // e.g., "24356.25" = 2024, day 356, 0.25 of day
    const year = Number.parseInt(epochStr.slice(0, 2));
    const fullYear = year > 57 ? 1900 + year : 2000 + year;
    const dayOfYear = Number.parseFloat(epochStr.slice(2));
    const date = new Date(Date.UTC(fullYear, 0, 1));
    date.setUTCDate(Math.floor(dayOfYear));
    // Add fractional day
    const fractionalDay = dayOfYear % 1;
    date.setUTCMilliseconds(fractionalDay * 24 * 60 * 60 * 1000);
    return date;
}

function groupByLaunch(satellites) {
    const groups = {};
    for (const sat of satellites) {
        const [dateKey] = sat.epoch.toISOString().split('T');
        if (!groups[dateKey]) groups[dateKey] = { date: sat.epoch, dateKey, satellites: [] };
        groups[dateKey].satellites.push(sat);
    }
    return Object.values(groups).sort((a, b) => b.date - a.date);
}

function identifyRecentTrains(launchGroups) {
    const trains = [];
    for (const group of launchGroups) {
        const ageDays = (Date.now() - group.date.getTime()) / (24 * 60 * 60 * 1000);
        // Only consider recent launches with enough satellites for a train
        if (ageDays <= STARLINK.recentLaunchDays && group.satellites.length >= STARLINK.minTrainSize)
            trains.push({
                launchDate: group.date,
                dateKey: group.dateKey,
                ageDays: Math.round(ageDays * 10) / 10,
                satelliteCount: group.satellites.length,
                isVeryRecent: ageDays <= STARLINK.veryRecentDays,
                satellites: group.satellites,
                // eslint-disable-next-line unicorn/no-nested-ternary, sonarjs/no-nested-conditional
                spectacularity: ageDays <= 2 ? 'spectacular' : ageDays <= 5 ? 'impressive' : 'visible',
            });
    }
    return trains;
}

function predictTrainPass(train, location, targetTime) {
    if (!satellite || !location?.latitude || !location?.longitude) return undefined;

    try {
        // Use first satellite in train as reference
        const [sat] = train.satellites;
        // Create satrec from TLE lines
        const satrec = satellite.twoline2satrec(sat.line1, sat.line2);
        if (!satrec || satrec.error) {
            console.error('Starlink satrec error:', satrec?.error);
            return undefined;
        }
        // Propagate to target time
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
            azimuthCompass: formatDirection((azimuth + 360) % 360),
            isVisible: elevation > 10,
            isHighPass: elevation > 45,
        };
    } catch (e) {
        console.error('Starlink propagation error:', e.message);
        return undefined;
    }
}

function findNextTrainPass(train, location, maxHoursAhead = 24) {
    if (!satellite) return undefined;

    const now = Date.now();
    const stepMinutes = 5; // Check every 5 minutes

    let passStart = undefined;
    let maxElevation = 0;
    let maxElevationTime = undefined;
    let passEnd = undefined;
    for (let i = 0; i < (maxHoursAhead * 60) / stepMinutes; i++) {
        const checkTime = now + i * stepMinutes * 60 * 1000;
        const position = predictTrainPass(train, location, checkTime);
        if (!position) continue;
        if (position.isVisible) {
            if (!passStart) passStart = checkTime;
            if (position.elevation > maxElevation) {
                maxElevation = position.elevation;
                maxElevationTime = checkTime;
            }
            passEnd = checkTime;
        } else if (passStart && passEnd) {
            // Pass ended
            break;
        }
    }
    if (!passStart) return undefined;

    const startPosition = predictTrainPass(train, location, passStart);
    const maxPosition = predictTrainPass(train, location, maxElevationTime);
    const endPosition = predictTrainPass(train, location, passEnd);
    return {
        train: {
            launchDate: train.launchDate,
            ageDays: train.ageDays,
            satelliteCount: train.satelliteCount,
            spectacularity: train.spectacularity,
        },
        start: {
            time: passStart,
            timeFormatted: formatPassTime(passStart / 1000),
            azimuth: startPosition?.azimuth,
            azimuthCompass: startPosition?.azimuthCompass,
        },
        max: {
            time: maxElevationTime,
            timeFormatted: formatPassTime(maxElevationTime / 1000),
            elevation: maxElevation,
            azimuth: maxPosition?.azimuth,
            azimuthCompass: maxPosition?.azimuthCompass,
        },
        end: {
            time: passEnd,
            timeFormatted: formatPassTime(passEnd / 1000),
            azimuth: endPosition?.azimuth,
            azimuthCompass: endPosition?.azimuthCompass,
        },
        duration: Math.round((passEnd - passStart) / 60000),
        minutesUntil: Math.round((passStart - now) / 60000),
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

async function fetchVisualPasses(state, satellite, location, apiKey) {
    if (!apiKey) return undefined;

    if (!location?.latitude || !location?.longitude) return undefined;

    const { id, name } = satellite;

    try {
        const alt = location.elevation || 0;
        const days = 3; // Look ahead 3 days
        const minVisibility = 120; // Minimum 2 minutes visible
        const url = `${ENDPOINTS.n2yoBase}/visualpasses/${id}/${location.latitude}/${location.longitude}/${alt}/${days}/${minVisibility}&apiKey=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        const passes = (data.passes || []).map((pass) => ({
            satellite: name,
            noradId: id,
            start: {
                time: pass.startUTC,
                timeFormatted: formatPassTime(pass.startUTC),
                azimuth: pass.startAz,
                azimuthCompass: formatDirection(pass.startAz),
                elevation: pass.startEl,
            },
            max: {
                time: pass.maxUTC,
                timeFormatted: formatPassTime(pass.maxUTC),
                azimuth: pass.maxAz,
                azimuthCompass: formatDirection(pass.maxAz),
                elevation: pass.maxEl,
            },
            end: {
                time: pass.endUTC,
                timeFormatted: formatPassTime(pass.endUTC),
                azimuth: pass.endAz,
                azimuthCompass: formatDirection(pass.endAz),
                elevation: pass.endEl,
            },
            magnitude: pass.mag,
            duration: pass.duration,
            quality: getPassQuality(pass.mag),
        }));

        // Sort by brightness (best first)
        passes.sort((a, b) => a.magnitude - b.magnitude);

        console.error(`satellites: update ${name} success`);

        return {
            satellite: name,
            noradId: id,
            passes,
            passCount: passes.length,
            nextPass: passes.length > 0 ? passes[0] : undefined,
            bestPass: passes.length > 0 ? passes.reduce((best, p) => (p.magnitude < best.magnitude ? p : best)) : undefined,
        };
    } catch (e) {
        console.error(`satellites: update ${name} fetch failure:`, e.message);
        return undefined;
    }
}

async function fetchAllSatellites(state, location, apiKey) {
    if (!apiKey || !location?.latitude) return;

    const [iss, tiangong, hst] = await Promise.all([fetchVisualPasses(state, SATELLITES.ISS, location, apiKey), fetchVisualPasses(state, SATELLITES.TIANGONG, location, apiKey), fetchVisualPasses(state, SATELLITES.HST, location, apiKey)]);
    if (iss) state.iss = { data: iss, lastUpdate: Date.now() };
    if (tiangong) state.tiangong = { data: tiangong, lastUpdate: Date.now() };
    if (hst) state.hst = { data: hst, lastUpdate: Date.now() };
    const allPasses = [...(iss?.passes || []), ...(tiangong?.passes || []), ...(hst?.passes || [])].sort((a, b) => a.start.time - b.start.time);

    if (!state.combined) state.combined = {};
    state.combined.data = {
        allPasses,
        tonight: allPasses.filter((p) => {
            const hours = (p.start.time * 1000 - Date.now()) / 3600000;
            return hours >= 0 && hours < 12;
        }),
        upcoming: allPasses.filter((p) => minutesUntilPass(p.start.time) > 0 && minutesUntilPass(p.start.time) < 180),
    };
    state.combined.lastUpdate = Date.now();

    console.error(`satellites: update passes success (${allPasses.length} total, ${state.combined.data.tonight.length} tonight)`);
}

async function fetchStarlinkTLEs(state) {
    try {
        const response = await fetch(ENDPOINTS.celestrakStarlink);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
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
            const epochStr = line1.slice(18, 32).trim();
            const epoch = parseTLEEpochFromLine(epochStr);
            satellites.push({
                name,
                line1,
                line2,
                epoch,
                noradId: Number.parseInt(line1.slice(2, 7)),
            });
        }
        if (satellites.length === 0) throw new Error('No TLE data parsed');
        // Group by launch date
        const launchGroups = groupByLaunch(satellites);
        // Identify recent trains
        const trains = identifyRecentTrains(launchGroups);
        if (!state.starlink) state.starlink = {};
        state.starlink.data = {
            totalSatellites: satellites.length,
            launchGroups: launchGroups.slice(0, 10),
            recentTrains: trains,
            hasActiveTrain: trains.length > 0,
            mostRecentTrain: trains.length > 0 ? trains[0] : undefined,
        };
        state.starlink.lastUpdate = Date.now();
        state.starlink.lastError = undefined;
        console.error(`satellites: update Starlink success (${satellites.length} sats, ${trains.length} recent trains)`);
        return state.starlink.data;
    } catch (e) {
        state.starlink.lastError = e.message;
        console.error('satellites: update Starlink failure:', e.message);
        return undefined;
    }
}

async function updateStarlinkPasses(state, location) {
    if (!state.starlink?.data?.recentTrains) return;

    const passes = [];
    for (const train of state.starlink.data.recentTrains) {
        const nextPass = findNextTrainPass(train, location, 24);
        if (nextPass && nextPass.max.elevation > 15)
            // Only report decent passes
            passes.push(nextPass);
    }

    // Sort by time
    passes.sort((a, b) => a.start.time - b.start.time);

    if (!state.starlinkPasses) state.starlinkPasses = {};
    state.starlinkPasses.data = {
        passes,
        nextPass: passes.length > 0 ? passes[0] : undefined,
        tonight: passes.filter((p) => p.minutesUntil >= 0 && p.minutesUntil < 720),
    };
    state.starlinkPasses.lastUpdate = Date.now();

    console.error(`satellites: update Starlink passes (${passes.length} visible)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// function getPasses(state, satelliteKey) {
//     const satState = state[satelliteKey];
//     if (!satState?.data) return undefined;
//     if (Date.now() - satState.lastUpdate > STALENESS.passes) return undefined;
//     return satState.data;
// }

function getCombinedPasses(state) {
    if (!state.combined?.data) return undefined;
    if (Date.now() - state.combined.lastUpdate > STALENESS.passes) return undefined;
    return state.combined.data;
}

function getUpcomingPasses(state, withinMinutes = 120) {
    const combined = getCombinedPasses(state);
    if (!combined) return [];
    return combined.allPasses.filter((pass) => {
        const mins = minutesUntilPass(pass.start.time);
        return mins > -5 && mins < withinMinutes; // Include passes that started up to 5 min ago
    });
}

// function getNextBrightPass(state) {
//     const upcoming = getUpcomingPasses(state, 720);  // Next 12 hours
//     if (upcoming.length === 0) return undefined;
//     return upcoming.reduce((best, pass) =>  (!best || pass.magnitude < best.magnitude) ? pass : best, undefined);
// }

function getStarlinkData(state) {
    if (!state.starlink?.data) return undefined;
    if (Date.now() - state.starlink.lastUpdate > STALENESS_STARLINK.tle) return undefined;
    return state.starlink.data;
}

function getStarlinkPasses(state) {
    if (!state.starlinkPasses?.data) return undefined;
    // Passes are time-sensitive, use shorter staleness
    if (Date.now() - state.starlinkPasses.lastUpdate > STALENESS.passes) return undefined;
    return state.starlinkPasses.data;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function updateIntervalCalculator(state, situation) {
    if (!situation) return [INTERVALS.background, 'no-situation'];
    const { hour, month } = situation;
    const upcoming = getUpcomingPasses(state, 60);
    // Pass coming up within 60 minutes - frequent updates
    if (upcoming.length > 0) {
        if (Math.min(...upcoming.map((p) => minutesUntilPass(p.start.time))) < 30) return [INTERVALS.active, 'pass-imminent'];
        return [INTERVALS.active, 'pass-soon'];
    }
    // In viewing window - check regularly
    if (isViewingWindow(hour, month)) return [INTERVALS.evening, 'viewing-window'];
    // Approaching viewing window - start fetching
    if (isApproachingViewingWindow(hour, month)) return [INTERVALS.evening, 'pre-viewing'];
    // Daytime - infrequent background updates
    return [INTERVALS.daytime, 'daytime'];
}
const _updateSchedule = { intervalId: undefined, currentInterval: undefined };
function updateSchedule(state, situation, location, apiKey) {
    fetchAllSatellites(state, location, apiKey).then(() => {
        const [interval, reason] = updateIntervalCalculator(state, situation);
        if (_updateSchedule.currentInterval !== interval) {
            if (_updateSchedule.intervalId) clearInterval(_updateSchedule.intervalId);
            _updateSchedule.currentInterval = interval;
            _updateSchedule.intervalId = setInterval(() => updateSchedule(state, situation, location, apiKey), interval);
            console.error(`satellites: update interval set to ${interval / 1000 / 60}m ('${reason}')`);
        }
    });
}

function updateStarlinkIntervalCalculator(state, _situation) {
    return [state.starlink?.data?.hasActiveTrain ? INTERVALS_STARLINK.recentLaunch : INTERVALS_STARLINK.normal, state.starlink?.data?.hasActiveTrain ? 'train-active' : 'no-train'];
}
const _starlinkSchedule = { intervalId: undefined, currentInterval: undefined };
function updateStarlinkSchedule(state, situation, location) {
    fetchStarlinkTLEs(state).then(() => {
        if (state.starlink?.data?.hasActiveTrain) updateStarlinkPasses(state, location);
        const [interval, reason] = updateStarlinkIntervalCalculator(state, situation);
        if (_starlinkSchedule.currentInterval !== interval) {
            if (_starlinkSchedule.intervalId) clearInterval(_starlinkSchedule.intervalId);
            _starlinkSchedule.currentInterval = interval;
            _starlinkSchedule.intervalId = setInterval(() => updateStarlinkSchedule(state, situation, location), interval);
            console.error(`satellites: update Starlink interval set to ${interval / 1000 / 60 / 60}h ('${reason}')`);
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSatellitePasses({ results, situation, store }) {
    const { hour, month, daylight } = situation;

    // Only report during/near viewing windows
    if (!isViewingWindow(hour, month) && !isApproachingViewingWindow(hour, month)) return;
    if (daylight?.isDaytime && hour > 8 && hour < 16) return;

    const upcoming = getUpcomingPasses(store.astronomy_satellites_realtime, 180); // Next 3 hours
    if (upcoming.length === 0) {
        // Check if we have any passes tonight at all
        const tonight = getCombinedPasses(store.astronomy_satellites_realtime)?.tonight || [];
        if (tonight.length > 0) {
            const [nextPass] = tonight;
            const minsUntil = minutesUntilPass(nextPass.start.time);
            if (minsUntil > 0 && minsUntil < 360) {
                results.phenomena.push(`satellites: next ${nextPass.satellite} pass at ${nextPass.start.timeFormatted} (mag ${nextPass.magnitude.toFixed(1)}, ${Math.round(minsUntil / 60)}h away)`);
            }
        }
        return;
    }

    // Report upcoming passes
    for (const pass of upcoming.slice(0, 3)) {
        // Max 3 passes
        const minsUntil = minutesUntilPass(pass.start.time);
        // eslint-disable-next-line unicorn/no-nested-ternary, sonarjs/no-nested-conditional
        const timeDesc = minsUntil < 0 ? 'NOW' : minsUntil < 2 ? 'STARTING' : `in ${minsUntil} min`;
        let text = `satellites: ${pass.satellite} ${timeDesc}`;
        // Details for imminent passes
        if (minsUntil < 30) {
            text += ` - ${pass.start.timeFormatted} to ${pass.end.timeFormatted}`;
            text += `, rises ${pass.start.azimuthCompass}`;
            text += `, max ${pass.max.elevation}° ${pass.max.azimuthCompass}`;
            text += `, mag ${pass.magnitude.toFixed(1)}`;
            if (pass.quality === 'excellent') {
                text += ' (VERY BRIGHT)';
            } else if (pass.quality === 'good') {
                text += ' (bright)';
            }
        } else {
            text += ` at ${pass.start.timeFormatted} (mag ${pass.magnitude.toFixed(1)})`;
        }
        // Alert for imminent bright passes
        if (minsUntil <= 10 && minsUntil >= -2 && pass.magnitude < PASS_QUALITY.good) {
            results.alerts.push(text);
        } else {
            results.phenomena.push(text);
        }
    }
}

function interpretBestPassTonight({ results, situation, store }) {
    const { hour } = situation;

    // Only in early evening, mention the best pass of the night
    if (hour < 17 || hour > 20) return;

    const tonight = getCombinedPasses(store.astronomy_satellites_realtime)?.tonight || [];
    if (tonight.length === 0) return;

    // Find best (brightest) pass tonight
    const best = tonight.reduce((b, p) => (!b || p.magnitude < b.magnitude ? p : b), undefined);
    if (!best || best.magnitude > PASS_QUALITY.visible) return;

    const minsUntil = minutesUntilPass(best.start.time);
    if (minsUntil < 60) return; // Will be reported by interpretSatellitePasses

    results.phenomena.push(`satellites: best pass tonight - ${best.satellite} at ${best.start.timeFormatted} (mag ${best.magnitude.toFixed(1)}, max ${best.max.elevation}°)`);
}

function interpretStarlinkTrain({ results, situation, store }) {
    const { hour, month, daylight } = situation;

    // Only during viewing windows
    if (!isViewingWindow(hour, month) && !isApproachingViewingWindow(hour, month)) return;
    if (daylight?.isDaytime && hour > 8 && hour < 16) return;

    const starlinkData = getStarlinkData(store.astronomy_satellites_realtime);
    if (!starlinkData?.hasActiveTrain) return;

    // Alert about active train
    const train = starlinkData.mostRecentTrain;
    if (train.isVeryRecent) {
        results.alerts.push(`satellites: STARLINK TRAIN active! ${train.satelliteCount} satellites launched ${train.ageDays.toFixed(0)} days ago - ${train.spectacularity} viewing`);
    } else {
        results.phenomena.push(`satellites: Starlink train visible (${train.satelliteCount} sats, ${train.ageDays.toFixed(0)} days old)`);
    }

    // Report upcoming passes
    const passesData = getStarlinkPasses(store.astronomy_satellites_realtime);
    if (passesData?.nextPass) {
        const pass = passesData.nextPass;
        if (pass.minutesUntil < 0) {
            results.alerts.push(`satellites: Starlink train PASSING NOW - look ${pass.max.azimuthCompass} at ${pass.max.elevation}°!`);
        } else if (pass.minutesUntil < 30) {
            results.alerts.push(`satellites: Starlink train in ${pass.minutesUntil} min - ${pass.start.timeFormatted} from ${pass.start.azimuthCompass}, max ${pass.max.elevation}° ${pass.max.azimuthCompass}`);
        } else if (pass.minutesUntil < 180) {
            results.phenomena.push(`satellites: Starlink train at ${pass.start.timeFormatted} (${Math.round(pass.minutesUntil / 60)}h, max ${pass.max.elevation}° ${pass.max.azimuthCompass})`);
        }
    }

    // Multiple trains?
    if (starlinkData.recentTrains.length > 1) {
        results.phenomena.push(`satellites: ${starlinkData.recentTrains.length} Starlink trains currently visible (multiple recent launches)`);
    }
}

function interpretStarlinkStats({ results, store }) {
    // Optional: report on Starlink constellation stats
    const starlinkData = getStarlinkData(store.astronomy_satellites_realtime);
    if (!starlinkData) return;

    // Only occasionally mention constellation size, 10% chance
    if (Math.random() < 0.1) {
        results.phenomena.push(`satellites: Starlink constellation now ${starlinkData.totalSatellites} satellites`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ location, store, options }) {
    const apiKey = options?.n2yoApiKey;

    if (!store.astronomy_satellites_realtime) store.astronomy_satellites_realtime = {};

    if (apiKey) {
        updateSchedule(store.astronomy_satellites_realtime, { hour: new Date().getHours(), month: new Date().getMonth() }, location, apiKey);
    } else {
        console.error('satellites-realtime: no N2YO API key, ISS/satellite tracking disabled');
    }
    if (satellite) {
        updateStarlinkSchedule(store.astronomy_satellites_realtime, { hour: new Date().getHours(), month: new Date().getMonth() }, location);
    } else {
        console.error('satellites-realtime: satellite.js not available, Starlink tracking disabled');
    }

    return {
        interpretSatellitePasses: apiKey ? interpretSatellitePasses : () => {},
        interpretBestPassTonight: apiKey ? interpretBestPassTonight : () => {},
        interpretStarlinkTrain: satellite ? interpretStarlinkTrain : () => {},
        interpretStarlinkStats: satellite ? interpretStarlinkStats : () => {},
    };
};
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
