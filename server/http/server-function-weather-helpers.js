// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const constants = {
    MILLISECONDS_PER_SECOND: 1000,
    MILLISECONDS_PER_MINUTE: 1000 * 60,
    MILLISECONDS_PER_HOUR: 1000 * 60 * 60,
    MILLISECONDS_PER_DAY: 1000 * 60 * 60 * 24,
    DEGREES_TO_RADIANS: Math.PI / 180,
    RADIANS_TO_DEGREES: 180 / Math.PI,
    DAYS_PER_YEAR: 365.25,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
}

function azimuthToCardinal(azimuth) {
    return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(((azimuth + 22.5) % 360) / 45) % 8];
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function __dateToJulianDateUTC(date) {
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
    let a = 0,
        b = 0;
    if (year > 1582 || (year === 1582 && month > 10) || (year === 1582 && month === 10 && day >= 15)) {
        a = Math.floor(year / 100);
        b = 2 - a + Math.floor(a / 4);
    }
    const jd = Math.floor(constants.DAYS_PER_YEAR * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
    return jd + (hour + minute / 60 + second / 3600) / 24;
}
const jdCache = new Map();
function dateToJulianDateUTC(date) {
    const key = date.getTime();
    if (jdCache.has(key)) return jdCache.get(key);
    const jd = __dateToJulianDateUTC(date);
    jdCache.set(key, jd);
    if (jdCache.size > 100) jdCache.delete(jdCache.keys().next().value);
    return jd;
}

function juliandDateToDateUTC(jd) {
    const z = Math.floor(jd + 0.5),
        f = jd + 0.5 - z;
    const A = z < 2299161 ? z : z + 1 + Math.floor((z - 1867216.25) / 36524.25) - Math.floor(Math.floor((z - 1867216.25) / 36524.25) / 4),
        B = A + 1524,
        C = Math.floor((B - 122.1) / constants.DAYS_PER_YEAR),
        D = Math.floor(constants.DAYS_PER_YEAR * C),
        E = Math.floor((B - D) / 30.6001);
    const day = B - D - Math.floor(30.6001 * E) + f,
        month = E < 14 ? E - 1 : E - 13,
        year = month > 2 ? C - 4716 : C - 4715;
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
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
    return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / constants.MILLISECONDS_PER_DAY;
}

function isSameDay(a, b) {
    if (a === undefined || b === undefined) return false;
    return a.getDate() == b.getDate() && a.getMonth() == b.getMonth() && a.getFullYear() == b.getFullYear();
}

function daysBetween(a, b) {
    return a ? Math.floor((b - a) / constants.MILLISECONDS_PER_DAY) : 999;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// NOTE: european only
let lastCachedYear, lastSundayOfMarch, lastSundayOfOctober;
function getDST(date = new Date()) {
    const year = date.getFullYear(),
        month = date.getMonth();
    if (month > 10 || month < 2) return false; // November to February
    if (month > 3 && month < 9) return true; // April to September
    if (!lastCachedYear || lastCachedYear !== year) {
        const lastDayOfMarch = new Date(year, 2, 31);
        while (lastDayOfMarch.getMonth() > 2) lastDayOfMarch.setDate(lastDayOfMarch.getDate() - 1);
        lastSundayOfMarch = new Date(lastDayOfMarch);
        while (lastSundayOfMarch.getDay() !== 0) lastSundayOfMarch.setDate(lastSundayOfMarch.getDate() - 1);
        lastSundayOfMarch.setHours(2, 0, 0, 0); // 02:00 CET
        const lastDayOfOctober = new Date(year, 9, 31);
        while (lastDayOfOctober.getMonth() > 9) lastDayOfOctober.setDate(lastDayOfOctober.getDate() - 1);
        lastSundayOfOctober = new Date(lastDayOfOctober);
        while (lastSundayOfOctober.getDay() !== 0) lastSundayOfOctober.setDate(lastSundayOfOctober.getDate() - 1);
        lastSundayOfOctober.setHours(3, 0, 0, 0); // 03:00 CEST
        lastCachedYear = year;
    }
    return date >= lastSundayOfMarch && date < lastSundayOfOctober;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getSeason(date = new Date(), hemisphere = 'northern') {
    const dayOfYear = daysIntoYear(date);
    const leapAdjust = isLeapYear(date.getFullYear()) && date.getMonth() > 1 ? 1 : 0;
    // Astronomical season boundaries (approximate, varies by 1-2 days): Using average dates for simplicity
    const seasons = {
        northern: [
            { name: 'winter', start: 355, end: 80 + leapAdjust },
            { name: 'spring', start: 80 + leapAdjust, end: 172 + leapAdjust },
            { name: 'summer', start: 172 + leapAdjust, end: 266 + leapAdjust },
            { name: 'autumn', start: 266 + leapAdjust, end: 355 },
        ],
        southern: [
            { name: 'summer', start: 355, end: 80 + leapAdjust },
            { name: 'autumn', start: 80 + leapAdjust, end: 172 + leapAdjust },
            { name: 'winter', start: 172 + leapAdjust, end: 266 + leapAdjust },
            { name: 'spring', start: 266 + leapAdjust, end: 355 },
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

module.exports = {
    constants,
    //
    normalizeAngle,
    azimuthToCardinal,
    //
    getDST,
    daysIntoYear,
    isSameDay,
    daysBetween,
    normalizeTime,
    isLeapYear,
    dateToJulianDateUTC,
    juliandDateToDateUTC,
    getSeason,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
