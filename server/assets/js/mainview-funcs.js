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
const isLeapYear = (yr) => (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
function __jdToDoy(jd) {
    const ymd = __jdToYMD(jd);
    return Math.floor((275 * ymd.month) / 9) - (isLeapYear(ymd.year) ? 1 : 2) * Math.floor((ymd.month + 9) / 12) + ymd.day - 30;
}
function __jdTimeCentury(jd) {
    return (jd - 2451545) / 36525;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

let lastCachedYear, lastSundayOfMarch, lastSundayOfOctober;
// eslint-disable-next-line no-unused-vars
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

function isNumber(inputVal) {
    var oneDecimal = false,
        inputStr = '' + String(inputVal);
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
function radToDeg(angleRad) {
    return (180 * angleRad) / Math.PI;
}
function degToRad(angleDeg) {
    return (Math.PI * angleDeg) / 180;
}
function formatDate(date, minutes) {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, minutes, (minutes - Math.floor(minutes)) * 60));
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
    return 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60; // in degrees
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
        y = Math.tan(degToRad(calcObliquityCorrection(t)) / 2) ** 2;
    const sin2l0 = Math.sin(2 * l0Rad),
        sinm = Math.sin(mRad),
        cos2l0 = Math.cos(2 * l0Rad),
        sin4l0 = Math.sin(4 * l0Rad),
        sin2m = Math.sin(2 * mRad);
    return radToDeg(y * sin2l0 - 2 * e * sinm + 4 * e * y * sinm * cos2l0 - 0.5 * y * y * sin4l0 - 1.25 * e * e * sin2m) * 4; // in minutes of time
}
function calcHourAngle(angle, lat, solarDec) {
    const latitudeRad = degToRad(lat),
        sdRad = degToRad(solarDec);
    return Math.acos(Math.cos(degToRad(90 + angle)) / (Math.cos(latitudeRad) * Math.cos(sdRad)) - Math.tan(latitudeRad) * Math.tan(sdRad)); // in radians (for sunset, use -HA)
}
function calcSolNoon(jd, longitude, date) {
    const solNoonOffset = 720 - longitude * 4 - calcEquationOfTime(__jdTimeCentury(jd - longitude / 360)),
        solNoonLocal = 720 - longitude * 4 - calcEquationOfTime(__jdTimeCentury(jd + solNoonOffset / 1440)); // in minutes
    return formatDate(date, ((solNoonLocal % 1440) + 1440) % 1440);
}
function calcSunriseSetUTC(rise, angle, jd, latitude, longitude) {
    const t = __jdTimeCentury(jd);
    return 720 - 4 * (longitude + radToDeg(calcHourAngle(angle, latitude, calcSunDeclination(t)) * (rise ? 1 : -1))) - calcEquationOfTime(t); // in minutes
}
function calcJDofNextPrevRiseSet(next, rise, type, jd, latitude, longitude) {
    var jday = jd,
        time = calcSunriseSetUTC(rise, type, jday, latitude, longitude);
    while (!isNumber(time)) {
        jday += next ? 1 : -1;
        time = calcSunriseSetUTC(rise, type, jday, latitude, longitude);
    }
    return jday;
}
function calcSunriseSet(rise, angle, jd, date, latitude, longitude) {
    // rise = 1 for sunrise, 0 for sunset
    const timeUTCNew = calcSunriseSetUTC(rise, angle, jd + calcSunriseSetUTC(rise, angle, jd, latitude, longitude) / 1440, latitude, longitude);
    if (isNumber(timeUTCNew)) return formatDate(date, timeUTCNew);
    const doy = __jdToDoy(jd),
        next = (latitude > 66.4 && doy > 79 && doy < 267) || (latitude < -66.4 && (doy < 83 || doy > 263)) ? !rise : rise; // no sunrise/set found
    return __jdToDate(calcJDofNextPrevRiseSet(next, rise, angle, jd, latitude, longitude)); //previous sunrise/next sunset OR previous sunset/next sunrise
}

const degreesBelowHorizon = {
    sunrise: 0.833,
    sunriseEnd: 0.3,
    twilight: 6,
    nauticalTwilight: 12,
    night: 18,
    goldenHour: -6,
};

// eslint-disable-next-line no-unused-vars
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
