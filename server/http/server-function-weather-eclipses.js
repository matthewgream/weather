// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

function degToRad(deg) {
    return (deg * Math.PI) / 180;
}
function radToDeg(rad) {
    return (rad * 180) / Math.PI;
}
const normalizeAngle = (angle) => ((angle % 360) + 360) % 360;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

//const LUNAR_MONTH = 29.53058867; // Synodic month in days
//const DRACONIC_MONTH = 27.21222082; // Time between successive node passages
const EARTH_RADIUS_KM = 6371; // Mean Earth radius
const MOON_RADIUS_KM = 1737.4; // Mean Moon radius
const AU_TO_KM = 149597870.7; // Astronomical unit in kilometers

// Eclipse limits (in degrees)
//const LUNAR_ECLIPSE_LIMIT = 12; // Maximum angular distance from node for any eclipse
const PENUMBRAL_LIMIT = 17; // Maximum for penumbral eclipse
//const UMBRAL_LIMIT = 11.5; // Maximum for umbral (partial/total) eclipse

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function __jdFromYMDHMS(ymdhms) {
    let { year, month, day, hour, minute, second } = ymdhms;
    if (month <= 2) {
        year -= 1;
        month += 12;
    }
    const a = Math.floor(year / 100),
        b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + hour / 24 + minute / 1440 + second / 86400 + b - 1524.5;
}

function __jdToYMD(jd) {
    const z = Math.floor(jd + 0.5),
        f = jd + 0.5 - z;
    const A = z < 2299161 ? z : z + 1 + Math.floor((z - 1867216.25) / 36524.25) - Math.floor(Math.floor((z - 1867216.25) / 36524.25) / 4),
        B = A + 1524,
        C = Math.floor((B - 122.1) / 365.25),
        D = Math.floor(365.25 * C),
        E = Math.floor((B - D) / 30.6001);
    const month = E < 14 ? E - 1 : E - 13;
    return {
        day: B - D - Math.floor(30.6001 * E) + f,
        month,
        year: month > 2 ? C - 4716 : C - 4715,
    };
}

function __jdFromDate(date) {
    return __jdFromYMDHMS({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
    });
}

function __jdToDate(jd) {
    const ymd = __jdToYMD(jd);
    return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0));
}

