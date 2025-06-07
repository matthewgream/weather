// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

const config = {
    equinoxLookaheadDays: 14,
    solsticeLookaheadDays: 14,
    crossquarterLookaheadDays: 7,
};

const msPerDay = 1000 * 60 * 60 * 24;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkCrepuscularRays(results, situation, data) {
    const { daylight, hourDecimal } = situation;
    const { cloudCover } = data;

    const nearSunrise = daylight.sunriseDecimal && Math.abs(hourDecimal - daylight.sunriseDecimal) < 1,
        nearSunset = daylight.sunsetDecimal && Math.abs(hourDecimal - daylight.sunsetDecimal) < 1;
    if ((nearSunrise || nearSunset) && cloudCover !== undefined && cloudCover > 30 && cloudCover < 70)
        results.phenomena.push('crepuscular rays likely (sunbeams through clouds)' + (cloudCover > 40 && cloudCover < 60 ? ' (anticrepuscular rays possible opposite sun: converging rays)' : ''));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAtmosphericOptics(results, situation, data) {
    const { daylight, location, solar } = situation;
    const { temp, humidity, cloudCover, windSpeed } = data;

    // 22-degree halo conditions
    if (cloudCover !== undefined && cloudCover > 20 && cloudCover < 80 && temp !== undefined && temp < 0)
        if (solar.position.altitude > 0 && solar.position.altitude < 60)
            results.phenomena.push('22° halo possible around sun (ice crystals in high clouds)' + (solar.position.altitude < 30 ? ' (sundogs possible: bright spots beside sun)' : ''));

    // Light pillars
    if (temp !== undefined && temp < -10 && humidity !== undefined && humidity > 80 && windSpeed !== undefined && windSpeed < 2)
        if (!daylight.isDaytime && location.lightPollution !== 'low') results.phenomena.push('light pillars possible from ground lights (ice crystals near surface)');

    // Circumzenithal arc
    if (cloudCover !== undefined && cloudCover > 10 && cloudCover < 50 && temp !== undefined && temp < -5)
        if (solar.position.altitude > 5 && solar.position.altitude < 32) results.phenomena.push('circumzenithal arc possible (upside-down rainbow near zenith)');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function assessSeeingConditions(results, situation, data, data_previous) {
    const { hour } = situation;
    const { temp, windSpeed, pressure } = data;

    if (temp !== undefined && data_previous?.length > 1 && data_previous[1].temp !== undefined) {
        const tempChange = Math.abs(temp - data_previous[1].temp),
            jetStreamEffect = windSpeed !== undefined && windSpeed > 15 ? 2 : 0,
            thermalEffect = hour >= 12 && hour <= 16 ? 1 : 0;
        // Seeing
        const seeingIndex = tempChange + jetStreamEffect + thermalEffect + windSpeed / 5;
        if (seeingIndex < 2) results.phenomena.push('seeing conditions excellent (steady air for telescopic viewing)');
        else if (seeingIndex < 4) results.phenomena.push('seeing conditions good for astronomy');
        else if (seeingIndex > 6) results.phenomena.push('seeing conditions poor (turbulent air, stars will twinkle heavily)');
        // Scintillation index
        if (windSpeed !== undefined && windSpeed > 10 && pressure !== undefined && Math.abs(pressure - 1013) > 10) results.phenomena.push('strong stellar scintillation expected (colorful twinkling)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkGreenFlash(results, situation, data) {
    const { daylight, location, hourDecimal } = situation;
    const { windSpeed, pressure } = data;

    const nearSunrise = daylight.sunriseDecimal && Math.abs(hourDecimal - daylight.sunriseDecimal) < 0.25,
        nearSunset = daylight.sunsetDecimal && Math.abs(hourDecimal - daylight.sunsetDecimal) < 0.25;
    if ((nearSunrise || nearSunset) && location.horizonClear && pressure !== undefined && windSpeed !== undefined)
        if (Math.abs(1013 - pressure) / 10 + windSpeed / 5 < 3) {
            // Ideal conditions: stable air, low humidity variation
            results.phenomena.push(`green flash possible at sun${nearSunrise ? 'rise' : 'set'} (watch upper edge)`);
            // // Venus/Jupiter green flash
            // const venusAlt = getVenusAltitude(date, location); // This would need implementation
            // if (venusAlt > 0 && venusAlt < 5)
            //     results.phenomena.push('green flash possible from Venus (use binoculars)');
        }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretTwilightPhenomena(results, situation, data) {
    const { daylight, hourDecimal, location } = situation;
    const { cloudCover } = data;

    const morningTwilight = daylight.civilDawnDecimal && hourDecimal > daylight.civilDawnDecimal && hourDecimal < daylight.sunriseDecimal,
        eveningTwilight = daylight.sunsetDecimal && hourDecimal > daylight.sunsetDecimal && hourDecimal < daylight.civilDuskDecimal;
    if ((morningTwilight || eveningTwilight) && cloudCover !== undefined && cloudCover < 40) {
        const direction = morningTwilight ? 'western' : 'eastern';
        results.phenomena.push(`Belt of Venus visible in ${direction} sky (pink band above Earth's shadow)`);
        results.phenomena.push(`Earth's shadow visible as dark blue band along ${direction} horizon`);
        // Alpenglow
        if (location.elevation > 1000 || location.nearMountains) results.phenomena.push('alpenglow possible on mountain peaks');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function enhanceZodiacalLight(results, situation, data) {
    const { month, hour, location, lunar } = situation;
    const { cloudCover } = data;

    if (cloudCover !== undefined && cloudCover < 20 && location.lightPollution === 'low') {
        if (lunar.phase < 0.25 || lunar.phase > 0.75) {
            // Spring evening (best in March-April)
            if (month >= 2 && month <= 4 && hour >= 20 && hour <= 22)
                results.phenomena.push(
                    'zodiacal light visible in west (faint pyramid of light along ecliptic)' + ((location.lightPollution === 'low' && hour >= 23) || hour <= 1 ? ' (gegenschein possible near midnight: faint glow opposite sun)' : '')
                );
            // Autumn morning (best in September-October)
            else if (month >= 8 && month <= 10 && hour >= 4 && hour <= 6) results.phenomena.push('zodiacal light visible in east before dawn');
            // // Zodiacal band (only in pristine conditions)
            // if (location.skyBrightness && location.skyBrightness > 21.5)
            //     results.phenomena.push('zodiacal band may be visible (faint band connecting zodiacal light to gegenschein)');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const geomagneticActivity = {
    // January through December (0-11)
    0: 1.5, // January
    1: 2, // February
    2: 2.5, // March - Spring equinox
    3: 2.8, // April
    4: 1.8, // May
    5: 1.5, // June
    6: 1.2, // July
    7: 1.5, // August
    8: 2.8, // September - Autumn equinox
    9: 3, // October
    10: 2.5, // November
    11: 2, // December
};

function predictAurora(results, situation, data) {
    const { location, month, hour, daylight, lunar } = situation;
    const { cloudCover, snowDepth, temp, humidity } = data;

    if (location.latitude <= 55 || (cloudCover !== undefined && cloudCover >= 50)) return;
    if (daylight.isDaytime || (hour >= 4 && hour <= 20) || (month >= 4 && month <= 7)) return;

    // Base prediction
    if (location.latitude > 55) {
        if (location.latitude > 65) results.phenomena.push('aurora possible if Kp 2+ (very common at this latitude)');
        else if (location.latitude > 60) results.phenomena.push('aurora possible if Kp 3+ (common at this latitude)');
        else results.phenomena.push('aurora possible if Kp 4+ (check northern horizon)');
    }

    // Activity level
    const activity = geomagneticActivity[month] || 2;
    if (activity >= 2.5) results.phenomena.push(`aurora conditions good (typical Kp ${activity.toFixed(1)})`);

    // Equinox enhancement
    if ([2, 3, 8, 9].includes(month)) results.phenomena.push('aurora equinoctial enhancement period');

    // Lunar conditions
    if (lunar.brightness < 30) results.phenomena.push('aurora photography excellent with dark skies');
    else if (lunar.phase <= 0.25 || lunar.phase >= 0.75) results.phenomena.push('aurora faint is good in dark skies');

    // Condition circumstances
    if (results.phenomena.some((p) => p.includes('aurora'))) {
        if (snowDepth !== undefined && snowDepth > 100) results.phenomena.push('aurora brightness enhanced by snow reflection');
        if (temp !== undefined && temp < -20 && humidity !== undefined && humidity < 50) results.phenomena.push('aurora may show enhanced lower border definition');
        if (temp !== undefined && temp < -30 && humidity !== undefined && humidity < 40 && location.elevation > 200) results.phenomena.push('aurora sounds are possible (crackling/hissing)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function detectAirglow(results, situation, data) {
    const { location, month, hour } = situation;
    const { cloudCover } = data;

    if (location.lightPollution === 'low' && cloudCover !== undefined && cloudCover < 10)
        if ((geomagneticActivity[month] || 2) > 2.5 && (hour >= 23 || hour <= 3)) results.phenomena.push('airglow possible (faint green/red bands across sky)' + (location.latitude > 45 ? ' (bands may show wave structure)' : ''));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkWhiteNights(results, situation) {
    const { location, date, year } = situation;

    if (location.latitude > 48) {
        // White nights occur when sun doesn't go below -6° (civil twilight)
        const summerSolstice = new Date(year, 5, 21),
            daysFromSolstice = Math.floor((90 - location.latitude) * 3.5);
        if (daysFromSolstice > 0) {
            const startDate = new Date(summerSolstice.getTime() - daysFromSolstice * msPerDay),
                endDate = new Date(summerSolstice.getTime() + daysFromSolstice * msPerDay);
            if (date >= startDate && date <= endDate) results.phenomena.push(Math.abs(date - summerSolstice) <= 7 * msPerDay ? 'white nights peak (brightest nights of year)' : 'white nights period (no true darkness)');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkTides(results, situation) {
    const { location, lunar } = situation;

    if (location.elevation < 50 && location.distanceToOcean !== undefined && location.distanceToOcean < 50) {
        if ((lunar.phase >= 0.48 && lunar.phase <= 0.52) || lunar.phase >= 0.98 || lunar.phase <= 0.02) results.phenomena.push('spring tides (at coast)' + (lunar.distance.isSupermoon ? ' (king tides possible due to supermoon)' : ''));
        else if ((lunar.phase >= 0.23 && lunar.phase <= 0.27) || (lunar.phase >= 0.73 && lunar.phase <= 0.77)) results.phenomena.push('neap tides (at coast)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretEquinox(results, situation, data) {
    const { date, location } = situation;
    const { windSpeed } = data;

    const equinoxInfo = helpers.isNearEquinox(date, location.hemisphere, config.equinoxLookaheadDays);
    if (!equinoxInfo.near) return;

    results.phenomena.push(helpers.formatProximity(equinoxInfo.type, equinoxInfo.days));

    // Daylight change rate
    results.phenomena.push(`daylight rapidly ${equinoxInfo.type.includes('spring') ? 'increasing' : 'decreasing'}` + (location.latitude > 50 ? ` (${Math.round(Math.abs(Math.sin((location.latitude * Math.PI) / 180)) * 4)} min/day)` : ''));

    // Equinox storms
    if (Math.abs(equinoxInfo.days) <= 3 && windSpeed !== undefined && windSpeed > 10) results.phenomena.push('equinoctial gales');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolstice(results, situation, data) {
    const { date, hour, location, daylight, lunar } = situation;
    const { cloudCover, temp } = data;

    const solsticeInfo = helpers.isNearSolstice(date, location.hemisphere, config.solsticeLookaheadDays);
    if (!solsticeInfo.near) return;

    results.phenomena.push(helpers.formatProximity(solsticeInfo.type, solsticeInfo.days));

    if (solsticeInfo.type === 'longest day') {
        // Summer solstice phenomena
        if (daylight.daylightHours > 16) results.phenomena.push(`daylight hours extended (${daylight.daylightHours.toFixed(1)} hours)`);

        // Latitude variations
        if (location.latitude > 59.5) {
            if (location.latitude > 66.5 && daylight.daylightHours >= 24) results.phenomena.push('true midnight sun (sun never sets)' + (cloudCover !== undefined && cloudCover < 50 ? ' (visible sun)' : ''));
            else if (location.latitude > 63) results.phenomena.push('near-midnight sun' + (daylight.civilDuskDecimal > 23 || daylight.civilDawnDecimal < 1 ? ' (no true darkness, civil twilight all night)' : ''));
            else if (location.latitude > 60) results.phenomena.push('white nights period (twilight throughout the night)');
        }

        // Full moon during summer solstice
        if (lunar.phase >= 0.48 && lunar.phase <= 0.52) results.phenomena.push('solstice full moon (rare astronomical event)' + (cloudCover !== undefined && cloudCover < 40 ? ' (strawberry moon visible)' : ''));

        // Cultural phenomena
        if (location.latitude > 55) if (Math.abs(solsticeInfo.days) <= 3) results.phenomena.push('midsummer celebration period');
    } else if (solsticeInfo.type === 'shortest day') {
        // Winter solstice phenomena
        if (daylight.daylightHours < 8) results.phenomena.push(`daylight hours minimal (${daylight.daylightHours.toFixed(1)} hours)`);

        // Latitude variations
        if (location.latitude > 59.5) {
            if (location.latitude > 66.5 && daylight.daylightHours < 0.1) results.phenomena.push('polar night (sun never rises)');
            else if (location.latitude > 63) results.phenomena.push('near-polar twilight' + (daylight.daylightHours < 3 ? ' (sun barely above horizon)' : ''));
            else if (location.latitude > 60) results.phenomena.push('very short days' + (hour >= 14 && !daylight.isDaytime ? ' (afternoon darkness)' : ''));
            else results.phenomena.push('extended darkness period');
        }

        // Full moon during winter solstice
        if (lunar.phase >= 0.48 && lunar.phase <= 0.52) results.phenomena.push('winter solstice full moon' + (cloudCover !== undefined && cloudCover < 40 ? ' (cold moon illuminating snow)' : ''));

        // Temperature-related solstice phenomena
        if (temp !== undefined && temp < -10 && Math.abs(solsticeInfo.days) <= 7) results.phenomena.push('deep winter cold near solstice');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretCrossQuarter(results, situation) {
    const { date, hour, location, daylight } = situation;

    const crossQuarterInfo = helpers.isNearCrossQuarter(date, location.hemisphere, config.crossquarterLookaheadDays);
    if (!crossQuarterInfo.near) return;

    const crossQuarterText = helpers.formatProximity(crossQuarterInfo.type, crossQuarterInfo.days);

    // Add cultural context for cross-quarter days
    let context;
    if (crossQuarterInfo.type.includes('Imbolc')) context = 'traditional start of spring';
    else if (crossQuarterInfo.type.includes('Beltane')) context = 'traditional start of summer' + (location.latitude > 58 && hour >= 21 && daylight.isDaytime ? ': Beltane white nights' : '');
    else if (crossQuarterInfo.type.includes('Lughnasadh')) context = 'traditional harvest festival';
    else if (crossQuarterInfo.type.includes('Samhain')) context = 'traditional start of winter' + (hour >= 16 && !daylight.isDaytime ? ': Samhain early darkness' : '');

    results.phenomena.push(`${crossQuarterText}${context ? ' (' + context + ')' : ''}`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarConditions(results, situation, data) {
    const { month, minutes, hour, location, solar } = situation;
    const { solarUvi } = data;

    // Solar noon
    if (Math.abs(hour + minutes / 60 - solar.position.noon) < 0.25)
        results.phenomena.push(
            `solar noon at ${Math.floor(solar.position.noon)}:${Math.round((solar.position.noon % 1) * 60)
                .toString()
                .padStart(2, '0')} (altitude ${Math.round(solar.position.altitude)}°)`
        );

    // Solar position
    if (solar.position.altitude > 0) {
        results.phenomena.push(`sun ${Math.round(solar.position.altitude)}° above horizon (bearing ${Math.round(solar.position.azimuth)}°, ${solar.position.direction})`);

        // Special conditions
        if (solar.position.altitude > 50) results.phenomena.push('high sun angle');
        else if (solar.position.altitude < 10) results.phenomena.push('golden hour lighting' + (solar.position.altitude < 6 ? ' (blue hour approaching)' : ''));

        // Shadow length indicator
        if (solar.position.altitude > 0.1 && solar.position.altitude < 45) results.phenomena.push(`shadows ${Math.round((1 / Math.tan((solar.position.altitude * Math.PI) / 180)) * 10) / 10}x object height`);
    }

    // UV index warning for summer at this latitude
    if (solar.position.altitude > 40 && solarUvi !== undefined && solarUvi > 5) results.phenomena.push(`UV index ${solarUvi} - sun protection advised`);

    // Winter sun at this latitude
    if (location.latitude > 59 && month === 11 && solar.position.altitude < 10 && solar.position.altitude > 0) results.phenomena.push('low winter sun - long shadows all day');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarConditions(results, situation, data, _data_previous, store) {
    const { date, month, day, hour, location, lunar } = situation;
    const { cloudCover, snowDepth, humidity, temp } = data;

    if (!store.astronomy) store.astronomy = {};
    if (store.astronomy?.currentMonth !== month) {
        store.astronomy.firstFullMoonDay = undefined;
        store.astronomy.firstFullMoonMonth = undefined;
        store.astronomy.currentMonth = month;
        store.astronomy.lunarPhaseHistory = [];
    }

    // Lunar Phase
    const thirtyDaysAgo = Date.now() - 30 * msPerDay;
    store.astronomy.lunarPhaseHistory = [...store.astronomy.lunarPhaseHistory.filter((entry) => entry.date.getTime() > thirtyDaysAgo), { date, phase: lunar.phase }];
    if (lunar.phase >= 0.48 && lunar.phase <= 0.52) {
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

        // Visibility
        if (cloudCover !== undefined) {
            if (cloudCover < 30) results.phenomena.push('clear skies for moon viewing' + (temp !== undefined && temp < -5 && humidity !== undefined && humidity < 50 ? ' (crisp moonlight conditions)' : ''));
            else if (cloudCover < 70) results.phenomena.push('partial moon visibility through clouds');
            else results.phenomena.push('moon obscured by clouds');
            if (cloudCover < 40 && snowDepth !== undefined && snowDepth > 50) results.phenomena.push('bright moonlit snow landscape' + (temp !== undefined && temp < -10 ? ' (sparkling snow crystals in moonlight)' : ''));
        }

        // Name
        if (month === 8 || month === 9) {
            const equinoxInfo = helpers.isNearEquinox(date, location.hemisphere, 30);
            if (equinoxInfo.near && equinoxInfo.type === 'autumn equinox' && Math.abs(equinoxInfo.days) < 15)
                results.phenomena.push('harvest moon - closest full moon to autumn equinox' + (hour >= 17 && hour <= 20 ? ' (moon rising near sunset for several nights)' : ''));
            else results.phenomena.push(lunar.name);
        } else results.phenomena.push(lunar.name);

        // Zodiac
        if (lunar.zodiac.position === 'late') results.phenomena.push(`moon in late ${lunar.zodiac.sign}, entering ${lunar.zodiac.next} soon`);
        else results.phenomena.push(`moon in ${lunar.zodiac.sign} ${lunar.zodiac.symbol}` + (['Cancer', 'Pisces', 'Scorpio'].includes(lunar.zodiac.sign) ? ' (emotional full moon in water sign)' : ''));
    } else if (lunar.phase >= 0.98 || lunar.phase <= 0.02) {
        // *** New moon ***
        results.phenomena.push('new moon tonight');

        // Visibility
        if (cloudCover !== undefined) {
            if (cloudCover < 30) {
                if (location.lightPollution === 'low') results.phenomena.push('stargazing conditions excellent' + (month >= 6 && month <= 8 && hour >= 22 ? ' (Milky Way visible)' : ''));
                else if (location.lightPollution === 'medium') results.phenomena.push('stargazing conditions good for bright stars');
            }
        }

        // Zodiac
        results.phenomena.push(`new moon in ${lunar.zodiac.sign} ${lunar.zodiac.symbol} (${lunar.zodiac.meaning})`);
        if (cloudCover !== undefined && cloudCover < 20 && location.lightPollution === 'low') {
            if (month >= 2 && month <= 4 && hour >= 19 && hour <= 21) results.phenomena.push('zodiacal light may be visible in western sky after sunset');
            else if (month >= 8 && month <= 10 && hour >= 4 && hour <= 6) results.phenomena.push('zodiacal light may be visible in eastern sky before dawn');
        }
    } else if ((lunar.phase >= 0.23 && lunar.phase <= 0.27) || (lunar.phase >= 0.73 && lunar.phase <= 0.77)) {
        // *** Quarter moon ***
        const quarterType = lunar.phase < 0.5 ? 'first' : 'last';
        results.phenomena.push(`${quarterType} quarter moon tonight`);

        // Visibility
        if (quarterType === 'first' && hour >= 18 && hour <= 23) results.phenomena.push('moon visible in evening sky');
        else if (quarterType === 'last' && hour >= 0 && hour <= 6) results.phenomena.push('moon visible in morning sky');

        // Zodiac
        if (lunar.zodiac.position === 'late') results.phenomena.push(`moon in late ${lunar.zodiac.sign}, entering ${lunar.zodiac.next} soon`);
        else results.phenomena.push(`moon in ${lunar.zodiac.sign} ${lunar.zodiac.symbol}`);
    } else {
        // *** Transitional moon ***
        const yesterday = store.astronomy.lunarPhaseHistory?.[store.astronomy.lunarPhaseHistory.length - 2];
        if (yesterday) {
            if (yesterday.phase < 0.02 && lunar.phase > 0.02) results.phenomena.push('moon is waxing (to full)');
            else if (yesterday.phase < 0.5 && lunar.phase > 0.5) results.phenomena.push('moon is waning (past full)');
        } else {
            if (lunar.phase > 0.02 && lunar.phase < 0.23) results.phenomena.push('waxing crescent moon');
            else if (lunar.phase > 0.27 && lunar.phase < 0.48) results.phenomena.push('waxing gibbous moon');
            else if (lunar.phase > 0.52 && lunar.phase < 0.73) results.phenomena.push('waning gibbous moon');
            else if (lunar.phase > 0.77 && lunar.phase < 0.98) results.phenomena.push('waning crescent moon');
        }

        // Zodiac
        if (lunar.zodiac.position === 'late') results.phenomena.push(`moon in late ${lunar.zodiac.sign}, entering ${lunar.zodiac.next} soon`);
        else results.phenomena.push(`moon in ${lunar.zodiac.sign} ${lunar.zodiac.symbol}`);
    }

    // Lunar Position
    if (lunar.position.altitude > 0) {
        results.phenomena.push(`moon ${Math.round(lunar.position.altitude)}° above horizon (bearing ${Math.round(lunar.position.azimuth)}°, ${lunar.position.direction})`);
        if (lunar.position.altitude > 60) results.phenomena.push('moon near zenith - excellent viewing');
        else if (lunar.position.altitude < 10) results.phenomena.push('moon low on horizon');
    } else if (hour >= 6 && hour <= 18) results.phenomena.push('moon below horizon');

    // Lunar Distance
    if (lunar.distance.isSupermoon) {
        if (lunar.phase >= 0.48 && lunar.phase <= 0.52) results.phenomena.push(`supermoon - appears larger and brighter: ${Math.round(((384400 - lunar.distance.distance) / 384400) * 100)}% closer than average`);
        else if (lunar.phase >= 0.98 || lunar.phase <= 0.02) results.phenomena.push('super new moon - extra high tides expected');
        else results.phenomena.push('supermoon - moon at closest approach');
    } else if (lunar.distance.isMicromoon) {
        if (lunar.phase >= 0.48 && lunar.phase <= 0.52) results.phenomena.push(`micromoon - appears smaller and dimmer: ${Math.round(((lunar.distance.distance - 384400) / 384400) * 100)}% farther than average`);
    }

    // Lunar Visibility
    results.phenomena.push(`moon ${Math.round(((1 - Math.cos(lunar.phase * 2 * Math.PI)) / 2) * 100)}% illuminated`);

    // Lunar Times
    if (lunar.times.rise || lunar.times.set) {
        const times = [];
        if (lunar.times.rise) times.push(`rises ${lunar.times.rise.toTimeString().slice(0, 5)}`);
        if (lunar.times.set) times.push(`sets ${lunar.times.set.toTimeString().slice(0, 5)}`);
        if (times.length > 0) results.phenomena.push(`moon ${times.join(' & ')}`);
    }
    if (lunar.phase >= 0.48 && lunar.phase <= 0.52) {
        if (lunar.position.altitude > 0) results.phenomena.push('full moon visible now');
        else if (lunar.times.rise && lunar.times.rise.getHours() < 23) results.phenomena.push(`full moon rises at ${lunar.times.rise.toTimeString().slice(0, 5)}`);
    }

    // Noctilucent Clouds (Important for latitude 59.66°N)
    if (month >= 5 && month <= 7 && location.latitude > 50) {
        if ((hour >= 22 || hour <= 2) && cloudCover !== undefined && cloudCover < 50) {
            if (Math.abs(helpers.daysIntoYear(date) - 172) < 30)
                // Near summer solstice
                results.phenomena.push('prime noctilucent cloud season - check northern horizon');
            else results.phenomena.push('noctilucent clouds possible in north');
        }
    }
    if ((lunar.phase > 0.05 && lunar.phase < 0.15) || (lunar.phase > 0.85 && lunar.phase < 0.95)) if (cloudCover !== undefined && cloudCover < 30) results.phenomena.push('earthshine visible on dark portion of moon');

    // Lunar next
    const daysToNextPhase = Math.round((0.25 - (lunar.phase % 0.25)) * 29.53);
    if (daysToNextPhase <= 2) results.phenomena.push(`${['new moon', 'first quarter', 'full moon', 'last quarter'][Math.ceil(lunar.phase * 4) % 4]} in ${daysToNextPhase} days`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isRadiantFavorable(radiantName, latitude) {
    const radiantDeclinations = {
        'Perseus': 58,
        'Ursa Minor': 75,
        'Draco': 65,
        'Boötes': 30,
        'Lyra': 39,
        'Gemini': 33,
        'Leo': 20,
        'Orion': 8,
        'Taurus': 22,
        'Aquarius': -5,
        'Capricornus': -10,
        'Virgo': 0,
        'Vela': -47,
        'Hydra': -8,
    };
    // Radiant is favorable if it can reach >30° altitude
    return 90 - latitude + (radiantDeclinations[radiantName] || 0) > 30;
}

const meteorShowers = [
    // Major showers
    { month: 0, start: 1, end: 5, peak: 3, name: 'Quadrantids', rate: 120, moon: 'any', radiant: 'Boötes' },
    { month: 3, start: 16, end: 25, peak: 22, name: 'Lyrids', rate: 18, moon: 'favor_dark', radiant: 'Lyra' },
    { month: 4, start: 19, end: 28, peak: 6, peakMonth: 5, name: 'Eta Aquarids', rate: 50, moon: 'any', radiant: 'Aquarius' },
    { month: 6, start: 12, endMonth: 7, end: 23, peak: 28, peakMonth: 7, name: 'Delta Aquarids', rate: 25, moon: 'any', radiant: 'Aquarius' },
    { month: 7, start: 17, end: 24, peak: 12, name: 'Perseids', rate: 100, moon: 'favor_dark', radiant: 'Perseus' },
    { month: 9, start: 2, end: 11, peak: 8, name: 'Draconids', rate: 'variable', moon: 'any', radiant: 'Draco' },
    { month: 9, start: 2, endMonth: 10, end: 7, peak: 21, name: 'Orionids', rate: 20, moon: 'favor_dark', radiant: 'Orion' },
    { month: 10, start: 7, end: 10, peak: 9, name: 'Southern Taurids', rate: 10, moon: 'any', radiant: 'Taurus' },
    { month: 10, start: 6, end: 30, peak: 12, name: 'Northern Taurids', rate: 15, moon: 'any', radiant: 'Taurus' },
    { month: 10, start: 14, end: 21, peak: 17, name: 'Leonids', rate: 15, moon: 'favor_dark', radiant: 'Leo' },
    { month: 11, start: 4, end: 17, peak: 14, name: 'Geminids', rate: 120, moon: 'favor_dark', radiant: 'Gemini' },
    { month: 11, start: 17, end: 26, peak: 22, name: 'Ursids', rate: 10, moon: 'any', radiant: 'Ursa Minor' },
    // Minor showers particularly visible at 59.66°N
    { month: 0, start: 15, end: 25, peak: 20, name: 'Gamma Velids', rate: 5, moon: 'any', radiant: 'Vela' },
    { month: 3, start: 14, end: 30, peak: 24, name: 'Mu Virginids', rate: 7, moon: 'any', radiant: 'Virgo' },
    { month: 4, start: 8, end: 12, peak: 10, name: 'Eta Lyrids', rate: 3, moon: 'any', radiant: 'Lyra' },
    { month: 5, start: 5, endMonth: 6, end: 2, peak: 27, peakMonth: 6, name: 'June Bootids', rate: 'variable', moon: 'any', radiant: 'Boötes' },
    { month: 6, start: 25, endMonth: 7, end: 10, peak: 30, peakMonth: 7, name: 'Alpha Capricornids', rate: 5, moon: 'bright_ok', radiant: 'Capricornus' },
    { month: 8, start: 25, endMonth: 9, end: 20, peak: 9, peakMonth: 9, name: 'September Epsilon Perseids', rate: 5, moon: 'any', radiant: 'Perseus' },
    { month: 11, start: 6, end: 30, peak: 12, name: 'Sigma Hydrids', rate: 5, moon: 'any', radiant: 'Hydra' },
];

function interpretMeteors(results, situation, data) {
    const { date, year, month, day, hour, daylight, location, lunar } = situation;
    const { cloudCover } = data;

    const currentShowers = meteorShowers.filter((shower) => {
        const monthStart = shower.month,
            monthEnd = shower.endMonth === undefined ? shower.month : shower.endMonth;
        if (monthStart === monthEnd) return month === monthStart && day >= shower.start && day <= shower.end;
        else if (monthEnd === (monthStart + 1) % 12) return (month === monthStart && day >= shower.start) || (month === monthEnd && day <= shower.end);
        return false;
    });

    currentShowers.forEach((shower) => {
        let text = `meteor '${shower.name}'`;
        const showerPeakMonth = shower.peakMonth === undefined ? shower.month : shower.peakMonth,
            isPeakDay = month === showerPeakMonth && day === shower.peak;
        let daysFromPeak;
        if (shower.peakMonth !== undefined) {
            const peakDate = new Date(year, showerPeakMonth, shower.peak);
            if (showerPeakMonth < shower.month && month >= shower.month) peakDate.setFullYear(year + 1);
            else if (showerPeakMonth > shower.month && month < shower.month) peakDate.setFullYear(year - 1);
            daysFromPeak = Math.round((peakDate - date) / msPerDay);
        } else if (month === shower.month) daysFromPeak = shower.peak - day;
        if (isPeakDay) {
            text += ` peak tonight`;
            if (typeof shower.rate === 'number') text += ` zhr ~${shower.rate}/hr`;
            if (cloudCover !== undefined && cloudCover < 30) {
                if (lunar.phase <= 0.25 || lunar.phase >= 0.75) text += ' (excellent dark sky conditions)';
                else if (shower.moon === 'bright_ok') text += ' (bright meteors visible despite moon)';
                else if (lunar.phase >= 0.4 && lunar.phase <= 0.6) text += ' (moon will interfere)';
            }
        } else if (daysFromPeak !== undefined && Math.abs(daysFromPeak) <= 2) text += helpers.formatProximity('peak', daysFromPeak);
        else return;
        if (isRadiantFavorable(shower.radiant, location.latitude)) text += ' [favorable at this latitude]';
        results.phenomena.push(text);
    });

    // Add special meteor conditions for 59.66°N
    if (location.latitude > 59)
        if (currentShowers.length > 0 && (hour >= 22 || hour <= 4)) {
            if (month >= 8 || month <= 2) results.phenomena.push('meteor viewing ideal with long dark nights');
            else if (month >= 5 && month <= 7 && daylight.astronomicalDuskDecimal && daylight.astronomicalDawnDecimal)
                results.phenomena.push(`meteor viewing window: ${Math.floor(daylight.astronomicalDuskDecimal)}:00-${Math.floor(daylight.astronomicalDawnDecimal)}:00 only`);
        }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const marsOppositions = [new Date('2025-01-16'), new Date('2027-02-19'), new Date('2029-03-25'), new Date('2031-05-04'), new Date('2033-06-27')];

function interpretPlanets(results, situation, data) {
    const { date, month, hour } = situation;
    const { cloudCover } = data;

    const nextOpposition = marsOppositions.find((d) => d > date);
    if (nextOpposition) {
        const daysToOpposition = Math.floor((nextOpposition - date) / msPerDay);
        if (Math.abs(daysToOpposition) < 30) results.phenomena.push(helpers.formatProximity('Mars opposition', daysToOpposition) + ' (bright and visible all night)');
    }

    if (cloudCover !== undefined && cloudCover < 50) {
        /* XXX needs correction
        if (hour >= 4 && hour <= 7 && month >= 0) results.phenomena.push('Venus may be visible as morning star in east');
        else if (hour >= 18 && hour <= 21) results.phenomena.push('Venus may be visible as evening star in west');
        */
        if (hour >= 22 || hour <= 2) {
            if (month >= 0 && month <= 3) results.phenomena.push('Jupiter well-placed for viewing');
            if (month >= 7 && month <= 10) results.phenomena.push('Saturn well-placed for viewing');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const periodicComets = [
    { name: "Halley's Comet", period: 75.3, lastPerihelion: new Date('1986-02-09'), magnitude: 4 },
    { name: 'Comet Encke', period: 3.3, lastPerihelion: new Date('2023-10-22'), magnitude: 6 },
    { name: 'Comet 67P/Churyumov-Gerasimenko', period: 6.45, lastPerihelion: new Date('2021-11-02'), magnitude: 9 },
];

function interpretComets(results, situation) {
    const { date } = situation;

    periodicComets.forEach((comet) => {
        const yearsSinceLast = (date - comet.lastPerihelion) / (365.25 * msPerDay);
        const orbitsCompleted = Math.floor(yearsSinceLast / comet.period);
        const nextPerihelion = new Date(comet.lastPerihelion.getTime() + (orbitsCompleted + 1) * comet.period * 365.25 * msPerDay);
        const yearsUntilReturn = (nextPerihelion - date) / (365.25 * msPerDay);
        if (yearsUntilReturn < 1 && yearsUntilReturn > 0) {
            const daysUntil = Math.round(yearsUntilReturn * 365.25);
            if (daysUntil < 30) results.phenomena.push(helpers.formatProximity(`comet '${comet.name}' perihelion`, daysUntil));
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretStars(results, situation, data) {
    const { month, hour } = situation;
    const { cloudCover, humidity } = data;

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
    if (cloudCover !== undefined && cloudCover < 30 && (hour >= 22 || hour <= 2)) {
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
        if (humidity !== undefined && humidity < 50) recommendations.push('excellent transparency for faint objects');
        if (recommendations.length > 0) results.phenomena.push(`tonight's targets: ${recommendations.join(', ')}`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretOrbitingBodies(results, situation, data) {
    const { hour, lunar } = situation;
    const { cloudCover } = data;

    // At 59.66°N, ISS passes are frequent
    // This would need real orbital data, but we can indicate possibility
    if (lunar.phase >= 0.48 && lunar.phase <= 0.52 && lunar.position.altitude > 30)
        if ((hour >= 20 || hour <= 5) && cloudCover !== undefined && cloudCover < 50) results.phenomena.push('check for ISS lunar transit - moon crossing opportunity');
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
            const daysSince = Math.floor((currentDate - exc.events[event]) / msPerDay);
            if (daysSince === threshold) results.phenomena.push(`${daysSince} days since last ${message}`);
        }
    });
}

// XXX make simpler
function generateYearEndSummary(results, yearly) {
    const summary = [];
    summary.push(`${yearly.year} summary:`);
    summary.push(`- ${yearly.fullMoons} full moons (${yearly.supermoons} super, ${yearly.blueMoons} blue)`);
    summary.push(`- ${yearly.meteorShowersObserved}/${yearly.meteorShowers} meteor showers observed`);
    summary.push(`- ${yearly.clearNights} clear nights for observing`);
    summary.push(`- ${yearly.perfectViewingNights} perfect viewing nights`);
    if (yearly.auroraAlerts > 0) summary.push(`- ${yearly.auroraSightings}/${yearly.auroraAlerts} aurora alerts resulted in sightings`);
    if (yearly.eclipses > 0) summary.push(`- ${yearly.eclipses} eclipses visible`);
    summary.forEach((line) => results.phenomena.push(line));
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

function processAstronomicalEvents(results, situation, data, _data_previous, store) {
    const { date, year, month, day, hour } = situation;
    const { cloudCover, humidity, windSpeed, temp } = data;

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

    const isPerfectViewing = cloudCover < 10 && humidity < 70 && windSpeed < 3 && temp !== undefined && Math.abs(temp - 10) < 15 && (hour >= 22 || hour <= 2);
    if (isPerfectViewing) {
        exc.yearly.perfectViewingNights++;
        const daysSinceLastPerfect = exc.events.lastPerfectViewing ? Math.floor((date - exc.events.lastPerfectViewing) / msPerDay) : 999;
        if (daysSinceLastPerfect > 30) {
            results.alerts.push('exceptional viewing conditions tonight - rare clarity');
            exc.events.lastPerfectViewing = date;
        }
    }

    trackRareEventIntervals(results, exc, date);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (options) {
    Object.entries(options).forEach(([key, value]) => (config[key] = value));
    return {
        interpretEquinox,
        interpretSolstice,
        interpretCrossQuarter,
        interpretSolarConditions,
        interpretLunarConditions,
        enhanceZodiacalLight,
        interpretAtmosphericOptics,
        assessSeeingConditions,
        interpretTwilightPhenomena,
        detectAirglow,
        checkGreenFlash,
        checkWhiteNights,
        checkCrepuscularRays,
        predictAurora,
        checkTides,
        interpretPlanets,
        interpretStars,
        interpretMeteors,
        interpretComets,
        interpretOrbitingBodies,
        processAstronomicalEvents,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
