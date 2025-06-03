// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function joinand(items) {
    if (!items || items.length === 0) return '';
    else if (items.length === 1) return items[0];
    else if (items.length === 2) return `${items[0]} and ${items[1]}`;
    const lastItem = items.pop();
    return `${items.join(', ')}, and ${lastItem}`;
}
function radToDeg(angleRad) {
    return (180 * angleRad) / Math.PI;
}
function degToRad(angleDeg) {
    return (Math.PI * angleDeg) / 180;
}
function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const normalizeTime = (time) => (time < 0 ? time + 24 : time >= 24 ? time - 24 : time);

const isLeapYear = (yr) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;

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
    return {
        day: B - D - Math.floor(30.6001 * E) + f,
        month: E < 14 ? E - 1 : E - 13,
        year: (E < 14 ? E - 1 : E - 13) > 2 ? C - 4716 : C - 4715,
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
function __jdToDoy(jd) {
    const ymd = __jdToYMD(jd);
    return Math.floor((275 * ymd.month) / 9) - (isLeapYear(ymd.year) ? 1 : 2) * Math.floor((ymd.month + 9) / 12) + ymd.day - 30;
}
function __jdTimeCentury(jd) {
    return (jd - 2451545) / 36525;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function eclipticToEquatorial(jd, longitude, latitude) {
    const T = __jdTimeCentury(jd);
    const obliquity = degToRad(23.43929111 - 0.0130041 * T - 0.00000016 * T * T + 0.000000504 * T * T * T);
    const longitudeRad = degToRad(longitude),
        latitudeRad = degToRad(latitude);
    const dec = Math.asin(Math.sin(latitudeRad) * Math.cos(obliquity) + Math.cos(latitudeRad) * Math.sin(obliquity) * Math.sin(longitudeRad));
    const y = Math.sin(longitudeRad) * Math.cos(obliquity) - Math.tan(latitudeRad) * Math.sin(obliquity),
        x = Math.cos(longitudeRad);
    let ra = Math.atan2(y, x);
    if (ra < 0) ra += 2 * Math.PI;
    return { ra, dec };
}

function localSiderealTime(jd, longitude) {
    const T = __jdTimeCentury(jd);
    const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - (T * T * T) / 38710000;
    return degToRad(((((((gmst % 360) + 360) % 360) + longitude) % 360) + 360) % 360);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getMoonPhase(date = new Date()) {
    const knownNewMoon = new Date(2000, 0, 6),
        lunarCycle = 29.53059;
    const days = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
    return (days % lunarCycle) / lunarCycle;
}

function getMoonDistance(date = new Date()) {
    const phase = getMoonPhase(date),
        distance = 384400 * (1 - 0.0549 * Math.cos(phase * 2 * Math.PI));
    return {
        distance, // in km
        isSupermoon: distance < 367000 && Math.abs(phase - 0.5) < 0.1, // Full moon at perigee
        isMicromoon: distance > 400000 && Math.abs(phase - 0.5) < 0.1, // Full moon at apogee
        isCloseApproach: distance < 370000, // Generally close approach
    };
}

/**
 * Calculates moon position with medium precision (~1 arcminute accuracy)
 * Based on simplified ELP-2000/82 terms with major perturbations
 * @param {Number} jd - Julian Day
 * @returns {Object} Moon position in ecliptic coordinates
 */
function getMoonPosition(jd) {
    const T = __jdTimeCentury(jd),
        T2 = T * T,
        T3 = T2 * T,
        T4 = T3 * T;
    // Mean longitude of the moon
    const L0 = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
    // Mean elongation of the moon
    const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    // Mean anomaly of the sun
    const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    // Mean anomaly of the moon
    const M1 = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    // Moon's argument of latitude
    const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
    // Further arguments
    //const A1 = 119.75 + 131.849 * T;
    //const A2 = 53.09 + 479264.29 * T;
    //const A3 = 313.45 + 481266.484 * T;
    // Normalize to [0, 360] range
    const L0n = normalizeAngle(L0);
    const Dn = normalizeAngle(D);
    const Mn = normalizeAngle(M);
    const M1n = normalizeAngle(M1);
    const Fn = normalizeAngle(F);
    //const A1n = normalizeAngle(A1);
    //const A2n = normalizeAngle(A2);
    //const A3n = normalizeAngle(A3);
    // Convert to radians for sine/cosine functions
    const d2r = Math.PI / 180;
    const Dr = Dn * d2r;
    const Mr = Mn * d2r;
    const M1r = M1n * d2r;
    const Fr = Fn * d2r;
    //const A1r = A1n * d2r;
    //const A2r = A2n * d2r;
    //const A3r = A3n * d2r;
    // LONGITUDE PERTURBATIONS: Primary perturbation terms (ELP2000-82B simplified)
    let dL = 0;
    // Major terms for lunar longitude (degrees)
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
    // Additional terms for higher precision
    dL -= 0.004083 * Math.sin(2 * M1r - 2 * Fr);
    dL += 0.003996 * Math.sin(2 * Dr + 2 * M1r);
    // Special correction from A1, A2, A3 (due to Venus, Jupiter, Saturn effects)
    dL += 0.003862 * Math.sin(4 * Dr);
    dL += 0.003665 * Math.sin(2 * Dr - 3 * M1r);
    dL += 0.002695 * Math.sin(2 * M1r - Mr);
    dL += 0.002602 * Math.sin(M1r - 2 * Fr);
    dL += 0.002396 * Math.sin(2 * Dr - Mr - 2 * M1r);
    dL -= 0.002349 * Math.sin(M1r + 2 * Fr);
    dL += 0.002249 * Math.sin(2 * Dr - 2 * Mr);
    dL -= 0.002125 * Math.sin(2 * M1r + Mr);
    dL -= 0.002079 * Math.sin(2 * Mr);
    dL += 0.001719 * Math.sin(Dr + M1r);
    // Earth-Venus interactions
    dL -= 0.001664 * Math.sin(M1r - Dr);
    // Jupiter effect
    dL -= 0.00099 * Math.sin(2 * Fr + Mr);
    dL += 0.00065 * Math.sin(Dr + Mr);
    // Final longitude (degrees)
    const longitude = normalizeAngle(L0n + dL);
    // LATITUDE PERTURBATIONS: Primary perturbation terms for latitude (degrees)
    let dB = 0;
    // Major terms for lunar latitude (degrees)
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
    // Additional terms for precision
    dB += 0.008216 * Math.sin(2 * Dr - M1r - Fr);
    dB += 0.004324 * Math.sin(2 * Dr - 2 * M1r - Fr);
    dB += 0.0042 * Math.sin(2 * Dr + Fr + M1r);
    // Final latitude (degrees)
    const latitude = dB;
    // DISTANCE CALCULATION: Primary perturbation terms for distance (Earth radii)
    let dR = 0;
    // Base distance (Earth radii)
    const baseDistance = 60.2666; // ~384,400 km
    // Major terms for lunar distance (Earth radii)
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
    // Final distance (Earth radii)
    const distance = baseDistance + dR;
    // Approximate velocity (degrees per day): this is a simplified calculation - actual velocity varies with orbital position
    const velocity = 13.176396 + 0.001944 * Math.sin(M1r) - 0.000595 * Math.sin(2 * Dr);
    return { longitude, latitude, distance, velocity };
}

function getMoonAltitude(date, latitude, longitude) {
    const latitudeRad = degToRad(latitude);
    const jd = __jdFromDate(date);
    const moonPos = getMoonPosition(jd),
        moonEquatorial = eclipticToEquatorial(jd, moonPos.longitude, moonPos.latitude);
    const ha = localSiderealTime(jd, longitude) - moonEquatorial.ra;
    return radToDeg(Math.asin(Math.sin(latitudeRad) * Math.sin(moonEquatorial.dec) + Math.cos(latitudeRad) * Math.cos(moonEquatorial.dec) * Math.cos(ha)));
}

function getMoonRiseset(date, latitude, longitude) {
    const jd = __jdFromDate(date);
    const moonPos = getMoonPosition(jd),
        moonEquatorial = eclipticToEquatorial(jd, moonPos.longitude, moonPos.latitude);
    const decDeg = radToDeg(moonEquatorial.dec);
    if (latitude > 0) {
        if (decDeg > 90 - latitude) return { alwaysUp: true, neverUp: false };
        else if (decDeg < latitude - 90) return { alwaysUp: false, neverUp: true };
    } else {
        if (decDeg < -(90 + latitude)) return { alwaysUp: true, neverUp: false };
        else if (decDeg > 90 + latitude) return { alwaysUp: false, neverUp: true };
    }
    const gmst = localSiderealTime(jd, 0) * (180 / Math.PI);
    const moonHourAngle = (((gmst - radToDeg(moonEquatorial.ra) + longitude) % 360) + 360) % 360;
    const timeToMeridian = (180 - moonHourAngle) / 15; // in hours
    const cosLHA =
        (Math.sin(degToRad(-0.583)) - Math.sin(degToRad(latitude)) * Math.sin(moonEquatorial.dec)) /
        (Math.cos(degToRad(latitude)) * Math.cos(moonEquatorial.dec));
    let riseTime, setTime;
    if (Math.abs(cosLHA) <= 1) {
        const LHA = Math.acos(cosLHA) * (180 / Math.PI),
            riseHourAngle = (360 - LHA) / 15,
            setHourAngle = LHA / 15; // in hours
        const transitTime = new Date(date);
        transitTime.setHours(transitTime.getHours() + timeToMeridian);
        riseTime = new Date(transitTime);
        riseTime.setHours(riseTime.getHours() - riseHourAngle);
        setTime = new Date(transitTime);
        setTime.setHours(setTime.getHours() + setHourAngle);
    }
    return { alwaysUp: false, neverUp: false, rise: riseTime, set: setTime };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

/**
 * Calculates sun position with medium precision (~1 arcminute accuracy)
 * Based on simplified VSOP87 terms
 * @param {Number} jd - Julian Day
 * @returns {Object} Sun position in ecliptic coordinates
 */
function getSunPosition(jd) {
    const T = __jdTimeCentury(jd),
        T2 = T * T;
    // Mean longitude of the sun (degrees)
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T2;
    // Mean anomaly of the sun (degrees)
    const M = 357.52911 + 35999.05029 * T - 0.0001537 * T2;
    // Eccentricity of Earth's orbit
    const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T2;
    // Sun's equation of center (degrees)
    const C =
        (1.914602 - 0.004817 * T - 0.000014 * T2) * Math.sin((M * Math.PI) / 180) +
        (0.019993 - 0.000101 * T) * Math.sin((2 * M * Math.PI) / 180) +
        0.000289 * Math.sin((3 * M * Math.PI) / 180);
    // True longitude of the sun (degrees)
    const trueL = L0 + C;
    // Apparent longitude of the sun (degrees)
    const omega = 125.04 - 1934.136 * T;
    const apparentL = trueL - 0.00569 - 0.00478 * Math.sin((omega * Math.PI) / 180);
    // Normalize to [0, 360] range
    const longitude = normalizeAngle(apparentL);
    // Distance to the sun (in AU)
    const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos((M * Math.PI) / 180));
    return {
        longitude,
        latitude: 0, // Sun is always on the ecliptic by definition
        distance: R,
        velocity: 0.9856473, // Approximate solar motion (degrees per day)
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateSolarNodeProximity(moonPos, sunPos) {
    const longitudeDiff = Math.abs(moonPos.longitude - sunPos.longitude);
    return Math.hypot(moonPos.latitude ** 2 + (longitudeDiff > 180 ? 360 - longitudeDiff : longitudeDiff) ** 2);
}
function calculateLunarNodeProximity(moonPos, sunPos) {
    const longitudeDiff = Math.abs(moonPos.longitude - sunPos.longitude);
    const oppositionError = Math.abs((longitudeDiff > 180 ? 360 - longitudeDiff : longitudeDiff) - 180);
    return Math.hypot(moonPos.latitude ** 2 + oppositionError ** 2);
}
function calculateUmbralDistance(moonPos, sunPos) {
    const shadowRadius = 0.7;
    return calculateLunarNodeProximity(moonPos, sunPos) / shadowRadius;
}
function calculateAngularSeparation(moonPos, sunPos) {
    const moonLongitudeRad = degToRad(moonPos.longitude),
        moonLatitudeRad = degToRad(moonPos.latitude),
        sunLongitudeRad = degToRad(sunPos.longitude),
        sunLatitudeRad = degToRad(sunPos.latitude);
    const cosAngularSeparation =
        Math.sin(moonLatitudeRad) * Math.sin(sunLatitudeRad) +
        Math.cos(moonLatitudeRad) * Math.cos(sunLatitudeRad) * Math.cos(moonLongitudeRad - sunLongitudeRad);
    return radToDeg(Math.acos(Math.max(-1, Math.min(1, cosAngularSeparation))));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function eclipsePeakTime(date, nodeProximity, moonVelocity) {
    const peakTime = new Date(date);
    peakTime.setTime(date.getTime() + (-nodeProximity / moonVelocity) * 24 * 60 * 60 * 1000);
    return peakTime;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function lunarEclipseMagnitude(umbralDistance) {
    if (umbralDistance < 0.5)
        return 1 + ((0.5 - umbralDistance) / 0.5) * 0.5; // Total (1-1.5)
    else if (umbralDistance < 1)
        return 1 - umbralDistance; // Partial (0-1)
    else return (1.6 - umbralDistance) / 0.6; // Penumbral (0-1)
}
function lunarEclipseDuration(umbralDistance, moonVelocity) {
    let baseDuration = 0;
    if (umbralDistance < 0.5)
        // Total eclipse - typically around 100 minutes total
        baseDuration = 100;
    else if (umbralDistance < 1)
        // Partial eclipse - typically around 200 minutes
        baseDuration = 200;
    else baseDuration = 240; // Penumbral eclipse - typically around 240 minutes
    return baseDuration * (13.176396 / moonVelocity);
}
function lunarEclipseTimes(eclipseType, peak, duration) {
    let penumbralDuration, partialDuration, totalDuration;
    switch (eclipseType) {
        case 'total': {
            // For total eclipses, the total phase is shorter than the partial phase
            totalDuration = duration; // as provided
            partialDuration = totalDuration * 2.5; // approximation
            penumbralDuration = partialDuration * 1.5; // approximation
            break;
        }
        case 'partial': {
            // No total phase for partial eclipses
            totalDuration = 0;
            partialDuration = duration; // as provided
            penumbralDuration = partialDuration * 1.5; // approximation
            break;
        }
        case 'penumbral': {
            // Only penumbral phase
            totalDuration = 0;
            partialDuration = 0;
            penumbralDuration = duration; // as provided
            break;
        }
    }
    const penumbralStart = new Date(peak.getTime() - (penumbralDuration / 2) * 60 * 1000),
        penumbralEnd = new Date(peak.getTime() + (penumbralDuration / 2) * 60 * 1000),
        penumbral = { start: penumbralStart, end: penumbralEnd };
    const partialStart = partialDuration > 0 ? new Date(peak.getTime() - (partialDuration / 2) * 60 * 1000) : undefined,
        partialEnd = partialDuration > 0 ? new Date(peak.getTime() + (partialDuration / 2) * 60 * 1000) : undefined,
        partial = partialDuration > 0 ? { start: partialStart, end: partialEnd } : undefined;
    const totalStart = totalDuration > 0 ? new Date(peak.getTime() - (totalDuration / 2) * 60 * 1000) : undefined,
        totalEnd = totalDuration > 0 ? new Date(peak.getTime() + (totalDuration / 2) * 60 * 1000) : undefined,
        total = totalDuration > 0 ? { start: totalStart, end: totalEnd } : undefined;
    return {
        start: penumbralStart,
        peak,
        end: penumbralEnd,
        penumbral,
        partial,
        total,
    };
}

function lunarEclipseVisibilityDescription(eclipseType, phaseVisibility, moonRiseset) {
    if (moonRiseset.neverUp) return 'Not visible - moon below horizon during eclipse';
    if (moonRiseset.alwaysUp) return `Complete ${eclipseType} eclipse visible all night`;
    const startVisible = phaseVisibility.start.visible,
        peakVisible = phaseVisibility.peak.visible,
        endVisible = phaseVisibility.end.visible;
    if (startVisible && peakVisible && endVisible) return `Complete ${eclipseType} eclipse visible`;
    else if (peakVisible) {
        if (startVisible) return `Eclipse visible from start through maximum phase, ends after moonset`;
        else if (endVisible) return `Eclipse visible from moonrise through maximum phase and end`;
        else return `Maximum eclipse phase visible, but partial phases occur before moonrise and after moonset`;
    } else if (startVisible && !peakVisible) return `Only early phase of eclipse visible before moonset`;
    else if (endVisible && !peakVisible) return `Only late phase of eclipse visible after moonrise`;
    else return 'Eclipse technically visible but very low on horizon';
}

function lunarEclipseVisibilityLocation(eclipseType, eclipseTimes, latitude, longitude) {
    const result = {
        visible: false,
        moonAboveHorizon: false,
        phaseVisibility: {},
        bestViewingTime: undefined,
        localCircumstances: {},
    };
    const hourAngleOffset = longitude / 15; // 15 degrees = 1 hour
    const phases = ['start', 'peak', 'end'];
    for (const phase of phases) {
        const time = eclipseTimes[phase],
            altitude = getMoonAltitude(time, latitude, longitude);
        result.phaseVisibility[phase] = { time, localTime: new Date(time + hourAngleOffset * 60 * 60 * 1000), visible: altitude > 0, altitude };
        if (altitude > 0) result.visible = true;
    }
    if (result.visible) {
        if (result.phaseVisibility.peak.visible) result.bestViewingTime = result.phaseVisibility.peak.time;
        else
            phases.reduce((highestAltitude, phase) => {
                if (result.phaseVisibility[phase].visible && result.phaseVisibility[phase].altitude > highestAltitude) {
                    result.bestViewingTime = result.phaseVisibility[phase].time;
                    return result.phaseVisibility[phase].altitude;
                } else return highestAltitude;
            }, -1);
    }
    if (result.visible) {
        const moonRiseset = getMoonRiseset(eclipseTimes.peak, latitude, longitude);
        result.localCircumstances = {
            moonrise: moonRiseset.rise,
            moonset: moonRiseset.set,
            moonAlwaysUp: latitude > 60 && moonRiseset.alwaysUp,
            moonNeverUp: latitude > 60 && moonRiseset.neverUp,
            visibilityDescription: lunarEclipseVisibilityDescription(eclipseType, result.phaseVisibility, moonRiseset),
        };
    }
    return result;
}

const inRange = (lon, west, east) => (west > east ? lon >= west || lon <= east : lon >= west && lon <= east);
function lunarEclipseVisibilityRegions(date) {
    const sunPos = getSunPosition(__jdFromDate(date));
    const antiSolarLon = (sunPos.longitude + 180) % 360;
    const regions = [
        { name: 'North America', range: [220, 300] },
        { name: 'South America', range: [280, 325] },
        { name: 'Europe', range: [350, 40] },
        { name: 'Africa', range: [340, 50] },
        { name: 'Western Asia', range: [40, 75] },
        { name: 'Central Asia', range: [75, 95] },
        { name: 'Eastern Asia', range: [95, 145] },
        { name: 'Australia', range: [115, 155] },
        { name: 'Pacific Ocean', range: [155, 220] },
    ]
        .filter((r) => inRange(antiSolarLon, ...r.range))
        .map((r) => r.name);
    return regions.length > 0
        ? [...regions, date.getMonth() >= 3 && date.getMonth() <= 8 ? 'Antarctic regions' : 'Arctic regions']
        : ['Half of Earth (night side during eclipse)'];
}

function __getLunarEclipse(date, latitude, longitude) {
    const jd = __jdFromDate(date);

    const moonPhase = getMoonPhase(date);
    const isNearFullMoon = Math.abs(moonPhase - 0.5) < 0.05; // Within 5% of full moon
    if (!isNearFullMoon) return { isEclipse: false };

    const moonPos = getMoonPosition(jd),
        sunPos = getSunPosition(jd);
    const nodeProximity = calculateLunarNodeProximity(moonPos, sunPos);
    if (Math.abs(nodeProximity) > 1.5) return { isEclipse: false };

    const umbralDistance = calculateUmbralDistance(moonPos, sunPos);
    let type = '';
    if (umbralDistance < 0.5) type = 'total';
    else if (umbralDistance < 1) type = 'partial';
    else if (umbralDistance < 1.6) type = 'penumbral';
    else return { isEclipse: false };

    const magnitude = lunarEclipseMagnitude(umbralDistance),
        duration = lunarEclipseDuration(umbralDistance, moonPos.velocity),
        peak = eclipsePeakTime(date, nodeProximity, moonPos.velocity),
        times = lunarEclipseTimes(type, peak, duration);
    const visibilityLocation =
            latitude !== undefined && longitude !== undefined ? lunarEclipseVisibilityLocation(type, times, latitude, longitude) : { visible: 'unknown' },
        visibilityRegions = lunarEclipseVisibilityRegions(times.peak);

    return {
        isEclipse: true,
        type,
        magnitude,
        duration,
        visibilityRegions,
        times,
        visibilityLocation,
    };
}

function getLunarEclipse(date = new Date(), latitude = undefined, longitude = undefined, daysWindow = 7) {
    let result,
        daysOffset = 0;
    do {
        const dateOffset = new Date(date);
        dateOffset.setDate(dateOffset.getDate() + daysOffset);
        result = __getLunarEclipse(dateOffset, latitude, longitude);
    } while (!result.isEclipse && daysOffset++ < daysWindow);
    return result;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function solarEclipseMagnitude(angularSeparation, moonDiameter, sunDiameter) {
    const sumOfRadii = (moonDiameter + sunDiameter) / 2,
        diffOfRadii = Math.abs(moonDiameter - sunDiameter) / 2;
    if (angularSeparation <= diffOfRadii) return moonDiameter / sunDiameter;
    else if (angularSeparation < sumOfRadii) return (sumOfRadii - angularSeparation) / sunDiameter;
    else return 0;
}
function solarEclipseObscuration(angularSeparation, moonDiameter, sunDiameter) {
    const magnitude = solarEclipseMagnitude(angularSeparation, moonDiameter, sunDiameter);
    return magnitude >= 1 ? 1 : Math.min(1, magnitude * (2 - magnitude));
}
function solarEclipseDuration(eclipseType, angularSeparation, moonDiameter, sunDiameter) {
    if (eclipseType === 'total' || eclipseType === 'annular') {
        const centrality = angularSeparation / ((moonDiameter + sunDiameter) / 2 - Math.abs(moonDiameter - sunDiameter) / 2);
        return (eclipseType === 'total' ? 7.5 : 12.5) * (1 - centrality * centrality); // Maximum possible for a perfect total eclipse and Maximum possible for a perfect annular eclipse
    } else return 120; // Approximate duration in minutes
}
function solarEclipsePath(eclipseType, jd, moonPos, sunPos) {
    let pathType = '';
    let simplifiedPath = [];
    if (eclipseType === 'total' || eclipseType === 'annular') {
        pathType = eclipseType === 'total' ? 'totality' : 'annularity';
        const northernLimit = 30 + moonPos.latitude * 10,
            southernLimit = -10 + moonPos.latitude * 10;
        const centralLongitudegitude = (sunPos.longitude - 180) % 360;
        simplifiedPath = [
            {
                latitude: northernLimit,
                longitude: (centralLongitudegitude - 60) % 360,
            },
            {
                latitude: (northernLimit + southernLimit) / 2,
                longitude: centralLongitudegitude % 360,
            },
            {
                latitude: southernLimit,
                longitude: (centralLongitudegitude + 60) % 360,
            },
        ];
    } else {
        pathType = 'partial';
        simplifiedPath = [
            { latitude: 60, longitude: (sunPos.longitude - 180 - 90) % 360 },
            { latitude: 0, longitude: (sunPos.longitude - 180) % 360 },
            { latitude: -60, longitude: (sunPos.longitude - 180 + 90) % 360 },
        ];
    }
    return { pathType, simplifiedPath };
}
function solarEclipseVisibilityLocation(eclipseType, pathData, latitude, longitude) {
    if (eclipseType === 'partial') {
        const distanceToCenter = Math.hypot(
            (latitude - pathData.simplifiedPath[1].latitude) ** 2 + (((longitude - pathData.simplifiedPath[1].longitude + 180) % 360) - 180) ** 2
        );
        return distanceToCenter < 70 ? 'partial visibility' : 'not visible';
    } else {
        const pathLatitude = pathData.simplifiedPath[1].latitude,
            pathLongitude = pathData.simplifiedPath[1].longitude;
        const distanceToPath = Math.hypot((latitude - pathLatitude) ** 2 + (((longitude - pathLongitude + 180) % 360) - 180) ** 2);
        return distanceToPath < 0.5 ? `in path of ${pathData.pathType}` : distanceToPath < 70 ? 'partial visibility' : 'not visible';
    }
}
function solarEclipseVisibilityRegions(pathData) {
    let { latitude, longitude } = pathData.simplifiedPath[1];
    longitude = ((longitude % 360) + 360) % 360;
    const regions = {
        'Northern regions': () => latitude > 30 && latitude <= 60,
        'Southern regions': () => latitude < -30 && latitude >= -60,
        'Equatorial regions': () => latitude >= -30 && latitude <= 30,
        'Arctic regions': () => latitude > 60,
        'Antarctic regions': () => latitude < -60,
        'Europe': () => latitude > 0 && (longitude >= 330 || longitude <= 60),
        'Western/Central Asia': () => latitude > 0 && (longitude >= 330 || longitude <= 60),
        'Africa': () => latitude <= 0 && (longitude >= 330 || longitude <= 60),
        'Eastern Asia': () => latitude > 0 && longitude >= 60 && longitude <= 150,
        'Australia': () => latitude <= 0 && longitude >= 60 && longitude <= 150,
        'Oceania': () => latitude <= 0 && longitude >= 60 && longitude <= 150,
        'North America': () => latitude > 0 && longitude >= 150 && longitude <= 240,
        'Pacific Ocean': () => latitude <= 0 && longitude >= 150 && longitude <= 240,
        'Central America': () => latitude > 0 && longitude >= 240 && longitude <= 330,
        'South America': () => latitude <= 0 && longitude >= 240 && longitude <= 330,
    };
    return Object.keys(regions).filter((region) => regions[region]());
}

function __getSolarEclipse(date, latitude, longitude) {
    const jd = __jdFromDate(date);
    const moonPhase = getMoonPhase(date);
    const isNearNewMoon = moonPhase >= 0.95 || moonPhase <= 0.05; // Within 5% of new moon
    if (!isNearNewMoon) return { isEclipse: false };

    const moonPos = getMoonPosition(jd),
        sunPos = getSunPosition(jd);
    const angularSeparation = calculateAngularSeparation(moonPos, sunPos);
    if (angularSeparation > 1) return { isEclipse: false };
    const nodeProximity = calculateSolarNodeProximity(moonPos, sunPos);
    if (Math.abs(nodeProximity) > 1.5) return { isEclipse: false };

    const moonAngularDiameter = 0.5181 * (384400 / moonPos.distance),
        sunAngularDiameter = 0.5333 * (1 / sunPos.distance); // In degrees
    const sizeDifference = moonAngularDiameter - sunAngularDiameter;
    const obscuration = solarEclipseObscuration(angularSeparation, moonAngularDiameter, sunAngularDiameter);

    let type = '';
    if (sizeDifference > 0 && angularSeparation < (moonAngularDiameter - sunAngularDiameter) / 2) type = 'total';
    else if (sizeDifference < 0 && angularSeparation < (sunAngularDiameter - moonAngularDiameter) / 2) type = 'annular';
    else if (angularSeparation < (moonAngularDiameter + sunAngularDiameter) / 2) type = 'partial';
    else return { isEclipse: false };

    const magnitude = solarEclipseMagnitude(angularSeparation, moonAngularDiameter, sunAngularDiameter),
        duration = solarEclipseDuration(type, angularSeparation, moonAngularDiameter, sunAngularDiameter),
        peak = eclipsePeakTime(date, nodeProximity, moonPos.velocity),
        times = { peak },
        path = solarEclipsePath(type, jd, moonPos, sunPos);
    const visibilityLocation = latitude !== undefined && longitude !== undefined ? solarEclipseVisibilityLocation(type, path, latitude, longitude) : 'unknown',
        visibilityRegions = solarEclipseVisibilityRegions(path);

    return {
        isEclipse: true,
        type,
        magnitude,
        duration,
        obscuration,
        visibilityRegions,
        visibilityLocation,
        times,
        path: path.simplifiedPath,
    };
}

function getSolarEclipse(date = new Date(), latitude = undefined, longitude = undefined, daysWindow = 7) {
    let result,
        daysOffset = 0;
    do {
        const dateOffset = new Date(date);
        dateOffset.setDate(dateOffset.getDate() + daysOffset);
        result = __getSolarEclipse(dateOffset, latitude, longitude);
    } while (!result.isEclipse && daysOffset++ < daysWindow);
    return result;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isNearSolstice(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear(),
        msPerDay = 1000 * 60 * 60 * 24,
        isNorthern = hemisphere === 'northern';
    const currentYearSummerSolstice = new Date(year, 5, 21),
        currentYearWinterSolstice = new Date(year, 11, 21); // June 21 / December 21
    const prevYearWinterSolstice = new Date(year - 1, 11, 21),
        nextYearSummerSolstice = new Date(year + 1, 5, 21); // Dec 21 / June 21
    const currentYearLongestDay = isNorthern ? currentYearSummerSolstice : currentYearWinterSolstice;
    const currentYearShortestDay = isNorthern ? currentYearWinterSolstice : currentYearSummerSolstice;
    const otherYearRelevantSolstice = isNorthern
        ? date.getMonth() < 6
            ? prevYearWinterSolstice
            : nextYearSummerSolstice
        : date.getMonth() < 6
          ? new Date(year - 1, 5, 21)
          : new Date(year + 1, 11, 21);
    const daysToCurrYearLongest = (currentYearLongestDay.getTime() - date.getTime()) / msPerDay,
        daysToCurrYearShortest = (currentYearShortestDay.getTime() - date.getTime()) / msPerDay,
        daysToOtherYearSolstice = (otherYearRelevantSolstice.getTime() - date.getTime()) / msPerDay;
    if (Math.abs(daysToCurrYearLongest) <= daysWindow)
        return {
            near: true,
            type: 'longest day',
            exact: Math.abs(daysToCurrYearLongest) < 1,
            days: daysToCurrYearLongest,
        };
    else if (Math.abs(daysToCurrYearShortest) <= daysWindow)
        return {
            near: true,
            type: 'shortest day',
            exact: Math.abs(daysToCurrYearShortest) < 1,
            days: daysToCurrYearShortest,
        };
    else if (Math.abs(daysToOtherYearSolstice) <= daysWindow)
        return {
            near: true,
            type: (isNorthern && date.getMonth() < 6) || (!isNorthern && date.getMonth() >= 6) ? 'shortest day' : 'longest day',
            exact: Math.abs(daysToOtherYearSolstice) < 1,
            days: daysToOtherYearSolstice,
        };
    return { near: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isNearEquinox(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear(),
        msPerDay = 1000 * 60 * 60 * 24,
        isNorthern = hemisphere === 'northern';
    const springEquinox = new Date(year, 2, 20),
        autumnEquinox = new Date(year, 8, 22); // March 20 / September 22
    const firstEquinox = isNorthern ? springEquinox : autumnEquinox,
        secondEquinox = isNorthern ? autumnEquinox : springEquinox;
    const daysToFirst = (firstEquinox.getTime() - date.getTime()) / msPerDay,
        daysToSecond = (secondEquinox.getTime() - date.getTime()) / msPerDay;
    const prevYearSecondEquinox = new Date(year - 1, 8, 22),
        daysToPrevYearSecond = (prevYearSecondEquinox.getTime() - date.getTime()) / msPerDay;
    const nextYearFirstEquinox = new Date(year + 1, 2, 20),
        daysToNextYearFirst = (nextYearFirstEquinox.getTime() - date.getTime()) / msPerDay;
    if (Math.abs(daysToFirst) <= daysWindow)
        return {
            near: true,
            type: isNorthern ? 'spring equinox' : 'autumn equinox',
            exact: Math.abs(daysToFirst) < 1,
            days: daysToFirst,
        };
    else if (Math.abs(daysToSecond) <= daysWindow)
        return {
            near: true,
            type: isNorthern ? 'autumn equinox' : 'spring equinox',
            exact: Math.abs(daysToSecond) < 1,
            days: daysToSecond,
        };
    else if (Math.abs(daysToPrevYearSecond) <= daysWindow)
        return {
            near: true,
            type: isNorthern ? 'autumn equinox' : 'spring equinox',
            exact: Math.abs(daysToPrevYearSecond) < 1,
            days: daysToPrevYearSecond,
        };
    else if (Math.abs(daysToNextYearFirst) <= daysWindow)
        return {
            near: true,
            type: isNorthern ? 'spring equinox' : 'autumn equinox',
            exact: Math.abs(daysToNextYearFirst) < 1,
            days: daysToNextYearFirst,
        };
    return { near: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getCrossQuarterDay(date = new Date(), hemisphere = 'northern', daysWindow = 3) {
    const year = date.getFullYear(),
        msPerDay = 1000 * 60 * 60 * 24,
        isNorthern = hemisphere === 'northern';
    const imbolc = new Date(year, 1, 1),
        beltane = new Date(year, 4, 1),
        lughnasadh = new Date(year, 7, 1),
        samhain = new Date(year, 10, 1); // Feb 1 / May 1 / Aug 1 / Nov 1
    const daysToImbolc = Math.abs(date.getTime() - imbolc.getTime()) / msPerDay,
        daysToBeltane = Math.abs(date.getTime() - beltane.getTime()) / msPerDay,
        daysToLughnasadh = Math.abs(date.getTime() - lughnasadh.getTime()) / msPerDay,
        daysToSamhain = Math.abs(date.getTime() - samhain.getTime()) / msPerDay;
    if (daysToImbolc <= daysWindow)
        return {
            isCrossQuarter: true,
            name: isNorthern ? 'Imbolc (early spring)' : 'Lughnasadh (early autumn)',
            days: daysToImbolc,
        };
    else if (daysToBeltane <= daysWindow)
        return {
            isCrossQuarter: true,
            name: isNorthern ? 'Beltane (early summer)' : 'Samhain (early winter)',
            days: daysToBeltane,
        };
    else if (daysToLughnasadh <= daysWindow)
        return {
            isCrossQuarter: true,
            name: isNorthern ? 'Lughnasadh (early autumn)' : 'Imbolc (early spring)',
            days: daysToLughnasadh,
        };
    else if (daysToSamhain <= daysWindow)
        return {
            isCrossQuarter: true,
            name: isNorthern ? 'Samhain (early winter)' : 'Beltane (early summer)',
            days: daysToSamhain,
        };
    return { isCrossQuarter: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getAuroraPotential(latitude, month, solarActivity = undefined) {
    const isDarkSeason = month <= 2 || month >= 9;
    if (latitude >= 65)
        return {
            potential: isDarkSeason ? 'very high' : 'moderate',
            visible: isDarkSeason,
            bestTime: '22:00-02:00',
        };
    else if (latitude >= 60)
        return {
            potential: isDarkSeason ? 'high' : 'low',
            visible: isDarkSeason && solarActivity === 'high',
            bestTime: '23:00-01:00',
        };
    else if (latitude >= 55)
        return {
            potential: isDarkSeason ? 'moderate' : 'very low',
            visible: isDarkSeason && solarActivity === 'very high',
            bestTime: '00:00-01:00',
        };
    return { potential: 'very low', visible: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function __generateDescription(results) {
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
// -----------------------------------------------------------------------------------------------------------------------------------------

function getWeatherInterpretationImpl(location_data, data, data_history, store) {
    const {
        temp,
        humidity,
        pressure,
        windSpeed,
        solarRad,
        solarUvi,
        rainRate,
        radiationCpm,
        radiationAcpm,
        radationUsvh,
        snowDepth,
        iceDepth,
        cloudCover = undefined,
        season = getSeason(location_data.hemisphere),
    } = data;

    const date = new Date();
    const month = date.getMonth(),
        hour = date.getHours();
    const situation = {
        location: location_data,
        dewPoint: calculateDewPoint(temp, humidity),
        heatIndex: calculateHeatIndex(temp, humidity),
        windChill: calculateWindChill(temp, windSpeed),
        feelsLike: calculateFeelsLike(temp, humidity, windSpeed),
        date,
        month,
        hour,
        daylight: getDaylightHours(location_data.latitude, location_data.longitude),
    };
    const results = {
        conditions: [],
        phenomena: [],
        comfort: undefined,
        alerts: [],
        details: undefined,
        feelsLike: situation.feelsLike,
    };

    // Atmospheric pressure conditions - Nordic context
    if (pressure !== undefined) {
        const adjustedPressure = pressure * Math.exp(location_data.elevation / (29.3 * (temp + 273)));
        if (adjustedPressure < 970) {
            results.conditions.push('severe storm conditions');
            results.alerts.push('dangerously low pressure');
        } else if (adjustedPressure < 990) results.conditions.push('stormy');
        else if (adjustedPressure < 1000) results.conditions.push('unsettled');
        else if (adjustedPressure >= 1000 && adjustedPressure <= 1015);
        else if (adjustedPressure > 1015 && adjustedPressure <= 1025) results.conditions.push('settled');
        else if (adjustedPressure > 1025) results.conditions.push('stable high pressure');
        // Nordic-specific pressure context - Fall through early spring
        if (month >= 9 && month <= 3) {
            if (adjustedPressure > 1020)
                results.phenomena.push('clear winter conditions likely'); // High pressure in winter often brings very cold conditions
            else if (adjustedPressure < 990 && temp > 0) results.phenomena.push('winter rain likely'); // Low pressure in winter with temps above freezing often brings rain
        }
    }

    // Temperature conditions - adjusted for Swedish climate where cold is more common and heat more exceptional
    if (temp !== undefined) {
        if (temp < -25) {
            results.conditions.push('extremely cold');
            results.alerts.push('extreme cold');
        } else if (temp < -15) results.conditions.push('very cold');
        else if (temp < -5) results.conditions.push('cold');
        else if (temp < 0) results.conditions.push('freezing');
        else if (temp < 5) results.conditions.push('chilly');
        else if (temp < 10) results.conditions.push('cool');
        else if (temp >= 10 && temp < 18) results.conditions.push('mild');
        else if (temp >= 18 && temp < 23) results.conditions.push('warm');
        else if (temp >= 23 && temp < 28) results.conditions.push('hot');
        else {
            results.conditions.push('very hot');
            if (temp >= 30) results.alerts.push('unusual heat for this region');
        }
        // Season-specific temperature context for Sweden
        if (month >= 11 || month <= 2) {
            if (temp > 5) results.phenomena.push('unseasonably warm for winter');
            else if (temp < -20) results.phenomena.push('extreme Nordic winter conditions');
        } else if (month >= 6 && month <= 8) {
            if (temp > 25) results.phenomena.push('unusually hot for this region');
            else if (temp < 10) results.phenomena.push('unseasonably cool for summer');
        }
    }

    // Humidity conditions
    if (humidity !== undefined) {
        if (humidity > 90) results.conditions.push('very humid');
        else if (humidity > 70) results.conditions.push('humid');
        else if (humidity >= 30 && humidity <= 60);
        else if (humidity < 30) {
            results.conditions.push('dry');
            if (humidity < 15) results.conditions.push('extremely dry');
        }
    }

    // Wind conditions - using Beaufort scale as reference
    if (windSpeed !== undefined) {
        if (windSpeed < 0.5) results.conditions.push('calm');
        else if (windSpeed < 1.5) results.conditions.push('light air');
        else if (windSpeed < 3.3) results.conditions.push('light breeze');
        else if (windSpeed < 5.5) results.conditions.push('gentle breeze');
        else if (windSpeed < 7.9) results.conditions.push('moderate breeze');
        else if (windSpeed < 10.7) results.conditions.push('fresh breeze');
        else if (windSpeed < 13.8) results.conditions.push('strong breeze');
        else if (windSpeed < 17.1) {
            results.conditions.push('near gale');
            results.alerts.push('strong wind');
        } else if (windSpeed < 20.7) {
            results.conditions.push('gale');
            results.alerts.push('gale');
        } else if (windSpeed < 24.4) {
            results.conditions.push('strong gale');
            results.alerts.push('strong gale');
        } else if (windSpeed < 28.4) {
            results.conditions.push('storm');
            results.alerts.push('storm');
        } else if (windSpeed < 32.6) {
            results.conditions.push('violent storm');
            results.alerts.push('violent storm');
        } else {
            results.conditions.push('hurricane force');
            results.alerts.push('hurricane force wind');
        }
    }

    // Cloud cover conditions
    if (cloudCover !== undefined) {
        if (cloudCover < 10) results.conditions.push('clear sky');
        else if (cloudCover < 30) results.conditions.push('mostly clear');
        else if (cloudCover < 70) results.conditions.push('partly cloudy');
        else if (cloudCover < 90) results.conditions.push('mostly cloudy');
        else results.conditions.push('overcast');
    }

    // Precipitation conditions
    if (rainRate !== undefined) {
        if (rainRate > 0 && rainRate < 0.5) results.conditions.push('light rain');
        else if (rainRate >= 0.5 && rainRate < 4) results.conditions.push('moderate rain');
        else if (rainRate >= 4 && rainRate < 8) results.conditions.push('heavy rain');
        else if (rainRate >= 8) {
            results.conditions.push('very heavy rain');
            results.alerts.push('heavy rainfall');
        }
    }

    interpretSolarUV(results, situation, data, data_history, store);

    // Snow and Ice Depth Interpretation
    if (snowDepth !== undefined) {
        if (snowDepth === 0) {
            if (month >= 11 || month <= 2) results.phenomena.push('no snow cover during winter');
        } else if (snowDepth < 50) {
            results.conditions.push('light snow cover');
            if (month >= 3 && month <= 4) results.phenomena.push('spring snow melt beginning');
        } else if (snowDepth < 200) {
            results.conditions.push('moderate snow cover');
            if (temp > 0) results.phenomena.push('snow compaction likely');
        } else if (snowDepth < 500) {
            results.conditions.push('deep snow cover');
            results.phenomena.push('challenging forest mobility');
            if (windSpeed > 5) results.phenomena.push('snow drifting possible');
        } else {
            results.conditions.push('very deep snow cover');
            results.alerts.push('extreme snow depth');
            results.phenomena.push('restricted mobility in forest');
        }
        if (month === 10 && snowDepth > 0) results.phenomena.push('early season snow');
        else if (month === 4 && snowDepth > 100) results.phenomena.push('late season persistent snow pack');
        else if (month >= 5 && month <= 8 && snowDepth > 0) results.phenomena.push('unusual summer snow');
        if (snowDepth > 30) {
            if (temp < -15) results.phenomena.push('powder snow conditions');
            else if (temp < -5) results.phenomena.push('dry snow conditions');
            else if (temp < 0) results.phenomena.push('packed snow conditions');
            else if (temp > 0) {
                results.phenomena.push('wet snow conditions');
                if (temp > 5) results.phenomena.push('rapid snowmelt possible');
            }
        }
    }

    // Ice Depth Interpretation
    if (iceDepth !== undefined) {
        if (iceDepth === 0) {
            if (month >= 11 || month <= 3) if (temp < -5) results.phenomena.push('ice formation beginning');
        } else if (iceDepth < 50) {
            results.conditions.push('thin ice cover');
            if (month >= 11 || month <= 3) results.alerts.push('unsafe ice conditions');
        } else if (iceDepth < 150) {
            results.conditions.push('moderate ice cover');
            if (month >= 11 || month <= 2) results.phenomena.push('lakes partially frozen');
        } else if (iceDepth < 300) {
            results.conditions.push('thick ice cover');
            results.phenomena.push('lakes solidly frozen');
        } else {
            results.conditions.push('very thick ice cover');
            results.phenomena.push('exceptional ice thickness');
        }
        // Season-specific ice interpretations
        if (month === 10 && iceDepth > 0) results.phenomena.push('early lake ice formation');
        else if (month === 4 && iceDepth > 100) results.phenomena.push('late season persistent ice');
        else if (month >= 5 && month <= 9 && iceDepth > 0) results.phenomena.push('unusual season ice');
        if (iceDepth > 0) {
            if (temp > 0 && iceDepth < 150) results.alerts.push('weakening ice conditions');
            if (iceDepth < 50) results.alerts.push('thin ice hazard');
            else if (iceDepth >= 50 && iceDepth < 100) results.phenomena.push('ice may support single person');
            else if (iceDepth >= 100 && iceDepth < 200) results.phenomena.push('ice supports group activity');
            else if (iceDepth >= 200) results.phenomena.push('ice supports vehicle weight');
        }
        if (snowDepth > 100 && iceDepth > 100) results.phenomena.push('typical Nordic winter conditions');
    }

    // Radiation Interpretation: prefer ACPM (rolling average) but fall back to CPM if needed
    const radiationValue = radiationAcpm === undefined ? radiationCpm : radiationAcpm;
    const radiationSource = radiationAcpm === undefined ? 'instant' : 'average';
    if (radiationValue !== undefined) {
        // Background radiation in Sweden normally ranges from 5-30 CPM
        if (radiationValue <= 30) {
            // Normal background radiation - no specific condition
        } else if (radiationValue > 30 && radiationValue <= 50) {
            results.conditions.push('slightly elevated radiation');
            results.phenomena.push('above normal background radiation');
        } else if (radiationValue > 50 && radiationValue <= 100) {
            results.conditions.push('moderately elevated radiation');
            results.alerts.push(`elevated radiation levels (${radiationSource})`);
            results.phenomena.push('investigate radiation source');
        } else if (radiationValue > 100 && radiationValue <= 300) {
            results.conditions.push('high radiation');
            results.alerts.push(`high radiation levels (${radiationSource})`);
            results.phenomena.push('minimize prolonged exposure');
        } else if (radiationValue > 300) {
            results.conditions.push('extremely high radiation');
            results.alerts.push(`dangerous radiation levels (${radiationSource})`);
            results.phenomena.push('seek immediate shelter');
        }
        if (radiationValue > 30) {
            if (rainRate > 0) results.phenomena.push('possible radon washout in precipitation');
            if (month >= 9 || month <= 3) results.phenomena.push('seasonal radon fluctuation possible');
        }
        if (radiationValue > 50 && solarUvi > 5) results.phenomena.push('combined radiation and UV exposure');
        if (radationUsvh !== undefined) {
            if (radationUsvh > 0.5) results.alerts.push(`radiation dose rate: ${radationUsvh.toFixed(2)} µSv/h`);
            if (radationUsvh > 0.3 && radationUsvh <= 1) results.phenomena.push('above typical background dose rate');
            else if (radationUsvh > 1 && radationUsvh <= 5) results.phenomena.push('elevated dose rate - limit prolonged exposure');
            else if (radationUsvh > 5) results.phenomena.push('significant dose rate - health concern');
        }
    }

    // Weather phenomena interpretations - Nordic forest context
    if (temp !== undefined && humidity !== undefined) {
        if (temp < 0 && humidity > 70) {
            if (rainRate > 0) {
                if (temp < -10) results.phenomena.push('light powder snow likely');
                else results.phenomena.push('snow likely');
            } else if (temp < -2) results.phenomena.push('frost likely');
        }
        if ((temp < 0 || snowDepth > 0) && cloudCover > 70 && month >= 10 && month <= 3) {
            results.phenomena.push('snow accumulation on trees possible');
            if (windSpeed > 5) results.alerts.push('risk of snow-laden branches');
        }
        if (temp < 2 && temp > -8 && rainRate > 0) {
            results.phenomena.push('freezing rain possible');
            results.alerts.push('forest ice hazard');
        }
        if (temp > 20 && humidity > 75) results.phenomena.push('humid for Nordic climate');
        if (Math.abs(temp - situation.dewPoint) < 3 && temp > 0) {
            if (hour < 10 || hour > 18) results.phenomena.push('forest fog likely');
            else results.phenomena.push('fog likely');
        }
        if (month >= 5 && month <= 8 && temp > 22 && humidity < 40 && rainRate === 0) {
            results.phenomena.push('dry forest conditions');
            if (humidity < 30 && temp > 25) results.alerts.push('forest fire risk');
        }
    }

    // Precipitation predictions based on pressure and humidity
    if (pressure !== undefined && humidity !== undefined) {
        if (pressure < 1000 && humidity > 75) results.phenomena.push('rain likely');
        else if (pressure > 1020 && humidity < 40) results.phenomena.push('clear and dry');
    }

    // Wind chill effect
    if (temp !== undefined && windSpeed !== undefined) {
        if (temp < 10 && windSpeed > 3) {
            const windChillDiff = Math.round(temp - situation.windChill);
            if (windChillDiff >= 3) results.phenomena.push(`feels ${windChillDiff}°C colder due to wind`);
        }
    }

    // Heat index effect
    if (temp !== undefined && humidity !== undefined) {
        if (temp > 20 && humidity > 60) {
            const heatIndexDiff = Math.round(situation.heatIndex - temp);
            if (heatIndexDiff >= 3) results.phenomena.push(`feels ${heatIndexDiff}°C warmer due to humidity`);
        }
    }

    // Time of day specific phenomena - Nordic daylight considerations with precise calculations
    if (temp !== undefined) {
        if (month >= 5 && month <= 7) {
            if (situation.daylight.isDaytime && hour > 20) results.phenomena.push('extended Nordic summer evening light');
            if (situation.daylight.sunriseDecimal < 4.5 && hour < 7) results.phenomena.push(`early sunrise`);
            if (!situation.daylight.isDaytime && hour > Math.floor(situation.daylight.sunsetDecimal) && hour < Math.floor(situation.daylight.sunsetDecimal) + 2)
                results.phenomena.push('lingering twilight');
        } else if (month >= 11 || month <= 1) {
            if (!situation.daylight.isDaytime && hour >= 15 && hour < 17) results.phenomena.push(`early winter darkness`);
            if (situation.daylight.daylightHours < 7)
                results.phenomena.push(`short winter day (${Math.round(situation.daylight.daylightHours)} hours of daylight)`);
            if (situation.daylight.isDaytime && temp < -5) results.phenomena.push('cold winter daylight');
        }
        const currentHourDecimal = hour + new Date().getMinutes() / 60;
        if (
            !situation.daylight.isDaytime &&
            currentHourDecimal >= situation.daylight.sunsetDecimal &&
            currentHourDecimal <= situation.daylight.civilDuskDecimal
        )
            results.phenomena.push('civil twilight');
        if (temp < 3 && hour > Math.floor(situation.daylight.sunriseDecimal) && hour < Math.floor(situation.daylight.sunriseDecimal) + 3)
            results.phenomena.push('morning chill');
        if (temp > 22 && hour > 12 && hour < 16) results.phenomena.push('afternoon warmth');
        if (windSpeed > 5 && location_data.forestCoverage === 'high') results.phenomena.push('forest wind effect');
    }

    // Season-specific interpretations for Nordic region
    if (season && temp !== undefined) {
        switch (season) {
            case 'winter': {
                if (temp > 5) results.phenomena.push('unusually mild winter day');
                if (temp < -20) results.phenomena.push('severe Nordic winter conditions');
                if (situation.daylight.daylightHours < 7) results.phenomena.push('short winter day');
                break;
            }
            case 'summer': {
                if (temp < 12) results.phenomena.push('cool summer day');
                if (temp > 25) results.phenomena.push('hot Nordic summer day');
                if (situation.daylight.daylightHours > 18) results.phenomena.push('extended Nordic summer daylight');
                break;
            }
            case 'spring': {
                if (month === 3 && temp > 10) results.phenomena.push('early spring warmth');
                if (month === 4 && rainRate > 0 && temp > 5) results.phenomena.push('spring forest rain');
                break;
            }
            case 'autumn': {
                if (month === 9 && temp < 5) results.phenomena.push('early autumn chill');
                if (month === 10 && rainRate > 0 && temp < 10) results.phenomena.push('cold autumn rain');
                break;
            }
        }
    }

    // Solstice proximity interpretation
    const moonPhase = getMoonPhase(date);
    const solsticeInfo = isNearSolstice(date, location_data.hemisphere, 28);
    let moonPhaseReported = false;
    if (solsticeInfo.near) {
        if (solsticeInfo.exact) results.phenomena.push(`'${solsticeInfo.type}' today`);
        else if (solsticeInfo.days > 0)
            results.phenomena.push(`'${solsticeInfo.type}' (in ${Math.ceil(solsticeInfo.days)} day${solsticeInfo.days > 1 ? 's' : ''})`);
        else results.phenomena.push(`'${solsticeInfo.type}' (${Math.abs(Math.floor(solsticeInfo.days))} day${solsticeInfo.days > 1 ? 's' : ''} ago)`);
        const isHighLatitude = location_data.latitude >= 59.5;
        if (solsticeInfo.type === 'longest day') {
            if (situation.daylight.daylightHours > 16) results.phenomena.push('extended daylight');
            if (isHighLatitude) {
                // && cloudCover !== undefined && cloudCover < 50) { // XXX
                results.phenomena.push('near-midnight sun');
                if (location_data.latitude > 66) results.phenomena.push('true midnight sun (sun never sets)');
                else if (location_data.latitude > 60) results.phenomena.push('bright nights (civil twilight all night)');
            }
            if (moonPhase >= 0.48 && moonPhase <= 0.52)
                // && cloudCover !== undefined && cloudCover < 40) // XXX
                results.phenomena.push('solstice full moon (rare)'), (moonPhaseReported = true);
        } else if (solsticeInfo.type === 'shortest day') {
            if (situation.daylight.daylightHours < 8) results.phenomena.push('brief daylight');
            if (isHighLatitude) {
                results.phenomena.push('extended darkness');
                if (location_data.latitude > 66.5) results.phenomena.push('polar night (sun never rises)');
                else if (location_data.latitude > 60) results.phenomena.push('very short days (less than 6 hours of daylight)');
                else if (location_data.latitude > 59) results.phenomena.push('short days (approx 6 hours of daylight)');
            }
            if (moonPhase >= 0.48 && moonPhase <= 0.52)
                // && cloudCover !== undefined && cloudCover < 40) // XXX
                results.phenomena.push('winter solstice full moon (special illumination)'), (moonPhaseReported = true);
        }
    }

    // Moon phase interpretation
    if (!moonPhaseReported && moonPhase >= 0.48 && moonPhase <= 0.52) {
        results.phenomena.push('full moon tonight');
        if (cloudCover !== undefined && cloudCover < 40) results.phenomena.push('good visibility for night activities');
        if ((temp < 0 || snowDepth > 0) && cloudCover !== undefined && cloudCover < 30)
            // XXX
            results.phenomena.push('enhanced snow reflection in moonlight');
    } else if (moonPhase >= 0.98 || moonPhase <= 0.02) {
        results.phenomena.push('new moon tonight');
        if (location_data.lightPollution === 'low' && cloudCover !== undefined && cloudCover < 30)
            // XXX
            results.phenomena.push('excellent stargazing conditions');
    } else if ((moonPhase >= 0.23 && moonPhase <= 0.27) || (moonPhase >= 0.73 && moonPhase <= 0.77))
        results.phenomena.push(`${moonPhase < 0.5 ? 'first' : 'last'} quarter moon tonight`);

    const moonDistanceInfo = getMoonDistance(date);
    if (moonDistanceInfo.isSupermoon && moonPhase >= 0.48 && moonPhase <= 0.52) results.phenomena.push('supermoon (larger and brighter)');
    else if (moonDistanceInfo.isMicromoon && moonPhase >= 0.48 && moonPhase <= 0.52) results.phenomena.push('micromoon (smaller and dimmer)');

    const crossQuarterInfo = getCrossQuarterDay(date, location_data.hemisphere);
    if (crossQuarterInfo.isCrossQuarter) results.phenomena.push(`cross-quarter ${crossQuarterInfo.name}`);

    const equinoxInfo = isNearEquinox(date, location_data.hemisphere, 14);
    if (equinoxInfo.near) {
        if (equinoxInfo.exact) results.phenomena.push(`${equinoxInfo.type} today (equal day/night)`);
        else if (equinoxInfo.days > 0)
            results.phenomena.push(`${equinoxInfo.type} (in ${Math.ceil(equinoxInfo.days)} day${Math.ceil(equinoxInfo.days) > 1 ? 's' : ''})`);
        else
            results.phenomena.push(
                `${equinoxInfo.type} (${Math.abs(Math.floor(equinoxInfo.days))} day${Math.abs(Math.floor(equinoxInfo.days)) > 1 ? 's' : ''} ago)`
            );
        results.phenomena.push(`rapidly ${equinoxInfo.type.includes('spring') ? 'increasing' : 'decreasing'} daylight`);
    }

    const lunarEclipseInfo = getLunarEclipse(date, location_data.latitude, location_data.longitude, 14);
    if (lunarEclipseInfo.isEclipse) {
        results.phenomena.push(`${lunarEclipseInfo.type} lunar eclipse today`);
        if (lunarEclipseInfo.type === 'total' || lunarEclipseInfo.magnitude > 0.6)
            results.phenomena.push(`(significant magnitude: ${lunarEclipseInfo.magnitude.toFixed(2)})`);
        if (lunarEclipseInfo.visibilityLocation) {
            if (lunarEclipseInfo.visibilityLocation.visible) {
                if (lunarEclipseInfo.visibilityLocation.localCircumstances?.visibilityDescription)
                    results.phenomena.push(lunarEclipseInfo.visibilityLocation.localCircumstances.visibilityDescription);
                if (lunarEclipseInfo.visibilityLocation.bestViewingTime) {
                    const bestTime = lunarEclipseInfo.visibilityLocation.bestViewingTime;
                    results.phenomena.push(`best viewing at ${bestTime.getHours()}:${String(bestTime.getMinutes()).padStart(2, '0')}`);
                }
                if (cloudCover !== undefined && cloudCover < 30) results.phenomena.push('excellent viewing conditions for lunar eclipse');
                else if (cloudCover !== undefined && cloudCover < 60) results.phenomena.push('fair viewing conditions for lunar eclipse');
                else if (cloudCover !== undefined) results.phenomena.push('poor viewing conditions for lunar eclipse');
            } else results.phenomena.push('lunar eclipse not visible from this location');
        }
        if (lunarEclipseInfo.type === 'total' && lunarEclipseInfo.magnitude > 1.2) results.alerts.push('rare deep total lunar eclipse');
    }

    const solarEclipseInfo = getSolarEclipse(date, location_data.latitude, location_data.longitude, 14);
    if (solarEclipseInfo.isEclipse) {
        results.phenomena.push(`${solarEclipseInfo.type} solar eclipse today`);
        if (solarEclipseInfo.magnitude) results.phenomena.push(`(magnitude: ${solarEclipseInfo.magnitude.toFixed(2)})`);
        if (solarEclipseInfo.obscuration) results.phenomena.push(`${Math.round(solarEclipseInfo.obscuration * 100)}% of sun's disk covered`);
        if (solarEclipseInfo.visibilityLocation) {
            switch (solarEclipseInfo.visibilityLocation) {
                case 'in path of totality': {
                    results.phenomena.push('total solar eclipse visible from this location');
                    results.alerts.push('rare total solar eclipse today');
                    break;
                }
                case 'in path of annularity': {
                    results.phenomena.push('annular "ring of fire" eclipse visible from this location');
                    results.alerts.push('annular solar eclipse today');
                    break;
                }
                case 'partial visibility': {
                    results.phenomena.push('partial solar eclipse visible from this location');
                    break;
                }
                default: {
                    results.phenomena.push('solar eclipse not visible from this location');
                    break;
                }
            }
        }
        if (
            (solarEclipseInfo.type === 'total' || solarEclipseInfo.type === 'annular') &&
            solarEclipseInfo.duration &&
            solarEclipseInfo.visibilityLocation &&
            solarEclipseInfo.visibilityLocation.includes('in path')
        ) {
            const durationMinutes = Math.floor(solarEclipseInfo.duration),
                durationSeconds = Math.round((solarEclipseInfo.duration - durationMinutes) * 60);
            results.phenomena.push(`eclipse duration: ${durationMinutes}m ${durationSeconds}s`);
        }
        if (cloudCover !== undefined && cloudCover < 20) results.phenomena.push('excellent viewing conditions for solar eclipse');
        else if (cloudCover !== undefined && cloudCover < 50) results.phenomena.push('fair viewing conditions for solar eclipse');
        else if (cloudCover !== undefined) results.phenomena.push('poor viewing conditions for solar eclipse');
        if (solarEclipseInfo.visibilityLocation && solarEclipseInfo.visibilityLocation !== 'not visible')
            results.alerts.push('use proper eye protection for solar eclipse viewing');
    }

    const auroraPotential = getAuroraPotential(location_data.latitude, month);
    if (auroraPotential.potential !== 'very low') {
        if (auroraPotential.visible)
            results.phenomena.push(
                `aurora borealis likely visible (best time: ${auroraPotential.bestTime}${cloudCover !== undefined && cloudCover < 30 && moonPhase < 0.3 ? ', with good visbility' : ''})`
            );
        else if (auroraPotential.potential === 'high' || auroraPotential.potential === 'very high')
            results.phenomena.push('potential for aurora activity (if dark enough)');
    }

    results.comfort = calculateComfortLevel(temp, humidity, windSpeed, solarRad);
    results.details = __generateDescription(results);

    return results;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateDewPoint = (temp, humidity) => {
    // Magnus-Tetens formula
    const a = 17.27;
    const b = 237.7;
    const alpha = (a * temp) / (b + temp) + Math.log(humidity / 100);
    return (b * alpha) / (a - alpha);
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateHeatIndex = (temp, rh) => {
    if (temp < 20) return temp; // Only applicable for temps > 20°C
    const tempF = (temp * 9) / 5 + 32; // Convert to Fahrenheit for the standard formula
    let heatIndexF = 0.5 * (tempF + 61 + (tempF - 68) * 1.2 + rh * 0.094); // Simplified heat index formula
    if (tempF >= 80) {
        // Use more precise formula if hot enough
        heatIndexF =
            -42.379 +
            2.04901523 * tempF +
            10.14333127 * rh -
            0.22475541 * tempF * rh -
            6.83783e-3 * tempF * tempF -
            5.481717e-2 * rh * rh +
            1.22874e-3 * tempF * tempF * rh +
            8.5282e-4 * tempF * rh * rh -
            1.99e-6 * tempF * tempF * rh * rh;
        if (rh < 13 && tempF >= 80 && tempF <= 112)
            // Apply adjustment for low humidity or cool temps
            heatIndexF -= ((13 - rh) / 4) * Math.hypot((17 - Math.abs(tempF - 95)) / 17);
        else if (rh > 85 && tempF >= 80 && tempF <= 87) heatIndexF += ((rh - 85) / 10) * ((87 - tempF) / 5);
    }
    return ((heatIndexF - 32) * 5) / 9; // Convert back to Celsius
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateWindChill = (temp, windSpeed) => {
    if (temp > 10 || windSpeed <= 1.3) return temp; // Only applicable for temps <= 10°C and wind > 1.3 m/s
    const windSpeedKmh = windSpeed * 3.6; // Convert wind speed to km/h
    return 13.12 + 0.6215 * temp - 11.37 * windSpeedKmh ** 0.16 + 0.3965 * temp * windSpeedKmh ** 0.16; // Calculate wind chill using Environment Canada formula
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateFeelsLike = (temp, humidity, windSpeed) => {
    if (temp <= 10)
        // For cold conditions, use wind chill
        return calculateWindChill(temp, windSpeed);
    else if (temp >= 20)
        // For warm conditions, use heat index
        return calculateHeatIndex(temp, humidity); // For moderate conditions, just use the actual temperature
    else return temp;
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateComfortLevel = (temp, humidity, windSpeed, solarRad) => {
    const feelsLike = calculateFeelsLike(temp, humidity, windSpeed);
    if (feelsLike < -10 || feelsLike > 35) return 'very uncomfortable';
    if (feelsLike < 0 || feelsLike > 30) return 'uncomfortable';
    if ((temp > 20 && humidity > 80) || humidity < 20) return 'somewhat uncomfortable';
    if (windSpeed > 8) return 'somewhat uncomfortable';
    if (solarRad > 700) return 'somewhat uncomfortable';
    if (feelsLike >= 18 && feelsLike <= 24 && humidity >= 30 && humidity <= 60) return 'very comfortable';
    if (feelsLike >= 15 && feelsLike <= 28) return 'comfortable';
    return 'moderately comfortable';
};

// -----------------------------------------------------------------------------------------------------------------------------------------

function getSeason(hemisphere = 'northern') {
    const seasons = {
        northern: ['winter', 'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'winter'],
        southern: ['summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter', 'winter', 'spring', 'spring', 'summer'],
    };
    return seasons[hemisphere][new Date().getMonth()];
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getDST(date = new Date()) {
    if (date.getMonth() > 10 || date.getMonth() < 2) return false; // November to February
    if (date.getMonth() > 3 && date.getMonth() < 9) return true; // April to September
    const lastDayOfMarch = new Date(date.getFullYear(), 2, 31);
    while (lastDayOfMarch.getMonth() > 2) lastDayOfMarch.setDate(lastDayOfMarch.getDate() - 1);
    const lastSundayOfMarch = new Date(lastDayOfMarch);
    while (lastSundayOfMarch.getDay() !== 0) lastSundayOfMarch.setDate(lastSundayOfMarch.getDate() - 1);
    lastSundayOfMarch.setHours(2, 0, 0, 0); // 02:00 CET
    const lastDayOfOctober = new Date(date.getFullYear(), 9, 31);
    while (lastDayOfOctober.getMonth() > 9) lastDayOfOctober.setDate(lastDayOfOctober.getDate() - 1);
    const lastSundayOfOctober = new Date(lastDayOfOctober);
    while (lastSundayOfOctober.getDay() !== 0) lastSundayOfOctober.setDate(lastSundayOfOctober.getDate() - 1);
    lastSundayOfOctober.setHours(3, 0, 0, 0); // 03:00 CEST
    return date >= lastSundayOfMarch && date < lastSundayOfOctober;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getDaylightHours(latitude, longitude, date = new Date()) {
    let dayOfYear = date.getDate();
    for (let i = 0; i < date.getMonth(); i++) dayOfYear += [31, isLeapYear(date.getFullYear()) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i];
    const latitudeRad = (latitude * Math.PI) / 180;
    const fracYear = ((2 * Math.PI) / (isLeapYear(date.getFullYear()) ? 366 : 365)) * (dayOfYear - 1 + (date.getHours() - 12) / 24);
    const declination =
        0.006918 -
        0.399912 * Math.cos(fracYear) +
        0.070257 * Math.sin(fracYear) -
        0.006758 * Math.cos(2 * fracYear) +
        0.000907 * Math.sin(2 * fracYear) -
        0.002697 * Math.cos(3 * fracYear) +
        0.00148 * Math.sin(3 * fracYear);
    const eqTime =
        229.18 *
        (0.000075 + 0.001868 * Math.cos(fracYear) - 0.032077 * Math.sin(fracYear) - 0.014615 * Math.cos(2 * fracYear) - 0.040849 * Math.sin(2 * fracYear));
    const solarNoon = 12 - eqTime / 60 - longitude / 15;
    const cosHourAngle =
        (Math.cos((90.8333 * Math.PI) / 180) - Math.sin(latitudeRad) * Math.sin(declination)) / (Math.cos(latitudeRad) * Math.cos(declination));
    const hourAngle = cosHourAngle >= -1 && cosHourAngle <= 1 ? (Math.acos(cosHourAngle) * 180) / Math.PI / 15 : 0;
    const cosCivilHourAngle =
        (Math.cos((96 * Math.PI) / 180) - Math.sin(latitudeRad) * Math.sin(declination)) / (Math.cos(latitudeRad) * Math.cos(declination)); // 90 + 6 degrees
    const civilHourAngle =
        cosCivilHourAngle >= -1 && cosCivilHourAngle <= 1 ? (Math.acos(cosCivilHourAngle) * 180) / Math.PI / 15 : cosCivilHourAngle < -1 ? 12 : 0;
    const utcOffset = -date.getTimezoneOffset() / 60;
    return {
        sunriseDecimal: normalizeTime(solarNoon - hourAngle + utcOffset),
        sunsetDecimal: normalizeTime(solarNoon + hourAngle + utcOffset),
        civilDawnDecimal: normalizeTime(solarNoon - civilHourAngle + utcOffset),
        civilDuskDecimal: normalizeTime(solarNoon + civilHourAngle + utcOffset),
        daylightHours: cosHourAngle < -1 ? 24 : cosHourAngle > 1 ? 0 : 2 * hourAngle,
        isDaytime:
            date.getHours() + date.getMinutes() / 60 > normalizeTime(solarNoon - hourAngle + utcOffset) &&
            date.getHours() + date.getMinutes() / 60 < normalizeTime(solarNoon + hourAngle + utcOffset),
        isDST: getDST(date),
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarUV(results, _situation, data, data_history, _store) {
    const { solarRad: rad, solarUvi: uvi } = data;
    const fiveMinutesAgo = data.timestamp - 5 * 60 * 1000;

    let uviSum = uvi ?? 0,
        uviCnt = uvi === undefined ? 0 : 1,
        radSum = rad ?? 0,
        radCnt = rad === undefined ? 0 : 1,
        uviAvg,
        radAvg;
    Object.entries(data_history)
        .filter(([timestamp, _entry]) => timestamp > fiveMinutesAgo)
        .forEach(([_timestamp, entry]) => {
            if (entry.solarUvi !== undefined) {
                uviSum += entry.solarUvi;
                uviCnt++;
            }
            if (entry.solarRad !== undefined) {
                radSum += entry.solarRad;
                radCnt++;
            }
        });
    if (uviCnt > 0) uviAvg = uviSum / uviCnt;
    if (radCnt > 0) radAvg = radSum / radCnt;

    if (radAvg !== undefined) {
        if (radAvg > 800) results.conditions.push('intense sunlight');
        else if (radAvg > 500) results.conditions.push('strong sunlight');
    }

    if (uviAvg !== undefined && uviCnt >= 3) {
        if (uviAvg >= 11) {
            results.conditions.push('extreme UV');
            results.alerts.push('extreme UV (5-min avg)');
        } else if (uviAvg >= 8) {
            results.conditions.push('very high UV');
            results.alerts.push('very high UV (5-min avg)');
        } else if (uviAvg >= 6) {
            results.conditions.push('high UV (5-min avg)');
        } else if (uviAvg >= 3) {
            results.conditions.push('moderate UV (5-min avg)');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weatherCache = {},
    weatherStore = {};
const CACHE_DURATION = 6 * 60 * 60 * 1000;

function getWeatherInterpretation(location_data, data) {
    const cacheExpiration = data.timestamp - CACHE_DURATION;
    Object.keys(weatherCache)
        .filter((timestamp) => timestamp < cacheExpiration)
        .forEach((timestamp) => delete weatherCache[timestamp]);
    weatherCache[data.timestamp] = data;
    return getWeatherInterpretationImpl(location_data, data, weatherCache, weatherStore);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = { getWeatherInterpretation };

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
