// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCalendarBased(results, situation, data, data_history, store, _options) {
    const { temp, windSpeed, cloudCover, humidity } = data;
    const { month, hour, date, daylight, season } = situation;

    if (!store.datePatterns)
        store.datePatterns = {
            lastSunrise: undefined,
            lastSunset: undefined,
            consecutiveDarkDays: 0,
            consecutiveBrightNights: 0,
            seasonTransitions: [],
        };

    const currentHourDecimal = hour + date.getMinutes() / 60;

    const daylightPhase = helpers.getDaylightPhase(currentHourDecimal, daylight);

    if (temp !== undefined) {
        // Summer daylight phenomena (May-July)
        if (month >= 5 && month <= 7) {
            if (daylight.isDaytime && hour >= 20) {
                results.phenomena.push('extended Nordic summer evening light');
                if (hour >= 21 && temp > 15) results.phenomena.push('warm summer evening');
            }
            if (daylight.sunriseDecimal < 4.5) {
                if (hour < 7 && daylight.isDaytime) results.phenomena.push('early sunrise period');
                if (hour >= 3 && hour < 5 && daylightPhase === 'civil_dawn') results.phenomena.push('pre-dawn brightness beginning');
            }
            if (daylight.sunsetDecimal > 21) {
                if (hour > Math.floor(daylight.sunsetDecimal) && daylightPhase === 'civil_twilight') {
                    results.phenomena.push('lingering twilight');
                    if (month === 6 && situation.location.latitude > 60) results.phenomena.push('near-white night conditions');
                }
            }
            if (situation.location.latitude > 63) {
                if (daylight.daylightHours > 23) {
                    results.phenomena.push('midnight sun period');
                    store.datePatterns.consecutiveBrightNights++;
                } else if (daylight.daylightHours > 20) results.phenomena.push('bright night - sun barely sets');
            }
        }

        // Winter darkness phenomena (November-January)
        else if (month >= 11 || month <= 1) {
            if (!daylight.isDaytime && hour >= 15 && hour < 17) {
                results.phenomena.push('early winter darkness');
                if (temp < -10) results.phenomena.push('cold evening setting in');
            }
            if (daylight.daylightHours < 7) {
                results.phenomena.push(`short winter day (${Math.round(daylight.daylightHours)} hours of daylight)`);
                if (daylight.daylightHours < 5) {
                    results.phenomena.push('minimal daylight period');
                    store.datePatterns.consecutiveDarkDays++;
                }
            }
            if (daylight.isDaytime && temp < -5) {
                results.phenomena.push('cold winter daylight');
                if (temp < -15 && hour >= 11 && hour <= 13) results.phenomena.push('midday still frigid');
            }
            if (situation.location.latitude > 66) {
                if (daylight.daylightHours < 1) results.phenomena.push('polar night - sun remains below horizon');
                else if (daylight.daylightHours < 3) results.phenomena.push('polar twilight period');
            }
        }

        // Twilight phenomena (all seasons)
        switch (daylightPhase) {
            case 'civil_twilight':
                results.phenomena.push('civil twilight');
                if (cloudCover !== undefined && cloudCover < 30) results.phenomena.push('clear twilight sky');
                break;
            case 'nautical_twilight':
                results.phenomena.push('nautical twilight - stars becoming visible');
                break;
            case 'astronomical_twilight':
                results.phenomena.push('astronomical twilight - deep dusk');
                break;
            case 'civil_dawn':
                results.phenomena.push('civil dawn - morning twilight');
                break;
        }

        // Temperature-related time patterns
        if (temp < 3) {
            const hoursSinceSunrise = currentHourDecimal - daylight.sunriseDecimal;
            if (hoursSinceSunrise > 0 && hoursSinceSunrise < 3) {
                results.phenomena.push('morning chill');
                if (temp < 0 && humidity > 80) results.phenomena.push('frost likely on surfaces');
            }
        }
        if (temp > 22 && hour >= 12 && hour <= 16) {
            results.phenomena.push('afternoon warmth');
            if (month >= 6 && month <= 8 && temp > 25) results.phenomena.push('peak summer heat');
        }

        // Dawn and dusk temperature changes
        const nearSunrise = Math.abs(currentHourDecimal - daylight.sunriseDecimal) < 0.5,
            nearSunset = Math.abs(currentHourDecimal - daylight.sunsetDecimal) < 0.5;
        if (nearSunrise) {
            results.phenomena.push('sunrise period');
            if (month >= 9 && month <= 3 && temp < 0) results.phenomena.push('coldest time of day');
        } else if (nearSunset) {
            results.phenomena.push('sunset period');
            if (cloudCover !== undefined && cloudCover < 50) results.phenomena.push('potential for colorful sunset');
        }
    }

    // Seasonal interpretations with Nordic specifics
    if (season && temp !== undefined)
        switch (season) {
            case 'winter':
                handleWinterPhenomena(results, situation, data, store);
                break;
            case 'summer':
                handleSummerPhenomena(results, situation, data, store);
                break;
            case 'spring':
                handleSpringPhenomena(results, situation, data, store);
                break;
            case 'autumn':
                handleAutumnPhenomena(results, situation, data, store);
                break;
        }

    // Special date-based phenomena
    handleSpecialDates(results, situation, data, store);

    // Diurnal patterns
    handleDiurnalPatterns(results, situation, data, data_history, store);

    // Forest-specific time patterns
    if (windSpeed > 5 && situation.location.forestCoverage === 'high') {
        results.phenomena.push('forest wind effect');
        if (hour >= 10 && hour <= 16) results.phenomena.push('daytime forest breeze');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleWinterPhenomena(results, situation, data, _store) {
    const { temp } = data;
    const { daylight, month, hour } = situation;

    if (temp > 5) {
        results.phenomena.push('unusually mild winter day');
        if (month === 12 || month === 1) results.phenomena.push('winter thaw conditions');
    } else if (temp < -20) {
        results.phenomena.push('severe Nordic winter conditions');
        if (hour >= 6 && hour <= 18) results.phenomena.push('extreme cold despite daylight');
    }

    if (daylight.daylightHours < 7) {
        results.phenomena.push('short winter day');
        if (daylight.daylightHours < 5) results.phenomena.push('deep winter - minimal daylight');
    }

    // Winter morning phenomena
    if (hour >= 7 && hour <= 9) {
        if (!daylight.isDaytime) results.phenomena.push('dark winter morning');
        else if (temp < -10) results.phenomena.push('frigid morning conditions');
    }

    // Winter afternoon
    if (hour >= 14 && hour <= 16) {
        if (!daylight.isDaytime) results.phenomena.push('early winter sunset approaching');
        else if (temp > -5 && temp < 2) results.phenomena.push('brief winter afternoon warmth');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleSummerPhenomena(results, situation, data, _store) {
    const { temp, humidity } = data;
    const { daylight, hour } = situation;

    if (temp < 12) {
        results.phenomena.push('cool summer day');
        if (hour >= 2 && hour <= 5) results.phenomena.push('chilly summer morning');
    } else if (temp > 25) {
        results.phenomena.push('hot Nordic summer day');
        if (temp > 28) results.phenomena.push('exceptional summer heat');
    }

    if (daylight.daylightHours > 18) {
        results.phenomena.push('extended Nordic summer daylight');
        if (daylight.daylightHours > 20) results.phenomena.push('white nights of summer');
    }

    // Summer evening phenomena
    if (hour >= 19 && hour <= 23) {
        if (temp > 18) results.phenomena.push('pleasant summer evening');
        if (daylight.isDaytime && hour >= 21) results.phenomena.push('late evening sun');
    }

    // Summer morning
    if (hour >= 3 && hour <= 6)
        if (daylight.isDaytime) {
            results.phenomena.push('early summer sunrise');
            if (temp > 10 && humidity > 70) results.phenomena.push('dewy summer morning');
        }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleSpringPhenomena(results, situation, data, store) {
    const { temp, rainRate, snowDepth } = data;
    const { month, hour, daylight } = situation;

    if (month === 3) {
        if (temp > 10) results.phenomena.push('early spring warmth');
        if (snowDepth > 0 && temp > 5) results.phenomena.push('spring snowmelt conditions');
    } else if (month === 4) {
        if (rainRate > 0 && temp > 5) results.phenomena.push('spring forest rain');
        if (temp > 15) results.phenomena.push('warm spring day');
    } else if (month === 5) {
        if (temp > 20) results.phenomena.push('early summer warmth arriving');
        if (hour >= 4 && hour <= 6 && daylight.isDaytime) results.phenomena.push('spring dawn chorus time');
    }

    // Spring daylight changes
    const daylightChange = calculateDaylightChange(situation, store);
    if (daylightChange > 0.05) results.phenomena.push(`rapidly lengthening days (+${Math.round(daylightChange * 60)} min/day)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleAutumnPhenomena(results, situation, data, store) {
    const { temp, rainRate, windSpeed, humidity } = data;
    const { month, hour, daylight } = situation;

    if (month === 9) {
        if (temp < 5) results.phenomena.push('early autumn chill');
        if (hour >= 6 && hour <= 8 && temp < 10 && humidity > 80) results.phenomena.push('autumn morning mist likely');
    } else if (month === 10) {
        if (rainRate > 0 && temp < 10) results.phenomena.push('cold autumn rain');
        if (windSpeed > 10) results.phenomena.push('autumn storm conditions');
        if (temp < 0) results.phenomena.push('first frost conditions');
    } else if (month === 11) {
        if (temp > 8) results.phenomena.push('mild late autumn day');
        if (!daylight.isDaytime && hour === 16) results.phenomena.push('early darkness of late autumn');
    }

    // Autumn daylight changes
    const daylightChange = calculateDaylightChange(situation, store);
    if (daylightChange < -0.05) results.phenomena.push(`rapidly shortening days (${Math.round(daylightChange * 60)} min/day)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleSpecialDates(results, situation, data, _store) {
    const { month, date, daylight } = situation;
    const dayOfMonth = date.getDate();

    // Midsummer proximity (around June 21-24)
    if (month === 6 && dayOfMonth >= 19 && dayOfMonth <= 25) {
        results.phenomena.push('midsummer period');
        if (dayOfMonth >= 21 && dayOfMonth <= 24) {
            results.phenomena.push('peak midsummer celebration time');
            if (situation.location.latitude > 60) results.phenomena.push('traditional white night festivities');
        }
    }

    // Lucia (December 13)
    if (month === 12 && dayOfMonth === 13) {
        results.phenomena.push('Lucia Day - festival of lights');
        if (daylight.daylightHours < 6) results.phenomena.push('traditional celebration during darkest period');
    }

    // Crayfish season (August)
    if (month === 8 && dayOfMonth >= 8) {
        results.phenomena.push('crayfish season');
        if (data.temp > 15 && data.cloudCover < 50) results.phenomena.push('good conditions for outdoor crayfish party');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleDiurnalPatterns(results, situation, data, data_history, _store) {
    const { timestamp, temp } = data;
    const { hour } = situation;

    const twelveHoursAgo = timestamp - 12 * 60 * 60 * 1000;
    let minTemp = temp,
        maxTemp = temp;
    Object.entries(data_history)
        .filter(([timestamp, entry]) => timestamp > twelveHoursAgo && entry.temp !== undefined)
        .forEach(([_, entry]) => {
            minTemp = Math.min(minTemp, entry.temp);
            maxTemp = Math.max(maxTemp, entry.temp);
        });
    const tempRange = maxTemp - minTemp;

    if (tempRange > 15) results.phenomena.push(`large diurnal temperature range (${tempRange.toFixed(1)}°C)`);
    else if (tempRange < 5) results.phenomena.push(`stable temperatures (${tempRange.toFixed(1)}°C range)`);

    if (hour >= 0 && hour < 3) results.phenomena.push('deep night hours');
    else if (hour >= 3 && hour < 6) {
        results.phenomena.push('pre-dawn hours');
        if (temp <= minTemp + 1) results.phenomena.push('coldest part of night');
    } else if (hour >= 10 && hour < 12) results.phenomena.push('late morning');
    else if (hour >= 12 && hour < 14) results.phenomena.push('midday period');
    else if (hour >= 18 && hour < 21) results.phenomena.push('evening hours');
    else if (hour >= 21 && hour < 24) results.phenomena.push('late evening');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function calculateDaylightChange(situation, store) {
    const currentDaylight = situation.daylight.daylightHours,
        previousDaylight = store.datePatterns.previousDaylightHours || currentDaylight;
    store.datePatterns.previousDaylightHours = currentDaylight;
    const daysElapsed = 1; // Simplified for daily change
    return (currentDaylight - previousDaylight) / daysElapsed;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (_options) {
    return {
        interpretCalendarBased,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
