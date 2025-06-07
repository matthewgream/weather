// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const DEGREES_TO_RADIANS = Math.PI / 180;
// const RADIANS_TO_DEGREES = 180 / Math.PI;
// const ASTRONOMICAL_UNIT_KM = 149597870.7;
const LUNAR_CYCLE_DAYS = 29.53059;
const LUNAR_MEAN_DISTANCE_KM = 384399;

const DAYS_PER_YEAR = 365.25;
const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

const constants = {
    MILLISECONDS_PER_DAY,
    DAYS_PER_YEAR,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function dateToJulianDateUTC(date) {
    let year = date.getUTCFullYear(),
        month = date.getUTCMonth() + 1,
        day = date.getUTCDate(),
        hour = date.getUTCHours(),
        minute = date.getUTCMinutes(),
        second = date.getUTCSeconds();
    if (month <= 2) {
        year = year - 1;
        month = month + 12;
    }
    const a = Math.floor(year / 100),
        b = 2 - a + Math.floor(a / 4);
    const jd = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
    return jd + (hour + minute / 60 + second / 3600) / 24;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function normalizeTime(time) {
    if (time < 0) return time + 24;
    return time >= 24 ? time - 24 : time;
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysIntoYear(date = new Date()) {
    return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / MILLISECONDS_PER_DAY;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// NOTE: european only
function getDST(date = new Date()) {
    const year = date.getFullYear(),
        month = date.getMonth();
    if (month > 10 || month < 2) return false; // November to February
    if (month > 3 && month < 9) return true; // April to September
    const lastDayOfMarch = new Date(year, 2, 31);
    while (lastDayOfMarch.getMonth() > 2) lastDayOfMarch.setDate(lastDayOfMarch.getDate() - 1);
    const lastSundayOfMarch = new Date(lastDayOfMarch);
    while (lastSundayOfMarch.getDay() !== 0) lastSundayOfMarch.setDate(lastSundayOfMarch.getDate() - 1);
    lastSundayOfMarch.setHours(2, 0, 0, 0); // 02:00 CET
    const lastDayOfOctober = new Date(year, 9, 31);
    while (lastDayOfOctober.getMonth() > 9) lastDayOfOctober.setDate(lastDayOfOctober.getDate() - 1);
    const lastSundayOfOctober = new Date(lastDayOfOctober);
    while (lastSundayOfOctober.getDay() !== 0) lastSundayOfOctober.setDate(lastSundayOfOctober.getDate() - 1);
    lastSundayOfOctober.setHours(3, 0, 0, 0); // 03:00 CEST
    return date >= lastSundayOfMarch && date < lastSundayOfOctober;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function __getDaylightPhase(hourDecimal, daylight) {
    if (daylight.isDaytime) return 'day';
    if (daylight.isMidnightSun) return 'midnight_sun';
    if (daylight.isPolarNight) return 'polar_night';
    if (daylight.astronomicalDawn === null || daylight.astronomicalDusk === null) return 'white_night';
    const phases = [
        { start: daylight.astronomicalDawn, end: daylight.nauticalDawn, phase: 'astronomical_dawn' },
        { start: daylight.nauticalDawn, end: daylight.civilDawn, phase: 'nautical_dawn' },
        { start: daylight.civilDawn, end: daylight.sunriseDecimal - 0.001, phase: 'civil_dawn' },
        { start: daylight.sunsetDecimal, end: daylight.civilDusk, phase: 'civil_dusk' },
        { start: daylight.civilDusk, end: daylight.nauticalDusk, phase: 'nautical_dusk' },
        { start: daylight.nauticalDusk, end: daylight.astronomicalDusk, phase: 'astronomical_dusk' },
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

const daylightAngles = {
    daylight: -0.8333, // Standard sunrise/sunset with refraction
    civil: -6,
    nautical: -12,
    astronomical: -18,
};

function getDaylightHours(date, latitude, longitude) {
    const year = date.getFullYear(),
        hours = date.getHours(),
        minutes = date.getMinutes(),
        tzoffset = date.getTimezoneOffset();
    const latitudeRad = (latitude * Math.PI) / 180;
    const fracYear = ((2 * Math.PI) / (isLeapYear(year) ? 366 : 365)) * (daysIntoYear(date) - 1 + (hours - 12) / 24);
    const declination = 0.006918 - 0.399912 * Math.cos(fracYear) + 0.070257 * Math.sin(fracYear) - 0.006758 * Math.cos(2 * fracYear) + 0.000907 * Math.sin(2 * fracYear) - 0.002697 * Math.cos(3 * fracYear) + 0.00148 * Math.sin(3 * fracYear);
    const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(fracYear) - 0.032077 * Math.sin(fracYear) - 0.014615 * Math.cos(2 * fracYear) - 0.040849 * Math.sin(2 * fracYear));
    const solarNoon = 12 - eqTime / 60 + longitude / 15;
    const utcOffset = -tzoffset / 60;

    const times = {};
    for (const [type, angle] of Object.entries(daylightAngles)) {
        const cosHourAngle = (Math.cos(((90 - angle) * Math.PI) / 180) - Math.sin(latitudeRad) * Math.sin(declination)) / (Math.cos(latitudeRad) * Math.cos(declination));
        if (cosHourAngle >= -1 && cosHourAngle <= 1) {
            const hourAngle = (Math.acos(cosHourAngle) * 180) / Math.PI / 15;
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
    const daylightAngle = (Math.cos(((90 + refractionDegrees) * Math.PI) / 180) - Math.sin(latitudeRad) * Math.sin(declination)) / (Math.cos(latitudeRad) * Math.cos(declination));
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

function getDaylight(date, latitude, longitude) {
    const daylight = getDaylightHours(date, latitude, longitude);
    return { ...daylight, phase: __getDaylightPhase(date.getHours() + date.getMinutes() / 60, daylight) };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateDewPoint(temp, humidity) {
    // Magnus-Tetens formula
    if (humidity <= 0 || humidity > 100) return temp; // Invalid humidity
    if (temp < -50 || temp > 60) return temp; // Extreme temps
    const a = 17.625,
        b = 243.04;
    const alpha = (a * temp) / (b + temp) + Math.log(humidity / 100);
    const dewPoint = (b * alpha) / (a - alpha);
    return Number.isFinite(dewPoint) ? dewPoint : temp;
}

function calculateHeatIndex(temp, humidity) {
    if (temp < 20) return temp; // Only applicable for temps > 20°C
    const tempF = (temp * 9) / 5 + 32; // Convert to Fahrenheit for the standard formula
    let heatIndexF = 0.5 * (tempF + 61 + (tempF - 68) * 1.2 + humidity * 0.094); // Simplified heat index formula
    if (tempF >= 80) {
        // Use more precise formula if hot enough
        heatIndexF =
            -42.379 +
            2.04901523 * tempF +
            10.14333127 * humidity -
            0.22475541 * tempF * humidity -
            6.83783e-3 * tempF * tempF -
            5.481717e-2 * humidity * humidity +
            1.22874e-3 * tempF * tempF * humidity +
            8.5282e-4 * tempF * humidity * humidity -
            1.99e-6 * tempF * tempF * humidity * humidity;
        if (humidity < 13 && tempF >= 80 && tempF <= 112)
            // Apply adjustment for low humidity or cool temps
            heatIndexF -= ((13 - humidity) / 4) * Math.hypot((17 - Math.abs(tempF - 95)) / 17);
        else if (humidity > 85 && tempF >= 80 && tempF <= 87) heatIndexF += ((humidity - 85) / 10) * ((87 - tempF) / 5);
    }
    return ((heatIndexF - 32) * 5) / 9; // Convert back to Celsius
}

function calculateWindChill(temp, windSpeed) {
    // Wind chill applies below 10°C AND with sufficient wind (greater than 4.8km/h)
    const windSpeedKmh = windSpeed * 3.6;
    if (temp >= 10 || windSpeedKmh < 4.8) return temp;
    return 13.12 + 0.6215 * temp - 11.37 * windSpeedKmh ** 0.16 + 0.3965 * temp * windSpeedKmh ** 0.16; // Calculate wind chill using Environment Canada formula
}

function calculateFeelsLike(temp, humidity, windSpeed) {
    if (temp <= 10)
        // For cold conditions, use wind chill
        return calculateWindChill(temp, windSpeed);
    else if (temp >= 20)
        // For warm conditions, use heat index
        return calculateHeatIndex(temp, humidity);
    // For moderate conditions, just use the actual temperature
    else return temp;
}

function calculateComfortLevel(temp, humidity, windSpeed, solarRad) {
    const feelsLike = calculateFeelsLike(temp, humidity, windSpeed);
    if (feelsLike < -10 || feelsLike > 35) return 'very uncomfortable';
    if (feelsLike < 0 || feelsLike > 30) return 'uncomfortable';
    if ((temp > 20 && humidity > 80) || humidity < 20) return 'somewhat uncomfortable';
    if (windSpeed > 8) return 'somewhat uncomfortable';
    if (solarRad > 700) return 'somewhat uncomfortable';
    if (feelsLike >= 18 && feelsLike <= 24 && humidity >= 30 && humidity <= 60) return 'very comfortable';
    if (feelsLike >= 15 && feelsLike <= 28) return 'comfortable';
    return 'moderately comfortable';
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getSeason(date = new Date(), hemisphere = 'northern') {
    const year = date.getFullYear();
    const dayOfYear = Math.floor((date - new Date(year, 0, 0)) / MILLISECONDS_PER_DAY);
    // Astronomical season boundaries (approximate, varies by 1-2 days): Using average dates for simplicity
    const seasons = {
        northern: [
            { name: 'winter', start: 355, end: 79 }, // ~Dec 21 - Mar 20
            { name: 'spring', start: 79, end: 172 }, // ~Mar 20 - Jun 21
            { name: 'summer', start: 172, end: 266 }, // ~Jun 21 - Sep 23
            { name: 'autumn', start: 266, end: 355 }, // ~Sep 23 - Dec 21
        ],
        southern: [
            { name: 'summer', start: 354, end: 80 }, // ~Dec 20 - Mar 21
            { name: 'autumn', start: 80, end: 171 }, // ~Mar 21 - Jun 20
            { name: 'winter', start: 172, end: 266 }, // ~Jun 21 - Sep 23
            { name: 'spring', start: 266, end: 355 }, // ~Sep 23 - Dec 21
        ],
    };
    for (const season of seasons[hemisphere] || seasons.northern) {
        if (season.start > season.end) {
            if (dayOfYear >= season.start || dayOfYear < season.end) return season.name;
        } else {
            if (dayOfYear >= season.start && dayOfYear < season.end) return season.name;
        }
    }
    // Fallback (shouldn't reach here)
    return hemisphere === 'northern' ? 'winter' : 'summer';
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getCrossQuarterDates(year) {
    // Cross-quarter days occur when solar longitude is 45°, 135°, 225°, 315°
    const targetLongitudes = [
        { lon: 315, name: 'Imbolc', northern: 'Imbolc (early spring)', southern: 'Lughnasadh (early autumn)' },
        { lon: 45, name: 'Beltane', northern: 'Beltane (early summer)', southern: 'Samhain (early winter)' },
        { lon: 135, name: 'Lughnasadh', northern: 'Lughnasadh (early autumn)', southern: 'Imbolc (early spring)' },
        { lon: 225, name: 'Samhain', northern: 'Samhain (early winter)', southern: 'Beltane (early summer)' },
    ];
    const crossQuarterDates = [];
    for (const target of targetLongitudes) {
        // Approximate dates as starting points
        const approxDates = {
            315: new Date(year, 1, 2), // ~Feb 2
            45: new Date(year, 4, 6), // ~May 6
            135: new Date(year, 7, 6), // ~Aug 6
            225: new Date(year, 10, 6), // ~Nov 6
        };
        let testDate = approxDates[target.lon];
        let prevLon = undefined;
        // Search within ±10 days for exact crossing
        for (let offset = -10; offset <= 10; offset++) {
            const date = new Date(testDate.getTime() + offset * MILLISECONDS_PER_DAY);
            const lon = getSolarLongitude(dateToJulianDateUTC(date));
            if (prevLon !== undefined) {
                // Check if we crossed the target longitude
                if ((prevLon < target.lon && lon >= target.lon) || (target.lon === 315 && prevLon > 300 && lon < 20)) {
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

function isNearSolstice(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear(),
        month = date.getMonth(),
        time = date.getTime(),
        isNorthern = hemisphere === 'northern';
    const currentYearSummerSolstice = new Date(year, 5, 21),
        currentYearWinterSolstice = new Date(year, 11, 21); // June 21 / December 21
    const prevYearWinterSolstice = new Date(year - 1, 11, 21),
        nextYearSummerSolstice = new Date(year + 1, 5, 21); // Dec 21 / June 21
    const otherYearRelevantSolstice = isNorthern ? (month < 6 ? prevYearWinterSolstice : nextYearSummerSolstice) : month < 6 ? new Date(year - 1, 5, 21) : new Date(year + 1, 11, 21);
    const currentYearLongestDay = isNorthern ? currentYearSummerSolstice : currentYearWinterSolstice;
    const currentYearShortestDay = isNorthern ? currentYearWinterSolstice : currentYearSummerSolstice;
    const daysToCurrYearLongest = (currentYearLongestDay.getTime() - time) / MILLISECONDS_PER_DAY,
        daysToCurrYearShortest = (currentYearShortestDay.getTime() - time) / MILLISECONDS_PER_DAY,
        daysToOtherYearSolstice = (otherYearRelevantSolstice.getTime() - time) / MILLISECONDS_PER_DAY;
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
    const springEquinox = new Date(year, 2, 20), // Can vary Mar 19-21
        autumnEquinox = new Date(year, 8, 22); // Can vary Sep 22-23
    const firstEquinox = isNorthern ? springEquinox : autumnEquinox,
        secondEquinox = isNorthern ? autumnEquinox : springEquinox;
    const daysToFirst = (firstEquinox.getTime() - time) / MILLISECONDS_PER_DAY,
        daysToSecond = (secondEquinox.getTime() - time) / MILLISECONDS_PER_DAY;
    const prevYearSecondEquinox = new Date(year - 1, 8, 22),
        daysToPrevYearSecond = (prevYearSecondEquinox.getTime() - time) / MILLISECONDS_PER_DAY;
    const nextYearFirstEquinox = new Date(year + 1, 2, 20),
        daysToNextYearFirst = (nextYearFirstEquinox.getTime() - time) / MILLISECONDS_PER_DAY;
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

const crossQuarterDatesCache = {};
function isNearCrossQuarter(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear();
    const yearsToCheck = [year];
    if (date.getMonth() === 0) yearsToCheck.push(year - 1);
    if (date.getMonth() === 11) yearsToCheck.push(year + 1);
    for (const y of yearsToCheck) {
        if (!crossQuarterDatesCache[y]) crossQuarterDatesCache[y] = getCrossQuarterDates(y);
    }
    for (const y of yearsToCheck) {
        for (const item of crossQuarterDatesCache[y]) {
            const days = (item.date - date) / MILLISECONDS_PER_DAY;
            if (Math.abs(days) <= daysWindow) {
                return {
                    near: true,
                    type: `cross-quarter ${hemisphere === 'northern' ? item.northern : item.southern}`,
                    days,
                    exactDate: item.date,
                };
            }
        }
    }
    return { near: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function localSiderealTime(jd, longitude) {
    const T = (jd - 2451545) / 36525;
    const st = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - (T * T * T) / 38710000;
    return (st + longitude) % 360;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateAngularSeparation(ra1, dec1, ra2, dec2) {
    // Convert to radians
    const toRad = Math.PI / 180,
        ra1Rad = ra1 * toRad,
        dec1Rad = dec1 * toRad,
        ra2Rad = ra2 * toRad,
        dec2Rad = dec2 * toRad;
    // Using the Haversine formula for celestial sphere
    const deltaRA = ra2Rad - ra1Rad,
        deltaDec = dec2Rad - dec1Rad;
    const a = Math.sin(deltaDec / 2) * Math.sin(deltaDec / 2) + Math.cos(dec1Rad) * Math.cos(dec2Rad) * Math.sin(deltaRA / 2) * Math.sin(deltaRA / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // Return separation in degrees
    return (c * 180) / Math.PI;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateMoonriseAzimuth(lunarTimes, location) {
    const lunarPosition = getLunarPosition(lunarTimes.rise, location.latitude, location.longitude);
    const dec = (lunarPosition.dec * Math.PI) / 180,
        lat = (location.latitude * Math.PI) / 180;
    // Calculate azimuth at horizon
    // cos(Az) = sin(dec) / cos(lat)
    const cosAz = Math.sin(dec) / Math.cos(lat);
    // Handle edge cases where moon doesn't rise/set at this latitude
    if (cosAz > 1) return 90; // Moon rises due east (only possible at equator)
    if (cosAz < -1) return 90; // Should not happen for rising
    // Azimuth at rising (eastern horizon)
    const azimuth = (Math.acos(cosAz) * 180) / Math.PI;
    // Adjust for declination sign
    return lunarPosition.dec < 0 ? 180 - azimuth : azimuth;
}

function calculateMoonsetAzimuth(lunarTimes, location) {
    const lunarPosition = getLunarPosition(lunarTimes.set, location.latitude, location.longitude);
    const dec = (lunarPosition.dec * Math.PI) / 180,
        lat = (location.latitude * Math.PI) / 180;
    const cosAz = Math.sin(dec) / Math.cos(lat);
    if (cosAz > 1) return 270; // Moon sets due west (only possible at equator)
    if (cosAz < -1) return 270; // Should not happen for setting
    // Azimuth at setting (western horizon)
    const azimuth = (Math.acos(cosAz) * 180) / Math.PI;
    return lunarPosition.dec > 0 ? 360 - azimuth : 180 + azimuth;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getSolarPosition(date, latitude, longitude) {
    const jd = dateToJulianDateUTC(date);
    const T = (jd - 2451545) / 36525;
    // Mean longitude of sun (ensure positive)
    const L0 = (((280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360) + 360) % 360;
    // Mean anomaly of sun (ensure positive)
    const M = (((357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360) + 360) % 360;
    const Mrad = (M * Math.PI) / 180;
    // Equation of center
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad) + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) + 0.000289 * Math.sin(3 * Mrad);
    // True longitude (ensure positive)
    const trueLongitude = (((L0 + C) % 360) + 360) % 360;
    // Obliquity of ecliptic
    const epsilon = 23.439291 - 0.0130042 * T - 0.00000016 * T * T + 0.0000005 * T * T * T;
    const epsilonRad = (epsilon * Math.PI) / 180;
    // Right ascension and declination
    const trueLongRad = (trueLongitude * Math.PI) / 180;
    const alpha = (Math.atan2(Math.cos(epsilonRad) * Math.sin(trueLongRad), Math.cos(trueLongRad)) * 180) / Math.PI;
    const delta = (Math.asin(Math.sin(epsilonRad) * Math.sin(trueLongRad)) * 180) / Math.PI;
    // Hour angle
    const lst = localSiderealTime(jd, longitude);
    const H = (lst - alpha + 360) % 360;
    // Convert to altitude/azimuth
    const latRad = (latitude * Math.PI) / 180;
    const deltaRad = (delta * Math.PI) / 180;
    const Hrad = (H * Math.PI) / 180;
    const altitude = (Math.asin(Math.sin(latRad) * Math.sin(deltaRad) + Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(Hrad)) * 180) / Math.PI;
    const azimuth = ((Math.atan2(Math.sin(Hrad), Math.cos(Hrad) * Math.sin(latRad) - Math.tan(deltaRad) * Math.cos(latRad)) * 180) / Math.PI + 180) % 360;
    // Equation of time in minutes
    const equationOfTime = 4 * (L0 - 0.0057183 - alpha);
    // Solar noon calculation
    const noon = 12 - equationOfTime / 60 - longitude / 15;
    return {
        altitude,
        azimuth,
        direction: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(((azimuth + 22.5) % 360) / 45) % 8],
        declination: delta,
        rightAscension: alpha,
        hourAngle: H,
        trueLongitude,
        equationOfTime,
        noon: noon < 0 ? noon + 24 : noon >= 24 ? noon - 24 : noon,
    };
}

function getSolarLongitude(jd) {
    const n = jd - 2451545,
        L = (280.46 + 0.9856474 * n) % 360,
        g = (((357.528 + 0.9856003 * n) % 360) * Math.PI) / 180;
    return (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getSolarSituation(date, latitude, longitude) {
    const position = getSolarPosition(date, latitude, longitude);
    const altitudeRadians = position.altitude * (Math.PI / 180);

    return {
        position,
        altitudeRadians,
        isGoldenHour: position.altitude > 0 && position.altitude < 10,
        isBlueHour: position.altitude > -6 && position.altitude < 0,
        shadowMultiplier: position.altitude > 0.5 ? 1 / Math.tan(altitudeRadians) : position.altitude > 0.1 ? 100 : Infinity,
    };
}
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarPhase(date = new Date()) {
    const jd = dateToJulianDateUTC(date);
    const T = (jd - 2451545) / 36525;
    // Fundamental arguments (Meeus)
    const D = (297.8501921 + 445267.1114034 * T) % 360; // Mean elongation Moon-Sun
    const M = (357.5291092 + 35999.0502909 * T) % 360; // Sun's mean anomaly
    const Mp = (134.9633964 + 477198.8675055 * T) % 360; // Moon's mean anomaly
    const F = (93.272095 + 483202.0175233 * T) % 360;
    // Convert to radians
    const toRad = Math.PI / 180;
    const Drad = D * toRad;
    const Mrad = M * toRad;
    const Mprad = Mp * toRad;
    const Frad = F * toRad;
    // Apply corrections for a more accurate phase
    // These are the primary periodic terms
    const corrections =
        -1.274 * Math.sin(Mprad - 2 * Drad) + // Evection
        +0.658 * Math.sin(2 * Drad) + // Variation
        -0.186 * Math.sin(Mprad) + // Annual equation
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
    const elongation = (((D + corrections) % 360) + 360) % 360;
    // Phase is based on elongation (0° = new moon, 180° = full moon)
    return (1 - Math.cos((elongation * Math.PI) / 180)) / 2;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarDistance(date = new Date()) {
    const jd = dateToJulianDateUTC(date),
        T = (jd - 2451545) / 36525;
    // Mean anomaly of moon
    const M = (134.963 + 13.064993 * T * 36525) % 360,
        Mrad = (M * Math.PI) / 180;
    const distance = 385000.56 - 20905 * Math.cos(Mrad) - 3699.111 * Math.cos(2 * Mrad) - 2955.968 * Math.cos(3 * Mrad);
    const phase = getLunarPhase(date);
    const apsis = getLunarApsis(date);
    return {
        distance,
        isSupermoon: distance < 361863 && (Math.abs(phase - 0.5) < 0.02 || phase < 0.02 || phase > 0.98),
        isMicromoon: distance > 405000 && Math.abs(phase - 0.5) < 0.02,
        isPerigee: Math.abs(apsis.daysToPerigee) < 1,
        isApogee: Math.abs(apsis.daysToApogee) < 1,
        ...apsis,
        percentCloser: distance < LUNAR_MEAN_DISTANCE_KM ? Math.round(((LUNAR_MEAN_DISTANCE_KM - distance) / LUNAR_MEAN_DISTANCE_KM) * 100) : 0,
        percentFarther: distance > LUNAR_MEAN_DISTANCE_KM ? Math.round(((distance - LUNAR_MEAN_DISTANCE_KM) / LUNAR_MEAN_DISTANCE_KM) * 100) : 0,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarPosition(date, latitude, longitude) {
    const jd = dateToJulianDateUTC(date);
    const T = (jd - 2451545) / 36525;
    // Fundamental arguments (Meeus Ch. 47)
    const L = (218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + (T * T * T) / 538841 - (T * T * T * T) / 65194000) % 360;
    const D = (297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T * T * T) / 545868 - (T * T * T * T) / 113065000) % 360;
    const M = (357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + (T * T * T) / 24490000) % 360;
    const Mp = (134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T * T * T) / 69699 - (T * T * T * T) / 14712000) % 360;
    const F = (93.272095 + 483202.0175233 * T - 0.0036539 * T * T - (T * T * T) / 3526000 + (T * T * T * T) / 863310000) % 360;
    // Convert to radians
    const toRad = Math.PI / 180;
    // const Lrad = L * toRad;
    const Drad = D * toRad;
    const Mrad = M * toRad;
    const Mprad = Mp * toRad;
    const Frad = F * toRad;
    // Longitude corrections (simplified)
    const lon =
        L +
        6.289 * Math.sin(Mprad) +
        1.274 * Math.sin(2 * Drad - Mprad) +
        0.658 * Math.sin(2 * Drad) +
        0.214 * Math.sin(2 * Mprad) -
        0.186 * Math.sin(Mprad) -
        0.114 * Math.sin(2 * Frad) +
        0.059 * Math.sin(2 * Drad - 2 * Mprad) +
        0.057 * Math.sin(2 * Drad - Mrad - Mprad) +
        0.053 * Math.sin(2 * Drad + Mprad) +
        0.046 * Math.sin(2 * Drad - Mrad);
    // Latitude corrections (simplified)
    const lat = 5.128 * Math.sin(Frad) + 0.28 * Math.sin(Mprad + Frad) + 0.277 * Math.sin(Mprad - Frad) + 0.173 * Math.sin(2 * Drad - Frad);
    // Convert to equatorial coordinates
    const epsilon = 23.439291 - 0.0130042 * T;
    const omega = (125.04452 - 1934.136261 * T) % 360;
    const omegaRad = omega * toRad;
    const deltaPsi = -0.00569 - 0.00478 * Math.sin(omegaRad); // Nutation in longitude
    const deltaEpsilon = 0.00256 * Math.cos(omegaRad); // Nutation in obliquity
    const epsilonTrue = epsilon + deltaEpsilon;
    const epsilonRad = epsilonTrue * toRad;
    const lonTrue = lon + deltaPsi; // Apply nutation to longitude
    const lonRad = lonTrue * toRad;
    const latRad = lat * toRad;
    // Right ascension and declination
    const x = Math.cos(latRad) * Math.cos(lonRad);
    const y = Math.cos(epsilonRad) * Math.cos(latRad) * Math.sin(lonRad) - Math.sin(epsilonRad) * Math.sin(latRad);
    const z = Math.sin(epsilonRad) * Math.cos(latRad) * Math.sin(lonRad) + Math.cos(epsilonRad) * Math.sin(latRad);
    const ra = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    const dec = (Math.asin(z) * 180) / Math.PI;
    // Hour angle
    const lst = localSiderealTime(jd, longitude);
    const ha = (lst - ra + 360) % 360;
    // Convert to altitude/azimuth
    const latitudeRad = latitude * toRad;
    const decRad = dec * toRad;
    const haRad = ha * toRad;
    const altitude = (Math.asin(Math.sin(latitudeRad) * Math.sin(decRad) + Math.cos(latitudeRad) * Math.cos(decRad) * Math.cos(haRad)) * 180) / Math.PI;
    const azimuth = ((Math.atan2(Math.sin(haRad), Math.cos(haRad) * Math.sin(latitudeRad) - Math.tan(decRad) * Math.cos(latitudeRad)) * 180) / Math.PI + 180) % 360;
    // Illuminated fraction
    const elongation = Math.acos(Math.cos((lon - getSolarLongitude(jd)) * toRad) * Math.cos(lat * toRad));
    const illuminatedFraction = (1 - Math.cos(elongation)) / 2;
    const librationLon = -1.274 * Math.sin(Mprad - 2 * Drad) + 0.658 * Math.sin(2 * Drad) - 0.186 * Math.sin(Mprad);
    const librationLat = -0.173 * Math.sin(Frad - 2 * Drad);
    return {
        altitude,
        azimuth,
        direction: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(((azimuth + 22.5) % 360) / 45) % 8],
        illuminatedFraction,
        ra,
        dec,
        libration: {
            longitude: librationLon, // Positive = east limb visible
            latitude: librationLat, // Positive = north pole visible
            // Features visible due to libration
            features: getVisibleLunarFeatures(librationLon, librationLat), // You'd implement this
        },
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const moonHorizon = -0.5667 - 0.25; // Approximately -0.8167

function getLunarTimes(date, latitude, longitude) {
    try {
        const times = { rise: undefined, set: undefined };
        if (Math.abs(latitude) > 85) return times;
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        let previousAltitude = getLunarPosition(startOfDay, latitude, longitude).altitude;
        for (let minutes = 0; minutes < 1440; minutes += 10) {
            const checkTime = new Date(startOfDay.getTime() + minutes * 60000),
                position = getLunarPosition(checkTime, latitude, longitude);
            if (previousAltitude < moonHorizon && position.altitude > moonHorizon) times.rise = checkTime;
            else if (previousAltitude > -0.5 && position.altitude < -0.5) times.set = checkTime;
            previousAltitude = position.altitude;
        }
        return times;
    } catch (e) {
        console.error('getLunarTimes, error:', e);
        return { rise: undefined, set: undefined };
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarName(month) {
    return ['wolf moon', 'snow moon', 'worm moon', 'pink moon', 'flower moon', 'strawberry moon', 'buck moon', 'sturgeon moon', 'harvest moon', "hunter's moon", 'beaver moon', 'cold moon'][month];
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarBrightness(phase) {
    const phaseAngle = Math.abs(phase - 0.5) * 2 * Math.PI,
        brightness = ((1 + Math.cos(phaseAngle)) / 2) * 100;
    return Math.round(brightness * (1 + 0.05 * Math.cos(phaseAngle))); // Opposition surge
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarApsis(date) {
    const anomalisticMonth = 27.554549878; // days
    const k = Math.floor((date - new Date('2000-01-01')) / MILLISECONDS_PER_DAY / anomalisticMonth);
    const T = k / 1325.55; // Centuries since J2000
    // Mean time of perigee
    const lastPerigeeJD = 2451534.6698 + 27.55454989 * k + -0.0006691 * T * T + -0.000001098 * T * T * T;
    const lastPerigee = new Date((lastPerigeeJD - 2440587.5) * MILLISECONDS_PER_DAY);
    const daysSince = (date - lastPerigee) / MILLISECONDS_PER_DAY;
    const cyclePosition = (daysSince % anomalisticMonth) / anomalisticMonth;
    return {
        daysToPerigee: cyclePosition < 0.5 ? cyclePosition * anomalisticMonth : (1 - cyclePosition) * anomalisticMonth,
        daysToApogee: cyclePosition < 0.5 ? (0.5 - cyclePosition) * anomalisticMonth : (1.5 - cyclePosition) * anomalisticMonth,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarZodiac(date = new Date()) {
    const daysSinceJ2000 = (date - new Date('2000-01-01T12:00:00Z')) / MILLISECONDS_PER_DAY;
    const L = (218.316 + 13.176396 * daysSinceJ2000) % 360,
        M = (134.963 + 13.064993 * daysSinceJ2000) % 360,
        D = (297.85 + 12.190749 * daysSinceJ2000) % 360;
    const toRad = Math.PI / 180,
        Mrad = M * toRad,
        Drad = D * toRad;
    // Apply main corrections for true longitude, and normalize to 0-360
    const longitude =
        (((L +
            6.289 * Math.sin(Mprad) +
            1.274 * Math.sin(2 * Drad - Mprad) +
            0.658 * Math.sin(2 * Drad) +
            0.214 * Math.sin(2 * Mprad) +
            -0.186 * Math.sin(Mprad) +
            -0.114 * Math.sin(2 * Frad) +
            0.059 * Math.sin(2 * Drad - 2 * Mprad) +
            0.057 * Math.sin(2 * Drad - Mrad - Mprad) +
            0.053 * Math.sin(2 * Drad + Mprad) +
            0.046 * Math.sin(2 * Drad - Mrad) +
            -0.041 * Math.sin(Mrad - Mprad) +
            -0.035 * Math.sin(Drad) +
            -0.031 * Math.sin(Mrad + Mprad)) %
            360) +
            360) %
        360;
    // Zodiac signs start at these ecliptic longitudes
    const zodiacSigns = [
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
    // Find which sign the Moon is in
    const index = Math.floor(longitude / 30);
    const { sign, symbol, meaning } = zodiacSigns[index];
    const { sign: next } = zodiacSigns[(index + 1) % 12];
    // Calculate how far through the sign (0-30 degrees)
    const degreesInSign = longitude % 30;
    // Determine if early, middle, or late in sign
    let position;
    if (degreesInSign < 10) position = 'early';
    else if (degreesInSign < 20) position = 'middle';
    else position = 'late';
    return {
        sign,
        symbol,
        longitude,
        degreesInSign,
        position,
        meaning,
        next,
        approximateDaysToNext: Math.round(((30 - degreesInSign) / 13.2) * 10) / 10, // Moon moves ~13.2°/day
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getVisibleLunarFeatures(librationLon, librationLat, phase) {
    const features = [];
    // Libration in longitude reveals far side features
    if (librationLon > 5) {
        features.push('Mare Orientale partially visible on western limb');
        if (librationLon > 7) features.push('Far side craters visible on western edge');
    } else if (librationLon < -5) {
        features.push('Mare Marginis and Mare Smythii visible on eastern limb');
        if (librationLon < -7) features.push('Far side highlands visible on eastern edge');
    }
    // Libration in latitude reveals polar regions
    if (librationLat > 5) {
        features.push('North polar region well-exposed');
        if (librationLat > 6.5) features.push('Crater Byrd and far side visible beyond north pole');
    } else if (librationLat < -5) {
        features.push('South polar region well-exposed');
        if (librationLat < -6.5) features.push('Crater Shackleton and far side visible beyond south pole');
    }
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
    return {
        phase,
        position: getLunarPosition(date, latitude, longitude),
        times: getLunarTimes(date, latitude, longitude),
        distance: getLunarDistance(date),
        brightness: getLunarBrightness(phase),
        zodiac: getLunarZodiac(date),
        name: getLunarName(date.getMonth()),
        constants: {
            LUNAR_CYCLE_DAYS,
            LUNAR_MEAN_DISTANCE_KM,
        },
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getVenusElongation(date) {
    const jd = dateToJulianDateUTC(date),
        T = (jd - 2451545) / 36525;
    // Mean longitude of Venus (Meeus)
    const L_venus = (181.979801 + 58519.2130302 * T) % 360;
    // Mean anomaly of Venus
    const M_venus = (50.416444 + 58517.8038999 * T) % 360;
    const M_venus_rad = (M_venus * Math.PI) / 180;
    // Venus orbital eccentricity
    const e_venus = 0.00677323 - 0.00004938 * T;
    // Equation of center for Venus (simplified)
    const C_venus = (2 * e_venus - 0.25 * e_venus * e_venus * e_venus) * Math.sin(M_venus_rad) + 1.25 * e_venus * e_venus * Math.sin(2 * M_venus_rad) + (13 / 12) * e_venus * e_venus * e_venus * Math.sin(3 * M_venus_rad);
    // True longitude of Venus
    const L_venus_true = (L_venus + C_venus) % 360;
    // Get Sun's position
    const solarPos = getSolarPosition(date, 0, 0); // lat/lon don't matter for longitude
    const L_sun = solarPos.trueLongitude;
    // Calculate elongation (angular distance from Sun)
    let elongation = Math.abs(L_venus_true - L_sun);
    if (elongation > 180) elongation = 360 - elongation;
    // Determine if eastern or western elongation
    let elongationDir = L_venus_true - L_sun;
    if (elongationDir < -180) elongationDir += 360;
    if (elongationDir > 180) elongationDir -= 360;
    return {
        elongation,
        direction: elongationDir > 0 ? 'eastern' : 'western',
        visibility: elongationDir > 0 ? 'evening' : 'morning',
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getGeomagneticActivity(month, year) {
    const baseActivity = {
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
    // Solar cycle is ~11 years, maximum around 2025, 2036, etc.
    const solarCyclePhase = (((year - 2025) % 11) + 11) % 11;
    const solarMultiplier = 1 + 0.5 * Math.cos((solarCyclePhase * 2 * Math.PI) / 11);
    return baseActivity[month] * solarMultiplier;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function addEvent(store, category, eventId, message, durationHours = 24) {
    if (!store.events) {
        store.events = {};
        store.eventsCleanedUp = Date.now();
    }
    if (!store.events[category]) store.events[category] = {};
    const now = Date.now(),
        event = store.events[category][eventId];
    if (!event || now > event.expires) {
        store.events[category][eventId] = {
            message,
            detected: now,
            expires: now + durationHours * 60 * 60 * 1000,
            shown: false,
        };
        return true;
    }
    return false;
}

function getEvents(store, category) {
    if (!store.events || !store.events[category]) return [];
    const now = Date.now(),
        active = [];
    for (const [eventId, event] of Object.entries(store.events[category]))
        if (now <= event.expires) {
            active.push({
                id: eventId,
                ...event,
                isNew: !event.shown,
            });
            event.shown = true;
        }
    return active;
}

function isEventCooldown(store, category, eventId, cooldownDays = 365) {
    if (!store.events || !store.events[category] || !store.events[category][eventId]) return true;
    const now = Date.now(),
        event = store.events[category][eventId];
    return now > event.detected + cooldownDays * MILLISECONDS_PER_DAY;
}

function pruneEvents(store, daysAgo = 30) {
    const now = Date.now();
    if (!store.events || store.eventsCleanedUp > now - MILLISECONDS_PER_DAY) return;
    const expiry = now - daysAgo * MILLISECONDS_PER_DAY;
    Object.entries(store.events).forEach(([category, events]) => {
        Object.entries(events)
            .filter(([_, event]) => event.expires < expiry)
            .forEach(([eventId]) => delete store.events[category][eventId]);
    });
    store.eventsCleanedUp = now;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function formatProximity(type, days) {
    if (Math.abs(days) < 1) return `${type} today`;
    else if (days > 0) return `${type} in ${Math.ceil(days)} day${Math.ceil(days) > 1 ? 's' : ''}`;
    else return `${type} ${Math.abs(Math.floor(days))} day${Math.abs(Math.floor(days)) > 1 ? 's' : ''} ago`;
}
function formatAltitude(altitude) {
    return `${Math.round(altitude)}°`;
}
function formatDirection(bearing) {
    return `${Math.round(bearing)}°`;
}
function formatPosition(altitude, bearing, direction) {
    return `${formatAltitude(altitude)} above horizon (bearing ${formatDirection(bearing)}, ${direction})`;
}
function formatVisibility(condition) {
    const visibilityMap = {
        excellent: 'excellent',
        good: 'good',
        fair: 'fair',
        poor: 'poor',
    };
    return visibilityMap[condition] || condition;
}
function formatMagnitude(mag) {
    return mag.toFixed(1);
}
function formatPercentage(value) {
    return `${Math.round(value)}%`;
}
function formatTime(hours, minutes) {
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    constants,
    //
    getDST,
    getDaylightHours,
    getDaylight,
    getSeason,
    daysIntoYear,
    dateToJulianDateUTC,
    //
    calculateDewPoint,
    calculateHeatIndex,
    calculateWindChill,
    calculateFeelsLike,
    calculateComfortLevel,
    //
    isNearSolstice,
    isNearEquinox,
    isNearCrossQuarter,
    //
    localSiderealTime,
    calculateAngularSeparation,
    calculateMoonriseAzimuth,
    calculateMoonsetAzimuth,
    //
    // getSolarPosition,
    // getSolarLongitude,
    getSolarSituation,
    //
    getLunarPhase,
    // getLunarDistance,
    // getLunarPosition,
    // getLunarTimes,
    // getLunarName,
    // getLunarBrightness,
    // getLunarZodiac,
    getLunarSituation,
    getVisibleLunarFeatures,
    //
    getVenusElongation,
    //
    getGeomagneticActivity,
    //
    addEvent,
    getEvents,
    isEventCooldown,
    pruneEvents,
    //
    formatProximity,
    formatAltitude,
    formatDirection,
    formatPosition,
    formatVisibility,
    formatMagnitude,
    formatPercentage,
    formatTime,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
