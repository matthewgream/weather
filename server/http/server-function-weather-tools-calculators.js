// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const { constants } = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateDewPoint(temp, humidity) {
    // Magnus-Tetens formula
    if (temp === undefined || temp === null || humidity === undefined || humidity === null) return undefined;
    if (humidity <= 0 || humidity > 100) return undefined;
    if (temp < -50 || temp > 60) return undefined;
    const a = 17.625,
        b = 243.04;
    const alpha = (a * temp) / (b + temp) + Math.log(humidity / 100);
    const dewPoint = (b * alpha) / (a - alpha);
    return Number.isFinite(dewPoint) ? dewPoint : undefined;
}

function calculateHeatIndex(temp, humidity) {
    if (temp === undefined || temp === null || humidity === undefined || humidity === null) return undefined;
    if (temp < 20) return temp; // Only applicable for temps > 20°C
    const tempF = (temp * 9) / 5 + 32; // Convert to Fahrenheit for the standard formula
    let heatIndexF = 0.5 * (tempF + 61 + (tempF - 68) * 1.2 + humidity * 0.094); // Simplified heat index formula
    if (tempF >= 80) {
        // Use more precise formula if hot enough, rothfusz regression coefficients for heat index calculation: based on Steadman's 1979 table
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
    if (temp === undefined || temp === null || windSpeed === undefined || windSpeed === null) return undefined;
    const windSpeedKmh = windSpeed * 3.6;
    if (temp >= 10 || windSpeedKmh < 4.8) return temp;
    // Environment Canada formula
    const windPow = windSpeedKmh ** 0.16;
    return 13.12 + 0.6215 * temp - 11.37 * windPow + 0.3965 * temp * windPow;
}

function calculateFeelsLike(temp, humidity, windSpeed) {
    if (temp === undefined || temp === null) return undefined;
    if (temp <= 10)
        // For cold conditions, use wind chill
        return calculateWindChill(temp, windSpeed) ?? temp;
    else if (temp >= 20)
        // For warm conditions, use heat index
        return calculateHeatIndex(temp, humidity) ?? temp;
    // For moderate conditions, just use the actual temperature
    else return temp;
}

function calculateComfortLevel(temp, humidity, windSpeed, solarRad) {
    if (temp === undefined || temp === null || humidity === undefined || humidity === null) return 'unknown';
    const feelsLike = calculateFeelsLike(temp, humidity, windSpeed);
    if (feelsLike === undefined) return 'unknown';
    if (feelsLike < -10 || feelsLike > 35) return 'very uncomfortable';
    if (feelsLike < 0 || feelsLike > 30) return 'uncomfortable';
    if ((temp > 20 && humidity > 80) || humidity < 20) return 'somewhat uncomfortable';
    if (windSpeed > 8) return 'somewhat uncomfortable';
    if (solarRad > 700) return 'somewhat uncomfortable';
    if (feelsLike >= 18 && feelsLike <= 24 && humidity >= 30 && humidity <= 60) return 'very comfortable';
    if (feelsLike >= 15 && feelsLike <= 28) return 'comfortable';
    return 'moderately comfortable';
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateGeomagneticLatitude(geoLat, geoLon) {
    // Simplified dipole model - geomagnetic north pole ~80.5°N, 72.8°W
    const poleLat = (80.5 * Math.PI) / 180;
    const poleLon = (-72.8 * Math.PI) / 180;
    const lat = (geoLat * Math.PI) / 180;
    const lon = (geoLon * Math.PI) / 180;
    return (Math.asin(Math.sin(lat) * Math.sin(poleLat) + Math.cos(lat) * Math.cos(poleLat) * Math.cos(lon - poleLon)) * 180) / Math.PI;
}

function isNearLocation(lat1, lon1, lat2, lon2, radiusDeg = 15) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return true; // If no location data, include it
    return Math.abs(lat1 - lat2) < radiusDeg && Math.abs(lon1 - lon2) < radiusDeg;
}

function calculatePointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return calculateHaversineDistance(px, py, x1, y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return calculateHaversineDistance(px, py, x1 + t * dx, y1 + t * dy);
}

function calculateDistanceToPath(lat, lon, pathCoords) {
    if (!pathCoords || pathCoords.length === 0) return undefined;
    let minDist = Infinity;
    // Check distance to path segments
    for (let i = 0; i < pathCoords.length - 1; i++) {
        const p1 = pathCoords[i];
        const p2 = pathCoords[i + 1];
        const dist = calculatePointToSegmentDistance(lat, lon, p1.lat, p1.lon, p2.lat, p2.lon);
        if (dist < minDist) minDist = dist;
    }
    // Also check distance to endpoints
    for (const p of pathCoords) {
        const dist = calculateHaversineDistance(lat, lon, p.lat, p.lon);
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}

function calculateDaylightChangeRate(latitude) {
    // Seconds per day change, peaks at equinox
    // sin(latitude) gives rough approximation of change rate factor
    return Math.floor(Math.abs(Math.sin((latitude * Math.PI) / 180)) * 4) * 60;
}

function calculateTwilightDuration(latitude) {
    // Twilight duration increases with latitude in Seconds
    return Math.floor(90 / Math.cos((latitude * Math.PI) / 180)) * 60;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    calculateDewPoint,
    calculateHeatIndex,
    calculateWindChill,
    calculateFeelsLike,
    calculateComfortLevel,
    calculateHaversineDistance,
    calculateGeomagneticLatitude,
    isNearLocation,
    calculatePointToSegmentDistance,
    calculateDistanceToPath,
    calculateDaylightChangeRate,
    calculateTwilightDuration,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
