// XXX not functioning properly, review

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');

function degToRad(deg) {
    return (deg * Math.PI) / 180;
}
function radToDeg(rad) {
    return (rad * 180) / Math.PI;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getDayAtOffset(date, offset) {
    let dayOffset = new Date(date);
    dayOffset.setDate(dayOffset.getDate() + offset);
    [dayOffset] = dayOffset.toISOString().split('T');
    return dayOffset;
}

function createLookupMap(eclipses) {
    const map = new Map();
    for (const eclipse of eclipses) {
        const dateKey = new Date(eclipse.date);
        dateKey.setUTCHours(0, 0, 0, 0);
        map.set(getDayAtOffset(dateKey, -1), eclipse);
        map.set(getDayAtOffset(dateKey, 0), eclipse);
        map.set(getDayAtOffset(dateKey, 1), eclipse);
    }
    return map;
}

function updateLookupMap(currentMap, precomputeFunc, currentDate, previousDate, latitude, longitude, daysAhead = 60, daysBefore = 5) {
    const now = new Date(currentDate);
    now.setUTCHours(0, 0, 0, 0);
    if (!previousDate) {
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - daysBefore);
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + daysAhead);
        currentMap = createLookupMap(precomputeFunc(startDate, endDate, latitude, longitude));
        return [now, currentMap];
    }
    if (Math.floor((now - previousDate) / (1000 * 60 * 60 * 24)) > daysBefore) {
        const startDateNew = new Date(now);
        startDateNew.setDate(startDateNew.getDate() + (daysAhead - 2 * daysBefore));
        const endDateNew = new Date(now);
        endDateNew.setDate(endDateNew.getDate() + daysAhead);
        for (const [key, value] of createLookupMap(precomputeFunc(startDateNew, endDateNew, latitude, longitude))) currentMap.set(key, value);
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - daysBefore);
        const [cutoffKey] = cutoffDate.toISOString().split('T');
        for (const [key] of currentMap) if (key < cutoffKey) currentMap.delete(key);
        return [now, currentMap];
    }
    return [previousDate, currentMap];
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const LUNAR_ECLIPSE_LIMIT = 17; // Maximum angular distance from node for any eclipse

/**
 * Calculate the shadow cone parameters for a lunar eclipse: Returns umbral and penumbral radii at Moon's distance
 */
function calculateLunarEclipseShadowCone(solarDistance, lunarDistance) {
    // Sun's angular radius as seen from Earth (in degrees) and Earth's angular radius as seen from Moon
    const solarAngularRadius = radToDeg(Math.asin(696000 / (solarDistance * toolsAstronomy.constants.ASTRONOMICAL_UNIT_KM))),
        earthAngularRadius = radToDeg(Math.asin(toolsAstronomy.constants.EARTH_RADIUS_KM / (lunarDistance * toolsAstronomy.constants.EARTH_RADIUS_KM)));
    // Umbral radius at Moon's distance (in Earth radii)
    const umbralRadius = 1.02 * (1.2848 + 0.0001 * lunarDistance) - solarAngularRadius * (lunarDistance / 60.2666);
    // Penumbral radius at Moon's distance (in Earth radii)
    const penumbralRadius = 1.02 * (1.2848 + 0.0001 * lunarDistance) + solarAngularRadius * (lunarDistance / 60.2666);
    return { umbralRadius, penumbralRadius, earthAngularRadius };
}

/**
 * Calculate the minimum distance between Moon center and shadow axis: This is the key parameter for eclipse magnitude
 */
function calculateLunarEclipseMinimumSeparation(lunarPos, solarPos) {
    // In a lunar eclipse, the Moon must be opposite the Sun
    const elongation = Math.abs(helpers.normalizeAngle(lunarPos.longitude - solarPos.longitude - 180));
    // Combine elongation error with latitude to get total separation
    // Convert to linear distance using small angle approximation
    const separation = Math.hypot(lunarPos.latitude * lunarPos.latitude + elongation * elongation);
    return separation;
}

/**
 * Determine eclipse type and calculate magnitude: Based on Meeus and NASA algorithms
 */
function calculateLunarEclipseParameters(lunarPos, solarPos) {
    const shadowCone = calculateLunarEclipseShadowCone(solarPos.distance, lunarPos.distance);
    const separation = calculateLunarEclipseMinimumSeparation(lunarPos, solarPos);
    // Convert separation to Earth radii at Moon's distance
    const separationEarthRadii = (separation * lunarPos.distance) / 60.2666;
    // Moon's angular radius (in degrees)
    const lunarRadius = radToDeg(Math.asin(toolsAstronomy.constants.LUNAR_RADIUS_KM / (lunarPos.distance * toolsAstronomy.constants.EARTH_RADIUS_KM)));
    const lunarRadiusEarthRadii = (lunarRadius * lunarPos.distance) / 60.2666;
    // Check eclipse type
    let type = 'none';
    let magnitude = 0;
    let penumbralMagnitude = 0;
    // Penumbral contact
    if (separationEarthRadii < shadowCone.penumbralRadius + lunarRadiusEarthRadii) {
        type = 'penumbral';
        penumbralMagnitude = (shadowCone.penumbralRadius + lunarRadiusEarthRadii - separationEarthRadii) / (2 * lunarRadiusEarthRadii);
        // Umbral contact
        if (separationEarthRadii < shadowCone.umbralRadius + lunarRadiusEarthRadii) {
            type = 'partial';
            magnitude = (shadowCone.umbralRadius + lunarRadiusEarthRadii - separationEarthRadii) / (2 * lunarRadiusEarthRadii);
            // Total eclipse
            if (separationEarthRadii + lunarRadiusEarthRadii < shadowCone.umbralRadius) {
                type = 'total';
                // For total eclipses, magnitude can exceed 1.0
                magnitude = (shadowCone.umbralRadius + lunarRadiusEarthRadii - separationEarthRadii) / (2 * lunarRadiusEarthRadii);
            }
        }
    }
    return {
        type,
        magnitude,
        penumbralMagnitude,
        separationEarthRadii,
        shadowCone,
        lunarRadiusEarthRadii,
    };
}

/**
 * Calculate contact times for lunar eclipse phases: Based on Moon's velocity and shadow geometry
 */
