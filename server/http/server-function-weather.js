// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const options = {};
const helpers = require('./server-function-weather-helpers.js');
const interpreters = {
    ...require('./server-function-weather-conditions.js')(options),
    ...require('./server-function-weather-calendar.js')(options),
    ...require('./server-function-weather-astronomy.js')(options),
    ...require('./server-function-weather-eclipses.js')(options),
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

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
function __jdToDoy(jd) {
    const ymd = __jdToYMD(jd);
    return Math.floor((275 * ymd.month) / 9) - (isLeapYear(ymd.year) ? 1 : 2) * Math.floor((ymd.month + 9) / 12) + ymd.day - 30;
}
function __jdTimeCentury(jd) {
    return (jd - 2451545) / 36525;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

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
        if (distanceToPath < 0.5) return `in path of ${pathData.pathType}`;
        return distanceToPath < 70 ? 'partial visibility' : 'not visible';
    }
}
function solarEclipseVisibilityRegions(pathData) {
    let [, { latitude, longitude }] = pathData.simplifiedPath;
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
    const moonPhase = helpers.getLunarPhase(date);
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

function interpretEclipses(results, situation, data, _data_previous, _store, _options) {
    const { cloudCover } = data;
    const { location, date } = situation;

    const solarEclipseInfo = getSolarEclipse(date, location.latitude, location.longitude, 14);
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
}
interpreters.interpretEclipses = interpretEclipses;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function joinand(items) {
    if (!items || items.length === 0) return '';
    else if (items.length === 1) return items[0];
    else if (items.length === 2) return `${items[0]} and ${items[1]}`;
    const lastItem = items.pop();
    return `${items.join(', ')}, and ${lastItem}`;
}
function __weatherDetails(results) {
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

function __weatherSituation(location, data) {
    const { temp, humidity, windSpeed, solarRad } = data;
    const date = new Date();
    return {
        location,
        date,
        minute: date.getMinutes(),
        hour: date.getHours(),
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
        season: helpers.getSeason(location.hemisphere),
        daylight: helpers.getDaylightHours(location.latitude, location.longitude),
        dewPoint: helpers.calculateDewPoint(temp, humidity),
        windChill: helpers.calculateWindChill(temp, windSpeed),
        heatIndex: helpers.calculateHeatIndex(temp, humidity),
        feelsLike: helpers.calculateFeelsLike(temp, humidity, windSpeed),
        comfort: helpers.calculateComfortLevel(temp, humidity, windSpeed, solarRad),
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getWeatherInterpretationImpl(location, data, data_previous, store, options) {
    const situation = __weatherSituation(location, data);
    const results = { conditions: [], phenomena: [], alerts: [] };
    Object.entries(interpreters).forEach(([name, func]) => {
        try {
            func(results, situation, data, data_previous, store, options);
        } catch (e) {
            console.error(`weather: interpreter '${name}' error:`, e);
        }
    });
    results.feelsLike = situation.feelsLike;
    results.comfort = situation.comfort;
    results.details = __weatherDetails(results);
    return results;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const weatherCache = {},
    weatherStore = {};
const CACHE_DURATION = (24 + 1) * 60 * 60 * 1000; // 25 hours, for now
let lastPrunned = Date.now();
const PRUNE_INTERVAL = 5 * 60 * 1000;

function getWeatherInterpretation(location_data, data, options = {}) {
    // XXX should suppress minor updates to singular variables, or something like that
    // XXX the ants pants solution is that each interpret specifies which variables it works from and is only called when that variable changes
    // XXX we need to persist the cache and reload it ... maybe also the store ...
    const cacheExpiration = data.timestamp - CACHE_DURATION;
    if (lastPrunned + PRUNE_INTERVAL < Date.now()) {
        Object.keys(weatherCache)
            .filter((timestamp) => timestamp < cacheExpiration)
            .forEach((timestamp) => delete weatherCache[timestamp]);
        lastPrunned = Date.now();
    }
    weatherCache[data.timestamp] = data;
    return getWeatherInterpretationImpl(location_data, data, weatherCache, weatherStore, options);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (_options = {}) {
    return { getWeatherInterpretation };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