function __jdTimeCentury(jd) {
    return (jd - 2451545) / 36525;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarPosition(jd) {
    const T = __jdTimeCentury(jd),
        T2 = T * T,
        T3 = T2 * T,
        T4 = T3 * T;

    // Mean longitude of the lunar
    const L0 = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
    // Mean elongation of the lunar
    const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    // Mean anomaly of the solar
    const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    // Mean anomaly of the lunar
    const M1 = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    // Moon's argument of latitude
    const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;

    // Normalize angles
    const L0n = normalizeAngle(L0),
        Dn = normalizeAngle(D),
        Mn = normalizeAngle(M),
        M1n = normalizeAngle(M1),
        Fn = normalizeAngle(F);

    // Convert to radians
    const d2r = Math.PI / 180,
        Dr = Dn * d2r,
        Mr = Mn * d2r,
        M1r = M1n * d2r,
        Fr = Fn * d2r;

    // Longitude perturbations
    let dL = 0;
    dL += 6.288774 * Math.sin(M1r);
    dL += 1.274027 * Math.sin(2 * Dr - M1r);
    dL += 0.658314 * Math.sin(2 * Dr);
    dL += 0.213618 * Math.sin(2 * M1r);
    dL -= 0.185116 * Math.sin(Mr);
    dL -= 0.114332 * Math.sin(2 * Fr);
    dL += 0.058793 * Math.sin(2 * Dr - 2 * M1r);
    dL += 0.057066 * Math.sin(2 * Dr - Mr - M1r);
    dL += 0.053322 * Math.sin(2 * Dr + M1r);
    dL += 0.045758 * Math.sin(2 * Dr - Mr);
    dL -= 0.040923 * Math.sin(M1r - Mr);
    dL -= 0.03472 * Math.sin(Dr);
    dL -= 0.030383 * Math.sin(Mr + M1r);
    dL += 0.015327 * Math.sin(2 * Dr - 2 * Fr);
    dL -= 0.012528 * Math.sin(2 * Fr + M1r);
    dL += 0.01098 * Math.sin(2 * Fr - M1r);
    dL += 0.010675 * Math.sin(4 * Dr - M1r);
    dL += 0.010034 * Math.sin(3 * M1r);
    dL += 0.008548 * Math.sin(4 * Dr - 2 * M1r);
    const longitude = normalizeAngle(L0n + dL);

    // Latitude perturbations
    let dB = 0;
    dB += 5.128122 * Math.sin(Fr);
    dB += 0.280602 * Math.sin(M1r + Fr);
    dB += 0.277693 * Math.sin(M1r - Fr);
    dB += 0.173237 * Math.sin(2 * Dr - Fr);
    dB += 0.055413 * Math.sin(2 * Dr + Fr - M1r);
    dB += 0.046271 * Math.sin(2 * Dr - Fr - M1r);
    dB += 0.032573 * Math.sin(2 * Dr + Fr);
    dB += 0.017198 * Math.sin(2 * M1r + Fr);
    dB += 0.009266 * Math.sin(2 * Dr + M1r - Fr);
    dB += 0.008822 * Math.sin(2 * M1r - Fr);
    dB += 0.008216 * Math.sin(2 * Dr - M1r - Fr);
    dB += 0.004324 * Math.sin(2 * Dr - 2 * M1r - Fr);
    dB += 0.0042 * Math.sin(2 * Dr + Fr + M1r);
    const latitude = dB;

    // Distance calculation
    let dR = 0;
    dR -= 0.0058 * Math.cos(M1r);
    dR -= 0.0041 * Math.cos(2 * Dr - M1r);
    dR -= 0.0018 * Math.cos(2 * Dr);
    dR -= 0.0011 * Math.cos(2 * M1r);
    dR += 0.0008 * Math.cos(2 * Dr - 2 * M1r);
    dR += 0.0008 * Math.cos(2 * Dr + M1r);
    dR += 0.0006 * Math.cos(2 * Dr - Mr);
    dR += 0.0004 * Math.cos(M1r - Mr);
    dR += 0.0004 * Math.cos(Dr);
    dR += 0.0004 * Math.cos(Mr + M1r);
    dR -= 0.0004 * Math.cos(2 * Fr + M1r);
    dR -= 0.0003 * Math.cos(M1r + 2 * Fr);
    const distance = 60.2666 + dR; // Earth radii

    // Velocity calculation
    const velocity = 13.176396 + 0.001944 * Math.sin(M1r) - 0.000595 * Math.sin(2 * Dr);

    return { longitude, latitude, distance, velocity };
}

function getSolarPosition(jd) {
    const T = __jdTimeCentury(jd),
        T2 = T * T;

    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T2;
    const M = 357.52911 + 35999.05029 * T - 0.0001537 * T2;
    const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T2;

    const C =
        (1.914602 - 0.004817 * T - 0.000014 * T2) * Math.sin((M * Math.PI) / 180) +
        (0.019993 - 0.000101 * T) * Math.sin((2 * M * Math.PI) / 180) +
        0.000289 * Math.sin((3 * M * Math.PI) / 180);

    const trueL = L0 + C;
    const omega = 125.04 - 1934.136 * T;
    const apparentL = trueL - 0.00569 - 0.00478 * Math.sin((omega * Math.PI) / 180);

    const longitude = normalizeAngle(apparentL);
    const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos((M * Math.PI) / 180));

    return {
        longitude,
        latitude: 0,
        distance: R,
        velocity: 0.9856473,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

/**
 * Calculate the angular distance from the Moon to the nearest node
 * This determines if an eclipse is possible
 */
function calculateNodeDistance(lunarLongitude, jd) {
    const T = __jdTimeCentury(jd);

    // Mean longitude of ascending node
    const omega = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441;
    const nodeNormalized = normalizeAngle(omega);

    // Angular distance to ascending node
    const distToAscending = Math.abs(normalizeAngle(lunarLongitude - nodeNormalized));
    const distToDescending = Math.abs(normalizeAngle(lunarLongitude - nodeNormalized - 180));

    return Math.min(distToAscending, distToDescending);
}

/**
 * Calculate the shadow cone parameters for a lunar eclipse
 * Returns umbral and penumbral radii at Moon's distance
 */
function calculateShadowCone(solarDistance, lunarDistance) {
    // Sun's angular radius as seen from Earth (in degrees)
    const solarAngularRadius = radToDeg(Math.asin(696000 / (solarDistance * AU_TO_KM)));

    // Earth's angular radius as seen from Moon
    const earthAngularRadius = radToDeg(Math.asin(EARTH_RADIUS_KM / (lunarDistance * EARTH_RADIUS_KM)));

    // Umbral radius at Moon's distance (in Earth radii)
    const umbralRadius = 1.02 * (1.2848 + 0.0001 * lunarDistance) - solarAngularRadius * (lunarDistance / 60.2666);

    // Penumbral radius at Moon's distance (in Earth radii)
    const penumbralRadius = 1.02 * (1.2848 + 0.0001 * lunarDistance) + solarAngularRadius * (lunarDistance / 60.2666);

    return { umbralRadius, penumbralRadius, earthAngularRadius };
}

/**
 * Calculate the minimum distance between Moon center and shadow axis
 * This is the key parameter for eclipse magnitude
 */
function calculateMinimumSeparation(lunarPos, solarPos) {
    // In a lunar eclipse, the Moon must be opposite the Sun
    const elongation = Math.abs(normalizeAngle(lunarPos.longitude - solarPos.longitude - 180));

    // Combine elongation error with latitude to get total separation
    // Convert to linear distance using small angle approximation
    const separation = Math.hypot(lunarPos.latitude * lunarPos.latitude + elongation * elongation);

    return separation;
}

/**
 * Determine eclipse type and calculate magnitude
 * Based on Meeus and NASA algorithms
 */
function calculateLunarEclipseParameters(lunarPos, solarPos) {
    const shadowCone = calculateShadowCone(solarPos.distance, lunarPos.distance);
    const separation = calculateMinimumSeparation(lunarPos, solarPos);

    // Convert separation to Earth radii at Moon's distance
    const separationEarthRadii = (separation * lunarPos.distance) / 60.2666;

    // Moon's angular radius (in degrees)
    const lunarRadius = radToDeg(Math.asin(MOON_RADIUS_KM / (lunarPos.distance * EARTH_RADIUS_KM)));
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
 * Calculate contact times for lunar eclipse phases
 * Based on Moon's velocity and shadow geometry
 */
function calculateLunarEclipseContacts(eclipseParams, lunarPos, peakTime) {
    const { type, shadowCone, separationEarthRadii, lunarRadiusEarthRadii } = eclipseParams;

    // Moon's velocity in Earth radii per hour
    const lunarVelocityRadiiPerHour = (lunarPos.velocity * Math.PI) / (180 * 24);

    // Calculate time from peak to each contact
    const contacts = {};

    // Penumbral contacts (P1 and P4)
    const penumbralSemiDuration =
        Math.sqrt(Math.max(0, (shadowCone.penumbralRadius + lunarRadiusEarthRadii) ** 2 - separationEarthRadii ** 2)) / lunarVelocityRadiiPerHour;
    if (penumbralSemiDuration > 0) {
        contacts.p1 = new Date(peakTime.getTime() - penumbralSemiDuration * 60 * 60 * 1000);
        contacts.p4 = new Date(peakTime.getTime() + penumbralSemiDuration * 60 * 60 * 1000);
    }

    // Umbral contacts (U1 and U4) for partial and total eclipses
    if (type === 'partial' || type === 'total') {
        const umbralSemiDuration =
            Math.sqrt(Math.max(0, (shadowCone.umbralRadius + lunarRadiusEarthRadii) ** 2 - separationEarthRadii ** 2)) / lunarVelocityRadiiPerHour;
        if (umbralSemiDuration > 0) {
            contacts.u1 = new Date(peakTime.getTime() - umbralSemiDuration * 60 * 60 * 1000);
            contacts.u4 = new Date(peakTime.getTime() + umbralSemiDuration * 60 * 60 * 1000);
        }
    }

    // Total phase contacts (U2 and U3) for total eclipses
    if (type === 'total') {
        const totalSemiDuration =
            Math.sqrt(Math.max(0, (shadowCone.umbralRadius - lunarRadiusEarthRadii) ** 2 - separationEarthRadii ** 2)) / lunarVelocityRadiiPerHour;
        if (totalSemiDuration > 0) {
            contacts.u2 = new Date(peakTime.getTime() - totalSemiDuration * 60 * 60 * 1000);
            contacts.u3 = new Date(peakTime.getTime() + totalSemiDuration * 60 * 60 * 1000);
        }
    }

    return contacts;
}

/**
 * Find the exact moment of greatest eclipse by iteration
 * This refines the initial estimate
 */
function findGreatestEclipse(jd, lunarPos, solarPos) {
    let minSeparation = calculateMinimumSeparation(lunarPos, solarPos);
    let step = 0.01; // About 15 minutes

    // Newton-Raphson iteration
    for (let i = 0; i < 10; i++) {
        const jdBefore = jd - step,
            jdAfter = jd + step;

        const lunarBefore = getLunarPosition(jdBefore),
            solarBefore = getSolarPosition(jdBefore),
            sepBefore = calculateMinimumSeparation(lunarBefore, solarBefore);
        const lunarAfter = getLunarPosition(jdAfter),
            solarAfter = getSolarPosition(jdAfter),
            sepAfter = calculateMinimumSeparation(lunarAfter, solarAfter);

        if (sepBefore < minSeparation) {
            jd = jdBefore;
            minSeparation = sepBefore;
        } else if (sepAfter < minSeparation) {
            jd = jdAfter;
            minSeparation = sepAfter;
        } else {
            step *= 0.5; // Reduce step size
        }

        if (step < 0.0001) break; // About 10 seconds precision
    }

    return jd;
}

/**
 * Calculate Danjon scale for total lunar eclipses
 * Estimates the darkness/color of the eclipse
 */
function calculateDanjonScale(magnitude, _separation) {
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

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function precomputeLunarEclipses(startDate, endDate) {
    const eclipses = [];

    let jd = __jdFromDate(startDate),
        jdEnd = __jdFromDate(endDate);
    while (jd <= jdEnd) {
        // Check if near full lunar (within 2%)
        const lunarPhase = helpers.getLunarPhase(__jdToDate(jd));
        if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
            const lunarPos = getLunarPosition(jd),
                solarPos = getSolarPosition(jd);

            // Check node distance
            const nodeDistance = calculateNodeDistance(lunarPos.longitude, jd);
            if (nodeDistance <= PENUMBRAL_LIMIT) {
                // Potential eclipse - find exact greatest eclipse moment
                const greatestJd = findGreatestEclipse(jd, lunarPos, solarPos),
                    lunarAtGreatest = getLunarPosition(greatestJd),
                    solarAtGreatest = getSolarPosition(greatestJd);

                // Calculate eclipse parameters
                const params = calculateLunarEclipseParameters(lunarAtGreatest, solarAtGreatest);
                if (params.type !== 'none') {
                    const date = __jdToDate(greatestJd);
                    const contacts = calculateLunarEclipseContacts(params, lunarAtGreatest, date);
                    eclipses.push({
                        date,
                        type: params.type,
                        magnitude: params.magnitude,
                        penumbralMagnitude: params.penumbralMagnitude,
                        contacts,
                        danjonScale: calculateDanjonScale(params.magnitude, params.separationEarthRadii),
                        lunarDistance: lunarAtGreatest.distance * EARTH_RADIUS_KM,
                        duration: {
                            total: contacts.p4 ? (contacts.p4.getTime() - contacts.p1.getTime()) / (60 * 1000) : 0,
                            partial: contacts.u4 ? (contacts.u4.getTime() - contacts.u1.getTime()) / (60 * 1000) : 0,
                            totality: contacts.u3 ? (contacts.u3.getTime() - contacts.u2.getTime()) / (60 * 1000) : 0,
                        },
                    });
                    // Skip ahead to avoid finding the same eclipse
                    jd += 20;
                    continue;
                }
            }
        }
        jd++;
    }

    console.error(`precomputeLunarEclipses: ${startDate.toISOString()}/${endDate.toISOString()} -- ${eclipses.length} results`);
    return eclipses;
}

function getDayAtOffset(date, offset) {
    let dayOffset = new Date(date);
    dayOffset.setDate(dayOffset.getDate() + offset);
    [dayOffset] = dayOffset.toISOString().split('T');
    return dayOffset;
}

function createEclipseLookupMap(eclipses) {
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

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let eclipseCache = new Map();

// -----------------------------------------------------------------------------------------------------------------------------------------

function updateEclipseCache(currentDate, previousDate) {
    const now = new Date(currentDate);
    now.setUTCHours(0, 0, 0, 0);
    if (!previousDate) {
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 5);
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 60);
        eclipseCache = createEclipseLookupMap(precomputeLunarEclipses(startDate, endDate));
        return now;
    }
    if (Math.floor((now - previousDate) / (1000 * 60 * 60 * 24)) > 5) {
        const startDateNew = new Date(now);
        startDateNew.setDate(startDateNew.getDate() + 50);
        const endDateNew = new Date(now);
        endDateNew.setDate(endDateNew.getDate() + 60);
        for (const [key, value] of createEclipseLookupMap(precomputeLunarEclipses(startDateNew, endDateNew))) eclipseCache.set(key, value);
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - 5);
        const [cutoffKey] = cutoffDate.toISOString().split('T');
        for (const [key] of eclipseCache) if (key < cutoffKey) eclipseCache.delete(key);
        return now;
    }
    return previousDate;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getMoonAltitude(date, latitude, longitude) {
    const jd = __jdFromDate(date);
    const moonPos = helpers.getMoonPosition(jd);
    const { ra, dec } = eclipticToEquatorial(jd, moonPos.longitude, moonPos.latitude);
    const lst = localSiderealTime(jd, longitude);
    const ha = lst - ra;
    const latRad = degToRad(latitude);
    const altitude = Math.asin(Math.sin(latRad) * Math.sin(dec) + Math.cos(latRad) * Math.cos(dec) * Math.cos(ha));
    return radToDeg(altitude);
}

function eclipticToEquatorial(jd, longitude, latitude) {
    const T = (jd - 2451545) / 36525;
    const obliquity = degToRad(23.43929111 - 0.0130041 * T);
    const lonRad = degToRad(longitude),
        latRad = degToRad(latitude);
    const dec = Math.asin(Math.sin(latRad) * Math.cos(obliquity) + Math.cos(latRad) * Math.sin(obliquity) * Math.sin(lonRad));
    const y = Math.sin(lonRad) * Math.cos(obliquity) - Math.tan(latRad) * Math.sin(obliquity),
        x = Math.cos(lonRad);
    let ra = Math.atan2(y, x);
    if (ra < 0) ra += 2 * Math.PI;
    return { ra, dec };
}

function localSiderealTime(jd, longitude) {
    const T = (jd - 2451545) / 36525;
    const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T;
    return degToRad(((((gmst % 360) + 360) % 360) + longitude) % 360);
}

function calculateEclipseVisibility(eclipse, latitude, longitude) {
    const visibility = { anyPhaseVisible: false, phases: {}, bestViewingTime: undefined, moonPosition: {} };
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
            const altitude = getMoonAltitude(point.time, latitude, longitude),
                visible = altitude > 0;
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
                    visibility.moonPosition = { altitude, phase: point.phase };
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

function calculateVisibilityRegions(eclipse) {
    const jd = __jdFromDate(eclipse.date),
        sunPos = getSolarPosition(jd),
        antiSolarLon = (sunPos.longitude + 180) % 360;

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
        const inRange =
            region.west > region.east ? antiSolarLon >= region.west || antiSolarLon <= region.east : antiSolarLon >= region.west && antiSolarLon <= region.east;
        const regionCenter = region.west > region.east ? ((region.west + region.east + 360) / 2) % 360 : (region.west + region.east) / 2;
        const angularDistance = Math.abs(regionCenter - antiSolarLon);
        const normalizedDistance = angularDistance > 180 ? 360 - angularDistance : angularDistance;
        if (normalizedDistance < 90 || inRange) visibleRegions.push(region.name);
    }
    return visibleRegions;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function generateCurrentInterpretation(eclipse, location, cloudCover, humidity, windSpeed) {
    const { type, magnitude, danjonScale, duration, penumbralMagnitude, moonDistance } = eclipse;
    const interpretation = {
        phenomena: [],
        alerts: [],
        conditions: [],
    };

    interpretation.phenomena.push(`${type} lunar eclipse today`);

    if (type === 'total') {
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
    } else if (type === 'partial') {
        interpretation.phenomena.push(`partial eclipse magnitude: ${magnitude.toFixed(2)}`);
        interpretation.phenomena.push(`${Math.round(magnitude * 100)}% of Moon's diameter in umbra`);
    } else if (type === 'penumbral') {
        interpretation.phenomena.push('subtle penumbral eclipse');
        if (penumbralMagnitude > 0.9) interpretation.phenomena.push('deep penumbral eclipse - shading may be visible');
        else interpretation.phenomena.push('difficult to observe without equipment');
    }

    if (location.latitude !== undefined && location.longitude !== undefined) {
        const visibility = calculateEclipseVisibility(eclipse, location.latitude, location.longitude);
        if (visibility.anyPhaseVisible) {
            interpretation.phenomena.push(visibility.description);
            if (visibility.bestViewingTime)
                interpretation.phenomena.push(
                    `best viewing: ${visibility.bestViewingTime.getHours()}:${String(visibility.bestViewingTime.getMinutes()).padStart(2, '0')} ` +
                        `(Moon ${Math.round(visibility.moonPosition.altitude)}° above horizon)`
                );
            if (cloudCover !== undefined) {
                if (cloudCover < 20) interpretation.phenomena.push('excellent conditions for eclipse viewing');
                else if (cloudCover < 50) interpretation.phenomena.push('fair conditions - some clouds may interfere');
                else if (cloudCover < 80) interpretation.phenomena.push('poor conditions - significant cloud cover');
                else interpretation.phenomena.push('eclipse likely obscured by clouds');
            }
            if (visibility.moonPosition.altitude > 60 && type === 'total') interpretation.phenomena.push('eclipse near zenith - ideal viewing angle');
            else if (visibility.moonPosition.altitude < 10) interpretation.phenomena.push('eclipse low on horizon - atmospheric effects may enhance colors');
        } else {
            interpretation.phenomena.push('lunar eclipse not visible from your location');
            interpretation.phenomena.push('Moon below horizon during eclipse');
        }
    }

    const visibleRegions = calculateVisibilityRegions(eclipse);
    if (visibleRegions.length > 0)
        interpretation.phenomena.push(`visible from: ${visibleRegions.slice(0, 5).join(', ')}${visibleRegions.length > 5 ? ' and others' : ''}`);

    if (moonDistance < 362000) interpretation.phenomena.push('eclipse occurs near lunar perigee - Moon appears larger');
    else if (moonDistance > 405000) interpretation.phenomena.push('eclipse occurs near lunar apogee - Moon appears smaller');

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

function __generateUpcomingInterpretation(eclipse, daysUntil, location) {
    const interpretation = {
        phenomena: [],
        alerts: [],
        conditions: [],
    };

    interpretation.phenomena.push(`${eclipse.type} lunar eclipse in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`);

    if (location.latitude !== undefined && location.longitude !== undefined) {
        const futureVisibility = calculateEclipseVisibility(eclipse, location.latitude, location.longitude);
        if (futureVisibility.anyPhaseVisible) {
            interpretation.phenomena.push('upcoming eclipse will be visible from your location');
            if (eclipse.type === 'total' && eclipse.magnitude > 1.5) interpretation.phenomena.push('deep total eclipse coming - worth planning for');
        } else interpretation.phenomena.push('upcoming eclipse will not be visible from your location');
    }

    return interpretation;
}
function generateUpcomingInterpretation(date, location, lookAheadDays) {
    const interpretation = {
        phenomena: [],
        alerts: [],
        conditions: [],
    };

    for (let i = 1; i <= lookAheadDays; i++) {
        const checkDate = new Date(date);
        checkDate.setDate(checkDate.getDate() + i);
        const [checkKey] = checkDate.toISOString().split('T');
        const upcomingEclipse = eclipseCache.get(checkKey);
        if (upcomingEclipse) return __generateUpcomingInterpretation(upcomingEclipse, i, location);
    }

    return interpretation;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarEclipses(results, situation, data, _data_previous, store, _options) {
    const { date, location } = situation;

    if (!store.eclipse)
        store.eclipse = {
            cacheUpdated: undefined,
            cacheToday: {
                cachedDate: undefined,
                interpretation: undefined,
            },
        };

    const todayKey = new Date(date);
    todayKey.setHours(0, 0, 0, 0);
    const [todayKeyStr] = todayKey.toISOString().split('T');

    let { interpretation, date: cacheDate } = store.eclipse.cacheToday;
    if (cacheDate !== todayKeyStr || !interpretation) {
        store.eclipse.cacheUpdated = updateEclipseCache(date, store.eclipse.cacheUpdated);
        const eclipse = eclipseCache.get(todayKeyStr);
        if (eclipse) {
            const { cloudCover, humidity, windSpeed } = data;
            interpretation = generateCurrentInterpretation(eclipse, location, cloudCover, humidity, windSpeed);
        } else {
            const lookAheadDays = 14;
            interpretation = generateUpcomingInterpretation(date, location, lookAheadDays);
        }
        if (interpretation) {
            store.eclipse.cacheToday.date = todayKeyStr;
            store.eclipse.cacheToday.interpretation = interpretation;
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

module.exports = function (_options) {
    return {
        interpretLunarEclipses,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