function calculateLunarEclipseContacts(eclipseParams, lunarPos, peakTime) {
    const { type, shadowCone, separationEarthRadii, lunarRadiusEarthRadii } = eclipseParams;
    // Moon's velocity in Earth radii per hour
    const lunarVelocityRadiiPerHour = (lunarPos.velocity * Math.PI) / (180 * 24);
    // Calculate time from peak to each contact
    const contacts = {};
    // Penumbral contacts (P1 and P4)
    const penumbralSemiDuration = Math.sqrt(Math.max(0, (shadowCone.penumbralRadius + lunarRadiusEarthRadii) ** 2 - separationEarthRadii ** 2)) / lunarVelocityRadiiPerHour;
    if (penumbralSemiDuration > 0) {
        contacts.p1 = new Date(peakTime.getTime() - penumbralSemiDuration * 60 * 60 * 1000);
        contacts.p4 = new Date(peakTime.getTime() + penumbralSemiDuration * 60 * 60 * 1000);
    }
    // Umbral contacts (U1 and U4) for partial and total eclipses
    if (type === 'partial' || type === 'total') {
        const umbralSemiDuration = Math.sqrt(Math.max(0, (shadowCone.umbralRadius + lunarRadiusEarthRadii) ** 2 - separationEarthRadii ** 2)) / lunarVelocityRadiiPerHour;
        if (umbralSemiDuration > 0) {
            contacts.u1 = new Date(peakTime.getTime() - umbralSemiDuration * 60 * 60 * 1000);
            contacts.u4 = new Date(peakTime.getTime() + umbralSemiDuration * 60 * 60 * 1000);
        }
    }
    // Total phase contacts (U2 and U3) for total eclipses
    if (type === 'total') {
        const totalSemiDuration = Math.sqrt(Math.max(0, (shadowCone.umbralRadius - lunarRadiusEarthRadii) ** 2 - separationEarthRadii ** 2)) / lunarVelocityRadiiPerHour;
        if (totalSemiDuration > 0) {
            contacts.u2 = new Date(peakTime.getTime() - totalSemiDuration * 60 * 60 * 1000);
            contacts.u3 = new Date(peakTime.getTime() + totalSemiDuration * 60 * 60 * 1000);
        }
    }
    return contacts;
}

/**
 * Find the exact moment of greatest eclipse by iteration: This refines the initial estimate
 */
function calculateLunarEclipseGreatestMoment(jd, lunarPos, solarPos, latitude, longitude) {
    let minSeparation = calculateLunarEclipseMinimumSeparation(lunarPos, solarPos);
    let step = 0.01; // About 15 minutes

    // Newton-Raphson iteration
    for (let i = 0; i < 10; i++) {
        const jdBefore = jd - step,
            jdAfter = jd + step;
        const lunarBefore = toolsAstronomy.getLunarPosition(helpers.juliandDateToDateUTC(jdBefore), latitude, longitude),
            solarBefore = toolsAstronomy.getSolarPosition(helpers.juliandDateToDateUTC(jdBefore), latitude, longitude),
            sepBefore = calculateLunarEclipseMinimumSeparation(lunarBefore, solarBefore);
        const lunarAfter = toolsAstronomy.getLunarPosition(helpers.juliandDateToDateUTC(jdAfter), latitude, longitude),
            solarAfter = toolsAstronomy.getSolarPosition(helpers.juliandDateToDateUTC(jdAfter), latitude, longitude),
            sepAfter = calculateLunarEclipseMinimumSeparation(lunarAfter, solarAfter);

        if (sepBefore < minSeparation) {
            jd = jdBefore;
            minSeparation = sepBefore;
        } else if (sepAfter < minSeparation) {
            jd = jdAfter;
            minSeparation = sepAfter;
        } else step *= 0.5; // Reduce step size
        if (step < 0.0001) break; // About 10 seconds precision
    }
    return jd;
}

/**
 * Calculate Danjon scale for total lunar eclipses: Estimates the darkness/color of the eclipse
 */
function calculateLunarEclipseDanjonScale(magnitude, _separation) {
    if (magnitude < 1) return undefined; // Not total
    // Simplified Danjon scale estimation
    // L = 4 (bright orange) to L = 0 (very dark)
    // Based on how deep the Moon goes into umbra
    const depth = magnitude - 1;
    if (depth > 0.8)
        return 0; // Very dark
    else if (depth > 0.6)
        return 1; // Dark, gray or brownish
    else if (depth > 0.3)
        return 2; // Deep red or rust
    else if (depth > 0.1)
        return 3; // Brick red
    else return 4; // Bright copper-red or orange
}

function calculateLunarEclipseVisibility(eclipse, latitude, longitude) {
    const visibility = { anyPhaseVisible: false, phases: {}, bestViewingTime: undefined, lunarPosition: {} };
    const { contacts, date } = eclipse;
    const checkPoints = [
        { name: 'start', time: contacts.p1, phase: 'penumbral' },
        { name: 'u1', time: contacts.u1, phase: 'partial' },
        { name: 'u2', time: contacts.u2, phase: 'total' },
        { name: 'greatest', time: date, phase: 'maximum' },
        { name: 'u3', time: contacts.u3, phase: 'total' },
        { name: 'u4', time: contacts.u4, phase: 'partial' },
        { name: 'end', time: contacts.p4, phase: 'penumbral' },
    ];
    let maxAltitude = -90;

    for (const point of checkPoints) {
        if (point.time) {
            const { altitude } = toolsAstronomy.getLunarPosition(point.time, latitude, longitude),
                visible = altitude > -0.5;
            visibility.phases[point.name] = {
                time: point.time,
                altitude,
                visible,
                phase: point.phase,
            };
            if (visible) {
                visibility.anyPhaseVisible = true;
                if (altitude > maxAltitude) {
                    maxAltitude = altitude;
                    visibility.bestViewingTime = point.time;
                    visibility.lunarPosition = { altitude, phase: point.phase };
                }
            }
        }
    }

    if (visibility.anyPhaseVisible) {
        const startVisible = visibility.phases.start?.visible,
            endVisible = visibility.phases.end?.visible,
            greatestVisible = visibility.phases.greatest?.visible;
        if (startVisible && endVisible && greatestVisible) visibility.description = `Complete ${eclipse.type} eclipse visible`;
        else if (greatestVisible) {
            if (startVisible && !endVisible) visibility.description = 'Eclipse visible from start through maximum, sets during final phases';
            else if (!startVisible && endVisible) visibility.description = 'Moon rises during eclipse, visible through end';
            else visibility.description = 'Maximum eclipse visible';
        } else if (startVisible || endVisible) visibility.description = 'Partial phases visible';
    } else visibility.description = 'Eclipse not visible from this location';
    return visibility;
}

