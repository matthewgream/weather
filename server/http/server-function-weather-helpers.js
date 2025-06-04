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
// -----------------------------------------------------------------------------------------------------------------------------------------

function getMoonPhase(date = new Date()) {
    const knownNewMoon = new Date(2000, 0, 6),
        lunarCycle = 29.53059;
    const days = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
    return (days % lunarCycle) / lunarCycle;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateDewPoint(temp, humidity) {
    // Magnus-Tetens formula
    const a = 17.27;
    const b = 237.7;
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
        return calculateHeatIndex(temp, humidity); // For moderate conditions, just use the actual temperature
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

module.exports = {
    getDaylightHours,
    getMoonPhase,
    getDST,
    calculateDewPoint,
    calculateHeatIndex,
    calculateWindChill,
    calculateFeelsLike,
    calculateComfortLevel,
    getSeason,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
