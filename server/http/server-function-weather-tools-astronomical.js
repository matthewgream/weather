// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const { constants, isLeapYear, daysIntoYear, normalizeTime, getDST, dateToJulianDateUTC, julianDateToDateUTC, normalizeAngle, cardinalDirection } = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const constantsLunar = {
    LUNAR_CYCLE_DAYS: 29.53059,
    LUNAR_MEAN_DISTANCE_KM: 384400,
    ASTRONOMICAL_UNIT_KM: 149597870.7,
    SOLAR_RADIUS_KM: 696000,
    SOLAR_ANGULAR_DIAMETER_BASE: 0.533128,
    EARTH_RADIUS_KM: 6371,
    LUNAR_RADIUS_KM: 1737.4,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getDaylightPhase(hourDecimal, daylight) {
    if (daylight.isDaytime) return 'day';
    if (daylight.isMidnightSun) return 'midnight_sun';
    if (daylight.isPolarNight) return 'polar_night';
    if (daylight.astronomicalDawnDecimal === null || daylight.astronomicalDuskDecimal === null || daylight.astronomicalDawnDecimal === undefined || daylight.astronomicalDuskDecimal === undefined) return 'white_night';
    const phases = [
        { start: daylight.astronomicalDawnDecimal, end: daylight.nauticalDawnDecimal, phase: 'astronomical_dawn' },
        { start: daylight.nauticalDawnDecimal, end: daylight.civilDawnDecimal, phase: 'nautical_dawn' },
        { start: daylight.civilDawnDecimal, end: daylight.sunriseDecimal - 0.001, phase: 'civil_dawn' },
        { start: daylight.sunsetDecimal, end: daylight.civilDuskDecimal, phase: 'civil_dusk' },
        { start: daylight.civilDuskDecimal, end: daylight.nauticalDuskDecimal, phase: 'nautical_dusk' },
        { start: daylight.nauticalDuskDecimal, end: daylight.astronomicalDuskDecimal, phase: 'astronomical_dusk' },
    ];
    for (const { start, end, phase } of phases)
        if (start !== undefined && end !== undefined) {
            if (start < end) {
                if (hourDecimal >= start && hourDecimal < end) return phase;
            } else {
                if (hourDecimal >= start || hourDecimal < end) return phase;
            }
        }
    return 'night';
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getDaylightHours(date, latitude, longitude) {
    const year = date.getFullYear(),
        hours = date.getHours(),
        minutes = date.getMinutes(),
        tzoffset = date.getTimezoneOffset();
    const latitudeRad = latitude * constants.DEGREES_TO_RADIANS;
    const fracYear = ((2 * Math.PI) / (isLeapYear(year) ? 366 : 365)) * (daysIntoYear(date) - 1 + (hours - 12) / 24);
    const declination = 0.006918 - 0.399912 * Math.cos(fracYear) + 0.070257 * Math.sin(fracYear) - 0.006758 * Math.cos(2 * fracYear) + 0.000907 * Math.sin(2 * fracYear) - 0.002697 * Math.cos(3 * fracYear) + 0.00148 * Math.sin(3 * fracYear);
    const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(fracYear) - 0.032077 * Math.sin(fracYear) - 0.014615 * Math.cos(2 * fracYear) - 0.040849 * Math.sin(2 * fracYear));
    const solarNoon = 12 - eqTime / 60 - longitude / 15; // longitude positive EAST
    const utcOffset = -tzoffset / 60;
    const times = {};
    const angles = {
        daylight: -0.8333, // Standard sunrise/sunset with refraction
        civil: -6,
        nautical: -12,
        astronomical: -18,
    };
    for (const [type, angle] of Object.entries(angles)) {
        const cosHourAngle = (Math.cos((90 - angle) * constants.DEGREES_TO_RADIANS) - Math.sin(latitudeRad) * Math.sin(declination)) / (Math.cos(latitudeRad) * Math.cos(declination));
        if (cosHourAngle >= -1 && cosHourAngle <= 1) {
            const hourAngle = (Math.acos(cosHourAngle) * constants.RADIANS_TO_DEGREES) / 15;
            times[type + 'Dawn'] = normalizeTime(solarNoon - hourAngle + utcOffset);
            times[type + 'Dusk'] = normalizeTime(solarNoon + hourAngle + utcOffset);
        } else if (cosHourAngle < -1) {
            // Sun never goes below this angle (midnight sun period)
            times[type + 'Dawn'] = null; // eslint-disable-line unicorn/no-null
            times[type + 'Dusk'] = null; // eslint-disable-line unicorn/no-null
        } else {
            // Sun never rises above this angle (polar night)
            times[type + 'Dawn'] = undefined;
            times[type + 'Dusk'] = undefined;
        }
    }
    const refractionDegrees = 0.5667; // 34 arcminutes
    const daylightAngle = (Math.cos((90 + refractionDegrees) * constants.DEGREES_TO_RADIANS) - Math.sin(latitudeRad) * Math.sin(declination)) / (Math.cos(latitudeRad) * Math.cos(declination));
    // eslint-disable-next-line unicorn/no-nested-ternary, sonarjs/no-nested-conditional
    const daylightHours = times.daylightDawn && times.daylightDusk ? times.daylightDusk - times.daylightDawn + (times.daylightDusk < times.daylightDawn ? 24 : 0) : daylightAngle < -1 ? 24 : 0;
    const isDaytime = times.daylightDawn && times.daylightDusk && hours + minutes / 60 > times.daylightDawn && hours + minutes / 60 < times.daylightDusk;
    return {
        sunriseDecimal: times.daylightDawn,
        sunsetDecimal: times.daylightDusk,
        civilDawnDecimal: times.civilDawn,
        civilDuskDecimal: times.civilDusk,
        nauticalDawnDecimal: times.nauticalDawn,
        nauticalDuskDecimal: times.nauticalDusk,
        astronomicalDawnDecimal: times.astronomicalDawn,
        astronomicalDuskDecimal: times.astronomicalDusk,
        daylightHours,
        isDaytime,
        isDST: getDST(date),
        isMidnightSun: times.daylightDawn === null,
        isPolarNight: times.daylightDawn === undefined,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getDaylightSituation(date, latitude, longitude) {
    const daylight = getDaylightHours(date, latitude, longitude);
    return { ...daylight, phase: getDaylightPhase(date.getHours() + date.getMinutes() / 60, daylight) };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getCrossQuarterDates(year) {
    // Approximate dates as starting points
    const approxDates = {
        315: new Date(year, 1, 2), // ~Feb 2
        45: new Date(year, 4, 6), // ~May 6
        135: new Date(year, 7, 6), // ~Aug 6
        225: new Date(year, 10, 6), // ~Nov 6
    };
    // Cross-quarter days occur when solar longitude is 45°, 135°, 225°, 315°
    const crossQuarterDates = [];
    // NOTE: northern hemisphere
    const longitudes = [
        { lon: 315, name: 'Imbolc', northern: 'Imbolc (early spring)', southern: 'Lughnasadh (early autumn)' },
        { lon: 45, name: 'Beltane', northern: 'Beltane (early summer)', southern: 'Samhain (early winter)' },
        { lon: 135, name: 'Lughnasadh', northern: 'Lughnasadh (early autumn)', southern: 'Imbolc (early spring)' },
        { lon: 225, name: 'Samhain', northern: 'Samhain (early winter)', southern: 'Beltane (early summer)' },
    ];
    for (const target of longitudes) {
        let testDate = approxDates[target.lon];
        let prevLon = undefined;
        // Search within ±10 days for exact crossing
        for (let offset = -12; offset <= 12; offset++) {
            const date = new Date(testDate.getTime() + offset * constants.MILLISECONDS_PER_DAY);
            const lon = getSolarLongitude(dateToJulianDateUTC(date));
            if (prevLon !== undefined) {
                // Check if we crossed the target longitude
                if ((prevLon < target.lon && lon >= target.lon) || (target.lon === 315 && prevLon > 300 && lon < 60)) {
                    // Handle 360° wrap
                    crossQuarterDates.push({ date, ...target });
                    break;
                }
            }
            prevLon = lon;
        }
    }
    return crossQuarterDates;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// function getFundamentalArguments(T) {
//     const key = T.toFixed(8);
//     if (fundamentalArgsCache.has(key)) return fundamentalArgsCache.get(key);
//     const args = {
//         L: normalizeAngle(218.3164477 + 481267.88123421 * T - 0.0015786 * T*T + T*T*T / 538841),
//         D: normalizeAngle(297.8501921 + 445267.1114034 * T - 0.0018819 * T*T + T*T*T / 545868),
//         M: normalizeAngle(357.5291092 + 35999.0502909 * T - 0.0001536 * T*T),
//         Mp: normalizeAngle(134.9633964 + 477198.8675055 * T + 0.0087414 * T*T + T*T*T / 69699),
//         F: normalizeAngle(93.272095 + 483202.0175233 * T - 0.0036539 * T*T)
//     };

//     fundamentalArgsCache.set(key, args);
//     return args;
// }

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function __getEquinoxSolstice(year, type) {
    // type: 0=March equinox, 1=June solstice, 2=Sept equinox, 3=Dec solstice
    const Y = (year - 2000) / 1000;
    const Y2 = Y * Y,
        Y3 = Y2 * Y,
        Y4 = Y3 * Y;
    // Mean values for year 2000 (Meeus)
    const jd0 = [2451623.80984, 2451716.56767, 2451810.21715, 2451900.05794][type];
    // Periodic corrections
    const A = [485, 203, 199, 182, 156, 136, 77, 74, 70, 58, 52, 50, 45, 44, 29, 18, 17, 16, 14, 12, 12, 12, 9, 8];
    const B = [324.96, 337.23, 342.08, 27.85, 73.14, 171.52, 222.54, 296.72, 243.58, 119.81, 297.17, 21.02, 247.54, 325.15, 60.93, 155.12, 288.79, 198.04, 199.76, 95.39, 287.11, 320.81, 227.73, 15.45];
    const C = [
        1934.136, 32964.467, 20.186, 445267.112, 45036.886, 22518.443, 65928.934, 3034.906, 9037.513, 33718.147, 150.678, 2281.226, 29929.562, 31555.956, 4443.417, 67555.328, 4562.452, 62894.029, 31436.921, 14577.848, 31931.756, 34777.259,
        1222.114, 16859.074,
    ];
    let S = 0;
    for (let i = 0; i < 24; i++) S += A[i] * Math.cos((B[i] + C[i] * Y) * constants.DEGREES_TO_RADIANS);
    return julianDateToDateUTC(jd0 + 0.00001 * S + 365242.37404 * Y + 0.05169 * Y2 + -0.00411 * Y3 + -0.00057 * Y4);
}
const equinoxSolsticeCache = new Map(),
    equinoxSolsticeCacheMax = 100;
function getEquinoxSolstice(year, type) {
    const key = `${year}/${type}`;
    if (!equinoxSolsticeCache.has(key)) {
        equinoxSolsticeCache.set(key, __getEquinoxSolstice(year, type));
        if (equinoxSolsticeCache.size > equinoxSolsticeCacheMax) equinoxSolsticeCache.delete(equinoxSolsticeCache.keys().next().value);
    }
    return equinoxSolsticeCache.get(key);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function isNearSolstice(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear(),
        month = date.getMonth(),
        time = date.getTime(),
        isNorthern = hemisphere === 'northern';
    // Calculate actual solstice dates
    const currentYearSummerSolstice = getEquinoxSolstice(year, 1); // June solstice
    const currentYearWinterSolstice = getEquinoxSolstice(year, 3); // December solstice
    // Check previous/next year if near year boundary
    const prevYearWinterSolstice = month < 6 ? getEquinoxSolstice(year - 1, 3) : undefined;
    const nextYearSummerSolstice = month >= 6 ? getEquinoxSolstice(year + 1, 1) : undefined;
    // Determine which is longest/shortest day based on hemisphere
    const currentYearLongestDay = isNorthern ? currentYearSummerSolstice : currentYearWinterSolstice;
    const currentYearShortestDay = isNorthern ? currentYearWinterSolstice : currentYearSummerSolstice;
    // Handle year boundary
    // eslint-disable-next-line unicorn/no-nested-ternary, sonarjs/no-nested-conditional
    const otherYearRelevantSolstice = isNorthern ? (month < 6 ? prevYearWinterSolstice : nextYearSummerSolstice) : month < 6 ? getEquinoxSolstice(year - 1, 1) : getEquinoxSolstice(year + 1, 3);
    // Rest of the existing logic remains the same...
    const daysToCurrYearLongest = (currentYearLongestDay.getTime() - time) / constants.MILLISECONDS_PER_DAY;
    const daysToCurrYearShortest = (currentYearShortestDay.getTime() - time) / constants.MILLISECONDS_PER_DAY;
    const daysToOtherYearSolstice = otherYearRelevantSolstice ? (otherYearRelevantSolstice.getTime() - time) / constants.MILLISECONDS_PER_DAY : Infinity;
    if (Math.abs(daysToCurrYearLongest) <= daysWindow)
        return {
            near: true,
            type: 'longest day',
            days: daysToCurrYearLongest,
        };
    else if (Math.abs(daysToCurrYearShortest) <= daysWindow)
        return {
            near: true,
            type: 'shortest day',
            days: daysToCurrYearShortest,
        };
    else if (Math.abs(daysToOtherYearSolstice) <= daysWindow)
        return {
            near: true,
            type: (isNorthern && month < 6) || (!isNorthern && month >= 6) ? 'shortest day' : 'longest day',
            days: daysToOtherYearSolstice,
        };
    return { near: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function isNearEquinox(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear(),
        time = date.getTime(),
        isNorthern = hemisphere === 'northern';
    // Calculate actual equinox dates
    const springEquinox = getEquinoxSolstice(year, 0); // March equinox
    const autumnEquinox = getEquinoxSolstice(year, 2); // September equinox
    // These map to first/second based on hemisphere
    const firstEquinox = isNorthern ? springEquinox : autumnEquinox;
    const secondEquinox = isNorthern ? autumnEquinox : springEquinox;
    const daysToFirst = (firstEquinox.getTime() - time) / constants.MILLISECONDS_PER_DAY;
    const daysToSecond = (secondEquinox.getTime() - time) / constants.MILLISECONDS_PER_DAY;
    // Check previous/next year boundaries
    const prevYearSecondEquinox = getEquinoxSolstice(year - 1, isNorthern ? 2 : 0);
    const daysToPrevYearSecond = (prevYearSecondEquinox.getTime() - time) / constants.MILLISECONDS_PER_DAY;
    const nextYearFirstEquinox = getEquinoxSolstice(year + 1, isNorthern ? 0 : 2);
    const daysToNextYearFirst = (nextYearFirstEquinox.getTime() - time) / constants.MILLISECONDS_PER_DAY;
    if (Math.abs(daysToFirst) <= daysWindow)
        return {
            near: true,
            type: isNorthern ? 'spring equinox' : 'autumn equinox',
            days: daysToFirst,
        };
    else if (Math.abs(daysToSecond) <= daysWindow)
        return {
            near: true,
            type: isNorthern ? 'autumn equinox' : 'spring equinox',
            days: daysToSecond,
        };
    else if (Math.abs(daysToPrevYearSecond) <= daysWindow)
        return {
            near: true,
            type: isNorthern ? 'autumn equinox' : 'spring equinox',
            days: daysToPrevYearSecond,
        };
    else if (Math.abs(daysToNextYearFirst) <= daysWindow)
        return {
            near: true,
            type: isNorthern ? 'spring equinox' : 'autumn equinox',
            days: daysToNextYearFirst,
        };
    return { near: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const crossQuarterDatesCache = new Map(),
    crossQuarterDatesCacheMax = 100;
function isNearCrossQuarter(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear();
    const yearsToCheck = [year];
    if (date.getMonth() === 0) yearsToCheck.push(year - 1);
    if (date.getMonth() === 11) yearsToCheck.push(year + 1);
    for (const y of yearsToCheck) if (!crossQuarterDatesCache.has(y)) crossQuarterDatesCache.set(y, getCrossQuarterDates(y));
    while (crossQuarterDatesCache.size > crossQuarterDatesCacheMax) crossQuarterDatesCache.delete([...crossQuarterDatesCache.keys()].sort((a, b) => a - b)[0]);
    for (const y of yearsToCheck)
        for (const item of crossQuarterDatesCache.get(y)) {
            const days = (item.date - date) / constants.MILLISECONDS_PER_DAY;
            if (Math.abs(days) <= daysWindow)
                return {
                    near: true,
                    type: `cross-quarter ${hemisphere === 'northern' ? item.northern : item.southern}`,
                    days,
                    exactDate: item.date,
                };
        }
    return { near: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function localSiderealTime(jd, longitude) {
    const T = (jd - 2451545) / 36525,
        T2 = T * T,
        T3 = T2 * T,
        T4 = T3 * T;
    const st = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T2 - T3 / 38710000 + 0.00000002 * T4; // Additional precision term
    // Apply nutation correction for high precision (optional)
    const omega = 125.04452 - 1934.136261 * T;
    const L = 280.4665 + 36000.7698 * T;
    const L_prime = 218.3165 + 481267.8813 * T;
    const deltaPsi = -0.000319 * Math.sin(omega * constants.DEGREES_TO_RADIANS) - 0.000024 * Math.sin(2 * L * constants.DEGREES_TO_RADIANS) - 0.000012 * Math.sin(2 * L_prime * constants.DEGREES_TO_RADIANS);
    return normalizeAngle(st + longitude + deltaPsi);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateNodeDistance(jd, lunarLongitude) {
    const T = (jd - 2451545) / 36525,
        T2 = T * T,
        T3 = T2 * T;
    // Mean longitude of ascending node
    const omega = 125.0445479 - 1934.1362891 * T + 0.0020754 * T2 + T3 / 467441;
    const nodeNormalized = normalizeAngle(omega);
    // Angular distance to ascending node
    const distToAscending = Math.abs(normalizeAngle(lunarLongitude - nodeNormalized)),
        distToDescending = Math.abs(normalizeAngle(lunarLongitude - nodeNormalized - 180));
    return Math.min(distToAscending, distToDescending);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateAngularSeparation(ra1, dec1, ra2, dec2) {
    // Convert to radians
    const ra1Rad = ra1 * constants.DEGREES_TO_RADIANS,
        dec1Rad = dec1 * constants.DEGREES_TO_RADIANS,
        ra2Rad = ra2 * constants.DEGREES_TO_RADIANS,
        dec2Rad = dec2 * constants.DEGREES_TO_RADIANS;
    // Using the Haversine formula for celestial sphere
    const deltaRA = ra2Rad - ra1Rad,
        deltaDec = dec2Rad - dec1Rad;
    const a = Math.sin(deltaDec / 2) * Math.sin(deltaDec / 2) + Math.cos(dec1Rad) * Math.cos(dec2Rad) * Math.sin(deltaRA / 2) * Math.sin(deltaRA / 2);
    // Return separation in degrees
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * constants.RADIANS_TO_DEGREES;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateMoonriseAzimuth(lunarTimes, location) {
    if (!lunarTimes.rise) return undefined;
    const lunarPosition = getLunarPosition(lunarTimes.rise, location.latitude, location.longitude);
    const decRad = lunarPosition.dec * constants.DEGREES_TO_RADIANS,
        latRad = location.latitude * constants.DEGREES_TO_RADIANS;
    // Calculate azimuth at horizon
    const cosAz = Math.sin(decRad) / Math.cos(latRad);
    if (cosAz > 1) return 90; // Moon rises due east (only possible at equator)
    if (cosAz < -1) return 90; // Should not happen for rising
    // Azimuth at rising (eastern horizon)
    const azimuth = Math.acos(cosAz) * constants.RADIANS_TO_DEGREES;
    // Adjust for declination sign
    return lunarPosition.dec < 0 ? 180 - azimuth : azimuth;
}

function calculateMoonsetAzimuth(lunarTimes, location) {
    if (!lunarTimes.set) return undefined;
    const lunarPosition = getLunarPosition(lunarTimes.set, location.latitude, location.longitude);
    const decRad = lunarPosition.dec * constants.DEGREES_TO_RADIANS,
        latRad = location.latitude * constants.DEGREES_TO_RADIANS;
    // Calculate azimuth at horizon
    const cosAz = Math.sin(decRad) / Math.cos(latRad);
    if (cosAz > 1) return 270; // Moon sets due west (only possible at equator)
    if (cosAz < -1) return 270; // Should not happen for setting
    // Azimuth at setting (western horizon)
    const azimuth = Math.acos(cosAz) * constants.RADIANS_TO_DEGREES;
    // Adjust for declination sign
    return lunarPosition.dec > 0 ? 360 - azimuth : 180 + azimuth;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateLimitingMagnitude(lunarBrightness, lightPollution, humidity, targetAltitude = 90) {
    let limitingMagnitude = 6.5; // Theoretical best
    // Moon phase adjustment
    limitingMagnitude -= (lunarBrightness / 100) * 3.5; // Loses ~3.5 magnitudes at full moon
    // Light pollution adjustment
    const lightPollutionLimiters = {
        high: 3.5,
        medium: 2,
        low: 0.5,
    };
    if (lightPollutionLimiters[lightPollution] !== undefined) limitingMagnitude -= lightPollutionLimiters[lightPollution];
    // Humidity adjustment
    if (humidity !== undefined) {
        if (humidity > 80) limitingMagnitude -= 0.5;
        else if (humidity > 60) limitingMagnitude -= 0.2;
    }
    // Atmospheric extinction (magnitude loss per airmass)
    const airmass = 1 / Math.sin((Math.max(10, targetAltitude) * Math.PI) / 180);
    limitingMagnitude -= 0.3 * (airmass - 1); // ~0.3 mag/airmass extinction
    return limitingMagnitude;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isRadiantVisible(radiantCoordinates, radiantName, date, latitude, longitude) {
    const radiant = radiantCoordinates[radiantName];
    if (!radiant) return { visible: true }; // Default to visible if unknown
    // Calculate local sidereal time
    const lst = localSiderealTime(dateToJulianDateUTC(date), longitude) / 15; // Convert to hours
    // Calculate hour angle
    let ha = lst - radiant.ra;
    if (ha < -12) ha += 24;
    if (ha > 12) ha -= 24;
    // Calculate altitude of radiant
    const latRad = (latitude * Math.PI) / 180,
        decRad = (radiant.dec * Math.PI) / 180,
        haRad = (ha * 15 * Math.PI) / 180;
    const altitude = (Math.asin(Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)) * 180) / Math.PI;
    // Radiant is usefully visible if above 20° altitude
    return {
        visible: altitude > 10,
        altitude,
    };
}

function isRadiantFavorable(radiantDeclinations, radiantName, latitude) {
    // Radiant is favorable if it can reach >30° altitude
    return 90 - Math.abs(latitude - (radiantDeclinations[radiantName] || 0)) > 30;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getSolarPosition(date, latitude, longitude, includeRefraction = false) {
    const jd = dateToJulianDateUTC(date),
        T = (jd - 2451545) / 36525,
        T2 = T * T,
        T3 = T2 * T,
        T4 = T3 * T;
    // Mean longitude of sun (ensure positive)
    const L0 = normalizeAngle(280.46646 + 36000.76983 * T + 0.0003032 * T2);
    // Mean anomaly of sun (ensure positive)
    const M = normalizeAngle(357.52911 + 35999.05029 * T - 0.0001537 * T2);
    const Mrad = M * constants.DEGREES_TO_RADIANS;
    // Eccentricity
    const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T2;
    // Equation of center
    const C = (1.914602 - 0.004817 * T - 0.000014 * T2) * Math.sin(Mrad) + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) + 0.000289 * Math.sin(3 * Mrad);
    // True longitude (ensure positive)
    const trueLongitude = normalizeAngle(L0 + C);
    // True anomaly
    const v = M + C;
    // Distance in AU
    const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(v * constants.DEGREES_TO_RADIANS));
    // Apparent longitude (with nutation and aberration)
    const omega = 125.04 - 1934.136 * T;
    const omegaRad = omega * constants.DEGREES_TO_RADIANS;
    // Obliquity of ecliptic
    const epsilon = 23.439291 - 0.0130042 * T - 0.00000016 * T2 + 0.0000005 * T3 - 0.00000001 * T4;
    const deltaEpsilon = 0.00256 * Math.cos(omegaRad); // Nutation in obliquity
    const epsilonTrue = epsilon + deltaEpsilon;
    const epsilonRad = epsilonTrue * constants.DEGREES_TO_RADIANS;
    const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omegaRad);
    // Right ascension and declination
    const trueLongRad = trueLongitude * constants.DEGREES_TO_RADIANS;
    const alpha = Math.atan2(Math.cos(epsilonRad) * Math.sin(trueLongRad), Math.cos(trueLongRad)) * constants.RADIANS_TO_DEGREES;
    const delta = Math.asin(Math.sin(epsilonRad) * Math.sin(trueLongRad)) * constants.RADIANS_TO_DEGREES;
    // Hour angle
    const lst = localSiderealTime(jd, longitude);
    const H = normalizeAngle(lst - alpha);
    // Convert to altitude/azimuth
    const latRad = latitude * constants.DEGREES_TO_RADIANS;
    const deltaRad = delta * constants.DEGREES_TO_RADIANS;
    const Hrad = H * constants.DEGREES_TO_RADIANS;
    let altitude = Math.asin(Math.sin(latRad) * Math.sin(deltaRad) + Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(Hrad)) * constants.RADIANS_TO_DEGREES;
    if (includeRefraction && altitude > -1) {
        // Bennetts formula for atmospheric refraction
        // const P = pressure / 1013.25, T = (temperature + 273.15) / 283.15;
        // const refractionMinutes = altitude > 15 ? (P / T) * 0.97 / Math.tan(altitude * constants.DEGREES_TO_RADIANS) : (P / T) * 1.02 / Math.tan((altitude + 10.3 / (altitude + 5.11)) * constants.DEGREES_TO_RADIANS);
        const refractionMinutes = altitude > 15 ? 0.97 / Math.tan(altitude * constants.DEGREES_TO_RADIANS) : 1.02 / Math.tan((altitude + 10.3 / (altitude + 5.11)) * constants.DEGREES_TO_RADIANS);
        altitude += refractionMinutes / 60;
    }
    const azimuth = normalizeAngle(Math.atan2(Math.sin(Hrad), Math.cos(Hrad) * Math.sin(latRad) - Math.tan(deltaRad) * Math.cos(latRad)) * constants.RADIANS_TO_DEGREES + 180);
    // Equation of time in minutes
    // Convention: positive = sundial ahead of clock (sun crosses meridian before mean solar noon)
    // This is opposite to some astronomical software which uses negative = sundial ahead
    const equationOfTime = 4 * (L0 - alpha); // Convert to minutes (4 minutes per degree)
    // Solar noon calculation
    const noon = 12 - equationOfTime / 60 - longitude / 15;
    return {
        altitude,
        azimuth,
        direction: cardinalDirection(azimuth),
        declination: delta,
        rightAscension: alpha,
        hourAngle: H,
        trueLongitude,
        equationOfTime,
        // eslint-disable-next-line sonarjs/no-nested-conditional, unicorn/no-nested-ternary
        noon: noon < 0 ? noon + 24 : noon >= 24 ? noon - 24 : noon, // Local Mean Solar Noon
        apparentNoon: (noon + equationOfTime / 60) % 24, // Local Apparent Solar Noon (sundial noon)
        angularDiameter: 2 * Math.atan(constantsLunar.SOLAR_RADIUS_KM / (R * constantsLunar.ASTRONOMICAL_UNIT_KM)) * constants.RADIANS_TO_DEGREES,
        // XXX compability items to be deprecated
        longitude: apparentLongitude, // Ecliptic longitude
        latitude: 0, // Sun's ecliptic latitude is always ~0
        distance: R, // Distance in AU
        velocity: 0.9856473, // Degrees per day (approximate)
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getSolarLongitude(jd) {
    const T = (jd - 2451545) / 36525,
        T2 = T * T;
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T2;
    const M = 357.52911 + 35999.05029 * T - 0.0001537 * T2;
    const Mrad = M * constants.DEGREES_TO_RADIANS;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T2) * Math.sin(Mrad) + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) + 0.000289 * Math.sin(3 * Mrad);
    return normalizeAngle(L0 + C);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getSolarSituation(date, latitude, longitude) {
    const position = getSolarPosition(date, latitude, longitude);
    const altitudeRad = position.altitude * constants.DEGREES_TO_RADIANS;
    return {
        position,
        altitudeRadians: altitudeRad,
        isGoldenHour: position.altitude > 0 && position.altitude < 10,
        isBlueHour: position.altitude > -6 && position.altitude < -4,
        shadowMultiplier: position.altitude > 0.1 ? Math.min(1 / Math.tan(Math.max(altitudeRad, 0.1 * constants.DEGREES_TO_RADIANS)), 100) : Infinity,
        constants: constantsLunar,
    };
}
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function __getLunarEclipticLongitudeForZodiac(jd) {
    const T = (jd - 2451545) / 36525;
    // Moon's mean longitude
    const L = normalizeAngle(218.316 + 13.176396 * (jd - 2451545));
    // Moon's mean anomaly (note: variable named M but this is Moon's anomaly, not Sun's)
    // The -0.186 term below should use Sun's mean anomaly for full accuracy
    const M = normalizeAngle(134.963 + 13.064993 * (jd - 2451545));
    // Moon's mean elongation
    const D = normalizeAngle(297.85 + 12.190749 * (jd - 2451545));
    // Argument of latitude
    const F = normalizeAngle(93.27 + 13.22935 * (jd - 2451545));
    // Convert to radians
    const Mrad = M * constants.DEGREES_TO_RADIANS;
    const Drad = D * constants.DEGREES_TO_RADIANS;
    const Frad = F * constants.DEGREES_TO_RADIANS;
    // Longitude corrections (these are correct)
    const correctionsLongitude =
        +6.289 * Math.sin(Mrad) +
        +1.274 * Math.sin(2 * Drad - Mrad) +
        +0.658 * Math.sin(2 * Drad) +
        +0.214 * Math.sin(2 * Mrad) +
        -0.186 * Math.sin(Mrad) +
        -0.114 * Math.sin(2 * Frad) +
        +0.059 * Math.sin(2 * Drad - 2 * Mrad) +
        +0.057 * Math.sin(2 * Drad - Mrad - Mrad) +
        +0.053 * Math.sin(2 * Drad + Mrad) +
        +0.046 * Math.sin(2 * Drad - Mrad) +
        // -0.041 * Math.sin(Mrad - Mrad) +
        -0.035 * Math.sin(Drad) +
        -0.031 * Math.sin(Mrad + Mrad);
    // Calculate true longitude
    const trueLongitude = L + correctionsLongitude;
    // Calculate nutation in longitude (this is what's missing!)
    const omega = normalizeAngle(125.04 - 1934.136 * T);
    const OmegaRad = omega * constants.DEGREES_TO_RADIANS;
    const nutationLongitude = -0.00569 - 0.00478 * Math.sin(OmegaRad);
    // Calculate ecliptic coordinates
    const longitude = normalizeAngle(trueLongitude + nutationLongitude);
    return longitude;
}

function __getLunarElongationForPhase(jd) {
    const T = (jd - 2451545) / 36525,
        T2 = T * T;
    // Fundamental arguments (Meeus)
    const D = normalizeAngle(297.8501921 + 445267.1114034 * T); // Mean elongation Moon-Sun
    const M = normalizeAngle(357.52911 + 35999.05029 * T - 0.0001537 * T2);
    const Mp = normalizeAngle(134.9633964 + 477198.8675055 * T); // Moon's mean anomaly
    const F = normalizeAngle(93.272095 + 483202.0175233 * T);
    const Drad = D * constants.DEGREES_TO_RADIANS;
    const Mrad = M * constants.DEGREES_TO_RADIANS;
    const Mprad = Mp * constants.DEGREES_TO_RADIANS;
    const Frad = F * constants.DEGREES_TO_RADIANS;
    // Apply corrections for a more accurate phase -these are the primary periodic terms
    const corrections =
        -1.274 * Math.sin(Mprad - 2 * Drad) + // Evection
        +0.658 * Math.sin(2 * Drad) + // Variation
        +0.186 * Math.sin(Mprad) + // Annual equation
        -0.059 * Math.sin(2 * Mprad - 2 * Drad) +
        -0.057 * Math.sin(Mprad - 2 * Drad + Mrad) +
        +0.053 * Math.sin(Mprad + 2 * Drad) +
        +0.046 * Math.sin(2 * Drad - Mrad) +
        +0.041 * Math.sin(Mprad - Mrad) +
        -0.035 * Math.sin(Drad) + // Parallactic equation
        -0.031 * Math.sin(Mprad + Mrad) +
        -0.015 * Math.sin(2 * Frad - 2 * Drad) + // F term correction
        +0.011 * Math.sin(Mprad - 4 * Drad); // Additional term
    // Calculate corrected elongation
    const elongation = normalizeAngle(D + corrections);
    return elongation;
}

function __getLunarDistanceForDistance(jd) {
    const T = (jd - 2451545) / 36525,
        T2 = T * T,
        T3 = T2 * T,
        T4 = T3 * T;
    // Mean anomaly of moon
    const D = normalizeAngle(297.8501921 + 445267.1114034 * T); // Mean elongation Moon-Sun
    const Mp = normalizeAngle(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000); // Moon's mean anomaly
    const Drad = D * constants.DEGREES_TO_RADIANS;
    const Mprad = Mp * constants.DEGREES_TO_RADIANS;
    //
    const distanceKm = 385000.56 - 20905.355 * Math.cos(Mprad) - 3699.111 * Math.cos(2 * Drad - Mprad) - 2955.968 * Math.cos(2 * Drad) - 569.925 * Math.cos(2 * Mprad);
    return distanceKm;
}

function getLunarPosition(date, latitude, longitude, includeParallax = true) {
    const jd = dateToJulianDateUTC(date),
        T = (jd - 2451545) / 36525,
        T2 = T * T,
        T3 = T2 * T,
        T4 = T3 * T;

    // Fundamental arguments (Meeus Ch. 47)
    const L = normalizeAngle(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
    const D = normalizeAngle(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
    const M = normalizeAngle(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
    const Mp = normalizeAngle(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
    const F = normalizeAngle(93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);
    const Drad = D * constants.DEGREES_TO_RADIANS;
    const Mrad = M * constants.DEGREES_TO_RADIANS;
    const Mprad = Mp * constants.DEGREES_TO_RADIANS;
    const Frad = F * constants.DEGREES_TO_RADIANS;

    // Position
    const correctionsLon =
        +6.289 * Math.sin(Mprad) +
        +1.274 * Math.sin(2 * Drad - Mprad) +
        +0.658 * Math.sin(2 * Drad) +
        +0.214 * Math.sin(2 * Mprad) +
        -0.186 * Math.sin(Mprad) +
        -0.114 * Math.sin(2 * Frad) +
        +0.059 * Math.sin(2 * Drad - 2 * Mprad) +
        +0.057 * Math.sin(2 * Drad - Mrad - Mprad) +
        +0.053 * Math.sin(2 * Drad + Mprad) +
        +0.046 * Math.sin(2 * Drad - Mrad);
    const lonWithoutNutation = L + correctionsLon;
    // Latitude corrections (simplified)
    // Convert to equatorial coordinates
    const epsilon = 23.439291 - 0.0130042 * T;
    const omega = normalizeAngle(125.04452 - 1934.136261 * T);
    const omegaRad = omega * constants.DEGREES_TO_RADIANS;
    const L_sun = normalizeAngle(280.4665 + 36000.7698 * T);
    const L_moon = normalizeAngle(218.3165 + 481267.8813 * T);
    const deltaPsi = -0.00569 - 0.00478 * Math.sin(omegaRad) - 0.00039 * Math.sin(2 * L_sun * constants.DEGREES_TO_RADIANS) - 0.00024 * Math.sin(2 * L_moon * constants.DEGREES_TO_RADIANS);
    const deltaEpsilon = 0.00256 * Math.cos(omegaRad); // Nutation in obliquity
    const epsilonTrue = epsilon + deltaEpsilon;
    const epsilonTrueRad = epsilonTrue * constants.DEGREES_TO_RADIANS;
    const lonEcliptic = lonWithoutNutation + deltaPsi; // Apply nutation to longitude
    const latEcliptic = 5.128 * Math.sin(Frad) + 0.28 * Math.sin(Mprad + Frad) + 0.277 * Math.sin(Mprad - Frad) + 0.173 * Math.sin(2 * Drad - Frad);

    // Distance KM
    const correctionsDistance =
        -20905 * Math.cos(Mprad) +
        -3699 * Math.cos(2 * Drad - Mprad) +
        -2956 * Math.cos(2 * Drad) +
        -570 * Math.cos(2 * Mprad) +
        +246 * Math.cos(2 * Drad - 2 * Mprad) +
        -171 * Math.cos(Drad) +
        -205 * Math.cos(Mprad - 2 * Frad) +
        -152 * Math.cos(Mprad + 2 * Drad);
    const distanceKm = 385000.56 + correctionsDistance;

    // Velocity (degrees per day)
    const velocity = 13.176396 + 0.549016 * Math.cos(Mprad) + 0.109927 * Math.cos(2 * Drad - Mprad) + 0.078303 * Math.cos(2 * Drad);

    // Right ascension and declination
    const lonEclipticRad = lonEcliptic * constants.DEGREES_TO_RADIANS;
    const latEclipticRad = latEcliptic * constants.DEGREES_TO_RADIANS;
    const x = Math.cos(latEclipticRad) * Math.cos(lonEclipticRad);
    const y = Math.cos(epsilonTrueRad) * Math.cos(latEclipticRad) * Math.sin(lonEclipticRad) - Math.sin(epsilonTrueRad) * Math.sin(latEclipticRad);
    const z = Math.sin(epsilonTrueRad) * Math.cos(latEclipticRad) * Math.sin(lonEclipticRad) + Math.cos(epsilonTrueRad) * Math.sin(latEclipticRad);
    const ra = normalizeAngle(Math.atan2(y, x) * constants.RADIANS_TO_DEGREES);
    const dec = Math.asin(z) * constants.RADIANS_TO_DEGREES;

    // Altitude/azimuth
    let hourAngle = localSiderealTime(jd, longitude) - ra;
    if (hourAngle > 180) hourAngle -= 360;
    if (hourAngle < -180) hourAngle += 360;
    const latitudeRad = latitude * constants.DEGREES_TO_RADIANS;
    const decRad = dec * constants.DEGREES_TO_RADIANS;
    const haRad = hourAngle * constants.DEGREES_TO_RADIANS;
    let altitude = Math.asin(Math.sin(latitudeRad) * Math.sin(decRad) + Math.cos(latitudeRad) * Math.cos(decRad) * Math.cos(haRad)) * constants.RADIANS_TO_DEGREES;
    if (includeParallax && altitude > -2) altitude -= Math.asin(constantsLunar.EARTH_RADIUS_KM / distanceKm) * constants.RADIANS_TO_DEGREES * Math.cos(altitude * constants.DEGREES_TO_RADIANS);
    const azimuth = (Math.atan2(Math.sin(haRad), Math.cos(haRad) * Math.sin(latitudeRad) - Math.tan(decRad) * Math.cos(latitudeRad)) * constants.RADIANS_TO_DEGREES + 180) % 360;

    // Illuminated fraction
    const elongation = Math.acos(Math.cos((lonWithoutNutation - getSolarLongitude(jd)) * constants.DEGREES_TO_RADIANS));
    const illuminatedFraction = (1 - Math.cos(elongation)) / 2;

    // Libration
    const librationLon = -1.274 * Math.sin(Mprad - 2 * Drad) + 0.658 * Math.sin(2 * Drad) - 0.186 * Math.sin(Mprad) - 0.059 * Math.sin(2 * Mprad - 2 * Drad);
    const librationLat = -0.173 * Math.sin(Frad - 2 * Drad);

    // Angular Diameter
    const angularDiameter = 2 * Math.asin(constantsLunar.LUNAR_RADIUS_KM / distanceKm) * constants.RADIANS_TO_DEGREES;

    return {
        altitude,
        azimuth,
        direction: cardinalDirection(azimuth),
        illuminatedFraction,
        ra,
        dec,
        libration: {
            longitude: librationLon, // Positive = east limb visible
            latitude: librationLat, // Positive = north pole visible
            // Features visible due to libration
            features: getLunarFeaturesVisible(librationLon, librationLat, illuminatedFraction),
        },
        distanceKm,
        hourAngle,
        angularDiameter,
        // XXX compability items to be deprecated
        longitude: lonEcliptic, // True ecliptic longitude (with nutation)
        latitude: latEcliptic, // Ecliptic latitude
        distance: distanceKm / constantsLunar.EARTH_RADIUS_KM, // Distance in Earth radii
        velocity, // Degrees per day
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarPhase(date = new Date()) {
    const elongation = __getLunarElongationForPhase(dateToJulianDateUTC(date));
    return (1 - Math.cos(elongation * constants.DEGREES_TO_RADIANS)) / 2;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarDistance(date = new Date()) {
    const distance = __getLunarDistanceForDistance(dateToJulianDateUTC(date));
    const phase = getLunarPhase(date);
    const apsis = getLunarApsis(date);
    return {
        distance,
        isSupermoon: distance < 361863 && Math.abs(phase - 0.5) < 0.034,
        isSuperNewMoon: distance < 361863 && (phase < 0.02 || phase > 0.98),
        isMicromoon: distance > 405000 && Math.abs(phase - 0.5) < 0.02,
        isPerigee: Math.abs(apsis.daysToPerigee) < 1,
        isApogee: Math.abs(apsis.daysToApogee) < 1,
        ...apsis,
        percentCloser: distance < constantsLunar.LUNAR_MEAN_DISTANCE_KM ? Math.round(((constantsLunar.LUNAR_MEAN_DISTANCE_KM - distance) / constantsLunar.LUNAR_MEAN_DISTANCE_KM) * 100) : 0,
        percentFarther: distance > constantsLunar.LUNAR_MEAN_DISTANCE_KM ? Math.round(((distance - constantsLunar.LUNAR_MEAN_DISTANCE_KM) / constantsLunar.LUNAR_MEAN_DISTANCE_KM) * 100) : 0,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function __getLunarTimes(date, latitude, longitude) {
    const moonHorizon = -0.8167;
    const times = { rise: undefined, set: undefined };

    // Check polar conditions first
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const noonPosition = getLunarPosition(new Date(startOfDay.getTime() + 12 * 60 * 60000), latitude, longitude),
        midnightPosition = getLunarPosition(startOfDay, latitude, longitude);
    const minAlt = Math.min(noonPosition.altitude, midnightPosition.altitude),
        maxAlt = Math.max(noonPosition.altitude, midnightPosition.altitude);
    // eslint-disable-next-line unicorn/no-null
    if (minAlt > moonHorizon) return { rise: null, set: null }; // Always visible
    if (maxAlt < moonHorizon) return { rise: undefined, set: undefined }; // Never visible

    // Use adaptive step size based on latitude
    // eslint-disable-next-line unicorn/no-nested-ternary, sonarjs/no-nested-conditional
    const baseStep = Math.abs(latitude) > 60 ? 2 : Math.abs(latitude) > 45 ? 5 : 10; // minutes
    let previousAltitude = midnightPosition.altitude,
        riseFound = false,
        setFound = false;
    for (let minutes = 0; minutes < 1440; minutes += baseStep) {
        // Early exit if both events found
        if (riseFound && setFound) break;
        const checkTime = new Date(startOfDay.getTime() + minutes * 60000),
            currentAltitude = getLunarPosition(checkTime, latitude, longitude).altitude;
        // Detect rise crossing
        if (!riseFound && previousAltitude < moonHorizon && currentAltitude > moonHorizon) {
            let low = minutes - baseStep,
                high = minutes;
            while (high - low > 1) {
                const mid = Math.floor((low + high) / 2),
                    midTime = new Date(startOfDay.getTime() + mid * 60000),
                    midAlt = getLunarPosition(midTime, latitude, longitude).altitude;
                if (midAlt < moonHorizon) low = mid;
                else high = mid;
            }
            times.rise = new Date(startOfDay.getTime() + high * 60000);
            riseFound = true;
        }
        // Detect set crossing
        if (!setFound && previousAltitude > moonHorizon && currentAltitude < moonHorizon) {
            let low = minutes - baseStep,
                high = minutes;
            while (high - low > 1) {
                const mid = Math.floor((low + high) / 2),
                    midTime = new Date(startOfDay.getTime() + mid * 60000),
                    midAlt = getLunarPosition(midTime, latitude, longitude).altitude;
                if (midAlt > moonHorizon) low = mid;
                else high = mid;
            }
            times.set = new Date(startOfDay.getTime() + high * 60000);
            setFound = true;
        }
        previousAltitude = currentAltitude;
    }
    return times;
}
const lunarTimesCache = new Map(),
    lunarTimesCacheMax = 100;
function getLunarTimes(date, latitude, longitude) {
    const dateKey = new Date(date);
    dateKey.setHours(0, 0, 0, 0);
    const key = `${dateKey.getTime()}_${latitude}_${longitude}`;
    if (!lunarTimesCache.has(key)) {
        lunarTimesCache.set(key, __getLunarTimes(date, latitude, longitude));
        if (lunarTimesCache.size > lunarTimesCacheMax) lunarTimesCache.delete(lunarTimesCache.keys().next().value);
    }
    return lunarTimesCache.get(key);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarName(month, hemisphere = 'northern') {
    const names = {
        northern: ['wolf moon', 'snow moon', 'worm moon', 'pink moon', 'flower moon', 'strawberry moon', 'buck moon', 'sturgeon moon', 'harvest moon', "hunter's moon", 'beaver moon', 'cold moon'],
        southern: ['holiday moon', 'grain moon', 'harvest moon', 'seed moon', 'frost moon', 'strawberry moon', 'cold moon', 'wolf moon', 'red moon', 'barley moon', 'thunder moon', 'oak moon'],
    };
    return names[hemisphere][month];
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarBrightness(phase, distanceKm = constantsLunar.LUNAR_MEAN_DISTANCE_KM) {
    // Calculate phase angle in degrees (0° at new moon, 180° at full moon)
    const phaseAngleDegrees = phase * 360;
    const phaseAngleRadians = phaseAngleDegrees * constants.DEGREES_TO_RADIANS;
    // Brightness calculation using phase angle
    const baseBrightness = (1 + Math.cos(phaseAngleRadians)) / 2;
    // Distance correction: brightness varies with 1/r²
    const distanceRatio = (constantsLunar.LUNAR_MEAN_DISTANCE_KM / distanceKm) ** 2;
    // Opposition surge effect - peaks at full moon (180°)
    const oppositionSurge = 1 + 0.05 * Math.exp(-Math.abs(180 - phaseAngleDegrees) / 30);
    return Math.round(baseBrightness * distanceRatio * oppositionSurge * 100);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarApsis(date) {
    const anomalisticMonth = 27.554549878; // days
    const k = Math.floor((date - new Date('2000-01-01')) / constants.MILLISECONDS_PER_DAY / anomalisticMonth);
    const T = k / 1325.55, // Centuries since J2000
        T2 = T * T,
        T3 = T2 * T;
    // Mean time of perigee
    const lastPerigeeJD = 2451534.6698 + 27.55454989 * k + -0.0006691 * T2 + -0.000001098 * T3;
    const lastPerigee = new Date((lastPerigeeJD - 2440587.5) * constants.MILLISECONDS_PER_DAY + Date.UTC(1970, 0, 1));
    const daysSince = (date - lastPerigee) / constants.MILLISECONDS_PER_DAY;
    const cyclePosition = (((daysSince % anomalisticMonth) + anomalisticMonth) % anomalisticMonth) / anomalisticMonth;
    return {
        daysToPerigee: (1 - cyclePosition) * anomalisticMonth,
        daysToApogee: cyclePosition < 0.5 ? (0.5 - cyclePosition) * anomalisticMonth : (1.5 - cyclePosition) * anomalisticMonth,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarZodiac(date = new Date()) {
    // Zodiac signs start at these ecliptic longitudes
    // Note: These are tropical zodiac signs (Western astrology), not sidereal
    // The boundaries are fixed relative to the vernal equinox, not the stars
    const signs = [
        { sign: 'Aries', symbol: '♈', start: 0, meaning: 'good for new beginnings and initiatives' },
        { sign: 'Taurus', symbol: '♉', start: 30, meaning: 'good for financial planning and material goals' },
        { sign: 'Gemini', symbol: '♊', start: 60, meaning: 'good for communication and learning projects' },
        { sign: 'Cancer', symbol: '♋', start: 90, meaning: 'good for home and family matters' },
        { sign: 'Leo', symbol: '♌', start: 120, meaning: 'good for creative projects and self-expression' },
        { sign: 'Virgo', symbol: '♍', start: 150, meaning: 'good for health and organization goals' },
        { sign: 'Libra', symbol: '♎', start: 180, meaning: 'good for relationships and partnerships' },
        { sign: 'Scorpio', symbol: '♏', start: 210, meaning: 'good for transformation and deep changes' },
        { sign: 'Sagittarius', symbol: '♐', start: 240, meaning: 'good for travel and educational pursuits' },
        { sign: 'Capricorn', symbol: '♑', start: 270, meaning: 'good for career and long-term goals' },
        { sign: 'Aquarius', symbol: '♒', start: 300, meaning: 'good for community and humanitarian projects' },
        { sign: 'Pisces', symbol: '♓', start: 330, meaning: 'good for spiritual and artistic endeavors' },
    ];
    const longitude = __getLunarEclipticLongitudeForZodiac(dateToJulianDateUTC(date));
    // Find which sign the Moon is in
    const index = Math.floor(longitude / 30);
    const { sign, symbol, meaning } = signs[index];
    const { sign: next } = signs[(index + 1) % 12];
    // Calculate how far through the sign (0-30 degrees)
    const degreesInSign = longitude % 30;
    // Determine if early, middle, or late in sign
    // eslint-disable-next-line unicorn/no-nested-ternary, sonarjs/no-nested-conditional
    const position = degreesInSign < 10 ? 'early' : degreesInSign < 20 ? 'middle' : 'late';
    return {
        sign,
        symbol,
        meaning,
        position,
        next,
        approximateDaysToNext: Math.round(((30 - degreesInSign) / 13.2) * 10) / 10,
        longitude,
        degreesInSign,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

// NOTE: northern hemisphere
function getLunarFeaturesVisible(librationLon, librationLat, phase) {
    const features = [];
    // Libration in longitude reveals far side features
    if (librationLon > 5) features.push('Mare Orientale partially visible on western limb');
    if (librationLon > 7) features.push('Far side craters visible on western edge');
    if (librationLon < -5) features.push('Mare Marginis and Mare Smythii visible on eastern limb');
    if (librationLon < -7) features.push('Far side highlands visible on eastern edge');
    // Libration in latitude reveals polar regions
    if (librationLat > 5) features.push('North polar region well-exposed');
    if (librationLat > 6.5) features.push('Crater Byrd and far side visible beyond north pole');
    if (librationLat < -5) features.push('South polar region well-exposed');
    if (librationLat < -6.5) features.push('Crater Shackleton and far side visible beyond south pole');
    // Phase-dependent features
    if (phase >= 0.15 && phase <= 0.35) {
        features.push('Mare Crisium prominent near terminator');
        if (librationLon > 3) features.push('Mare Crisium appears elongated due to favorable libration');
    }
    if (phase >= 0.65 && phase <= 0.85) {
        features.push('Mare Humorum and Gassendi crater region prominent');
        if (librationLon < -3) features.push('Schickard and Phocylides craters well-positioned');
    }
    return features;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarSituation(date, latitude, longitude) {
    const phase = getLunarPhase(date);
    const distance = getLunarDistance(date);
    return {
        arguments: {
            date,
            latitude,
            longitude,
        },
        //
        phase,
        position: getLunarPosition(date, latitude, longitude),
        times: getLunarTimes(date, latitude, longitude),
        distance,
        brightness: getLunarBrightness(phase, distance.distance),
        zodiac: getLunarZodiac(date),
        name: getLunarName(date.getMonth(), latitude >= 0 ? 'northern' : 'southern'),
        constants: constantsLunar,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// function getEarthShadowRadii(sunDistanceAU, moonDistanceKm) {
// function getSolarAngularDiameter(distance) {
//     // distance in AU
//     return constants.SOLAR_ANGULAR_DIAMETER_BASE / distance; // degrees
// }
//     const sunAngularRadius = getSolarAngularDiameter(sunDistanceAU) / 2;
//     const parallax = Math.asin(6371 / moonDistanceKm) * constants.RADIANS_TO_DEGREES;
//     return {
//         penumbral: 1.2848 * parallax + 0.5450 * sunAngularRadius,
//         umbral: 0.7403 * parallax - 0.5450 * sunAngularRadius
//     };
// }

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getVenusElongation(date, observerLatitude = 0) {
    const jd = dateToJulianDateUTC(date),
        T = (jd - 2451545) / 36525;
    // Mean longitude of Venus (Meeus)
    const L = normalizeAngle(181.979801 + 58519.2130302 * T);
    // Mean anomaly of Venus
    const M = normalizeAngle(50.416444 + 58517.8038999 * T);
    const Mrad = M * constants.DEGREES_TO_RADIANS;
    // Venus orbital eccentricity
    const e = 0.00677323 - 0.00004938 * T,
        e2 = e * e,
        e3 = e2 * e;
    // Equation of center for Venus (simplified)
    const C = (2 * e - 0.25 * e3) * Math.sin(Mrad) + 1.25 * e2 * Math.sin(2 * Mrad) + (13 / 12) * e3 * Math.sin(3 * Mrad);
    // True longitude of Venus
    const L_true = normalizeAngle(L + C);
    // Get Sun's position
    const solarPos = getSolarPosition(date, 0, 0); // lat/lon don't matter for longitude
    // Calculate elongation (angular distance from Sun)
    let elongation = Math.abs(L_true - solarPos.trueLongitude);
    if (elongation > 180) elongation = 360 - elongation;
    // Determine if eastern or western elongation
    let elongationDir = L_true - solarPos.trueLongitude;
    if (elongationDir < -180) elongationDir += 360;
    if (elongationDir > 180) elongationDir -= 360;
    // Calculate ecliptic latitude of Venus (simplified)
    const i = 3.39467; // Venus orbital inclination
    const Omega = 76.68; // Longitude of ascending node (simplified as constant)
    // const w = 131.53 + 0.00004 * T; // Argument of perihelion
    const u = L_true - Omega; // Argument of latitude
    const eclipticLatitude = Math.asin(Math.sin(i * constants.DEGREES_TO_RADIANS) * Math.sin(u * constants.DEGREES_TO_RADIANS)) * constants.RADIANS_TO_DEGREES;
    // Approximate altitude bonus/penalty based on ecliptic latitude and observer latitude
    const latitudeEffect = eclipticLatitude * Math.cos(observerLatitude * constants.DEGREES_TO_RADIANS);
    return {
        elongation,
        direction: elongationDir > 0 ? 'eastern' : 'western',
        visibility: elongationDir > 0 ? 'evening' : 'morning',
        eclipticLatitude,
        altitudeBonus: latitudeEffect, // degrees of additional altitude due to ecliptic latitude
    };
}

function getVenusPosition(date, latitude, longitude) {
    const jd = dateToJulianDateUTC(date),
        T = (jd - 2451545) / 36525;
    // Venus orbital elements
    // NOTE: This calculation uses mean elements and doesn't account for planetary perturbations
    // For high-precision applications, use JPL ephemerides or VSOP87 theory
    // const L = normalizeAngle(181.979801 + 58519.2130302 * T);
    const M = normalizeAngle(50.416444 + 58517.8038999 * T);
    const a = 0.72333; // AU
    const e = 0.00677323 - 0.00004938 * T;
    const i = 3.39467; // inclination
    const omega = normalizeAngle(76.67992 + 0.9011206 * T); // ascending node
    const w = normalizeAngle(131.563703 + 1.4022288 * T); // perihelion
    // Solve Kepler's equation
    const Mrad = M * constants.DEGREES_TO_RADIANS;
    let E = Mrad;
    for (let iter = 0; iter < 10; iter++) E = Mrad + e * Math.sin(E);
    // True anomaly
    const v = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)) * constants.RADIANS_TO_DEGREES;
    // Heliocentric coordinates
    const r = a * (1 - e * Math.cos(E)),
        u = normalizeAngle(v + w);
    // Ecliptic coordinates
    const xEcl =
        r *
        (Math.cos(omega * constants.DEGREES_TO_RADIANS) * Math.cos(u * constants.DEGREES_TO_RADIANS) -
            Math.sin(omega * constants.DEGREES_TO_RADIANS) * Math.sin(u * constants.DEGREES_TO_RADIANS) * Math.cos(i * constants.DEGREES_TO_RADIANS));
    const yEcl =
        r *
        (Math.sin(omega * constants.DEGREES_TO_RADIANS) * Math.cos(u * constants.DEGREES_TO_RADIANS) +
            Math.cos(omega * constants.DEGREES_TO_RADIANS) * Math.sin(u * constants.DEGREES_TO_RADIANS) * Math.cos(i * constants.DEGREES_TO_RADIANS));
    const zEcl = r * Math.sin(u * constants.DEGREES_TO_RADIANS) * Math.sin(i * constants.DEGREES_TO_RADIANS);
    // Get Earth's position
    const earthPos = getSolarPosition(date, 0, 0),
        earthR = earthPos.distance || 1; // AU
    // Geocentric ecliptic coordinates (approximate)
    const xGeo = xEcl + earthR * Math.cos(earthPos.trueLongitude * constants.DEGREES_TO_RADIANS),
        yGeo = yEcl + earthR * Math.sin(earthPos.trueLongitude * constants.DEGREES_TO_RADIANS),
        zGeo = zEcl;
    // Convert to RA/Dec
    const obliquity = 23.439291 - 0.0130042 * T;
    const oblRad = obliquity * constants.DEGREES_TO_RADIANS;
    const xEq = xGeo,
        yEq = yGeo * Math.cos(oblRad) - zGeo * Math.sin(oblRad),
        zEq = yGeo * Math.sin(oblRad) + zGeo * Math.cos(oblRad);
    const ra = normalizeAngle(Math.atan2(yEq, xEq) * constants.RADIANS_TO_DEGREES);
    const dec = Math.atan2(zEq, Math.hypot(xEq, yEq)) * constants.RADIANS_TO_DEGREES;
    // Calculate alt/az
    const lst = localSiderealTime(jd, longitude);
    const ha = normalizeAngle(lst - ra);
    const latRad = latitude * constants.DEGREES_TO_RADIANS;
    const decRad = dec * constants.DEGREES_TO_RADIANS;
    const haRad = ha * constants.DEGREES_TO_RADIANS;
    const altitude = Math.asin(Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)) * constants.RADIANS_TO_DEGREES;
    const azimuth = normalizeAngle(Math.atan2(Math.sin(haRad), Math.cos(haRad) * Math.sin(latRad) - Math.tan(decRad) * Math.cos(latRad)) * constants.RADIANS_TO_DEGREES + 180);
    // Distance from Earth
    const distanceAU = Math.hypot(xGeo, yGeo, zGeo);
    // Magnitude (approximate)
    const phaseAngle = Math.acos((r * r + distanceAU * distanceAU - earthR * earthR) / (2 * r * distanceAU)) * constants.RADIANS_TO_DEGREES;
    const magnitude = -4.47 + 5 * Math.log10(r * distanceAU) + 0.0103 * phaseAngle + 0.000057 * phaseAngle * phaseAngle + 0.00000013 * phaseAngle * phaseAngle * phaseAngle;
    return {
        altitude,
        azimuth,
        rightAscension: ra,
        declination: dec,
        distance: distanceAU,
        magnitude,
        ...getVenusElongation(date),
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    constants: constantsLunar,
    //
    getEquinoxSolstice,
    getCrossQuarterDates,
    isNearSolstice,
    isNearEquinox,
    isNearCrossQuarter,
    //
    localSiderealTime,
    calculateNodeDistance,
    calculateAngularSeparation,
    calculateMoonriseAzimuth,
    calculateMoonsetAzimuth,
    calculateLimitingMagnitude,
    isRadiantVisible,
    isRadiantFavorable,
    //
    getSolarPosition,
    getSolarLongitude,
    //
    getLunarPhase,
    getLunarDistance,
    getLunarPosition,
    getLunarTimes,
    getLunarName,
    getLunarBrightness,
    getLunarZodiac,
    getLunarFeaturesVisible,
    getLunarApsis,
    //
    getVenusElongation,
    getVenusPosition,
    //
    getDaylightSituation,
    getSolarSituation,
    getLunarSituation,
    //
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
