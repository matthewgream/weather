// XXX review

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

// const helpers = require('./server-function-weather-helpers.js');
const toolsAstronomy = require('./server-function-weather-tools-astronomical.js');
const toolsData = require('./server-function-weather-tools-data.js');

/* XXX for each
function hasSignificantDataGap(sortedEntries, maxGapHours = 3) {
    for (let i = 1; i < sortedEntries.length; i++) {
        const gap = (sortedEntries[i][0] - sortedEntries[i-1][0]) / 3600000;
        if (gap > maxGapHours) return true;
    }
    return false;
}
*/

/* XXX for each
const percentile95 = historicalValues.sort((a,b) => a-b)[Math.floor(historicalValues.length * 0.95)];
const percentile5 = historicalValues.sort((a,b) => a-b)[Math.floor(historicalValues.length * 0.05)];
if (temp > percentile95) {
    results.phenomena.push('temperature in top 5% for recent period');
} else if (temp < percentile5) {
    results.phenomena.push('temperature in bottom 5% for recent period');
}
*/

// XXX a lot of the store data is not used

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
}

function getCardinalDirection(degrees) {
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretTemperature(results, situation, data, data_previous, store, _options) {
    const { timestamp, temp, humidity, windSpeed, snowDepth } = data;
    const { month, hour, location } = situation;

    if (temp === undefined) return;

    if (!store.temperature)
        store.temperature = {
            extremes24h: { min: temp, max: temp, minTime: timestamp, maxTime: timestamp },
            extremes7d: { min: temp, max: temp },
            trend: 'stable',
            rateOfChange: 0,
            frostDays: 0,
            heatDays: 0,
        };

    const oneHourAgo = timestamp - 60 * 60 * 1000,
        sixHoursAgo = timestamp - 6 * 60 * 60 * 1000,
        twentyFourHoursAgo = timestamp - 24 * 60 * 60 * 1000,
        sevenDaysAgo = timestamp - 7 * 24 * 60 * 60 * 1000;
    let temp1hAgo, temp6hAgo, temp24hAgo;
    let variance6hAgo;
    let min24h = temp,
        max24h = temp,
        min7d = temp,
        max7d = temp;
    let minTime24h = timestamp,
        maxTime24h = timestamp;
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > sevenDaysAgo && entry.temp !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([timestamp, entry]) => {
            // XXX all of these are incorrect and should be "nearest"
            if (timestamp > oneHourAgo && temp1hAgo === undefined) temp1hAgo = entry.temp;
            if (timestamp > sixHoursAgo && temp6hAgo === undefined) temp6hAgo = entry.temp;
            if (timestamp > twentyFourHoursAgo) {
                if (temp24hAgo === undefined) temp24hAgo = entry.temp;
                if (entry.temp < min24h) {
                    min24h = entry.temp;
                    minTime24h = timestamp;
                }
                if (entry.temp > max24h) {
                    max24h = entry.temp;
                    maxTime24h = timestamp;
                }
            }
            if (timestamp > sevenDaysAgo) {
                min7d = Math.min(min7d, entry.temp);
                max7d = Math.max(max7d, entry.temp);
            }
        });
    if (temp6hAgo !== undefined) {
        const samples = Object.entries(data_previous)
            .filter(([timestamp, entry]) => timestamp > sixHoursAgo && entry.temp !== undefined)
            .map(([_timestamp, entry]) => entry.temp);
        if (samples.length > 3) variance6hAgo = calculateVariance(samples);
    }
    store.temperature.extremes24h = { min: min24h, max: max24h, minTime: minTime24h, maxTime: maxTime24h };
    store.temperature.extremes7d = { min: min7d, max: max7d };

    if (temp < -25) {
        results.conditions.push('extremely cold');
        results.alerts.push('extreme cold warning');
        if (windSpeed > 3) results.alerts.push('severe wind chill danger');
    } else if (temp < -15) {
        results.conditions.push('very cold');
        if (humidity > 80) results.phenomena.push('ice crystal formation likely');
    } else if (temp < -5) results.conditions.push('cold');
    else if (temp < 0) results.conditions.push('freezing');
    else if (temp < 5) results.conditions.push('chilly');
    else if (temp < 10) results.conditions.push('cool');
    else if (temp >= 10 && temp < 18) results.conditions.push('mild');
    else if (temp >= 18 && temp < 23) results.conditions.push('warm');
    else if (temp >= 22 && temp < 27) {
        results.conditions.push('warm to hot');
        results.phenomena.push('warm for Nordic climate');
    } else if (temp >= 23 && temp < 28) {
        results.conditions.push('hot');
        if (location.latitude > 59) results.phenomena.push('unusually warm for this latitude');
    } else {
        results.conditions.push('very hot');
        if (temp >= 30) {
            results.alerts.push('unusual heat for Nordic region');
            if (temp >= 32) results.alerts.push('extreme heat warning');
        }
    }

    const change1h = temp1hAgo === undefined ? 0 : temp - temp1hAgo,
        change6h = temp6hAgo === undefined ? 0 : temp - temp6hAgo;
    if (Math.abs(change1h) > 5) {
        results.phenomena.push(`rapid temperature ${change1h > 0 ? 'rise' : 'drop'}: ${Math.abs(change1h).toFixed(1)}°C/hour`);
        if (change1h < -5 && temp < 5) results.alerts.push('flash freeze possible');
    } else if (Math.abs(change6h) > 10) results.phenomena.push(`significant temperature ${change6h > 0 ? 'rise' : 'drop'}: ${Math.abs(change6h).toFixed(1)}°C in 6 hours`);
    if (variance6hAgo > 4) results.phenomena.push('unstable temperature conditions');

    const diurnalRange = max24h - min24h;
    if (diurnalRange > 20) {
        results.phenomena.push(`extreme temperature variation: ${diurnalRange.toFixed(1)}°C range`);
        if (month >= 4 && month <= 9) results.phenomena.push('continental climate effect');
    } else if (diurnalRange < 5) {
        results.phenomena.push(`stable temperatures: only ${diurnalRange.toFixed(1)}°C variation`);
        if (humidity > 80) results.phenomena.push('maritime influence likely');
    }

    if (temp <= 0 && temp24hAgo > 0) {
        store.temperature.frostDays++;
        results.phenomena.push('first frost of the period');
    } else if (temp > 0 && min24h <= 0) results.phenomena.push('frost occurred in last 24 hours');

    if (max7d - min7d > 30) results.phenomena.push(`extreme weekly temperature range: ${(max7d - min7d).toFixed(1)}°C`);

    const minHour = new Date(minTime24h).getHours(),
        maxHour = new Date(maxTime24h).getHours();
    if (minHour >= 10 && minHour <= 18) results.phenomena.push('unusual daytime temperature minimum');
    if (maxHour >= 22 || maxHour <= 6) results.phenomena.push('unusual nighttime temperature maximum');

    if (month >= 11 || month <= 2) {
        // Winter
        if (temp > 5) {
            results.phenomena.push('unseasonably warm for winter');
            if (temp > 10) results.alerts.push('exceptional winter warmth');
            if (snowDepth > 0) results.phenomena.push('rapid snowmelt likely');
        } else if (temp < -20) {
            results.phenomena.push('extreme Nordic winter conditions');
            if (hour >= 6 && hour <= 18) results.phenomena.push('extreme cold despite daylight');
        }
        if (hour >= 0 && hour <= 6 && temp > temp6hAgo + 3) results.phenomena.push('possible temperature inversion');
    } else if (month >= 6 && month <= 8) {
        // Summer
        if (temp > 25) {
            results.phenomena.push('hot Nordic summer day');
            if (temp > 28) {
                results.phenomena.push('exceptional summer heat');
                store.temperature.heatDays++;
            }
        } else if (temp < 10) {
            results.phenomena.push('unseasonably cool for summer');
            if (temp < 5) results.alerts.push('unusual summer cold');
        }
        if (hour >= 0 && hour <= 6 && min24h > 20) results.phenomena.push('tropical night (min temp > 20°C)');
    }

    if (location.elevation > 500 && temp < temp24hAgo - 5) results.phenomena.push('cold air pooling in valley possible');

    store.temperature.rateOfChange = change1h;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretPressure(results, situation, data, data_previous, store, _options) {
    const { timestamp, pressure, temp, windSpeed, humidity } = data;
    const { month, location } = situation;

    if (pressure === undefined) return;

    if (!store.pressure)
        store.pressure = {
            trend: 'stable',
            changeRate: 0,
            lastReading: pressure,
            lastTimestamp: timestamp,
            extremes24h: { min: pressure, max: pressure },
            rapidChanges: [],
        };

    const adjustedPressure = pressure * Math.exp(location.elevation / (29.3 * (273.15 + temp)));
    const oneHourAgo = timestamp - 60 * 60 * 1000,
        threeHoursAgo = timestamp - 3 * 60 * 60 * 1000,
        twentyFourHoursAgo = timestamp - 24 * 60 * 60 * 1000;
    let pressure1hAgo, pressure3hAgo, pressure24hAgo;
    let closest1hAgo, closest3hAgo, closest24hAgo;
    let min24h = adjustedPressure,
        max24h = adjustedPressure;
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > twentyFourHoursAgo && entry.pressure !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([timestamp, entry]) => {
            const adjP = entry.pressure * Math.exp(location.elevation / (29.3 * ((entry.temp || temp) + 273)));
            if (timestamp <= oneHourAgo && (!closest1hAgo || timestamp > closest1hAgo)) {
                closest1hAgo = timestamp;
                pressure1hAgo = adjP;
            }
            if (timestamp <= threeHoursAgo && (!closest3hAgo || timestamp > closest3hAgo)) {
                closest3hAgo = timestamp;
                pressure3hAgo = adjP;
            }
            if (timestamp <= twentyFourHoursAgo && (!closest24hAgo || timestamp > closest24hAgo)) {
                closest24hAgo = timestamp;
                pressure24hAgo = adjP;
            }
            min24h = Math.min(min24h, adjP);
            max24h = Math.max(max24h, adjP);
        });
    store.pressure.extremes24h = { min: min24h, max: max24h };
    const change1h = pressure1hAgo ? adjustedPressure - pressure1hAgo : 0,
        change3h = pressure3hAgo ? adjustedPressure - pressure3hAgo : 0,
        change24h = pressure24hAgo ? adjustedPressure - pressure24hAgo : 0;

    if (Math.abs(change3h) < 1) store.pressure.trend = 'stable';
    else if (change3h > 0) store.pressure.trend = 'rising';
    else store.pressure.trend = 'falling';

    if (adjustedPressure < 970) {
        results.conditions.push('severe storm conditions');
        results.alerts.push('dangerously low pressure');
    } else if (adjustedPressure < 990) {
        results.conditions.push('stormy');
        if (windSpeed > 10) results.alerts.push('storm system active');
    } else if (adjustedPressure < 1000) results.conditions.push('unsettled');
    else if (adjustedPressure >= 1000 && adjustedPressure <= 1015) {
        // Normal range - no condition added
    } else if (adjustedPressure > 1015 && adjustedPressure <= 1025) results.conditions.push('settled');
    else if (adjustedPressure > 1025) results.conditions.push('stable high pressure');

    if (Math.abs(change1h) > 3) {
        results.alerts.push(`rapid pressure ${change1h > 0 ? 'rise' : 'drop'}: ${Math.abs(change1h).toFixed(1)} hPa/hour`);
        store.pressure.rapidChanges.push({ timestamp, change: change1h });
    } else if (Math.abs(change3h) > 5) results.phenomena.push(`significant pressure ${change3h > 0 ? 'rise' : 'drop'}: ${Math.abs(change3h).toFixed(1)} hPa in 3 hours`);

    if (store.pressure.trend === 'falling') {
        if (change3h < -5) {
            results.phenomena.push('rapidly falling pressure - storm approaching');
            if (month >= 9 || month <= 3) results.phenomena.push('winter storm possible');
        } else if (change3h < -3) results.phenomena.push('falling pressure - weather deteriorating');
    } else if (store.pressure.trend === 'rising') {
        if (change3h > 5) results.phenomena.push('rapidly rising pressure - clearing conditions');
        else if (change3h > 3) results.phenomena.push('rising pressure - improving weather');
    }
    if (Math.abs(change24h) > 10) {
        results.phenomena.push(`significant 24h pressure ${change24h > 0 ? 'rise' : 'drop'}: ${Math.abs(change24h).toFixed(1)} hPa`);
        if (change24h > 15) results.phenomena.push('strong high pressure building');
        else if (change24h < -15) results.phenomena.push('deepening low pressure system');
    }

    const range24h = max24h - min24h;
    if (range24h > 20) {
        results.phenomena.push(`extreme pressure variation: ${range24h.toFixed(1)} hPa in 24h`);
        results.alerts.push('unstable atmospheric conditions');
    } else if (range24h < 3) results.phenomena.push('very stable pressure');

    if (adjustedPressure < 1000 && Math.abs(change3h) > 3) results.phenomena.push('barometric pressure changes may affect sensitive individuals');

    if (location.forestCoverage === 'high' && change3h < -5) results.phenomena.push('storm approaching - forest wind damage possible');

    if (month >= 9 || month <= 3) {
        // Fall through early spring
        if (adjustedPressure > 1020) {
            results.phenomena.push('clear winter conditions likely');
            if (temp < -10) results.phenomena.push('cold high pressure system');
        } else if (adjustedPressure < 990 && temp > 0) {
            results.phenomena.push('winter rain likely');
            if (change3h < -3) results.alerts.push('winter storm developing');
        }
    } else if (month >= 6 && month <= 8) {
        // Summer
        if (adjustedPressure < 1005 && humidity > 70) results.phenomena.push('summer low pressure - showers possible');
        else if (adjustedPressure > 1020) results.phenomena.push('summer high pressure - warm and dry');
    }
    if (month >= 11 || month <= 2) {
        // Winter
        if (change24h > 10 && adjustedPressure > 1020) results.phenomena.push('arctic high strengthening - colder weather likely');
    }

    store.pressure.lastReading = adjustedPressure;
    store.pressure.lastTimestamp = timestamp;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretHumidity(results, situation, data, data_previous, store, _options) {
    const { timestamp, humidity, temp, pressure, windSpeed, windDir, rainRate } = data;
    const { month, hour, location, dewPoint, heatIndex } = situation;

    if (humidity === undefined) return;

    if (!store.humidity)
        store.humidity = {
            extremes24h: { min: humidity, max: humidity },
            avgDaytime: humidity,
            avgNighttime: humidity,
            trend: 'stable',
            dewPointTrend: 'stable',
            consecutiveDryHours: 0,
            consecutiveHumidHours: 0,
            currentDryStreak: 0,
            currentHumidStreak: 0,
        };

    const sixHoursAgo = timestamp - 6 * 60 * 60 * 1000,
        twentyFourHoursAgo = timestamp - 24 * 60 * 60 * 1000;
    let humidity6hAgo;
    let min24h = humidity,
        max24h = humidity;
    let daytimeSum = 0,
        daytimeCount = 0;
    let nighttimeSum = 0,
        nighttimeCount = 0;
    let lastDryTimestamp, lastHumidTimestamp;
    let currentDryStreak = 0,
        currentHumidStreak = 0;
    let maxDryStreak = 0,
        maxHumidStreak = 0;
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > twentyFourHoursAgo && entry.humidity !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([timestamp, entry]) => {
            if (timestamp > sixHoursAgo && humidity6hAgo === undefined) humidity6hAgo = entry.humidity;
            min24h = Math.min(min24h, entry.humidity);
            max24h = Math.max(max24h, entry.humidity);
            const entryHour = new Date(timestamp).getHours();
            if (entryHour >= 6 && entryHour <= 18) {
                daytimeSum += entry.humidity;
                daytimeCount++;
            } else {
                nighttimeSum += entry.humidity;
                nighttimeCount++;
            }
            if (entry.humidity < 30) {
                if (lastDryTimestamp && timestamp - lastDryTimestamp <= 2 * 3600000)
                    // 2 hour gap tolerance
                    currentDryStreak += (timestamp - lastDryTimestamp) / 3600000;
                else currentDryStreak = 1; // Reset to 1 hour
                lastDryTimestamp = timestamp;
                maxDryStreak = Math.max(maxDryStreak, currentDryStreak);
            } else {
                currentDryStreak = 0;
                lastDryTimestamp = undefined;
            }
            if (entry.humidity > 90) {
                if (lastHumidTimestamp && timestamp - lastHumidTimestamp <= 2 * 3600000) currentHumidStreak += (timestamp - lastHumidTimestamp) / 3600000;
                else currentHumidStreak = 1;
                lastHumidTimestamp = timestamp;
                maxHumidStreak = Math.max(maxHumidStreak, currentHumidStreak);
            } else {
                currentHumidStreak = 0;
                lastHumidTimestamp = undefined;
            }
        });
    store.humidity.consecutiveDryHours = maxDryStreak;
    store.humidity.consecutiveHumidHours = maxHumidStreak;
    store.humidity.currentDryStreak = currentDryStreak;
    store.humidity.currentHumidStreak = currentHumidStreak;
    store.humidity.extremes24h = { min: min24h, max: max24h };
    if (daytimeCount > 0) store.humidity.avgDaytime = daytimeSum / daytimeCount;
    if (nighttimeCount > 0) store.humidity.avgNighttime = nighttimeSum / nighttimeCount;

    if (humidity > 90) {
        results.conditions.push('very humid');
        if (temp > 20) results.phenomena.push('oppressive humidity');
    } else if (humidity > 70) results.conditions.push('humid');
    else if (humidity >= 30 && humidity <= 60) {
        // Comfort range - no condition added
    } else if (humidity < 30) {
        results.conditions.push('dry');
        if (humidity < 20) {
            results.conditions.push('very dry air');
            results.alerts.push('extremely dry conditions');
        }
    }

    const change6h = humidity6hAgo === undefined ? 0 : humidity - humidity6hAgo;
    if (Math.abs(change6h) > 30) results.phenomena.push(`rapid humidity ${change6h > 0 ? 'increase' : 'decrease'}: ${Math.abs(change6h)}% in 6 hours`);

    if (dewPoint !== undefined) {
        const dewPointSpread = temp - dewPoint;
        if (dewPointSpread < 2 && humidity > 85) {
            if (windSpeed < 2) {
                results.phenomena.push('fog formation likely');
                if (hour >= 22 || hour <= 8) results.phenomena.push('overnight fog probable');
            } else if (windSpeed < 5) results.phenomena.push('patchy fog possible');
        }
        if (dewPointSpread < 1 && humidity > 95) {
            results.conditions.push('foggy conditions');
            if (temp < 0) results.phenomena.push('freezing fog possible');
        }
    }

    const diurnalRange = max24h - min24h;
    if (diurnalRange > 40) {
        results.phenomena.push(`large humidity variation: ${diurnalRange}% range`);
        if (store.humidity.avgDaytime < store.humidity.avgNighttime - 20) results.phenomena.push('typical daily humidity cycle');
    } else if (diurnalRange < 10) results.phenomena.push('stable humidity levels');

    if (store.humidity.consecutiveDryHours > 24) results.phenomena.push(`prolonged dry conditions: ${Math.round(store.humidity.consecutiveDryHours)} hours`);
    if (store.humidity.consecutiveHumidHours > 12) results.phenomena.push(`prolonged humid conditions: ${Math.round(store.humidity.consecutiveHumidHours)} hours`);
    if (store.humidity.currentDryStreak > 0 && humidity < 30) results.phenomena.push(`ongoing dry spell: ${Math.round(store.humidity.currentDryStreak)} hours`);
    if (humidity < 30 && store.humidity.consecutiveDryHours > 24) {
        results.phenomena.push('prolonged dry air - hydration important');
    } else if (humidity > 70 && temp > 20) {
        const apparentTemp = heatIndex || temp;
        if (apparentTemp > temp + 5) results.phenomena.push('humidity making it feel much warmer');
    }

    if (rainRate > 0 && humidity < 70) results.phenomena.push('dry air - limited precipitation despite rain');
    else if (humidity > 95 && rainRate === 0) results.phenomena.push('saturated air - precipitation imminent');

    if (humidity > 80 && windDir >= 180 && windDir <= 270) results.phenomena.push('moisture from Baltic Sea region');

    if (hour >= 18 || hour <= 6) {
        if (humidity < 30 && temp < 0) results.phenomena.push('indoor heating will create very dry conditions');
        else if (humidity > 80 && temp > 0) results.phenomena.push('indoor condensation risk');
    }

    if (month >= 11 || month <= 2) {
        // Winter
        if (humidity < 40 && temp < -10) results.phenomena.push('arctic dry air');
        else if (humidity > 85 && temp > -5) {
            results.phenomena.push('damp winter conditions');
            if (windSpeed > 5) results.phenomena.push('raw winter weather');
        }
    } else if (month >= 6 && month <= 8) {
        // Summer
        if (humidity > 80 && temp > 20) {
            results.phenomena.push('muggy summer conditions');
            if (pressure < 1010) results.phenomena.push('thunderstorm development possible');
        } else if (humidity < 40 && temp > 25) {
            results.phenomena.push('dry summer heat');
            if (store.humidity.consecutiveDryHours > 72) results.alerts.push('prolonged dry conditions - fire risk');
        }
    }

    if (location.forestCoverage === 'high') {
        if (humidity > 85 && temp > 15) results.phenomena.push('forest transpiration contributing to humidity');
        if (humidity < 30 && windSpeed > 10) results.phenomena.push('desiccating conditions in forest');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretWind(results, situation, data, data_previous, store, _options) {
    const { timestamp, windSpeed, windGust, windDir, temp, pressure, rainRate } = data;
    const { month, hour, location, snowDepth, windChill } = situation;

    if (windSpeed === undefined) return;

    if (!store.wind)
        store.wind = {
            extremes24h: { maxSpeed: windSpeed, maxGust: windGust || windSpeed },
            avgSpeed6h: windSpeed,
            dominantDirection: windDir,
            gustFactor: 1,
            calmHours: 0,
            stormHours: 0,
            directionChanges: 0,
            lastDirection: windDir,
        };

    const sixHoursAgo = timestamp - 6 * 60 * 60 * 1000,
        twentyFourHoursAgo = timestamp - 24 * 60 * 60 * 1000;
    let maxSpeed24h = windSpeed,
        maxGust24h = windGust || windSpeed;
    let weightedSpeedSum6h = 0;
    let totalTime6h = 0;
    const directionHistory = [];
    let calmHours = 0,
        stormHours = 0;
    let previousTimestamp;
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > twentyFourHoursAgo && entry.windSpeed !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([timestamp, entry]) => {
            maxSpeed24h = Math.max(maxSpeed24h, entry.windSpeed);
            if (entry.windGust) maxGust24h = Math.max(maxGust24h, entry.windGust);
            if (timestamp > sixHoursAgo) {
                if (previousTimestamp && previousTimestamp > sixHoursAgo) {
                    const timeDiff = Math.min((timestamp - previousTimestamp) / 3600000, 3); // hours, capped at 3
                    weightedSpeedSum6h += entry.windSpeed * timeDiff;
                    totalTime6h += timeDiff;
                }
            }
            if (entry.windDir !== undefined) directionHistory.push(entry.windDir);
            if (entry.windSpeed < 0.5) calmHours++;
            if (entry.windSpeed > 17.1) stormHours++;
            previousTimestamp = timestamp;
        });
    store.wind.extremes24h = { maxSpeed: maxSpeed24h, maxGust: maxGust24h };
    store.wind.avgSpeed6h = totalTime6h > 0 ? weightedSpeedSum6h / totalTime6h : windSpeed;
    store.wind.calmHours = calmHours;
    store.wind.stormHours = stormHours;

    if (windGust !== undefined && windSpeed > 0) store.wind.gustFactor = windGust / windSpeed;

    if (windSpeed < 0.5) {
        results.conditions.push('calm');
        if (temp < -10) results.phenomena.push('still arctic air');
    } else if (windSpeed < 1.5) results.conditions.push('light air');
    else if (windSpeed < 3.3) results.conditions.push('light breeze');
    else if (windSpeed < 5.5) results.conditions.push('gentle breeze');
    else if (windSpeed < 7.9) results.conditions.push('moderate breeze');
    else if (windSpeed < 10.7) {
        results.conditions.push('fresh breeze');
        if (location.forestCoverage === 'high') results.phenomena.push('trees swaying noticeably');
    } else if (windSpeed < 13.8) {
        results.conditions.push('strong breeze');
        if (location.forestCoverage === 'high') results.phenomena.push('large branches in motion');
    } else if (windSpeed < 17.1) {
        results.conditions.push('near gale');
        results.alerts.push('strong wind warning');
    } else if (windSpeed < 20.7) {
        results.conditions.push('gale');
        results.alerts.push('gale warning');
        if (location.forestCoverage === 'high') results.alerts.push('risk of falling branches');
    } else if (windSpeed < 24.4) {
        results.conditions.push('strong gale');
        results.alerts.push('strong gale warning');
    } else if (windSpeed < 28.4) {
        results.conditions.push('storm');
        results.alerts.push('storm warning');
        if (location.forestCoverage === 'high') results.alerts.push('severe tree damage likely');
    } else if (windSpeed < 32.6) {
        results.conditions.push('violent storm');
        results.alerts.push('violent storm warning');
    } else {
        results.conditions.push('hurricane force');
        results.alerts.push('hurricane force wind warning');
    }

    if (store.wind.gustFactor > 1.7) {
        results.phenomena.push(`gusty conditions (gusts ${Math.round((store.wind.gustFactor - 1) * 100)}% stronger)`);
        if (windSpeed > 10) results.alerts.push('dangerous gusts');
    } else if (store.wind.gustFactor > 1.4) results.phenomena.push('moderate gusts');

    if (windDir !== undefined && directionHistory.length > 5) {
        const directionChange = Math.abs(windDir - store.wind.lastDirection);
        if (directionChange > 90 && directionChange < 270) {
            store.wind.directionChanges++;
            if (store.wind.directionChanges > 3) {
                results.phenomena.push('variable wind direction');
                if (pressure < 1000) results.phenomena.push('unstable conditions near low pressure');
            }
        }
        store.wind.lastDirection = windDir;
        const cardinalDir = getCardinalDirection(windDir);
        if (month >= 11 || month <= 2) {
            // Winter
            if (cardinalDir === 'N' || cardinalDir === 'NE') {
                results.phenomena.push('arctic wind');
                if (temp < -5) results.phenomena.push('severe wind chill from north');
            } else if (cardinalDir === 'SW' || cardinalDir === 'W') results.phenomena.push('milder Atlantic influence');
        }
    }
    const directionChanges = [];
    for (let i = 1; i < directionHistory.length; i++) directionChanges.push(((directionHistory[i] - directionHistory[i - 1] + 180) % 360) - 180);
    const avgDirectionChange = directionChanges.reduce((a, b) => a + b, 0) / directionChanges.length;
    if (avgDirectionChange > 10) results.phenomena.push('wind veering (typically indicates warming)');
    else if (avgDirectionChange < -10) results.phenomena.push('wind backing (typically indicates cooling)');

    const windVariability = maxSpeed24h - store.wind.avgSpeed6h;
    if (windVariability > 10) results.phenomena.push('highly variable wind speeds');
    else if (windVariability < 2 && windSpeed > 5) results.phenomena.push('steady wind conditions');

    if (location.forestCoverage === 'high') {
        if (windSpeed > 5 && windSpeed < 10) results.phenomena.push('forest canopy reducing ground-level wind');
        else if (windSpeed > 15) {
            results.phenomena.push('wind penetrating forest canopy');
            if (rainRate > 0 || snowDepth > 0) results.alerts.push('increased risk of tree damage');
        }
    }

    if (temp < 10 && windSpeed > 3) {
        const windChillEffect = windChill - temp;
        if (windChillEffect < -10) results.alerts.push(`severe wind chill: feels like ${windChill.toFixed(0)}°C`);
        else if (windChillEffect < -5) results.phenomena.push(`significant wind chill effect`);
    }

    if (store.wind.calmHours > 12) {
        results.phenomena.push(`extended calm period: ${store.wind.calmHours} hours`);
        if (temp < -10) results.phenomena.push('temperature inversion likely');
    }

    if (store.wind.stormHours > 6) results.alerts.push(`prolonged storm: ${store.wind.stormHours} hours of gale-force winds`);

    if (hour >= 10 && hour <= 16 && windSpeed > store.wind.avgSpeed6h * 1.5) results.phenomena.push('daytime wind strengthening');
    else if ((hour >= 22 || hour <= 4) && windSpeed < store.wind.avgSpeed6h * 0.5) results.phenomena.push('nocturnal wind calming');

    if (month >= 9 && month <= 3) {
        // Fall through spring
        if (windSpeed > 15) {
            results.phenomena.push('autumn/winter storm conditions');
            if (pressure < 990) results.phenomena.push('deep low pressure system');
        }
    } else if (month >= 6 && month <= 8) {
        // Summer
        if (windSpeed < 2 && hour >= 10 && hour <= 16) {
            results.phenomena.push('calm summer conditions');
            if (temp > 25) results.phenomena.push('still, hot conditions');
        }
    }

    if (location.elevation > 500) {
        if (windSpeed > 10) results.phenomena.push('exposed elevation - enhanced wind');
        if (hour >= 18 || hour <= 6) if (windSpeed < 2) results.phenomena.push('katabatic (downslope) flow possible');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretClouds(results, situation, data, data_previous, store, _options) {
    const { month, hour, daylight, dewPoint, location, lunar } = situation;
    const { timestamp, cloudCover, temp, humidity, pressure, solarRad, rainRate } = data;

    if (cloudCover === undefined) return;

    if (!store.clouds)
        store.clouds = {
            trend: 'stable',
            avgDaytime: cloudCover,
            avgNighttime: cloudCover,
            clearHours: 0,
            overcastHours: 0,
            variability: 0,
            sunshineHours: 0,
        };

    const sixHoursAgo = timestamp - 6 * 60 * 60 * 1000,
        twentyFourHoursAgo = timestamp - 24 * 60 * 60 * 1000;

    let cloudCover6hAgo;
    let daytimeSum = 0,
        daytimeCount = 0,
        nighttimeSum = 0,
        nighttimeCount = 0;
    let clearHours = 0,
        overcastHours = 0,
        sunshineHours = 0;
    const cloudChanges = [];

    let previousTimestamp;
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > twentyFourHoursAgo && entry.cloudCover !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([timestamp, entry]) => {
            let timeDiff = 1; // Default to 1 hour
            if (previousTimestamp) timeDiff = Math.min((timestamp - previousTimestamp) / 3600000, 3); // Cap at 3 hours
            if (timestamp > sixHoursAgo && cloudCover6hAgo === undefined) cloudCover6hAgo = entry.cloudCover;
            const entryDate = new Date(timestamp),
                entryDaylight = toolsAstronomy.getDaylightHours(entryDate, location.latitude, location.longitude);
            if (entryDaylight.isDaytime) {
                daytimeSum += entry.cloudCover;
                daytimeCount++;
                if (entry.cloudCover < 30 && entry.solarRad > 200) sunshineHours += timeDiff;
            } else {
                nighttimeSum += entry.cloudCover;
                nighttimeCount++;
            }
            if (entry.cloudCover < 20) clearHours += timeDiff;
            if (entry.cloudCover > 80) overcastHours += timeDiff;
            cloudChanges.push(entry.cloudCover);
            previousTimestamp = timestamp;
        });
    store.clouds.clearHours = clearHours;
    store.clouds.overcastHours = overcastHours;
    store.clouds.sunshineHours = sunshineHours;
    if (daytimeCount > 0) store.clouds.avgDaytime = daytimeSum / daytimeCount;
    if (nighttimeCount > 0) store.clouds.avgNighttime = nighttimeSum / nighttimeCount;

    if (cloudCover < 10) {
        results.conditions.push('clear sky');
        if (daylight.isDaytime) results.phenomena.push('full sunshine');
        else if (location.lightPollution === 'low') results.phenomena.push('excellent stargazing conditions');
    } else if (cloudCover < 30) {
        results.conditions.push('mostly clear');
        if (daylight.isDaytime) results.phenomena.push('mostly sunny');
    } else if (cloudCover < 70) {
        results.conditions.push('partly cloudy');
        if (daylight.isDaytime && solarRad > 300) results.phenomena.push('sun breaking through clouds');
    } else if (cloudCover < 90) {
        results.conditions.push('mostly cloudy');
        if (daylight.isDaytime) results.phenomena.push('limited sunshine');
    } else {
        results.conditions.push('overcast');
        if (daylight.isDaytime) results.phenomena.push('no direct sunshine');
    }

    const change6h = cloudCover6hAgo === undefined ? 0 : cloudCover - cloudCover6hAgo;
    if (change6h > 50) {
        results.phenomena.push('rapidly increasing cloud cover');
        if (pressure < 1010) results.phenomena.push('weather system approaching');
    } else if (change6h < -50) {
        results.phenomena.push('rapidly clearing skies');
        if (pressure > 1015) results.phenomena.push('high pressure building');
    }

    if (cloudChanges.length > 10) {
        const variance = calculateVariance(cloudChanges);
        store.clouds.variability = Math.sqrt(variance);
        if (store.clouds.variability > 30) {
            results.phenomena.push('highly variable cloud cover');
            if (month >= 4 && month <= 9) results.phenomena.push('convective cloud development');
        } else if (store.clouds.variability < 10) results.phenomena.push('stable cloud conditions');
    }

    if (cloudCover > 70 && rainRate === 0 && humidity < 80) results.phenomena.push('high cloud layer likely');
    else if (cloudCover > 90 && humidity > 90) {
        results.phenomena.push('low stratus cloud');
        if (temp - dewPoint < 2) results.phenomena.push('cloud base near ground level');
    }

    if (daylight.isDaytime && store.clouds.sunshineHours > 0) {
        const possibleSunshineHours = Math.min(24, daylight.daylightHours),
            sunshinePercentage = (store.clouds.sunshineHours / possibleSunshineHours) * 100;
        if (sunshinePercentage > 80) results.phenomena.push('abundant sunshine today');
        else if (sunshinePercentage < 20) {
            results.phenomena.push('minimal sunshine today');
            if (month >= 11 || month <= 1) results.phenomena.push('typical winter gloom');
        }
    }
    if (!daylight.isDaytime) {
        if (cloudCover < 20) {
            if (lunar.phase < 0.2 || lunar.phase > 0.8) results.phenomena.push('dark skies - good for astronomy');
        } else if (cloudCover > 80 && location.lightPollution !== 'low') results.phenomena.push('cloud reflection of urban lights');
    }

    if (cloudCover > 80) {
        if (month >= 11 || month <= 2) results.phenomena.push('clouds providing insulation');
        else if (month >= 6 && month <= 8 && daylight.isDaytime) results.phenomena.push('clouds limiting heating');
    } else if (cloudCover < 20) {
        if (!daylight.isDaytime && temp < 5) results.phenomena.push('clear skies enhancing cooling');
        else if (daylight.isDaytime && month >= 6 && month <= 8) results.phenomena.push('strong solar heating');
    }

    if (store.clouds.overcastHours > 48) {
        results.phenomena.push(`prolonged overcast: ${Math.round(store.clouds.overcastHours / 24)} days`);
        if (month >= 11 || month <= 2) results.phenomena.push('persistent winter gloom');
    } else if (store.clouds.clearHours > 48) results.phenomena.push(`extended clear period: ${Math.round(store.clouds.clearHours / 24)} days`);

    if (month >= 11 || month <= 2) {
        // Winter
        if (cloudCover > 80) {
            results.phenomena.push('typical winter overcast');
            if (temp > 0) results.phenomena.push('mild air mass');
        } else if (cloudCover < 20 && temp < -10) {
            results.phenomena.push('clear arctic conditions');
            results.phenomena.push('strong radiational cooling');
        }
    } else if (month >= 6 && month <= 8) {
        // Summer
        if (cloudCover > 30 && cloudCover < 70 && hour >= 12 && hour <= 18) {
            results.phenomena.push('fair weather cumulus likely');
            if (humidity > 70 && temp > 20) results.phenomena.push('building cumulus - showers possible');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretPrecipitation(results, situation, data, data_previous, store, _options) {
    const { timestamp, rainRate, temp, humidity, pressure, windSpeed, windDir, snowDepth } = data;
    const { month, hour, location } = situation;

    if (rainRate === undefined) return;

    if (!store.precipitation)
        store.precipitation = {
            accumulation1h: 0,
            accumulation24h: 0,
            accumulation7d: 0,
            consecutiveDryDays: 0,
            consecutiveWetHours: 0,
            maxRate24h: rainRate,
            rainEvents: [],
            currentEvent: undefined,
        };

    const oneHourAgo = timestamp - 60 * 60 * 1000,
        twentyFourHoursAgo = timestamp - 24 * 60 * 60 * 1000,
        sevenDaysAgo = timestamp - 7 * 24 * 60 * 60 * 1000;
    let accumulation1h = 0,
        accumulation24h = 0,
        accumulation7d = 0;
    let maxRate24h = rainRate;
    let consecutiveWetHours = 0;
    let lastDryTime = timestamp;
    let previousTimestamp;
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > sevenDaysAgo && entry.rainRate !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([timestamp, entry]) => {
            let timeDiff = 1; // Default to 1 hour if no previous entry
            if (previousTimestamp) timeDiff = Math.min((timestamp - previousTimestamp) / 3600000, 3); // Max 3 hours
            const accumulation = entry.rainRate * timeDiff;
            if (timestamp > oneHourAgo) accumulation1h += accumulation;
            if (timestamp > twentyFourHoursAgo) {
                accumulation24h += accumulation;
                maxRate24h = Math.max(maxRate24h, entry.rainRate);
            }
            if (timestamp > sevenDaysAgo) accumulation7d += accumulation;
            if (entry.rainRate > 0) {
                if (!store.precipitation.currentEvent)
                    store.precipitation.currentEvent = {
                        start: timestamp,
                        accumulation: 0,
                        maxRate: entry.rainRate,
                        consecutiveWetHours: 0,
                    };
                store.precipitation.currentEvent.consecutiveWetHours += timeDiff;
            } else {
                if (consecutiveWetHours > 0) lastDryTime = timestamp;
                consecutiveWetHours = 0;
                if (entry.rainRate === 0 && consecutiveWetHours > 0) lastDryTime = timestamp;
            }
            previousTimestamp = timestamp;
        });
    store.precipitation.accumulation1h = accumulation1h;
    store.precipitation.accumulation24h = accumulation24h;
    store.precipitation.accumulation7d = accumulation7d;
    store.precipitation.maxRate24h = maxRate24h;
    store.precipitation.consecutiveWetHours = consecutiveWetHours;

    if (rainRate === 0 && consecutiveWetHours === 0) {
        const hoursSinceLastRain = (timestamp - lastDryTime) / 3600000;
        if (hoursSinceLastRain > 24) results.phenomena.push(`dry for ${Math.round(hoursSinceLastRain)} hours`);
    }
    if (rainRate === 0 && accumulation24h < 0.5) store.precipitation.consecutiveDryDays++;
    else store.precipitation.consecutiveDryDays = 0;

    if (rainRate > 0) {
        if (rainRate < 0.5) {
            results.conditions.push('light rain');
            if (temp < 0) results.conditions.push('light snow likely');
            else if (temp < 3) results.phenomena.push('mixed precipitation possible');
        } else if (rainRate < 2.5) results.conditions.push('light to moderate rain');
        else if (rainRate < 4) results.conditions.push('moderate rain');
        else if (rainRate < 8) {
            results.conditions.push('heavy rain');
            if (windSpeed > 10) results.phenomena.push('driving rain');
        } else if (rainRate < 16) {
            results.conditions.push('very heavy rain');
            results.alerts.push('heavy rainfall warning');
        } else {
            results.conditions.push('extreme rainfall');
            results.alerts.push('extreme rainfall warning');
            if (accumulation1h > 25) results.alerts.push('flash flood risk');
        }
        if (store.precipitation.currentEvent) {
            store.precipitation.currentEvent.accumulation += rainRate / 60; // mm per minute
            store.precipitation.currentEvent.maxRate = Math.max(store.precipitation.currentEvent.maxRate, rainRate);
            const duration = (timestamp - store.precipitation.currentEvent.start) / 3600000;
            if (duration > 0.5) results.phenomena.push(`ongoing rain event: ${duration.toFixed(1)} hours`);
        }
    } else {
        if (store.precipitation.currentEvent && store.precipitation.currentEvent.accumulation > 1) {
            const eventDuration = (timestamp - store.precipitation.currentEvent.start) / 3600000;
            if (eventDuration > 0.5)
                store.precipitation.rainEvents.push({
                    ...store.precipitation.currentEvent,
                    end: timestamp,
                    duration: eventDuration,
                });
            store.precipitation.currentEvent = undefined;
        }
        if (humidity > 90 && pressure < 1010) results.phenomena.push('rain likely soon');
    }

    if (rainRate > 0 && temp !== undefined) {
        if (temp < -5) {
            results.phenomena.push('snow (powder)');
            results.phenomena.push(`snow accumulation rate: ~${(rainRate * 10).toFixed(1)} mm/hour`);
        } else if (temp < -2) results.phenomena.push('snow');
        else if (temp < 0) {
            results.phenomena.push('wet snow or sleet');
            results.alerts.push('slippery conditions');
        } else if (temp < 2) {
            results.phenomena.push('mixed precipitation possible');
            if (humidity > 95) {
                results.phenomena.push('freezing rain risk');
                results.alerts.push('ice hazard warning');
            }
        }
    }

    if (accumulation24h > 50) {
        results.alerts.push(`significant rainfall: ${accumulation24h.toFixed(1)}mm in 24 hours`);
        if (accumulation24h > 100) results.alerts.push('extreme precipitation event');
    } else if (accumulation24h > 25) results.phenomena.push(`notable rainfall: ${accumulation24h.toFixed(1)}mm in 24 hours`);

    if (accumulation7d > 100) {
        results.phenomena.push(`wet week: ${accumulation7d.toFixed(0)}mm total`);
        if (location.forestCoverage === 'high') results.phenomena.push('saturated forest floor');
    } else if (accumulation7d < 5) {
        results.phenomena.push('dry week');
        if (month >= 6 && month <= 8) {
            store.precipitation.consecutiveDryDays++;
            if (store.precipitation.consecutiveDryDays > 14) results.alerts.push('drought conditions developing');
        }
    }

    if (maxRate24h > 10 && accumulation24h > 20) {
        results.phenomena.push('periods of intense rainfall');
        if (month >= 6 && month <= 8) results.phenomena.push('convective precipitation');
    } else if (rainRate > 0 && rainRate < 1 && consecutiveWetHours > 6) {
        results.phenomena.push('persistent light rain');
        if (month >= 9 && month <= 11) results.phenomena.push('typical autumn drizzle');
    }

    if (month >= 12 || month <= 2) {
        // Winter
        if (rainRate > 0 && temp > 2) {
            results.phenomena.push('winter rain event');
            if (snowDepth > 50) results.alerts.push('rain on snow - rapid melt risk');
        }
    } else if (month >= 6 && month <= 8) {
        // Summer
        if (rainRate > 8 && pressure < 1010) {
            results.phenomena.push('summer thunderstorm likely');
            if (hour >= 14 && hour <= 20) results.phenomena.push('afternoon/evening convection');
        }
    }

    if (location.elevation < 200 && windSpeed > 5) {
        if (windDir !== undefined && windDir > 225 && windDir < 315) {
            // Westerly winds
            if (rainRate < 0.5 && humidity > 70) results.phenomena.push('rain shadow effect possible');
        }
    }

    // Forest-specific effects
    if (location.forestCoverage === 'high' && rainRate > 0) {
        if (rainRate < 0.5) results.phenomena.push('canopy interception reducing ground rainfall');
        else if (consecutiveWetHours > 3) results.phenomena.push('canopy drip enhancing ground moisture');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLight(results, _situation, data, data_previous, _store, _options) {
    const { timestamp, solarRad: rad, solarUvi: uvi } = data;

    const fiveMinutesAgo = timestamp - 5 * 60 * 1000;
    let uviSum = uvi ?? 0,
        uviCnt = uvi === undefined ? 0 : 1,
        radSum = rad ?? 0,
        radCnt = rad === undefined ? 0 : 1,
        uviAvg,
        radAvg;
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > fiveMinutesAgo && (entry.solarUvi !== undefined || entry.solarRad !== undefined))
        .sort(([a], [b]) => a - b)
        .forEach(([_timestamp, entry]) => {
            if (entry.solarUvi !== undefined) {
                uviSum += entry.solarUvi;
                uviCnt++;
            }
            if (entry.solarRad !== undefined) {
                radSum += entry.solarRad;
                radCnt++;
            }
        });
    if (uviCnt > 0) uviAvg = uviSum / uviCnt;
    if (radCnt > 0) radAvg = radSum / radCnt;

    if (radAvg !== undefined) {
        if (radAvg > 800) results.conditions.push('intense sunlight');
        else if (radAvg > 500) results.conditions.push('strong sunlight');
    }

    if (uviAvg !== undefined && uviCnt >= 3) {
        if (uviAvg >= 11) {
            results.conditions.push('extreme UV');
            results.alerts.push('extreme UV (5-min avg)');
        } else if (uviAvg >= 8) {
            results.conditions.push('very high UV');
            results.alerts.push('very high UV (5-min avg)');
        } else if (uviAvg >= 6) results.conditions.push('high UV (5-min avg)');
        else if (uviAvg >= 3) results.conditions.push('moderate UV (5-min avg)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSnow(results, situation, data, data_previous, store, _options) {
    const { timestamp, snowDepth, temp, windSpeed, rainRate } = data;
    const { month } = situation;

    if (snowDepth === undefined) return;

    if (!store.snow)
        store.snow = {
            maxDepth: 0,
            lastMeasurement: 0,
            accumulation24h: 0,
            meltRate24h: 0,
            seasonStart: undefined,
            daysWithSnow: 0,
        };

    const oneDayAgo = timestamp - 24 * 60 * 60 * 1000;
    let depth24hAgo;

    const accumulations = [];
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > oneDayAgo && entry.snowDepth !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([_timestamp, entry]) => {
            if (depth24hAgo === undefined) depth24hAgo = entry.snowDepth;
            accumulations.push({ timestamp, depth: entry.snowDepth });
        });

    if (depth24hAgo !== undefined) {
        const change24h = snowDepth - depth24hAgo;
        if (change24h > 0) {
            store.snow.accumulation24h = change24h;
            store.snow.meltRate24h = 0;
        } else if (change24h < 0) {
            store.snow.meltRate24h = Math.abs(change24h);
            store.snow.accumulation24h = 0;
        }
    }

    if (snowDepth > store.snow.maxDepth) store.snow.maxDepth = snowDepth;
    if (snowDepth > 0 && store.snow.lastMeasurement === 0) store.snow.seasonStart = new Date(timestamp);
    store.snow.lastMeasurement = snowDepth;

    if (snowDepth === 0) {
        if (month >= 11 || month <= 2) {
            results.phenomena.push('no snow cover during winter');
            if (store.snow.maxDepth > 100) results.phenomena.push(`snow-free after ${store.snow.maxDepth}mm max depth`);
        }
    } else if (snowDepth < 50) {
        results.conditions.push('light snow cover');
        if (month >= 3 && month <= 4) results.phenomena.push('spring snow melt beginning');
    } else if (snowDepth < 200) {
        results.conditions.push('moderate snow cover');
        if (temp > 0) results.phenomena.push('snow compaction likely');
    } else if (snowDepth < 500) {
        results.conditions.push('deep snow cover');
        results.phenomena.push('challenging forest mobility');
        if (windSpeed > 5) results.phenomena.push('snow drifting possible');
    } else {
        results.conditions.push('very deep snow cover');
        results.alerts.push('extreme snow depth');
        results.phenomena.push('restricted mobility in forest');
    }

    if (snowDepth > 30) {
        if (temp < -15) results.phenomena.push('powder snow conditions');
        else if (temp < -5) results.phenomena.push('dry snow conditions');
        else if (temp < 0) results.phenomena.push('packed snow conditions');
        else if (temp > 0) {
            results.phenomena.push('wet snow conditions');
            if (temp > 5) results.phenomena.push('rapid snowmelt possible');
        }
    }

    if (store.snow.accumulation24h > 100) {
        results.alerts.push(`heavy snowfall: ${store.snow.accumulation24h}mm in 24h`);
        results.phenomena.push('significant snow accumulation');
    } else if (store.snow.accumulation24h > 50) results.phenomena.push(`moderate snowfall: ${store.snow.accumulation24h}mm in 24h`);
    else if (store.snow.accumulation24h > 10) results.phenomena.push(`light snowfall: ${store.snow.accumulation24h}mm in 24h`);

    for (let i = 1; i < accumulations.length; i++) {
        const rate = (accumulations[i].depth - accumulations[i - 1].depth) / ((accumulations[i].time - accumulations[i - 1].time) / 3600000);
        if (rate > 10)
            // 10mm/hour
            results.alerts.push('rapid snow accumulation detected');
    }

    if (store.snow.meltRate24h > 50) {
        results.phenomena.push(`rapid snowmelt: ${store.snow.meltRate24h}mm in 24h`);
        if (temp > 5 && rainRate > 0) results.alerts.push('rain-on-snow event - flood risk');
    } else if (store.snow.meltRate24h > 20) results.phenomena.push(`moderate snowmelt: ${store.snow.meltRate24h}mm in 24h`);

    if (snowDepth > 200 && windSpeed > 10) results.phenomena.push('snow loading on trees - branch fall risk');

    if (snowDepth > 300) {
        results.phenomena.push('wildlife movement patterns altered');
        if (month >= 12 || month <= 2) results.phenomena.push('deep snow provides insulation for small mammals');
    }

    if (snowDepth > 30) {
        if (temp >= -15 && temp <= -5) results.phenomena.push('excellent cross-country skiing conditions');
        else if (temp > -5 && temp < 0) results.phenomena.push('good skiing conditions');
        else if (temp >= 0) results.phenomena.push('wet/slow skiing conditions');
    }

    if (month === 10 && snowDepth > 0) results.phenomena.push('early season snow');
    else if (month === 4 && snowDepth > 100) results.phenomena.push('late season persistent snow pack');
    else if (month >= 5 && month <= 8 && snowDepth > 0) results.phenomena.push('unusual summer snow');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretIce(results, situation, data, data_previous, store, _options) {
    const { timestamp, iceDepth, temp, snowDepth } = data;
    const { hour, month } = situation;

    if (iceDepth === undefined) return;

    if (!store.ice)
        store.ice = {
            maxDepth: 0,
            formationDate: undefined,
            breakupDate: undefined,
            growthRate7d: 0,
            meltRate7d: 0,
            consecutiveSafeDays: 0,
        };

    const oneWeekAgo = timestamp - 7 * 24 * 60 * 60 * 1000;
    let depth7dAgo;

    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > oneWeekAgo && entry.iceDepth !== undefined)
        .sort(([a], [b]) => a - b)
        .forEach(([_timestamp, entry]) => {
            if (depth7dAgo === undefined) depth7dAgo = entry.iceDepth;
        });

    if (depth7dAgo !== undefined) {
        const change7d = iceDepth - depth7dAgo;
        if (change7d > 0) {
            store.ice.growthRate7d = change7d / 7;
            store.ice.meltRate7d = 0;
        } else if (change7d < 0) {
            store.ice.meltRate7d = Math.abs(change7d) / 7;
            store.ice.growthRate7d = 0;
        }
    }

    if (iceDepth > 0 && store.ice.maxDepth === 0) store.ice.formationDate = new Date(timestamp);
    else if (iceDepth === 0 && store.ice.maxDepth > 0) store.ice.breakupDate = new Date(timestamp);

    if (iceDepth > store.ice.maxDepth) store.ice.maxDepth = iceDepth;

    if (iceDepth >= 100) store.ice.consecutiveSafeDays++;
    else store.ice.consecutiveSafeDays = 0;

    if (iceDepth === 0) {
        if (month >= 11 || month <= 3) if (temp < -5) results.phenomena.push('ice formation beginning');
    } else if (iceDepth < 50) {
        results.conditions.push('thin ice cover');
        if (month >= 11 || month <= 3) results.alerts.push('unsafe ice conditions');
    } else if (iceDepth < 150) {
        results.conditions.push('moderate ice cover');
        if (month >= 11 || month <= 2) results.phenomena.push('lakes partially frozen');
    } else if (iceDepth < 300) {
        results.conditions.push('thick ice cover');
        results.phenomena.push('lakes solidly frozen');
    } else {
        results.conditions.push('very thick ice cover');
        results.phenomena.push('exceptional ice thickness');
    }

    if (iceDepth > 0) {
        if (temp > 0 && iceDepth < 150) results.alerts.push('weakening ice conditions');
        if (iceDepth < 50) results.alerts.push('thin ice hazard - stay off ice');
        else if (iceDepth >= 50 && iceDepth < 100) results.phenomena.push('ice may support single person on foot');
        else if (iceDepth >= 100 && iceDepth < 200) {
            results.phenomena.push('ice supports group activities');
            if (store.ice.consecutiveSafeDays > 7) results.phenomena.push('ice fishing conditions established');
        } else if (iceDepth >= 200 && iceDepth < 250) results.phenomena.push('ice supports snowmobile');
        else if (iceDepth >= 250) results.phenomena.push('ice supports light vehicles');
    }

    if (iceDepth > 50) {
        if (snowDepth > 100) {
            results.phenomena.push('snow insulation slowing ice growth');
            results.alerts.push('variable ice thickness possible');
        }
        if (store.ice.growthRate7d > 5) results.phenomena.push(`rapid ice growth: ${store.ice.growthRate7d.toFixed(1)}mm/day`);
        else if (store.ice.meltRate7d > 3) {
            results.phenomena.push(`ice deteriorating: ${store.ice.meltRate7d.toFixed(1)}mm/day loss`);
            if (iceDepth < 150) results.alerts.push('ice becoming unsafe');
        }
    }

    if (snowDepth > 100 && iceDepth > 100) results.phenomena.push('typical Nordic winter conditions');

    if (iceDepth >= 100) results.phenomena.push('ice skating safe (Swedish standard)');
    if (iceDepth >= 200) results.phenomena.push('snowmobile safe');

    if (iceDepth > 150) {
        if (snowDepth < 50) results.phenomena.push('excellent ice skating conditions');
        if (month >= 1 && month <= 3) results.phenomena.push('ice road conditions possible');
    }

    if (month >= 3 && month <= 4 && iceDepth > 0) {
        results.phenomena.push('spring ice - extra caution needed');
        if (temp > 5 || (temp > 0 && hour >= 10 && hour <= 16)) results.alerts.push('daytime ice deterioration');
    }

    if (month === 10 && iceDepth > 0) results.phenomena.push('early lake ice formation');
    else if (month === 4 && iceDepth > 100) results.phenomena.push('late season persistent ice');
    else if (month >= 5 && month <= 9 && iceDepth > 0) results.phenomena.push('unusual season ice');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretRadiation(results, situation, data, data_previous, store, _options) {
    const { timestamp, radiationCpm, radiationAcpm, radationUsvh, rainRate, solarUvi, windSpeed, pressure } = data;
    const { month, hour } = situation;

    if (radiationCpm === undefined && radiationAcpm === undefined) return;

    if (!store.radiation)
        store.radiation = {
            baseline: undefined,
            maxReading: 0,
            anomalyCount: 0,
            lastAnomaly: undefined,
            dailyDose: 0,
            doseResetTime: undefined,
        };

    const radiationValue = radiationAcpm === undefined ? radiationCpm : radiationAcpm,
        radiationSource = radiationAcpm === undefined ? 'instant' : 'average';

    const oneDayAgo = timestamp - 24 * 60 * 60 * 1000;
    const historicalReadings = [];
    Object.entries(data_previous)
        .filter(([timestamp, entry]) => timestamp > oneDayAgo && (entry.radiationAcpm !== undefined || entry.radiationCpm !== undefined))
        .sort(([a], [b]) => a - b)
        .forEach(([_, entry]) => {
            const value = entry.radiationAcpm === undefined ? entry.radiationCpm : entry.radiationAcpm;
            if (value !== undefined) historicalReadings.push(value);
        });

    if (historicalReadings.length > 10) {
        historicalReadings.sort((a, b) => a - b);
        store.radiation.baseline = historicalReadings[Math.floor(historicalReadings.length / 2)];
    }

    if (radiationValue > store.radiation.maxReading) store.radiation.maxReading = radiationValue;

    if (radationUsvh !== undefined) {
        const now = new Date(timestamp);
        const resetTime = store.radiation.doseResetTime ? new Date(store.radiation.doseResetTime) : undefined;
        if (!resetTime || now.getDate() !== resetTime.getDate()) {
            store.radiation.dailyDose = 0;
            store.radiation.doseResetTime = timestamp;
        }
        store.radiation.dailyDose += radationUsvh / 60;
    }

    if (radiationValue <= 30) {
        // Normal background - no mention needed
    } else if (radiationValue > 30 && radiationValue <= 50) {
        results.conditions.push('slightly elevated radiation');
        results.phenomena.push('above normal background radiation');
    } else if (radiationValue > 50 && radiationValue <= 100) {
        results.conditions.push('moderately elevated radiation');
        results.alerts.push(`elevated radiation levels (${radiationSource})`);
        results.phenomena.push('investigate radiation source');
    } else if (radiationValue > 100 && radiationValue <= 300) {
        results.conditions.push('high radiation');
        results.alerts.push(`high radiation levels (${radiationSource})`);
        results.phenomena.push('minimize prolonged exposure');
    } else if (radiationValue > 300) {
        results.conditions.push('extremely high radiation');
        results.alerts.push(`dangerous radiation levels (${radiationSource})`);
        results.phenomena.push('seek immediate shelter');
    }

    if (store.radiation.baseline !== undefined && radiationValue > store.radiation.baseline * 2) {
        store.radiation.anomalyCount++;
        store.radiation.lastAnomaly = timestamp;
        if (radiationValue > store.radiation.baseline * 3) results.phenomena.push(`radiation ${(radiationValue / store.radiation.baseline).toFixed(1)}x above baseline`);
    }

    if (radiationValue > 30) {
        if (rainRate > 0) {
            results.phenomena.push('possible radon washout in precipitation');
            if (radiationValue > 50) results.phenomena.push('enhanced radon progeny deposition');
        }
        if (month >= 9 || month <= 3) {
            results.phenomena.push('seasonal radon fluctuation possible');
            if (pressure < 1000) results.phenomena.push('low pressure enhancing radon emission');
        }
        if (hour >= 18 || hour <= 6) {
            if (windSpeed < 1) results.phenomena.push('calm conditions concentrating radon');
        }
    }

    if (radationUsvh !== undefined) {
        if (radationUsvh > 0.5) results.alerts.push(`radiation dose rate: ${radationUsvh.toFixed(2)} µSv/h`);
        if (radationUsvh > 0.3 && radationUsvh <= 1) results.phenomena.push('above typical background dose rate');
        else if (radationUsvh > 1 && radationUsvh <= 5) results.phenomena.push('elevated dose rate - limit prolonged exposure');
        else if (radationUsvh > 5) results.phenomena.push('significant dose rate - health concern');
        if (store.radiation.dailyDose > 2.4) results.phenomena.push(`daily dose: ${store.radiation.dailyDose.toFixed(1)} µSv (above average)`);
    }

    if (radiationValue > 50 && solarUvi > 5) results.phenomena.push('combined radiation and UV exposure');

    if (radiationValue > 25 && radiationValue <= 40) if (month >= 11 || month <= 2) results.phenomena.push('typical winter indoor radon accumulation');

    if (store.radiation.anomalyCount > 5 && store.radiation.lastAnomaly && timestamp - store.radiation.lastAnomaly < 3600000) results.alerts.push('sustained elevated radiation - investigate source');
}

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
        interpretTemperature,
        interpretPressure,
        interpretHumidity,
        interpretWind,
        interpretClouds,
        interpretPrecipitation,
        interpretLight,
        interpretSnow,
        interpretIce,
        interpretRadiation,
        //
        interpretCombination,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
