// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

//const helpers = require('./server-function-weather-helpers.js');
const toolsData = require('./server-function-weather-tools-data.js');

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCalendar(results, situation, data, data_previous) {
    const { month, hour, hourDecimal, daylight, location, comfort, solar } = situation;
    const { timestamp, temp, humidity, windSpeed, snowDepth, rainRate } = data;

    // may not be strictly to seasons
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
        if (daylight.astronomicalDuskDecimal && daylight.astronomicalDawnDecimal && daylight.astronomicalDuskDecimal > daylight.astronomicalDawnDecimal) results.phenomena.push('continuous twilight through night');

        if (!daylight.astronomicalDuskDecimal) results.phenomena.push('no astronomical darkness - stars not visible');

        // Golden hour that lasts for hours
        if (solar && solar.isGoldenHour && daylight.daylightHours > 18) results.phenomena.push('extended golden hour lighting');
    }

    // Winter darkness phenomena (November-January)
    else if (month >= 11 || month <= 1) {
        if (!daylight.isDaytime && hour >= 15 && hour < 18) {
            results.phenomena.push('early afternoon darkness');
            if (temp < -10) results.phenomena.push('cold evening setting in');
        }
        if (daylight.isDaytime && temp < -5) {
            results.phenomena.push('cold winter daylight');
            if (temp < -15 && hour >= 11 && hour <= 13) results.phenomena.push('midday still frigid');
        }
    }

    // Temperature-related time patterns, regardless of season
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

    if (windSpeed !== undefined && hour >= 6 && hour <= 22 && comfort === 'very uncomfortable') {
        // Only during waking hours
        if (temp < 0) results.phenomena.push('harsh conditions - limit exposure');
        else if (temp > 25) results.phenomena.push('oppressive conditions');
    }

    // Radiation fog in autumn/winter
    if (!daylight.isDaytime && temp < 10 && windSpeed !== undefined && windSpeed < 1 && humidity > 90) results.phenomena.push('radiation fog development likely');

    // Fog visibility
    if (humidity > 95 && temp > -5 && temp < 15 && windSpeed !== undefined && windSpeed < 3) results.phenomena.push('poor visibility - fog likely');
    else if (snowDepth !== undefined && snowDepth > 0 && windSpeed !== undefined && windSpeed > 15) results.phenomena.push('blowing snow - reduced visibility');
    else if (rainRate !== undefined && rainRate > 10) results.phenomena.push('heavy rain - limited visibility');

    // Temperature inversion fog
    if (!daylight.isDaytime && temp < 5 && windSpeed !== undefined && windSpeed < 1) {
        const past2Hours = toolsData.getRecentData(data_previous, timestamp, 2);
        if (past2Hours.isReasonablyDistributed() && past2Hours.entries.length > 0) {
            const tempChange = temp - past2Hours.back('temp', 60 * 60);
            if (tempChange > 2) {
                results.phenomena.push('temperature inversion strengthening');
                if (humidity > 85) results.phenomena.push('inversion fog developing');
            }
        }
    }
    // Advection fog (add
    if (location.distanceToOcean !== undefined && location.distanceToOcean < 20)
        if (temp > 5 && humidity > 90 && windSpeed !== undefined && windSpeed > 2 && windSpeed < 8) if ((month >= 4 && month <= 6) || (month >= 9 && month <= 11)) results.phenomena.push('coastal advection fog possible');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleWinterPhenomena(results, situation, data, data_previous, store) {
    const { daylight, month, hour, season, windChill, day } = situation;
    const { timestamp, temp, windSpeed, snowDepth, windDir, humidity, rainRate } = data;

    // only in winter, irrespective of "month"
    if (season !== 'winter') return;

    if (temp > 2) {
        results.phenomena.push('unusually mild winter day');
        if (month === 12 || month === 1) results.phenomena.push('winter thaw');
    } else if (temp < -20) {
        results.phenomena.push('severe Nordic winter');
        if (hour >= 6 && hour <= 18) results.phenomena.push('extreme cold despite daylight');

        // Diamond dust
        if (humidity > 80 && windSpeed !== undefined && windSpeed < 2) if (daylight.isDaytime) results.phenomena.push('diamond dust - ice crystals sparkling in air');
    }

    if (windChill < -20) results.phenomena.push(`severe wind chill: ${Math.round(windChill)}°C`);
    else if (windChill < -30) results.phenomena.push(`extreme wind chill: ${Math.round(windChill)}°C - frostbite risk in minutes`);
    else if (windChill < -40) results.phenomena.push(`dangerous wind chill: ${Math.round(windChill)}°C - frostbite risk in seconds`);

    // Winter inversions common in Nordic regions
    if (hour >= 6 && hour <= 10 && temp < -10 && windSpeed !== undefined && windSpeed < 2) results.phenomena.push('temperature inversion likely');

    // Rime ice formation
    if (temp < -5 && humidity > 95 && windSpeed !== undefined && windSpeed > 5) {
        results.phenomena.push('rime ice formation on surfaces');
        if (temp < -10 && windSpeed > 10) results.phenomena.push('heavy rime accumulation - power line risk');
    }

    // Winter morning phenomena
    if (hour >= 6 && hour <= 9) {
        if (!daylight.isDaytime) results.phenomena.push('dark winter morning');
        else if (temp < -10) results.phenomena.push('frigid morning');
    }

    // Winter afternoon
    if (hour >= 14 && hour <= 16) {
        if (!daylight.isDaytime) results.phenomena.push('early winter sunset approaching');
        else if (temp > -2 && temp < 3) results.phenomena.push('winter afternoon temperature peak');
    }

    if (snowDepth !== undefined) {
        if (!store.calendar.maxSnowDepth) store.calendar.maxSnowDepth = 0;
        if (snowDepth > store.calendar.maxSnowDepth) {
            store.calendar.maxSnowDepth = snowDepth;
            if (snowDepth > 100) results.phenomena.push(`record snow depth - ${snowDepth}cm`);
        }
        // Fresh snow detection
        if (!store.calendar.lastSnowDepth) store.calendar.lastSnowDepth = 0;
        const snowChange = snowDepth - store.calendar.lastSnowDepth;
        if (snowChange > 10) results.phenomena.push(`fresh snow - ${snowChange}cm new`);
        else if (snowChange < -10) results.phenomena.push(`rapid snowmelt - ${Math.abs(snowChange)}cm lost`);
        store.calendar.lastSnowDepth = snowDepth;

        // Snow aging patterns
        if (snowDepth > 20) {
            const pastWeek = toolsData.getRecentData(data_previous, timestamp, 7 * 24);
            if (pastWeek.isReasonablyDistributed()) {
                const tempFluctuations = pastWeek.entries.filter((e) => e.temp > -2 && e.temp < 2).length;
                if (pastWeek.isReasonablyDistributed() && tempFluctuations > 20) results.phenomena.push('metamorphosed snow - variable skiing conditions');
            }
        }

        // Snowpack stability based on recent temperature changes
        if (snowDepth > 30) {
            const pastDay = toolsData.getRecentData(data_previous, timestamp, 24);
            if (pastDay.isReasonablyDistributed()) {
                const maxRecent = pastDay.max('temp'),
                    minRecent = pastDay.min('temp');
                if (maxRecent > 0 && minRecent < -5) results.phenomena.push('unstable snowpack - avalanche risk in steep terrain');
                else if (temp > -2 && hour >= 12 && hour <= 16) results.phenomena.push('afternoon snow softening');
            }
        }
    }

    // Black ice formation patterns
    if (temp < 2 && temp > -2 && humidity > 80) {
        const past6Hours = toolsData.getRecentData(data_previous, timestamp, 6);
        if (past6Hours.isReasonablyDistributed()) {
            const minTemp = past6Hours.min('temp'),
                maxTemp = past6Hours.max('temp');
            if ((minTemp < 0 && maxTemp > 0) || (rainRate !== undefined && rainRate > 0 && temp < 0)) {
                results.phenomena.push('black ice risk on roads and paths');
                if (hour >= 5 && hour <= 9) results.phenomena.push('morning black ice - extreme caution');
                else if (hour >= 16 && hour <= 20) results.phenomena.push('evening black ice forming');
                if (location.forestCoverage === 'high') results.phenomena.push('treacherous conditions on shaded forest trails');
            }
        }
    }

    // Lake effect snow
    if (location.nearbyLakes && temp < -5 && windSpeed !== undefined && windSpeed > 5 && windDir !== undefined)
        if (month >= 11 || month <= 2) {
            const windFromLake = location.lakeDirection !== undefined && Math.abs(windDir - location.lakeDirection) < 90;
            if (windFromLake) results.phenomena.push('lake effect snow possible');
        }

    // Winter severity index
    const pastMonth = toolsData.getRecentData(data_previous, timestamp, 30 * 24);
    if (pastMonth.isReasonablyDistributed() && pastMonth.length > 500) {
        const freezingDegreeDays = pastMonth.entries.reduce((sum, e) => sum + (e.temp < 0 ? Math.abs(e.temp) : 0), 0) / 24;
        if (freezingDegreeDays > 500) results.phenomena.push('severe winter conditions persisting');
        else if (freezingDegreeDays > 300) results.phenomena.push('moderate winter severity');
        else if (freezingDegreeDays > 100) results.phenomena.push('mild winter conditions');
    }

    // Winter daylight tracking
    if (daylight.daylightHours < 6) {
        results.phenomena.push(`minimal daylight: ${daylight.daylightHours.toFixed(1)} hours`);
        if (month === 12 && day >= 10 && day <= 25) results.phenomena.push('darkest period of year');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleSummerPhenomena(results, situation, data) {
    const { daylight, hour, season, heatIndex, month, day } = situation;
    const { temp, humidity } = data;

    // only in summer, irrespective of "month"
    if (season !== 'summer') return;

    if (temp < 12) {
        results.phenomena.push('cool summer day');
        if (hour >= 2 && hour <= 5 && temp < 10) results.phenomena.push('cool summer morning');
    } else if (temp > 25) {
        results.phenomena.push('hot Nordic summer day');
        if (temp > 30) results.phenomena.push('exceptional summer heat');
    }

    if (daylight.daylightHours > 19) results.phenomena.push('extended Nordic summer daylight');
    if (daylight.daylightHours > 18.5 && daylight.daylightHours <= 19) results.phenomena.push('approaching white nights period');

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

    // Nordic heat stress thresholds (people not acclimatized to high heat)
    if (heatIndex > 32) {
        results.phenomena.push('exceptional heat stress for Nordic climate');
        if (hour >= 11 && hour <= 16) results.phenomena.push('seek shade and hydration - unusual conditions');
    } else if (heatIndex > 28) results.phenomena.push('uncomfortable heat and humidity for Nordic standards');

    // Seasonal forest fire risk period
    if (month >= 5 && month <= 8) {
        if (month === 7 || (month === 8 && day <= 15)) results.phenomena.push('peak forest fire season');
        else if (month === 5 || month === 6) results.phenomena.push('early fire season - risk increasing');
    }

    if (month >= 6 && month <= 8) {
        if (hour >= 14 && hour <= 18) {
            results.phenomena.push('peak thunderstorm development hours');
            if (month === 7) results.phenomena.push('height of thunderstorm season');
        }
        // Nordic thunderstorm patterns
        if (daylight.isDaytime && hour >= 12 && hour <= 20) results.phenomena.push('convective period - storms possible with right conditions');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleSpringPhenomena(results, situation, data) {
    const { month, hour, daylight } = situation;
    const { temp, rainRate, snowDepth } = data;

    // not necessary, working by month
    // if (season !== 'spring') return;

    switch (month) {
        case 3:
            if (temp > 8) results.phenomena.push('early spring warmth');
            if (snowDepth !== undefined && snowDepth > 0 && temp > 5) results.phenomena.push('spring snowmelt');
            // Crust snow conditions
            if (temp > 0 && hour >= 10 && hour <= 15 && snowDepth !== undefined && snowDepth > 10) results.phenomena.push('spring crust snow - good skiing conditions');
            if (snowDepth !== undefined && snowDepth > 50) results.phenomena.push('delayed spring - heavy snow pack remains');
            break;
        case 4:
            if (rainRate !== undefined && rainRate > 0 && temp > 5) results.phenomena.push('spring rain');
            if (temp > 15) results.phenomena.push('warm spring day');
            if (snowDepth === 0 && temp > 10) results.phenomena.push('early spring - snow gone already');
            break;
        case 5:
            if (temp > 20) results.phenomena.push('early summer warmth arriving');
            if (hour >= 3 && hour <= 7 && (daylight.isDaytime || daylight.phase === 'civil_dawn')) results.phenomena.push('spring dawn chorus time');
            break;
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleAutumnPhenomena(results, situation, data, data_previous) {
    const { month, hour, daylight, dewPoint } = situation;
    const { timestamp, temp, rainRate, windSpeed, humidity } = data;

    // not necessary, working by month
    // if (season !== 'autumn') return;

    switch (month) {
        case 9:
            if (temp < 5) results.phenomena.push('early autumn chill');
            if (hour >= 6 && hour <= 9 && temp < 10 && humidity > 80) results.phenomena.push('morning fog formation likely');
            // First frost warnings based on dewpoint
            if (dewPoint < 2 && temp < 5 && (hour >= 22 || hour <= 6)) results.phenomena.push('ground frost possible tonight');
            // delayed/early
            const pastMonth = toolsData.getRecentData(data_previous, timestamp, 30 * 24);
            if (pastMonth.isReasonablyDistributed() && pastMonth.length > 20) {
                const septemberAvg = pastMonth.avg('temp');
                if (septemberAvg > 15) results.phenomena.push('warm autumn - delayed fall colors');
                else if (septemberAvg < 8) results.phenomena.push('cool autumn - early dormancy');
            }
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
    const { timestamp, temp, windSpeed, rainRate, snowDepth, iceDepth, pressure, humidity } = data;

    // Seasonal transition markers
    if (month === 9 && temp < 10) {
        const pastWeek = toolsData.getRecentData(data_previous, timestamp, 7 * 24);
        if (pastWeek.isReasonablyDistributed()) {
            const weekAgoTemp = pastWeek.oldest('temp');
            if (weekAgoTemp !== undefined && weekAgoTemp - temp > 3) results.phenomena.push('autumn cooling accelerating');
        }
    }
    if (month === 5 && temp > 15) {
        const pastWeek = toolsData.getRecentData(data_previous, timestamp, 7 * 24);
        if (pastWeek.isReasonablyDistributed()) {
            const weekAgoTemp = pastWeek.oldest('temp');
            if (weekAgoTemp !== undefined && temp - weekAgoTemp > 5) results.phenomena.push('spring warming accelerating');
        }
    }

    // Breakup season intensity
    if (month === 4 && location.nearbyLakes) {
        const past3Days = toolsData.getRecentData(data_previous, timestamp, 3 * 24);
        if (past3Days.isReasonablyDistributed()) {
            const warmingTrend = temp > (past3Days.avg('temp') || temp) + 2 ? 2 : 0;
            const breakupScore = (temp > 10 ? 3 : temp > 5 ? 2 : 1) + (windSpeed !== undefined && windSpeed > 10 ? 2 : 0) + (rainRate !== undefined && rainRate > 0 ? 1 : 0) + warmingTrend;
            if (breakupScore >= 5) results.phenomena.push('intense spring breakup conditions');
            else if (breakupScore >= 3) results.phenomena.push('active breakup period');
        }
    }

    // Spring ice breakup (April-May)
    if (month === 4 || (month === 5 && day <= 15)) {
        if (temp > 5 && daylight.isDaytime) {
            results.phenomena.push('lake ice weakening period');
            if (temp > 10 && windSpeed !== undefined && windSpeed > 5) results.phenomena.push('rapid ice breakup conditions');
        }
        if (location.nearbyLakes && temp > 0 && hour >= 10 && hour <= 16) results.phenomena.push('unsafe ice conditions - stay off lakes');
    }

    // First/last snow indicators
    if (month === 10 || month === 11) {
        if (temp < 2 && rainRate !== undefined && rainRate > 0) results.phenomena.push('precipitation may turn to snow');
        if (snowDepth !== undefined && snowDepth > 0 && !store.calendar.firstSnowRecorded) {
            results.phenomena.push('first snow on ground');
            store.calendar.firstSnowRecorded = true;
        }
    }

    // Graupel conditions
    if ((month >= 3 && month <= 5) || (month >= 9 && month <= 11)) {
        if (temp > -2 && temp < 5 && rainRate !== undefined && rainRate > 0) {
            results.phenomena.push('graupel possible - soft hail pellets');
            if (windSpeed !== undefined && windSpeed > 10) results.phenomena.push('wind-driven graupel');
        }
    }

    // Spring melt patterns
    if ((month === 3 && day >= 15) || month === 4) {
        if (temp > 5 && hour >= 12 && hour <= 15 && snowDepth !== undefined && snowDepth > 0) {
            results.phenomena.push('peak daily snowmelt period');
            if (temp > 10 && snowDepth > 50) results.phenomena.push('rapid spring melt - flooding possible in low-lying areas');
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
    // Ice growth or decay
    if (iceDepth !== undefined && location.nearbyLakes) {
        if (month >= 11 || month <= 3) {
            // Track ice growth
            if (!store.calendar.lastIceDepth) store.calendar.lastIceDepth = 0;
            const iceGrowth = iceDepth - store.calendar.lastIceDepth;
            store.calendar.lastIceDepth = iceDepth;
            if (iceGrowth > 5) results.phenomena.push(`rapid ice growth - ${iceGrowth}cm since last reading`);
        }
        // Spring ice decay
        if (month >= 3 && month <= 5 && iceDepth > 0 && iceDepth < 30) results.phenomena.push('deteriorating ice - extreme danger');
    }

    // Freeze-thaw cycle detection
    if ((month >= 3 && month <= 4) || (month >= 10 && month <= 11)) {
        const past12Hours = toolsData.getRecentData(data_previous, timestamp, 12);
        if (past12Hours.isReasonablyDistributed()) {
            const crossedZero = past12Hours.any((e) => e.temp > 0) && past12Hours.any((e) => e.temp < 0);
            if (crossedZero) {
                results.phenomena.push('freeze-thaw cycle active');
                if (snowDepth !== undefined && snowDepth > 0) results.phenomena.push('unstable snow conditions');
            }
        }
    }

    // Freezing rain conditions
    if (temp > 0 && temp < 3 && rainRate !== undefined && rainRate > 0) {
        const past2Hours = toolsData.getRecentData(data_previous, timestamp, 2);
        if (past2Hours.isReasonablyDistributed() && past2Hours.entries.length > 0) {
            const groundTemp = past2Hours.back('temp', 60 * 60);
            if (groundTemp && groundTemp < 0) {
                results.phenomena.push('freezing rain risk - extreme ice danger');
                results.phenomena.push('treacherous road conditions developing');
            }
        }
    }

    // Spring convection
    if (month >= 4 && month <= 6)
        if (hour >= 14 && hour <= 18 && temp > 15)
            if (pressure < 1013 && humidity > 60) {
                results.phenomena.push('afternoon convection developing');
                if (temp > 20) results.phenomena.push('thunderstorm potential');
            }

    // Phenological temperature accumulation
    const springStart = new Date(timestamp);
    springStart.setMonth(2); // March 1
    springStart.setDate(1);
    if (timestamp > springStart.getTime() && month >= 3 && month <= 5) {
        const daysSinceSpringStart = Math.floor((timestamp - springStart.getTime()) / (24 * 60 * 60 * 1000)),
            springData = toolsData.getRecentData(data_previous, timestamp, daysSinceSpringStart * 24);
        if (springData.isReasonablyDistributed()) {
            const accumulated = springData.entries.reduce((sum, e) => sum + Math.max(0, e.temp - 5), 0);
            if (accumulated > 150 && accumulated < 200) results.phenomena.push('early spring phenological threshold approaching');
            else if (accumulated > 200 && accumulated < 300) results.phenomena.push('early spring phenological threshold reached');
            else if (accumulated > 450 && accumulated < 550) results.phenomena.push('peak spring growth conditions');
        }
    }

    // Autumn temperature gradient
    if (month >= 8 && month <= 10) {
        const pastTwoWeeks = toolsData.getRecentData(data_previous, timestamp, 14 * 24);
        if (pastTwoWeeks.isReasonablyDistributed()) {
            const firstWeek = pastTwoWeeks.between(14 * 24 * 60 * 60, 7 * 24 * 60 * 60), // 14-7 days ago
                secondWeek = pastTwoWeeks.between(7 * 24 * 60 * 60, 0); // 7-0 days ago
            if (firstWeek.length > 50 && secondWeek.length > 50) {
                const firstAvg = firstWeek.reduce((sum, e) => sum + e.temp, 0) / firstWeek.length,
                    secondAvg = secondWeek.reduce((sum, e) => sum + e.temp, 0) / secondWeek.length,
                    coolingRate = (firstAvg - secondAvg) / 7; // per day
                if (coolingRate > 0.5) results.phenomena.push(`rapid autumn cooling: ${coolingRate.toFixed(1)}°C/day`);
                else if (coolingRate > 0.3) results.phenomena.push(`steady autumn cooling: ${coolingRate.toFixed(1)}°C/day`);
            }
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleDiurnalPatterns(results, situation, data, data_previous) {
    const { hour, season, daylight, month, dewPoint } = situation;
    const { timestamp, temp, cloudCover, windSpeed, humidity } = data;

    const pastDay = toolsData.getRecentData(data_previous, timestamp, 24);
    if (!pastDay.isReasonablyDistributed()) return;
    const minTemp = pastDay.min('temp') || temp,
        maxTemp = pastDay.max('temp') || temp,
        tempRange = maxTemp - minTemp;

    const seasonalRange = season === 'winter' ? 8 : season === 'summer' ? 15 : 12;
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

    if (daylight.isDaytime && cloudCover !== undefined)
        if (month >= 11 || month <= 2) {
            const daylightQuality = cloudCover < 30 ? 'bright daylight' : cloudCover < 70 ? 'filtered daylight' : 'gloomy daylight';
            results.phenomena.push(`precious winter ${daylightQuality}`);
        }

    // Radiation fog formation timing
    if (!daylight.isDaytime && cloudCover !== undefined && cloudCover < 20 && windSpeed !== undefined && windSpeed < 2 && humidity > 80) {
        if (temp < dewPoint + 3) {
            if (hour >= 22 || hour <= 6) {
                results.phenomena.push('radiation fog developing');
                if (location.forestCoverage === 'high') results.phenomena.push('dense fog pooling in forest clearings and valleys');
            }
            // Morning fog dissipation
            if (hour >= 6 && hour <= 10 && daylight.isDaytime) results.phenomena.push('morning fog lifting');
        }
    }

    // Temperature anomalies for the season
    // XXX should be specified elsewhere
    const seasonalNorms = {
        winter: { min: -15, max: -2 },
        spring: { min: -5, max: 10 },
        summer: { min: 8, max: 22 },
        autumn: { min: 0, max: 12 },
    };
    const norm = seasonalNorms[season];
    if (temp > norm.max + 10) results.phenomena.push(`exceptionally warm for ${season}: ${temp}°C`);
    else if (temp < norm.min - 10) results.phenomena.push(`exceptionally cold for ${season}: ${temp}°C`);
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

    // White nights period
    if (location.latitude > 59 && daylight.daylightHours > 18) {
        if (month === 6) results.phenomena.push('white nights period - civil twilight all night');
        else if (month === 5 && day >= 20) results.phenomena.push('approaching white nights period');
        else if (month === 7 && day <= 10) results.phenomena.push('late white nights period');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleNordicWeatherPatterns(results, situation, data, data_previous, _store) {
    const { month, hour, daylight, location, season } = situation;
    const { timestamp, temp, windSpeed, windDir, pressure, rainRate, humidity } = data;

    // Sea/land breeze effects (mainly summer)
    if (location.distanceToOcean !== undefined && location.distanceToOcean < 30)
        if (month >= 5 && month <= 8 && daylight.isDaytime) {
            if (hour >= 10 && hour <= 16)
                if (windDir !== undefined && windDir >= 240 && windDir <= 300) {
                    results.phenomena.push('sea breeze cooling effect');
                    if (temp > 25 && windSpeed !== undefined && windSpeed > 3) results.phenomena.push('refreshing coastal breeze');
                }
            if (hour >= 20 || hour <= 6) if (windDir !== undefined && ((windDir >= 270 && windDir <= 360) || (windDir >= 90 && windDir <= 180))) results.phenomena.push('land breeze pattern');
        }

    // Föhn effects in mountainous areas
    if (location.nearMountains && windSpeed !== undefined && windSpeed > 8)
        if (pressure < 1010 && temp > 10) {
            results.phenomena.push('possible föhn wind effect - warm downslope flow');
            if (month >= 11 || month <= 3) results.phenomena.push('föhn-induced winter warming');
        }

    // Baltic Sea and maritime influence
    if (location.distanceToOcean !== undefined && location.distanceToOcean < 50) {
        // Winter maritime effects
        if (month >= 11 || month <= 3) {
            if (temp > 2 && windDir !== undefined && windDir >= 45 && windDir <= 135) results.phenomena.push('mild maritime air from baltic');
            // Open water effect in early winter
            if (month === 11 || month === 12) if (temp > 0 && windSpeed !== undefined && windSpeed > 5) results.phenomena.push('baltic sea warmth - ice-free waters moderating temperature');
            // Sea ice influence in late winter
            if (month >= 1 && month <= 3) if (temp < -10 && windDir !== undefined && windDir >= 45 && windDir <= 135) results.phenomena.push('cold air over frozen baltic');
        }
        // Spring maritime effects
        if (month >= 4 && month <= 5) {
            if (temp < 10 && windDir !== undefined && windDir >= 45 && windDir <= 135) results.phenomena.push('cold baltic spring breeze');
            // Spring sea fog
            if (temp > 5 && humidity > 85) results.phenomena.push('coastal fog likely - warm air over cold sea');
        }
        // Summer maritime effects
        if (month >= 6 && month <= 8) {
            if (temp > 20 && windDir !== undefined && windDir >= 180 && windDir <= 270) results.phenomena.push('cooling sea breeze from baltic');
            // Tropical nights near coast
            if ((temp > 20 && hour >= 22) || hour <= 4) results.phenomena.push('tropical night - maritime warmth');
        }
        // Autumn maritime effects
        if (month >= 9 && month <= 10) {
            if (temp > 10 && windSpeed !== undefined && windSpeed > 8) results.phenomena.push('warm maritime air - delayed autumn');
            // Autumn storms
            if (pressure < 1005 && windSpeed !== undefined && windSpeed > 15) results.phenomena.push('baltic autumn storm');
        }
    }

    // Norwegian Sea influence
    if (location.distanceToOcean !== undefined && location.distanceToOcean < 100 && location.latitude > 62)
        if (windDir !== undefined && windDir >= 225 && windDir <= 315) if (month >= 11 || month <= 3) results.phenomena.push('mild atlantic air from norwegian sea');

    // High pressure patterns
    if (pressure > 1025) {
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
    if (pressure < 1000 && windSpeed !== undefined && windSpeed > 10) {
        results.phenomena.push('atlantic storm system');
        if (rainRate !== undefined && rainRate > 5) results.phenomena.push('heavy rain from atlantic low');
    }

    // Polar front passages
    const past2Hours = toolsData.getRecentData(data_previous, timestamp, 2);
    if (past2Hours.isReasonablyDistributed() && past2Hours.entries.length > 0) {
        const lastPressure = past2Hours.back('pressure', 60 * 60);
        if (lastPressure && Math.abs(pressure - lastPressure) > 5) {
            results.phenomena.push('weather front passage');
            if (pressure < lastPressure) results.phenomena.push('cold front arriving');
            else results.phenomena.push('high pressure building');
        }
    }

    // Specific Nordic high pressure patterns
    if (pressure > 1030) {
        if (season === 'winter' && temp < -10) {
            results.phenomena.push('scandinavian blocking high - persistent cold');
            const past5Days = toolsData.getRecentData(data_previous, timestamp, 5 * 24);
            if (past5Days.isReasonablyDistributed()) {
                const highPressureDays = past5Days.entries.filter((e) => e.pressure > 1025).length / 24;
                if (highPressureDays > 3) results.phenomena.push('prolonged high pressure - stable winter weather');
            }
        } else if (season === 'summer' && temp > 20) results.phenomena.push('summer high pressure - stable warm weather');
    }

    // Arctic air outbreaks
    if (temp < -25 && windDir !== undefined && ((windDir >= 315 && windDir <= 360) || (windDir >= 0 && windDir <= 45))) {
        results.phenomena.push('arctic air outbreak from north');
        if (windSpeed !== undefined && windSpeed > 10) results.phenomena.push('severe arctic blast with strong winds');
    }

    // Polar low detection
    if (pressure < 990 && location.latitude > 65 && (month >= 10 || month <= 3)) results.phenomena.push('possible polar low system');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function handleActivityConditions(results, situation, data, data_previous) {
    const { month, day, hour, daylight, location } = situation;
    const { timestamp, temp, windSpeed, snowDepth, rainRate, cloudCover, iceDepth } = data;

    // Winter driving conditions
    if (snowDepth !== undefined && snowDepth > 0) {
        if (temp > -1 && temp < 1) results.phenomena.push('slippery driving - snow near melting');
        else if (snowDepth > 5 && windSpeed !== undefined && windSpeed > 10) results.phenomena.push('snow drift risk on roads');
    }
    // Cross-country skiing conditions
    if (snowDepth !== undefined && snowDepth > 20) {
        if (temp >= -12 && temp <= -3) {
            results.phenomena.push('excellent cross-country skiing conditions');
            if (hour >= 9 && hour <= 15) results.phenomena.push('ideal time for winter sports');
        } else if (temp > -2 && temp < 2) results.phenomena.push('sticky snow - waxing challenging');
        else if (temp < -15) results.phenomena.push('very cold - dress warmly for skiing');

        // Spring skiing
        if (month === 3 || (month === 4 && day <= 15)) {
            if (temp > 0 && hour >= 10 && hour <= 14) results.phenomena.push('spring skiing - slushy afternoon snow');
            if (temp < -5 && hour >= 7 && hour <= 10) results.phenomena.push('firm morning crust - excellent for touring');
        }

        // On recent data
        const past24h = toolsData.getRecentData(data_previous, timestamp, 24);
        if (past24h.isReasonablyDistributed()) {
            const maxTemp24h = past24h.max('temp'),
                minTemp24h = past24h.min('temp');
            if (maxTemp24h < -5 && minTemp24h < -10) results.phenomena.push('powder snow conditions - excellent for skiing');
            else if (maxTemp24h > 0 && minTemp24h < -5) results.phenomena.push('freeze-thaw snow - icy in morning, slushy afternoon');
            else if (maxTemp24h > -2 && maxTemp24h < 2) results.phenomena.push('transformed snow - good for groomed trails');
        }
    }
    // Snowshoeing conditions
    if (snowDepth !== undefined && snowDepth > 40) {
        if (temp >= -20 && temp <= -5 && windSpeed !== undefined && windSpeed < 5) {
            results.phenomena.push('excellent snowshoeing conditions');
            if (snowDepth > 60) {
                results.phenomena.push('deep powder - snowshoes recommended for hiking');
            }
        }
    }

    // Ice fishing season
    if (iceDepth !== undefined) {
        if (iceDepth < 5) results.phenomena.push('thin ice - extreme danger');
        else if (iceDepth >= 5 && iceDepth < 10) results.phenomena.push('ice forming - absolutely no access');
        else if (iceDepth >= 10 && iceDepth < 15) results.phenomena.push('ice strengthening - still unsafe for any activity');
        else if (iceDepth >= 15 && iceDepth < 25) results.phenomena.push('ice may support walking - verify locally, avoid groups');
        else if (iceDepth >= 25) results.phenomena.push('ice suitable for activities - follow local guidelines');
    }

    // Ice skating on natural ice
    if (iceDepth !== undefined && iceDepth > 15 && snowDepth !== undefined && snowDepth < 5)
        if (temp < -5) {
            results.phenomena.push('natural ice skating possible - verify local conditions');
            if (iceDepth > 20 && snowDepth === 0) results.phenomena.push('excellent clear ice for skating');
        }

    // Sauna and ice swimming
    if (temp < -10 && location.nearbyLakes) {
        results.phenomena.push('traditional ice swimming conditions');
        if (hour >= 16 && hour <= 20) results.phenomena.push('evening sauna and ice dip time');
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

    // Camping conditions
    if (month >= 6 && month <= 8)
        if (temp >= 10 && temp <= 25 && windSpeed !== undefined && windSpeed < 5) {
            if (hour >= 18 && hour <= 23) results.phenomena.push('pleasant evening for camping');
            if (!daylight.astronomicalDuskDecimal && location.latitude > 62) results.phenomena.push('white night camping - no darkness');
        }

    // Aurora photography conditions (basic check - detailed in astronomy)
    if (!daylight.isDaytime && cloudCover !== undefined && cloudCover < 20 && (month >= 9 || month <= 3) && location.latitude > 60)
        if (temp < -10 && windSpeed !== undefined && windSpeed < 3) results.phenomena.push('stable conditions for night photography');

    // Optimal outdoor work windows
    if (month >= 4 && month <= 9)
        if (temp >= 10 && temp <= 20 && windSpeed !== undefined && windSpeed < 5 && (rainRate === undefined || rainRate === 0)) {
            if (hour >= 8 && hour <= 11) results.phenomena.push('ideal morning for outdoor work');
            else if (hour >= 16 && hour <= 19) results.phenomena.push('pleasant evening for gardening');
        }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function ({ store }) {
    if (!store.calendar) store.calendar = {};
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
