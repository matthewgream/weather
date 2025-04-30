// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const joinand = (items) => {
    if (!items || items.length === 0) return '';
    else if (items.length === 1) return items[0];
    else if (items.length === 2) return `${items[0]} and ${items[1]}`;
    const lastItem = items.pop();
    return `${items.join(', ')}, and ${lastItem}`;
};

function radToDeg(angleRad) {
    return (180 * angleRad) / Math.PI;
}
function degToRad(angleDeg) {
    return (Math.PI * angleDeg) / 180;
}
function dateToJulianDay(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours() / 24.0;
    const minute = date.getMinutes() / 1440.0;
    const second = date.getSeconds() / 86400.0;
    if (month <= 2) {
        year -= 1;
        month += 12;
    }
    const a = Math.floor(year / 100);
    const b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + hour + minute + second + b - 1524.5;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const __generateDescription = (results) => {
    let details = '';
    if (results.conditions.length > 0) details = joinand([...new Set(results.conditions)]);
    if (results.phenomena.length > 0) details += (details ? ': ' : '') + joinand([...new Set(results.phenomena)]);
    if (details) {
        details = details.charAt(0).toUpperCase() + details.slice(1);
        if (!details.endsWith('.')) details += '.';
    }
    return details || null;
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const getMoonPhase = (date = new Date()) => {
    const knownNewMoon = new Date(2000, 0, 6);
    const diff = date.getTime() - knownNewMoon.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    const lunarCycle = 29.53059; // Length of lunar cycle in days (more precise)
    return (days % lunarCycle) / lunarCycle;
};

const getMoonDistance = (date = new Date()) => {
    const moonPhase = getMoonPhase(date);
    const orbitalPos = moonPhase * 2 * Math.PI;
    const moonDistance = 384400 * (1 - 0.0549 * Math.cos(orbitalPos));
    return {
        distance: moonDistance, // in km
        isSupermoon: moonDistance < 367000 && Math.abs(moonPhase - 0.5) < 0.1, // Full moon at perigee
        isMicromoon: moonDistance > 400000 && Math.abs(moonPhase - 0.5) < 0.1, // Full moon at apogee
        isCloseApproach: moonDistance < 370000, // Generally close approach
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const getLunarEclipse = (d = new Date(), observerLatitude = null, observerLongitude = null, daysWindow = 7) => {
    const jd = dateToJulianDay(d);
    const moonPhase = getMoonPhase(d);
    const isNearFullMoon = Math.abs(moonPhase - 0.5) < 0.05; // Within 5% of full moon
    if (!isNearFullMoon) return { isEclipse: false };
    const moonPos = getMoonPosition(jd);
    const sunPos = getSunPosition(jd);
    const nodeProximity = calculateNodeProximity(moonPos, sunPos);
    if (Math.abs(nodeProximity) > 1.5) return { isEclipse: false };
    const umbralDistance = calculateUmbralDistance(moonPos, sunPos);
    let type = '';
    if (umbralDistance < 0.5) type = 'total';
    else if (umbralDistance < 1.0) type = 'partial';
    else if (umbralDistance < 1.6) type = 'penumbral';
    else return { isEclipse: false };
    const magnitude = calculateEclipseMagnitude(umbralDistance);
    const duration = calculateEclipseDuration(umbralDistance, moonPos.velocity); // minutes
    const date = calculateEclipsePeakTime(d, nodeProximity, moonPos.velocity);
    const times = calculateEclipseTimes(type, date, duration);
    let localVisibility = { visible: 'unknown' };
    if (observerLatitude !== null && observerLongitude !== null)
        localVisibility = calculateLocalLunarVisibility(type, times, observerLatitude, observerLongitude);
    const visibility = determineLunarEclipseVisibleRegions(times.peak);
    return { isEclipse: true, type, date, magnitude, duration, visibility, times, localVisibility };
};

function calculateLocalLunarVisibility(eclipseType, eclipseTimes, latitude, longitude) {
    const result = {
        visible: false,
        moonAboveHorizon: false,
        phaseVisibility: {},
        bestViewingTime: null,
        localCircumstances: {},
    };
    const hourAngleOffset = longitude / 15; // 15 degrees = 1 hour
    const phases = ['start', 'peak', 'end'];
    for (const phase of phases) {
        const time = eclipseTimes[phase];
        const altitude = calculateMoonAltitude(time, latitude, longitude);
        const visible = altitude > 0; // Above horizon
        const localTime = new Date(phaseTime.getTime() + hourAngleOffset * 60 * 60 * 1000);
        result.phaseVisibility[phase] = { time, localTime, visible, altitude };
        if (visible) result.visible = true;
    }
    if (result.visible) {
        if (result.phaseVisibility.peak.visible) result.bestViewingTime = result.phaseVisibility.peak.time;
        else {
            let highestAltitude = -1;
            for (const phase of phases)
                if (result.phaseVisibility[phase].visible && result.phaseVisibility[phase].altitude > highestAltitude) {
                    highestAltitude = result.phaseVisibility[phase].altitude;
                    result.bestViewingTime = result.phaseVisibility[phase].time;
                }
        }
    }
    if (result.visible) {
        const moonriseSet = calculateMoonriseSet(eclipseTimes.peak, latitude, longitude);
        const moonAlwaysUp = latitude > 60 && moonriseSet.alwaysUp,
            moonNeverUp = latitude > 60 && moonriseSet.neverUp;
        result.localCircumstances = {
            moonrise: moonriseSet.rise,
            moonset: moonriseSet.set,
            moonAlwaysUp,
            moonNeverUp,
            visibilityDescription: getVisibilityDescription(result.phaseVisibility, moonriseSet, eclipseType),
        };
    }
    return result;
}

function getVisibilityDescription(phaseVisibility, moonriseSet, eclipseType) {
    if (moonriseSet.neverUp) return 'Not visible - moon below horizon during eclipse';
    if (moonriseSet.alwaysUp) return `Complete ${eclipseType} eclipse visible all night`;
    const startVisible = phaseVisibility.start.visible;
    const peakVisible = phaseVisibility.peak.visible;
    const endVisible = phaseVisibility.end.visible;
    if (startVisible && peakVisible && endVisible) return `Complete ${eclipseType} eclipse visible`;
    else if (peakVisible) {
        if (startVisible) return `Eclipse visible from start through maximum phase, ends after moonset`;
        else if (endVisible) return `Eclipse visible from moonrise through maximum phase and end`;
        else return `Maximum eclipse phase visible, but partial phases occur before moonrise and after moonset`;
    } else if (startVisible && !peakVisible) return `Only early phase of eclipse visible before moonset`;
    else if (endVisible && !peakVisible) return `Only late phase of eclipse visible after moonrise`;
    else return 'Eclipse technically visible but very low on horizon';
}

function calculateMoonAltitude(time, latitude, longitude) {
    const latRad = degToRad(latitude);
    const jd = dateToJulianDay(time);
    const moonPos = getMoonPosition(jd);
    const moonEquatorial = eclipticToEquatorial(moonPos.longitude, moonPos.latitude, jd);
    const lst = calculateLocalSiderealTime(jd, longitude);
    const ha = lst - moonEquatorial.ra;
    const sinAlt = Math.sin(latRad) * Math.sin(moonEquatorial.dec) + Math.cos(latRad) * Math.cos(moonEquatorial.dec) * Math.cos(ha);
    return radToDeg(Math.asin(sinAlt));
}

function eclipticToEquatorial(lon, lat, jd) {
    const T = (jd - 2451545.0) / 36525;
    const obliquity = degToRad(23.43929111 - 0.0130041 * T - 0.00000016 * T * T + 0.000000504 * T * T * T);
    const lonRad = degToRad(lon);
    const latRad = degToRad(lat);
    const sinDec = Math.sin(latRad) * Math.cos(obliquity) + Math.cos(latRad) * Math.sin(obliquity) * Math.sin(lonRad);
    const dec = Math.asin(sinDec);
    const y = Math.sin(lonRad) * Math.cos(obliquity) - Math.tan(latRad) * Math.sin(obliquity);
    const x = Math.cos(lonRad);
    let ra = Math.atan2(y, x);
    if (ra < 0) ra += 2 * Math.PI;
    return { ra, dec };
}

function calculateLocalSiderealTime(jd, longitude) {
    const T = (jd - 2451545.0) / 36525;
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
    gmst = ((gmst % 360) + 360) % 360;
    return degToRad((((gmst + longitude) % 360) + 360) % 360);
}

function calculateMoonriseSet(date, latitude, longitude) {
    const jd = dateToJulianDay(date);
    const moonPos = getMoonPosition(jd);
    const moonEquatorial = eclipticToEquatorial(moonPos.longitude, moonPos.latitude, jd);
    const decDeg = radToDeg(moonEquatorial.dec);
    if (latitude > 0) {
        if (decDeg > 90 - latitude) return { alwaysUp: true, neverUp: false, rise: null, set: null };
        else if (decDeg < latitude - 90) return { alwaysUp: false, neverUp: true, rise: null, set: null };
    } else {
        if (decDeg < -(90 + latitude)) return { alwaysUp: true, neverUp: false, rise: null, set: null };
        else if (decDeg > 90 + latitude) return { alwaysUp: false, neverUp: true, rise: null, set: null };
    }
    const gmst = calculateLocalSiderealTime(jd, 0) * (180 / Math.PI);
    const moonHourAngle = (((gmst - radToDeg(moonEquatorial.ra) + longitude) % 360) + 360) % 360;
    const timeToMeridian = (180 - moonHourAngle) / 15; // in hours
    const cosLHA =
        (Math.sin(degToRad(-0.583)) - Math.sin(degToRad(latitude)) * Math.sin(moonEquatorial.dec)) /
        (Math.cos(degToRad(latitude)) * Math.cos(moonEquatorial.dec));
    let riseTime, setTime;
    if (Math.abs(cosLHA) <= 1) {
        const LHA = Math.acos(cosLHA) * (180 / Math.PI);
        const riseHourAngle = (360 - LHA) / 15; // in hours
        const setHourAngle = LHA / 15; // in hours
        const transitTime = new Date(date);
        transitTime.setHours(transitTime.getHours() + timeToMeridian);
        riseTime = new Date(transitTime);
        riseTime.setHours(riseTime.getHours() - riseHourAngle);
        setTime = new Date(transitTime);
        setTime.setHours(setTime.getHours() + setHourAngle);
    } else {
        riseTime = null;
        setTime = null;
    }
    return {
        alwaysUp: false,
        neverUp: false,
        rise: riseTime,
        set: setTime,
    };
}

function calculateEclipseTimes(eclipseType, peakTime, duration) {
    let penumbralDuration, partialDuration, totalDuration;
    switch (eclipseType) {
        case 'total': // For total eclipses, the total phase is shorter than the partial phase
            totalDuration = duration; // as provided
            partialDuration = totalDuration * 2.5; // approximation
            penumbralDuration = partialDuration * 1.5; // approximation
            break;
        case 'partial': // No total phase for partial eclipses
            totalDuration = 0;
            partialDuration = duration; // as provided
            penumbralDuration = partialDuration * 1.5; // approximation
            break;
        case 'penumbral': // Only penumbral phase
            totalDuration = 0;
            partialDuration = 0;
            penumbralDuration = duration; // as provided
            break;
    }
    const penumbralStart = new Date(peakTime.getTime() - (penumbralDuration / 2) * 60 * 1000);
    const penumbralEnd = new Date(peakTime.getTime() + (penumbralDuration / 2) * 60 * 1000);
    let partialStart = null,
        partialEnd = null,
        totalStart = null,
        totalEnd = null;
    if (partialDuration > 0) {
        partialStart = new Date(peakTime.getTime() - (partialDuration / 2) * 60 * 1000);
        partialEnd = new Date(peakTime.getTime() + (partialDuration / 2) * 60 * 1000);
    }
    if (totalDuration > 0) {
        totalStart = new Date(peakTime.getTime() - (totalDuration / 2) * 60 * 1000);
        totalEnd = new Date(peakTime.getTime() + (totalDuration / 2) * 60 * 1000);
    }
    return {
        start: penumbralStart,
        peak: peakTime,
        end: penumbralEnd,
        penumbral: {
            start: penumbralStart,
            end: penumbralEnd,
        },
        partial:
            partialDuration > 0
                ? {
                      start: partialStart,
                      end: partialEnd,
                  }
                : null,
        total:
            totalDuration > 0
                ? {
                      start: totalStart,
                      end: totalEnd,
                  }
                : null,
    };
}

function determineLunarEclipseVisibleRegions(peakTime) {
    const jd = dateToJulianDay(peakTime);
    const sunPos = getSunPosition(jd);
    let midnightLongitude = (sunPos.longitude + 180) % 360;
    let regions = [];
    const regionRanges = [
        { name: 'North America', west: -140, east: -60 },
        { name: 'South America', west: -80, east: -35 },
        { name: 'Europe', west: -10, east: 40 },
        { name: 'Africa', west: -20, east: 50 },
        { name: 'Western Asia', west: 40, east: 75 },
        { name: 'Central Asia', west: 75, east: 95 },
        { name: 'Eastern Asia', west: 95, east: 145 },
        { name: 'Australia', west: 115, east: 155 },
        { name: 'Pacific Ocean', west: 155, east: -140 },
    ];
    for (const region of regionRanges) {
        const westDiff = Math.abs(((region.west - midnightLongitude + 180) % 360) - 180);
        const eastDiff = Math.abs(((region.east - midnightLongitude + 180) % 360) - 180);
        if (westDiff <= 90 || eastDiff <= 90 || (westDiff > 90 && eastDiff > 90 && westDiff > eastDiff)) regions.push(region.name);
    }
    const month = peakTime.getMonth();
    if (month >= 3 && month <= 8) {
        // Northern spring/summer
        if (!regions.includes('Arctic regions')) regions.push('Antarctic regions');
    } else {
        // Southern spring/summer
        if (!regions.includes('Antarctic regions')) regions.push('Arctic regions');
    }
    if (regions.length === 0) regions = ['Half of Earth (night side during eclipse)'];
    return regions;
}

/**
 * Calculates moon position with medium precision (~1 arcminute accuracy)
 * Based on simplified ELP-2000/82 terms with major perturbations
 * @param {Number} jd - Julian Day
 * @returns {Object} Moon position in ecliptic coordinates
 */
function getMoonPosition(jd) {
    // Time in Julian centuries since J2000.0
    const T = (jd - 2451545.0) / 36525;
    const T2 = T * T;
    const T3 = T2 * T;
    const T4 = T3 * T;
    // Mean elements of lunar orbit
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
    const A1 = 119.75 + 131.849 * T;
    const A2 = 53.09 + 479264.29 * T;
    const A3 = 313.45 + 481266.484 * T;
    // Normalize to [0, 360] range
    const normalizeAngle = (angle) => ((angle % 360) + 360) % 360;
    const L0n = normalizeAngle(L0);
    const Dn = normalizeAngle(D);
    const Mn = normalizeAngle(M);
    const M1n = normalizeAngle(M1);
    const Fn = normalizeAngle(F);
    const A1n = normalizeAngle(A1);
    const A2n = normalizeAngle(A2);
    const A3n = normalizeAngle(A3);
    // Convert to radians for sine/cosine functions
    const d2r = Math.PI / 180;
    const Dr = Dn * d2r;
    const Mr = Mn * d2r;
    const M1r = M1n * d2r;
    const Fr = Fn * d2r;
    const A1r = A1n * d2r;
    const A2r = A2n * d2r;
    const A3r = A3n * d2r;
    // LONGITUDE PERTURBATIONS
    // Primary perturbation terms (ELP2000-82B simplified)
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
    // LATITUDE PERTURBATIONS
    // Primary perturbation terms for latitude (degrees)
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
    // DISTANCE CALCULATION
    // Primary perturbation terms for distance (Earth radii)
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
    // Approximate velocity (degrees per day)
    // This is a simplified calculation - actual velocity varies with orbital position
    const velocity = 13.176396 + 0.001944 * Math.sin(M1r) - 0.000595 * Math.sin(2 * Dr);
    return { longitude, latitude, distance, velocity };
}

/**
 * Calculates sun position with medium precision (~1 arcminute accuracy)
 * Based on simplified VSOP87 terms
 * @param {Number} jd - Julian Day
 * @returns {Object} Sun position in ecliptic coordinates
 */
function getSunPosition(jd) {
    // Time in Julian centuries since J2000.0
    const T = (jd - 2451545.0) / 36525;
    const T2 = T * T;
    const T3 = T2 * T;
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
    const normalizeAngle = (angle) => ((angle % 360) + 360) % 360;
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

function calculateNodeProximity(moonPos, sunPos) {
    let longitudeDiff = Math.abs(moonPos.longitude - sunPos.longitude);
    if (longitudeDiff > 180) longitudeDiff = 360 - longitudeDiff;
    const oppositionError = Math.abs(longitudeDiff - 180);
    return Math.sqrt(Math.pow(moonPos.latitude, 2) + Math.pow(oppositionError, 2));
}
function calculateUmbralDistance(moonPos, sunPos) {
    const shadowRadius = 0.7;
    return calculateNodeProximity(moonPos, sunPos) / shadowRadius;
}
function calculateEclipseMagnitude(umbralDistance) {
    if (umbralDistance < 0.5)
        return 1.0 + ((0.5 - umbralDistance) / 0.5) * 0.5; // Total (1.0-1.5)
    else if (umbralDistance < 1.0)
        return 1.0 - umbralDistance; // Partial (0-1.0)
    else return (1.6 - umbralDistance) / 0.6; // Penumbral (0-1.0)
}
function calculateEclipseDuration(umbralDistance, moonVelocity) {
    let baseDuration = 0;
    if (umbralDistance < 0.5)
        // Total eclipse - typically around 100 minutes total
        baseDuration = 100;
    else if (umbralDistance < 1.0)
        // Partial eclipse - typically around 200 minutes
        baseDuration = 200; // Penumbral eclipse - typically around 240 minutes
    else baseDuration = 240;
    return baseDuration * (13.176396 / moonVelocity);
}
function calculateEclipsePeakTime(date, nodeProximity, moonVelocity) {
    const timeOffset = -nodeProximity / moonVelocity; // in days
    const peakTime = new Date(date);
    peakTime.setTime(date.getTime() + timeOffset * 24 * 60 * 60 * 1000);
    return peakTime;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

/**
 * Calculates solar eclipses using astronomical principles
 * Based on Besselian elements and solar-lunar orbital mechanics
 */
const getSolarEclipse = (date = new Date(), observerLatitude = null, observerLongitude = null, daysWindow = 7) => {
    // Convert input date to Julian Day
    const jd = dateToJulianDay(date);

    // Calculate moon phase - eclipse can only happen at new moon (phase ≈ 0 or 1)
    const moonPhase = getMoonPhase(date);
    const isNearNewMoon = moonPhase >= 0.95 || moonPhase <= 0.05; // Within 5% of new moon
    // Quick rejection: if not near new moon, definitely no eclipse
    if (!isNearNewMoon) return { isEclipse: false };

    // Calculate moon and sun positions with high precision
    const moonPos = getMoonPosition(jd);
    const sunPos = getSunPosition(jd);

    // Calculate angular separation between moon and sun centers as seen from Earth
    // For solar eclipse, they need to be very closely aligned
    const angularSeparation = calculateAngularSeparation(moonPos, sunPos);
    // If separation is too large, no eclipse is possible
    // Sun's angular diameter is about 0.53°, Moon's is about 0.52° (varies with distance)
    if (angularSeparation > 1.0) return { isEclipse: false };

    // Calculate the node proximity (how close the moon is to its orbital node)
    // Solar eclipses happen when new moon occurs near a node of moon's orbit
    const nodeProximity = calculateSolarNodeProximity(moonPos, sunPos);
    // If node proximity is more than 1.5 degrees, no eclipse possible
    if (Math.abs(nodeProximity) > 1.5) return { isEclipse: false };

    // Calculate apparent sizes of sun and moon
    const moonAngularDiameter = 0.5181 * (384400 / moonPos.distance); // In degrees
    const sunAngularDiameter = 0.5333 * (1 / sunPos.distance); // In degrees
    // Calculate eclipse type based on apparent sizes and separation
    const sizeDifference = moonAngularDiameter - sunAngularDiameter;
    const obscuration = calculateObscuration(angularSeparation, moonAngularDiameter, sunAngularDiameter);

    // Determine eclipse type
    let eclipseType = '';
    if (sizeDifference > 0 && angularSeparation < (moonAngularDiameter - sunAngularDiameter) / 2) eclipseType = 'total';
    else if (sizeDifference < 0 && angularSeparation < (sunAngularDiameter - moonAngularDiameter) / 2) eclipseType = 'annular';
    else if (angularSeparation < (moonAngularDiameter + sunAngularDiameter) / 2) eclipseType = 'partial';
    else return { isEclipse: false };

    // Calculate eclipse magnitude and maximum duration
    const magnitude = calculateSolarEclipseMagnitude(angularSeparation, moonAngularDiameter, sunAngularDiameter);
    const duration = calculateSolarEclipseDuration(eclipseType, angularSeparation, moonAngularDiameter, sunAngularDiameter, moonPos.velocity);
    // Calculate peak time (this might differ slightly from the exact new moon time)
    const peakTime = calculateEclipsePeakTime(date, nodeProximity, moonPos.velocity);
    // Determine path of totality/annularity
    const pathData = calculateEclipsePath(eclipseType, jd, moonPos, sunPos);

    // Determine visibility based on observer location (if provided)
    let visibilityForObserver = 'unknown';
    if (observerLatitude !== null && observerLongitude !== null)
        visibilityForObserver = calculateVisibilityForLocation(eclipseType, pathData, observerLatitude, observerLongitude);
    // Generate general visibility regions based on path
    const visibleRegions = determineVisibleRegions(pathData);

    return {
        isEclipse: true,
        type: eclipseType,
        date: peakTime,
        magnitude: magnitude,
        obscuration: obscuration, // Percentage of sun's disk covered
        duration: duration, // Duration in minutes (for total/annular in the path)
        visibleFrom: visibleRegions,
        visibilityAtLocation: visibilityForObserver,
        path: pathData.simplifiedPath,
    };
};

function calculateAngularSeparation(moonPos, sunPos) {
    const moonLonRad = degToRad(moonPos.longitude),
        moonLatRad = degToRad(moonPos.latitude),
        sunLonRad = degToRad(sunPos.longitude),
        sunLatRad = degToRad(sunPos.latitude);
    const cosAngularSeparation = Math.sin(moonLatRad) * Math.sin(sunLatRad) + Math.cos(moonLatRad) * Math.cos(sunLatRad) * Math.cos(moonLonRad - sunLonRad);
    return radToDeg(Math.acos(Math.max(-1, Math.min(1, cosAngularSeparation))));
}
function calculateSolarNodeProximity(moonPos, sunPos) {
    let longitudeDiff = Math.abs(moonPos.longitude - sunPos.longitude);
    if (longitudeDiff > 180) longitudeDiff = 360 - longitudeDiff;
    return Math.sqrt(Math.pow(moonPos.latitude, 2) + Math.pow(longitudeDiff, 2));
}
function calculateSolarEclipseMagnitude(angularSeparation, moonDiameter, sunDiameter) {
    const sumOfRadii = (moonDiameter + sunDiameter) / 2,
        diffOfRadii = Math.abs(moonDiameter - sunDiameter) / 2;
    if (angularSeparation <= diffOfRadii) return moonDiameter / sunDiameter;
    else if (angularSeparation < sumOfRadii) return (sumOfRadii - angularSeparation) / sunDiameter;
    else return 0;
}
function calculateObscuration(angularSeparation, moonDiameter, sunDiameter) {
    const magnitude = calculateSolarEclipseMagnitude(angularSeparation, moonDiameter, sunDiameter);
    return magnitude >= 1.0 ? 1.0 : Math.min(1.0, magnitude * (2 - magnitude));
}
function calculateSolarEclipseDuration(eclipseType, angularSeparation, moonDiameter, sunDiameter, moonVelocity) {
    if (eclipseType === 'total' || eclipseType === 'annular') {
        const centrality = angularSeparation / ((moonDiameter + sunDiameter) / 2 - Math.abs(moonDiameter - sunDiameter) / 2);
        return (eclipseType === 'total' ? 7.5 : 12.5) * (1 - centrality * centrality); // Maximum possible for a perfect total eclipse and Maximum possible for a perfect annular eclipse
    } else return 120; // Approximate duration in minutes
}
function calculateEclipsePath(eclipseType, jd, moonPos, sunPos) {
    let pathType = '';
    let simplifiedPath = [];
    if (eclipseType === 'total' || eclipseType === 'annular') {
        pathType = eclipseType === 'total' ? 'totality' : 'annularity';
        const northernLimit = 30 + moonPos.latitude * 10,
            southernLimit = -10 + moonPos.latitude * 10;
        const centralLongitude = (sunPos.longitude - 180) % 360;
        simplifiedPath = [
            { lat: northernLimit, lon: (centralLongitude - 60) % 360 },
            { lat: (northernLimit + southernLimit) / 2, lon: centralLongitude % 360 },
            { lat: southernLimit, lon: (centralLongitude + 60) % 360 },
        ];
    } else {
        pathType = 'partial';
        simplifiedPath = [
            { lat: 60, lon: (sunPos.longitude - 180 - 90) % 360 },
            { lat: 0, lon: (sunPos.longitude - 180) % 360 },
            { lat: -60, lon: (sunPos.longitude - 180 + 90) % 360 },
        ];
    }
    return {
        pathType: pathType,
        simplifiedPath: simplifiedPath,
    };
}
function calculateVisibilityForLocation(eclipseType, pathData, latitude, longitude) {
    if (eclipseType === 'partial') {
        const distanceToCenter = Math.sqrt(
            Math.pow(latitude - pathData.simplifiedPath[1].lat, 2) + Math.pow(((longitude - pathData.simplifiedPath[1].lon + 180) % 360) - 180, 2)
        );
        if (distanceToCenter < 70) return 'partial visibility';
        else return 'not visible';
    } else {
        const pathLatitude = pathData.simplifiedPath[1].lat,
            pathLongitude = pathData.simplifiedPath[1].lon;
        const distanceToPath = Math.sqrt(Math.pow(latitude - pathLatitude, 2) + Math.pow(((longitude - pathLongitude + 180) % 360) - 180, 2));
        if (distanceToPath < 0.5) return `in path of ${pathData.pathType}`;
        else if (distanceToPath < 70) return 'partial visibility';
        else return 'not visible';
    }
}
function determineVisibleRegions(pathData) {
    const centralLat = pathData.simplifiedPath[1].lat,
        centralLon = pathData.simplifiedPath[1].lon;
    let regions = [];
    if (centralLat > 30) regions.push('Northern regions');
    else if (centralLat < -30) regions.push('Southern regions');
    else regions.push('Equatorial regions');
    if ((centralLon >= -20 && centralLon <= 60) || centralLon >= 330) {
        if (centralLat > 0) regions.push('Europe', 'Western/Central Asia');
        else regions.push('Africa');
    } else if (centralLon >= 60 && centralLon <= 150) {
        if (centralLat > 0) regions.push('Eastern Asia');
        else regions.push('Australia', 'Oceania');
    } else if (centralLon >= 150 && centralLon <= 240) {
        if (centralLat > 0) regions.push('North America');
        else regions.push('Pacific Ocean');
    } else if (centralLon >= 240 && centralLon <= 330) {
        if (centralLat > 0) regions.push('Central America');
        else regions.push('South America');
    }
    if (centralLat > 60) regions.push('Arctic regions');
    else if (centralLat < -60) regions.push('Antarctic regions');
    return regions;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const isNearSolstice = (date = new Date(), hemisphere = 'northern', daysWindow = 7) => {
    const year = date.getFullYear();
    const currentYearSummerSolstice = new Date(year, 5, 21),
        currentYearWinterSolstice = new Date(year, 11, 21); // June 21 / December 21
    const prevYearWinterSolstice = new Date(year - 1, 11, 21),
        nextYearSummerSolstice = new Date(year + 1, 5, 21); // Dec 21 / June 21
    const isNorthern = hemisphere.toLowerCase() === 'northern';
    const currentYearLongestDay = isNorthern ? currentYearSummerSolstice : currentYearWinterSolstice;
    const currentYearShortestDay = isNorthern ? currentYearWinterSolstice : currentYearSummerSolstice;
    const otherYearRelevantSolstice = isNorthern
        ? date.getMonth() < 6
            ? prevYearWinterSolstice
            : nextYearSummerSolstice
        : date.getMonth() < 6
          ? new Date(year - 1, 5, 21)
          : new Date(year + 1, 11, 21);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysToCurrYearLongest = (currentYearLongestDay.getTime() - date.getTime()) / msPerDay,
        daysToCurrYearShortest = (currentYearShortestDay.getTime() - date.getTime()) / msPerDay,
        daysToOtherYearSolstice = (otherYearRelevantSolstice.getTime() - date.getTime()) / msPerDay;
    if (Math.abs(daysToCurrYearLongest) <= daysWindow)
        return { near: true, type: 'longest day', exact: Math.abs(daysToCurrYearLongest) < 1, days: daysToCurrYearLongest };
    else if (Math.abs(daysToCurrYearShortest) <= daysWindow)
        return { near: true, type: 'shortest day', exact: Math.abs(daysToCurrYearShortest) < 1, days: daysToCurrYearShortest };
    else if (Math.abs(daysToOtherYearSolstice) <= daysWindow)
        return {
            near: true,
            type:
                (hemisphere.toLowerCase() === 'northern' && date.getMonth() < 6) || (hemisphere.toLowerCase() === 'southern' && date.getMonth() >= 6)
                    ? 'shortest day'
                    : 'longest day',
            exact: Math.abs(daysToOtherYearSolstice) < 1,
            days: daysToOtherYearSolstice,
        };
    return { near: false };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const isNearEquinox = (date = new Date(), hemisphere = 'northern', daysWindow = 7) => {
    const year = date.getFullYear();
    const springEquinox = new Date(year, 2, 20); // March 20
    const autumnEquinox = new Date(year, 8, 22); // September 22
    const firstEquinox = hemisphere.toLowerCase() === 'northern' ? springEquinox : autumnEquinox;
    const secondEquinox = hemisphere.toLowerCase() === 'northern' ? autumnEquinox : springEquinox;
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysToFirst = (firstEquinox.getTime() - date.getTime()) / msPerDay;
    const daysToSecond = (secondEquinox.getTime() - date.getTime()) / msPerDay;
    const prevYearSecondEquinox = new Date(year - 1, 8, 22);
    const daysToPrevYearSecond = (prevYearSecondEquinox.getTime() - date.getTime()) / msPerDay;
    const nextYearFirstEquinox = new Date(year + 1, 2, 20);
    const daysToNextYearFirst = (nextYearFirstEquinox.getTime() - date.getTime()) / msPerDay;
    if (Math.abs(daysToFirst) <= daysWindow)
        return {
            near: true,
            type: hemisphere.toLowerCase() === 'northern' ? 'spring equinox' : 'autumn equinox',
            exact: Math.abs(daysToFirst) < 1,
            days: daysToFirst, // Negative means equinox has passed, positive means coming up
        };
    else if (Math.abs(daysToSecond) <= daysWindow)
        return {
            near: true,
            type: hemisphere.toLowerCase() === 'northern' ? 'autumn equinox' : 'spring equinox',
            exact: Math.abs(daysToSecond) < 1,
            days: daysToSecond,
        };
    else if (Math.abs(daysToPrevYearSecond) <= daysWindow)
        return {
            near: true,
            type: hemisphere.toLowerCase() === 'northern' ? 'autumn equinox' : 'spring equinox',
            exact: Math.abs(daysToPrevYearSecond) < 1,
            days: daysToPrevYearSecond,
        };
    else if (Math.abs(daysToNextYearFirst) <= daysWindow)
        return {
            near: true,
            type: hemisphere.toLowerCase() === 'northern' ? 'spring equinox' : 'autumn equinox',
            exact: Math.abs(daysToNextYearFirst) < 1,
            days: daysToNextYearFirst,
        };
    return { near: false };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const getCrossQuarterDay = (date = new Date(), hemisphere = 'northern') => {
    const year = date.getFullYear();
    const imbolc = new Date(year, 1, 2); // Feb 2
    const beltane = new Date(year, 4, 1); // May 1
    const lughnasadh = new Date(year, 7, 1); // Aug 1
    const samhain = new Date(year, 10, 1); // Nov 1
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysToImbolc = Math.abs(date.getTime() - imbolc.getTime()) / msPerDay;
    const daysToBeltane = Math.abs(date.getTime() - beltane.getTime()) / msPerDay;
    const daysToLughnasadh = Math.abs(date.getTime() - lughnasadh.getTime()) / msPerDay;
    const daysToSamhain = Math.abs(date.getTime() - samhain.getTime()) / msPerDay;
    const threshold = 3;
    if (daysToImbolc <= threshold) {
        return {
            isCrossQuarter: true,
            name: hemisphere.toLowerCase() === 'northern' ? 'Imbolc (early spring)' : 'Lammas (early autumn)',
            days: daysToImbolc,
        };
    } else if (daysToBeltane <= threshold) {
        return {
            isCrossQuarter: true,
            name: hemisphere.toLowerCase() === 'northern' ? 'Beltane (early summer)' : 'Samhain (early winter)',
            days: daysToBeltane,
        };
    } else if (daysToLughnasadh <= threshold) {
        return {
            isCrossQuarter: true,
            name: hemisphere.toLowerCase() === 'northern' ? 'Lughnasadh (early autumn)' : 'Imbolc (early spring)',
            days: daysToLughnasadh,
        };
    } else if (daysToSamhain <= threshold) {
        return {
            isCrossQuarter: true,
            name: hemisphere.toLowerCase() === 'northern' ? 'Samhain (early winter)' : 'Beltane (early summer)',
            days: daysToSamhain,
        };
    }

    return { isCrossQuarter: false };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const getAuroraPotential = (latitude, month, solarActivity = null) => {
    if (latitude < 55) {
        return { potential: 'very low', visible: false };
    }
    const isDarkSeason = month <= 2 || month >= 9;
    if (latitude >= 65) {
        return {
            potential: isDarkSeason ? 'very high' : 'moderate',
            visible: isDarkSeason,
            bestTime: '22:00-02:00',
        };
    } else if (latitude >= 60) {
        return {
            potential: isDarkSeason ? 'high' : 'low',
            visible: isDarkSeason && solarActivity === 'high',
            bestTime: '23:00-01:00',
        };
    } else {
        return {
            potential: isDarkSeason ? 'moderate' : 'very low',
            visible: isDarkSeason && solarActivity === 'very high',
            bestTime: '00:00-01:00',
        };
    }
};

// -----------------------------------------------------------------------------------------------------------------------------------------

function getWeatherInterpretation(location_data, data) {
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
        cloudCover = null,
        season = getSeason(location_data.hemisphere),
    } = data;

    const dewPoint = calculateDewPoint(temp, humidity);
    const heatIndex = calculateHeatIndex(temp, humidity);
    const windChill = calculateWindChill(temp, windSpeed);
    const feelsLike = calculateFeelsLike(temp, humidity, windSpeed);
    const date = new Date();
    const month = date.getMonth(),
        day = date.getDate(),
        hour = date.getHours();
    const daylight = getDaylightHours(location_data.latitude, location_data.longitude);

    const results = {
        conditions: [],
        phenomena: [],
        comfort: null,
        alerts: [],
        details: null,
        feelsLike,
    };

    // Atmospheric pressure conditions - Nordic context
    if (pressure !== null) {
        const elevationAdjustment = Math.exp(location_data.elevation / (29.3 * (temp + 273))); // Adjust pressure for elevation (approximately 150m)
        const adjustedPressure = pressure * elevationAdjustment;
        if (adjustedPressure < 970) {
            results.conditions.push('severe storm conditions');
            results.alerts.push('dangerously low pressure');
        } else if (adjustedPressure < 990) results.conditions.push('stormy');
        else if (adjustedPressure < 1000) results.conditions.push('unsettled');
        else if (adjustedPressure >= 1000 && adjustedPressure <= 1015);
        else if (adjustedPressure > 1015 && adjustedPressure <= 1025)
            // Normal pressure range - no specific condition
            results.conditions.push('settled');
        else if (adjustedPressure > 1025) results.conditions.push('stable high pressure');
        if (month >= 9 && month <= 3) {
            // Nordic-specific pressure context - Fall through early spring
            if (adjustedPressure > 1020)
                results.phenomena.push('clear winter conditions likely'); // High pressure in winter often brings very cold conditions
            else if (adjustedPressure < 990 && temp > 0) results.phenomena.push('winter rain likely'); // Low pressure in winter with temps above freezing often brings rain
        }
    }

    // Temperature conditions - adjusted for Swedish climate where cold is more common and heat more exceptional
    if (temp !== null) {
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
        if (month >= 11 || month <= 2) {
            // Season-specific temperature context for Sweden
            if (temp > 5) results.phenomena.push('unseasonably warm for winter');
            else if (temp < -20) results.phenomena.push('extreme Nordic winter conditions');
        } else if (month >= 6 && month <= 8) {
            if (temp > 25) results.phenomena.push('unusually hot for this region');
            else if (temp < 10) results.phenomena.push('unseasonably cool for summer');
        }
    }

    // Humidity conditions
    if (humidity !== null) {
        if (humidity > 90) results.conditions.push('very humid');
        else if (humidity > 70) results.conditions.push('humid');
        else if (humidity >= 30 && humidity <= 60);
        else if (humidity < 30) {
            // Comfortable humidity range - no specific condition
            results.conditions.push('dry');
            if (humidity < 15) results.conditions.push('extremely dry');
        }
    }

    // Wind conditions - using Beaufort scale as reference
    if (windSpeed !== null) {
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
    if (cloudCover !== null) {
        if (cloudCover < 10) results.conditions.push('clear sky');
        else if (cloudCover < 30) results.conditions.push('mostly clear');
        else if (cloudCover < 70) results.conditions.push('partly cloudy');
        else if (cloudCover < 90) results.conditions.push('mostly cloudy');
        else results.conditions.push('overcast');
    }

    // Precipitation conditions
    if (rainRate !== null) {
        if (rainRate > 0 && rainRate < 0.5) results.conditions.push('light rain');
        else if (rainRate >= 0.5 && rainRate < 4) results.conditions.push('moderate rain');
        else if (rainRate >= 4 && rainRate < 8) results.conditions.push('heavy rain');
        else if (rainRate >= 8) {
            results.conditions.push('very heavy rain');
            results.alerts.push('heavy rainfall');
        }
    }

    // Solar radiation and UV conditions
    if (solarRad !== null || solarUvi !== null) {
        if (solarRad > 800) results.conditions.push('intense sunlight');
        else if (solarRad > 500) results.conditions.push('strong sunlight');
        if (solarUvi !== null) {
            if (solarUvi >= 11) {
                results.conditions.push('extreme UV');
                results.alerts.push('extreme UV');
            } else if (solarUvi >= 8) {
                results.conditions.push('very high UV');
                results.alerts.push('very high UV');
            } else if (solarUvi >= 6) results.conditions.push('high UV');
            else if (solarUvi >= 3) results.conditions.push('moderate UV');
        }
    }

    // Snow and Ice Depth Interpretation
    if (snowDepth !== null) {
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
        if (month === 10 && snowDepth > 0)
            // Season-specific snow interpretations
            results.phenomena.push('early season snow');
        else if (month === 4 && snowDepth > 100) results.phenomena.push('late season persistent snow pack');
        else if (month >= 5 && month <= 8 && snowDepth > 0) results.phenomena.push('unusual summer snow');
        if (snowDepth > 30) {
            // Snow quality based on temperature
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
    if (iceDepth !== null) {
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
        if (month === 10 && iceDepth > 0)
            // Season-specific ice interpretations
            results.phenomena.push('early lake ice formation');
        else if (month === 4 && iceDepth > 100) results.phenomena.push('late season persistent ice');
        else if (month >= 5 && month <= 9 && iceDepth > 0) results.phenomena.push('unusual season ice');
        if (iceDepth > 0) {
            // Ice safety and quality based on temperature and thickness
            if (temp > 0 && iceDepth < 150) results.alerts.push('weakening ice conditions');
            if (iceDepth < 50) results.alerts.push('thin ice hazard');
            else if (iceDepth >= 50 && iceDepth < 100) results.phenomena.push('ice may support single person');
            else if (iceDepth >= 100 && iceDepth < 200) results.phenomena.push('ice supports group activity');
            else if (iceDepth >= 200) results.phenomena.push('ice supports vehicle weight');
        }
        if (snowDepth > 100 && iceDepth > 100)
            // Combined snow and ice effects
            results.phenomena.push('typical Nordic winter conditions');
    }

    // Radiation Interpretation: prefer ACPM (rolling average) but fall back to CPM if needed
    const radiationValue = radiationAcpm !== null ? radiationAcpm : radiationCpm;
    const radiationSource = radiationAcpm !== null ? 'average' : 'instant';
    if (radiationValue !== null) {
        // Interpret radiation levels based on available readings
        if (radiationValue <= 30) {
            // Background radiation in Sweden normally ranges from 5-30 CPM
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
            // Context-specific radiation interpretations
            if (rainRate > 0) results.phenomena.push('possible radon washout in precipitation');
            if (month >= 9 || month <= 3) results.phenomena.push('seasonal radon fluctuation possible');
        }
        if (radiationValue > 50 && solarUvi > 5)
            // Radiation health context
            results.phenomena.push('combined radiation and UV exposure');
        // Add µSv/h context if available
        if (radationUsvh !== null) {
            if (radationUsvh > 0.5) results.alerts.push(`radiation dose rate: ${radationUsvh.toFixed(2)} µSv/h`);
            // Additional health context based on dose rate
            if (radationUsvh > 0.3 && radationUsvh <= 1) {
                results.phenomena.push('above typical background dose rate');
            } else if (radationUsvh > 1 && radationUsvh <= 5) {
                results.phenomena.push('elevated dose rate - limit prolonged exposure');
            } else if (radationUsvh > 5) {
                results.phenomena.push('significant dose rate - health concern');
            }
        }
    }

    // Weather phenomena interpretations - Nordic forest context
    if (temp !== null && humidity !== null) {
        if (temp < 0 && humidity > 70) {
            // Snow conditions - common in this region
            if (rainRate > 0) {
                if (temp < -10) results.phenomena.push('light powder snow likely');
                else results.phenomena.push('snow likely');
            } else if (temp < -2) results.phenomena.push('frost likely');
        }
        if ((temp < 0 || snowDepth > 0) && cloudCover > 70 && month >= 10 && month <= 3) {
            // XXX
            // Forest-specific snow conditions
            results.phenomena.push('snow accumulation on trees possible');
            if (windSpeed > 5) results.alerts.push('risk of snow-laden branches');
        }
        if (temp < 2 && temp > -8 && rainRate > 0) {
            // Freezing rain conditions
            results.phenomena.push('freezing rain possible');
            results.alerts.push('forest ice hazard');
        }
        if (temp > 20 && humidity > 75)
            // Nordic summer humidity feels different - adjust muggy threshold
            results.phenomena.push('humid for Nordic climate');
        if (Math.abs(temp - dewPoint) < 3 && temp > 0) {
            // Fog conditions - common in forested areas near lakes
            if (hour < 10 || hour > 18) results.phenomena.push('forest fog likely');
            else results.phenomena.push('fog likely');
        }
        if (month >= 5 && month <= 8 && temp > 22 && humidity < 40 && rainRate === 0) {
            // Forest-specific fire risk in dry conditions (rare but possible in summer)
            results.phenomena.push('dry forest conditions');
            if (humidity < 30 && temp > 25) results.alerts.push('forest fire risk');
        }
    }

    // Precipitation predictions based on pressure and humidity
    if (pressure !== null && humidity !== null) {
        if (pressure < 1000 && humidity > 75) results.phenomena.push('rain likely');
        else if (pressure > 1020 && humidity < 40) results.phenomena.push('clear and dry');
    }

    // Wind chill effect
    if (temp !== null && windSpeed !== null) {
        if (temp < 10 && windSpeed > 3) {
            const windChillDiff = Math.round(temp - windChill);
            if (windChillDiff >= 3) results.phenomena.push(`feels ${windChillDiff}°C colder due to wind`);
        }
    }

    // Heat index effect
    if (temp !== null && humidity !== null) {
        if (temp > 20 && humidity > 60) {
            const heatIndexDiff = Math.round(heatIndex - temp);
            if (heatIndexDiff >= 3) results.phenomena.push(`feels ${heatIndexDiff}°C warmer due to humidity`);
        }
    }

    // Time of day specific phenomena - Nordic daylight considerations with precise calculations
    if (temp !== null) {
        if (month >= 5 && month <= 7) {
            // Summer months with very long days
            if (daylight.isDaytime && hour > 20) results.phenomena.push('extended Nordic summer evening light');
            if (daylight.sunriseDecimal < 4.5 && hour < 7)
                // Show precise sunrise time for very early summer mornings
                results.phenomena.push(`early sunrise`);
            if (!daylight.isDaytime && hour > Math.floor(daylight.sunsetDecimal) && hour < Math.floor(daylight.sunsetDecimal) + 2)
                // Add twilight information when relevant
                results.phenomena.push('lingering twilight');
        } else if (month >= 11 || month <= 1) {
            // Winter with very short days
            if (!daylight.isDaytime && hour >= 15 && hour < 17)
                // Precise winter darkness timing
                results.phenomena.push(`early winter darkness`);
            if (daylight.daylightHours < 7)
                // Very short day warning
                results.phenomena.push(`short winter day (${Math.round(daylight.daylightHours)} hours of daylight)`);
            if (daylight.isDaytime && temp < -5)
                // Cold daylight
                results.phenomena.push('cold winter daylight');
        }
        const currentHourDecimal = hour + new Date().getMinutes() / 60; // Civil twilight phenomena
        if (!daylight.isDaytime && currentHourDecimal >= daylight.sunsetDecimal && currentHourDecimal <= daylight.civilDuskDecimal)
            results.phenomena.push('civil twilight');
        if (temp < 3 && hour > Math.floor(daylight.sunriseDecimal) && hour < Math.floor(daylight.sunriseDecimal) + 3)
            // Standard time patterns adjusted for Nordic climate
            results.phenomena.push('morning chill');
        if (temp > 22 && hour > 12 && hour < 16) results.phenomena.push('afternoon warmth');
        if (windSpeed > 5 && location_data.forestCoverage === 'high')
            // Forest-specific phenomena
            results.phenomena.push('forest wind effect');
    }

    // Season-specific interpretations for Nordic region
    if (season && temp !== null) {
        switch (season.toLowerCase()) {
            case 'winter':
                if (temp > 5) results.phenomena.push('unusually mild winter day');
                if (temp < -20) results.phenomena.push('severe Nordic winter conditions');
                if (daylight.daylightHours < 7)
                    // Winter darkness phenomenon
                    results.phenomena.push('short winter day');
                break;
            case 'summer':
                if (temp < 12) results.phenomena.push('cool summer day');
                if (temp > 25) results.phenomena.push('hot Nordic summer day');
                if (daylight.daylightHours > 18)
                    // Midnight sun approximation (not quite at this latitude but still very bright evenings)
                    results.phenomena.push('extended Nordic summer daylight');
                break;
            case 'spring':
                if (month === 3 && temp > 10) results.phenomena.push('early spring warmth');
                if (month === 4 && rainRate > 0 && temp > 5) results.phenomena.push('spring forest rain');
                break;
            case 'autumn':
                if (month === 9 && temp < 5) results.phenomena.push('early autumn chill');
                if (month === 10 && rainRate > 0 && temp < 10) results.phenomena.push('cold autumn rain');
                break;
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
            if (daylight.daylightHours > 16) results.phenomena.push('extended daylight');
            if (isHighLatitude) {
                // && cloudCover !== null && cloudCover < 50) { // XXX
                results.phenomena.push('near-midnight sun');
                if (location_data.latitude > 66) results.phenomena.push('true midnight sun (sun never sets)');
                else if (location_data.latitude > 60) results.phenomena.push('bright nights (civil twilight all night)');
            }
            if (moonPhase >= 0.48 && moonPhase <= 0.52)
                // && cloudCover !== null && cloudCover < 40) // XXX
                results.phenomena.push('solstice full moon (rare)'), (moonPhaseReported = true);
        } else if (solsticeInfo.type === 'shortest day') {
            if (daylight.daylightHours < 8) results.phenomena.push('brief daylight');
            if (isHighLatitude) {
                results.phenomena.push('extended darkness');
                if (location_data.latitude > 66.5) results.phenomena.push('polar night (sun never rises)');
                else if (location_data.latitude > 60) results.phenomena.push('very short days (less than 6 hours of daylight)');
                else if (location_data.latitude > 59) results.phenomena.push('short days (approx 6 hours of daylight)');
            }
            if (moonPhase >= 0.48 && moonPhase <= 0.52)
                // && cloudCover !== null && cloudCover < 40) // XXX
                results.phenomena.push('winter solstice full moon (special illumination)'), (moonPhaseReported = true);
        }
    }

    // Moon phase interpretation
    if (!moonPhaseReported && moonPhase >= 0.48 && moonPhase <= 0.52) {
        // Full moon (within 4% of exact full)
        results.phenomena.push('full moon tonight');
        if (cloudCover !== null && cloudCover < 40) results.phenomena.push('good visibility for night activities');
        if ((temp < 0 || snowDepth > 0) && cloudCover !== null && cloudCover < 30)
            // XXX
            results.phenomena.push('enhanced snow reflection in moonlight');
    } else if (moonPhase >= 0.98 || moonPhase <= 0.02) {
        // New moon (within 2% of new)
        results.phenomena.push('new moon tonight');
        if (location_data.lightPollution === 'low' && cloudCover !== null && cloudCover < 30)
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

    const lunarEclipseInfo = getLunarEclipse(date, location_data.latitude, location_data.longitude, 28);
    if (lunarEclipseInfo.isEclipse) {
        results.phenomena.push(`${lunarEclipseInfo.type} lunar eclipse today`);
        if (lunarEclipseInfo.type === 'total' || lunarEclipseInfo.magnitude > 0.6)
            results.phenomena.push(`(significant magnitude: ${lunarEclipseInfo.magnitude.toFixed(2)})`);
        if (lunarEclipseInfo.localVisibility) {
            if (lunarEclipseInfo.localVisibility.visible) {
                if (lunarEclipseInfo.localVisibility.localCircumstances?.visibilityDescription)
                    results.phenomena.push(lunarEclipseInfo.localVisibility.localCircumstances.visibilityDescription);
                if (lunarEclipseInfo.localVisibility.bestViewingTime) {
                    const bestTime = lunarEclipseInfo.localVisibility.bestViewingTime;
                    results.phenomena.push(`best viewing at ${bestTime.getHours()}:${String(bestTime.getMinutes()).padStart(2, '0')}`);
                }
                if (cloudCover !== null && cloudCover < 30) results.phenomena.push('excellent viewing conditions for lunar eclipse');
                else if (cloudCover !== null && cloudCover < 60) results.phenomena.push('fair viewing conditions for lunar eclipse');
                else if (cloudCover !== null) results.phenomena.push('poor viewing conditions for lunar eclipse');
            } else results.phenomena.push('lunar eclipse not visible from this location');
        }
        if (lunarEclipseInfo.type === 'total' && lunarEclipseInfo.magnitude > 1.2) results.alerts.push('rare deep total lunar eclipse');
    }

    const solarEclipseInfo = getSolarEclipse(date, location_data.latitude, location_data.longitude, 28);
    if (solarEclipseInfo.isEclipse) {
        results.phenomena.push(`${solarEclipseInfo.type} solar eclipse today`);
        if (solarEclipseInfo.magnitude) results.phenomena.push(`(magnitude: ${solarEclipseInfo.magnitude.toFixed(2)})`);
        if (solarEclipseInfo.obscuration) results.phenomena.push(`${Math.round(solarEclipseInfo.obscuration * 100)}% of sun's disk covered`);
        if (solarEclipseInfo.visibilityAtLocation) {
            if (solarEclipseInfo.visibilityAtLocation === 'in path of totality') {
                results.phenomena.push('total solar eclipse visible from this location');
                results.alerts.push('rare total solar eclipse today');
            } else if (solarEclipseInfo.visibilityAtLocation === 'in path of annularity') {
                results.phenomena.push('annular "ring of fire" eclipse visible from this location');
                results.alerts.push('annular solar eclipse today');
            } else if (solarEclipseInfo.visibilityAtLocation === 'partial visibility')
                results.phenomena.push('partial solar eclipse visible from this location');
            else results.phenomena.push('solar eclipse not visible from this location');
        }
        if (
            (solarEclipseInfo.type === 'total' || solarEclipseInfo.type === 'annular') &&
            solarEclipseInfo.duration &&
            solarEclipseInfo.visibilityAtLocation &&
            solarEclipseInfo.visibilityAtLocation.includes('in path')
        ) {
            const durationMinutes = Math.floor(solarEclipseInfo.duration),
                durationSeconds = Math.round((solarEclipseInfo.duration - durationMinutes) * 60);
            results.phenomena.push(`eclipse duration: ${durationMinutes}m ${durationSeconds}s`);
        }
        if (cloudCover !== null && cloudCover < 20) results.phenomena.push('excellent viewing conditions for solar eclipse');
        else if (cloudCover !== null && cloudCover < 50) results.phenomena.push('fair viewing conditions for solar eclipse');
        else if (cloudCover !== null) results.phenomena.push('poor viewing conditions for solar eclipse');
        if (solarEclipseInfo.visibilityAtLocation && solarEclipseInfo.visibilityAtLocation !== 'not visible')
            results.alerts.push('use proper eye protection for solar eclipse viewing');
    }

    const auroraPotential = getAuroraPotential(location_data.latitude, date.getMonth(), null); // replace null with actual solar activity if available
    if (auroraPotential.potential !== 'very low') {
        if (auroraPotential.visible)
            results.phenomena.push(
                `aurora borealis likely visible (best time: ${auroraPotential.bestTime}${cloudCover !== null && cloudCover < 30 && moonPhase < 0.3 ? ', with good visbility' : ''})`
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
    let heatIndexF = 0.5 * (tempF + 61.0 + (tempF - 68.0) * 1.2 + rh * 0.094); // Simplified heat index formula
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
            heatIndexF -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
        else if (rh > 85 && tempF >= 80 && tempF <= 87) heatIndexF += ((rh - 85) / 10) * ((87 - tempF) / 5);
    }
    return ((heatIndexF - 32) * 5) / 9; // Convert back to Celsius
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const calculateWindChill = (temp, windSpeed) => {
    if (temp > 10 || windSpeed <= 1.3) return temp; // Only applicable for temps <= 10°C and wind > 1.3 m/s
    const windSpeedKmh = windSpeed * 3.6; // Convert wind speed to km/h
    return 13.12 + 0.6215 * temp - 11.37 * Math.pow(windSpeedKmh, 0.16) + 0.3965 * temp * Math.pow(windSpeedKmh, 0.16); // Calculate wind chill using Environment Canada formula
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

const getSeason = (hemisphere = 'northern') => {
    // Nordic season adjustment - spring comes later, winter comes earlier
    const month = new Date().getMonth();
    if (hemisphere.toLowerCase() === 'northern') {
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        if (month >= 9 && month <= 10) return 'autumn';
        return 'winter'; // Months 11, 0, 1, 2 (Nov-Feb)
    } else {
        if (month >= 3 && month <= 5) return 'autumn';
        if (month >= 6 && month <= 8) return 'winter';
        if (month >= 9 && month <= 10) return 'spring';
        return 'summer';
    }
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const getDST = (date) => {
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
};

// -----------------------------------------------------------------------------------------------------------------------------------------

const getDaylightHours = (latitude, longitude, date = new Date()) => {
    const normalizeTime = (time) => (time < 0 ? time + 24 : time >= 24 ? time - 24 : time);
    const isLeapYear = (date.getFullYear() % 4 === 0 && date.getFullYear() % 100 !== 0) || date.getFullYear() % 400 === 0;
    let dayOfYear = date.getDate();
    for (let i = 0; i < date.getMonth(); i++) dayOfYear += [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i];
    const latRad = (latitude * Math.PI) / 180;
    const fracYear = ((2 * Math.PI) / (isLeapYear ? 366 : 365)) * (dayOfYear - 1 + (date.getHours() - 12) / 24);
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
    const cosHourAngle = (Math.cos((90.8333 * Math.PI) / 180) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));
    const hourAngle = cosHourAngle >= -1 && cosHourAngle <= 1 ? (Math.acos(cosHourAngle) * 180) / Math.PI / 15 : 0;
    const cosCivilHourAngle = (Math.cos((96 * Math.PI) / 180) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination)); // 90 + 6 degrees
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
};

// -----------------------------------------------------------------------------------------------------------------------------------------

function isNumber(inputVal) {
    var oneDecimal = false,
        inputStr = '' + inputVal;
    for (var i = 0; i < inputStr.length; i++) {
        const oneChar = inputStr.charAt(i);
        if (i === 0 && (oneChar === '-' || oneChar === '+')) continue;
        if (oneChar === '.' && !oneDecimal) {
            oneDecimal = true;
            continue;
        }
        if (oneChar < '0' || oneChar > '9') return false;
    }
    return true;
}
function formatDate(date, minutes) {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, minutes, (minutes - Math.floor(minutes)) * 60));
}

function __jdToYMD(jd) {
    assert(!(jd < 900000 || jd > 2817000));
    const z = Math.floor(jd + 0.5),
        f = jd + 0.5 - z;
    const A = z < 2299161 ? z : z + 1 + Math.floor((z - 1867216.25) / 36524.25) - Math.floor(Math.floor((z - 1867216.25) / 36524.25) / 4),
        B = A + 1524,
        C = Math.floor((B - 122.1) / 365.25),
        D = Math.floor(365.25 * C),
        E = Math.floor((B - D) / 30.6001);
    return { day: B - D - Math.floor(30.6001 * E) + f, month: E < 14 ? E - 1 : E - 13, year: (E < 14 ? E - 1 : E - 13) > 2 ? C - 4716 : C - 4715 };
}
function __jdFromYMD(ymd) {
    return (
        Math.floor(365.25 * (ymd.year + 4716)) +
        Math.floor(30.6001 * (ymd.month + 1)) +
        ymd.day +
        (2 - Math.floor(ymd.year / 100) + Math.floor(Math.floor(ymd.year / 100) / 4)) -
        1524.5
    );
}
function __jdFromDate(date) {
    return __jdFromYMD({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}
function __jdToDate(jd) {
    const ymd = __jdToYMD(jd);
    return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0));
}
function __jdToDoy(jd) {
    const isLeapYear = (yr) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
    const ymd = __jdToYMD(jd);
    return Math.floor((275 * ymd.month) / 9) - (isLeapYear(ymd.year) ? 1 : 2) * Math.floor((ymd.month + 9) / 12) + ymd.day - 30;
}
function __jdTimeCentury(jd) {
    return (jd - 2451545) / 36525;
}

function calcGeomMeanLongSun(t) {
    return (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360; // in degrees
}
function calcGeomMeanAnomalySun(t) {
    return 357.52911 + t * (35999.05029 - 0.0001537 * t); // in degrees
}
function calcEccentricityEarthOrbit(t) {
    return 0.016708634 - t * (0.000042037 + 0.0000001267 * t); // unitless
}
function calcSunEqOfCenter(t) {
    const mrad = degToRad(calcGeomMeanAnomalySun(t));
    return Math.sin(mrad) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * mrad) * (0.019993 - 0.000101 * t) + Math.sin(3 * mrad) * 0.000289; // in degrees
}
function calcSunTrueLong(t) {
    return calcGeomMeanLongSun(t) + calcSunEqOfCenter(t); // in degrees
}
function calcSunApparentLong(t) {
    return calcSunTrueLong(t) - 0.00569 - 0.00478 * Math.sin(degToRad(125.04 - 1934.136 * t)); // in degrees
}
function calcMeanObliquityOfEcliptic(t) {
    return 23.0 + (26.0 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60; // in degrees
}
function calcObliquityCorrection(t) {
    return calcMeanObliquityOfEcliptic(t) + 0.00256 * Math.cos(degToRad(125.04 - 1934.136 * t)); // in degrees
}
function calcSunDeclination(t) {
    return radToDeg(Math.asin(Math.sin(degToRad(calcObliquityCorrection(t))) * Math.sin(degToRad(calcSunApparentLong(t))))); // in degrees
}
function calcEquationOfTime(t) {
    const l0Rad = degToRad(calcGeomMeanLongSun(t)),
        e = calcEccentricityEarthOrbit(t),
        mRad = degToRad(calcGeomMeanAnomalySun(t)),
        y = Math.pow(Math.tan(degToRad(calcObliquityCorrection(t)) / 2), 2);
    const sin2l0 = Math.sin(2 * l0Rad),
        sinm = Math.sin(mRad),
        cos2l0 = Math.cos(2 * l0Rad),
        sin4l0 = Math.sin(4 * l0Rad),
        sin2m = Math.sin(2 * mRad);
    return radToDeg(y * sin2l0 - 2 * e * sinm + 4 * e * y * sinm * cos2l0 - 0.5 * y * y * sin4l0 - 1.25 * e * e * sin2m) * 4; // in minutes of time
}
function calcHourAngle(angle, lat, solarDec) {
    const latRad = degToRad(lat),
        sdRad = degToRad(solarDec);
    return Math.acos(Math.cos(degToRad(90 + angle)) / (Math.cos(latRad) * Math.cos(sdRad)) - Math.tan(latRad) * Math.tan(sdRad)); // in radians (for sunset, use -HA)
}
function calcSolNoon(jd, longitude, date) {
    const solNoonOffset = 720 - longitude * 4 - calcEquationOfTime(__jdTimeCentury(jd - longitude / 360)),
        solNoonLocal = 720 - longitude * 4 - calcEquationOfTime(__jdTimeCentury(jd + solNoonOffset / 1440)); // in minutes
    return formatDate(date, ((solNoonLocal % 1440) + 1440) % 1440);
}
function calcSunriseSetUTC(rise, angle, JD, latitude, longitude) {
    const t = __jdTimeCentury(JD);
    return 720 - 4 * (longitude + radToDeg(calcHourAngle(angle, latitude, calcSunDeclination(t)) * (rise ? 1 : -1))) - calcEquationOfTime(t); // in minutes
}
function calcJDofNextPrevRiseSet(next, rise, type, JD, latitude, longitude) {
    var jday = JD,
        time = calcSunriseSetUTC(rise, type, jday, latitude, longitude);
    while (!isNumber(time)) {
        jday += next ? 1 : -1;
        time = calcSunriseSetUTC(rise, type, jday, latitude, longitude);
    }
    return jday;
}
function calcSunriseSet(rise, angle, JD, date, latitude, longitude) {
    // rise = 1 for sunrise, 0 for sunset
    const newTimeUTC = calcSunriseSetUTC(rise, angle, JD + calcSunriseSetUTC(rise, angle, JD, latitude, longitude) / 1440, latitude, longitude);
    if (isNumber(newTimeUTC)) return formatDate(date, newTimeUTC);
    const doy = __jdToDoy(JD),
        next = (latitude > 66.4 && doy > 79 && doy < 267) || (latitude < -66.4 && (doy < 83 || doy > 263)) ? !rise : rise; // no sunrise/set found
    return __jdToDate(calcJDofNextPrevRiseSet(next, rise, angle, JD, latitude, longitude)); //previous sunrise/next sunset OR previous sunset/next sunrise
}

const degreesBelowHorizon = {
    sunrise: 0.833,
    sunriseEnd: 0.3,
    twilight: 6,
    nauticalTwilight: 12,
    night: 18,
    goldenHour: -6,
};

class SolarCalc {
    constructor(date, latitude, longitude) {
        this.date = date;
        this.latitude = latitude;
        this.longitude = longitude;
        this.julianDate = __jdFromDate(date);
    }
    timeAtAngle(angle, rising) {
        return calcSunriseSet(rising, angle, this.julianDate, this.date, this.latitude, this.longitude);
    }
    get solarNoon() {
        return calcSolNoon(this.julianDate, this.longitude, this.date);
    }
    get sunrise() {
        return this.timeAtAngle(degreesBelowHorizon.sunrise, true);
    }
    get sunset() {
        return this.timeAtAngle(degreesBelowHorizon.sunrise);
    }
    get sunriseEnd() {
        return this.timeAtAngle(degreesBelowHorizon.sunriseEnd, true);
    }
    get sunsetStart() {
        return this.timeAtAngle(degreesBelowHorizon.sunriseEnd, false);
    }
    get civilDawn() {
        return this.timeAtAngle(degreesBelowHorizon.twilight, true);
    }
    get civilDusk() {
        return this.timeAtAngle(degreesBelowHorizon.twilight, false);
    }
    get nauticalDawn() {
        return this.timeAtAngle(degreesBelowHorizon.nauticalTwilight, true);
    }
    get nauticalDusk() {
        return this.timeAtAngle(degreesBelowHorizon.nauticalTwilight, false);
    }
    get astronomicalDusk() {
        return this.timeAtAngle(degreesBelowHorizon.night, false);
    }
    get astronomicalDawn() {
        return this.timeAtAngle(degreesBelowHorizon.night, true);
    }
    get goldenHourStart() {
        return this.timeAtAngle(degreesBelowHorizon.goldenHour, false);
    }
    get goldenHourEnd() {
        return this.timeAtAngle(degreesBelowHorizon.goldenHour, true);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
