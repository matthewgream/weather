// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');

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

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = {
    calculateDewPoint,
    calculateHeatIndex,
    calculateWindChill,
    calculateFeelsLike,
    calculateComfortLevel,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
