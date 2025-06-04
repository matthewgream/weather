// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const msPerDay = 1000 * 60 * 60 * 24;

// -----------------------------------------------------------------------------------------------------------------------------------------
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
// -----------------------------------------------------------------------------------------------------------------------------------------

const normalizeTime = (time) => (time < 0 ? time + 24 : time >= 24 ? time - 24 : time);

const isLeapYear = (yr) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;

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

function getDaylightPhase(currentHourDecimal, daylight) {
    if (daylight.isDaytime) return 'day';

    // Calculate nautical and astronomical twilight times
    const nauticalDawnDecimal = daylight.civilDawnDecimal - 1, // Approximate
        nauticalDuskDecimal = daylight.civilDuskDecimal + 1, // Approximate
        astronomicalDawnDecimal = nauticalDawnDecimal - 1, // Approximate
        astronomicalDuskDecimal = nauticalDuskDecimal + 1; // Approximate

    if (currentHourDecimal >= daylight.civilDawnDecimal && currentHourDecimal < daylight.sunriseDecimal) return 'civil_dawn';
    else if (currentHourDecimal >= daylight.sunsetDecimal && currentHourDecimal <= daylight.civilDuskDecimal) return 'civil_twilight';
    else if (currentHourDecimal >= nauticalDawnDecimal && currentHourDecimal < daylight.civilDawnDecimal) return 'nautical_dawn';
    else if (currentHourDecimal > daylight.civilDuskDecimal && currentHourDecimal <= nauticalDuskDecimal) return 'nautical_twilight';
    else if (currentHourDecimal >= astronomicalDawnDecimal && currentHourDecimal < nauticalDawnDecimal) return 'astronomical_dawn';
    else if (currentHourDecimal > nauticalDuskDecimal && currentHourDecimal <= astronomicalDuskDecimal) return 'astronomical_twilight';

    return 'night';
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

function calculateHeatIndex(temp, rh) {
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

function getSeason(hemisphere = 'northern') {
    const seasons = {
        northern: ['winter', 'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'winter'],
        southern: ['summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter', 'winter', 'spring', 'spring', 'summer'],
    };
    return seasons[hemisphere][new Date().getMonth()];
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isNearSolstice(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear(),
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

function isNearEquinox(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear(),
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

function isNearCrossQuarter(date = new Date(), hemisphere = 'northern', daysWindow = 7) {
    const year = date.getFullYear(),
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

function getMoonPhase(date = new Date()) {
    const lunarNewBase = new Date(2000, 0, 6),
        lunarCycle = 29.53059;
    const days = (date.getTime() - lunarNewBase.getTime()) / msPerDay;
    return (days % lunarCycle) / lunarCycle;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    getDST,
    getDaylightHours,
    getDaylightPhase,
    calculateDewPoint,
    calculateHeatIndex,
    calculateWindChill,
    calculateFeelsLike,
    calculateComfortLevel,
    getSeason,
    isNearSolstice,
    isNearEquinox,
    isNearCrossQuarter,
    getMoonPhase,
    getMoonDistance,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
