// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

//const helpers = require('./server-function-weather-helpers.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------`------------------------------------------------------------------

function interpretCalendar(results, situation, data, _data_previous, store, _options) {
    const { month, hour, hourDecimal, daylight, location } = situation;
    const { temp, humidity, windSpeed } = data;

    // Summer daylight phenomena (May-July)
    if (month >= 5 && month <= 7) {
        if (daylight.isDaytime && hour >= 20) {
            results.phenomena.push('long summer evening');
            if (hour >= 21 && temp > 15) results.phenomena.push('warm summer evening');
        }
        if (daylight.sunriseDecimal < 3.5) {
            if (hour < 7 && daylight.isDaytime) results.phenomena.push('early sunrise period');
            if (hour >= 3 && hour < 5 && (daylight.phase === 'nautical_dawn' || daylight.phase === 'civil_dawn')) results.phenomena.push('pre-dawn brightness beginning');
        }
        if (daylight.sunsetDecimal > 21) {
            if (hour > Math.floor(daylight.sunsetDecimal) && daylight.phase === 'civil_dusk') {
                results.phenomena.push('lingering twilight');
                if (month === 6 && location.latitude > 58) results.phenomena.push('near-white nights');
            }
        }

        // Summer night that never gets fully dark
        if (daylight.astronomicalDuskDecimal && daylight.astronomicalDawnDecimal && daylight.astronomicalDuskDecimal > daylight.astronomicalDawnDecimal) {
            results.phenomena.push('continuous twilight through night');
        }
    }

    // Winter darkness phenomena (November-January)
    else if (month >= 11 || month <= 1) {
        if (!daylight.isDaytime && hour >= 15 && hour < 18) {
            results.phenomena.push('early afternoon darkness');
            if (temp < -10) results.phenomena.push('cold evening setting in');
        }
        if (daylight.daylightHours < 7) {
            results.phenomena.push(`short winter day - ${Math.round(daylight.daylightHours)} hours daylight`);
            if (daylight.daylightHours < 5) {
                results.phenomena.push('minimal daylight period');
                store.calendar.consecutiveDarkDays++;
            }
        }
        if (daylight.isDaytime && temp < -5) {
            results.phenomena.push('cold winter daylight');
            if (temp < -15 && hour >= 11 && hour <= 13) results.phenomena.push('midday still frigid');
        }
    }

    // Temperature-related time patterns
    if (temp < 3) {
        if (daylight.sunriseDecimal !== undefined) {
            const hoursSinceSunrise = hourDecimal - daylight.sunriseDecimal;
            if (hoursSinceSunrise > 0 && hoursSinceSunrise < 2) {
                results.phenomena.push('morning chill');
                if (temp <= 0 && humidity > 80) results.phenomena.push('hoar frost formation likely');
            }
        }
        // Ice warning on roads
        if (temp > -2 && temp < 2 && humidity > 85 && hour >= 5 && hour <= 9) results.phenomena.push('black ice risk on roads');
    }
    if (temp > 22 && hour >= 12 && hour <= 16) {
        results.phenomena.push('afternoon peak temperature');
        if (month >= 6 && month <= 8 && temp > 27) results.phenomena.push('peak summer heat');
    }

    // Radiation fog in autumn/winter
    if (!daylight.isDaytime && temp < 10 && windSpeed !== undefined && windSpeed < 1 && humidity > 90) results.phenomena.push('radiation fog development likely');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleWinterPhenomena(results, situation, data) {
    const { daylight, month, hour, season, windChill } = situation;
    const { temp, windSpeed } = data;

    if (season !== 'winter') return;

    if (temp > 2) {
        results.phenomena.push('unusually mild winter day');
        if (month === 12 || month === 1) results.phenomena.push('winter thaw');
    } else if (temp < -20) {
        results.phenomena.push('severe Nordic winter');
        if (hour >= 6 && hour <= 18) results.phenomena.push('extreme cold despite daylight');
    }

    if (windSpeed !== undefined && windSpeed > 5 && temp < -5) if (windChill < -20) results.phenomena.push(`severe wind chill - feels like ${Math.round(windChill)}°C`);

    // Winter inversions common in Nordic regions
    if (hour >= 6 && hour <= 10 && temp < -10 && windSpeed !== undefined && windSpeed < 2) results.phenomena.push('temperature inversion likely');

    // Winter morning phenomena
    if (hour >= 7 && hour <= 10) {
        if (!daylight.isDaytime) results.phenomena.push('dark winter morning');
        else if (temp < -10) results.phenomena.push('frigid morning');
    }

    // Winter afternoon
    if (hour >= 14 && hour <= 16) {
        if (!daylight.isDaytime) results.phenomena.push('early winter sunset approaching');
        else if (temp > -2 && temp < 3) results.phenomena.push('winter afternoon temperature peak');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleSummerPhenomena(results, situation, data) {
    const { daylight, hour, season, month, solar } = situation;
    const { temp, humidity } = data;

    if (season !== 'summer') return;

    if (temp < 12) {
        results.phenomena.push('cool summer day');
        if (hour >= 2 && hour <= 5 && temp < 10) results.phenomena.push('cool summer morning');
    } else if (temp > 25) {
        results.phenomena.push('hot Nordic summer day');
        if (temp > 30) results.phenomena.push('exceptional summer heat');
    }

    if (daylight.daylightHours > 19) {
        results.phenomena.push('extended Nordic summer daylight');
        if (daylight.daylightHours > 18.5) results.phenomena.push('white nights period');
    }

    if (month >= 5 && month <= 7 && !daylight.astronomicalDuskDecimal) results.phenomena.push('no astronomical darkness - stars not visible');

    // Summer evening phenomena
    if (hour >= 19 && hour <= 23) {
        if (temp > 20) results.phenomena.push('pleasant summer evening');
        if (daylight.isDaytime && hour >= 21) results.phenomena.push('late evening sun');
    }
    // Midnight sun glow (even if sun sets briefly)
    if (hour >= 23 || hour <= 1) if (location.latitude > 62 && daylight.daylightHours > 22) results.phenomena.push('midnight sun glow');

    // Summer morning
    if (hour >= 3 && hour <= 6)
        if (daylight.isDaytime) {
            results.phenomena.push('early summer sunrise');
            if (temp > 8 && temp < 18 && humidity > 85) results.phenomena.push('heavy dew');
        }

    // Golden hour that lasts for hours
    if (month >= 5 && month <= 7 && solar && solar.isGoldenHour && daylight.daylightHours > 18) results.phenomena.push('extended golden hour lighting');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleSpringPhenomena(results, situation, data, _data_previous) {
    const { month, hour, daylight, season } = situation;
    const { temp, rainRate, snowDepth } = data;

    if (season !== 'spring') return;

    switch (month) {
        case 3:
            if (temp > 8) results.phenomena.push('early spring warmth');
            if (snowDepth !== undefined && snowDepth > 0 && temp > 5) results.phenomena.push('spring snowmelt');
            // Crust snow conditions
            if (temp > 0 && hour >= 10 && hour <= 15 && snowDepth !== undefined && snowDepth > 10) results.phenomena.push('spring crust snow - good skiing conditions');
            break;
        case 4:
            if (rainRate !== undefined && rainRate > 0 && temp > 5) results.phenomena.push('spring rain');
            if (temp > 15) results.phenomena.push('warm spring day');
            break;
        case 5:
            if (temp > 20) results.phenomena.push('early summer warmth arriving');
            if (hour >= 3 && hour <= 7 && (daylight.isDaytime || daylight.phase === 'civil_dawn')) results.phenomena.push('spring dawn chorus time');
            break;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleAutumnPhenomena(results, situation, data, _data_previous) {
    const { month, hour, daylight, season, dewPoint } = situation;
    const { temp, rainRate, windSpeed, humidity } = data;

    if (season !== 'autumn') return;

    switch (month) {
        case 9:
            if (temp < 5) results.phenomena.push('early autumn chill');
            if (hour >= 6 && hour <= 9 && temp < 10 && humidity > 80) results.phenomena.push('morning fog formation likely');
            // First frost warnings based on dewpoint
            if (dewPoint < 2 && temp < 5 && (hour >= 22 || hour <= 6)) results.phenomena.push('ground frost possible tonight');
            break;
        case 10:
            if (rainRate !== undefined && rainRate > 0 && temp < 10) results.phenomena.push('cold autumn rain');
            if (windSpeed !== undefined && windSpeed > 10) results.phenomena.push('autumn storm');
            if (temp < 2) results.phenomena.push('first frost');
            break;
        case 11:
            if (temp > 8) results.phenomena.push('mild late autumn day');
            if (!daylight.isDaytime && hour === 16) results.phenomena.push('early darkness of late autumn');
            break;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleTransitionalSeasons(results, situation, data, data_previous, store) {
    const { month, day, hour, daylight, location } = situation;
    const { temp, windSpeed, rainRate, snowDepth } = data;

    // Spring ice breakup (April-May)
    if (month === 4 || (month === 5 && day <= 15)) {
        if (temp > 5 && daylight.isDaytime) {
            results.phenomena.push('lake ice weakening period');
            if (temp > 10 && windSpeed !== undefined && windSpeed > 5) results.phenomena.push('rapid ice breakup conditions');
        }
        if (location.nearbyLakes && temp > 0 && hour >= 10 && hour <= 16) results.phenomena.push('unsafe ice conditions - stay off lakes');
    }

    // First/last snow indicators
    if (month === 10) {
        if (temp < 2 && rainRate !== undefined && rainRate > 0) results.phenomena.push('precipitation may turn to snow');
        if (temp < 0 && !store.calendar.firstSnowRecorded) {
            results.phenomena.push('first snow conditions');
            store.calendar.firstSnowRecorded = true;
        }
    }

    // Spring melt patterns
    if ((month === 3 && day >= 15) || month === 4) {
        if (temp > 5 && hour >= 12 && hour <= 15 && snowDepth !== undefined && snowDepth > 0) {
            results.phenomena.push('peak daily snowmelt period');
            if (temp > 10) results.phenomena.push('rapid spring melt - flooding possible');
        }
        if (temp < -2 && hour >= 3 && hour <= 6 && snowDepth !== undefined && snowDepth > 0) results.phenomena.push('overnight melt refreeze - icy conditions');
    }

    // Autumn lake freeze-up (November-December)
    if (month === 11 || (month === 12 && day <= 15)) {
        if (temp < -5 && windSpeed !== undefined && windSpeed < 3) {
            results.phenomena.push('lake freeze-up conditions');
            if (temp < -10) results.phenomena.push('rapid ice formation on small lakes');
        }
        if (location.nearbyLakes && temp < 0 && temp > -5) results.phenomena.push('early ice forming - extremely dangerous');
    }

    // Seasonal transition markers
    if (month === 9 && temp < 10 && data_previous?.length > 7) {
        const weekAgoTemp = data_previous[Math.max(0, data_previous.length - 7)]?.temp;
        if (weekAgoTemp !== undefined && weekAgoTemp - temp > 5) results.phenomena.push('autumn cooling accelerating');
    }

    if (month === 5 && temp > 15 && data_previous?.length > 7) {
        const weekAgoTemp = data_previous[Math.max(0, data_previous.length - 7)]?.temp;
        if (weekAgoTemp !== undefined && temp - weekAgoTemp > 5) results.phenomena.push('spring warming accelerating');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleDiurnalPatterns(results, situation, data, data_previous) {
    const { hour, season } = situation;
    const { timestamp, temp } = data;

    const twentyFourHoursAgo = timestamp - 24 * 60 * 60 * 1000;
    const [minTemp, maxTemp] = Object.entries(data_previous)
        .filter(([timestamp]) => Number.parseInt(timestamp) > twentyFourHoursAgo)
        .reduce(([minTemp, maxTemp], [_, entry]) => [Math.min(minTemp, entry.temp), Math.max(maxTemp, entry.temp)], [temp, temp]);
    const tempRange = maxTemp - minTemp;

    const seasonalRange = season === 'winter' ? 10 : season === 'summer' ? 20 : 15;
    if (tempRange > seasonalRange) results.phenomena.push(`large diurnal temperature range - ${tempRange.toFixed(1)}°C variation`);
    else if (tempRange < seasonalRange * 0.3) results.phenomena.push(`stable temperatures - ${tempRange.toFixed(1)}°C variation`);

    if (hour >= 1 && hour < 4) results.phenomena.push('deep night hours');
    else if (hour >= 3 && hour < 6) {
        results.phenomena.push('pre-dawn hours');
        if (temp <= minTemp + 0.5) results.phenomena.push('near daily minimum temperature');
    } else if (hour >= 10 && hour < 12) results.phenomena.push('late morning');
    else if (hour >= 12 && hour < 14) results.phenomena.push('midday period');
    else if (hour >= 18 && hour < 21) results.phenomena.push('evening hours');
    else if (hour >= 21 && hour < 24) results.phenomena.push('late evening');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleSpecialDates(results, situation, data) {
    const { month, day, daylight, location } = situation;
    const { temp, cloudCover } = data;

    // Midsummer proximity (around June 21-24)
    if (month === 6 && day >= 20 && day <= 26) {
        results.phenomena.push('midsummer period');
        if (day >= 21 && day <= 24) {
            results.phenomena.push('peak midsummer celebration time');
            if (daylight.daylightHours > 19) results.phenomena.push('white night festivities period');
        }
    }

    // Lucia (December 13)
    if (month === 12 && day === 13) {
        results.phenomena.push('lucia day - festival of lights');
        if (daylight.daylightHours < 7) results.phenomena.push('traditional celebration during darkest period');
    }

    // Crayfish season (August)
    if (month === 8 && day >= 10) {
        results.phenomena.push('crayfish season');
        if (temp > 18 && cloudCover !== undefined && cloudCover < 70) results.phenomena.push('suitable conditions for outdoor gatherings');
    }

    // Ruska (autumn colors) season - September/October
    if ((month === 9 && day >= 10) || (month === 10 && day <= 10)) {
        results.phenomena.push('ruska - autumn foliage season');
        if (location.latitude > 65) results.phenomena.push('peak autumn colors in lapland');
    }

    // Kaamos (polar night) period
    if (location.latitude > 67 && month === 12 && day >= 10 && day <= 25) results.phenomena.push('kaamos - deepest polar night period');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleNordicWeatherPatterns(results, situation, data, _data_previous, _store) {
    const { month, hour, daylight, location } = situation;
    const { temp, windSpeed, windDir, pressure, rainRate } = data;

    // Sea/land breeze effects (mainly summer)
    if (location.distanceToOcean !== undefined && location.distanceToOcean < 30) {
        if (month >= 5 && month <= 8 && daylight.isDaytime) {
            if (hour >= 10 && hour <= 16 && windDir !== undefined) {
                if ((windDir >= 180 && windDir <= 270) || (windDir >= 0 && windDir <= 90)) {
                    results.phenomena.push('sea breeze cooling effect');
                    if (temp > 25 && windSpeed !== undefined && windSpeed > 3) results.phenomena.push('refreshing coastal breeze');
                }
            }
            if (hour >= 20 || hour <= 6) {
                if (windDir !== undefined && ((windDir >= 270 && windDir <= 360) || (windDir >= 90 && windDir <= 180))) results.phenomena.push('land breeze pattern');
            }
        }
    }

    // Föhn effects in mountainous areas
    if (location.nearMountains && windSpeed !== undefined && windSpeed > 8) {
        if (pressure !== undefined && pressure < 1010 && temp > 10) {
            results.phenomena.push('possible föhn wind effect - warm downslope flow');
            if (month >= 11 || month <= 3) results.phenomena.push('föhn-induced winter warming');
        }
    }

    // Baltic Sea influence
    if (location.distanceToOcean !== undefined && location.distanceToOcean < 50) {
        if (month >= 11 || month <= 3) {
            if (temp > 2 && windDir !== undefined && windDir >= 180 && windDir <= 270) results.phenomena.push('mild maritime air from baltic');
        }
        if (month >= 4 && month <= 5) {
            if (temp < 10 && windDir !== undefined && windDir >= 45 && windDir <= 135) results.phenomena.push('cold baltic spring breeze');
        }
    }

    // High pressure patterns
    if (pressure !== undefined && pressure > 1025) {
        if (month >= 11 || month <= 2) {
            results.phenomena.push('strong winter high pressure');
            if (temp < -10 && windSpeed !== undefined && windSpeed < 2) results.phenomena.push('extreme cold pool formation');
        }
        if (month >= 6 && month <= 8) {
            results.phenomena.push('stable summer high pressure');
            if (temp > 25) results.phenomena.push('heat dome conditions');
        }
    }

    // Atlantic storm influence
    if (pressure !== undefined && pressure < 1000 && windSpeed !== undefined && windSpeed > 10) {
        results.phenomena.push('atlantic storm system');
        if (rainRate !== undefined && rainRate > 5) results.phenomena.push('heavy rain from atlantic low');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleActivityConditions(results, situation, data, _data_previous) {
    const { month, day, hour, daylight, location } = situation;
    const { temp, windSpeed, snowDepth, rainRate, cloudCover, iceDepth } = data;

    // Cross-country skiing conditions
    if (snowDepth !== undefined && snowDepth > 20) {
        if (temp >= -15 && temp <= -2) {
            results.phenomena.push('excellent cross-country skiing conditions');
            if (hour >= 9 && hour <= 15) results.phenomena.push('ideal time for winter sports');
        } else if (temp > -2 && temp < 2) results.phenomena.push('sticky snow - waxing challenging');
        else if (temp < -15) results.phenomena.push('very cold - dress warmly for skiing');

        // Spring skiing
        if (month === 3 || (month === 4 && day <= 15)) {
            if (temp > 0 && hour >= 10 && hour <= 14) results.phenomena.push('spring skiing - slushy afternoon snow');
            if (temp < -5 && hour >= 7 && hour <= 10) results.phenomena.push('firm morning crust - excellent for touring');
        }
    }

    // Hiking conditions
    if (month >= 5 && month <= 9) {
        const hikingScore =
            (temp >= 10 && temp <= 22 ? 3 : temp >= 5 && temp <= 25 ? 2 : 1) + (windSpeed !== undefined && windSpeed < 8 ? 2 : 0) + (rainRate === undefined || rainRate === 0 ? 2 : 0) + (cloudCover !== undefined && cloudCover < 70 ? 1 : 0);

        if (hikingScore >= 7) results.phenomena.push('excellent hiking conditions');
        else if (hikingScore >= 5) results.phenomena.push('good hiking conditions');
        else if (rainRate !== undefined && rainRate > 2) results.phenomena.push('wet hiking conditions - waterproof gear needed');

        // Midnight sun hiking
        if (location.latitude > 66 && month >= 6 && month <= 7 && (hour >= 22 || hour <= 2)) results.phenomena.push('midnight sun hiking opportunity');
    }

    // Ice fishing season
    if (month >= 12 || month <= 3) if (iceDepth !== undefined && iceDepth > 20) results.phenomena.push('ice fishing season - check local ice reports');

    // Camping conditions
    if (month >= 6 && month <= 8)
        if (temp >= 10 && temp <= 25 && windSpeed !== undefined && windSpeed < 5) {
            if (hour >= 18 && hour <= 23) results.phenomena.push('pleasant evening for camping');
            if (!daylight.astronomicalDuskDecimal && location.latitude > 62) results.phenomena.push('white night camping - no darkness');
        }

    // Sauna and ice swimming
    if (temp < -10 && location.nearbyLakes) {
        results.phenomena.push('traditional ice swimming conditions');
        if (hour >= 16 && hour <= 20) results.phenomena.push('evening sauna and ice dip time');
    }

    // Aurora photography conditions (basic check - detailed in astronomy)
    if (!daylight.isDaytime && cloudCover !== undefined && cloudCover < 20 && (month >= 9 || month <= 3) && location.latitude > 60) {
        if (temp < -10 && windSpeed !== undefined && windSpeed < 3) results.phenomena.push('stable conditions for night photography');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.calendar)
        store.calendar = {
            consecutiveBrightNights: 0,
            consecutiveDarkDays: 0,
            firstSnowRecorded: false,
        };
    return {
        interpretCalendar,
        handleWinterPhenomena,
        handleSummerPhenomena,
        handleSpringPhenomena,
        handleAutumnPhenomena,
        handleTransitionalSeasons,
        handleDiurnalPatterns,
        handleSpecialDates,
        handleNordicWeatherPatterns,
        handleActivityConditions,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
