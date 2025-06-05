// XXX review

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function getAuroraPotential(latitude, month, solarActivity = undefined) {
    const isDarkSeason = month <= 2 || month >= 9;
    if (latitude >= 65)
        return {
            potential: isDarkSeason ? 'very high' : 'moderate',
            visible: isDarkSeason,
            bestTime: '22:00-02:00',
        };
    else if (latitude >= 60)
        return {
            potential: isDarkSeason ? 'high' : 'low',
            visible: isDarkSeason && solarActivity === 'high',
            bestTime: '23:00-01:00',
        };
    else if (latitude >= 55)
        return {
            potential: isDarkSeason ? 'moderate' : 'very low',
            visible: isDarkSeason && solarActivity === 'very high',
            bestTime: '00:00-01:00',
        };
    return { potential: 'very low', visible: false };
}

function interpretCombination(results, situation, data, data_previous, store, _options) {
    const { timestamp, temp, humidity, pressure, windSpeed, rainRate, snowDepth, cloudCover } = data;
    const { month, hour, date, location, dewPoint, windChill, heatIndex, daylight } = situation;

    // Snow and ice phenomena (requires temp + humidity + other factors)
    if (temp !== undefined && humidity !== undefined) {
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
            const threeDaysAgo = timestamp - 3 * 24 * 60 * 60 * 1000;
            let consecutiveDryHours = 0;
            Object.entries(data_previous)
                .filter(([timestamp, entry]) => timestamp > threeDaysAgo && entry.humidity !== undefined && entry.rainRate !== undefined)
                .sort(([a], [b]) => a - b)
                .forEach(([_, entry]) => {
                    if (entry.humidity < 40 && entry.rainRate === 0) consecutiveDryHours++;
                });
            if (humidity < 30 && temp > 25) {
                results.alerts.push('high forest fire risk');
                if (windSpeed > 10) results.alerts.push('extreme fire danger - rapid spread possible');
            } else if (consecutiveDryHours > 48) results.alerts.push('elevated forest fire risk');
        }
    }

    // Complex precipitation predictions
    if (pressure !== undefined && humidity !== undefined) {
        // More nuanced precipitation forecasting
        if (pressure < 1000 && humidity > 75) {
            if (pressure < 990 && humidity > 85) {
                results.phenomena.push('rain very likely');
                if (temp < 5 && month >= 10 && month <= 3) results.phenomena.push('winter precipitation imminent');
            } else results.phenomena.push('rain likely');
            if (store.pressure && store.pressure.trend === 'falling' && humidity > 80) results.phenomena.push('precipitation approaching');
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

    // Enhanced heat index communication
    if (temp !== undefined && humidity !== undefined && temp > 20 && humidity > 60) {
        const heatIndexDiff = Math.round(heatIndex - temp);
        if (heatIndexDiff >= 3) {
            results.phenomena.push(`feels ${heatIndexDiff}°C warmer due to humidity`);
            // Nordic-specific heat stress (lower thresholds than tropical regions)
            if (heatIndex > 32) results.alerts.push('heat stress warning - unusual for Nordic climate');
            else if (heatIndex > 28) results.phenomena.push('uncomfortable heat and humidity combination');
        }
    }

    // Thunderstorm potential (summer)
    if (month >= 6 && month <= 8 && temp > 20 && humidity > 70 && pressure < 1010) {
        if (store.temperature && store.temperature.rateOfChange > 2) {
            results.phenomena.push('thunderstorm development possible');
            if (windSpeed < 5 && hour >= 12 && hour <= 18) results.phenomena.push('afternoon thunderstorms likely');
        }
    }

    // Black ice conditions
    if (temp < 2 && temp > -2 && humidity > 80) {
        if ((rainRate > 0 && temp < 0) || (store.temperature && store.temperature.extremes24h.min < 0 && temp > 0)) {
            results.alerts.push('black ice risk on roads and paths');
            if (location.forestCoverage === 'high') results.alerts.push('treacherous conditions on forest trails');
        }
    }

    // Radiation fog potential (clear nights)
    if (cloudCover !== undefined && cloudCover < 20 && windSpeed < 2 && humidity > 80) {
        if (!daylight.isDaytime && temp < dewPoint + 3) {
            results.phenomena.push('radiation fog likely overnight');
            if (location.forestCoverage === 'high') results.phenomena.push('dense fog in forest clearings');
        }
    }

    // Summer white nights (June)
    if (month === 6 && daylight.daylightHours > 18) results.phenomena.push('white nights period - twilight all night');

    // Winter darkness (December)
    if (month === 12 && daylight.daylightHours < 6) results.phenomena.push('minimal daylight period - ~5.5 hours');

    const auroraPotential = getAuroraPotential(location.latitude, month);
    if (auroraPotential.potential !== 'very low') {
        const moonPhase = helpers.getLunarPhase(date);
        if (auroraPotential.visible)
            results.phenomena.push(
                `aurora borealis likely visible (best time: ${auroraPotential.bestTime}${cloudCover !== undefined && cloudCover < 30 && moonPhase < 0.3 ? ', with good visbility' : ''})`
            );
        else if (auroraPotential.potential === 'high' || auroraPotential.potential === 'very high')
            results.phenomena.push('potential for aurora activity (if dark enough)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (_options) {
    return {
        interpretCombination,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
