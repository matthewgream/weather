// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

const EQUINOX_LOOKAHEAD_DAYS = 14;
const SOLSTICE_LOOKAHEAD_DAYS = 14;
const CROSSQUARTER_LOOKAHEAD_DAYS = 7;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function predictAuroraActivity(results, situation, data) {
    const { location, month, hour, daylight, date } = situation;
    const { cloudCover } = data;

    // At 59.66°N, auroras are visible with Kp 3-4
    // const kpThreshold = 3.5;
    // Best months: September-October, February-March
    const geomagneticActivity = {
        0: 1.5,
        1: 2,
        2: 2.5,
        3: 2.8, // Spring months
        4: 1.8,
        5: 1.5,
        6: 1.2,
        7: 1.5, // Summer (white nights)
        8: 2.8,
        9: 3,
        10: 2.5,
        11: 2, // Fall/Winter
    };

    const lunarPhase = helpers.getLunarPhase(date);
    const baseActivity = geomagneticActivity[month] || 2;
    // Dark hours check
    const isDarkEnough = !daylight.isDaytime && (hour >= 21 || hour <= 3) && (month < 4 || month > 7);
    if (isDarkEnough && cloudCover < 50) {
        if (baseActivity >= 2.5) results.phenomena.push(`good aurora conditions (typical Kp ${baseActivity.toFixed(1)})`);
        // Equinox enhancement
        const equinoxBonus = month === 2 || month === 3 || month === 8 || month === 9 ? 0.5 : 0;
        if (equinoxBonus > 0) results.phenomena.push('equinoctial aurora enhancement period');
        // Moon phase impact
        const lunarPhase = helpers.getLunarPhase(date);
        if (lunarPhase <= 0.25 || lunarPhase >= 0.75) results.phenomena.push('dark skies optimal for faint aurora');
    }

    if (location.latitude > 55 && cloudCover < 50) {
        if (((month >= 8 && month <= 10) || (month >= 2 && month <= 4)) && (hour >= 21 || hour <= 3)) {
            // At 59.66°N, aurora is visible with Kp 3-4
            results.phenomena.push('aurora possible with Kp 3+ (common at this latitude)');
            if (location.latitude > 59) {
                // More specific for your exact location
                const moonBrightness = Math.round(((1 - Math.cos(lunarPhase * 2 * Math.PI)) / 2) * 100);
                if (moonBrightness < 30) results.phenomena.push('dark skies excellent for aurora photography');
                // Best viewing directions
                results.phenomena.push('check northern horizon for aurora (magnetic north ~5° west)');
            }
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkWhiteNights(results, situation) {
    const { year, month, day } = situation;

    // At 59.66°N, white nights occur roughly May 20 - July 23
    const startDate = new Date(year, 4, 20), // May 20
        endDate = new Date(year, 6, 23), // July 23
        currentDate = new Date(year, month, day);

    if (currentDate >= startDate && currentDate <= endDate) {
        results.phenomena.push('white nights period - no true darkness');
        // Peak around summer solstice
        const daysFromSolstice = Math.abs(day - 21);
        if (month === 5 && daysFromSolstice <= 7) results.phenomena.push('peak white nights - brightest nights of year');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkISSPasses(results, situation, data) {
    const { hour } = situation;
    const { cloudCover } = data;

    // At 59.66°N, ISS passes are frequent
    // This would need real orbital data, but we can indicate possibility
    if ((hour >= 20 || hour <= 5) && cloudCover < 50) {
        results.phenomena.push('check for ISS passes - good latitude for frequent sightings');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretEquinox(results, situation, data) {
    const { windSpeed } = data;
    const { date, location } = situation;

    const equinoxInfo = helpers.isNearEquinox(date, location.hemisphere, EQUINOX_LOOKAHEAD_DAYS);
    if (!equinoxInfo.near) return;

    let equinoxText;
    if (equinoxInfo.exact) equinoxText = 'today (equal day and night)';
    else if (equinoxInfo.days > 0) equinoxText = `in ${Math.ceil(equinoxInfo.days)} day${Math.ceil(equinoxInfo.days) > 1 ? 's' : ''}`;
    else equinoxText = `${Math.abs(Math.floor(equinoxInfo.days))} day${Math.abs(Math.floor(equinoxInfo.days)) > 1 ? 's' : ''} ago`;
    results.phenomena.push(`${equinoxInfo.type} ${equinoxText}`);

    // Daylight change rate
    results.phenomena.push(`rapidly ${equinoxInfo.type.includes('spring') ? 'increasing' : 'decreasing'} daylight`);

    // Calculate approximate daylight change rate
    if (location.latitude > 50) results.phenomena.push(`daylight changing ~${Math.round(Math.abs(Math.sin((location.latitude * Math.PI) / 180)) * 4)} min/day`);

    // Equinox storms
    if (Math.abs(equinoxInfo.days) <= 3 && windSpeed > 10) results.phenomena.push('equinoctial gales');

    // // Aurora activity
    // if (location.latitude > 55 && Math.abs(equinoxInfo.days) <= 7) results.phenomena.push('enhanced aurora activity period');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolstice(results, situation, data) {
    const { cloudCover, snowDepth, temp } = data;
    const { date, hour, location, daylight } = situation;

    const solsticeInfo = helpers.isNearSolstice(date, location.hemisphere, SOLSTICE_LOOKAHEAD_DAYS);
    if (!solsticeInfo.near) return;

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
            if (location.latitude > 66.5 && daylight.daylightHours < 0.1) results.phenomena.push('polar night (sun never rises)');
            else if (location.latitude > 63) {
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

    if (location.latitude > 59.5) {
        if (solsticeInfo.type === 'longest day') {
            // More precise for 59.66°N
            if (daylight.daylightHours > 18.5) {
                results.phenomena.push(`${Math.round(daylight.daylightHours * 10) / 10} hours of daylight`);
                results.phenomena.push('white nights - no astronomical darkness');
            }
        } else if (solsticeInfo.type === 'shortest day') {
            if (daylight.daylightHours < 5.5) {
                results.phenomena.push(`only ${Math.round(daylight.daylightHours * 10) / 10} hours of daylight`);
                results.phenomena.push('extended darkness ideal for astronomy');
            }
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCrossQuarter(results, situation) {
    const { date, hour, location, daylight } = situation;

    const crossQuarterInfo = helpers.isNearCrossQuarter(date, location.hemisphere, CROSSQUARTER_LOOKAHEAD_DAYS);
    if (!crossQuarterInfo.near) return;

    let crossQuarterText;
    if (crossQuarterInfo.exact) crossQuarterText = 'today';
    else if (crossQuarterInfo.days > 0) crossQuarterText = `in ${Math.ceil(crossQuarterInfo.days)} day${Math.ceil(crossQuarterInfo.days) > 1 ? 's' : ''}`;
    else crossQuarterText = `${Math.abs(Math.floor(crossQuarterInfo.days))} day${Math.abs(Math.floor(crossQuarterInfo.days)) > 1 ? 's' : ''} ago`;

    // Add cultural concontext for cross-quarter days
    let context;
    if (crossQuarterInfo.name.includes('Imbolc')) context = 'traditional start of spring';
    else if (crossQuarterInfo.name.includes('Beltane'))
        context = 'traditional start of summer' + (location.latitude > 58 && hour >= 21 && daylight.isDaytime ? ': Beltane white nights' : '');
    else if (crossQuarterInfo.name.includes('Lughnasadh')) context = 'traditional harvest festival';
    else if (crossQuarterInfo.name.includes('Samhain'))
        context = 'traditional start of winter' + (hour >= 16 && !daylight.isDaytime ? ': Samhain early darkness' : '');

    results.phenomena.push(`cross-quater ${crossQuarterInfo.name} ${crossQuarterText}${context ? ' (' + context + ')' : ''}`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarConditions(results, situation, data, _data_previous, _store, _options) {
    const { date, minutes, hour, location } = situation;

    const solarPos = helpers.getSolarPosition(date, location.latitude, location.longitude);

    // Solar noon
    const solarNoonTime = 12 - solarPos.equationOfTime / 60 - location.longitude / 15;
    const currentDecimalTime = hour + minutes / 60;

    if (Math.abs(currentDecimalTime - solarNoonTime) < 0.25) {
        results.phenomena.push(
            `solar noon at ${Math.floor(solarNoonTime)}:${Math.round((solarNoonTime % 1) * 60)
                .toString()
                .padStart(2, '0')}`
        );
        results.phenomena.push(`sun at maximum altitude: ${Math.round(solarPos.altitude)}°`);
    }

    // Solar position
    if (solarPos.altitude > 0) {
        results.phenomena.push(`sun ${Math.round(solarPos.altitude)}° above horizon`);

        const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
        const dirIndex = Math.round(solarPos.azimuth / 45) % 8;
        results.phenomena.push(`sun bearing ${Math.round(solarPos.azimuth)}° (${directions[dirIndex]})`);

        // Special conditions
        if (solarPos.altitude > 50) {
            results.phenomena.push('high sun angle');
        } else if (solarPos.altitude < 10) {
            results.phenomena.push('golden hour lighting');
            if (solarPos.altitude < 6) {
                results.phenomena.push('blue hour approaching');
            }
        }

        // Shadow length indicator
        if (solarPos.altitude > 0 && solarPos.altitude < 45) {
            const shadowMultiplier = 1 / Math.tan((solarPos.altitude * Math.PI) / 180);
            results.phenomena.push(`shadows ${Math.round(shadowMultiplier * 10) / 10}x object height`);
        }
    }

    // Equation of time - useful for sundial corrections
    if (Math.abs(solarPos.equationOfTime) > 10) {
        results.phenomena.push(`sundial correction: ${solarPos.equationOfTime > 0 ? '+' : ''}${Math.round(solarPos.equationOfTime)} minutes`);
    }

    // UV index warning for summer at this latitude
    if (solarPos.altitude > 40 && data.solarUvi !== undefined && data.solarUvi > 5) {
        results.phenomena.push(`UV index ${data.solarUvi} - sun protection advised`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarConditions(results, situation, data, _data_previous, store) {
    const { cloudCover, snowDepth, humidity, temp } = data;
    const { date, year, month, day, hour, location } = situation;

    if (!store.astronomy) store.astronomy = {};
    if (store.astronomy?.currentMonth !== month) {
        store.astronomy.firstFullMoonDay = undefined;
        store.astronomy.firstFullMoonMonth = undefined;
        store.astronomy.currentMonth = month;
        store.astronomy.moonPhaseHistory = [];
    }

    // Lunar Phase
    const lunarPhase = helpers.getLunarPhase(date);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    store.astronomy.moonPhaseHistory = [
        ...store.astronomy.moonPhaseHistory.filter((entry) => entry.date.getTime() > thirtyDaysAgo),
        { date, phase: lunarPhase },
    ];
    const zodiac = helpers.getLunarZodiac(date);
    if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
        // *** Full moon ***
        results.phenomena.push('full moon tonight');

        // History
        if (!store.astronomy.firstFullMoonDay) {
            store.astronomy.firstFullMoonDay = day;
            store.astronomy.firstFullMoonMonth = month;
        } else if (month === store.astronomy.firstFullMoonMonth && day !== store.astronomy.firstFullMoonDay) {
            results.phenomena.push('blue moon (second full moon this month)');
            results.alerts.push('rare blue moon occurrence');
        }

        // Visibility and conditions
        if (cloudCover !== undefined) {
            if (cloudCover < 30) {
                results.phenomena.push('clear skies for moon viewing');
                if (temp !== undefined && temp < -5 && humidity < 50) results.phenomena.push('crisp moonlight conditions');
            } else if (cloudCover < 70) results.phenomena.push('partial moon visibility through clouds');
            else results.phenomena.push('moon obscured by clouds');
        }
        if (snowDepth > 50 && cloudCover !== undefined && cloudCover < 40) {
            results.phenomena.push('bright moonlit snow landscape');
            if (temp < -10) results.phenomena.push('sparkling snow crystals in moonlight');
        }

        // Name
        if (month === 8 || month === 9) {
            const equinox = helpers.isNearEquinox(date, location.hemisphere, 30);
            if (equinox.near && equinox.type === 'autumn equinox' && Math.abs(equinox.days) < 15) {
                results.phenomena.push('harvest moon - closest full moon to autumn equinox');
                if (hour >= 17 && hour <= 20) results.phenomena.push('moon rising near sunset for several nights');
            } else results.phenomena.push(helpers.getLunarName(month));
        } else results.phenomena.push(helpers.getLunarName(month));

        // Zodiac
        if (zodiac.position === 'late') results.phenomena.push(`moon in late ${zodiac.sign}, entering ${zodiac.next} soon`);
        else
            results.phenomena.push(
                `moon in ${zodiac.sign} ${zodiac.symbol}${['Cancer', 'Pisces', 'Scorpio'].includes(zodiac.sign) ? ' (emotional full moon in water sign)' : ''}`
            );
    } else if (lunarPhase >= 0.98 || lunarPhase <= 0.02) {
        // *** New moon ***
        results.phenomena.push('new moon tonight');

        // Visibility
        if (cloudCover !== undefined && cloudCover < 30) {
            if (location.lightPollution === 'low') {
                results.phenomena.push('excellent stargazing conditions');
                if (month >= 6 && month <= 8 && hour >= 22) results.phenomena.push('Milky Way visible');
            } else if (location.lightPollution === 'medium') results.phenomena.push('good conditions for bright stars');
        }

        // Zodiac
        results.phenomena.push(`new moon in ${zodiac.sign} ${zodiac.symbol} (${zodiac.meaning})`);
        if (cloudCover < 20 && location.lightPollution === 'low') {
            if (month >= 2 && month <= 4 && hour >= 19 && hour <= 21) results.phenomena.push('zodiacal light may be visible in western sky after sunset');
            else if (month >= 8 && month <= 10 && hour >= 4 && hour <= 6) results.phenomena.push('zodiacal light may be visible in eastern sky before dawn');
        }
    } else if ((lunarPhase >= 0.23 && lunarPhase <= 0.27) || (lunarPhase >= 0.73 && lunarPhase <= 0.77)) {
        // *** Quarter moon ***
        const quarterType = lunarPhase < 0.5 ? 'first' : 'last';
        results.phenomena.push(`${quarterType} quarter moon tonight`);

        // Visibility
        if (quarterType === 'first' && hour >= 18 && hour <= 23) results.phenomena.push('moon visible in evening sky');
        else if (quarterType === 'last' && hour >= 0 && hour <= 6) results.phenomena.push('moon visible in morning sky');

        // Zodiac
        if (zodiac.position === 'late') results.phenomena.push(`moon in late ${zodiac.sign}, entering ${zodiac.next} soon`);
        else results.phenomena.push(`moon in ${zodiac.sign} ${zodiac.symbol}`);
    } else {
        // *** Transitional moon ***
        if (lunarPhase > 0.02 && lunarPhase < 0.23) results.phenomena.push('waxing crescent moon');
        else if (lunarPhase > 0.27 && lunarPhase < 0.48) results.phenomena.push('waxing gibbous moon');
        else if (lunarPhase > 0.52 && lunarPhase < 0.73) results.phenomena.push('waning gibbous moon');
        else if (lunarPhase > 0.77 && lunarPhase < 0.98) results.phenomena.push('waning crescent moon');
        const yesterday = store.astronomy.moonPhaseHistory?.[store.astronomy.moonPhaseHistory.length - 2];
        if (yesterday) {
            if (yesterday.phase < 0.02 && lunarPhase > 0.02) results.phenomena.push('moon has entered waxing phase');
            else if (yesterday.phase < 0.5 && lunarPhase > 0.5) results.phenomena.push('moon has passed full phase, now waning');
        }

        // Zodiac
        if (zodiac.position === 'late') results.phenomena.push(`moon in late ${zodiac.sign}, entering ${zodiac.next} soon`);
        else results.phenomena.push(`moon in ${zodiac.sign} ${zodiac.symbol}`);
    }

    // Moon rise/set
    const lunarTimes = helpers.getLunarTimes(date, location.latitude, location.longitude);
    if (lunarTimes.rise || lunarTimes.set) {
        const times = [];
        if (lunarTimes.rise) times.push(`rises ${lunarTimes.rise.toTimeString().slice(0, 5)}`);
        if (lunarTimes.set) times.push(`sets ${lunarTimes.set.toTimeString().slice(0, 5)}`);
        if (times.length > 0) results.phenomena.push(`moon ${times.join(', ')}`);
    }
    if (lunarPhase >= 0.48 && lunarPhase <= 0.52) {
        if (lunarPos.altitude > 0) results.phenomena.push('full moon visible now');
        else if (lunarTimes.rise && lunarTimes.rise.getHours() < 23) results.phenomena.push(`full moon rises at ${lunarTimes.rise.toTimeString().slice(0, 5)}`);
    }

    // Lunar Position
    const lunarPos = helpers.getLunarPosition(date, location.latitude, location.longitude);
    if (lunarPos.altitude > 0) {
        results.phenomena.push(`moon ${Math.round(lunarPos.altitude)}° above horizon`);
        if (lunarPos.altitude > 60) results.phenomena.push('moon near zenith - excellent viewing');
        else if (lunarPos.altitude < 10) results.phenomena.push('moon low on horizon');
        const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
        results.phenomena.push(`moon in ${directions[Math.round(lunarPos.azimuth / 45) % 8]} sky`);
    } else if (hour >= 6 && hour <= 18) results.phenomena.push('moon below horizon');

    // Lunar Distance
    const lunarDistance = helpers.getLunarDistance(date);
    if (lunarDistance.isSupermoon) {
        if (lunarPhase >= 0.48 && lunarPhase <= 0.52)
            results.phenomena.push(
                `supermoon - appears larger and brighter: ${Math.round(((384400 - lunarDistance.distance) / 384400) * 100)}% closer than average`
            );
        else if (lunarPhase >= 0.98 || lunarPhase <= 0.02) results.phenomena.push('super new moon - extra high tides expected');
        else results.phenomena.push('supermoon - moon at closest approach');
    } else if (lunarDistance.isMicromoon) {
        if (lunarPhase >= 0.48 && lunarPhase <= 0.52)
            results.phenomena.push(
                `micromoon - appears smaller and dimmer: ${Math.round(((lunarDistance.distance - 384400) / 384400) * 100)}% farther than average`
            );
    }

    // Lunar Visibility
    results.phenomena.push(`moon ${Math.round(((1 - Math.cos(lunarPhase * 2 * Math.PI)) / 2) * 100)}% illuminated`);
    // Noctilucent Clouds (Important for latitude 59.66°N)
    if (month >= 5 && month <= 7 && location.latitude > 50) if (hour >= 21 || hour <= 4) results.phenomena.push('noctilucent clouds possible in northern sky');
    if ((lunarPhase > 0.05 && lunarPhase < 0.15) || (lunarPhase > 0.85 && lunarPhase < 0.95))
        if (cloudCover < 30) results.phenomena.push('earthshine visible on dark portion of moon');
    if (month >= 5 && month <= 7 && location.latitude > 50) {
        if ((hour >= 22 || hour <= 2) && cloudCover < 50) {
            const dayOfYear = Math.floor((date - new Date(year, 0, 0)) / 86400000);
            const optimalDays = Math.abs(dayOfYear - 172) < 30; // Near summer solstice
            if (optimalDays) {
                results.phenomena.push('prime noctilucent cloud season - check northern horizon');
            } else {
                results.phenomena.push('noctilucent clouds possible in north');
            }
        }
    }

    // Lunar next
    const daysToNextPhase = Math.round((0.25 - (lunarPhase % 0.25)) * 29.53);
    if (daysToNextPhase <= 2)
        results.phenomena.push(`${['new moon', 'first quarter', 'full moon', 'last quarter'][Math.ceil(lunarPhase * 4) % 4]} in ${daysToNextPhase} days`);

    // Earth - Tides
    if (location.elevation < 50 && location.forestCoverage !== 'high') {
        if ((lunarPhase >= 0.48 && lunarPhase <= 0.52) || lunarPhase >= 0.98 || lunarPhase <= 0.02)
            results.phenomena.push(`spring tides (at coast)${lunarDistance.isSupermoon ? ': king tides possible (supermoon)' : ''}`);
        else if ((lunarPhase >= 0.23 && lunarPhase <= 0.27) || (lunarPhase >= 0.73 && lunarPhase <= 0.77)) results.phenomena.push('neap tides (at coast)');
    }

    // // Earth - Aurora
    // if (location.latitude > 55 && cloudCover < 50)
    //     if (((month >= 8 && month <= 10) || (month >= 2 && month <= 4)) && (hour >= 21 || hour <= 3)) {
    //        if (lunarPhase <= 0.3 || lunarPhase >= 0.7) results.phenomena.push('dark skies favorable for aurora viewing');
    //        if (location.latitude > 59) results.phenomena.push('aurora possible with moderate solar activity (Kp 4+)');
    //    }

    // Celestial - Planets
    if (month === 11 || month === 0) {
        const daysToOpposition = Math.floor((new Date('2025-01-16') - date) / (24 * 60 * 60 * 1000)); // XXX fix this
        if (Math.abs(daysToOpposition) < 7) results.phenomena.push('Mars at opposition (bright and visible all night as bright red "star")');
    }
    if (cloudCover < 50) {
        /* XXX needs correction
        if (hour >= 4 && hour <= 7 && month >= 0) results.phenomena.push('Venus may be visible as morning star in east');
        else if (hour >= 18 && hour <= 21) results.phenomena.push('Venus may be visible as evening star in west');
        */
        if (hour >= 22 || hour <= 2) {
            if (month >= 0 && month <= 3) results.phenomena.push('Jupiter well-placed for viewing');
            if (month >= 7 && month <= 10) results.phenomena.push('Saturn well-placed for viewing');
            if (month === 11 || month === 0) results.phenomena.push('Mars approaching opposition (bright and visible all night)');
        }
    }

    // Celestial - Comets
    const periodicComets = [
        { name: "Halley's Comet", period: 75.3, lastPerihelion: new Date('1986-02-09'), magnitude: 4 },
        { name: 'Comet Encke', period: 3.3, lastPerihelion: new Date('2023-10-22'), magnitude: 6 },
        { name: 'Comet 67P/Churyumov-Gerasimenko', period: 6.45, lastPerihelion: new Date('2021-11-02'), magnitude: 9 },
    ];
    periodicComets.forEach((comet) => {
        const yearsSinceLast = (date - comet.lastPerihelion) / (365.25 * 24 * 60 * 60 * 1000),
            nextReturn = Math.ceil(yearsSinceLast / comet.period) * (comet.period - yearsSinceLast);
        if (nextReturn < 1) {
            // Within a year
            const daysUntil = Math.round(nextReturn * 365.25);
            if (daysUntil < 30) results.phenomena.push(`${comet.name} approaching perihelion in ${daysUntil} days`);
        }
    });

    /* XXX calculateAngularSeparation is needed
    // Celestial - Stars
    const brightStars = [
        { name: 'Aldebaran', ra: 68.98, dec: 16.51 },
        { name: 'Regulus', ra: 152.09, dec: 11.97 },
        { name: 'Spica', ra: 201.30, dec: -11.16 },
        { name: 'Antares', ra: 247.35, dec: -26.43 }
    ];
    brightStars.filter (star => calculateAngularSeparation(lunarPos.ra, lunarPos.dec, star.ra, star.dec) < 0.5)
	.forEach(star => results.alerts.push(`moon occults ${star.name} tonight - rare event`));
    */
    if (cloudCover < 30 && (hour >= 22 || hour <= 2)) {
        const recommendations = [];
        // Season-specific recommendations
        if (month >= 11 || month <= 1) {
            recommendations.push('Orion Nebula at its best');
            recommendations.push('Winter Hexagon asterism visible');
        } else if (month >= 5 && month <= 7) {
            recommendations.push('Milky Way core visible to south');
            recommendations.push('Scorpius and Sagittarius rich star fields');
        }
        // Condition-specific recommendations
        if (humidity < 50) recommendations.push('excellent transparency for faint objects');
        if (recommendations.length > 0) results.phenomena.push(`tonight's targets: ${recommendations.join(', ')}`);
    }

    // Celestial - Orbiting bodies
    if (lunarPhase >= 0.48 && lunarPhase <= 0.52 && lunarPos.altitude > 30) results.phenomena.push('check for ISS lunar transit - moon crossing opportunity');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretMeteors(results, situation, data) {
    const { cloudCover } = data;
    const { date, month, day, hour } = situation;

    const lunarPhase = helpers.getLunarPhase(date);

    const meteorShowers = [
        // Major showers
        { month: 0, start: 1, end: 5, peak: 3, name: 'Quadrantids', rate: 120, moon: 'any', radiant: 'Boötes' },
        { month: 3, start: 16, end: 25, peak: 22, name: 'Lyrids', rate: 18, moon: 'favor_dark', radiant: 'Lyra' },
        { month: 4, start: 19, end: 28, peak: 6, peakMonth: 5, name: 'Eta Aquarids', rate: 50, moon: 'any', radiant: 'Aquarius' },
        { month: 6, start: 12, end: 23, peak: 28, peakMonth: 7, name: 'Delta Aquarids', rate: 25, moon: 'any', radiant: 'Aquarius' },
        { month: 7, start: 17, end: 24, peak: 12, name: 'Perseids', rate: 100, moon: 'favor_dark', radiant: 'Perseus' },
        { month: 9, start: 2, end: 11, peak: 8, name: 'Draconids', rate: 'variable', moon: 'any', radiant: 'Draco' },
        { month: 9, start: 2, end: 7, peak: 21, name: 'Orionids', rate: 20, moon: 'favor_dark', radiant: 'Orion' },
        { month: 10, start: 7, end: 10, peak: 9, name: 'Southern Taurids', rate: 10, moon: 'any', radiant: 'Taurus' },
        { month: 10, start: 6, end: 30, peak: 12, name: 'Northern Taurids', rate: 15, moon: 'any', radiant: 'Taurus' },
        { month: 10, start: 14, end: 21, peak: 17, name: 'Leonids', rate: 15, moon: 'favor_dark', radiant: 'Leo' },
        { month: 11, start: 4, end: 17, peak: 14, name: 'Geminids', rate: 120, moon: 'favor_dark', radiant: 'Gemini' },
        { month: 11, start: 17, end: 26, peak: 22, name: 'Ursids', rate: 10, moon: 'any', radiant: 'Ursa Minor' },

        // Minor showers particularly visible at 59.66°N
        { month: 0, start: 15, end: 25, peak: 20, name: 'Gamma Velids', rate: 5, moon: 'any', radiant: 'Vela' },
        { month: 3, start: 14, end: 30, peak: 24, name: 'Mu Virginids', rate: 7, moon: 'any', radiant: 'Virgo' },
        { month: 4, start: 8, end: 12, peak: 10, name: 'Eta Lyrids', rate: 3, moon: 'any', radiant: 'Lyra' },
        { month: 5, start: 5, end: 2, peak: 27, peakMonth: 6, name: 'June Bootids', rate: 'variable', moon: 'any', radiant: 'Boötes' },
        { month: 6, start: 25, end: 10, peak: 30, peakMonth: 7, name: 'Alpha Capricornids', rate: 5, moon: 'bright_ok', radiant: 'Capricornus' },
        { month: 8, start: 25, end: 20, peak: 9, peakMonth: 9, name: 'September Epsilon Perseids', rate: 5, moon: 'any', radiant: 'Perseus' },
        { month: 11, start: 6, end: 30, peak: 12, name: 'Sigma Hydrids', rate: 5, moon: 'any', radiant: 'Hydra' },
    ];

    // Process meteor showers
    const currentShowers = meteorShowers.filter((shower) => {
        if (shower.peakMonth && month === shower.peakMonth) {
            return day <= shower.peak;
        }
        return month === shower.month && day >= shower.start && day <= shower.end;
    });

    currentShowers.forEach((shower) => {
        let text = shower.name;
        const peakDay = shower.peakMonth && month === shower.peakMonth ? shower.peak : month === shower.month ? shower.peak : undefined;

        if (peakDay && day === peakDay) {
            text += ` PEAK TONIGHT`;
            if (typeof shower.rate === 'number') {
                text += ` (ZHR ~${shower.rate}/hr)`;
            }

            // Add viewing conditions
            if (cloudCover < 30) {
                if (lunarPhase <= 0.25 || lunarPhase >= 0.75) {
                    text += ' - excellent dark sky conditions';
                } else if (shower.moon === 'bright_ok') {
                    text += ' - bright meteors visible despite moon';
                } else if (lunarPhase >= 0.4 && lunarPhase <= 0.6) {
                    text += ' - moon will interfere';
                }
            }
        } else if (peakDay && Math.abs(day - peakDay) <= 1) {
            text += ' (near peak)';
        }

        // Special notes for high latitude
        if (shower.radiant === 'Perseus' || shower.radiant === 'Ursa Minor' || shower.radiant === 'Draco' || shower.radiant === 'Boötes') {
            text += ' - favorable radiant position at this latitude';
        }

        results.phenomena.push(text);
    });

    // Add special meteor conditions for 59.66°N
    if (currentShowers.length > 0 && (hour >= 22 || hour <= 4)) {
        if (month >= 8 || month <= 2) {
            results.phenomena.push('long dark nights ideal for meteor watching');
        } else if (month >= 5 && month <= 7) {
            results.phenomena.push('short nights limit meteor viewing window');
        }
    }
    if (month >= 10 || month <= 2) {
        results.phenomena.push('excellent meteor viewing - up to 18 hours of darkness');
    } else if (month >= 5 && month <= 7) {
        results.phenomena.push('limited meteor viewing - short nights');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function initializeExceptionalTracking(store) {
    if (!store.astronomy.exceptional) {
        store.astronomy.exceptional = {
            // Rare events with timestamps
            events: {
                lastSupermoon: undefined,
                lastBlueMoon: undefined,
                lastMeteorStorm: undefined,
                lastPerfectViewing: undefined, // Clear, new moon, stable air
                lastLunarEclipse: undefined,
                lastSolarEclipse: undefined,
                lastAuroraVisible: undefined,
                lastNoctilucent: undefined,
                lastZodiacalLight: undefined,
                lastPlanetaryConjunction: undefined,
                lastLunarOccultation: undefined,
            },

            // Streaks and records
            streaks: {
                consecutiveClearFullMoons: 0,
                consecutiveMeteorNights: 0,
                currentClearNights: 0,
                longestClearStreak: 0,
            },

            // Records
            records: {
                highestMoonAltitude: 0,
                brightestMeteorShower: 0,
                earliestNoctilucent: undefined,
                latestNoctilucent: undefined,
                mostPlanetsVisible: 0,
                bestSeeingConditions: undefined,
            },

            // Annual statistics
            yearly: {
                year: new Date().getFullYear(),
                fullMoons: 0,
                supermoons: 0,
                blueMoons: 0,
                meteorShowers: 0,
                meteorShowersObserved: 0, // Clear skies during shower
                clearNights: 0,
                auroraAlerts: 0,
                auroraSightings: 0,
                perfectViewingNights: 0,
                eclipses: 0,
            },

            // Personal viewing log
            viewingLog: {
                totalObservingHours: 0,
                lastObservingSession: undefined,
                bestViewingNight: undefined,
                objectsSeen: new Set(),
            },
        };
    }
}

function trackRareEventIntervals(results, exc, currentDate) {
    const intervals = [
        { event: 'lastSupermoon', threshold: 300, message: 'supermoon' },
        { event: 'lastBlueMoon', threshold: 800, message: 'blue moon' },
        { event: 'lastMeteorStorm', threshold: 10000, message: 'meteor storm' },
        { event: 'lastLunarEclipse', threshold: 180, message: 'lunar eclipse' },
        { event: 'lastAuroraVisible', threshold: 60, message: 'visible aurora' },
        { event: 'lastNoctilucent', threshold: 365, message: 'noctilucent clouds' },
    ];
    intervals.forEach(({ event, threshold, message }) => {
        if (exc.events[event]) {
            const daysSince = Math.floor((currentDate - exc.events[event]) / (24 * 60 * 60 * 1000));
            if (daysSince === threshold) results.phenomena.push(`${daysSince} days since last ${message}`);
        }
    });
}

// XXX make simpler
function generateYearEndSummary(results, yearly) {
    const summary = [];

    summary.push(`${yearly.year} Astronomical Summary:`);
    summary.push(`- ${yearly.fullMoons} full moons (${yearly.supermoons} super, ${yearly.blueMoons} blue)`);
    summary.push(`- ${yearly.meteorShowersObserved}/${yearly.meteorShowers} meteor showers observed`);
    summary.push(`- ${yearly.clearNights} clear nights for observing`);
    summary.push(`- ${yearly.perfectViewingNights} perfect viewing nights`);

    if (yearly.auroraAlerts > 0) summary.push(`- ${yearly.auroraSightings}/${yearly.auroraAlerts} aurora alerts resulted in sightings`);

    if (yearly.eclipses > 0) summary.push(`- ${yearly.eclipses} eclipses visible`);

    results.phenomena.push(summary.join('\n'));
}

function recordExceptionalEvent(store, eventType, date, details = {}) {
    const exc = store.astronomy.exceptional;
    if (!exc) return;
    exc.events[eventType] = date;
    switch (eventType) {
        case 'lastSupermoon':
            exc.yearly.supermoons++;
            break;
        case 'lastBlueMoon':
            exc.yearly.blueMoons++;
            break;
        case 'lastMeteorStorm':
            exc.yearly.meteorShowers++;
            break;
        case 'lastAuroraVisible':
            exc.yearly.auroraSightings++;
            break;
        case 'lastLunarEclipse':
        case 'lastSolarEclipse':
            exc.yearly.eclipses++;
            break;
    }
    if (details.record) Object.assign(exc.records, details.record);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function astronomicalEvents(results, situation, data, store) {
    const { cloudCover, humidity, windSpeed, temp } = data;
    const { date, year, month, day, hour } = situation;

    const exc = store.astronomy.exceptional;
    if (!exc) {
        initializeExceptionalTracking(store);
        return;
    }

    if (month === 0 && day === 1) {
        generateYearEndSummary(results, exc.yearly);
        exc.yearly = {
            year,
            fullMoons: 0,
            supermoons: 0,
            blueMoons: 0,
            meteorShowers: 0,
            meteorShowersObserved: 0,
            clearNights: 0,
            auroraAlerts: 0,
            auroraSightings: 0,
            perfectViewingNights: 0,
            eclipses: 0,
        };
    }

    if (cloudCover < 20 && (hour >= 22 || hour <= 2)) {
        exc.streaks.currentClearNights++;
        exc.yearly.clearNights++;
        if (exc.streaks.currentClearNights > exc.streaks.longestClearStreak) {
            exc.streaks.longestClearStreak = exc.streaks.currentClearNights;
            if (exc.streaks.longestClearStreak >= 7) results.phenomena.push(`record clear night streak: ${exc.streaks.longestClearStreak} nights`);
        }
    } else if (cloudCover > 50) exc.streaks.currentClearNights = 0;

    const isPerfectViewing = cloudCover < 10 && humidity < 70 && windSpeed < 3 && Math.abs(temp - 10) < 15 && (hour >= 22 || hour <= 2);
    if (isPerfectViewing) {
        exc.yearly.perfectViewingNights++;
        const daysSinceLastPerfect = exc.events.lastPerfectViewing ? Math.floor((date - exc.events.lastPerfectViewing) / (24 * 60 * 60 * 1000)) : 999;
        if (daysSinceLastPerfect > 30) {
            results.alerts.push('exceptional viewing conditions tonight - rare clarity');
            exc.events.lastPerfectViewing = date;
        }
    }

    trackRareEventIntervals(results, exc, date);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (_options) {
    return {
        interpretSolarConditions,
        interpretLunarConditions,
        interpretEquinox,
        interpretSolstice,
        interpretCrossQuarter,
        interpretMeteors,
        predictAuroraActivity,
        checkWhiteNights,
        checkISSPasses,
        astronomicalEvents,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
