// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const DEGREES_TO_RADIANS = Math.PI / 180;
// const RADIANS_TO_DEGREES = 180 / Math.PI;
// const ASTRONOMICAL_UNIT_KM = 149597870.7;
const LUNAR_CYCLE_DAYS = 29.53059;
const LUNAR_MEAN_DISTANCE_KM = 384400;

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
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5 + (hour + minute / 60 + second / 3600) / 24;
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
        { start: daylight.civilDawn, end: daylight.sunriseDecimal, phase: 'civil_dawn' },
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
    const solarNoon = 12 - eqTime / 60 - longitude / 15;
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
    const daylightAngle = (Math.cos((90.8333 * Math.PI) / 180) - Math.sin(latitudeRad) * Math.sin(declination)) / (Math.cos(latitudeRad) * Math.cos(declination));
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
    const a = 17.27,
        b = 237.7;
    const alpha = (a * temp) / (b + temp) + Math.log(humidity / 100);
    return (b * alpha) / (a - alpha);
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
    if (temp > 10 || windSpeed <= 1.3) return temp; // Only applicable for temps <= 10°C and wind > 1.3 m/s
    const windSpeedKmh = windSpeed * 3.6; // Convert wind speed to km/h
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
    return {
        northern: ['winter', 'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'winter'],
        southern: ['summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter', 'winter', 'spring', 'spring', 'summer'],
    }[hemisphere][date.getMonth()];
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
    const springEquinox = new Date(year, 2, 20),
        autumnEquinox = new Date(year, 8, 22); // March 20 / September 22
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

function isNearCrossQuarter(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear(),
        month = date.getMonth();
    const dates = [
        { date: new Date(year, 1, 1), name: 'Imbolc', northern: 'Imbolc (early spring)', southern: 'Lughnasadh (early autumn)' },
        { date: new Date(year, 4, 1), name: 'Beltane', northern: 'Beltane (early summer)', southern: 'Samhain (early winter)' },
        { date: new Date(year, 7, 1), name: 'Lughnasadh', northern: 'Lughnasadh (early autumn)', southern: 'Imbolc (early spring)' },
        { date: new Date(year, 10, 1), name: 'Samhain', northern: 'Samhain (early winter)', southern: 'Beltane (early summer)' },
    ];
    if (month === 0) dates.push({ date: new Date(year - 1, 10, 1), name: 'Samhain', northern: 'Samhain (early winter)', southern: 'Beltane (early summer)' });
    if (month === 11) dates.push({ date: new Date(year + 1, 1, 1), name: 'Imbolc', northern: 'Imbolc (early spring)', southern: 'Lughnasadh (early autumn)' });
    for (const item of dates) {
        const days = (item.date - date) / MILLISECONDS_PER_DAY;
        if (Math.abs(days) <= daysWindow)
            return {
                near: true,
                type: `cross-quarter ${hemisphere === 'northern' ? item.northern : item.southern}`,
                days,
            };
    }
    return { near: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function localSiderealTime(jd, longitude) {
    const T = (jd - 2451545) / 36525,
        st = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T;
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
    const equationOfTime = 4 * (L0 - 0.0057183 - alpha + longitude * (longitude > 180 ? -1 : 1));
    // Solar noon calculation
    const noon = 12 - equationOfTime / 60 - longitude / 15;
    return {
        altitude,
        azimuth,
        direction: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(azimuth / 45) % 8],
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
        shadowMultiplier: position.altitude > 0.1 ? 1 / Math.tan(altitudeRadians) : Infinity,
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
    // Convert to radians
    const toRad = Math.PI / 180;
    const Drad = D * toRad;
    const Mrad = M * toRad;
    const Mprad = Mp * toRad;
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
        -0.031 * Math.sin(Mprad + Mrad);
    // Calculate corrected elongation
    const elongation = (((D + corrections) % 360) + 360) % 360;
    // Convert to phase (0 = new, 0.5 = full)
    return elongation / 360;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarDistance(date = new Date()) {
    const jd = dateToJulianDateUTC(date),
        T = (jd - 2451545) / 36525;
    // Mean anomaly of moon
    const M = (134.963 + 13.064993 * T * 36525) % 360,
        Mrad = (M * Math.PI) / 180;
    const distance = 385000.56 - 20905.355 * Math.cos(Mrad) - 3699.111 * Math.cos(2 * Mrad) - 2955.968 * Math.cos(3 * Mrad);
    const phase = getLunarPhase(date);
    return {
        distance,
        isSupermoon: distance < 360000 && (Math.abs(phase - 0.5) < 0.02 || phase < 0.02 || phase > 0.98),
        isMicromoon: distance > 405000 && Math.abs(phase - 0.5) < 0.02,
        isPerigee: distance < 363000,
        isApogee: distance > 405000,
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
    const epsilonRad = epsilon * toRad;
    const lonRad = lon * toRad;
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
    return {
        altitude,
        azimuth,
        direction: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(azimuth / 45) % 8],
        illuminatedFraction,
        ra,
        dec,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

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
            if (previousAltitude < -0.5 && position.altitude > -0.5) times.rise = checkTime;
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
    return Math.round(((1 - Math.cos(phase * 2 * Math.PI)) / 2) * 100);
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
    const longitude = (((L + 6.289 * Math.sin(Mrad) + 1.274 * Math.sin(2 * Drad - Mrad) + 0.658 * Math.sin(2 * Drad) + 0.214 * Math.sin(2 * Mrad) - 0.186 * Math.sin(Mrad) - 0.114 * Math.sin(2 * Drad)) % 360) + 360) % 360;
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
        // The Moon spends about 2.5 days in each sign
        approximateDaysInSign: 2.5,
    };
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

const geomagneticActivity = {
    // January through December (0-11)
    0: 1.5, // January
    1: 2, // February
    2: 2.5, // March - Spring equinox
    3: 2.8, // April
    4: 1.8, // May
    5: 1.5, // June
    6: 1.2, // July
    7: 1.5, // August
    8: 2.8, // September - Autumn equinox
    9: 3, // October
    10: 2.5, // November
    11: 2, // December
};

function getGeomagneticActivity(month) {
    return geomagneticActivity[month] || 2;
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
