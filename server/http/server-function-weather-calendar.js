
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

//const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------`------------------------------------------------------------------

function interpretCalendar(results, situation, data, _data_previous, store, _options) {
    const { month, hour, hourDecimal, daylight, location } = situation;
    const { temp, cloudCover, humidity } = data;

    if (temp !== undefined) {
        // Summer daylight phenomena (May-July)
        if (month >= 5 && month <= 7) {
            if (daylight.isDaytime && hour >= 20) {
                results.phenomena.push('extended Nordic summer evening light');
                if (hour >= 21 && temp > 15) results.phenomena.push('warm summer evening');
            }
            if (daylight.sunriseDecimal < 4.5) {
                if (hour < 7 && daylight.isDaytime) results.phenomena.push('early sunrise period');
                if (hour >= 3 && hour < 5 && daylight.phase === 'civil_dawn') results.phenomena.push('pre-dawn brightness beginning');
            }
            if (daylight.sunsetDecimal > 21) {
                if (hour > Math.floor(daylight.sunsetDecimal) && daylight.phase === 'civil_twilight') {
                    results.phenomena.push('lingering twilight');
                    if (month === 6 && location.latitude > 60) results.phenomena.push('near-white night conditions'); // eslint-disable-line max-depth
                }
            }
            if (location.latitude > 63) {
                if (daylight.daylightHours > 23) {
                    results.phenomena.push('midnight sun period');
                    store.calendar.consecutiveBrightNights++;
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
                    store.calendar.consecutiveDarkDays++;
                }
            }
            if (daylight.isDaytime && temp < -5) {
                results.phenomena.push('cold winter daylight');
                if (temp < -15 && hour >= 11 && hour <= 13) results.phenomena.push('midday still frigid');
            }
            if (location.latitude > 66) {
                if (daylight.daylightHours < 1) results.phenomena.push('polar night - sun remains below horizon');
                else if (daylight.daylightHours < 3) results.phenomena.push('polar twilight period');
            }
        }

        // Twilight phenomena (all seasons)
        switch (daylight.phase) {
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
            const hoursSinceSunrise = hourDecimal - daylight.sunriseDecimal;
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
        const nearSunrise = Math.abs(hourDecimal - daylight.sunriseDecimal) < 0.5,
            nearSunset = Math.abs(hourDecimal - daylight.sunsetDecimal) < 0.5;
        if (nearSunrise) {
            results.phenomena.push('sunrise period');
            if (month >= 9 && month <= 3 && temp < 0) results.phenomena.push('coldest time of day');
        } else if (nearSunset) {
            results.phenomena.push('sunset period');
            if (cloudCover !== undefined && cloudCover < 50) results.phenomena.push('potential for colorful sunset');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleWinterPhenomena(results, situation, data) {
    const { daylight, month, hour, season } = situation;
    const { temp } = data;

    if (temp === undefined || season !== 'winter') return;

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

function handleSummerPhenomena(results, situation, data) {
    const { daylight, hour, season } = situation;
    const { temp, humidity } = data;

    if (temp === undefined || season !== 'summer') return;

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

function handleSpringPhenomena(results, situation, data, _data_previous, store) {
    const { month, hour, daylight, season } = situation;
    const { temp, rainRate, snowDepth } = data;

    if (temp === undefined || season !== 'spring') return;

    switch (month) {
        case 3:
            if (temp > 10) results.phenomena.push('early spring warmth');
            if (snowDepth > 0 && temp > 5) results.phenomena.push('spring snowmelt conditions');
            break;
        case 4:
            if (rainRate > 0 && temp > 5) results.phenomena.push('spring forest rain');
            if (temp > 15) results.phenomena.push('warm spring day');
            break;
        case 5:
            if (temp > 20) results.phenomena.push('early summer warmth arriving');
            if (hour >= 4 && hour <= 6 && daylight.isDaytime) results.phenomena.push('spring dawn chorus time');
            break;
    }

    // Spring daylight changes
    const daylightChange = calculateDaylightChange(situation, store);
    if (daylightChange > 0.05) results.phenomena.push(`rapidly lengthening days (+${Math.round(daylightChange * 60)} min/day)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleAutumnPhenomena(results, situation, data, _data_previous, store) {
    const { month, hour, daylight, season } = situation;
    const { temp, rainRate, windSpeed, humidity } = data;

    if (temp === undefined || season !== 'autumn') return;

    switch (month) {
        case 9:
            if (temp < 5) results.phenomena.push('early autumn chill');
            if (hour >= 6 && hour <= 8 && temp < 10 && humidity > 80) results.phenomena.push('autumn morning mist likely');
            break;
        case 10:
            if (rainRate > 0 && temp < 10) results.phenomena.push('cold autumn rain');
            if (windSpeed > 10) results.phenomena.push('autumn storm conditions');
            if (temp < 0) results.phenomena.push('first frost conditions');
            break;
        case 11:
            if (temp > 8) results.phenomena.push('mild late autumn day');
            if (!daylight.isDaytime && hour === 16) results.phenomena.push('early darkness of late autumn');
            break;
    }

    // Autumn daylight changes
    const daylightChange = calculateDaylightChange(situation, store);
    if (daylightChange < -0.05) results.phenomena.push(`rapidly shortening days (${Math.round(daylightChange * 60)} min/day)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleSpecialDates(results, situation, data) {
    const { month, day, daylight, location } = situation;
    const { temp, cloudCover } = data;

    // Midsummer proximity (around June 21-24)
    if (month === 6 && day >= 19 && day <= 25) {
        results.phenomena.push('midsummer period');
        if (day >= 21 && day <= 24) {
            results.phenomena.push('peak midsummer celebration time');
            if (location.latitude > 60) results.phenomena.push('traditional white night festivities');
        }
    }

    // Lucia (December 13)
    if (month === 12 && day === 13) {
        results.phenomena.push('Lucia Day - festival of lights');
        if (daylight.daylightHours < 6) results.phenomena.push('traditional celebration during darkest period');
    }

    // Crayfish season (August)
    if (month === 8 && day >= 8) {
        results.phenomena.push('crayfish season');
        if (temp > 15 && cloudCover < 50) results.phenomena.push('good conditions for outdoor crayfish party');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleDiurnalPatterns(results, situation, data, data_previous) {
    const { timestamp, temp } = data;
    const { hour } = situation;

    const twelveHoursAgo = timestamp - 12 * 60 * 60 * 1000;
    let minTemp = temp,
        maxTemp = temp;
    Object.entries(data_previous)
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
        previousDaylight = store.calendar.previousDaylightHours || currentDaylight;
    store.calendar.previousDaylightHours = currentDaylight;
    const daysElapsed = 1; // Simplified for daily change
    return (currentDaylight - previousDaylight) / daysElapsed;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.calendar) store.calendar = { consecutiveBrightNights : 0, consecutiveDarkDays : 0};
    return {
        interpretCalendar,
        handleDiurnalPatterns,
        handleWinterPhenomena,
        handleSummerPhenomena,
        handleSpringPhenomena,
        handleAutumnPhenomena,
        handleSpecialDates,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
