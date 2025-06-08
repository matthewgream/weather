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
    if (!daylight.sunriseDecimal || !daylight.sunsetDecimal) return undefined;
    const nearSunrise = Math.abs(hourDecimal - daylight.sunriseDecimal) < threshold,
        nearSunset = Math.abs(hourDecimal - daylight.sunsetDecimal) < threshold;
    if (nearSunrise || nearSunset) return nearSunrise ? 'sunrise' : 'sunset';
    return undefined;
}

function isTwilight(daylight, hourDecimal) {
    if (!daylight.civilDawnDecimal || !daylight.sunsetDecimal) return undefined;
    const morningTwilight = hourDecimal > daylight.civilDawnDecimal && hourDecimal < daylight.sunriseDecimal,
        eveningTwilight = hourDecimal > daylight.sunsetDecimal && hourDecimal < daylight.civilDuskDecimal;
    if (morningTwilight || eveningTwilight) return morningTwilight ? 'western' : 'eastern';
    return undefined;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// SOLAR
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarConditions(results, situation, data, _data_history, _store) {
    const { hour, month, hourDecimal, location, solar } = situation;
    const { solarUvi, cloudCover } = data;

    // Solar noon
    if (Math.abs(hourDecimal - solar.position.noon) < 0.25)
        results.phenomena.push(
            `sun: noon at ${helpers.formatTime(Math.floor(solar.position.noon), Math.round((solar.position.noon % 1) * 60))} (offset: ${Math.round(solar.position.equationOfTime)} min, altitude ${helpers.formatAltitude(solar.position.altitude)})`
        );

    // Solar position
    if (solar.position.altitude > 0) {
        results.phenomena.push(`sun: ${helpers.formatPosition(solar.position.altitude, solar.position.azimuth, solar.position.direction)}`);

        // Special conditions
        if (solar.position.altitude > 50) results.phenomena.push('sun: high angle overhead');
        else if (solar.isGoldenHour) results.phenomena.push('sun: golden hour' + (solar.position.altitude < 2 ? ' (transitioning to blue hour)' : ''));

        // Shadow length indicator
        if (solar.position.altitude > 0.1 && solar.position.altitude < 45 && solar.shadowMultiplier !== Infinity) results.phenomena.push(`sun: shadows ${Math.round(solar.shadowMultiplier * 10) / 10}x object height`);
    }

    // UV index warning for summer at this latitude
    if (solar.position.altitude > 40 && solarUvi !== undefined && solarUvi > 5) results.phenomena.push(`sun: UV index ${solarUvi} (${solarUvi > 10 ? 'extreme' : solarUvi > 7 ? 'very high' : 'high'}) - protection advised`);

    // Winter sun at this latitude
    if (location.latitude > 59 && month === 11 && solar.position.altitude < 10 && solar.position.altitude > 0) results.phenomena.push('sun: low winter angle (long shadows)');

    // At summer solstice
    if (Math.abs(solar.position.declination - 23.44) < 0.1 && Math.abs(location.latitude - 23.44) < 0.5) results.phenomena.push('sun: directly overhead at solar noon (zenith passage)');

    if (solar.position.altitude > 0 && solar.position.altitude < 2) results.phenomena.push('sun: atmospheric dispersion visible (red lower rim, blue-green upper rim)');

    if (solar.position.altitude > 20 && cloudCover !== undefined && cloudCover < 30) results.phenomena.push('sun: observe safely with proper solar filter only' + (hour >= 10 && hour <= 14 ? 'limb darkening visible with solar filter' : ''));

    if (solar.position.altitude > 0 && solar.position.altitude < 30) results.phenomena.push(`sky: maximum polarization at 90° from sun (azimuth ~${Math.round((solar.position.azimuth + 90) % 360)}°)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function checkGreenFlash(results, situation, data, _data_previous, _store) {
    const { daylight, location, hourDecimal } = situation;
    const { windSpeed, pressure } = data;

    const sunRiseOrSet = isNearSunriseOrSet(daylight, hourDecimal, 0.25);
    if (sunRiseOrSet && location.horizonClear && pressure !== undefined && windSpeed !== undefined)
        if (Math.abs(1013 - pressure) / 20 + windSpeed / 10 < 3) {
            // Ideal conditions: stable air, low humidity variation
            results.phenomena.push(`green flash: possible at ${sunRiseOrSet} (watch upper edge)` + (pressure !== undefined && pressure > 1020 ? ' (green rim may be visible with binoculars even without flash)' : ''));
            // // Venus/Jupiter green flash
            // const venusAlt = getVenusAltitude(date, location); // This would need implementation
            // if (venusAlt > 0 && venusAlt < 5)
            //     results.phenomena.push('green flash possible from Venus (use binoculars)');
        }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function checkCrepuscularRays(results, situation, data, _data_previous, _store) {
    const { daylight, hourDecimal, solar } = situation;
    const { cloudCover } = data;

    const sunRiseOrSet = isNearSunriseOrSet(daylight, hourDecimal, 1);
    if (sunRiseOrSet && cloudCover !== undefined && cloudCover > 30 && cloudCover < 70) {
        results.phenomena.push('crepuscular rays: likely (sunbeams)' + (cloudCover > 40 && cloudCover < 60 ? ', anticrepuscular rays possible' : ''));
        if (cloudCover > 40 && cloudCover < 60) if (-solar.position.altitude > 0) results.phenomena.push(`anticrepuscular rays: converging at antisolar point (${Math.round(-solar.position.altitude)}° altitude)`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function checkAtmosphericShadowBands(results, situation, data, _data_previous, _store) {
    const { solar } = situation;
    const { windSpeed, temp, pressure } = data;

    // Shadow bands can occur during extreme atmospheric turbulence
    if (pressure !== undefined && windSpeed !== undefined && temp !== undefined && solar.position.altitude > 0 && solar.position.altitude < 20) {
        const turbulenceIndex = Math.abs(pressure - 1013) / 10 + windSpeed / 10;
        if (turbulenceIndex > 3 && Math.abs(temp - 20) > 10) results.phenomena.push('optics: shadow bands possible (atmospheric turbulence)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// LUNAR
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarPhase(results, situation, data, _data_previous, store) {
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
        if ((month === 8 || month === 9) && lunar.phase >= 0.48 && lunar.phase <= 0.52) {
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
                const milkyWayBestHour = 24 - (month - 6) * 2; // Rough approximation
                if (location.lightPollution === 'low') {
                    let text;
                    if (month >= 4 && month <= 9) {
                        const hourDiff = Math.abs(hour - milkyWayBestHour);
                        if (hourDiff < 3 || hourDiff > 21) text = `Milky Way core visible, best around ${milkyWayBestHour}:00`;
                    }
                    results.phenomena.push('stars: viewing excellent' + (text ? ` (${text}))` : ''));
                } else if (location.lightPollution === 'medium') results.phenomena.push('stars: viewing good for bright stars');
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
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarPosition(results, situation, _data, _data_previous, _store) {
    const { hour, location, lunar } = situation;

    // Lunar Position
    if (lunar.position.altitude > 0) {
        results.phenomena.push(`moon: ${helpers.formatPosition(lunar.position.altitude, lunar.position.azimuth, lunar.position.direction)}`);
        const maxAltitude = 90 - Math.abs(location.latitude - lunar.position.dec);
        if (lunar.position.altitude > 60 && lunar.position.altitude > maxAltitude - 10) results.phenomena.push('moon: near zenith - excellent viewing');
        else if (lunar.position.altitude < 10) results.phenomena.push('moon: low on horizon');
    } else if (hour >= 6 && hour <= 18) results.phenomena.push('moon: below horizon');

    // Lunar Distance
    if (lunar.distance.isSupermoon) {
        if (lunar.phase >= 0.48 && lunar.phase <= 0.52) results.phenomena.push(`supermoon - appears ${Math.round((lunar.constants.LUNAR_MEAN_DISTANCE_KM / lunar.distance.distance - 1) * 100)}% larger than average`);
        else if (lunar.phase >= 0.98 || lunar.phase <= 0.02) results.phenomena.push('super new moon - extra high tides expected');
        else results.phenomena.push('supermoon - moon at closest approach');
    } else if (lunar.distance.isMicromoon) {
        if (lunar.phase >= 0.48 && lunar.phase <= 0.52)
            results.phenomena.push(`micromoon - appears smaller and dimmer: ${Math.round(((lunar.distance.distance - lunar.constants.LUNAR_MEAN_DISTANCE_KM) / lunar.constants.LUNAR_MEAN_DISTANCE_KM) * 100)}% farther than average`);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarVisibility(results, situation, data, _data_previous, _store) {
    const { date, month, hour, location, lunar } = situation;
    const { cloudCover, rainRate } = data;

    // Lunar Visibility
    results.phenomena.push(`moon: ${helpers.formatPercentage(lunar.brightness)} illuminated`);

    if (lunar.phase >= 0.48 && lunar.phase <= 0.52) {
        if (lunar.position.altitude > 0) results.phenomena.push('moon: full moon visible now');
        else if (lunar.times.rise && lunar.times.rise.getHours() < 23) results.phenomena.push(`moon: full moon rises at ${lunar.times.rise.toTimeString().slice(0, 5)}`);
    }

    if (Math.abs(lunar.position.libration.longitude) > 5) results.phenomena.push(`moon: ${lunar.position.libration.longitude > 0 ? 'eastern' : 'western'} limb features visible (libration)`);

    // Noctilucent Clouds (Important for latitude 59.66°N)
    if (month >= 4 && month <= 7 && location.latitude > 50) {
        if ((hour >= 22 || hour <= 2) && cloudCover !== undefined && cloudCover < 50) {
            if (Math.abs(helpers.daysIntoYear(date) - 192) < 30)
                // Near summer solstice
                results.phenomena.push('noctilucent clouds: prime season (check north)');
            else results.phenomena.push('noctilucent clouds: possible in north');
        }
    }
    if ((lunar.phase > 0.02 && lunar.phase < 0.3) || (lunar.phase > 0.7 && lunar.phase < 0.98)) if (cloudCover !== undefined && cloudCover < 30) results.phenomena.push("earthshine: visible on moon's dark side");

    if (lunar.phase >= 0.48 && lunar.phase <= 0.52 && Math.abs(lunar.position.latitude) < 3) results.phenomena.push('moon: watch for subtle penumbral shading (possible eclipse season)');

    const hoursToFirstQuarter = (0.25 - lunar.phase) * lunar.constants.LUNAR_CYCLE_DAYS * 24;
    if (hoursToFirstQuarter > 4 && hoursToFirstQuarter < 8) results.phenomena.push('moon: Lunar X and V features visible along terminator (use binoculars)');

    if (lunar.phase >= 0.15 && lunar.phase <= 0.35) results.phenomena.push('moon: maria and crater shadows prominent along terminator');
    else if (lunar.phase >= 0.65 && lunar.phase <= 0.85) results.phenomena.push('moon: western maria and ray craters prominent');
    if (lunar.phase >= 0.45 && lunar.phase <= 0.55) results.phenomena.push('moon: crater rays prominent (Tycho, Copernicus, Kepler rays visible)');
    else if (lunar.phase >= 0.2 && lunar.phase <= 0.3) results.phenomena.push('moon: crater depths visible along terminator (use high magnification)');

    if (lunar.phase >= 0.45 && lunar.phase <= 0.55 && lunar.position.altitude > 0 && lunar.position.altitude < 42)
        if (rainRate !== undefined && rainRate > 0) results.phenomena.push('moonbow: possible if rain with clear breaks' + (lunar.brightness > 90 ? ' (double moonbow possible with bright full moon)' : ''));
    if ((lunar.phase >= 0.23 && lunar.phase <= 0.27) || (lunar.phase >= 0.73 && lunar.phase <= 0.77)) results.phenomena.push('moon: terminator moving ~15 km/hour across surface');

    if (lunar.position.altitude > 0 && lunar.position.altitude < 5 && lunar.phase > 0.4) results.phenomena.push('moon: atmospheric dispersion may separate colors at limb');

    if (lunar.distance.isSupermoon || lunar.distance.isPerigee)
        results.phenomena.push(`moon: horizontal parallax ${Math.round(((((3600 * 180) / Math.PI) * (helpers.constants.LUNAR_MEAN_DISTANCE_KM / lunar.distance.distance)) / 3600) * 10) / 10}° (appears shifted at horizon)`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretLunarEvents(results, situation, data, _data_previous, _store) {
    const { date, location, lunar } = situation;

    // Lunar Times
    if (lunar.times.rise || lunar.times.set) {
        const times = [];
        if (lunar.times.rise) times.push(`rises ${lunar.times.rise.toTimeString().slice(0, 5)} at ${Math.round(helpers.calculateMoonriseAzimuth(lunar.times, location))}°`);
        if (lunar.times.set) times.push(`sets ${lunar.times.set.toTimeString().slice(0, 5)} at ${Math.round(helpers.calculateMoonsetAzimuth(lunar.times, location))}°`);
        if (times.length > 0) results.phenomena.push(`moon: ${times.join(' & ')}`);
    }

    // Moon's declination varies ±28.5° (more than Sun's ±23.5°)
    if (Math.abs(lunar.position.dec) > 27) results.phenomena.push('moon: extreme declination (monthly standstill)');

    if (lunar.phase >= 0.48 && lunar.phase <= 0.52 && Math.abs(lunar.position.latitude) < 1.5) results.phenomena.push('moon: near ecliptic plane (eclipse season possible)');

    const nodalCycleYears = 18.613;
    const lastMajorStandstill = new Date('2025-03-22'); // Approximate
    const yearsSinceStandstill = (date - lastMajorStandstill) / (helpers.constants.DAYS_PER_YEAR * helpers.constants.MILLISECONDS_PER_DAY);
    const nodalPhase = (yearsSinceStandstill % nodalCycleYears) / nodalCycleYears;
    if (nodalPhase < 0.1 || nodalPhase > 0.9) results.phenomena.push('moon: near major standstill (maximum declination range ±28.5°)');
    else if (Math.abs(nodalPhase - 0.5) < 0.1) results.phenomena.push('moon: near minor standstill (minimum declination range ±18.5°)');

    // Lunar next
    const daysToNextPhase = Math.round((0.25 - (lunar.phase % 0.25)) * lunar.constants.LUNAR_CYCLE_DAYS);
    if (daysToNextPhase <= 2) results.phenomena.push(`moon: ${['new moon', 'first quarter', 'full moon', 'last quarter'][Math.ceil(lunar.phase * 4) % 4]} in ${daysToNextPhase} days`);
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function checkMoonIllusion(results, situation, _data, _data_previous, _store) {
    const { lunar, hour } = situation;

    if (lunar.position.altitude > 0 && lunar.position.altitude < 20)
        if (lunar.phase >= 0.45 && lunar.phase <= 0.55) {
            results.phenomena.push('moon appears larger near horizon (moon illusion effect)');
            // Check if moon is rising or setting
            if (lunar.times.rise && Math.abs(hour - lunar.times.rise.getHours()) < 1) results.phenomena.push('moon rising: watch for atmospheric color effects');
            else if (lunar.times.set && Math.abs(hour - lunar.times.set.getHours()) < 1) results.phenomena.push('moon setting: moon may appear orange/red');
        }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// TWILIGHT
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkTwilightPhenomena(results, situation, data, _data_previous, _store) {
    const { daylight, hourDecimal, solar, location } = situation;
    const { cloudCover } = data;

    const twilight = isTwilight(daylight, hourDecimal);
    if (twilight && cloudCover !== undefined && cloudCover < 40) {
        const sunDepression = Math.abs(solar.position.altitude);
        if (sunDepression > 2 && sunDepression < 6) results.phenomena.push(`twilight: Belt of Venus ${Math.round(sunDepression * 2)}° high in ${twilight} sky`);
        results.phenomena.push(`twilight: Earth's shadow visible (dark band on ${twilight} horizon)`);
        // Alpenglow
        if (location.nearMountains || location.elevation > 500) results.phenomena.push('twilight: alpenglow on mountain peaks');
    }
    if (twilight && cloudCover !== undefined && cloudCover < 20) results.phenomena.push('twilight: dark segment visible (twilight wedge/Earth shadow)' + (location.elevation > 1000 ? ' (shadow bands may be visible on mountains)' : ''));

    if (twilight) results.phenomena.push('twilight: Purkinje effect active (red objects appear darker, blue-green enhanced)');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function checkZodiacalLight(results, situation, data, _data_previous, _store) {
    const { month, hour, location, lunar } = situation;
    const { cloudCover } = data;

    if (cloudCover !== undefined && cloudCover < 20 && location.lightPollution === 'low') {
        if (lunar.phase < 0.25 || lunar.phase > 0.75) {
            // Spring evening (best in March-April)
            const eclipticAngle = 90 - Math.abs(location.latitude - 23.4 * Math.cos(((month - 3) * Math.PI) / 6));
            if (eclipticAngle > 60) {
                // Steep ecliptic
                const seasonalBest =
                    location.hemisphere === 'northern' ? (month >= 2 && month <= 3 ? 'evening' : month >= 8 && month <= 9 ? 'morning' : undefined) : month >= 8 && month <= 9 ? 'evening' : month >= 2 && month <= 3 ? 'morning' : undefined;
                if (seasonalBest) results.phenomena.push(`zodiacal light: ${seasonalBest} viewing optimal (steep ecliptic)`);
            }
            if (month >= 2 && month <= 3 && hour >= 20 && hour <= 22)
                results.phenomena.push('zodiacal light: visible in west (faint pyramid)' + (location.lightPollution === 'low' && (hour >= 23 || hour <= 2) ? ', gegenschein possible' : ''));
            // Autumn morning (best in September-October)
            else if (month >= 8 && month <= 10 && hour >= 4 && hour <= 6) results.phenomena.push('zodiacal light: visible in east before dawn');
            // TBD if (location.lightPollution === 'low' && lunar.phase < 0.25) results.phenomena.push('zodiacal band may connect to gegenschein');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function checkAirglow(results, situation, data, _data_previous, _store) {
    const { location, month, hour, year } = situation;
    const { cloudCover } = data;

    if (location.lightPollution === 'low' && cloudCover !== undefined && cloudCover < 10)
        if (helpers.getGeomagneticActivity(month, year) > 2.5 && (hour >= 23 || hour <= 3))
            results.phenomena.push('airglow: visible (faint bands, green 557nm oxygen emission)' + (location.latitude > 30 && location.latitude < 60 ? ', wave structure possible (630nm emissions at higher altitudes)' : ''));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// SEASONAL
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretEquinox(results, situation, data, _data_previous, _store) {
    const { date, location } = situation;
    const { windSpeed } = data;

    const equinoxInfo = helpers.isNearEquinox(date, location.hemisphere, config.equinoxLookaheadDays);
    if (!equinoxInfo.near) return;

    results.phenomena.push(helpers.formatProximity(equinoxInfo.type, equinoxInfo.days));

    // Daylight change rate
    const changeRate = location.latitude > 50 ? ` (${Math.round(Math.abs(Math.sin((location.latitude * Math.PI) / 180)) * 4)} min/day)` : '';
    const twilightDuration = Math.round(90 / Math.cos((location.latitude * Math.PI) / 180));
    results.phenomena.push(`daylight: rapidly ${equinoxInfo.type.includes('spring') ? 'increasing' : 'decreasing'}${changeRate}, twilight ~${twilightDuration} min`);

    // Equinox storms
    if (Math.abs(equinoxInfo.days) <= 14 && windSpeed !== undefined && windSpeed > 15) results.phenomena.push('equinoctial gales');
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolstice(results, situation, data, _data_previous, _store) {
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

function interpretCrossQuarter(results, situation, _data, _data_previous, _store) {
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

function interpretWhiteNights(results, situation, _data, _data_previous, _store) {
    const { location, date, year } = situation;

    if (location.latitude > 48) {
        // White nights occur when sun doesn't go below -6° (civil twilight)
        const summerSolstice = new Date(year, 5, 21),
            daysFromSolstice = Math.floor((location.latitude - 48) * 10);
        if (daysFromSolstice > 0) {
            const startDate = new Date(summerSolstice.getTime() - daysFromSolstice * helpers.constants.MILLISECONDS_PER_DAY),
                endDate = new Date(summerSolstice.getTime() + daysFromSolstice * helpers.constants.MILLISECONDS_PER_DAY);
            if (date >= startDate && date <= endDate) results.phenomena.push(Math.abs(date - summerSolstice) <= 7 * helpers.constants.MILLISECONDS_PER_DAY ? 'white nights: peak brightness' : 'white nights: no true darkness');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// OBSERVATIONAL CONDITIONS
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretViewingConditions(results, situation, data, data_previous, store) {
    const { date, hour } = situation;
    const { timestamp, temp, windSpeed, pressure, humidity, cloudCover } = data;

    if (temp !== undefined && data_previous?.length > 1 && data_previous[1].temp !== undefined) {
        const tempChange = Math.abs(temp - data_previous[1].temp),
            jetStreamEffect = windSpeed !== undefined && windSpeed > 15 ? 2 : 0,
            thermalEffect = hour >= 12 && hour <= 16 ? 1 : 0;
        // Seeing
        const seeingIndex = tempChange * 2 + jetStreamEffect + thermalEffect + windSpeed / 10;
        if (seeingIndex < 2) results.phenomena.push('viewing: excellent (steady air for telescopes)');
        else if (seeingIndex < 4) results.phenomena.push('viewing: good for astronomy');
        else if (seeingIndex > 6) results.phenomena.push('viewing: poor (heavy twinkling)');
        // Scintillation index
        if (windSpeed !== undefined && windSpeed > 10 && pressure !== undefined && Math.abs(pressure - 1013) > 10) results.phenomena.push('viewing: strong scintillation (colorful twinkling)');
        if (data_previous?.length >= 3) {
            const pressureTrend = pressure - data_previous[2].pressure;
            if (Math.abs(pressureTrend) > 5) results.phenomena.push(`viewing: rapidly ${pressureTrend > 0 ? 'improving' : 'degrading'} conditions`);
        }
        if (location.elevation > 500) {
            const tempGradient = (temp - data_previous[1].temp) / ((timestamp - data_previous[1].timestamp) / 3600000);
            if (Math.abs(tempGradient) > 2) results.phenomena.push(`viewing: strong thermal gradients (${tempGradient > 0 ? 'warming' : 'cooling'} ${Math.abs(tempGradient).toFixed(1)}°C/hr)`);
        }
    }

    // // Add SQM (Sky Quality Meter) equivalent values
    // const sqmValues = {
    //     'low': 21.5,     // Rural sky
    //     'medium': 19.5,  // Suburban sky
    //     'high': 17.5     // Urban sky
    // };
    // if (location.lightPollution)
    //     results.phenomena.push(`sky brightness: ~${sqmValues[location.lightPollution]} mag/arcsec² (${location.lightPollution} light pollution)`);

    // --- TRACKING
    const events = eventsLoad(store);
    const isClearNight = cloudCover !== undefined && cloudCover < 20 && (hour >= 22 || hour <= 2);
    if (isClearNight) {
        if (!helpers.isSameDay(events.events.lastClearNight, date)) {
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
        if (!helpers.isSameDay(events.events.lastPerfectViewing, date)) {
            if (helpers.daysBetween(events.events.lastPerfectViewing, date) > 30) results.alerts.push('exceptional viewing conditions tonight - rare clarity');
            events.yearly.perfectViewingNights++;
            events.events.lastPerfectViewing = date;
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// ATMOSPHEREIC CONDITIONS
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretAtmosphericOptics(results, situation, data, _data_previous, _store) {
    const { daylight, location, solar } = situation;
    const { temp, humidity, cloudCover, windSpeed } = data;

    // 22-degree halo conditions
    if (cloudCover !== undefined && cloudCover > 20 && cloudCover < 80)
        if (solar.position.altitude > 0 && solar.position.altitude < 60) results.phenomena.push('optics: 22° halo possible (ice crystals)' + (solar.position.altitude > 15 && solar.position.altitude < 32 ? ', sundogs likely' : ''));

    // Light pillars
    if (temp !== undefined && temp < -5 && humidity !== undefined && humidity > 70 && windSpeed !== undefined && windSpeed < 5)
        if (!daylight.isDaytime && location.lightPollution !== 'low') results.phenomena.push('optics: light pillars possible (ground lights in ice crystals)');

    // Circumzenithal arc
    if (cloudCover !== undefined && cloudCover > 10 && cloudCover < 50 && temp !== undefined && temp < -5)
        if (solar.position.altitude > 5 && solar.position.altitude < 32.3) results.phenomena.push('optics: circumzenithal arc possible (rainbow at zenith)');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// CELESTIAL
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretOrbitingBodies(results, situation, data, _data_previous, _store) {
    const { hour, month, lunar, location, daylight } = situation;
    const { cloudCover } = data;

    // At 59.66°N, ISS passes are frequent
    // This would need real orbital data, but we can indicate possibility
    if (lunar.phase >= 0.4 && lunar.phase <= 0.6 && lunar.position.altitude > 20)
        if ((hour >= 20 || hour <= 5) && cloudCover !== undefined && cloudCover < 50) results.phenomena.push('orbiting: check for ISS lunar transit - moon crossing opportunity');

    if (cloudCover !== undefined && cloudCover < 30 && !daylight.isDaytime) {
        const summerTwilight = month >= 4 && month <= 8;
        if ((hour >= 4 && hour <= 6) || (hour >= (summerTwilight ? 20 : 19) && hour <= (summerTwilight ? 23 : 22)))
            // Dawn/dusk are best for satellite visibility
            results.phenomena.push('orbiting: satellite passes likely visible (check for bright flares)' + (location.latitude > 40 && location.latitude < 60 ? ' (Starlink satellite trains may be visible after recent launches)' : ''));
    }

    if (((month === 2 || month === 3 || month === 8 || month === 9) && hour >= 22) || ((month === 3 || month === 4 || month === 9 || month === 10) && hour <= 2))
        if (Math.abs(location.latitude) < 10)
            // Visible from this latitude
            results.phenomena.push(`orbiting: geostationary satellite flares possible ${month >= 2 && month <= 4 ? 'pre-dawn' : 'post-sunset'} near celestial equator`);
}

// Lunar occultations of bright stars
const starsTable = [
    { name: 'Aldebaran', ra: 68.98, dec: 16.51 },
    { name: 'Regulus', ra: 152.09, dec: 11.97 },
    { name: 'Spica', ra: 201.3, dec: -11.16 },
    { name: 'Antares', ra: 247.35, dec: -26.43 },
];

// -----------------------------------------------------------------------------------------------------------------------------------------

const planetsTable = {
    marsOppositions: [new Date('2025-01-16'), new Date('2027-02-19'), new Date('2029-03-25'), new Date('2031-05-04'), new Date('2033-06-27')],
};

function interpretPlanets(results, situation, data, _data_previous, _store) {
    const { date, month, hour } = situation;
    const { cloudCover } = data;

    // Mars XXX
    const nextOpposition = planetsTable.marsOppositions.find((d) => d > date);
    if (nextOpposition) {
        const daysToOpposition = Math.floor((nextOpposition - date) / helpers.constants.MILLISECONDS_PER_DAY);
        if (Math.abs(daysToOpposition) < 30) results.phenomena.push(helpers.formatProximity('planets: Mars opposition', daysToOpposition) + ' (all night visibility)');
        // if (Math.abs(daysToOpposition) < 60) {
        //     if (Math.abs(daysToOpposition) < 30)
        //         results.phenomena.push('planets: Mars in retrograde motion (moving westward against stars)');
        //     else
        //         results.phenomena.push('planets: Mars near stationary point (changing direction)');
        // }
    }

    if (cloudCover !== undefined && cloudCover < 50) {
        // Jupiter
        if (month >= 0 && month <= 3 && (hour >= 22 || hour <= 2)) results.phenomena.push('planets: Jupiter well-placed for viewing');
        // Saturn
        if (month >= 7 && month <= 10 && (hour >= 22 || hour <= 2)) results.phenomena.push('planets: Saturn well-placed for viewing');
        // Mercury
        if (month >= 2 && month <= 4 && hour >= 18 && hour <= 20) results.phenomena.push('planets: Mercury possibly visible if at greatest elongation');
        else if (month >= 9 && month <= 11 && hour >= 5 && hour <= 7) results.phenomena.push('planets: Mercury may be visible low in east before sunrise (best morning apparition)');
        // Venus
        const venusData = helpers.getVenusElongation(date);
        if (venusData.elongation > 15) {
            // Venus visible when >15° from Sun
            const bestTime = venusData.visibility === 'evening' ? `after sunset (${venusData.direction} sky)` : `before sunrise (${venusData.direction} sky)`;
            results.phenomena.push(`planets: Venus ${Math.round(venusData.elongation)}° from Sun, visible ${bestTime}`);
            if (venusData.elongation < 40) results.phenomena.push('planets: Venus showing crescent phase (use binoculars)' + (venusData.visibility === 'evening' ? ' (ashen light possible on dark side with telescope)' : ''));
            else if (venusData.elongation > 45 && venusData.elongation < 47) results.phenomena.push('planets: Venus near greatest elongation (best visibility)');
        }
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretStars(results, situation, data, _data_previous, _store) {
    const { month, hour, lunar } = situation;
    const { cloudCover, humidity } = data;

    if (lunar.position.ra !== undefined && lunar.position.dec !== undefined)
        starsTable.forEach((star) => {
            const separation = helpers.calculateAngularSeparation(lunar.position.ra, lunar.position.dec, star.ra, star.dec);
            if (separation < 0.25) {
                if (separation > 0.2 && separation < 0.25) results.phenomena.push(`stars: grazing occultation of ${star.name} - extremely rare! (multiple disappearances)`);
                else results.phenomena.push(`stars: moon occults ${star.name} tonight - rare event`);
            }
        });

    if (cloudCover !== undefined && cloudCover < 30 && (hour >= 22 || hour <= 2)) {
        const recommendations = [];
        // Season-specific recommendations
        if (month >= 11 || month <= 1) {
            const orionMeridian = 22 + (month === 11 ? 2 : month === 0 ? 0 : -2);
            recommendations.push(`stars: Orion Nebula at its best (highest around ${orionMeridian}:00)`);
            recommendations.push('stars: Winter Hexagon asterism visible');
        } else if (month >= 5 && month <= 7) {
            recommendations.push('stars: Milky Way core visible to south');
            recommendations.push('stars: Scorpius and Sagittarius rich star fields');
        }
        // Condition-specific recommendations
        if (humidity !== undefined && humidity < 50) recommendations.push('stars: excellent transparency for faint objects');
        if (recommendations.length > 0) results.phenomena.push(`stars: tonight's targets: ${recommendations.join(', ')}`);
        if (month >= 11 || month <= 1) results.phenomena.push('stars: color contrasts visible - compare orange Betelgeuse with blue Rigel');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const cometsTable = [
    { name: "Halley's Comet", period: 75.3, lastPerihelion: new Date('1986-02-09'), magnitude: 4 },
    { name: 'Comet Encke', period: 3.3, lastPerihelion: new Date('2023-10-22'), magnitude: 6 },
    { name: 'Comet 67P/Churyumov-Gerasimenko', period: 6.45, lastPerihelion: new Date('2021-11-02'), magnitude: 9 },
];

function interpretComets(results, situation, _data, _data_previous, _store) {
    const { date } = situation;

    cometsTable.forEach((comet) => {
        // const yearsSinceLast = (date - comet.lastPerihelion) / (helpers.constants.DAYS_PER_YEAR * helpers.constants.MILLISECONDS_PER_DAY);
        const periodMs = comet.period * helpers.constants.DAYS_PER_YEAR * helpers.constants.MILLISECONDS_PER_DAY;
        let nextPerihelion = new Date(comet.lastPerihelion);
        while (nextPerihelion < date) nextPerihelion = new Date(nextPerihelion.getTime() + periodMs);
        const yearsUntilReturn = (nextPerihelion - date) / (helpers.constants.DAYS_PER_YEAR * helpers.constants.MILLISECONDS_PER_DAY);
        if (yearsUntilReturn < 1 && yearsUntilReturn > 0) {
            const daysUntil = Math.round(yearsUntilReturn * helpers.constants.DAYS_PER_YEAR);
            if (daysUntil < 30 && comet.magnitude < 10) results.phenomena.push(helpers.formatProximity(`comets: ${comet.name} perihelion`, daysUntil) + (comet.magnitude < 6 ? ' (naked eye)' : ' (binoculars)'));
        }
    });
}

// -----------------------------------------------------------------------------------------------------------------------------------------

const meteorsTable = [
    // Major showers
    { month: 0, start: 1, end: 5, peak: 3, name: 'Quadrantids', rate: 120, moon: 'any', radiant: 'Quadrantids' },
    { month: 3, start: 16, end: 25, peak: 22, name: 'Lyrids', rate: 18, moon: 'favor_dark', radiant: 'Lyrids' },
    { month: 4, start: 19, end: 28, peak: 6, peakMonth: 5, name: 'Eta Aquarids', rate: 50, moon: 'any', radiant: 'Eta Aquarids' },
    { month: 6, start: 12, endMonth: 7, end: 23, peak: 30, peakMonth: 6, name: 'Southern Delta Aquarids', rate: 25, moon: 'any', radiant: 'Southern Delta Aquarids' },
    { month: 7, start: 17, end: 24, peak: 12, name: 'Perseids', rate: 100, moon: 'favor_dark', radiant: 'Perseids' },
    { month: 9, start: 6, end: 10, peak: 8, name: 'Draconids', rate: 'variable', moon: 'any', radiant: 'Draconids' },
    { month: 9, start: 2, endMonth: 10, end: 7, peak: 21, name: 'Orionids', rate: 20, moon: 'favor_dark', radiant: 'Orionids' },
    { month: 10, start: 7, end: 10, peak: 9, name: 'Southern Taurids', rate: 10, moon: 'any', radiant: 'Southern Taurids' },
    { month: 10, start: 6, end: 30, peak: 12, name: 'Northern Taurids', rate: 15, moon: 'any', radiant: 'Northern Taurids' },
    { month: 10, start: 14, end: 21, peak: 17, name: 'Leonids', rate: 15, moon: 'favor_dark', radiant: 'Leonids' },
    { month: 11, start: 4, end: 17, peak: 14, name: 'Geminids', rate: 120, moon: 'favor_dark', radiant: 'Geminids' },
    { month: 11, start: 17, end: 26, peak: 22, name: 'Ursids', rate: 10, moon: 'any', radiant: 'Ursids' },

    // Minor showers particularly visible at high latitudes
    { month: 0, start: 15, end: 25, peak: 20, name: 'Gamma Velids', rate: 5, moon: 'any', radiant: 'Gamma Velids' },
    { month: 3, start: 14, end: 30, peak: 24, name: 'Mu Virginids', rate: 7, moon: 'any', radiant: 'Mu Virginids' },
    { month: 4, start: 8, end: 12, peak: 10, name: 'Eta Lyrids', rate: 3, moon: 'any', radiant: 'Eta Lyrids' },
    { month: 5, start: 5, endMonth: 6, end: 2, peak: 27, peakMonth: 5, name: 'June Bootids', rate: 'variable', moon: 'any', radiant: 'June Bootids' },
    { month: 6, start: 3, endMonth: 7, end: 15, peak: 28, peakMonth: 6, name: 'Alpha Capricornids', rate: 5, moon: 'bright_ok', radiant: 'Alpha Capricornids' },
    { month: 8, start: 25, endMonth: 9, end: 20, peak: 9, peakMonth: 9, name: 'September Epsilon Perseids', rate: 5, moon: 'any', radiant: 'September Epsilon Perseids' },
    { month: 11, start: 6, end: 30, peak: 12, name: 'Sigma Hydrids', rate: 5, moon: 'any', radiant: 'Sigma Hydrids' },

    // Additional notable showers
    { month: 0, start: 10, end: 22, peak: 17, name: 'Alpha Centaurids', rate: 6, moon: 'any', radiant: 'Alpha Centaurids' },
    { month: 3, start: 15, endMonth: 4, end: 28, peak: 23, name: 'Pi Puppids', rate: 'variable', moon: 'any', radiant: 'Pi Puppids' },
    { month: 6, start: 25, endMonth: 7, end: 17, peak: 9, peakMonth: 7, name: 'Piscis Austrinids', rate: 5, moon: 'any', radiant: 'Piscis Austrinids' },
    { month: 7, start: 13, end: 26, peak: 18, name: 'Kappa Cygnids', rate: 3, moon: 'bright_ok', radiant: 'Kappa Cygnids' },
    { month: 8, start: 4, end: 15, peak: 9, name: 'Alpha Aurigids', rate: 6, moon: 'any', radiant: 'Alpha Aurigids' },
    { month: 9, start: 7, end: 27, peak: 11, name: 'October Camelopardalids', rate: 5, moon: 'any', radiant: 'October Camelopardalids' },
    { month: 10, start: 5, end: 30, peak: 20, name: 'Alpha Monocerotids', rate: 'variable', moon: 'any', radiant: 'Alpha Monocerotids' },
    { month: 11, start: 3, end: 15, peak: 9, name: 'December Phoenicids', rate: 'variable', moon: 'any', radiant: 'December Phoenicids' },
    { month: 11, start: 10, end: 20, peak: 16, name: 'Comae Berenicids', rate: 3, moon: 'any', radiant: 'Comae Berenicids' },
];

const radiantCoordinates = {
    // Major showers
    'Quadrantids': { ra: 15.3, dec: 49.5 },
    'Lyrids': { ra: 18.1, dec: 33.6 },
    'Eta Aquarids': { ra: 22.3, dec: -1 },
    'Southern Delta Aquarids': { ra: 22.7, dec: -16.4 },
    'Perseids': { ra: 3.1, dec: 57.8 },
    'Draconids': { ra: 17.5, dec: 54 },
    'Orionids': { ra: 6.3, dec: 15.8 },
    'Southern Taurids': { ra: 3.5, dec: 13.5 },
    'Northern Taurids': { ra: 3.9, dec: 22.3 },
    'Leonids': { ra: 10.1, dec: 21.6 },
    'Geminids': { ra: 7.5, dec: 32.5 },
    'Ursids': { ra: 14.5, dec: 75.8 },

    // Minor showers
    'Gamma Velids': { ra: 8.5, dec: -47 },
    'Mu Virginids': { ra: 12.5, dec: -1 },
    'Eta Lyrids': { ra: 19.1, dec: 43 },
    'June Bootids': { ra: 14.9, dec: 48 },
    'Alpha Capricornids': { ra: 20.1, dec: -10.2 },
    'September Epsilon Perseids': { ra: 3.2, dec: 39.8 },
    'Sigma Hydrids': { ra: 8.5, dec: 2 },

    // Additional showers
    'Alpha Centaurids': { ra: 14, dec: -59 },
    'Pi Puppids': { ra: 7.3, dec: -45 },
    'Piscis Austrinids': { ra: 22.7, dec: -30 },
    'Kappa Cygnids': { ra: 19.2, dec: 59 },
    'Alpha Aurigids': { ra: 5.6, dec: 42 },
    'October Camelopardalids': { ra: 11, dec: 79 },
    'Alpha Monocerotids': { ra: 7.8, dec: -5 },
    'December Phoenicids': { ra: 1.2, dec: -53 },
    'Comae Berenicids': { ra: 12.9, dec: 25 },
};

const radiantDeclinations = {
    // Major showers
    'Quadrantids': 49.5,
    'Lyrids': 33.6,
    'Eta Aquarids': -1,
    'Southern Delta Aquarids': -16.4,
    'Perseids': 57.8,
    'Draconids': 54,
    'Orionids': 15.8,
    'Southern Taurids': 13.5,
    'Northern Taurids': 22.3,
    'Leonids': 21.6,
    'Geminids': 32.5,
    'Ursids': 75.8,

    // Minor showers
    'Gamma Velids': -47,
    'Mu Virginids': -1,
    'Eta Lyrids': 43,
    'June Bootids': 48,
    'Alpha Capricornids': -10.2,
    'September Epsilon Perseids': 39.8,
    'Sigma Hydrids': 2,

    // Additional showers
    'Alpha Centaurids': -59,
    'Pi Puppids': -45,
    'Piscis Austrinids': -30,
    'Kappa Cygnids': 59,
    'Alpha Aurigids': 42,
    'October Camelopardalids': 79,
    'Alpha Monocerotids': -5,
    'December Phoenicids': -53,
    'Comae Berenicids': 25,
};

function interpretMeteors(results, situation, data, _data_previous, _store) {
    const { date, year, month, day, hour, daylight, location, lunar } = situation;
    const { cloudCover } = data;

    const currentShowers = meteorsTable.filter((shower) => {
        const monthStart = shower.month,
            monthEnd = shower.endMonth === undefined ? shower.month : shower.endMonth;
        if (monthStart === monthEnd) return month === monthStart && day >= shower.start && day <= shower.end;
        const monthsSpanned = monthEnd >= monthStart ? monthEnd - monthStart : 12 - monthStart + monthEnd;
        return monthsSpanned === 1
            ? (month === monthStart && day >= shower.start) || (month === monthEnd && day <= shower.end)
            : (month === monthStart && day >= shower.start) || (month === monthEnd && day <= shower.end) || (month > monthStart && month < monthEnd);
    });

    currentShowers.forEach((shower) => {
        const radiant = helpers.isRadiantVisible(radiantCoordinates, shower.radiant, date, location.latitude, location.longitude);
        if (!radiant.visible) return; // Skip this shower if radiant is below horizon
        let text = `meteors: ${shower.name}`;
        const showerPeakMonth = shower.peakMonth === undefined ? shower.month : shower.peakMonth,
            isPeakDay = month === showerPeakMonth && day === shower.peak;
        let daysFromPeak;
        if (shower.peakMonth !== undefined) {
            const peakDate = new Date(year, showerPeakMonth, shower.peak);
            if (showerPeakMonth < shower.month && month >= shower.month) peakDate.setFullYear(year + 1);
            daysFromPeak = Math.round((peakDate - date) / helpers.constants.MILLISECONDS_PER_DAY);
        } else if (month === shower.month) daysFromPeak = shower.peak - day;
        if (isPeakDay) {
            text += ` peak tonight`;
            let ratedisplay = shower.rate;
            if (typeof ratedisplay === 'number') ratedisplay = shower.rate * Math.sin((Math.max(0, 90 - Math.abs(location.latitude - (radiantDeclinations[shower.radiant] || 0))) * Math.PI) / 180);
            text += ` (ZHR ~${Math.round(ratedisplay)}/hr from this latitude)`;
            if (cloudCover !== undefined && cloudCover < 30) {
                if (lunar.phase <= 0.25 || lunar.phase >= 0.75) text += ' (excellent dark sky conditions)';
                else if (shower.moon === 'bright_ok') text += ' (bright meteors visible despite moon)';
                else if (lunar.phase >= 0.4 && lunar.phase <= 0.6) text += ' (moon will interfere)';
            }
            if (shower.name === 'Geminids' || shower.name === 'Perseids') text += ` (increased fireball activity expected)`;
            if (shower.name === 'Perseids' || shower.name === 'Leonids') text += ` (watch for persistent trains: glowing trails lasting seconds)`;
        } else if (daysFromPeak !== undefined && Math.abs(daysFromPeak) <= 2) text += ' ' + helpers.formatProximity('peak', daysFromPeak);
        else return;
        if (shower.name === 'Perseids' || shower.name === 'Leonids') if (daysFromPeak !== undefined && Math.abs(daysFromPeak) < 1) text += ` (Earth crossing dense stream filaments: outbursts possible)`;
        if (helpers.isRadiantFavorable(radiantDeclinations, shower.radiant, location.latitude)) text += ' [favorable at this latitude]';
        if (radiant.altitude !== undefined) {
            if (radiant.altitude > 60) text += ' [radiant near zenith - optimal viewing]';
            else if (radiant.altitude > 40) text += ' [radiant well-placed]';
            else if (radiant.altitude > 20) text += ' [radiant rising]';
        }
        results.phenomena.push(text);
    });

    if (currentShowers.length === 0 && hour >= 2 && hour <= 5) results.phenomena.push('meteors: sporadic rate ~5-10/hour (highest before dawn)');

    // Add special meteor conditions for 59.66°N
    if (location.latitude > 59)
        if (currentShowers.length > 0 && (hour >= 22 || hour <= 4)) {
            if (month >= 8 || month <= 2) results.phenomena.push('meteors: viewing ideal with long dark nights');
            else if (month >= 5 && month <= 7 && daylight.astronomicalDuskDecimal && daylight.astronomicalDawnDecimal)
                results.phenomena.push(`meteors: viewing window ${helpers.formatTime(Math.floor(daylight.astronomicalDuskDecimal), 0)}-${helpers.formatTime(Math.floor(daylight.astronomicalDawnDecimal), 0)}`);
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
    { name: 'M42 (Orion Nebula)', ra: 5.59, dec: -5.39, mag: 4, bestMonths: [11, 0, 1, 2], type: 'nebula', constellation: 'Orion' },
    { name: 'M57 (Ring Nebula)', ra: 18.89, dec: 33.03, mag: 8.8, bestMonths: [6, 7, 8, 9], type: 'planetary', note: 'OIII filter enhances view' },
    { name: 'M27 (Dumbbell Nebula)', ra: 19.99, dec: 22.72, mag: 7.4, bestMonths: [7, 8, 9, 10], type: 'planetary' },
    { name: 'M8 (Lagoon Nebula)', ra: 18.06, dec: -24.38, mag: 5, bestMonths: [6, 7, 8], type: 'nebula' },
    { name: 'M20 (Trifid Nebula)', ra: 18.03, dec: -23.03, mag: 6.3, bestMonths: [6, 7, 8], type: 'nebula' },
    { name: 'M16 (Eagle Nebula)', ra: 18.31, dec: -13.78, mag: 6, bestMonths: [6, 7, 8], type: 'nebula' },
    // Globular Clusters
    { name: 'M13 (Hercules Cluster)', ra: 16.69, dec: 36.46, mag: 5.8, bestMonths: [5, 6, 7, 8], type: 'globular', resolution: 'resolved in 4-inch telescope' },
    { name: 'M22', ra: 18.61, dec: -23.9, mag: 5.1, bestMonths: [6, 7, 8], type: 'globular' },
    { name: 'M5', ra: 15.31, dec: 2.08, mag: 5.7, bestMonths: [5, 6, 7], type: 'globular' },
    { name: 'M3', ra: 13.7, dec: 28.38, mag: 6.2, bestMonths: [4, 5, 6], type: 'globular' },
    // Open Clusters
    { name: 'M45 (Pleiades)', ra: 3.79, dec: 24.12, mag: 1.6, bestMonths: [10, 11, 0, 1], type: 'cluster' },
    { name: 'M44 (Beehive Cluster)', ra: 8.67, dec: 19.98, mag: 3.7, bestMonths: [1, 2, 3, 4], type: 'cluster' },
    { name: 'Double Cluster', ra: 2.35, dec: 57.14, mag: 4.3, bestMonths: [9, 10, 11, 0], type: 'cluster' },
];

function interpretDeepSky(results, situation, data, _data_previous, _store) {
    const { date, location, month, lunar, daylight } = situation;
    const { cloudCover, humidity } = data;

    if ((cloudCover !== undefined && cloudCover > 20) || daylight.isDaytime) return;

    // Calculate limiting magnitude based on conditions
    const limitingMagnitude = helpers.calculateLimitingMagnitude(lunar.brightness, location.lightPolution, humidity);

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
        let ha = (lst - dso.ra + 24) % 24;
        if (ha > 12) ha -= 24;
        // Object is well-placed if HA is between -4 and +4 hours
        return Math.abs(ha) < 4;
    });
    // Sort by altitude (best positioned first)
    const dsosWithAltitude = visibleDSOs
        .map((dso) => {
            const ha = (lst - dso.ra + 24) % 24,
                haRad = (ha * 15 * Math.PI) / 180,
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
// LOCATION BASED
// -----------------------------------------------------------------------------------------------------------------------------------------

function checkAurora(results, situation, data, _data_previous, _store) {
    const { date, location, month, hour, daylight, year, lunar } = situation;
    const { cloudCover, snowDepth, temp, humidity } = data;

    if (location.latitude <= 45 || (cloudCover !== undefined && cloudCover >= 50)) return;
    if (daylight.isDaytime || (hour >= 4 && hour <= 20) || (month >= 4 && month <= 7)) return;

    // Base prediction
    const magneticLat = location.latitude - 10; // Rough approximation for N. America/Europe
    if (magneticLat > 65) results.phenomena.push('aurora: visible if Kp 1+ (overhead likely)');
    else if (magneticLat > 60) results.phenomena.push('aurora: visible if Kp 2+ (high in sky)');
    else if (magneticLat > 55) results.phenomena.push('aurora: visible if Kp 3+ (northern sky)');
    else if (magneticLat > 50) results.phenomena.push('aurora: visible if Kp 5+ (low on horizon)');

    // Activity level
    const activity = helpers.getGeomagneticActivity(month, year);
    if (activity >= 2.5) results.phenomena.push(`aurora: possible if Kp ${activity.toFixed(1)}+ (typical for season)`);

    // Equinox enhancement
    const daysFromEquinox = Math.min(Math.abs(helpers.daysIntoYear(date) - 79), Math.abs(helpers.daysIntoYear(date) - 266));
    if (daysFromEquinox < 27) results.phenomena.push('aurora: equinoctial enhancement active');

    // Lunar conditions
    if (lunar.brightness < 30) results.phenomena.push('aurora: photography conditions excellent (dark skies)');
    else if (lunar.phase <= 0.25 || lunar.phase >= 0.75) results.phenomena.push('aurora: faint displays visible (dark skies)');

    // Condition circumstances
    if (results.phenomena.some((p) => p.includes('aurora'))) {
        if (snowDepth !== undefined && snowDepth > 20) results.phenomena.push('aurora: brightness enhanced (snow reflection)');
        if (temp !== undefined && temp < -20 && humidity !== undefined && humidity < 50) results.phenomena.push('aurora: lower border sharp (cold dry air)');
        if (temp !== undefined && temp < -20 && humidity !== undefined && humidity < 40 && location.elevation > 200) results.phenomena.push('aurora: sounds possible - rare! (crackling/hissing)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function checkTides(results, situation, _data, _data_previous, _store) {
    const { location, lunar } = situation;

    if (location.elevation < 50 && location.distanceToOcean !== undefined && location.distanceToOcean < 10) {
        // km
        if ((lunar.phase >= 0.48 && lunar.phase <= 0.52) || lunar.phase >= 0.98 || lunar.phase <= 0.02) results.phenomena.push('tides: spring (high range)' + (lunar.distance.isSupermoon ? ', king tides possible' : ''));
        else if ((lunar.phase >= 0.23 && lunar.phase <= 0.27) || (lunar.phase >= 0.73 && lunar.phase <= 0.77)) results.phenomena.push('tides: neap (low range)');
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// ASTRONOMICAL EVENTS
// -----------------------------------------------------------------------------------------------------------------------------------------

const eventsExceptions = [
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
    yearly: { ...eventsDefaultsYearly },
};

function eventsLoad(store) {
    if (!store.astronomy.events) store.astronomy.events = eventsDefaults;
    return store.astronomy.events;
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

function eventsExceptionsOcurrences(events, currentDate) {
    return eventsExceptions
        .filter(({ event }) => events.events[event])
        .map(({ event, threshold, message }) => {
            const days = Math.floor((currentDate - events.events[event]) / helpers.constants.MILLISECONDS_PER_DAY);
            return days === threshold ? { days, message } : undefined;
        })
        .filter(Boolean);
}

function eventsSummaryYearly(events) {
    const summary = [];
    summary.push(`${events.yearly.fullMoons} full moons (${events.yearly.supermoons} super, ${events.yearly.blueMoons} blue)`);
    summary.push(`${events.yearly.meteorShowersObserved}/${events.yearly.meteorShowers} meteor showers`);
    summary.push(`${events.yearly.clearNights} clear nights`);
    summary.push(`${events.yearly.perfectViewingNights} perfect viewing nights`);
    if (events.yearly.auroraAlerts > 0) summary.push(`${events.yearly.auroraSightings}/${events.yearly.auroraAlerts} aurora sightings/alerts`);
    if (events.yearly.eclipses > 0) summary.push(`${events.yearly.eclipses} eclipses`);
    return `${events.yearly.year}: ${summary.join(', ')}`;
}

// -----------------------------------------------------------------------------------------------------------------------------------------

function processAstronomicalEvents(results, situation, data, _data_previous, store) {
    const { date, year, day } = situation;

    const events = eventsLoad(store);

    if (events.yearly.year !== year) {
        if (day === 1) results.phenomena.push(eventsSummaryYearly(events));
        else if (day === 2) events.yearly = { ...eventsDefaultsYearly };
    }

    eventsExceptionsOcurrences(events, date).forEach(({ days, message }) => results.phenomena.push(`${days} days since last ${message}`));
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

function interpretSolarPhenomena(results, situation, data, data_previous, store) {
    interpretSolarConditions(results, situation, data, data_previous, store); // Sun position and immediate effects
    checkGreenFlash(results, situation, data, data_previous, store); // Sunset/sunrise flash
    checkCrepuscularRays(results, situation, data, data_previous, store); // Sunset/sunrise rays
    checkAtmosphericShadowBands(results, situation, data, data_previous, store); // Non-eclipse shadow bands
}
function interpretLunarPhenomena(results, situation, data, data_previous, store) {
    interpretLunarPhase(results, situation, data, data_previous, store);
    interpretLunarPosition(results, situation, data, data_previous, store);
    interpretLunarVisibility(results, situation, data, data_previous, store);
    interpretLunarEvents(results, situation, data, data_previous, store);
    checkMoonIllusion(results, situation, data, data_previous, store);
}
function interpretTwilightPhenomena(results, situation, data, data_previous, store) {
    checkTwilightPhenomena(results, situation, data, data_previous, store); // Belt of Venus, Earth's shadow
    checkZodiacalLight(results, situation, data, data_previous, store); // Zodiacal light/gegenschein
    checkAirglow(results, situation, data, data_previous, store); // Upper atmosphere glow
}
function interpretSeasonalEvents(results, situation, data, data_previous, store) {
    interpretEquinox(results, situation, data, data_previous, store); // Seasonal markers
    interpretSolstice(results, situation, data, data_previous, store); // Seasonal extremes
    interpretCrossQuarter(results, situation, data, data_previous, store); // Traditional calendar
    interpretWhiteNights(results, situation, data, data_previous, store); // Seasonal twilight effects
}
function interpretCelestialObjects(results, situation, data, data_previous, store) {
    interpretOrbitingBodies(results, situation, data, data_previous, store); // ISS, satellites
    interpretPlanets(results, situation, data, data_previous, store); // Planetary positions
    interpretStars(results, situation, data, data_previous, store); // Star visibility and occultations
    interpretComets(results, situation, data, data_previous, store); // Comet approaches
    interpretMeteors(results, situation, data, data_previous, store); // Meteor showers
    interpretDeepSky(results, situation, data, data_previous, store); // Deep sky object visibility
}
function interpretLocationImpacts(results, situation, data, data_previous, store) {
    checkAurora(results, situation, data, data_previous, store); // Aurora predictions
    checkTides(results, situation, data, data_previous, store); // Tidal effects
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

module.exports = function (options) {
    Object.entries(options).forEach(([key, value]) => (config[key] = value));
    return {
        interpretSolarPhenomena,
        interpretLunarPhenomena,
        interpretTwilightPhenomena,
        interpretSeasonalEvents,
        interpretViewingConditions,
        interpretAtmosphericOptics,
        interpretCelestialObjects,
        interpretLocationImpacts,
        processAstronomicalEvents,
    };
};

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
