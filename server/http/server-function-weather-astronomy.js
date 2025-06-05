// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

const EQUINOX_LOOKAHEAD_DAYS = 14;
const SOLSTICE_LOOKAHEAD_DAYS = 14;
const CROSSQUARTER_LOOKAHEAD_DAYS = 7;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretEquinox(results, situation, data, _data_previous, _store, _options) {
    const { windSpeed } = data;
    const { date, location } = situation;

    const equinoxInfo = helpers.isNearEquinox(date, location.hemisphere, EQUINOX_LOOKAHEAD_DAYS);
    if (equinoxInfo.near) {
        let equinoxText;
        if (equinoxInfo.exact) equinoxText = 'today (equal day and night)';
        else if (equinoxInfo.days > 0) equinoxText = `in ${Math.ceil(equinoxInfo.days)} day${Math.ceil(equinoxInfo.days) > 1 ? 's' : ''}`;
        else equinoxText = `${Math.abs(Math.floor(equinoxInfo.days))} day${Math.abs(Math.floor(equinoxInfo.days)) > 1 ? 's' : ''} ago`;
        results.phenomena.push(`${equinoxInfo.type} ${equinoxText}`);

        // Daylight change rate
        results.phenomena.push(`rapidly ${equinoxInfo.type.includes('spring') ? 'increasing' : 'decreasing'} daylight`);

        // Calculate approximate daylight change rate
        if (location.latitude > 50)
            results.phenomena.push(`daylight changing ~${Math.round(Math.abs(Math.sin((location.latitude * Math.PI) / 180)) * 4)} min/day`);

        // Equinox storms
        if (Math.abs(equinoxInfo.days) <= 3 && windSpeed > 10) results.phenomena.push('equinoctial gales');

        // Aurora activity
        if (location.latitude > 55 && Math.abs(equinoxInfo.days) <= 7) results.phenomena.push('enhanced aurora activity period');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolstice(results, situation, data, _data_previous, store, _options) {
    const { cloudCover, snowDepth, temp } = data;
    const { date, hour, location, daylight } = situation;

    const solsticeInfo = helpers.isNearSolstice(date, location.hemisphere, SOLSTICE_LOOKAHEAD_DAYS);
    if (solsticeInfo.near) {
        let solsticeText;
        if (solsticeInfo.exact) solsticeText = 'today';
        else if (solsticeInfo.days > 0) solsticeText = `in ${Math.ceil(solsticeInfo.days)} day${Math.ceil(solsticeInfo.days) > 1 ? 's' : ''}`;
        else solsticeText = `${Math.abs(Math.floor(solsticeInfo.days))} day${Math.abs(Math.floor(solsticeInfo.days)) > 1 ? 's' : ''} ago`;
        results.phenomena.push(`${solsticeInfo.type} ${solsticeText}`);

        if (solsticeInfo.type === 'longest day') {
            // Summer solstice phenomena
            if (daylight.daylightHours > 16) {
                results.phenomena.push('extended daylight hours');
                if (daylight.daylightHours > 18) results.phenomena.push(`${Math.round(daylight.daylightHours)} hours of daylight`);
            }

            // Latitude variations
            if (location.latitude > 59.5) {
                if (location.latitude > 66.5 && daylight.daylightHours >= 24) {
                    results.phenomena.push('true midnight sun (sun never sets)');
                    if (cloudCover !== undefined && cloudCover < 50) results.phenomena.push('midnight sun visible');
                } else if (location.latitude > 63) {
                    results.phenomena.push('near-midnight sun');
                    if (daylight.civilDuskDecimal > 23 || daylight.civilDawnDecimal < 1) results.phenomena.push('no true darkness (civil twilight all night)');
                } else if (location.latitude > 60) {
                    results.phenomena.push('white nights period');
                    results.phenomena.push('twilight throughout the night');
                }
            }

            // Full moon during summer solstice
        	const lunarPhase = helpers.getLunarPhase(date);
            if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
                results.phenomena.push('solstice full moon (rare astronomical event)');
                if (cloudCover !== undefined && cloudCover < 40) results.phenomena.push('strawberry moon visible');
            }

            // Cultural phenomena
            if (location.latitude > 55) if (Math.abs(solsticeInfo.days) <= 3) results.phenomena.push('midsummer celebration period');
        } else if (solsticeInfo.type === 'shortest day') {
            // Winter solstice phenomena
            if (daylight.daylightHours < 8) {
                results.phenomena.push(`brief daylight (${Math.round(daylight.daylightHours)} hours)`);
                if (daylight.daylightHours < 6) results.phenomena.push('minimal daylight period');
            }

            // Latitude variations
            if (location.latitude > 59.5) {
                results.phenomena.push('extended darkness period');
                if (location.latitude > 66.5 && daylight.daylightHours < 0.1) {
                    results.phenomena.push('polar night (sun never rises)');
                    store.astronomy.consecutiveDarkDays = (store.astronomy.consecutiveDarkDays || 0) + 1;
                } else if (location.latitude > 63) {
                    results.phenomena.push('near-polar twilight');
                    if (daylight.daylightHours < 3) results.phenomena.push('sun barely above horizon');
                } else if (location.latitude > 60) {
                    results.phenomena.push('very short days');
                    if (hour >= 14 && !daylight.isDaytime) results.phenomena.push('afternoon darkness');
                }
            }

            // Full moon during winter solstice
        	const lunarPhase = helpers.getLunarPhase(date);
            if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
                results.phenomena.push('winter solstice full moon');
                if (cloudCover !== undefined && cloudCover < 40) {
                    results.phenomena.push('cold moon illuminating snow');
                    if (snowDepth > 50) results.phenomena.push('moonlight reflected by snow cover');
                }
            }

            // Temperature-related solstice phenomena
            if (temp !== undefined && temp < -10 && Math.abs(solsticeInfo.days) <= 7) results.phenomena.push('deep winter cold near solstice');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCrossQuarter(results, situation, _data, _data_previous, _store, _options) {
    const { date, hour, location, daylight } = situation;

    const crossQuarterInfo = helpers.isNearCrossQuarter(date, location.hemisphere, CROSSQUARTER_LOOKAHEAD_DAYS);
    if (crossQuarterInfo.near) {
        results.phenomena.push(`cross-quarter day: ${crossQuarterInfo.name}`);

        // Add cultural context for cross-quarter days
        if (crossQuarterInfo.name.includes('Imbolc')) results.phenomena.push('traditional start of spring');
        else if (crossQuarterInfo.name.includes('Beltane')) {
            results.phenomena.push('traditional start of summer');
            if (location.latitude > 58 && hour >= 21 && daylight.isDaytime) results.phenomena.push('Beltane white nights');
        } else if (crossQuarterInfo.name.includes('Lughnasadh')) results.phenomena.push('traditional harvest festival');
        else if (crossQuarterInfo.name.includes('Samhain')) {
            results.phenomena.push('traditional start of winter');
            if (hour >= 16 && !daylight.isDaytime) results.phenomena.push('early darkness of Samhain');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMoonPhase(results, situation, data, _data_previous, store, _options) {
    const { cloudCover, snowDepth, humidity, temp } = data;
    const { date, month, day, hour, location } = situation;

    if (!store.astronomy)
        store.astronomy = {
            consecutiveFullMoonNights: 0, // XXX unused
            consecutiveNewMoonNights: 0, // XXX unused
        };

    const lunarPhase = helpers.getLunarPhase(date);
     const lunarDistance = helpers.getLunarDistance(date);


    if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
        // Full moon
        results.phenomena.push('full moon tonight');
        store.astronomy.consecutiveFullMoonNights++;

        // Moon visibility conditions
        if (cloudCover !== undefined) {
            if (cloudCover < 30) {
                results.phenomena.push('clear skies for moon viewing');
                if (temp !== undefined && temp < -5 && humidity < 50) results.phenomena.push('crisp moonlight conditions');
            } else if (cloudCover < 70) results.phenomena.push('partial moon visibility through clouds');
            else results.phenomena.push('moon obscured by clouds');
        }

        // Snow and moon interaction
        if (snowDepth > 50 && cloudCover !== undefined && cloudCover < 40) {
            results.phenomena.push('bright moonlit snow landscape');
            if (temp < -10) results.phenomena.push('sparkling snow crystals in moonlight');
        }

        // Special full moons
        switch (month) {
            case 0:
                results.phenomena.push('wolf moon');
                break;
            case 1:
                results.phenomena.push('snow moon');
                break;
            case 2:
                results.phenomena.push('worm moon');
                break;
            case 3:
                results.phenomena.push('pink moon');
                break;
            case 4:
                results.phenomena.push('flower moon');
                break;
            case 5:
                results.phenomena.push('strawberry moon');
                break;
            case 6:
                results.phenomena.push('buck moon');
                break;
            case 7:
                results.phenomena.push('sturgeon moon');
                break;
            case 8:
                results.phenomena.push('harvest moon');
                break;
            case 9:
                results.phenomena.push("hunter's moon");
                break;
            case 10:
                results.phenomena.push('beaver moon');
                break;
            case 11:
                results.phenomena.push('cold moon');
                break;
        }
    } else if (lunarPhase >= 0.98 || lunarPhase <= 0.02) {
        // New moon
        results.phenomena.push('new moon tonight');
        store.astronomy.consecutiveNewMoonNights++;

        if (cloudCover !== undefined && cloudCover < 30) {
            if (location.lightPollution === 'low') {
                results.phenomena.push('excellent stargazing conditions');
                if (month >= 6 && month <= 8 && hour >= 22) results.phenomena.push('Milky Way visible');
            } else if (location.lightPollution === 'medium') results.phenomena.push('good conditions for bright stars');
        }

        // Meteor shower visibility
        if (month === 7 && day >= 10 && day <= 15) results.phenomena.push('Perseid meteor shower viewing optimal');
        else if (month === 11 && day >= 14 && day <= 18) results.phenomena.push('Leonid meteor shower viewing optimal');
    } else if ((lunarPhase >= 0.23 && lunarPhase <= 0.27) || (lunarPhase >= 0.73 && lunarPhase <= 0.77)) {
        // Quarter moons

        const quarterType = lunarPhase < 0.5 ? 'first' : 'last';
        results.phenomena.push(`${quarterType} quarter moon tonight`);

        if (quarterType === 'first' && hour >= 18 && hour <= 23) results.phenomena.push('moon visible in evening sky');
        else if (quarterType === 'last' && hour >= 0 && hour <= 6) results.phenomena.push('moon visible in morning sky');
    } else if (lunarPhase > 0.02 && lunarPhase < 0.23) results.phenomena.push('waxing crescent moon');
    else if (lunarPhase > 0.27 && lunarPhase < 0.48) results.phenomena.push('waxing gibbous moon');
    else if (lunarPhase > 0.52 && lunarPhase < 0.73) results.phenomena.push('waning gibbous moon');
    else if (lunarPhase > 0.77 && lunarPhase < 0.98) results.phenomena.push('waning crescent moon');

    // Supermoon and micromoon
    if (lunarDistance.isSupermoon && lunarPhase >= 0.48 && lunarPhase <= 0.52) {
        results.phenomena.push('supermoon - appears larger and brighter');
        results.phenomena.push(`moon ${Math.round(((384400 - lunarDistance.distance) / 384400) * 100)}% closer than average`);
        if (cloudCover !== undefined && cloudCover < 50) results.phenomena.push('enhanced moonlight from supermoon');
    } else if (lunarDistance.isMicromoon && lunarPhase >= 0.48 && lunarPhase <= 0.52) {
        results.phenomena.push('micromoon - appears smaller and dimmer');
        results.phenomena.push(`moon ${Math.round(((lunarDistance.distance - 384400) / 384400) * 100)}% farther than average`);
    }

    // Blue moon detection (simplified - second full moon in calendar month)
    if (lunarPhase >= 0.48 && lunarPhase <= 0.52 && day >= 29) {
        // Check if there was a full moon earlier this month
        const earlierDate = new Date(date);
        earlierDate.setDate(1);
        let foundEarlierFullMoon = false;
        for (let d = 1; d <= 28; d++) {
            earlierDate.setDate(d);
            const earlierPhase = helpers.getLunarPhase(earlierDate);
            if (earlierPhase >= 0.48 && earlierPhase <= 0.52) {
                foundEarlierFullMoon = true;
                break;
            }
        }
        if (foundEarlierFullMoon) {
            results.phenomena.push('blue moon (second full moon this month)');
            results.alerts.push('rare blue moon occurrence');
        }
    }

    // Harvest moon specific phenomena
    if (month === 8 && lunarPhase >= 0.48 && lunarPhase <= 0.52) {
        const equinox = helpers.isNearEquinox(date, location.hemisphere, 7);
        if (equinox.near) {
            results.phenomena.push('harvest moon near autumn equinox');
            if (hour >= 17 && hour <= 20) results.phenomena.push('moon rising near sunset');
        }
    }

    // Moon and tides (for coastal areas)
    if (location.elevation < 50 && location.forestCoverage !== 'high') {
        if ((lunarPhase >= 0.48 && lunarPhase <= 0.52) || lunarPhase >= 0.98 || lunarPhase <= 0.02) {
            results.phenomena.push('spring tides (if near coast)');
            if (lunarDistance.isSupermoon) results.phenomena.push('king tides possible');
        } else if ((lunarPhase >= 0.23 && lunarPhase <= 0.27) || (lunarPhase >= 0.73 && lunarPhase <= 0.77)) results.phenomena.push('neap tides (if near coast)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (_options) {
    return {
        interpretEquinox,
        interpretSolstice,
        interpretCrossQuarter,
        interpretMoonPhase,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