function calculateLunarEclipseVisibilityRegions(eclipse, latitude, longitude) {
    const solarPos = toolsAstronomy.getSolarPosition(eclipse.date, latitude, longitude),
        antiSolarLon = (solarPos.longitude + 180) % 360;

    const regions = [
        { name: 'North America', west: 220, east: 300, lat: [15, 75] },
        { name: 'South America', west: 280, east: 325, lat: [-55, 15] },
        { name: 'Europe', west: 350, east: 40, lat: [35, 70] },
        { name: 'Africa', west: 340, east: 50, lat: [-35, 37] },
        { name: 'Middle East', west: 25, east: 60, lat: [12, 42] },
        { name: 'Asia', west: 60, east: 150, lat: [-10, 75] },
        { name: 'Australia & Oceania', west: 110, east: 180, lat: [-50, -10] },
        { name: 'Pacific Ocean', west: 150, east: 240, lat: [-60, 60] },
        { name: 'Atlantic Ocean', west: 300, east: 20, lat: [-60, 60] },
        { name: 'Indian Ocean', west: 40, east: 110, lat: [-60, 30] },
        { name: 'Arctic', west: 0, east: 360, lat: [66, 90] },
        { name: 'Antarctica', west: 0, east: 360, lat: [-90, -66] },
    ];
    const visibleRegions = [];
    for (const region of regions) {
        const inRange = region.west > region.east ? antiSolarLon >= region.west || antiSolarLon <= region.east : antiSolarLon >= region.west && antiSolarLon <= region.east;
        const regionCenter = region.west > region.east ? ((region.west + region.east + 360) / 2) % 360 : (region.west + region.east) / 2;
        const angularDistance = Math.abs(regionCenter - antiSolarLon);
        const normalizedDistance = angularDistance > 180 ? 360 - angularDistance : angularDistance;
        if (normalizedDistance < 90 || inRange) visibleRegions.push(region.name);
    }
    return visibleRegions;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function precomputeLunarEclipses(startDate, endDate, latitude, longitude) {
    const eclipses = [];

    const jdStart = helpers.dateToJulianDateUTC(startDate),
        jdEnd = helpers.dateToJulianDateUTC(endDate);
    const date = startDate;
    let jd = jdStart;
    while (jd <= jdEnd) {
        // Check if near full lunar (within 2%)
        const lunarPhase = toolsAstronomy.getLunarPhase(date);
        if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
            const lunarPos = toolsAstronomy.getLunarPosition(date, latitude, longitude),
                solarPos = toolsAstronomy.getSolarPosition(date, latitude, longitude);

            // Check node distance
            const nodeDistance = toolsAstronomy.calculateNodeDistance(jd, lunarPos.longitude);
            if (nodeDistance <= LUNAR_ECLIPSE_LIMIT) {
                // Potential eclipse - find exact greatest eclipse moment
                const greatestJd = calculateLunarEclipseGreatestMoment(jd, lunarPos, solarPos, latitude, longitude);
                const greatestDate = helpers.juliandDateToDateUTC(greatestJd);
                const lunarAtGreatest = toolsAstronomy.getLunarPosition(greatestDate, latitude, longitude);
                const solarAtGreatest = toolsAstronomy.getSolarPosition(greatestDate, latitude, longitude);

                // Calculate eclipse parameters
                const params = calculateLunarEclipseParameters(lunarAtGreatest, solarAtGreatest);
                if (params.type !== 'none') {
                    const contacts = calculateLunarEclipseContacts(params, lunarAtGreatest, greatestDate);
                    eclipses.push({
                        date: greatestDate,
                        type: params.type,
                        magnitude: params.magnitude,
                        penumbralMagnitude: params.penumbralMagnitude,
                        contacts,
                        danjonScale: calculateLunarEclipseDanjonScale(params.magnitude, params.separationEarthRadii),
                        lunarDistance: lunarAtGreatest.distance * toolsAstronomy.constants.EARTH_RADIUS_KM,
                        duration: {
                            total: contacts.p4 ? (contacts.p4.getTime() - contacts.p1.getTime()) / (60 * 1000) : 0,
                            partial: contacts.u4 ? (contacts.u4.getTime() - contacts.u1.getTime()) / (60 * 1000) : 0,
                            totality: contacts.u3 ? (contacts.u3.getTime() - contacts.u2.getTime()) / (60 * 1000) : 0,
                        },
                    });

                    // Skip ahead to avoid finding the same eclipse
                    jd += 20;
                    date.setTime(date.getTime() + 20 * 24 * 60 * 60 * 1000);
                    continue;
                }
            }
        }
        jd++;
        date.setTime(date.getTime() + 1 * 24 * 60 * 60 * 1000);
    }

    console.error(`precomputeLunarEclipses: ${startDate.toISOString()}/${endDate.toISOString()} (${jdEnd - jdStart} days) -- ${eclipses.length} results`);
    return eclipses;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function generateLunarEclipseCurrentInterpretation(eclipse, location, cloudCover, humidity, windSpeed) {
    const { type, magnitude, danjonScale, duration, penumbralMagnitude, lunarDistance } = eclipse;
    const interpretation = {
        phenomena: [],
        alerts: [],
        conditions: [],
    };

    interpretation.phenomena.push(`${type} lunar eclipse today`);

    switch (type) {
        case 'total': {
            interpretation.phenomena.push(`total eclipse magnitude: ${magnitude.toFixed(2)}`);

            if (magnitude > 1.7) {
                interpretation.alerts.push('very deep total lunar eclipse');
                interpretation.phenomena.push('Moon will appear very dark red');
            } else if (magnitude > 1.4) interpretation.phenomena.push('deep total eclipse - dark red Moon');
            else if (magnitude > 1.2) interpretation.phenomena.push('Moon will appear copper-red');
            else interpretation.phenomena.push('Moon will appear bright red-orange');

            if (danjonScale !== undefined) {
                const danjonDescriptions = [
                    'very dark eclipse - Moon almost invisible',
                    'dark eclipse - gray or brownish coloration',
                    'deep red or rust-colored eclipse',
                    'brick-red eclipse with dark central shadow',
                    'bright copper-red or orange eclipse',
                ];
                interpretation.phenomena.push(danjonDescriptions[danjonScale]);
            }

            if (duration.totality > 0) {
                const hours = Math.floor(duration.totality / 60),
                    minutes = Math.round(duration.totality % 60);
                interpretation.phenomena.push(`totality duration: ${hours}h ${minutes}m`);
                if (duration.totality > 100) interpretation.phenomena.push('unusually long total phase');
            }
            break;
        }
        case 'partial': {
            interpretation.phenomena.push(`partial eclipse magnitude: ${magnitude.toFixed(2)}`);
            interpretation.phenomena.push(`${Math.round(magnitude * 100)}% of Moon's diameter in umbra`);
            break;
        }
        case 'penumbral': {
            interpretation.phenomena.push('subtle penumbral eclipse');
            if (penumbralMagnitude > 0.9) interpretation.phenomena.push('deep penumbral eclipse - shading may be visible');
            else interpretation.phenomena.push('difficult to observe without equipment');
            break;
        }
    }

    if (location.latitude !== undefined && location.longitude !== undefined) {
        const visibility = calculateLunarEclipseVisibility(eclipse, location.latitude, location.longitude);
        if (visibility.anyPhaseVisible) {
            interpretation.phenomena.push(visibility.description);
            if (visibility.bestViewingTime)
                interpretation.phenomena.push(
                    `best viewing: ${visibility.bestViewingTime.getHours()}:${String(visibility.bestViewingTime.getMinutes()).padStart(2, '0')} (Moon ${Math.round(visibility.lunarPosition.altitude)}° above horizon)`
                );
            if (cloudCover !== undefined) {
                if (cloudCover < 20) interpretation.phenomena.push('excellent conditions for eclipse viewing');
                else if (cloudCover < 50) interpretation.phenomena.push('fair conditions - some clouds may interfere');
                else if (cloudCover < 80) interpretation.phenomena.push('poor conditions - significant cloud cover');
                else interpretation.phenomena.push('eclipse likely obscured by clouds');
            }
            if (visibility.lunarPosition.altitude > 60 && type === 'total') interpretation.phenomena.push('eclipse near zenith - ideal viewing angle');
            else if (visibility.lunarPosition.altitude < 10) interpretation.phenomena.push('eclipse low on horizon - atmospheric effects may enhance colors');
        } else {
            interpretation.phenomena.push('lunar eclipse not visible from your location');
            interpretation.phenomena.push('Moon below horizon during eclipse');
        }
    }

    const visibleRegions = calculateLunarEclipseVisibilityRegions(eclipse, location.latitude, location.longitude);
    if (visibleRegions.length > 0) interpretation.phenomena.push(`visible from: ${visibleRegions.slice(0, 5).join(', ')}${visibleRegions.length > 5 ? ' and others' : ''}`);

    if (lunarDistance < 362000) interpretation.phenomena.push('eclipse occurs near lunar perigee - Moon appears larger');
    else if (lunarDistance > 405000) interpretation.phenomena.push('eclipse occurs near lunar apogee - Moon appears smaller');

    if (type === 'total' && cloudCover !== undefined && cloudCover < 30) {
        if (humidity < 60 && windSpeed < 5) interpretation.phenomena.push('excellent conditions for eclipse photography');
        else if (humidity > 80) interpretation.phenomena.push('high humidity may affect telescope viewing');
    }

    if (type === 'total' && magnitude > 1.8) {
        interpretation.alerts.push('exceptionally dark total lunar eclipse');
        interpretation.phenomena.push('similar to historic dark eclipses (volcanic dust enhancement)');
    }

    return interpretation;
}

function __generateLunarEclipseUpcomingInterpretation(eclipse, daysUntil, location) {
    const interpretation = {
        phenomena: [],
        alerts: [],
        conditions: [],
    };

    interpretation.phenomena.push(`${eclipse.type} lunar eclipse in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`);

    if (location.latitude !== undefined && location.longitude !== undefined) {
        const futureVisibility = calculateLunarEclipseVisibility(eclipse, location.latitude, location.longitude);
        if (futureVisibility.anyPhaseVisible) {
            interpretation.phenomena.push('upcoming eclipse will be visible from your location');
            if (eclipse.type === 'total' && eclipse.magnitude > 1.5) interpretation.phenomena.push('deep total eclipse coming - worth planning for');
        } else interpretation.phenomena.push('upcoming eclipse will not be visible from your location');
    }

    return interpretation;
}

function generateLunarEclipseUpcomingInterpretation(date, location, lookupCache, lookupAheadDays) {
    const interpretation = {
        phenomena: [],
        alerts: [],
        conditions: [],
    };
    for (let i = 1; i <= lookupAheadDays; i++) {
        const checkDate = new Date(date);
        checkDate.setDate(checkDate.getDate() + i);
        const [checkKey] = checkDate.toISOString().split('T');
        const upcomingEclipse = lookupCache.get(checkKey);
        if (upcomingEclipse) return __generateLunarEclipseUpcomingInterpretation(upcomingEclipse, i, location);
    }
    return interpretation;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

let lunarEclipseLookupCache = new Map();
let lunarEclipseLookupAheadDays = 14,
    lunarEclipseLookupCacheDaysBefore = 5,
    lunarEclipseLookupCacheDaysAhead = 60;

function interpretLunarEclipses(results, situation, data, _data_previous, store, _options) {
    const { date, location } = situation;
    const { cloudCover, humidity, windSpeed } = data;

    if (!store.lunarEclipse)
        store.lunarEclipse = {
            cacheUpdated: undefined,
            cacheToday: {
                cachedDate: undefined,
                interpretation: undefined,
            },
        };

    const todayKey = new Date(date);
    todayKey.setHours(0, 0, 0, 0);
    const [todayKeyStr] = todayKey.toISOString().split('T');
    let { interpretation, date: cacheDate } = store.lunarEclipse.cacheToday;
    if (cacheDate !== todayKeyStr || !interpretation) {
        [store.lunarEclipse.cacheUpdated, lunarEclipseLookupCache] = updateLookupMap(
            lunarEclipseLookupCache,
            precomputeLunarEclipses,
            date,
            store.lunarEclipse.cacheUpdated,
            location.latitude,
            location.longitude,
            lunarEclipseLookupCacheDaysAhead,
            lunarEclipseLookupCacheDaysBefore
        );
        const eclipse = lunarEclipseLookupCache.get(todayKeyStr);
        interpretation = eclipse
            ? generateLunarEclipseCurrentInterpretation(eclipse, location, cloudCover, humidity, windSpeed)
            : generateLunarEclipseUpcomingInterpretation(date, location, lunarEclipseLookupCache, lunarEclipseLookupAheadDays);
        if (interpretation) {
            store.lunarEclipse.cacheToday.date = todayKeyStr;
            store.lunarEclipse.cacheToday.interpretation = interpretation;
        }
    }

    if (interpretation) {
        results.phenomena.push(...interpretation.phenomena);
        results.conditions.push(...interpretation.conditions);
        results.alerts.push(...interpretation.alerts);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const SOLAR_ECLIPSE_LIMIT = 18.5; // Maximum angular distance from node for any solar eclipse

/**
 * Calculate the angular diameter of the Moon and Sun: Returns diameters in degrees
 */
function calculateSolarEclipseAngularDiameters(lunarDistance, solarDistance) {
    // Moon's angular diameter (in degrees)
    const lunarAngularDiameter = radToDeg(2 * Math.asin(toolsAstronomy.constants.LUNAR_RADIUS_KM / (lunarDistance * toolsAstronomy.constants.EARTH_RADIUS_KM)));
    // Sun's angular diameter (in degrees)
    const solarAngularDiameter = radToDeg(2 * Math.asin(toolsAstronomy.constants.SOLAR_RADIUS_KM / (solarDistance * toolsAstronomy.constants.ASTRONOMICAL_UNIT_KM)));
    return { lunarAngularDiameter, solarAngularDiameter };
}

/**
 * Calculate the angular separation between Moon and Sun: More accurate than the original implementation
 */
function calculateSolarEclipseAngularSeparation(lunarPos, solarPos) {
    const lunarLonRad = degToRad(lunarPos.longitude),
        lunarLatRad = degToRad(lunarPos.latitude);
    const solarLonRad = degToRad(solarPos.longitude),
        solarLatRad = degToRad(solarPos.latitude);
    // Use the haversine formula for better accuracy at small distances
    const dLon = lunarLonRad - solarLonRad,
        dLat = lunarLatRad - solarLatRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(solarLatRad) * Math.cos(lunarLatRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radToDeg(c);
}

/**
 * Calculate Besselian elements for solar eclipse: These are fundamental parameters for eclipse calculations
 */
function calculateSolarEclipseBesselianElements(lunarPos, solarPos) {
    // Calculate shadow axis direction
    const shadowLon = helpers.normalizeAngle(solarPos.longitude + 180),
        shadowLat = -solarPos.latitude;
    // Distance from Earth center to shadow axis
    const { lunarAngularDiameter, solarAngularDiameter } = calculateSolarEclipseAngularDiameters(lunarPos.distance * toolsAstronomy.constants.EARTH_RADIUS_KM, solarPos.distance);
    // Shadow cone angles
    const f1 = (solarAngularDiameter - lunarAngularDiameter) / 2, // Penumbral cone angle
        f2 = (solarAngularDiameter + lunarAngularDiameter) / 2; // Umbral cone angle
    return {
        x: lunarPos.distance * Math.cos(degToRad(lunarPos.latitude)) * Math.cos(degToRad(lunarPos.longitude - shadowLon)),
        y: lunarPos.distance * Math.cos(degToRad(lunarPos.latitude)) * Math.sin(degToRad(lunarPos.longitude - shadowLon)),
        z: lunarPos.distance * Math.sin(degToRad(lunarPos.latitude)),
        d: degToRad(shadowLat),
        f1: degToRad(f1),
        f2: degToRad(f2),
        l1: (f1 * lunarPos.distance * toolsAstronomy.constants.EARTH_RADIUS_KM) / toolsAstronomy.constants.ASTRONOMICAL_UNIT_KM, // Penumbral shadow radius
        l2: (f2 * lunarPos.distance * toolsAstronomy.constants.EARTH_RADIUS_KM) / toolsAstronomy.constants.ASTRONOMICAL_UNIT_KM, // Umbral shadow radius
    };
}

/**
 * Determine solar eclipse type and calculate parameters
 */
function calculateSolarEclipseParameters(lunarPos, solarPos) {
    const angularSeparation = calculateSolarEclipseAngularSeparation(lunarPos, solarPos);
    const { lunarAngularDiameter, solarAngularDiameter } = calculateSolarEclipseAngularDiameters(lunarPos.distance * toolsAstronomy.constants.EARTH_RADIUS_KM, solarPos.distance);
    // Basic magnitude calculation
    const magnitude = calculateSolarEclipseMagnitude(angularSeparation, lunarAngularDiameter, solarAngularDiameter);
    if (magnitude <= 0) return { type: 'none', magnitude: 0 };
    // Determine eclipse type
    const diameterRatio = lunarAngularDiameter / solarAngularDiameter;
    let type;
    if (angularSeparation < Math.abs(lunarAngularDiameter - solarAngularDiameter) / 2) type = diameterRatio > 1 ? 'total' : 'annular';
    else if (angularSeparation < (lunarAngularDiameter + solarAngularDiameter) / 2) type = 'partial';
    else type = 'partial';
    // Calculate obscuration (fraction of Sun's disk covered)
    const obscuration = calculateSolarEclipseObscuration(angularSeparation, lunarAngularDiameter, solarAngularDiameter);
    // Calculate gamma (minimum distance from Earth center to shadow axis)
    const besselian = calculateSolarEclipseBesselianElements(lunarPos, solarPos);
    const gamma = Math.hypot(besselian.x * besselian.x + besselian.y * besselian.y);
    return {
        type,
        magnitude,
        obscuration,
        gamma,
        lunarAngularDiameter,
        solarAngularDiameter,
        diameterRatio,
        angularSeparation,
        besselian,
    };
}

/**
 * Calculate solar eclipse magnitude: Improved version with better edge case handling
 */
function calculateSolarEclipseMagnitude(angularSeparation, lunarDiameter, solarDiameter) {
    // No eclipse
    if (angularSeparation >= (lunarDiameter + solarDiameter) / 2) return 0;
    // For central eclipses
    if (angularSeparation <= Math.abs(lunarDiameter - solarDiameter) / 2) return lunarDiameter / solarDiameter;
    // For partial eclipses
    return (lunarDiameter + solarDiameter - 2 * angularSeparation) / (2 * solarDiameter);
}

/**
 * Calculate obscuration (fraction of Sun's area covered)
 */
function calculateSolarEclipseObscuration(angularSeparation, lunarDiameter, solarDiameter) {
    const magnitude = calculateSolarEclipseMagnitude(angularSeparation, lunarDiameter, solarDiameter);
    if (magnitude <= 0) return 0;
    if (magnitude >= 1) return 1;
    // Convert to radians for calculation
    const sep = degToRad(angularSeparation),
        rm = degToRad(lunarDiameter / 2),
        rs = degToRad(solarDiameter / 2);
    if (sep >= rm + rs) return 0;
    // Area of intersection calculation
    const x = (sep * sep + rs * rs - rm * rm) / (2 * sep),
        y = Math.sqrt(rs * rs - x * x);
    const area1 = rs * rs * Math.acos(x / rs) - x * y,
        area2 = rm * rm * Math.acos((sep - x) / rm) - (sep - x) * y;
    return (area1 + area2) / (Math.PI * rs * rs);
}

/**
 * Calculate eclipse path and visibility: Simplified but more accurate than original
 */
function calculateSolarEclipsePath(params) {
    const { type, gamma, besselian } = params;
    // Partial eclipses don't have a central path
    if (type === 'partial')
        return {
            hasPath: false,
            pathType: 'partial',
            width: 0,
        };
    // For total and annular eclipses
    const pathType = type === 'total' ? 'totality' : 'annularity';
    // Calculate path width (simplified)
    const shadowRadius = type === 'total' ? Math.abs(besselian.l2) : Math.abs(besselian.l1 - besselian.l2);
    const width = (2 * shadowRadius * toolsAstronomy.constants.EARTH_RADIUS_KM) / 1000; // Convert to km
    // Calculate central line coordinates (simplified)
    // In reality, this requires complex calculations involving Earth's rotation
    const latitude = radToDeg(Math.asin(besselian.z / Math.hypot(besselian.x * besselian.x + besselian.y * besselian.y + besselian.z * besselian.z)));
    const longitude = helpers.normalizeAngle(radToDeg(Math.atan2(besselian.y, besselian.x)));
    return {
        hasPath: true,
        pathType,
        width,
        centralLine: {
            latitude,
            longitude,
        },
        gamma,
    };
}

/**
 * Calculate eclipse duration at greatest eclipse
 */
function calculateSolarEclipseDuration(params) {
    const { type, diameterRatio, gamma } = params;
    if (type === 'partial') return 0;
    // Base duration in minutes (at equator, overhead sun)
    // Max ~7.5 minutes for total, Max ~12.3 minutes for annular
    const baseDuration = type === 'total' ? 7.5 * diameterRatio : 12.3 / diameterRatio;
    // Adjust for gamma (distance from Earth center)
    const gammaFactor = Math.sqrt(Math.max(0, 1 - gamma * gamma));
    return baseDuration * gammaFactor;
}

/**
 * Find exact moment of solar conjunction (new moon)
 */
function calculateSolarEclipseConjunction(jd, lunarPos, solarPos, latitude, longitude) {
    let step = 0.01; // About 15 minutes
    // Find minimum elongation
    for (let i = 0; i < 10; i++) {
        const jdBefore = jd - step,
            jdAfter = jd + step;
        const dateBefore = helpers.juliandDateToDateUTC(jdBefore),
            dateAfter = helpers.juliandDateToDateUTC(jdAfter);
        const lunarBefore = toolsAstronomy.getLunarPosition(dateBefore, latitude, longitude),
            solarBefore = toolsAstronomy.getSolarPosition(dateBefore, latitude, longitude),
            elongBefore = Math.abs(helpers.normalizeAngle(lunarBefore.longitude - solarBefore.longitude));
        const lunarAfter = toolsAstronomy.getLunarPosition(dateAfter, latitude, longitude),
            solarAfter = toolsAstronomy.getSolarPosition(dateAfter, latitude, longitude),
            elongAfter = Math.abs(helpers.normalizeAngle(lunarAfter.longitude - solarAfter.longitude));
        const elongCurrent = Math.abs(helpers.normalizeAngle(lunarPos.longitude - solarPos.longitude));
        if (elongBefore < elongCurrent) {
            jd = jdBefore;
            lunarPos = lunarBefore;
            solarPos = solarBefore;
        } else if (elongAfter < elongCurrent) {
            jd = jdAfter;
            lunarPos = lunarAfter;
            solarPos = solarAfter;
        } else step *= 0.5;
        if (step < 0.00001) break; // About 1 second precision
    }
    return jd;
}

/**
 * Calculate visibility of solar eclipse from a specific location
 */
function calculateSolarEclipseVisibility(eclipse, latitude, longitude) {
    // This is simplified - actual calculation requires:
    // 1. Earth rotation consideration
    // 2. Sunrise/sunset times
    // 3. Atmospheric refraction
    // 4. Precise shadow path calculation
    const visibility = {
        visible: false,
        type: 'none',
        magnitude: 0,
        obscuration: 0,
        times: {},
    };
    // For now, use simplified distance calculation
    if (eclipse.path.hasPath) {
        const distToPath = Math.hypot((latitude - eclipse.path.centralLine.latitude) ** 2 + (longitude - eclipse.path.centralLine.longitude) ** 2);
        if (eclipse.type === 'total' || eclipse.type === 'annular') {
            if (distToPath < eclipse.path.width / 222) {
                // Rough conversion to degrees
                visibility.visible = true;
                visibility.type = eclipse.type;
                visibility.magnitude = eclipse.magnitude;
                visibility.obscuration = eclipse.obscuration;
            } else if (distToPath < 70) {
                visibility.visible = true;
                visibility.type = 'partial';
                // Estimate partial magnitude based on distance
                visibility.magnitude = Math.max(0, eclipse.magnitude * (1 - distToPath / 70));
                visibility.obscuration = visibility.magnitude * visibility.magnitude;
            }
        }
    } else if (eclipse.type === 'partial') {
        // Partial eclipses visible over large area: Simplified visibility check
        const { altitude } = toolsAstronomy.getSolarPosition(eclipse.date, latitude, longitude);
        if (altitude > -0.5) {
            visibility.visible = true;
            visibility.type = 'partial';
            visibility.magnitude = eclipse.magnitude * 0.5; // Simplified
            visibility.obscuration = eclipse.obscuration * 0.5;
        }
    }
    return visibility;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function precomputeSolarEclipses(startDate, endDate, latitude, longitude) {
    const eclipses = [];

    const jdStart = helpers.dateToJulianDateUTC(startDate),
        jdEnd = helpers.dateToJulianDateUTC(endDate);
    let jd = jdStart;
    const date = helpers.juliandDateToDateUTC(jd);
    while (jd <= jdEnd) {
        // Check if near new moon (within 3%)
        const lunarPhase = toolsAstronomy.getLunarPhase(date);
        if (lunarPhase >= 0.97 || lunarPhase <= 0.03) {
            const lunarPos = toolsAstronomy.getLunarPosition(date, latitude, longitude),
                solarPos = toolsAstronomy.getSolarPosition(date, latitude, longitude);

            // Check if Moon is near a node
            const nodeDistance = toolsAstronomy.calculateNodeDistance(jd, lunarPos.longitude);
            if (nodeDistance <= SOLAR_ECLIPSE_LIMIT) {
                // Find exact moment of conjunction
                const conjunctionJd = calculateSolarEclipseConjunction(jd, lunarPos, solarPos, latitude, longitude);
                const conjunctionDate = helpers.juliandDateToDateUTC(conjunctionJd);
                const lunarAtConj = toolsAstronomy.getLunarPosition(conjunctionDate, latitude, longitude);
                const solarAtConj = toolsAstronomy.getSolarPosition(conjunctionDate, latitude, longitude);

                // Calculate eclipse parameters
                const params = calculateSolarEclipseParameters(lunarAtConj, solarAtConj);
                if (params.type !== 'none') {
                    eclipses.push({
                        date: conjunctionDate,
                        type: params.type,
                        magnitude: params.magnitude,
                        obscuration: params.obscuration,
                        gamma: params.gamma,
                        duration: calculateSolarEclipseDuration(params),
                        path: calculateSolarEclipsePath(params),
                        lunarDistance: lunarAtConj.distance * toolsAstronomy.constants.EARTH_RADIUS_KM,
                        solarDistance: solarAtConj.distance * toolsAstronomy.constants.ASTRONOMICAL_UNIT_KM,
                        diameterRatio: params.diameterRatio,
                    });

                    // Skip ahead to avoid finding the same eclipse
                    jd += 25;
                    date.setTime(date.getTime() + 25 * 24 * 60 * 60 * 1000);
                    continue;
                }
            }
        }
        jd += 1;
        date.setTime(date.getTime() + 1 * 24 * 60 * 60 * 1000);
    }

    console.error(`precomputeSolarEclipses: ${startDate.toISOString()}/${endDate.toISOString()} (${jdEnd - jdStart} days) -- ${eclipses.length} results`);
    return eclipses;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function generateSolarEclipseCurrentInterpretation(eclipse, location, cloudCover) {
    const interpretation = {
        phenomena: [],
        alerts: [],
        conditions: [],
    };

    interpretation.phenomena.push(`${eclipse.type} solar eclipse today`);

    interpretation.phenomena.push(`eclipse magnitude: ${eclipse.magnitude.toFixed(3)}`);

    if (eclipse.obscuration < 1) interpretation.phenomena.push(`${Math.round(eclipse.obscuration * 100)}% of Sun's disk covered`);

    switch (eclipse.type) {
        case 'total': {
            interpretation.alerts.push('rare total solar eclipse');
            if (eclipse.duration > 6) interpretation.phenomena.push(`exceptionally long totality: ${eclipse.duration.toFixed(1)} minutes`);
            else if (eclipse.duration > 4) interpretation.phenomena.push(`long totality duration: ${eclipse.duration.toFixed(1)} minutes`);
            else interpretation.phenomena.push(`totality duration: ${eclipse.duration.toFixed(1)} minutes`);
            if (eclipse.path.width > 250) interpretation.phenomena.push(`wide path of totality: ${Math.round(eclipse.path.width)} km`);
            break;
        }
        case 'annular': {
            interpretation.alerts.push('annular "ring of fire" solar eclipse');
            if (eclipse.duration > 10) interpretation.phenomena.push(`very long annular phase: ${eclipse.duration.toFixed(1)} minutes`);
            else interpretation.phenomena.push(`annular phase duration: ${eclipse.duration.toFixed(1)} minutes`);
            interpretation.phenomena.push(`ring thickness: ${((1 - eclipse.diameterRatio) * 100).toFixed(1)}% of Sun's diameter`);
            break;
        }
        case 'partial': {
            if (eclipse.magnitude > 0.8) interpretation.phenomena.push('deep partial eclipse');
            else if (eclipse.magnitude > 0.5) interpretation.phenomena.push('significant partial eclipse');
            break;
        }
    }

    if (location.latitude !== undefined && location.longitude !== undefined) {
        const visibility = calculateSolarEclipseVisibility(eclipse, location.latitude, location.longitude);
        if (visibility.visible) {
            switch (visibility.type) {
                case 'total': {
                    interpretation.phenomena.push('total solar eclipse visible from your location');
                    interpretation.alerts.push('DO NOT look directly at Sun without proper eclipse glasses');
                    interpretation.phenomena.push('totality safe to view with naked eye ONLY during total phase');
                    break;
                }
                case 'annular': {
                    interpretation.phenomena.push('annular eclipse visible from your location');
                    interpretation.alerts.push('NEVER safe to view without proper eclipse glasses');
                    interpretation.phenomena.push('ring of sunlight remains visible throughout');
                    break;
                }
                case 'partial': {
                    interpretation.phenomena.push('partial solar eclipse visible from your location');
                    interpretation.phenomena.push(`maximum coverage: ${Math.round(visibility.obscuration * 100)}%`);
                    interpretation.alerts.push('use proper eclipse glasses for safe viewing');
                    break;
                }
            }
            if (cloudCover !== undefined) {
                if (cloudCover < 20) interpretation.phenomena.push('excellent viewing conditions - clear skies');
                else if (cloudCover < 50) interpretation.phenomena.push('fair viewing conditions - some clouds may interfere');
                else if (cloudCover < 80) interpretation.phenomena.push('poor viewing conditions - significant cloud cover');
                else interpretation.phenomena.push('eclipse likely obscured by heavy cloud cover');
            }
        } else interpretation.phenomena.push('solar eclipse not visible from your location');
        if (visibility.visible || !location.latitude) {
            interpretation.alerts.push('NEVER look directly at Sun without certified eclipse glasses');
            interpretation.phenomena.push('use ISO 12312-2 certified solar filters only');
        }
    }

    if (eclipse.path.hasPath) interpretation.phenomena.push(`path of ${eclipse.path.pathType} crosses multiple regions`);

    if (eclipse.gamma < 0.3) interpretation.phenomena.push('central eclipse - shadow passes near Earth center');

    if (eclipse.lunarDistance < 370000) {
        interpretation.phenomena.push('eclipse occurs with Moon near perigee');
        if (eclipse.type === 'total') interpretation.phenomena.push('enhanced totality duration due to larger Moon');
    } else if (eclipse.lunarDistance > 400000) {
        interpretation.phenomena.push('eclipse occurs with Moon near apogee');
        if (eclipse.type === 'annular') interpretation.phenomena.push('thinner annular ring due to smaller Moon');
    }

    if (eclipse.type === 'total' && eclipse.magnitude > 1.08) interpretation.alerts.push('very deep total eclipse - extended corona visible');

    return interpretation;
}

function __generateSolarEclipseUpcomingInterpretation(eclipse, daysUntil, location) {
    const interpretation = {
        phenomena: [],
        alerts: [],
        conditions: [],
    };

    interpretation.phenomena.push(`${eclipse.type} solar eclipse in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`);

    if (location.latitude !== undefined && location.longitude !== undefined) {
        const visibility = calculateSolarEclipseVisibility(eclipse, location.latitude, location.longitude);
        if (visibility.visible) {
            interpretation.phenomena.push(`upcoming ${visibility.type} eclipse will be visible from your location`);
            if (visibility.type === 'total') interpretation.alerts.push('rare total solar eclipse coming - plan viewing location');
            else if (visibility.type === 'annular') interpretation.phenomena.push('annular "ring of fire" eclipse coming');
            interpretation.phenomena.push('order eclipse glasses in advance for safe viewing');
        } else interpretation.phenomena.push('upcoming eclipse will not be visible from your location');
    }

    return interpretation;
}

function generateSolarEclipseUpcomingInterpretation(date, location, lookupCache, lookupAheadDays) {
    const interpretation = {
        phenomena: [],
        alerts: [],
        conditions: [],
    };
    for (let i = 1; i <= lookupAheadDays; i++) {
        const checkDate = new Date(date);
        checkDate.setDate(checkDate.getDate() + i);
        const [checkKey] = checkDate.toISOString().split('T');
        const upcomingEclipse = lookupCache.get(checkKey);
        if (upcomingEclipse) return __generateSolarEclipseUpcomingInterpretation(upcomingEclipse, i, location);
    }
    return interpretation;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

let solarEclipseLookupCache = new Map();
let solarEclipseLookupAheadDays = 14,
    solarEclipseLookupCacheDaysBefore = 5,
    solarEclipseLookupCacheDaysAhead = 60;

function interpretSolarEclipses(results, situation, data, _data_previous, store, _options) {
    const { date, location } = situation;
    const { cloudCover } = data;

    if (!store.solarEclipse)
        store.solarEclipse = {
            cacheUpdated: undefined,
            cacheToday: {
                cachedDate: undefined,
                interpretation: undefined,
            },
        };

    const todayKey = new Date(date);
    todayKey.setHours(0, 0, 0, 0);
    const [todayKeyStr] = todayKey.toISOString().split('T');
    let { interpretation, date: cacheDate } = store.solarEclipse.cacheToday;
    if (cacheDate !== todayKeyStr || !interpretation) {
        [store.solarEclipse.cacheUpdated, solarEclipseLookupCache] = updateLookupMap(
            solarEclipseLookupCache,
            precomputeSolarEclipses,
            date,
            store.solarEclipse.cacheUpdated,
            location.latitude,
            location.longitude,
            solarEclipseLookupCacheDaysAhead,
            solarEclipseLookupCacheDaysBefore
        );
        const eclipse = solarEclipseLookupCache.get(todayKeyStr);
        interpretation = eclipse ? generateSolarEclipseCurrentInterpretation(eclipse, location, cloudCover) : generateSolarEclipseUpcomingInterpretation(date, location, solarEclipseLookupCache, solarEclipseLookupAheadDays);
        if (interpretation) {
            store.solarEclipse.cacheToday.date = todayKeyStr;
            store.solarEclipse.cacheToday.interpretation = interpretation;
        }
    }

    if (interpretation) {
        results.phenomena.push(...interpretation.phenomena);
        results.conditions.push(...interpretation.conditions);
        results.alerts.push(...interpretation.alerts);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ options }) {
    if (options?.lunarEclipse?.daysBefore) lunarEclipseLookupCacheDaysBefore = options.lunarEclipse.daysBefore;
    if (options?.lunarEclipse?.daysAhead) lunarEclipseLookupCacheDaysAhead = options.lunarEclipse.daysAhead;
    if (options?.solarEclipse?.daysBefore) solarEclipseLookupCacheDaysBefore = options.solarEclipse.daysBefore;
    if (options?.solarEclipse?.daysAhead) solarEclipseLookupCacheDaysAhead = options.solarEclipse.daysAhead;
    return {
        interpretLunarEclipses,
        interpretSolarEclipses,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
