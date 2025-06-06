// XXX review

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const msPerDay = 1000 * 60 * 60 * 24;

function dateToJulianDateUTC(date) {
    const year = date.getUTCFullYear(),
        month = date.getUTCMonth() + 1,
        day = date.getUTCDate(),
        hour = date.getUTCHours(),
        minute = date.getUTCMinutes(),
        second = date.getUTCSeconds();
    const a = Math.floor((14 - month) / 12),
        y = year + 4800 - a,
        m = month + 12 * a - 3;
    return (
        day +
        Math.floor((153 * m + 2) / 5) +
        365 * y +
        Math.floor(y / 4) -
        Math.floor(y / 100) +
        Math.floor(y / 400) -
        32045 +
        (hour - 12) / 24 +
        minute / 1440 +
        second / 86400
    );
}

function localSiderealTime(jd, longitude) {
    const T = (jd - 2451545) / 36525,
        st = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T;
    return (st + longitude) % 360;
}

function getSolarLongitude(jd) {
    const n = jd - 2451545,
        L = (280.46 + 0.9856474 * n) % 360,
        g = (((357.528 + 0.9856003 * n) % 360) * Math.PI) / 180;
    return (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360;
}

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

function normalizeTime(time) {
    if (time < 0) return time + 24;
    return time >= 24 ? time - 24 : time;
}

function isLeapYear(yr) {
    return (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
}

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
    const otherYearRelevantSolstice = isNorthern
        ? date.getMonth() < 6
            ? prevYearWinterSolstice
            : nextYearSummerSolstice
        : date.getMonth() < 6
          ? new Date(year - 1, 5, 21)
          : new Date(year + 1, 11, 21);
    const currentYearLongestDay = isNorthern ? currentYearSummerSolstice : currentYearWinterSolstice;
    const currentYearShortestDay = isNorthern ? currentYearWinterSolstice : currentYearSummerSolstice;
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
            near: true,
            name: isNorthern ? 'Imbolc (early spring)' : 'Lughnasadh (early autumn)',
            exact: Math.abs(daysToImbolc) < 1,
            days: daysToImbolc,
        };
    else if (daysToBeltane <= daysWindow)
        return {
            near: true,
            name: isNorthern ? 'Beltane (early summer)' : 'Samhain (early winter)',
            exact: Math.abs(daysToBeltane) < 1,
            days: daysToBeltane,
        };
    else if (daysToLughnasadh <= daysWindow)
        return {
            near: true,
            name: isNorthern ? 'Lughnasadh (early autumn)' : 'Imbolc (early spring)',
            exact: Math.abs(daysToLughnasadh) < 1,
            days: daysToLughnasadh,
        };
    else if (daysToSamhain <= daysWindow)
        return {
            near: true,
            name: isNorthern ? 'Samhain (early winter)' : 'Beltane (early summer)',
            exact: Math.abs(daysToSamhain) < 1,
            days: daysToSamhain,
        };
    return { near: false };
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarPhase(date = new Date()) {
    const lunarNewBase = new Date(2000, 0, 6),
        lunarCycle = 29.53059;
    const days = (date.getTime() - lunarNewBase.getTime()) / msPerDay;
    return (days % lunarCycle) / lunarCycle;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarDistance(date = new Date()) {
    const phase = getLunarPhase(date),
        distance = 384400 * (1 - 0.0549 * Math.cos(phase * 2 * Math.PI));
    return {
        distance, // in km
        isSupermoon: distance < 367000 && Math.abs(phase - 0.5) < 0.1, // Full moon at perigee
        isMicromoon: distance > 400000 && Math.abs(phase - 0.5) < 0.1, // Full moon at apogee
        isCloseApproach: distance < 370000, // Generally close approach
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarPosition(date, latitude, longitude) {
    const jd = dateToJulianDateUTC(date),
        T = (jd - 2451545) / 36525;

    const L = (218.316 + 13.176396 * T * 36525) % 360,
        M = (134.963 + 13.064993 * T * 36525) % 360,
        F = (93.272 + 13.22935 * T * 36525) % 360;

    const lon = (L + 6.289 * Math.sin((M * Math.PI) / 180) + 1.274 * Math.sin(((2 * F - M) * Math.PI) / 180)) % 360,
        lat = 5.128 * Math.sin((F * Math.PI) / 180);

    const lst = localSiderealTime(jd, longitude),
        ha = lst - lon;

    const altitude =
        (Math.asin(
            Math.sin((lat * Math.PI) / 180) * Math.sin((latitude * Math.PI) / 180) +
                Math.cos((lat * Math.PI) / 180) * Math.cos((latitude * Math.PI) / 180) * Math.cos((ha * Math.PI) / 180)
        ) *
            180) /
        Math.PI;
    const azimuth =
        (Math.atan2(
            Math.sin((ha * Math.PI) / 180),
            Math.cos((ha * Math.PI) / 180) * Math.sin((latitude * Math.PI) / 180) - Math.tan((lat * Math.PI) / 180) * Math.cos((latitude * Math.PI) / 180)
        ) *
            180) /
        Math.PI;

    return {
        altitude,
        azimuth: (azimuth + 360) % 360,
        illuminatedFraction: (1 - Math.cos(((L - getSolarLongitude(jd)) * Math.PI) / 180)) / 2,
    };
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarTimes(date, latitude, longitude) {
    const times = { rise: undefined, set: undefined };

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
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarName(month) {
    return [
        'wolf moon',
        'snow moon',
        'worm moon',
        'pink moon',
        'flower moon',
        'strawberry moon',
        'buck moon',
        'sturgeon moon',
        'harvest moon',
        "hunter's moon",
        'beaver moon',
        'cold moon',
    ][month];
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getLunarZodiac(date = new Date()) {
    const daysSinceJ2000 = (date - new Date('2000-01-01T12:00:00Z')) / msPerDay;

    const L = (218.316 + 13.176396 * daysSinceJ2000) % 360,
        M = (134.963 + 13.064993 * daysSinceJ2000) % 360,
        D = (297.85 + 12.190749 * daysSinceJ2000) % 360;
    const toRad = Math.PI / 180,
        Mrad = M * toRad,
        Drad = D * toRad;

    // Apply main corrections for true longitude, and normalize to 0-360
    let longitude = L;
    longitude += 6.289 * Math.sin(Mrad);
    longitude += 1.274 * Math.sin(2 * Drad - Mrad);
    longitude += 0.658 * Math.sin(2 * Drad);
    longitude += 0.214 * Math.sin(2 * Mrad);
    longitude -= 0.186 * Math.sin(Mrad);
    longitude -= 0.114 * Math.sin(2 * Drad);
    longitude = ((longitude % 360) + 360) % 360;

    // Zodiac signs start at these ecliptic longitudes
    const zodiacSigns = [
        { sign: 'Aries', symbol: '♈', start: 0 },
        { sign: 'Taurus', symbol: '♉', start: 30 },
        { sign: 'Gemini', symbol: '♊', start: 60 },
        { sign: 'Cancer', symbol: '♋', start: 90 },
        { sign: 'Leo', symbol: '♌', start: 120 },
        { sign: 'Virgo', symbol: '♍', start: 150 },
        { sign: 'Libra', symbol: '♎', start: 180 },
        { sign: 'Scorpio', symbol: '♏', start: 210 },
        { sign: 'Sagittarius', symbol: '♐', start: 240 },
        { sign: 'Capricorn', symbol: '♑', start: 270 },
        { sign: 'Aquarius', symbol: '♒', start: 300 },
        { sign: 'Pisces', symbol: '♓', start: 330 },
    ];
    const zodiacMeanings = {
        Aries: 'good for new beginnings and initiatives',
        Taurus: 'good for financial planning and material goals',
        Gemini: 'good for communication and learning projects',
        Cancer: 'good for home and family matters',
        Leo: 'good for creative projects and self-expression',
        Virgo: 'good for health and organization goals',
        Libra: 'good for relationships and partnerships',
        Scorpio: 'good for transformation and deep changes',
        Sagittarius: 'good for travel and educational pursuits',
        Capricorn: 'good for career and long-term goals',
        Aquarius: 'good for community and humanitarian projects',
        Pisces: 'good for spiritual and artistic endeavors',
    };
    const signs = zodiacSigns.map((signs) => signs.sign);

    // Find which sign the Moon is in
    const { sign, symbol } = zodiacSigns[Math.floor(longitude / 30)];
    const meaning = zodiacMeanings[sign];

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
        next: signs[(signs.indexOf(sign) + 1) % 12],
        // The Moon spends about 2.5 days in each sign
        approximateDaysInSign: 2.5,
    };
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
    return now > event.detected + cooldownDays * 24 * 60 * 60 * 1000;
}

function pruneEvents(store, daysAgo = 30) {
    if (!store.events || Date.now() - store.eventsCleanedUp < 24 * 60 * 60 * 1000) return;
    const expiry = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
    Object.entries(store.events).forEach(([category, events]) => {
        Object.entries(events)
            .filter(([_, event]) => event.expires < expiry)
            .forEach(([eventId]) => delete store.events[category][eventId]);
    });
    store.eventsCleanedUp = Date.now();
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    getDST,
    getDaylightHours,
    getDaylightPhase,
    getSeason,
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
    getLunarPhase,
    getLunarDistance,
    getLunarPosition,
    getLunarTimes,
    getLunarName,
    getLunarZodiac,
    //
    addEvent,
    getEvents,
    isEventCooldown,
    pruneEvents,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
