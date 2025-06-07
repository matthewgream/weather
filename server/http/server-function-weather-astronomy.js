// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const helpers = require('./server-function-weather-helpers.js');

const config = {
    equinoxLookaheadDays: 14,
    solsticeLookaheadDays: 14,
    crossquarterLookaheadDays: 7,
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function isNearSunriseOrSet(daylight, hourDecimal, threshold) {
    const nearSunrise = daylight.sunriseDecimal && Math.abs(hourDecimal - daylight.sunriseDecimal) < threshold,
        nearSunset = daylight.sunsetDecimal && Math.abs(hourDecimal - daylight.sunsetDecimal) < threshold;
    if (nearSunrise || nearSunset) return nearSunrise ? 'sunrise' : 'sunset';
    return undefined;
}

function isTwilight(daylight, hourDecimal) {
    const morningTwilight = daylight.civilDawnDecimal && hourDecimal > daylight.civilDawnDecimal && hourDecimal < daylight.sunriseDecimal,
        eveningTwilight = daylight.sunsetDecimal && hourDecimal > daylight.sunsetDecimal && hourDecimal < daylight.civilDuskDecimal;
    if (morningTwilight || eveningTwilight) return morningTwilight ? 'western' : 'eastern';
    return undefined;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkMoonIllusion(results, situation) {
    const { lunar, hour } = situation;

    if (lunar.position.altitude > 0 && lunar.position.altitude < 10)
        if (lunar.phase >= 0.45 && lunar.phase <= 0.55) {
            results.phenomena.push('moon appears larger near horizon (moon illusion effect)');
            // Check if moon is rising or setting
            if (lunar.times.rise && Math.abs(hour - lunar.times.rise.getHours()) < 1) results.phenomena.push('moon rising: watch for atmospheric color effects');
            else if (lunar.times.set && Math.abs(hour - lunar.times.set.getHours()) < 1) results.phenomena.push('moon setting: moon may appear orange/red');
        }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkAtmosphericShadowBands(results, situation, data) {
    const { solar } = situation;
    const { windSpeed, temp, pressure } = data;

    // Shadow bands can occur during extreme atmospheric turbulence
    if (pressure !== undefined && windSpeed !== undefined && temp !== undefined && solar.position.altitude > 0 && solar.position.altitude < 20) {
        const turbulenceIndex = Math.abs(pressure - 1013) / 10 + windSpeed / 10;
        if (turbulenceIndex > 5 && Math.abs(temp - 20) > 15) results.phenomena.push('optics: shadow bands possible (rare atmospheric turbulence)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkCrepuscularRays(results, situation, data) {
    const { daylight, hourDecimal } = situation;
    const { cloudCover } = data;

    const sunRiseOrSet = isNearSunriseOrSet(daylight, hourDecimal, 1);
    if (sunRiseOrSet && cloudCover !== undefined && cloudCover > 30 && cloudCover < 70) results.phenomena.push('crepuscular rays: likely (sunbeams)' + (cloudCover > 40 && cloudCover < 60 ? ', anticrepuscular rays possible' : ''));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAtmosphericOptics(results, situation, data) {
    const { daylight, location, solar } = situation;
    const { temp, humidity, cloudCover, windSpeed } = data;

    // 22-degree halo conditions
    if (cloudCover !== undefined && cloudCover > 20 && cloudCover < 80 && temp !== undefined && temp < 0)
        if (solar.position.altitude > 0 && solar.position.altitude < 60) results.phenomena.push('optics: 22° halo possible (ice crystals)' + (solar.position.altitude < 30 ? ', sundogs likely' : ''));

    // Light pillars
    if (temp !== undefined && temp < -10 && humidity !== undefined && humidity > 80 && windSpeed !== undefined && windSpeed < 2)
        if (!daylight.isDaytime && location.lightPollution !== 'low') results.phenomena.push('optics: light pillars possible (ground lights in ice crystals)');

    // Circumzenithal arc
    if (cloudCover !== undefined && cloudCover > 10 && cloudCover < 50 && temp !== undefined && temp < -5)
        if (solar.position.altitude > 5 && solar.position.altitude < 32) results.phenomena.push('optics: circumzenithal arc possible (rainbow at zenith)');
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
        if (seeingIndex < 2) results.phenomena.push('seeing: excellent (steady air for telescopes)');
        else if (seeingIndex < 4) results.phenomena.push('seeing: good for astronomy');
        else if (seeingIndex > 6) results.phenomena.push('seeing: poor (heavy twinkling)');
        // Scintillation index
        if (windSpeed !== undefined && windSpeed > 10 && pressure !== undefined && Math.abs(pressure - 1013) > 10) results.phenomena.push('seeing: strong scintillation (colorful twinkling)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkGreenFlash(results, situation, data) {
    const { daylight, location, hourDecimal } = situation;
    const { windSpeed, pressure } = data;

    const sunRiseOrSet = isNearSunriseOrSet(daylight, hourDecimal, 0.25);
    if (sunRiseOrSet && location.horizonClear && pressure !== undefined && windSpeed !== undefined)
        if (Math.abs(1013 - pressure) / 10 + windSpeed / 5 < 3) {
            // Ideal conditions: stable air, low humidity variation
            results.phenomena.push(`green flash: possible at ${sunRiseOrSet} (watch upper edge)`);
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

    const twilight = isTwilight(daylight, hourDecimal);
    if (twilight && cloudCover !== undefined && cloudCover < 40) {
        results.phenomena.push(`twilight: Belt of Venus in ${twilight} sky (pink band)`);
        results.phenomena.push(`twilight: Earth's shadow visible (dark band on ${twilight} horizon)`);
        // Alpenglow
        if (location.elevation > 1000 || location.nearMountains) results.phenomena.push('twilight: alpenglow on mountain peaks');
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
                results.phenomena.push('zodiacal light: visible in west (faint pyramid)' + ((location.lightPollution === 'low' && hour >= 23) || hour <= 1 ? ', gegenschein possible' : ''));
            // Autumn morning (best in September-October)
            else if (month >= 8 && month <= 10 && hour >= 4 && hour <= 6) results.phenomena.push('zodiacal light: visible in east before dawn');
            // // Zodiacal band (only in pristine conditions)
            // if (location.skyBrightness && location.skyBrightness > 21.5)
            //     results.phenomena.push('zodiacal band may be visible (faint band connecting zodiacal light to gegenschein)');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function predictAurora(results, situation, data) {
    const { location, month, hour, daylight, lunar } = situation;
    const { cloudCover, snowDepth, temp, humidity } = data;

    if (location.latitude <= 55 || (cloudCover !== undefined && cloudCover >= 50)) return;
    if (daylight.isDaytime || (hour >= 4 && hour <= 20) || (month >= 4 && month <= 7)) return;

    // Base prediction
    if (location.latitude > 55) {
        if (location.latitude > 65) results.phenomena.push('aurora: possible if Kp 2+ (very common at this latitude)');
        else if (location.latitude > 60) results.phenomena.push('aurora: possible if Kp 3+ (common at this latitude)');
        else results.phenomena.push('aurora: possible if Kp 4+ (check northern horizon)');
    }

    // Activity level
    const activity = helpers.getGeomagneticActivity(month);
    if (activity >= 2.5) results.phenomena.push(`aurora: possible if Kp ${activity.toFixed(1)}+ (typical for season)`);

    // Equinox enhancement
    if ([2, 3, 8, 9].includes(month)) results.phenomena.push('aurora: equinoctial enhancement active');

    // Lunar conditions
    if (lunar.brightness < 30) results.phenomena.push('aurora: photography conditions excellent (dark skies)');
    else if (lunar.phase <= 0.25 || lunar.phase >= 0.75) results.phenomena.push('aurora: faint displays visible (dark skies)');

    // Condition circumstances
    if (results.phenomena.some((p) => p.includes('aurora'))) {
        if (snowDepth !== undefined && snowDepth > 100) results.phenomena.push('aurora: brightness enhanced (snow reflection)');
        if (temp !== undefined && temp < -20 && humidity !== undefined && humidity < 50) results.phenomena.push('aurora: lower border sharp (cold dry air)');
        if (temp !== undefined && temp < -30 && humidity !== undefined && humidity < 40 && location.elevation > 200) results.phenomena.push('aurora: sounds possible - rare! (crackling/hissing)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function detectAirglow(results, situation, data) {
    const { location, month, hour } = situation;
    const { cloudCover } = data;

    if (location.lightPollution === 'low' && cloudCover !== undefined && cloudCover < 10)
        if (helpers.getGeomagneticActivity(month) > 2.5 && (hour >= 23 || hour <= 3)) results.phenomena.push('airglow: visible (faint bands)' + (location.latitude > 45 ? ', wave structure possible' : ''));
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
            const startDate = new Date(summerSolstice.getTime() - daysFromSolstice * helpers.constants.MILLISECONDS_PER_DAY),
                endDate = new Date(summerSolstice.getTime() + daysFromSolstice * helpers.constants.MILLISECONDS_PER_DAY);
            if (date >= startDate && date <= endDate) results.phenomena.push(Math.abs(date - summerSolstice) <= 7 * helpers.constants.MILLISECONDS_PER_DAY ? 'white nights: peak brightness' : 'white nights: no true darkness');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkTides(results, situation) {
    const { location, lunar } = situation;

    if (location.elevation < 50 && location.distanceToOcean !== undefined && location.distanceToOcean < 50) {
        if ((lunar.phase >= 0.48 && lunar.phase <= 0.52) || lunar.phase >= 0.98 || lunar.phase <= 0.02) results.phenomena.push('tides: spring (high range)' + (lunar.distance.isSupermoon ? ', king tides possible' : ''));
        else if ((lunar.phase >= 0.23 && lunar.phase <= 0.27) || (lunar.phase >= 0.73 && lunar.phase <= 0.77)) results.phenomena.push('tides: neap (low range)');
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
    const changeRate = location.latitude > 50 ? ` (${Math.round(Math.abs(Math.sin((location.latitude * Math.PI) / 180)) * 4)} min/day)` : '';
    results.phenomena.push(`daylight: rapidly ${equinoxInfo.type.includes('spring') ? 'increasing' : 'decreasing'}${changeRate}`);

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
        if (location.latitude > 55 && Math.abs(solsticeInfo.days) <= 3) results.phenomena.push('culture: midsummer celebration period');
    } else if (solsticeInfo.type === 'shortest day') {
        // Winter solstice phenomena
        if (daylight.daylightHours < 8) results.phenomena.push(`daylight hours minimal (${daylight.daylightHours.toFixed(1)} hours)`);

        // Latitude variations
        if (location.latitude > 59.5) {
            if (location.latitude > 66.5 && daylight.daylightHours < 0.1) results.phenomena.push('polar night (sun never rises)');
            else if (location.latitude > 63) results.phenomena.push('near-polar twilight' + (daylight.daylightHours < 3 ? ' (sun barely above horizon)' : ''));
            else if (location.latitude > 60) results.phenomena.push('dark nights period (very short days' + (hour >= 14 && !daylight.isDaytime ? ', afternoon darkness' : '') + ')');
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

    results.phenomena.push(context ? `${crossQuarterText} (${context})` : crossQuarterText);
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarConditions(results, situation, data) {
    const { month, hourDecimal, location, solar } = situation;
    const { solarUvi } = data;

    // Solar noon
    if (Math.abs(hourDecimal - solar.position.noon) < 0.25)
        results.phenomena.push(`sun: noon at ${helpers.formatTime(Math.floor(solar.position.noon), Math.round((solar.position.noon % 1) * 60))} (altitude ${helpers.formatAltitude(solar.position.altitude)})`);

    // Solar position
    if (solar.position.altitude > 0) {
        results.phenomena.push(`sun: ${helpers.formatPosition(solar.position.altitude, solar.position.azimuth, solar.position.direction)}`);

        // Special conditions
        if (solar.position.altitude > 50) results.phenomena.push('sun: high angle overhead');
        else if (solar.isGoldenHour) results.phenomena.push('sun: golden hour' + (solar.position.altitude < 6 ? ' (blue hour approaching)' : ''));

        // Shadow length indicator
        if (solar.position.altitude > 0.1 && solar.position.altitude < 45 && solar.shadowMultiplier !== Infinity) results.phenomena.push(`sun: shadows ${Math.round(solar.shadowMultiplier * 10) / 10}x object height`);
    }

    // UV index warning for summer at this latitude
    if (solar.position.altitude > 40 && solarUvi !== undefined && solarUvi > 5) results.phenomena.push(`sun: UV index ${solarUvi} - protection advised`);

    // Winter sun at this latitude
    if (location.latitude > 59 && month === 11 && solar.position.altitude < 10 && solar.position.altitude > 0) results.phenomena.push('sun: low winter angle (long shadows)');
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
    const thirtyDaysAgo = Date.now() - 30 * helpers.constants.MILLISECONDS_PER_DAY;
    store.astronomy.lunarPhaseHistory = [...store.astronomy.lunarPhaseHistory.filter((entry) => entry.date.getTime() > thirtyDaysAgo), { date, phase: lunar.phase }];
    if (lunar.phase >= 0.48 && lunar.phase <= 0.52) {
        // *** Full moon ***
        results.phenomena.push('moon: full tonight');

        // History
        if (!store.astronomy.firstFullMoonDay) {
            store.astronomy.firstFullMoonDay = day;
            store.astronomy.firstFullMoonMonth = month;
        } else if (month === store.astronomy.firstFullMoonMonth && day !== store.astronomy.firstFullMoonDay) {
            results.phenomena.push('moon: blue moon (second full moon this month)');
            results.alerts.push('rare blue moon occurrence');
        }

        // Visibility
        if (cloudCover !== undefined) {
            if (cloudCover < 30) results.phenomena.push('moon: viewing conditions clear' + (temp !== undefined && temp < -5 && humidity !== undefined && humidity < 50 ? ' (crisp light)' : ''));
            else if (cloudCover < 70) results.phenomena.push('moon: partially visible through clouds');
            else results.phenomena.push('moon: obscured by clouds');
            if (cloudCover < 40 && snowDepth !== undefined && snowDepth > 50) results.phenomena.push('moon: illuminating snow landscape' + (temp !== undefined && temp < -10 ? ' (sparkling crystals)' : ''));
        }

        // Name
        if (month === 8 || month === 9) {
            const equinoxInfo = helpers.isNearEquinox(date, location.hemisphere, 15);
            if (equinoxInfo.near && equinoxInfo.type === 'autumn equinox') results.phenomena.push('harvest moon - closest full moon to autumn equinox' + (hour >= 17 && hour <= 20 ? ' (moon rising near sunset for several nights)' : ''));
            else results.phenomena.push(`moon: ${lunar.name}`);
        } else results.phenomena.push(`moon: ${lunar.name}`);

        // Zodiac
        if (lunar.zodiac.position === 'late') results.phenomena.push(`moon in late ${lunar.zodiac.sign}, entering ${lunar.zodiac.next} soon`);
        else results.phenomena.push(`moon: in ${lunar.zodiac.sign} ${lunar.zodiac.symbol}` + (['Cancer', 'Pisces', 'Scorpio'].includes(lunar.zodiac.sign) ? ' (emotional full moon in water sign)' : ''));
    } else if (lunar.phase >= 0.98 || lunar.phase <= 0.02) {
        // *** New moon ***
        results.phenomena.push('moon: new tonight');

        // Visibility
        if (cloudCover !== undefined) {
            if (cloudCover < 30) {
                if (location.lightPollution === 'low') results.phenomena.push('stars: viewing excellent' + (month >= 6 && month <= 8 && hour >= 22 ? ' (Milky Way core visible)' : ''));
                else if (location.lightPollution === 'medium') results.phenomena.push('stars: viewing good for bright stars');
            }
        }

        // Zodiac
        results.phenomena.push(`moon: in ${lunar.zodiac.sign} ${lunar.zodiac.symbol} (${lunar.zodiac.meaning})`);
    } else if ((lunar.phase >= 0.23 && lunar.phase <= 0.27) || (lunar.phase >= 0.73 && lunar.phase <= 0.77)) {
        // *** Quarter moon ***
        const quarterType = lunar.phase < 0.5 ? 'first' : 'last';
        results.phenomena.push(`${quarterType} quarter moon tonight`);

        // Visibility
        if (quarterType === 'first' && hour >= 18 && hour <= 23) results.phenomena.push('moon: visible in evening sky');
        else if (quarterType === 'last' && hour >= 0 && hour <= 6) results.phenomena.push('moon: visible in morning sky');

        // Zodiac
        if (lunar.zodiac.position === 'late') results.phenomena.push(`moon in late ${lunar.zodiac.sign}, entering ${lunar.zodiac.next} soon`);
        else results.phenomena.push(`moon: in ${lunar.zodiac.sign} ${lunar.zodiac.symbol}`);
    } else {
        // *** Transitional moon ***
        const yesterday = store.astronomy.lunarPhaseHistory?.[store.astronomy.lunarPhaseHistory.length - 2];
        if (yesterday) {
            if (yesterday.phase < 0.02 && lunar.phase > 0.02) results.phenomena.push('moon: waxing to full');
            else if (yesterday.phase < 0.52 && lunar.phase > 0.52) results.phenomena.push('moon: waning past full');
        } else {
            if (lunar.phase < 0.25) results.phenomena.push('moon: crescent waxing');
            else if (lunar.phase < 0.5) results.phenomena.push('moon: gibbous waxing');
            else if (lunar.phase < 0.75) results.phenomena.push('moon: gibbous waning');
            else if (lunar.phase < 1) results.phenomena.push('moon: crescent waning');
        }

        // Zodiac
        if (lunar.zodiac.position === 'late') results.phenomena.push(`moon in late ${lunar.zodiac.sign}, entering ${lunar.zodiac.next} soon`);
        else results.phenomena.push(`moon: in ${lunar.zodiac.sign} ${lunar.zodiac.symbol}`);
    }

    // Lunar Position
    if (lunar.position.altitude > 0) {
        results.phenomena.push(`moon: ${helpers.formatPosition(lunar.position.altitude, lunar.position.azimuth, lunar.position.direction)}`);
        if (lunar.position.altitude > 60) results.phenomena.push('moon: near zenith - excellent viewing');
        else if (lunar.position.altitude < 10) results.phenomena.push('moon: low on horizon');
    } else if (hour >= 6 && hour <= 18) results.phenomena.push('moon: below horizon');

    // Lunar Distance
    if (lunar.distance.isSupermoon) {
        if (lunar.phase >= 0.48 && lunar.phase <= 0.52)
            results.phenomena.push(`supermoon - appears larger and brighter: ${Math.round(((lunar.constants.LUNAR_MEAN_DISTANCE_KM - lunar.distance.distance) / lunar.constants.LUNAR_MEAN_DISTANCE_KM) * 100)}% closer than average`);
        else if (lunar.phase >= 0.98 || lunar.phase <= 0.02) results.phenomena.push('super new moon - extra high tides expected');
        else results.phenomena.push('supermoon - moon at closest approach');
    } else if (lunar.distance.isMicromoon) {
        if (lunar.phase >= 0.48 && lunar.phase <= 0.52)
            results.phenomena.push(`micromoon - appears smaller and dimmer: ${Math.round(((lunar.distance.distance - lunar.constants.LUNAR_MEAN_DISTANCE_KM) / lunar.constants.LUNAR_MEAN_DISTANCE_KM) * 100)}% farther than average`);
    }

    // Lunar Visibility
    results.phenomena.push(`moon: ${helpers.formatPercentage(lunar.brightness)} illuminated`);

    // Lunar Times
    if (lunar.times.rise || lunar.times.set) {
        const times = [];
        if (lunar.times.rise) times.push(`rises ${lunar.times.rise.toTimeString().slice(0, 5)}`);
        if (lunar.times.set) times.push(`sets ${lunar.times.set.toTimeString().slice(0, 5)}`);
        if (times.length > 0) results.phenomena.push(`moon: ${times.join(' & ')}`);
    }
    if (lunar.phase >= 0.48 && lunar.phase <= 0.52) {
        if (lunar.position.altitude > 0) results.phenomena.push('moon: full moon visible now');
        else if (lunar.times.rise && lunar.times.rise.getHours() < 23) results.phenomena.push(`moon: full moon rises at ${lunar.times.rise.toTimeString().slice(0, 5)}`);
    }

    // Noctilucent Clouds (Important for latitude 59.66°N)
    if (month >= 5 && month <= 7 && location.latitude > 50) {
        if ((hour >= 22 || hour <= 2) && cloudCover !== undefined && cloudCover < 50) {
            if (Math.abs(helpers.daysIntoYear(date) - 172) < 30)
                // Near summer solstice
                results.phenomena.push('noctilucent clouds: prime season (check north)');
            else results.phenomena.push('noctilucent clouds: possible in north');
        }
    }
    if ((lunar.phase > 0.05 && lunar.phase < 0.15) || (lunar.phase > 0.85 && lunar.phase < 0.95)) if (cloudCover !== undefined && cloudCover < 30) results.phenomena.push("earthshine: visible on moon's dark side");

    // Lunar next
    const daysToNextPhase = Math.round((0.25 - (lunar.phase % 0.25)) * lunar.constants.LUNAR_CYCLE_DAYS);
    if (daysToNextPhase <= 2) results.phenomena.push(`moon: ${['new moon', 'first quarter', 'full moon', 'last quarter'][Math.ceil(lunar.phase * 4) % 4]} in ${daysToNextPhase} days`);
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

const meteorsTable = [
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

    const currentShowers = meteorsTable.filter((shower) => {
        const monthStart = shower.month,
            monthEnd = shower.endMonth === undefined ? shower.month : shower.endMonth;
        if (monthStart === monthEnd) return month === monthStart && day >= shower.start && day <= shower.end;
        if (monthEnd === (monthStart + 1) % 12) return (month === monthStart && day >= shower.start) || (month === monthEnd && day <= shower.end);
        return false;
    });

    currentShowers.forEach((shower) => {
        let text = `meteors: ${shower.name}`;
        const showerPeakMonth = shower.peakMonth === undefined ? shower.month : shower.peakMonth,
            isPeakDay = month === showerPeakMonth && day === shower.peak;
        let daysFromPeak;
        if (shower.peakMonth !== undefined) {
            const peakDate = new Date(year, showerPeakMonth, shower.peak);
            if (showerPeakMonth < shower.month && month >= shower.month) peakDate.setFullYear(year + 1);
            else if (showerPeakMonth > shower.month && month < shower.month) peakDate.setFullYear(year - 1);
            daysFromPeak = Math.round((peakDate - date) / helpers.constants.MILLISECONDS_PER_DAY);
        } else if (month === shower.month) daysFromPeak = shower.peak - day;
        if (isPeakDay) {
            text += ` peak tonight`;
            if (shower.rate !== undefined) text += ` (ZHR ~${shower.rate}/hr)`;
            if (cloudCover !== undefined && cloudCover < 30) {
                if (lunar.phase <= 0.25 || lunar.phase >= 0.75) text += ' (excellent dark sky conditions)';
                else if (shower.moon === 'bright_ok') text += ' (bright meteors visible despite moon)';
                else if (lunar.phase >= 0.4 && lunar.phase <= 0.6) text += ' (moon will interfere)';
            }
        } else if (daysFromPeak !== undefined && Math.abs(daysFromPeak) <= 2) text += ' ' + helpers.formatProximity('peak', daysFromPeak);
        else return;
        if (isRadiantFavorable(shower.radiant, location.latitude)) text += ' [favorable at this latitude]';
        results.phenomena.push(text);
    });

    // Add special meteor conditions for 59.66°N
    if (location.latitude > 59)
        if (currentShowers.length > 0 && (hour >= 22 || hour <= 4)) {
            if (month >= 8 || month <= 2) results.phenomena.push('meteors: viewing ideal with long dark nights');
            else if (month >= 5 && month <= 7 && daylight.astronomicalDuskDecimal && daylight.astronomicalDawnDecimal)
                results.phenomena.push(`meteors: viewing window ${helpers.formatTime(Math.floor(daylight.astronomicalDuskDecimal), 0)}-${helpers.formatTime(Math.floor(daylight.astronomicalDawnDecimal), 0)}`);
        }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const planetsTable = {
    marsOppositions: [new Date('2025-01-16'), new Date('2027-02-19'), new Date('2029-03-25'), new Date('2031-05-04'), new Date('2033-06-27')],
};

function interpretPlanets(results, situation, data) {
    const { date, month, hour } = situation;
    const { cloudCover } = data;

    // Mars XXX
    const nextOpposition = planetsTable.marsOppositions.find((d) => d > date);
    if (nextOpposition) {
        const daysToOpposition = Math.floor((nextOpposition - date) / helpers.constants.MILLISECONDS_PER_DAY);
        if (Math.abs(daysToOpposition) < 30) results.phenomena.push(helpers.formatProximity('planets: Mars opposition', daysToOpposition) + ' (all night visibility)');
    }

    if (cloudCover !== undefined && cloudCover < 50) {
        // Jupiter
        if (month >= 0 && month <= 3 && (hour >= 22 || hour <= 2)) results.phenomena.push('planets: Jupiter well-placed for viewing');
        // Saturn
        if (month >= 7 && month <= 10 && (hour >= 22 || hour <= 2)) results.phenomena.push('planets: Saturn well-placed for viewing');
        // Mercury
        if (month >= 2 && month <= 4 && hour >= 18 && hour <= 20) results.phenomena.push('planets: Mercury may be visible low in west after sunset (best evening apparition)');
        else if (month >= 9 && month <= 11 && hour >= 5 && hour <= 7) results.phenomena.push('planets: Mercury may be visible low in east before sunrise (best morning apparition)');
        // Venus: would need ephemeris data for accuracy
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const cometsTable = [
    { name: "Halley's Comet", period: 75.3, lastPerihelion: new Date('1986-02-09'), magnitude: 4 },
    { name: 'Comet Encke', period: 3.3, lastPerihelion: new Date('2023-10-22'), magnitude: 6 },
    { name: 'Comet 67P/Churyumov-Gerasimenko', period: 6.45, lastPerihelion: new Date('2021-11-02'), magnitude: 9 },
];

function interpretComets(results, situation) {
    const { date } = situation;

    cometsTable.forEach((comet) => {
        const yearsSinceLast = (date - comet.lastPerihelion) / (helpers.constants.DAYS_PER_YEAR * helpers.constants.MILLISECONDS_PER_DAY);
        const orbitsCompleted = Math.floor(yearsSinceLast / comet.period);
        const nextPerihelion = new Date(comet.lastPerihelion.getTime() + (orbitsCompleted + 1) * comet.period * helpers.constants.DAYS_PER_YEAR * helpers.constants.MILLISECONDS_PER_DAY);
        const yearsUntilReturn = (nextPerihelion - date) / (helpers.constants.DAYS_PER_YEAR * helpers.constants.MILLISECONDS_PER_DAY);
        if (yearsUntilReturn < 1 && yearsUntilReturn > 0) {
            const daysUntil = Math.round(yearsUntilReturn * helpers.constants.DAYS_PER_YEAR);
            if (daysUntil < 30) results.phenomena.push(helpers.formatProximity(`comets: ${comet.name} perihelion`, daysUntil));
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------

// Lunar occultations of bright stars
const starsTable = [
    { name: 'Aldebaran', ra: 68.98, dec: 16.51 },
    { name: 'Regulus', ra: 152.09, dec: 11.97 },
    { name: 'Spica', ra: 201.3, dec: -11.16 },
    { name: 'Antares', ra: 247.35, dec: -26.43 },
];

function interpretStars(results, situation, data) {
    const { month, hour, lunar } = situation;
    const { cloudCover, humidity } = data;

    if (lunar.position.ra !== undefined && lunar.position.dec !== undefined)
        starsTable.filter((star) => helpers.calculateAngularSeparation(lunar.position.ra, lunar.position.dec, star.ra, star.dec) < 0.5).forEach((star) => results.phenomena.push(`stars: moon occults ${star.name} tonight - rare event`));

    if (cloudCover !== undefined && cloudCover < 30 && (hour >= 22 || hour <= 2)) {
        const recommendations = [];
        // Season-specific recommendations
        if (month >= 11 || month <= 1) {
            recommendations.push('stars: Orion Nebula at its best');
            recommendations.push('stars: Winter Hexagon asterism visible');
        } else if (month >= 5 && month <= 7) {
            recommendations.push('stars: Milky Way core visible to south');
            recommendations.push('stars: Scorpius and Sagittarius rich star fields');
        }
        // Condition-specific recommendations
        if (humidity !== undefined && humidity < 50) recommendations.push('stars: excellent transparency for faint objects');
        if (recommendations.length > 0) results.phenomena.push(`stars: tonight's targets: ${recommendations.join(', ')}`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

// Major DSO catalog with visibility data
// RA in hours, Dec in degrees, magnitude, and optimal months
const deepskyTable = [
    // Galaxies
    { name: 'M31 (Andromeda Galaxy)', ra: 0.71, dec: 41.27, mag: 3.4, bestMonths: [8, 9, 10, 11], type: 'galaxy' },
    { name: 'M51 (Whirlpool Galaxy)', ra: 13.46, dec: 47.2, mag: 8.4, bestMonths: [3, 4, 5, 6], type: 'galaxy' },
    { name: "M81 (Bode's Galaxy)", ra: 9.93, dec: 69.07, mag: 6.9, bestMonths: [1, 2, 3, 4], type: 'galaxy' },
    { name: 'M101 (Pinwheel Galaxy)', ra: 14.05, dec: 54.35, mag: 7.9, bestMonths: [3, 4, 5, 6], type: 'galaxy' },
    { name: 'M104 (Sombrero Galaxy)', ra: 12.67, dec: -11.62, mag: 8, bestMonths: [3, 4, 5], type: 'galaxy' },
    // Nebulae
    { name: 'M42 (Orion Nebula)', ra: 5.59, dec: -5.39, mag: 4, bestMonths: [11, 0, 1, 2], type: 'nebula' },
    { name: 'M57 (Ring Nebula)', ra: 18.89, dec: 33.03, mag: 8.8, bestMonths: [6, 7, 8, 9], type: 'planetary' },
    { name: 'M27 (Dumbbell Nebula)', ra: 19.99, dec: 22.72, mag: 7.4, bestMonths: [7, 8, 9, 10], type: 'planetary' },
    { name: 'M8 (Lagoon Nebula)', ra: 18.06, dec: -24.38, mag: 5, bestMonths: [6, 7, 8], type: 'nebula' },
    { name: 'M20 (Trifid Nebula)', ra: 18.03, dec: -23.03, mag: 6.3, bestMonths: [6, 7, 8], type: 'nebula' },
    { name: 'M16 (Eagle Nebula)', ra: 18.31, dec: -13.78, mag: 6, bestMonths: [6, 7, 8], type: 'nebula' },
    // Globular Clusters
    { name: 'M13 (Hercules Cluster)', ra: 16.69, dec: 36.46, mag: 5.8, bestMonths: [5, 6, 7, 8], type: 'globular' },
    { name: 'M22', ra: 18.61, dec: -23.9, mag: 5.1, bestMonths: [6, 7, 8], type: 'globular' },
    { name: 'M5', ra: 15.31, dec: 2.08, mag: 5.7, bestMonths: [5, 6, 7], type: 'globular' },
    { name: 'M3', ra: 13.7, dec: 28.38, mag: 6.2, bestMonths: [4, 5, 6], type: 'globular' },
    // Open Clusters
    { name: 'M45 (Pleiades)', ra: 3.79, dec: 24.12, mag: 1.6, bestMonths: [10, 11, 0, 1], type: 'cluster' },
    { name: 'M44 (Beehive Cluster)', ra: 8.67, dec: 19.98, mag: 3.7, bestMonths: [1, 2, 3, 4], type: 'cluster' },
    { name: 'Double Cluster', ra: 2.35, dec: 57.14, mag: 4.3, bestMonths: [9, 10, 11, 0], type: 'cluster' },
];

function calculateLimitingMagnitude(lunarBrightness, lightPollution, humidity) {
    let limitingMagnitude = 6.5; // Theoretical best
    // Moon phase adjustment
    limitingMagnitude -= lunarBrightness / 25; // Loses ~4 magnitudes at full moon
    // Light pollution adjustment
    const lightPollutionLimiters = {
        high: 3.5,
        medium: 2,
        low: 0.5,
    };
    if (lightPollutionLimiters[lightPollution] !== undefined) limitingMagnitude -= lightPollutionLimiters[lightPollution];
    // Humidity adjustment
    if (humidity !== undefined) {
        if (humidity > 80) limitingMagnitude -= 0.5;
        else if (humidity > 60) limitingMagnitude -= 0.2;
    }
    return limitingMagnitude;
}

function interpretDeepSky(results, situation, data) {
    const { date, location, month, lunar, daylight } = situation;
    const { cloudCover, humidity } = data;

    if ((cloudCover !== undefined && cloudCover > 20) || daylight.isDaytime) return;

    // Calculate limiting magnitude based on conditions
    const limitingMagnitude = calculateLimitingMagnitude(lunar.brightness, location.lightPolution, humidity);

    // Report visibility conditions
    if (limitingMagnitude > 5.5) {
        // Seasonal recommendations
        let recommendation;
        if (month >= 2 && month <= 4) recommendation = 'galaxy season - Virgo cluster well placed';
        else if (month >= 5 && month <= 7) recommendation = 'Milky Way core visible - globular clusters at their best';
        else if (month >= 11 || month <= 1) recommendation = 'Orion Nebula perfectly placed for viewing';
        results.phenomena.push(`deep sky: viewing excellent (limiting magnitude ~${limitingMagnitude.toFixed(1)})` + (recommendation ? ` (${recommendation})` : ''));
    } else if (limitingMagnitude > 4) results.phenomena.push('deep sky: viewing good for brighter objects');
    else results.phenomena.push('deep sky: viewing poor - only brightest objects visible');

    // Calculate current sidereal time to determine what's visible
    const lst = helpers.localSiderealTime(helpers.dateToJulianDateUTC(date), location.longitude) / 15; // Convert to hours
    // Filter visible DSOs
    const visibleDSOs = deepskyTable.filter((dso) => {
        // Check if magnitude is visible
        if (dso.mag > limitingMagnitude) return false;
        // Check if it's the right season
        if (!dso.bestMonths.includes(month)) return false;
        // Calculate hour angle
        const ha = (lst - dso.ra + 24) % 24;
        // Object is well-placed if HA is between -4 and +4 hours (8 hour window): this means it's within 60° of the meridian
        return ha < 4 || ha > 20;
    });
    // Sort by altitude (best positioned first)
    const dsosWithAltitude = visibleDSOs
        .map((dso) => {
            const ha = ((lst - dso.ra + 24) % 24) * 15,
                haRad = (ha * Math.PI) / 180,
                latRad = (location.latitude * Math.PI) / 180,
                decRad = (dso.dec * Math.PI) / 180;
            const altitude = (Math.asin(Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)) * 180) / Math.PI;
            return { ...dso, altitude };
        })
        .filter((dso) => dso.altitude > 25) // Only include objects >25° altitude
        .sort((a, b) => b.altitude - a.altitude);
    // Report the best visible DSOs
    if (dsosWithAltitude.length > 0) {
        // Group and report by type, select first (sorted by altitude) as best entry
        [...new Set(dsosWithAltitude.map((d) => d.type))]
            .map((type) => dsosWithAltitude.find((d) => d.type === type))
            .forEach((best) => {
                if (best.altitude > 60) results.phenomena.push(`deep sky: ${best.name} near zenith (${Math.round(best.altitude)}° alt)`);
                else if (best.altitude > 40) results.phenomena.push(`deep sky: ${best.name} well-placed for viewing (${Math.round(best.altitude)}° alt)`);
                else results.phenomena.push(`deep sky: ${best.name} visible (${Math.round(best.altitude)}° alt)`);
            });
        // Special callouts for exceptional objects
        const showpiece = dsosWithAltitude.find((d) => (d.name.includes('M42') && month >= 11) || month <= 2 || (d.name.includes('M31') && month >= 8 && month <= 11) || (d.name.includes('M13') && month >= 5 && month <= 8));
        if (showpiece && showpiece.altitude > 50) results.phenomena.push(`deep sky: ${showpiece.name.split(' ')[0]} showpiece object perfectly positioned!`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretOrbitingBodies(results, situation, data) {
    const { hour, month, lunar, location, daylight } = situation;
    const { cloudCover } = data;

    // At 59.66°N, ISS passes are frequent
    // This would need real orbital data, but we can indicate possibility
    if (lunar.phase >= 0.48 && lunar.phase <= 0.52 && lunar.position.altitude > 30)
        if ((hour >= 20 || hour <= 5) && cloudCover !== undefined && cloudCover < 50) results.phenomena.push('orbiting: check for ISS lunar transit - moon crossing opportunity');

    if (cloudCover !== undefined && cloudCover < 30 && !daylight.isDaytime)
        if ((hour >= 4 && hour <= 6) || (hour >= 19 && hour <= 22))
            // Dawn/dusk are best for satellite visibility
            results.phenomena.push('orbiting: satellite passes likely visible (check for bright flares)' + (location.latitude > 40 && location.latitude < 60 ? ' (Starlink satellite trains may be visible after recent launches)' : ''));

    if ((hour >= 22 && hour <= 2 && month >= 2 && month <= 4) || (month >= 8 && month <= 10)) results.phenomena.push('orbiting: satellite geostationary flares possible near celestial equator');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

const eventsIntervals = [
    { event: 'lastSupermoon', threshold: 300, message: 'supermoon' },
    { event: 'lastBlueMoon', threshold: 800, message: 'blue moon' },
    { event: 'lastMeteorStorm', threshold: 10000, message: 'meteor storm' },
    { event: 'lastLunarEclipse', threshold: 180, message: 'lunar eclipse' },
    { event: 'lastAuroraVisible', threshold: 60, message: 'visible aurora' },
    { event: 'lastNoctilucent', threshold: 365, message: 'noctilucent clouds' },
];

const eventsDefaultsYearly = {
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
};

const eventsDefaults = {
    // Rare events with timestamps
    events: {
        lastSupermoon: undefined,
        lastBlueMoon: undefined,
        lastMeteorStorm: undefined,
        lastPerfectViewing: undefined, // Clear, new moon, stable air
        lastClearNight: undefined,
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
    yearly: eventsDefaultsYearly,
};

function eventsInitialise(store) {
    if (!store.astronomy.events) store.astronomy.events = eventsDefaults;
}

function eventsAdd(store, eventType, date, details = {}) {
    const { events } = store.astronomy;
    if (!events) return;
    events.events[eventType] = date;
    switch (eventType) {
        case 'lastSupermoon':
            events.yearly.supermoons++;
            break;
        case 'lastBlueMoon':
            events.yearly.blueMoons++;
            break;
        case 'lastMeteorStorm':
            events.yearly.meteorShowers++;
            break;
        case 'lastAuroraVisible':
            events.yearly.auroraSightings++;
            break;
        case 'lastLunarEclipse':
        case 'lastSolarEclipse':
            events.yearly.eclipses++;
            break;
    }
    if (details.record) Object.assign(events.records, details.record);
}

function eventsOccurred(events, currentDate) {
    return eventsIntervals
        .filter(({ event }) => events.events[event])
        .map(({ event, threshold, message }) => {
            const days = Math.floor((currentDate - events.events[event]) / helpers.constants.MILLISECONDS_PER_DAY);
            return days === threshold ? { days, message } : undefined;
        })
        .filter(Boolean);
}

// XXX make simpler
function eventsSummaryYearly(yearly) {
    const summary = [];
    summary.push(`${yearly.fullMoons} full moons (${yearly.supermoons} super, ${yearly.blueMoons} blue)`);
    summary.push(`${yearly.meteorShowersObserved}/${yearly.meteorShowers} meteor showers`);
    summary.push(`${yearly.clearNights} clear nights`);
    summary.push(`${yearly.perfectViewingNights} perfect viewing nights`);
    if (yearly.auroraAlerts > 0) summary.push(`${yearly.auroraSightings}/${yearly.auroraAlerts} aurora sightings/alerts`);
    if (yearly.eclipses > 0) summary.push(`${yearly.eclipses} eclipses`);
    return `${yearly.year}: ${summary.join(', ')}`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function isSameDay(a, b) {
    if (a === undefined || b === undefined) return false;
    return a.getDate() == b.getDate() && a.getMonth() == b.getMonth() && a.getFullYear() == b.getFullYear();
}
function daysBetween(a, b) {
    return a ? Math.floor((b - a) / helpers.constants.MILLISECONDS_PER_DAY) : 999;
}

function processAstronomicalEvents(results, situation, data, _data_previous, store) {
    const { date, year, day, hour } = situation;
    const { cloudCover, humidity, windSpeed, temp } = data;

    const { events } = store.astronomy;
    if (!events) eventsInitialise(store);

    if (events.yearly.year !== year) {
        if (day === 1) results.phenomena.push(eventsSummaryYearly(events.yearly));
        else if (day === 2) events.yearly = eventsDefaultsYearly;
    }

    const isClearNight = cloudCover !== undefined && cloudCover < 20 && (hour >= 22 || hour <= 2);
    if (isClearNight) {
        if (!isSameDay(events.events.lastClearNight, date)) {
            events.streaks.currentClearNights++;
            if (events.streaks.currentClearNights > events.streaks.longestClearStreak) events.streaks.longestClearStreak = events.streaks.currentClearNights;
            events.yearly.clearNights++;
            events.events.lastClearNight = date;
        }
        if (events.streaks.longestClearStreak >= 7) results.phenomena.push(`record clear night streak: ${events.streaks.longestClearStreak} nights`);
    } else if (cloudCover !== undefined && cloudCover > 50 && events.streaks.currentClearNights > 0) {
        events.streaks.currentClearNights = 0;
    }

    const isPerfectViewing = cloudCover !== undefined && cloudCover < 10 && humidity !== undefined && humidity < 70 && windSpeed !== undefined && windSpeed < 3 && temp !== undefined && Math.abs(temp - 10) < 15 && (hour >= 22 || hour <= 2);
    if (isPerfectViewing) {
        if (!isSameDay(events.events.lastPerfectViewing, date)) {
            if (daysBetween(events.events.lastPerfectViewing, date) > 30) results.alerts.push('exceptional viewing conditions tonight - rare clarity');
            events.yearly.perfectViewingNights++;
            events.events.lastPerfectViewing = date;
        }
    }

    eventsOccurred(events, date).forEach(({ days, message }) => results.phenomena.push(`${days} days since last ${message}`));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (options) {
    Object.entries(options).forEach(([key, value]) => (config[key] = value));
    return {
        // 1. Current sky conditions (what's happening right now)
        interpretSolarConditions, // Sun position and immediate effects
        interpretLunarConditions, // Moon position and phase
        assessSeeingConditions, // Current viewing conditions
        // 2. Twilight and daily phenomena
        interpretTwilightPhenomena, // Belt of Venus, Earth's shadow
        checkCrepuscularRays, // Sunset/sunrise rays
        checkGreenFlash, // Sunset/sunrise flash
        checkMoonIllusion, // Moon size illusion near horizon
        // 3. Seasonal and calendar events
        interpretEquinox, // Seasonal markers
        interpretSolstice, // Seasonal extremes
        interpretCrossQuarter, // Traditional calendar
        checkWhiteNights, // Seasonal twilight effects
        // 4. Atmospheric optical phenomena
        interpretAtmosphericOptics, // Halos, sundogs, etc.
        checkAtmosphericShadowBands, // Non-eclipse shadow bands
        enhanceZodiacalLight, // Zodiacal light/gegenschein
        detectAirglow, // Upper atmosphere glow
        // 5. Dynamic celestial events
        interpretMeteors, // Meteor showers
        interpretPlanets, // Planetary positions
        interpretComets, // Comet approaches
        interpretStars, // Star visibility and occultations
        interpretDeepSky, // Deep sky object visibility
        interpretOrbitingBodies, // ISS, satellites
        // 6. Location-specific phenomena
        predictAurora, // Aurora predictions
        checkTides, // Tidal effects
        // 7. Event tracking (when implemented)
        processAstronomicalEvents, // Exceptional event tracking
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
