// XXX review

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');
const toolsData = require('./server-function-weather-tools-data.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCombination(results, situation, data, data_previous) {
    const { month, hour, location, dewPoint, windChill } = situation;
    const { timestamp, temp, humidity, pressure, windSpeed, rainRate, snowDepth, cloudCover } = data;

    // Snow type determination
    if (temp < 0 && humidity > 70 && rainRate > 0) {
        if (temp < -10) {
            results.phenomena.push('light powder snow likely');
            if (windSpeed > 5) results.phenomena.push('blowing snow conditions');
        } else if (temp < -5) results.phenomena.push('dry snow likely');
        else results.phenomena.push('wet snow likely');
    }

    // Frost conditions (not during precipitation)
    if (temp < -2 && humidity > 70 && rainRate === 0) {
        if (humidity > 90 && windSpeed < 2) {
            results.phenomena.push('heavy frost likely');
            if (hour >= 4 && hour <= 8) results.phenomena.push('morning hoar frost possible');
        } else results.phenomena.push('frost likely');
    }

    // Snow load on trees
    if ((temp < 0 || snowDepth > 0) && cloudCover > 70 && month >= 10 && month <= 3) {
        results.phenomena.push('snow accumulation on trees possible');
        if (windSpeed > 5) {
            results.alerts.push('risk of snow-laden branches');
            if (windSpeed > 10 && snowDepth > 100) results.alerts.push('significant tree damage risk');
        }
    }

    // Freezing rain - very specific conditions
    if (temp < 2 && temp > -8 && rainRate > 0) {
        if (temp > -2 && temp < 1 && humidity > 90) {
            results.phenomena.push('freezing rain likely');
            results.alerts.push('severe ice hazard');
            if (location.forestCoverage === 'high') results.alerts.push('forest ice damage risk');
        } else {
            results.phenomena.push('freezing rain possible');
            results.alerts.push('ice hazard warning');
        }
    }

    // Nordic humidity comfort
    if (temp > 20 && humidity > 75) {
        results.phenomena.push('humid for Nordic climate');
        if (temp > 25 && humidity > 80) results.phenomena.push('unusually humid conditions');
    }

    // Forest-specific fog prediction
    if (Math.abs(temp - dewPoint) < 3 && temp > 0) {
        if (location.forestCoverage === 'high') {
            if (hour < 10 || hour > 18) {
                results.phenomena.push('forest fog likely');
                if (Math.abs(temp - dewPoint) < 1) results.phenomena.push('dense fog in forest valleys');
            } else results.phenomena.push('patchy forest fog possible');
        } else results.phenomena.push('fog likely');
    }

    // Forest fire risk assessment
    if (month >= 5 && month <= 8 && temp > 22 && humidity < 40 && rainRate === 0) {
        results.phenomena.push('dry forest conditions');
        const past3Days = toolsData.getRecentData(data_previous, timestamp, 3 * 24);
        if (past3Days.isReasonablyDistributed()) {
            const dryHours = past3Days.entries.filter((e) => e.rainRate !== undefined && e.rainRate === 0 && e.humidity < 40).length;
            if (humidity < 30 && temp > 25) {
                results.alerts.push('high forest fire risk');
                if (windSpeed > 10) results.alerts.push('extreme fire danger - rapid spread possible');
            } else if (dryHours > 48) results.alerts.push('elevated forest fire risk');
            // Additional: check for rain in past week
            const pastWeek = toolsData.getRecentData(data_previous, timestamp, 7 * 24);
            if (pastWeek.isReasonablyDistributed()) {
                const rainEvents = pastWeek.entries.filter((e) => e.rainRate > 0).length;
                if (rainEvents < 5 && dryHours > 60) results.alerts.push('prolonged dry conditions - extreme fire risk');
            }
        }
    }

    // Complex precipitation predictions
    if (pressure !== undefined && humidity !== undefined) {
        // Check pressure trend
        const past3Hours = toolsData.getRecentData(data_previous, timestamp, 3);
        let pressureTrend = 'stable';
        if (past3Hours.isReasonablyDistributed()) {
            const oldestPressure = past3Hours.oldest('pressure');
            if (oldestPressure !== undefined) {
                const pressureChange = pressure - oldestPressure;
                if (pressureChange < -2) pressureTrend = 'falling';
                else if (pressureChange > 2) pressureTrend = 'rising';
            }
        }
        // More nuanced precipitation forecasting
        if (pressure < 1000 && humidity > 75) {
            if (pressure < 990 && humidity > 85) {
                results.phenomena.push('rain very likely');
                if (temp < 5 && month >= 10 && month <= 3) results.phenomena.push('winter precipitation imminent');
            } else results.phenomena.push('rain likely');
            if (pressureTrend === 'falling' && humidity > 80) results.phenomena.push('precipitation approaching');
        } else if (pressure > 1020 && humidity < 40) {
            results.phenomena.push('clear and dry conditions');
            if (temp < -5 && month >= 11 && month <= 2) results.phenomena.push('arctic high pressure - very cold');
        } else if (pressure > 1015 && pressure < 1020 && humidity > 60 && humidity < 75) results.phenomena.push('fair weather');
    }

    // Enhanced wind chill communication
    if (temp !== undefined && windSpeed !== undefined && temp < 10 && windSpeed > 3) {
        const windChillDiff = Math.round(temp - windChill);
        if (windChillDiff >= 3) {
            results.phenomena.push(`feels ${windChillDiff}°C colder due to wind`);
            // More detailed wind chill warnings
            if (windChill < -25) results.alerts.push('extreme wind chill - frostbite risk in minutes');
            else if (windChill < -15) results.alerts.push('severe wind chill - limit outdoor exposure');
            else if (windChill < -10 && windChillDiff >= 5) results.phenomena.push('significant wind chill factor');
        }
    }

    // Thunderstorm potential
    if (temp > 20 && humidity > 70 && pressure < 1010) {
        const past2Hours = toolsData.getRecentData(data_previous, timestamp, 2);
        if (past2Hours.isReasonablyDistributed()) {
            const tempChange = temp - past2Hours.oldest('temp');
            const tempRateOfChange = tempChange / 2; // °C per hour
            if (tempRateOfChange > 2) {
                results.phenomena.push('thunderstorm development likely');
                if (windSpeed !== undefined && windSpeed < 5 && month >= 6 && month <= 8) results.phenomena.push('conditions favorable for strong thunderstorms');
            } else if (tempRateOfChange > 1) {
                results.phenomena.push('convective development possible');
            }
            // Also check for rapid pressure drops
            const pressureChange = pressure - past2Hours.oldest('pressure');
            if (pressureChange < -3 && tempRateOfChange > 1) results.phenomena.push('rapid atmospheric destabilization');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function () {
    return {
        interpretCombination,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
